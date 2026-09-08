-- =============================================================================
-- DreamBreaker PB — Wallet Phase 1
-- Migration: 20260720000000_wallet_phase1
--
-- Creates:
--   wallet_partners     — organizations associated with wallet items
--   wallet_items        — generic user-owned benefit/entitlement record
--   wallet_activity      — append-only event timeline per wallet item
--   wallet_redemptions  — redemption attempts per wallet item
--   mark_wallet_item_seen(uuid) — narrow RPC, only path for a client to
--     mutate a wallet_items row (is_seen/seen_at only)
--
-- Phase 1 scope: dashboard + detail + external redemption links + activity
-- history. No Shopify sync, no transferable balances, no client-side writes
-- to balances/status. See WALLET_ARCHITECTURE.md at repo root for full spec.
-- =============================================================================


-- =============================================================================
-- WALLET_PARTNERS
-- =============================================================================

create table public.wallet_partners (
  id            uuid          primary key default gen_random_uuid(),
  slug          text          not null unique,
  name          text          not null,
  description   text,
  logo_url      text,
  website_url   text,
  is_active     boolean       not null default true,
  metadata      jsonb         not null default '{}'::jsonb,
  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now()
);

comment on table public.wallet_partners is 'Organizations (internal or external) associated with wallet_items — e.g. Pickleball Grip Doctor.';

create trigger trg_wallet_partners_updated_at
  before update on public.wallet_partners
  for each row execute function public.fn_set_updated_at();


-- =============================================================================
-- WALLET_ITEMS
-- =============================================================================

create table public.wallet_items (
  id                      uuid          primary key default gen_random_uuid(),

  user_id                 uuid          not null references public.profiles(id) on delete cascade,
  partner_id              uuid          references public.wallet_partners(id) on delete set null,

  type                    text          not null,
  status                  text          not null default 'processing',

  title                   text          not null,
  subtitle                text,
  description             text,

  value_amount            numeric(12,2),
  currency_code           text          not null default 'USD',
  value_label             text,

  original_value_amount   numeric(12,2),
  remaining_value_amount  numeric(12,2),

  starts_at               timestamptz,
  expires_at              timestamptz,
  redeemed_at             timestamptz,

  action_type             text          not null default 'none',
  action_label            text,
  action_url              text,

  external_system         text,
  external_customer_id    text,
  external_account_id     text,
  external_reference_id   text,

  source_type             text,
  source_id               text,

  is_seen                 boolean       not null default false,
  seen_at                 timestamptz,

  metadata                jsonb         not null default '{}'::jsonb,

  created_at              timestamptz   not null default now(),
  updated_at              timestamptz   not null default now(),

  constraint check_wallet_item_type check (
    type in ('credit', 'membership', 'offer', 'pass', 'ticket', 'reward')
  ),
  constraint check_wallet_item_status check (
    status in ('processing', 'new', 'available', 'active', 'partially_redeemed',
               'redeemed', 'expired', 'revoked', 'failed')
  ),
  constraint check_wallet_item_action_type check (
    action_type in ('external_url', 'internal_route', 'redemption', 'view_details', 'none')
  )
);

comment on table public.wallet_items is 'Generic user-owned wallet benefit/entitlement. One table for all types — differences are represented via type/metadata, not separate tables.';
comment on column public.wallet_items.source_type is 'Origin of this item, e.g. stripe_invoice, admin_grant — paired with source_id for idempotent issuance.';

create trigger trg_wallet_items_updated_at
  before update on public.wallet_items
  for each row execute function public.fn_set_updated_at();


-- =============================================================================
-- WALLET_ACTIVITY
-- Append-only event timeline per wallet item. No updated_at — events are
-- immutable once recorded.
-- =============================================================================

create table public.wallet_activity (
  id                      uuid          primary key default gen_random_uuid(),

  wallet_item_id          uuid          not null references public.wallet_items(id) on delete cascade,
  user_id                 uuid          not null references public.profiles(id) on delete cascade,

  event_type              text          not null,
  title                   text          not null,
  description             text,

  amount                  numeric(12,2),
  currency_code           text,

  external_reference_id   text,
  metadata                jsonb         not null default '{}'::jsonb,

  created_at              timestamptz   not null default now()
);

