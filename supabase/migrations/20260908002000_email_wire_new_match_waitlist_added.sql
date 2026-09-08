-- Wire two more orphaned templates: new_match and waitlist_added.
--
-- new_match: extends create_partner_match_on_mutual_like() (already fires on
-- a mutual like, already writes the partner_matches row) to email both users.
-- Respects notif_new_match, following the exact pattern notify_new_message
-- already established for notif_messages (profiles.notif_new_match "is not
-- false"). This is the first sender notif_new_match has ever had -- per
-- apps/mobile/src/lib/notificationPreferences.ts, it was stored intent only.
--
-- waitlist_added: new trigger on registrations, fires when a row's status
-- transitions TO 'waitlisted' (today that only happens via the director's
-- manual "Waitlist" action in the tournament roster -- there is no
-- self-service join-waitlist path; createRegistration() always inserts
-- 'registered'). waitlist_position is never populated (0 rows across the
-- whole table, confirmed against prod) so position is computed at send time
-- from arrival order among other waitlisted rows, not read from that column.
--
-- Both bodies rewritten from the dead {{first_name}} to {{full_name}}
-- (profiles has no first_name column), migrated straight to
-- layout='transactional'.

UPDATE public.email_templates
SET
  html_body = '<p>Hi {{full_name}},</p><p>You and <strong>{{match_name}}</strong> both liked each other — you''re a match! Start a conversation and find your next tournament partner.</p><p><a href="{{link}}">Say hello</a></p>',
  variables = ARRAY['full_name', 'match_name', 'link'],
  preheader = 'You and {{match_name}} are a match!',
  layout = 'transactional'
WHERE key = 'new_match';

UPDATE public.email_templates
SET
  html_body = '<p>Hi {{full_name}},</p><p><strong>{{tournament_name}}</strong> is currently full, so we''ve added you to the waitlist at <strong>position {{position}}</strong>.</p><p>We''ll email you the moment a spot opens up. No action needed for now.</p><p><a href="{{link}}">View tournament</a></p>',
  variables = ARRAY['full_name', 'tournament_name', 'position', 'link'],
  preheader = 'You''re on the waitlist for {{tournament_name}}.',
  layout = 'transactional'
WHERE key = 'waitlist_added';

CREATE OR REPLACE FUNCTION "public"."create_partner_match_on_mutual_like"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_a uuid;
  v_b uuid;
  v_inserted boolean;
  v_a_email text; v_a_name text; v_a_pref boolean;
  v_b_email text; v_b_name text; v_b_pref boolean;
begin
  if new.kind <> 'like' then
    return new;
  end if;

  if not exists (
    select 1 from public.partner_likes
    where from_user_id = new.to_user_id
      and to_user_id   = new.from_user_id
      and kind         = 'like'
  ) then
    return new;
  end if;

  if new.from_user_id < new.to_user_id then
    v_a := new.from_user_id;
    v_b := new.to_user_id;
  else
    v_a := new.to_user_id;
    v_b := new.from_user_id;
  end if;

  insert into public.partner_matches (user_a, user_b)
  values (v_a, v_b)
  on conflict (user_a, user_b) do nothing
  returning true into v_inserted;

  -- Only email on the row that actually creates the match -- ON CONFLICT DO
  -- NOTHING leaves v_inserted NULL (falsy), which guards against a double
  -- send if this ever races.
  if v_inserted then
    select email, full_name, notif_new_match into v_a_email, v_a_name, v_a_pref from public.profiles where id = v_a;
    select email, full_name, notif_new_match into v_b_email, v_b_name, v_b_pref from public.profiles where id = v_b;

    if v_a_email is not null and v_a_pref is not false then
      perform public.fn_send_transactional_email(jsonb_build_object(
        'to', v_a_email,
        'templateKey', 'new_match',
        'variables', jsonb_build_object(
          'full_name', coalesce(v_a_name, 'there'),
          'match_name', coalesce(v_b_name, 'your match'),
          'link', 'https://pickleballapp.app'
        ),
        'idempotencyKey', 'new-match/' || v_a || '/' || v_b
      ));
    end if;

    if v_b_email is not null and v_b_pref is not false then
      perform public.fn_send_transactional_email(jsonb_build_object(
        'to', v_b_email,
        'templateKey', 'new_match',
        'variables', jsonb_build_object(
          'full_name', coalesce(v_b_name, 'there'),
          'match_name', coalesce(v_a_name, 'your match'),
          'link', 'https://pickleballapp.app'
        ),
        'idempotencyKey', 'new-match/' || v_b || '/' || v_a
      ));
    end if;
  end if;

  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."fn_notify_waitlist_added"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_email text;
  v_name text;
  v_tournament_name text;
  v_position integer;
begin
  if NEW.status <> 'waitlisted' or OLD.status = 'waitlisted' or NEW.player_id is null then
    return NEW;
  end if;

  select email, full_name into v_email, v_name from public.profiles where id = NEW.player_id;
  if v_email is null then
    return NEW;
  end if;

  select name into v_tournament_name from public.tournaments where id = NEW.tournament_id;

  select count(*) + 1 into v_position
  from public.registrations r
  where r.tournament_id = NEW.tournament_id
    and r.status = 'waitlisted'
    and r.id <> NEW.id
    and r.created_at < NEW.created_at;

  perform public.fn_send_transactional_email(jsonb_build_object(
    'to', v_email,
    'templateKey', 'waitlist_added',
    'variables', jsonb_build_object(
      'full_name', coalesce(v_name, 'there'),
      'tournament_name', coalesce(v_tournament_name, 'the tournament'),
      'position', v_position::text,
      'link', 'https://pickleballapp.app/tournaments/' || NEW.tournament_id
    ),
    'idempotencyKey', 'waitlist-added/' || NEW.id || '/' || floor(extract(epoch from now()))::text
  ));

  return NEW;
end;
$$;

DROP TRIGGER IF EXISTS "trg_notify_waitlist_added" ON "public"."registrations";
CREATE TRIGGER "trg_notify_waitlist_added"
  AFTER UPDATE OF "status" ON "public"."registrations"
  FOR EACH ROW EXECUTE FUNCTION "public"."fn_notify_waitlist_added"();
