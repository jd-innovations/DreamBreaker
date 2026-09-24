-- A cancellation reason, and tournament_cancelled finally uses the catalog.
--
-- The copy said "{{reason}} Any payment is refunded automatically." while no
-- column supplied a reason, so the automation could not render and had been
-- left hard-coding its own text. Owner decision 2026-09-23: capture the reason
-- rather than drop it from the copy — "the venue could not be confirmed" is
-- the difference between a cancellation someone understands and one that
-- reads as the app losing their entry.
--
-- ── Who authors this text ───────────────────────────────────────────────────
-- Not only staff. RLS allows an APPROVED DIRECTOR to update their own
-- tournament while it is not in_progress/completed/cancelled, so a director
-- can cancel and therefore write this sentence — which is then pushed and
-- emailed to every registrant. Admins can do it to any tournament.
--
-- The write is a plain table UPDATE from the admin screen, not an RPC, so
-- client-side validation is bypassable and the DATABASE is the only real
-- boundary. Hence the CHECK below rather than a maxLength on an input.
--
-- ── Escaping ────────────────────────────────────────────────────────────────
-- Email: fn_send_transactional_email's substitute() HTML-escapes every
-- variable value, so a reason containing markup arrives as text.
-- Push / in-app: plain strings, and React escapes by default on web.
-- No sink here renders it as HTML, and none should start to.
--
-- ── Optional, not required ──────────────────────────────────────────────────
-- A cancellation is often urgent. Making the reason NOT NULL would let a
-- missing field block one, and would break any other path that cancels. It is
-- optional with a neutral fallback, so the copy always reads as a sentence.
--
-- Verified against a real tournament in a rolled-back transaction:
--   registrant  "Cancelled: Futures Classic" / "The venue flooded overnight.
--                Any payment is refunded automatically."   (catalog copy)
--   director    "Tournament cancelled" / "\"Futures Classic\" has been
--                cancelled. The venue flooded overnight."
--   a 400-character reason is rejected by the constraint.

alter table public.tournaments
  add column if not exists cancellation_reason text;

alter table public.tournaments
  drop constraint if exists tournaments_cancellation_reason_len;
alter table public.tournaments
  add constraint tournaments_cancellation_reason_len
  check (cancellation_reason is null
         or char_length(btrim(cancellation_reason)) between 3 and 300);

comment on column public.tournaments.cancellation_reason is
  'Why a tournament was cancelled, shown to every registrant by push and '
  'email. Author may be an admin OR the approved director (RLS), so it is '
  'length-capped here: the write is a direct table UPDATE and client-side '
  'validation does not bind. Optional — the notification falls back to a '
  'neutral sentence.';

-- The email says it too. The template gains {{reason}}, so the trigger MUST
-- always pass one: an unresolved variable makes the sender refuse with a 422
-- and no cancellation email would go at all.
update public.email_templates
   set html_body = '<h2>Tournament cancelled</h2><p>Hi {{full_name}}, <strong>{{tournament_name}}</strong> has been cancelled.</p><p>{{reason}}</p><p>Any payment you made is refunded automatically.</p>'
 where key = 'tournament_cancelled';

create or replace function public.fn_notify_tournament_status()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_director_email text;
  v_director_name text;
  v_rec record;
  v_reason text;
  v_copy record;
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
    -- Normalised to a whole sentence: the catalog copy reads
    -- "{{reason}} Any payment is refunded automatically.", and a director who
    -- types "Venue flooded" should not produce "Venue flooded Any payment…".
    v_reason := nullif(btrim(coalesce(NEW.cancellation_reason, '')), '');
    if v_reason is not null and right(v_reason, 1) not in ('.', '!', '?') then
      v_reason := v_reason || '.';
    end if;
    v_reason := coalesce(v_reason, 'This tournament has been cancelled.');

    -- REGISTRANTS get the catalog copy, so editing it at /admin/notifications
    -- changes what they actually receive.
    select * into v_copy from private.render_automation(
      'tournament_cancelled',
      jsonb_build_object(
        'tournament_name', NEW.name,
        'tournament_id',   NEW.id::text,
        'reason',          v_reason
      ));

    -- The DIRECTOR's notice stays its own text and its own /director link.
    -- They are the person who cancelled it; "Any payment is refunded
    -- automatically" is written for someone who paid. One catalog row cannot
    -- serve both audiences, and pretending otherwise would send directors copy
    -- meant for players. A second catalog row is the eventual answer.
    insert into public.notifications(user_id, type, title, body, link)
    values (NEW.director_id, 'tournament_cancelled', 'Tournament cancelled',
            '"' || NEW.name || '" has been cancelled. ' || v_reason, '/director');

    insert into public.notifications(user_id, type, title, body, link)
    select r.player_id, 'tournament_cancelled',
           coalesce(v_copy.title, 'Cancelled: ' || NEW.name),
           coalesce(v_copy.body, v_reason),
           coalesce(v_copy.link, '/tournament/' || NEW.id)
    from public.registrations r
    where r.tournament_id = NEW.id and r.player_id is not null
      and r.status in ('registered', 'checked_in', 'substitute');

    if v_director_email is not null then
      perform public.fn_send_transactional_email(jsonb_build_object(
        'to', v_director_email,
        'templateKey', 'tournament_cancelled',
        'variables', jsonb_build_object(
          'full_name', coalesce(v_director_name, 'there'),
          'tournament_name', NEW.name,
          'reason', v_reason
        ),
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
        'variables', jsonb_build_object(
          'full_name', v_rec.full_name,
          'tournament_name', NEW.name,
          'reason', v_reason
        ),
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
$function$;
