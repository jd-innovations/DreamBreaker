-- Phase A.2: the dispatcher. One path turns an in-app notification into a
-- push, for every automation in the catalog.
--
-- Why this shape: almost every feature in this app ALREADY writes a row to
-- public.notifications (tournaments, wallet, groups, games, marketplace,
-- matches). Only two of them also push. So the cheapest correct design is to
-- treat `notifications` as the event stream and decide, per row, whether it
-- also goes out as a push. Wiring a new automation then usually means adding a
-- catalog row, not a new sender.
--
-- The security posture of 20260921200000 is preserved exactly: the trigger
-- tells the edge function WHICH notification (an id), never who it goes to or
-- what it says. The function asks the database, and the database re-checks
-- every rule below. The worst a stolen dispatch secret can do is re-send a
-- real notification, written in the last 10 minutes, to its real recipient.
--
-- What this migration does NOT do: send anything. Every catalog row is
-- enabled = false, so the trigger short-circuits until A.3 wires each sender
-- and the owner switches it on.

-- ── Settings helpers ────────────────────────────────────────────────────────

create or replace function private.automation_setting_num(p_key text, p_default numeric)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce((select nullif(value, '')::numeric from public.platform_settings where key = p_key), p_default);
$$;

create or replace function private.automation_setting_bool(p_key text, p_default boolean)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select nullif(value, '')::boolean from public.platform_settings where key = p_key), p_default);
$$;

-- ── The send log ────────────────────────────────────────────────────────────
-- What the frequency caps and throttles count. Written when a push is
-- DISPATCHED (handed to the edge function), which is the right unit for "how
-- many did we send this person" — delivery success is push_tickets' job.

create table if not exists public.notification_push_log (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  automation_key  text not null,
  category        text not null,
  notification_id uuid,
  sent_at         timestamptz not null default now()
);

create index if not exists notification_push_log_user_idx
  on public.notification_push_log (user_id, sent_at desc);
create index if not exists notification_push_log_key_idx
  on public.notification_push_log (automation_key, sent_at desc);

comment on table public.notification_push_log is
  'One row per automatic push dispatched. Backs the frequency caps, the '
  'per-automation throttle, and the "last fired / how many" figures in '
  '/admin/notifications.';

alter table public.notification_push_log enable row level security;

-- Nobody reads this from a client session except an admin (the stats panel).
-- The dispatcher writes it as a definer, so it needs no policy of its own.
drop policy if exists notification_push_log_admin_read on public.notification_push_log;
create policy notification_push_log_admin_read
  on public.notification_push_log for select to authenticated using (public.is_admin());

revoke all on public.notification_push_log from anon;
grant select on public.notification_push_log to authenticated;

-- ── The decision ────────────────────────────────────────────────────────────
-- Returns NULL when a push should go, otherwise the reason it should not.
-- A reason string rather than a boolean because every caller — the trigger,
-- the resolver, and the admin screen's test send — wants to say WHY nothing
-- happened. Silent no-ops are how the 2026-08-21 mail-drop went unnoticed.
--
-- Order matters: cheapest and most absolute checks first.

create or replace function private.automation_push_blocked_reason(
  p_user_id uuid,
  p_key     text
) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  a            public.notification_automations%rowtype;
  v_pref       boolean;
  v_tz         text;
  v_hour       integer;
  v_start      integer;
  v_end        integer;
  v_day_count  integer;
  v_week_count integer;
begin
  if not private.automation_setting_bool('push_automations_enabled', true) then
    return 'master_switch_off';
  end if;

  select * into a from public.notification_automations where key = p_key;
  if not found then return 'no_such_automation'; end if;
  if not a.enabled then return 'automation_disabled'; end if;
  if not ('push' = any (a.channels)) then return 'push_channel_off'; end if;

  if not exists (select 1 from public.push_tokens pt where pt.user_id = p_user_id) then
    return 'no_device';
  end if;

  -- The user's own switch, when the automation has one. This is honoured for
  -- EVERY category including critical: a preference the user set is not ours
  -- to override. What 'critical' exempts is the marketing machinery below —
  -- caps and quiet hours — so a hold about to expire is never held back or
  -- counted against a daily allowance (owner decision, 2026-09-22).
  if a.pref_column is not null then
    execute format('select %I from public.profiles where id = $1', a.pref_column)
      into v_pref using p_user_id;
    if v_pref is false then return 'user_pref_off'; end if;
  end if;

  -- Per-automation throttle applies to every category: it exists to stop the
  -- same automation firing twice for one person, which is a bug, not a
  -- marketing choice.
  if a.throttle_hours is not null and exists (
    select 1 from public.notification_push_log l
     where l.user_id = p_user_id and l.automation_key = p_key
       and l.sent_at > now() - make_interval(hours => a.throttle_hours)
  ) then
    return 'throttled';
  end if;

  if a.category = 'critical' then
    return null;
  end if;

  -- Quiet hours, in the user's own timezone. An unknown timezone falls back to
  -- UTC rather than guessing: for a US user that shifts the window earlier,
  -- which errs toward silence, not toward a 3 a.m. push.
  --
  -- A blocked push is DROPPED, not deferred. A queue that re-sends at 8 a.m.
  -- is the right answer for discovery/marketing and is deliberately left to
  -- Phase C, when there is something non-critical to send; today nothing
  -- reaches this line, and a stub queue nobody exercises is worse than none.
  select p.timezone into v_tz from public.profiles p where p.id = p_user_id;
  v_hour  := extract(hour from (now() at time zone coalesce(v_tz, 'UTC')))::int;
  v_start := private.automation_setting_num('push_quiet_hours_start', 21)::int;
  v_end   := private.automation_setting_num('push_quiet_hours_end', 8)::int;

  -- The window wraps midnight when start > end (21:00 -> 08:00), and does not
  -- when it is set the other way round; both readings are supported so an
  -- admin cannot accidentally create a window that means nothing.
  if (v_start > v_end and (v_hour >= v_start or v_hour < v_end))
     or (v_start < v_end and v_hour >= v_start and v_hour < v_end) then
    return 'quiet_hours';
  end if;

  select count(*) filter (where l.sent_at > now() - interval '24 hours'),
         count(*) filter (where l.sent_at > now() - interval '7 days')
    into v_day_count, v_week_count
    from public.notification_push_log l
   where l.user_id = p_user_id and l.category <> 'critical';

  if v_day_count >= private.automation_setting_num('push_marketing_max_per_day', 1)::int then
    return 'daily_cap';
  end if;
  if v_week_count >= private.automation_setting_num('push_marketing_max_per_week', 3)::int then
    return 'weekly_cap';
  end if;

  return null;