comment on table public.wallet_activity is 'User-facing activity timeline per wallet item (e.g. "Credit added", "$18.00 used"). Not for technical/system logs.';


-- =============================================================================
-- WALLET_REDEMPTIONS
-- =============================================================================

create table public.wallet_redemptions (
  id                      uuid          primary key default gen_random_uuid(),

  wallet_item_id          uuid          not null references public.wallet_items(id) on delete cascade,
  user_id                 uuid          not null references public.profiles(id) on delete cascade,

  status                  text          not null default 'pending',

  amount                  numeric(12,2),
  currency_code           text,

  external_order_id       text,
  external_reference_id   text,

  started_at              timestamptz   not null default now(),
  completed_at            timestamptz,
  failed_at               timestamptz,

  failure_reason          text,

  metadata                jsonb         not null default '{}'::jsonb,

  created_at              timestamptz   not null default now(),
  updated_at              timestamptz   not null default now(),

  constraint check_wallet_redemption_status check (
    status in ('pending', 'completed', 'failed')
  )
);

comment on table public.wallet_redemptions is 'Redemption attempts per wallet item. Phase 1 has no client-facing redemption flow yet — table exists for future use and to keep the schema stable.';

create trigger trg_wallet_redemptions_updated_at
  before update on public.wallet_redemptions
  for each row execute function public.fn_set_updated_at();


-- =============================================================================
-- INDEXES
-- =============================================================================

-- Idempotent issuance: prevents duplicate benefit issuance for the same
-- source event (e.g. a re-delivered Stripe webhook).
create unique index idx_wallet_items_idempotent_source
  on public.wallet_items(user_id, source_type, source_id, type)
  where source_id is not null;

create index idx_wallet_items_user            on public.wallet_items(user_id);
create index idx_wallet_items_user_status     on public.wallet_items(user_id, status);
create index idx_wallet_items_user_type       on public.wallet_items(user_id, type);
create index idx_wallet_items_partner         on public.wallet_items(partner_id);
create index idx_wallet_items_user_unseen     on public.wallet_items(user_id) where is_seen = false;

create index idx_wallet_activity_item         on public.wallet_activity(wallet_item_id);
create index idx_wallet_activity_user_created on public.wallet_activity(user_id, created_at desc);

create index idx_wallet_redemptions_item      on public.wallet_redemptions(wallet_item_id);
create index idx_wallet_redemptions_user      on public.wallet_redemptions(user_id);


-- =============================================================================
-- ROW LEVEL SECURITY — ENABLE
-- =============================================================================

alter table public.wallet_partners     enable row level security;
alter table public.wallet_items        enable row level security;
alter table public.wallet_activity     enable row level security;
alter table public.wallet_redemptions  enable row level security;


-- =============================================================================
-- RLS POLICIES — wallet_partners
-- Reference data, not user-owned — readable by anyone when active.
-- =============================================================================

create policy "wallet_partners: public read active"
  on public.wallet_partners for select
  using (is_active = true);


-- =============================================================================
-- RLS POLICIES — wallet_items / wallet_activity / wallet_redemptions
-- Users may only read their own rows. No insert/update/delete policy exists
-- for `authenticated` on any of these three tables — all writes are denied
-- by RLS default-deny except via service_role or the narrow RPC below.
-- =============================================================================

create policy "wallet_items: user select own"
  on public.wallet_items for select
  using (user_id = (select auth.uid()));

create policy "wallet_activity: user select own"
  on public.wallet_activity for select
  using (user_id = (select auth.uid()));

create policy "wallet_redemptions: user select own"
  on public.wallet_redemptions for select
  using (user_id = (select auth.uid()));


-- =============================================================================
-- RPC — mark_wallet_item_seen
-- Only path for a client to mutate a wallet_items row: flips is_seen/seen_at
-- on a row the caller owns. No other field is writable by the client.
-- =============================================================================

create or replace function public.mark_wallet_item_seen(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.wallet_items
  set is_seen = true, seen_at = now()
  where id = p_item_id and user_id = auth.uid();
end;
$$;

comment on function public.mark_wallet_item_seen is
  'Marks a wallet_items row seen for the calling user. Only field a client can mutate on wallet_items; all other writes require service_role.';

grant execute on function public.mark_wallet_item_seen(uuid) to authenticated;
