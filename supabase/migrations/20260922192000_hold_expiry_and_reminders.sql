-- Phase A.3a: make paid holds behave, and warn the player before one ends.
--
-- ── The bug this closes ─────────────────────────────────────────────────────
--
-- Two jobs expired the same holds on DIFFERENT clocks, every 15 minutes:
--
--   expire_stale_holds()  status='held' AND hold_expires_at < now()
--                         -> 'withdrawn'. No notification, no email, no
--                            waitlist promotion. Silent.
--   waitlist-sweeper      status='held' AND event_date - hold_cutoff_days
--                         <= now() -> 'expired_hold', emails hold_expired,
--                            promotes the next waitlisted player.
--
-- Whichever fired first won. A player who PAID a hold fee and whose own hold
-- ran out before the tournament-level cutoff was dropped in silence, and the
-- waitlist behind them never moved.
--
-- Owner decision 2026-09-22: the per-player `hold_expires_at` — the date the
-- app shows the player — is the real clock. So expire_stale_holds now does
-- what the sweeper does: expired_hold, notify, email, promote. The sweeper's
-- cutoff rule stays as a secondary sweep for holds with no expiry of their own
-- and is left untouched (it also cannot be deployed from here).
--
-- ── Second bug, same function ───────────────────────────────────────────────
--
-- expire_stale_holds decremented tournaments.spots_filled ITSELF, while
-- trg_sync_spots_filled on registrations already decrements on any active ->
-- inactive status change. Every expiry therefore freed TWO spots, which
-- oversells the event. The manual decrement is removed; the trigger is the one
-- writer. Unavoidable here: the rewrite touches the same statement, and
-- leaving it would double-count under the new status too.
--
-- ── Idempotency ─────────────────────────────────────────────────────────────
-- The email key matches waitlist-sweeper's exactly (`hold-expired/<reg id>`),
-- so if both paths ever see the same registration, Resend dedupes it rather
-- than mailing the player twice.

-- ── Copy rendering ──────────────────────────────────────────────────────────
-- Notifications written by these jobs take their wording from the catalog, so
-- what the owner edits in /admin/notifications is what a player receives —
-- in-app and push alike, since the push repeats the notification row.
-- Unknown/missing automation returns nothing and the caller falls back to its
-- own literal copy, so a deleted catalog row degrades to the old behaviour
-- instead of sending a blank notification.

create or replace function private.render_automation(p_key text, p_vars jsonb)
returns table (title text, body text, link text)
language plpgsql stable security definer set search_path = '' as $$
declare
  a public.notification_automations%rowtype;
  k text;
  v_title text; v_body text; v_link text;
begin
  select * into a from public.notification_automations where key = p_key;
  if not found then return; end if;

  v_title := a.title_template;
  v_body  := a.body_template;
  v_link  := a.link_template;

  for k in select jsonb_object_keys(coalesce(p_vars, '{}'::jsonb)) loop
    v_title := replace(v_title, '{{' || k || '}}', coalesce(p_vars ->> k, ''));
    v_body  := replace(v_body,  '{{' || k || '}}', coalesce(p_vars ->> k, ''));
    v_link  := replace(coalesce(v_link, ''), '{{' || k || '}}', coalesce(p_vars ->> k, ''));
  end loop;

  return query select v_title, v_body, nullif(v_link, '');
end;
$$;

-- ── Hold expiry, corrected ──────────────────────────────────────────────────

create or replace function public.expire_stale_holds()
returns integer
language plpgsql security definer set search_path = 'public', 'pg_temp' as $$
declare
  r        record;
  v_count  integer := 0;
  v_copy   record;
  v_name   text;
  v_email  text;
  v_tname  text;
begin
  for r in
    update public.registrations reg
       set status = 'expired_hold',
           hold_expired_at = now(),
           updated_at = now()
     where reg.status = 'held'
       and reg.hold_expires_at is not null
       and reg.hold_expires_at < now()
    returning reg.id, reg.player_id, reg.tournament_id
  loop
    v_count := v_count + 1;

    -- Guest rows added by a director have no account: nothing to notify.
    if r.player_id is not null then
      select t.name into v_tname from public.tournaments t where t.id = r.tournament_id;
      select coalesce(nullif(p.full_name, ''), 'there'), p.email
        into v_name, v_email
        from public.profiles p where p.id = r.player_id;

      select * into v_copy from private.render_automation(
        'hold_expired',
        jsonb_build_object(
          'tournament_name', coalesce(v_tname, 'your tournament'),
          'tournament_id',   r.tournament_id::text
        )
      );

      -- In-app row. The push rides on this insert via
      -- trg_dispatch_automation_push (20260922191000) once the automation is
      -- enabled; nothing extra to call here.
      insert into public.notifications (user_id, type, title, body, link, idempotency_key)
      values (
        r.player_id,
        'hold_expired',
        coalesce(v_copy.title, 'Your hold has expired'),
        coalesce(v_copy.body,  'Your held spot was released.'),
        coalesce(v_copy.link,  '/tournament/' || r.tournament_id),
        'hold-expired/' || r.id
      )
      -- The unique index is PARTIAL (… where idempotency_key is not null),
      -- so the predicate has to be repeated for the arbiter to match it.
      on conflict (idempotency_key) where idempotency_key is not null do nothing;

      -- Email, with waitlist-sweeper's exact idempotency key so the two paths
      -- can never both mail the same player about the same registration.
      if v_email is not null then
        perform public.fn_send_transactional_email(jsonb_build_object(
          'to', v_email,
          'templateKey', 'hold_expired',
          'variables', jsonb_build_object(
            'full_name',       v_name,
            'tournament_name', coalesce(v_tname, 'your tournament'),
            'link_url',        'https://pickleballapp.app/tournaments/' || r.tournament_id
          ),
          'idempotencyKey', 'hold-expired/' || r.id
        ));
      end if;
    end if;

    -- The waitlist moves regardless of whether the holder had an account.
    perform public.promote_next_waitlisted(r.tournament_id);
  end loop;

  return v_count;
