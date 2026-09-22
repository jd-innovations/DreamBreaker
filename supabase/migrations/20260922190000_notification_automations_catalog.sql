-- Phase A.1 of the notification programme (owner-approved 2026-09-22): the
-- catalog every automatic notification is defined by, plus the global limits
-- and the timezone the limits need.
--
-- Why a catalog and not code per notification: the owner edits copy, timing,
-- channels and on/off from /admin/notifications without a release. Only the
-- SENSING half of a notification ("a hold is 2h from expiring") is code; what
-- it says, when within that window, and whether it goes at all is data.
--
-- Nothing dispatches from this migration. It is the table, its audit trail and
-- its seed rows; the dispatcher lands in A.2 and every row here ships
-- `enabled = false` so no notification changes behaviour on apply.
--
-- Pre-launch (2026-09-22): the owner is the only real user, so seeding and
-- flipping rows carries no user-facing risk today. That stops being true at
-- launch — treat `enabled` as a live switch from then on.

-- ── Timezone ────────────────────────────────────────────────────────────────
-- Quiet hours are meaningless without it: 20260831020000 removed the mobile
-- quiet-hours toggle for exactly this reason. Captured from the device by
-- Intl.DateTimeFormat().resolvedOptions().timeZone (pure JS — ships over the
-- air, no native build). NULL means "unknown": the dispatcher then treats the
-- user as UTC rather than guessing, and quiet hours for them are approximate.
alter table public.profiles
  add column if not exists timezone text;

comment on column public.profiles.timezone is
  'IANA timezone from the device (e.g. America/New_York). Used for '
  'notification quiet hours. NULL = unknown, dispatcher falls back to UTC.';

-- ── The catalog ─────────────────────────────────────────────────────────────

create table if not exists public.notification_automations (
  key            text primary key,
  name           text not null,
  description    text,

  -- 'critical' is the exemption the owner approved: things the user has
  -- committed money or a deadline to still send when marketing is off, and
  -- ignore the frequency caps. Everything else obeys both.
  category       text not null check (category in ('critical', 'social', 'discovery', 'marketing')),

  -- A profiles.notif_* column, or NULL for "no per-user toggle". Validated
  -- against the real column list by the trigger below — a typo here would
  -- otherwise fail open and send to people who opted out.
  pref_column    text,

  channels       text[] not null default array['push', 'in_app'],

  -- Copy. {{variables}} are substituted by the sender from the event's own
  -- data, exactly like email_templates.
  title_template text not null,
  body_template  text not null,
  link_template  text,

  -- Per-automation knobs, shape depends on the automation. e.g. the hold
  -- reminder uses {"offsets_hours": [24, 2]}; discovery uses {"radius_miles": 25}.
  timing         jsonb not null default '{}'::jsonb,

  -- Minimum gap between two sends of THIS automation to the SAME person.
  -- NULL = no per-automation limit (the global caps still apply unless critical).
  throttle_hours integer check (throttle_hours is null or throttle_hours > 0),

  enabled        boolean not null default false,

  -- False = the catalog row exists but nothing senses the event yet. This is
  -- how the ~25 known-but-unbuilt notifications stay visible as a backlog in
  -- the product instead of living in a document nobody opens. The admin UI
  -- shows these as "not built yet" and refuses to enable them.
  wired          boolean not null default false,

  sort_order     integer not null default 100,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users(id) on delete set null,

  constraint notification_automations_channels_valid
    check (channels <@ array['push', 'in_app', 'email'] and array_length(channels, 1) >= 1),
  -- An automation that cannot be enabled until it is built.
  constraint notification_automations_enabled_requires_wired
    check (not enabled or wired)
);

comment on table public.notification_automations is
  'One row per automatic notification. Copy/timing/channels are admin-editable '
  'from /admin/notifications; the sensing half is code. category=critical is '
  'exempt from marketing prefs and frequency caps (owner decision 2026-09-22).';

create index if not exists notification_automations_enabled_idx
  on public.notification_automations (enabled) where enabled;

-- pref_column must name a real profiles column, and a boolean one.
create or replace function public.fn_validate_automation_pref_column()
returns trigger language plpgsql as $$
begin
  if new.pref_column is not null and not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles'
       and column_name = new.pref_column and data_type = 'boolean'
  ) then
    raise exception 'pref_column "%" is not a boolean column on public.profiles', new.pref_column;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_validate_automation_pref_column on public.notification_automations;
create trigger trg_validate_automation_pref_column
  before insert or update on public.notification_automations
  for each row execute function public.fn_validate_automation_pref_column();

-- ── Audit ───────────────────────────────────────────────────────────────────
-- Same posture as campaign_audit_log: a copy change is attributable. Append
-- only; nothing in the app deletes from it.

create table if not exists public.notification_automation_audit (
  id             uuid primary key default gen_random_uuid(),
  automation_key text not null,
  action         text not null check (action in ('insert', 'update', 'delete')),
  changed_by     uuid references auth.users(id) on delete set null,
  changed_at     timestamptz not null default now(),
  before         jsonb,
  after          jsonb
);

create index if not exists notification_automation_audit_key_idx
  on public.notification_automation_audit (automation_key, changed_at desc);

