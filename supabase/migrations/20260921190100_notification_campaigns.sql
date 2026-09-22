-- Push broadcast campaigns — Phase 1, Migration B of PUSH_BROADCAST_IMPLEMENTATION_PLAN.md.
--
-- Schema only. Nothing writes these tables until Phase 2 (the campaign API) and
-- nothing sends until Phase 3 (the worker). Purely additive; touches no live path.
--
-- ── Grants: read this before adding a table here ────────────────────────────
--
-- Supabase's default privileges hand anon and authenticated ALL on every new
-- public table — that is how push_tokens came to grant anon TRUNCATE. Every
-- table below therefore starts with an explicit REVOKE ALL and grants back only
-- what is needed. RLS alone is not enough: TRUNCATE ignores RLS.
--
-- ── Deviation from the plan: functions, not views ───────────────────────────
--
-- The plan asked for two security_invoker views AND for authenticated to hold
-- no grant on campaign_deliveries. Those contradict: an invoker view runs with
-- the caller's privileges, so the admin would get "permission denied". Admin
-- reads are instead two SECURITY DEFINER functions that check is_admin() and
-- return exactly what the views would have — aggregates only, and deliveries
-- with the token masked. Same pattern as admin_profile_emails (20260921130000).
-- The property the plan cared about holds: no browser session can obtain a full
-- ExponentPushToken, because no browser role can read the table at all.

-- ─── notification_campaigns ─────────────────────────────────────────────────