end;
$$;

comment on function public.expire_stale_holds() is
  'Expires paid holds on the player''s own hold_expires_at (owner decision '
  '2026-09-22). Writes expired_hold, notifies the player, promotes the '
  'waitlist. spots_filled is left to trg_sync_spots_filled — this function '
  'used to decrement it as well, which freed two spots per expiry.';

-- ── "Your hold ends soon" ───────────────────────────────────────────────────
-- Runs on a schedule and writes one notification per (registration, offset).
-- The offsets live in the catalog, so the owner changes "24 and 2 hours" to
-- anything else without a migration.
--
-- Dedup is the notifications unique idempotency_key: one row per registration
-- per offset, ever. A restarted job, a changed offset list, or two overlapping
-- runs cannot double-send.

create or replace function public.send_hold_expiring_reminders()
returns integer
language plpgsql security definer set search_path = 'public', 'pg_temp' as $$
declare
  a        public.notification_automations%rowtype;
  offsets  integer[];
  h        integer;
  i        integer;
  v_floor  integer;
  r        record;
  v_copy   record;
  v_count  integer := 0;
begin
  select * into a from public.notification_automations where key = 'hold_expiring';
  if not found or not a.enabled then
    return 0;
  end if;

  select coalesce(array_agg(value::integer order by value::integer desc), array[24, 2])
    into offsets
    from jsonb_array_elements_text(coalesce(a.timing -> 'offsets_hours', '[24,2]'::jsonb)) value;

  -- Offsets are walked largest first, and each one only claims the band
  -- between itself and the next smaller offset. Without that band a hold
  -- created with 90 minutes left matches BOTH the 24h and the 2h rule in the
  -- same run, and the player gets two near-identical notifications at once.
  -- With it they get exactly the one reminder their remaining time falls in.
  for i in 1 .. array_length(offsets, 1) loop
    h := offsets[i];
    v_floor := coalesce(offsets[i + 1], 0);

    for r in
      select reg.id, reg.player_id, reg.tournament_id, reg.hold_expires_at, t.name tournament_name
        from public.registrations reg
        join public.tournaments t on t.id = reg.tournament_id
       where reg.status = 'held'
         and reg.player_id is not null
         and reg.hold_expires_at is not null
         and reg.hold_expires_at >  now() + make_interval(hours => v_floor)
         and reg.hold_expires_at <= now() + make_interval(hours => h)
    loop
      select * into v_copy from private.render_automation(
        'hold_expiring',
        jsonb_build_object(
          'tournament_name', r.tournament_name,
          'tournament_id',   r.tournament_id::text,
          -- Rounded up: "within 2 hours" reads right at 1h52m, "within 1" does not.
          'hours_left',      ceil(extract(epoch from (r.hold_expires_at - now())) / 3600.0)::text
        )
      );

      insert into public.notifications (user_id, type, title, body, link, idempotency_key)
      values (
        r.player_id,
        'hold_expiring',
        coalesce(v_copy.title, 'Your spot is on hold'),
        coalesce(v_copy.body,  'Finish registering before your hold ends.'),
        coalesce(v_copy.link,  '/tournament/' || r.tournament_id),
        'hold-expiring/' || r.id || '/' || h
      )
      -- The unique index is PARTIAL (… where idempotency_key is not null),
      -- so the predicate has to be repeated for the arbiter to match it.
      on conflict (idempotency_key) where idempotency_key is not null do nothing;

      if found then v_count := v_count + 1; end if;
    end loop;
  end loop;

  return v_count;
end;
$$;

comment on function public.send_hold_expiring_reminders() is
  'Warns players before a paid hold ends, at the offsets in the '
  'hold_expiring catalog row. No-op while that row is disabled.';

revoke all on function public.send_hold_expiring_reminders() from public, anon, authenticated;
revoke all on function private.render_automation(text, jsonb) from public, anon, authenticated;

select cron.schedule('hold-expiring-reminders', '*/15 * * * *',
                     $$select public.send_hold_expiring_reminders();$$);

-- These automations now have a sender. `enabled` stays false: the owner turns
-- each on from /admin/notifications once a real push has been seen on a device.
update public.notification_automations
   set wired = true
 where key in ('hold_expiring', 'hold_expired', 'waitlist_spot_offered',
               'registration_confirmed', 'tournament_cancelled');