end;
$$;

-- ── The resolver the edge function calls ────────────────────────────────────
-- Same contract as resolve_message_push_recipients / resolve_price_drop_push_
-- recipients (20260921200000): tokens, title, body, data — built here, never
-- taken from the request, and only for a notification written in the last ten
-- minutes.
--
-- The TEXT is the notification row's own title and body. The catalog's
-- templates are rendered by whichever sender wrote that row, so push and
-- in-app always say the same thing and there is no second rendering to drift.

create or replace function public.resolve_automation_push_recipients(p_notification_id uuid)
returns table (tokens text[], title text, body text, data jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare
  n        public.notifications%rowtype;
  v_tokens text[];
begin
  select * into n from public.notifications where id = p_notification_id;
  if not found or n.created_at < now() - interval '10 minutes' then
    return;
  end if;

  -- Re-checked here, not trusted from the trigger: this function is reachable
  -- by anything holding the dispatch secret.
  if private.automation_push_blocked_reason(n.user_id, n.type) is not null then
    return;
  end if;

  select array_agg(distinct pt.expo_push_token) into v_tokens
    from public.push_tokens pt where pt.user_id = n.user_id;

  if v_tokens is null or array_length(v_tokens, 1) is null then
    return;
  end if;

  return query select
    v_tokens,
    n.title,
    left(n.body, 140),
    jsonb_build_object(
      'notificationId', n.id,
      'automationKey',  n.type,
      'link',           n.link
    );
end;
$$;

revoke all on function public.resolve_automation_push_recipients(uuid) from public, anon, authenticated;

-- ── The trigger ─────────────────────────────────────────────────────────────
-- Fires on every notification row. For the ~15 types with no catalog entry
-- this costs one indexed lookup that returns 'no_such_automation' and stops.

create or replace function public.fn_dispatch_automation_push()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_reason   text;
  v_category text;
begin
  v_reason := private.automation_push_blocked_reason(new.user_id, new.type);
  if v_reason is not null then
    return new;
  end if;

  select category into v_category from public.notification_automations where key = new.type;

  -- Logged before dispatch: a push that was sent but not counted would let the
  -- next one slip past the cap, which is the failure that annoys users. A
  -- counted push that failed to send costs one missed notification instead.
  insert into public.notification_push_log (user_id, automation_key, category, notification_id)
  values (new.user_id, new.type, v_category, new.id);

  perform net.http_post(
    url     := 'https://fbzetvkbhneptvfruilw.supabase.co/functions/v1/send-message-push',
    headers := private.push_dispatch_headers(),
    body    := jsonb_build_object('kind', 'automation', 'notificationId', new.id)
  );

  return new;
end;
$$;

drop trigger if exists trg_dispatch_automation_push on public.notifications;
create trigger trg_dispatch_automation_push
  after insert on public.notifications
  for each row execute function public.fn_dispatch_automation_push();

-- ── Admin-facing stats ──────────────────────────────────────────────────────
-- What the Automations list shows per row. One RPC rather than the client
-- joining three tables, so the numbers are defined in one place.

create or replace function public.admin_list_automations()
returns table (
  key text, name text, description text, category text, pref_column text,
  channels text[], title_template text, body_template text, link_template text,
  timing jsonb, throttle_hours integer, enabled boolean, wired boolean,
  sort_order integer, updated_at timestamptz, updated_by_name text,
  last_sent_at timestamptz, sent_7d integer, sent_total integer
)
language sql stable security definer set search_path = '' as $$
  select a.key, a.name, a.description, a.category, a.pref_column,
         a.channels, a.title_template, a.body_template, a.link_template,
         a.timing, a.throttle_hours, a.enabled, a.wired,
         a.sort_order, a.updated_at,
         p.full_name,
         s.last_sent_at, coalesce(s.sent_7d, 0)::int, coalesce(s.sent_total, 0)::int
    from public.notification_automations a
    left join public.profiles p on p.id = a.updated_by
    left join lateral (
      select max(l.sent_at) last_sent_at,
             count(*) filter (where l.sent_at > now() - interval '7 days') sent_7d,
             count(*) sent_total
        from public.notification_push_log l
       where l.automation_key = a.key
    ) s on true
   where public.is_admin()
   order by a.sort_order, a.key;
$$;

revoke all on function public.admin_list_automations() from public, anon;
grant execute on function public.admin_list_automations() to authenticated;