create table public.notification_campaigns (
  id uuid primary key default gen_random_uuid(),

  internal_name text not null check (char_length(internal_name) between 1 and 120),
  title         text not null check (char_length(title) between 1 and 100),
  body          text not null check (char_length(body) between 1 and 240),

  -- One category in V1. Closed by a check so a typo cannot invent a category
  -- that no preference column governs.
  category text not null default 'platform_announcements'
    check (category in ('platform_announcements')),

  -- Typed columns, not the spec's audience_filter jsonb: with two audience
  -- types JSONB buys nothing and costs a validation surface.
  audience_type     text not null check (audience_type in ('all', 'platform')),
  audience_platform text check (audience_platform in ('ios', 'android')),

  -- Required (decision 7): no campaign without a destination the app can open.
  -- Validated against the mobile deep-link allowlist by the Phase 2 write RPC;
  -- the database only insists that one is present.
  destination_url  text not null check (char_length(destination_url) between 1 and 500),
  destination_type text not null check (char_length(destination_type) between 1 and 40),

  status text not null default 'draft' check (status in (
    'draft', 'scheduled', 'queuing', 'sending', 'aborting', 'aborted',
    'sent', 'partially_failed', 'failed', 'cancelled'
  )),

  scheduled_at timestamptz,
  queued_at    timestamptz,
  started_at   timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  aborted_at   timestamptz,

  -- SET NULL, not CASCADE: deleting an admin's account must not delete the
  -- campaigns they sent. (Account deletion normally keeps a tombstone profile
  -- anyway — see the account deletion policy — so this rarely fires.)
  created_by   uuid references public.profiles(id) on delete set null,
  sent_by      uuid references public.profiles(id) on delete set null,
  cancelled_by uuid references public.profiles(id) on delete set null,
  aborted_by   uuid references public.profiles(id) on delete set null,

  idempotency_key text unique,

  recipient_user_count            integer check (recipient_user_count >= 0),
  recipient_device_count          integer check (recipient_device_count >= 0),
  excluded_unknown_platform_count integer check (excluded_unknown_platform_count >= 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A platform campaign names its platform; an 'all' campaign names none.
  constraint notification_campaigns_platform_matches_audience
    check ((audience_type = 'platform') = (audience_platform is not null))
);

comment on table public.notification_campaigns is
  'Admin push broadcasts (PUSH_BROADCAST_IMPLEMENTATION_PLAN.md). Written only by Phase 2 '
  'definer RPCs; admins read via RLS. No client writes.';

create trigger notification_campaigns_set_updated_at
  before update on public.notification_campaigns
  for each row execute function public.fn_set_updated_at();

-- The scheduler's only query.
create index notification_campaigns_scheduled_idx
  on public.notification_campaigns (scheduled_at)
  where status = 'scheduled';

-- ─── campaign_deliveries ────────────────────────────────────────────────────

create table public.campaign_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.notification_campaigns(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,

  -- NO foreign key, by decision 1, mirroring push_tickets: by the time a
  -- receipt says DeviceNotRegistered the push_tokens row is already deleted,
  -- and an FK would either block that delete or erase the history explaining it.
  expo_push_token text not null,

  status text not null default 'queued' check (status in (
    'queued', 'submitted', 'accepted', 'retry_pending', 'failed', 'invalid_token', 'skipped'
  )),

  ticket_id text,  -- Expo's ticket id; joins to push_tickets

  -- Sanitised provider text only. Capped so a verbose upstream error cannot
  -- bloat a row.
  provider_receipt_status text check (char_length(provider_receipt_status) <= 40),
  error_code              text check (char_length(error_code) <= 80),
  error_message           text check (char_length(error_message) <= 500),

  attempt_count   integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz,

  -- Capability snapshot at queue time (decision 8): tap-rate maths excludes
  -- devices that could never have reported a tap.
  app_version text check (char_length(app_version) <= 32),
  tap_capable boolean not null default false,

  submitted_at  timestamptz,
  reconciled_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- The whole duplicate-send defence. Enforced by the database, so it survives
  -- retried requests, overlapping workers and a double-fired scheduler.
  constraint campaign_deliveries_one_per_device unique (campaign_id, expo_push_token)
);

comment on table public.campaign_deliveries is
  'One row per (campaign, device). Holds full push tokens, so NO browser role has any grant: '
  'admins read masked rows via admin_campaign_deliveries(). Rows pruned after 90 days (Phase 3+).';

create trigger campaign_deliveries_set_updated_at
  before update on public.campaign_deliveries
  for each row execute function public.fn_set_updated_at();

-- The worker's claim query.
create index campaign_deliveries_claim_idx
  on public.campaign_deliveries (campaign_id, status, next_attempt_at);
-- Receipt reconciliation.
create index campaign_deliveries_ticket_idx
  on public.campaign_deliveries (ticket_id)
  where ticket_id is not null;
-- The 90-day prune.
create index campaign_deliveries_created_idx
  on public.campaign_deliveries (created_at);
-- user_id FK: indexed so a profile delete's cascade is not a sequential scan.
create index campaign_deliveries_user_idx
  on public.campaign_deliveries (user_id);

-- ─── campaign_audit_log ─────────────────────────────────────────────────────

create table public.campaign_audit_log (
  id uuid primary key default gen_random_uuid(),

  -- Deliberately NO foreign keys. The audit outlives the campaign and the
  -- actor. Even ON DELETE SET NULL would not do: it is an UPDATE, which the
  -- immutability trigger below refuses, so the FK would make campaigns and
  -- admin profiles undeletable.
  campaign_id uuid,
  actor_id    uuid,

  action   text  not null check (char_length(action) between 1 and 60),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.campaign_audit_log is
  'Append-only record of every campaign action. UPDATE, DELETE and TRUNCATE raise for every '
  'role including service_role (trigger-enforced, not grant-enforced). Retained indefinitely.';

create index campaign_audit_log_campaign_idx
  on public.campaign_audit_log (campaign_id, created_at);

create or replace function public.fn_campaign_audit_log_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'campaign_audit_log is append-only (% refused)', tg_op
    using errcode = '42501';
end;
$$;

-- Triggers, not grants: service_role bypasses RLS and holds table grants, but
-- it cannot bypass a trigger.
create trigger campaign_audit_log_no_update_delete
  before update or delete on public.campaign_audit_log
  for each row execute function public.fn_campaign_audit_log_immutable();

create trigger campaign_audit_log_no_truncate
  before truncate on public.campaign_audit_log
  for each statement execute function public.fn_campaign_audit_log_immutable();

-- ─── campaign_taps ──────────────────────────────────────────────────────────

create table public.campaign_taps (
  campaign_id uuid not null references public.notification_campaigns(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  occurred_at timestamptz not null default now(),

  -- One tap per user per campaign. The primary key's leading column also
  -- serves the plan's campaign_taps (campaign_id) index, so no separate one.
  primary key (campaign_id, user_id)
);

comment on table public.campaign_taps is
  'First tap per user per campaign. Written by a Phase 6 RPC from tap-capable builds only.';

create index campaign_taps_user_idx on public.campaign_taps (user_id);

-- ─── push_tokens capability columns ─────────────────────────────────────────
--
-- Self-reported by the client at registration (Phase 6). A user could lie,
-- which is acceptable for a metric and for nothing else: only reporting may
-- read these. Existing grants and self-only RLS on push_tokens cover them.

alter table public.push_tokens
  add column if not exists app_version text check (char_length(app_version) <= 32),
  add column if not exists tap_events_supported boolean not null default false;

comment on column public.push_tokens.tap_events_supported is
  'Client-reported: this build records notification taps (Phase 6). Reporting only -- never '
  'use for authorization or targeting.';

-- ─── Grants and RLS ─────────────────────────────────────────────────────────

alter table public.notification_campaigns enable row level security;
alter table public.campaign_deliveries    enable row level security;
alter table public.campaign_audit_log     enable row level security;
alter table public.campaign_taps          enable row level security;

revoke all on public.notification_campaigns from anon, authenticated;
revoke all on public.campaign_deliveries    from anon, authenticated;
revoke all on public.campaign_audit_log     from anon, authenticated;
revoke all on public.campaign_taps          from anon, authenticated;

-- Admins read campaigns, audit and taps directly (no tokens in any of them).
-- All writes happen in definer functions from Phase 2 onward, so no INSERT,
-- UPDATE or DELETE is granted to any browser role. campaign_deliveries gets
-- nothing — see the header.
grant select on public.notification_campaigns to authenticated;
grant select on public.campaign_audit_log     to authenticated;
grant select on public.campaign_taps          to authenticated;

-- (select …) so is_admin() is evaluated once per query, not once per row.
create policy "notification_campaigns: admin read"
  on public.notification_campaigns for select to authenticated
  using ((select public.is_admin()));

create policy "campaign_audit_log: admin read"
  on public.campaign_audit_log for select to authenticated
  using ((select public.is_admin()));

create policy "campaign_taps: admin read"
  on public.campaign_taps for select to authenticated
  using ((select public.is_admin()));

-- ─── Admin read functions (in place of the plan's two views) ────────────────

-- Per-campaign aggregate counts. No per-device data, no tokens.
create or replace function public.admin_campaign_summary(p_campaign_id uuid default null)
returns table (
  campaign_id uuid,
  internal_name text,
  status text,
  audience_type text,
  audience_platform text,
  recipient_user_count integer,
  recipient_device_count integer,
  excluded_unknown_platform_count integer,
  queued bigint,
  submitted bigint,
  accepted bigint,
  retry_pending bigint,
  failed bigint,
  invalid_token bigint,
  skipped bigint,
  tap_capable_accepted bigint,
  taps bigint,
  created_at timestamptz,
  completed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  select
    c.id, c.internal_name, c.status, c.audience_type, c.audience_platform,
    c.recipient_user_count, c.recipient_device_count, c.excluded_unknown_platform_count,
    count(*) filter (where d.status = 'queued'),
    count(*) filter (where d.status = 'submitted'),
    count(*) filter (where d.status = 'accepted'),
    count(*) filter (where d.status = 'retry_pending'),
    count(*) filter (where d.status = 'failed'),
    count(*) filter (where d.status = 'invalid_token'),
    count(*) filter (where d.status = 'skipped'),
    -- Tap-rate denominator (decision 8): accepted AND able to report a tap.
    count(*) filter (where d.status = 'accepted' and d.tap_capable),
    (select count(*) from public.campaign_taps t where t.campaign_id = c.id),
    c.created_at, c.completed_at
  from public.notification_campaigns c
  left join public.campaign_deliveries d on d.campaign_id = c.id
  where p_campaign_id is null or c.id = p_campaign_id
  group by c.id
  order by c.created_at desc;
end;
$$;

-- Per-delivery rows for one campaign, token masked to its last six
-- characters. Paged: a campaign can hold one row per device on the platform.
create or replace function public.admin_campaign_deliveries(
  p_campaign_id uuid,
  p_limit integer default 200,
  p_offset integer default 0
)
returns table (
  id uuid,
  user_id uuid,
  token_masked text,
  status text,
  error_code text,
  error_message text,
  attempt_count integer,
  next_attempt_at timestamptz,
  app_version text,
  tap_capable boolean,
  submitted_at timestamptz,
  reconciled_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  select
    d.id, d.user_id,
    -- "ExponentPushToken[abc…xyz]" → "…" + the last six characters inside the
    -- brackets. Enough to match a support report; useless for sending.
    '…' || right(rtrim(d.expo_push_token, ']'), 6),
    d.status, d.error_code, d.error_message, d.attempt_count, d.next_attempt_at,
    d.app_version, d.tap_capable, d.submitted_at, d.reconciled_at, d.created_at
  from public.campaign_deliveries d
  where d.campaign_id = p_campaign_id
  order by d.created_at, d.id
  limit least(greatest(coalesce(p_limit, 200), 1), 1000)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- REVOKE FROM PUBLIC does not remove grants Supabase's default privileges gave
-- anon and authenticated directly, so both are named.
revoke all on function public.admin_campaign_summary(uuid) from public, anon;
revoke all on function public.admin_campaign_deliveries(uuid, integer, integer) from public, anon;
grant execute on function public.admin_campaign_summary(uuid) to authenticated;
grant execute on function public.admin_campaign_deliveries(uuid, integer, integer) to authenticated;

revoke all on function public.fn_campaign_audit_log_immutable() from public, anon, authenticated;