create or replace function public.fn_audit_notification_automation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notification_automation_audit (automation_key, action, changed_by, before, after)
  values (
    coalesce(new.key, old.key),
    lower(tg_op),
    auth.uid(),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_audit_notification_automation on public.notification_automations;
create trigger trg_audit_notification_automation
  after insert or update or delete on public.notification_automations
  for each row execute function public.fn_audit_notification_automation();

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Admin-only, per the owner's decision. The dispatcher reads the catalog from
-- SECURITY DEFINER functions, so it is unaffected by these policies.

alter table public.notification_automations enable row level security;
alter table public.notification_automation_audit enable row level security;

drop policy if exists notification_automations_admin_all on public.notification_automations;
create policy notification_automations_admin_all
  on public.notification_automations for all
  to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists notification_automation_audit_admin_read on public.notification_automation_audit;
create policy notification_automation_audit_admin_read
  on public.notification_automation_audit for select
  to authenticated
  using (public.is_admin());

revoke all on public.notification_automations from anon;
revoke all on public.notification_automation_audit from anon;
grant select, insert, update, delete on public.notification_automations to authenticated;
grant select on public.notification_automation_audit to authenticated;

-- ── Global limits ───────────────────────────────────────────────────────────
-- In platform_settings so they are editable beside every other operational
-- knob, rather than a second settings surface. Values are the owner's
-- decisions of 2026-09-22.

insert into public.platform_settings (key, value, value_type, label, description, unit, sort_order)
values
  ('push_automations_enabled', 'true', 'boolean', 'Automatic notifications',
   'Master switch for every automatic notification. Off pauses all of them, including critical ones. Admin campaigns are unaffected.',
   null, 950),
  ('push_marketing_max_per_day', '1', 'number', 'Marketing pushes per day',
   'Most non-critical pushes one person can receive in a day. Critical notifications (holds, waitlist offers, event reminders) do not count.',
   'per day', 951),
  ('push_marketing_max_per_week', '3', 'number', 'Marketing pushes per week',
   'Most non-critical pushes one person can receive in a week. Critical notifications do not count.',
   'per week', 952),
  ('push_quiet_hours_start', '21', 'number', 'Quiet hours start',
   'Hour (0-23) in the user''s own timezone after which non-critical pushes are held until morning.',
   'hour', 953),
  ('push_quiet_hours_end', '8', 'number', 'Quiet hours end',
   'Hour (0-23) in the user''s own timezone before which non-critical pushes are held.',
   'hour', 954),
  ('push_discovery_radius_miles', '25', 'number', 'Discovery radius',
   'How near a tournament or game must be to count as "near you" for discovery notifications.',
   'miles', 955)
on conflict (key) do nothing;

-- ── Seed: the Phase A automations ───────────────────────────────────────────
-- All disabled and unwired. A.3 builds each sender and flips `wired`; the
-- owner flips `enabled` once a real test push has landed on a device.
--
-- Copy is the starting draft, written to be readable on a lock screen: a short
-- title, one line of what to do. The owner edits it in the admin screen.

insert into public.notification_automations
  (key, name, description, category, pref_column, channels, title_template, body_template, link_template, timing, throttle_hours, sort_order)
values
  ('hold_expiring',
   'Hold ending soon',
   'Warns a player before the spot they paid to hold is released. Sent at each configured offset before hold_expires_at.',
   'critical', null, array['push', 'in_app'],
   'Your spot is on hold ⏳',
   'Finish registering for {{tournament_name}} within {{hours_left}} hours or your spot goes to the next player.',
   '/tournament/{{tournament_id}}',
   '{"offsets_hours": [24, 2]}'::jsonb, null, 10),

  ('hold_expired',
   'Hold expired',
   'The paid hold ran out and the spot was released. Already emails; this adds push and in-app.',
   'critical', null, array['push', 'in_app'],
   'Your hold has ended',
   'Your spot in {{tournament_name}} was released. Spots may still be open — tap to look.',
   '/tournament/{{tournament_id}}',
   '{}'::jsonb, null, 11),

  ('waitlist_spot_offered',
   'Waitlist spot offered',
   'A spot opened and this player is next. They have a limited window to claim it, so this is time-critical.',
   'critical', null, array['push', 'in_app'],
   'A spot opened up 🎉',
   '{{tournament_name}} has room for you. Claim it within {{hours_left}} hours before it moves on.',
   '/tournament/{{tournament_id}}',
   '{}'::jsonb, null, 12),

  ('event_reminder',
   'Day-before reminder',
   'Reminds registered players the day before an event. Offset is configurable.',
   'critical', 'notif_tournaments', array['push', 'in_app', 'email'],
   'Tomorrow: {{tournament_name}}',
   'Check-in opens {{checkin_time}} at {{venue_name}}. See you there.',
   '/tournament/{{tournament_id}}',
   '{"offsets_hours": [24]}'::jsonb, 24, 13),

  ('registration_confirmed',
   'Registration confirmed',
   'Confirms a registration. Already emails and writes in-app; this adds push.',
   'critical', 'notif_tournaments', array['push', 'in_app'],
   'You''re in! 🏓',
   'Your spot in {{tournament_name}} is confirmed for {{event_date}}.',
   '/tournament/{{tournament_id}}',
   '{}'::jsonb, null, 14),

  ('tournament_cancelled',
   'Tournament cancelled',
   'The event a player registered for was cancelled. Writes in-app and emails today; this adds push.',
   'critical', 'notif_tournaments', array['push', 'in_app'],
   'Cancelled: {{tournament_name}}',
   '{{reason}} Any payment is refunded automatically.',
   '/tournament/{{tournament_id}}',
   '{}'::jsonb, null, 15),

  ('checkin_open',
   'Check-in is open',
   'Check-in opened for an event. NOT BUILT: checkin_opens_at is set on roughly 1 tournament in 9 and there is no director action to hook instead. Needs that data before it can be wired.',
   'critical', 'notif_tournaments', array['push', 'in_app', 'email'],
   'Check-in is open',
   'Check in for {{tournament_name}} to confirm your spot in the draw.',
   '/tournament/{{tournament_id}}',
   '{}'::jsonb, null, 16)
on conflict (key) do nothing;
