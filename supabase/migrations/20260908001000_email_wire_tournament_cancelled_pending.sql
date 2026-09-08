-- Wire the two clearest orphaned templates (EMAIL_NOTIFICATIONS_EXECUTION_PLAN.md,
-- "Wire the orphans"): tournament_cancelled and tournament_pending. Both already
-- have a trigger firing (fn_notify_tournament_status writes an in-app
-- notification for each) -- it just never emailed. This extends that same
-- trigger with the email call, same pattern already used for tournament_approved
-- and tournament_rejected two branches up.
--
-- Content note: both templates were seeded with {{first_name}}, but
-- public.profiles has no first_name column -- only full_name. Rewritten to
-- full_name, matching every other wired template in the system. Also
-- migrated straight to the shell (layout='transactional') since these are
-- brand-new bodies, not edits to something already live.
--
-- tournament_published is deliberately NOT wired here: the same 'open'
-- transition already emails under the tournament_approved key two branches
-- up, so tournament_published has no missing hook -- it is a duplicate
-- template name for an event that's already covered, not a gap.

UPDATE public.email_templates
SET
  html_body = '<h2>Tournament cancelled</h2><p>Hi {{full_name}}, <strong>{{tournament_name}}</strong> has been cancelled.</p>',
  variables = ARRAY['full_name', 'tournament_name'],
  preheader = '{{tournament_name}} has been cancelled.',
  layout = 'transactional'
WHERE key = 'tournament_cancelled';

UPDATE public.email_templates
SET
  html_body = '<h2>Tournament needs review</h2><p>Hi {{full_name}}, <strong>{{tournament_name}}</strong> by {{director_name}} is awaiting your approval.</p><p><a href="{{link}}">Review it</a></p>',
  variables = ARRAY['full_name', 'tournament_name', 'director_name', 'link'],
  preheader = '{{tournament_name}} is awaiting approval.',
  layout = 'transactional'
WHERE key = 'tournament_pending';

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
           '"' || NEW.name || '" you registered for has been cancelled.', '/dashboard'
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
