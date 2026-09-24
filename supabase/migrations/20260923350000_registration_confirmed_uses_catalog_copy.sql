-- registration_confirmed sends the copy the admin screen shows.
--
-- It hard-coded its own text, so editing the copy at /admin/notifications did
-- nothing for this automation — and the Test button, which DOES render through
-- the catalog, showed copy that production never sent. Proven against a real
-- tournament before this change:
--
--   sent:    "Registration confirmed" / You're registered for "Futures Classic".
--   catalog: "You're in! 🏓" / Your spot in Futures Classic is confirmed for
--            Thursday, December 31.
--
-- 31 of the 41 notification senders already render through
-- private.render_automation. This is one of the two that did not; the other is
-- tournament_cancelled, deliberately left alone here — its catalog copy uses a
-- {{reason}} that no column supplies, and it has two audiences (the director
-- and every registrant) that one catalog row cannot express. That needs a
-- product decision, not a silent rewrite.
--
-- Behaviour preserved exactly: the notification is still written only when the
-- tournament row exists (the old INSERT..SELECT wrote nothing if it did not),
-- the email is unchanged, and the status guard is unchanged.

create or replace function public.fn_notify_registration()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_name text;
  v_date date;
  v_email text;
  v_copy record;
begin
  if NEW.player_id is not null and NEW.status in ('registered', 'checked_in') then
    select t.name, t.event_date into v_name, v_date
      from public.tournaments t where t.id = NEW.tournament_id;

    -- No tournament row means no notification, exactly as the old
    -- INSERT..SELECT behaved. The email below still goes, also as before.
    if v_name is not null then
      select * into v_copy from private.render_automation(
        'registration_confirmed',
        jsonb_build_object(
          'tournament_name', v_name,
          'tournament_id',   NEW.tournament_id::text,
          -- A tournament with no date would otherwise render a literal
          -- {{event_date}} into somebody's lock screen.
          'event_date',      coalesce(to_char(v_date, 'FMDay, FMMonth FMDD'), 'the scheduled date')
        ));

      insert into public.notifications(user_id, type, title, body, link)
      values (NEW.player_id, 'registration_confirmed', v_copy.title, v_copy.body, v_copy.link);
    end if;

    select p.email into v_email from public.profiles p where p.id = NEW.player_id;
    if v_email is not null then
      perform public.fn_send_transactional_email(jsonb_build_object(
        'to', v_email,
        'templateKey', 'registration_confirmed',
        'variables', jsonb_build_object('tournament_name', coalesce(v_name, 'the tournament')),
        'idempotencyKey', 'registration-confirmed/' || NEW.id
      ));
    end if;
  end if;
  return NEW;
end;
$function$;
