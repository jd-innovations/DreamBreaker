-- The `notifications.link` column is read by both the web app (Next.js
-- router.push) and the mobile app (expo-router router.push) — it has to be a
-- path that resolves on both.
--
-- Two bugs fixed here:
-- 1. `/dashboard` (fn_notify_registration, fn_notify_tournament_status' player
--    branch) only exists on web; tapping on mobile landed on expo-router's
--    "Unmatched Route" screen. Both triggers already have a tournament id in
--    hand, so point at the specific tournament instead of a generic landing
--    page -- `/tournament/[id]` exists on both apps, and reads better than a
--    bare dashboard link too. director_suspended's `/dashboard` link is left
--    as-is (still correct for web, and there's no per-entity page to send it
--    to instead); the mobile app rewrites it locally.
-- 2. `/tournaments/<id>` (plural, promote_next_waitlisted) -- mobile only has
--    the singular `/tournament/[id]`; web has both, so switching to singular
--    fixes mobile without touching web.

CREATE OR REPLACE FUNCTION "public"."promote_next_waitlisted"(p_tournament_id uuid)
RETURNS TABLE (
  registration_id  uuid,
  player_id        uuid,
  full_name        text,
  email            text,
  offer_expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_reg    record;
  v_expiry timestamptz := now() + interval '24 hours';
  v_name   text;
BEGIN
  SELECT r.id, r.player_id
    INTO v_reg
    FROM "public"."registrations" r
   WHERE r.tournament_id = p_tournament_id
     AND r.status = 'waitlisted'
   ORDER BY r.waitlist_position NULLS LAST, r.created_at
   LIMIT 1
     FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE "public"."registrations"
     SET status = 'waitlist_offered',
         waitlist_offer_expires_at = v_expiry,
         updated_at = now()
   WHERE id = v_reg.id;

  SELECT t.name INTO v_name FROM "public"."tournaments" t WHERE t.id = p_tournament_id;

  IF v_reg.player_id IS NOT NULL THEN
    INSERT INTO "public"."notifications" (user_id, type, title, body, link)
    VALUES (
      v_reg.player_id,
      'waitlist_spot_offered',
      'A spot just opened up!',
      'You have 24 hours to complete payment for ' || coalesce(v_name, 'this tournament') || '. Don''t miss it.',
      '/tournament/' || p_tournament_id
    );
  END IF;

  RETURN QUERY
    SELECT v_reg.id,
           v_reg.player_id,
           p.full_name,
           p.email,
           v_expiry
      FROM (SELECT 1) _
      LEFT JOIN "public"."profiles" p ON p.id = v_reg.player_id;
END;
$function$;

CREATE OR REPLACE FUNCTION "public"."fn_notify_registration"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_tournament_name text;
  v_email text;
begin
  if NEW.player_id is not null and NEW.status in ('registered', 'checked_in') then
    insert into public.notifications(user_id, type, title, body, link)
    select NEW.player_id, 'registration_confirmed', 'Registration confirmed',
           'You''re registered for "' || t.name || '".', '/tournament/' || NEW.tournament_id
    from public.tournaments t where t.id = NEW.tournament_id;

    select t.name into v_tournament_name from public.tournaments t where t.id = NEW.tournament_id;
    select p.email into v_email from public.profiles p where p.id = NEW.player_id;
    if v_email is not null then
      perform public.fn_send_transactional_email(jsonb_build_object(
        'to', v_email,
        'templateKey', 'registration_confirmed',
        'variables', jsonb_build_object('tournament_name', coalesce(v_tournament_name, 'the tournament')),
        'idempotencyKey', 'registration-confirmed/' || NEW.id
      ));
    end if;
  end if;
  return NEW;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."fn_notify_tournament_status"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_director_email text;
  v_director_name text;
  v_rec record;
begin
  select email, full_name into v_director_email, v_director_name from public.profiles where id = NEW.director_id;

  -- Director: tournament approved & published
  if NEW.status = 'open' and OLD.status is distinct from 'open' then
    insert into public.notifications(user_id, type, title, body, link)
    values (NEW.director_id, 'tournament_published', 'Tournament approved',
            '"' || NEW.name || '" is now live and open for registration.', '/director');
    if v_director_email is not null then
      perform public.fn_send_transactional_email(jsonb_build_object(
        'to', v_director_email,
        'templateKey', 'tournament_approved',
        'variables', jsonb_build_object('tournament_name', NEW.name),
        'idempotencyKey', 'tournament-approved/' || NEW.id || '/' || floor(extract(epoch from now()))::text
      ));
    end if;
  end if;

  -- Director: returned for changes (rejected)
  if NEW.status = 'draft' and OLD.status = 'pending_approval' then
    insert into public.notifications(user_id, type, title, body, link)
    values (NEW.director_id, 'tournament_rejected', 'Changes needed',
            coalesce('"' || NEW.name || '" was returned: ' || NEW.rejected_reason,
                     '"' || NEW.name || '" was returned for changes.'), '/director');
    if v_director_email is not null then
      perform public.fn_send_transactional_email(jsonb_build_object(
        'to', v_director_email,
        'templateKey', 'tournament_rejected',
        'variables', jsonb_build_object(
          'tournament_name', NEW.name,
          'reason', coalesce(NEW.rejected_reason, 'No reason provided.')
        ),
        'idempotencyKey', 'tournament-rejected/' || NEW.id || '/' || floor(extract(epoch from now()))::text
      ));
    end if;
  end if;

  -- Director + registrants: cancelled
  if NEW.status = 'cancelled' and OLD.status is distinct from 'cancelled' then
    insert into public.notifications(user_id, type, title, body, link)
    values (NEW.director_id, 'tournament_cancelled', 'Tournament cancelled',
            '"' || NEW.name || '" has been cancelled.', '/director');
    insert into public.notifications(user_id, type, title, body, link)
    select r.player_id, 'tournament_cancelled', 'Tournament cancelled',
           '"' || NEW.name || '" you registered for has been cancelled.', '/tournament/' || NEW.id
    from public.registrations r
    where r.tournament_id = NEW.id and r.player_id is not null
      and r.status in ('registered', 'checked_in', 'substitute');

    if v_director_email is not null then
      perform public.fn_send_transactional_email(jsonb_build_object(
        'to', v_director_email,
        'templateKey', 'tournament_cancelled',
        'variables', jsonb_build_object('full_name', coalesce(v_director_name, 'there'), 'tournament_name', NEW.name),
        'idempotencyKey', 'tournament-cancelled-director/' || NEW.id || '/' || floor(extract(epoch from now()))::text
      ));
    end if;

    for v_rec in
      select p.email as email, coalesce(p.full_name, 'there') as full_name
      from public.registrations r
      join public.profiles p on p.id = r.player_id
      where r.tournament_id = NEW.id and r.player_id is not null
        and r.status in ('registered', 'checked_in', 'substitute')
        and p.email is not null
    loop
      perform public.fn_send_transactional_email(jsonb_build_object(
        'to', v_rec.email,
        'templateKey', 'tournament_cancelled',
        'variables', jsonb_build_object('full_name', v_rec.full_name, 'tournament_name', NEW.name),
        'idempotencyKey', 'tournament-cancelled-player/' || NEW.id || '/' || v_rec.email || '/' || floor(extract(epoch from now()))::text
      ));
    end loop;
  end if;

  -- Admins: a tournament needs review (new submission or resubmitted edit)
  -- link stays '/admin' deliberately: admin is a web-only role (see
  -- fn_notify_support_ticket_new's comment), so there is no mobile route to
  -- point this at.
  if NEW.status = 'pending_approval' and OLD.status is distinct from 'pending_approval' then
    insert into public.notifications(user_id, type, title, body, link)
    select p.id, 'tournament_pending', 'Tournament needs review',
           '"' || NEW.name || '" is awaiting approval.', '/admin'
    from public.profiles p where p.role = 'admin';

    for v_rec in
      select p.email as email, coalesce(p.full_name, 'there') as full_name
      from public.profiles p where p.role = 'admin' and p.email is not null
    loop
      perform public.fn_send_transactional_email(jsonb_build_object(
        'to', v_rec.email,
        'templateKey', 'tournament_pending',
        'variables', jsonb_build_object(
          'full_name', v_rec.full_name,
          'tournament_name', NEW.name,
          'director_name', coalesce(v_director_name, 'A director'),
          'link', 'https://pickleballapp.app/admin'
        ),
        'idempotencyKey', 'tournament-pending/' || NEW.id || '/' || v_rec.email || '/' || floor(extract(epoch from now()))::text
      ));
    end loop;
  end if;

  return NEW;
end;
$$;
