-- Facility Marketplace Phase 3 — a payout account for the business.
--
-- The account belongs to the FACILITY, not to whoever claimed it. A club is a
-- company: its payouts and its 1099-K belong to the company's EIN, not to an
-- individual's SSN. Hanging a venue's revenue off `profiles` would put a
-- business's income under a person's tax identity.
--
-- That is also why this cannot reuse the coach path as-is. The comment on
-- create-connect-onboarding-link reads "One Express account per profile,
-- shared across roles" — right for a person who is both a director and a coach,
-- wrong for a company. A manager who runs three venues needs three accounts,
-- because they are three businesses.
--
-- Stripe's US country spec confirms the shape: verification_fields.company
-- wants company.tax_id, company.owners_provided, a representative with
-- ssn_last_4 and an ID document, and details for every beneficial owner —
-- roughly twice what an individual account collects.
--
-- ── Why a separate table, not columns on `facilities` ───────────────────────
--
-- The first draft added stripe_connect_account_id to `facilities` and protected
-- it with column-level GRANTs, because `facilities: public read` is
-- `using (true)` and RLS filters rows, not columns.
--
-- That breaks the app. lib/supabase/facilities.ts uses
-- `select('*, facility_photos(...)')` in two places, and `*` expands to every
-- column including an ungranted one, so the query fails outright. Enumerating
-- 56 columns in a GRANT would fix today and break the next time anyone writes
-- `select('*')`.
--
-- So the account id lives in its own table with no anon/authenticated access at
-- all. `facilities` keeps only a harmless boolean, `select('*')` keeps working,
-- and the secret is structurally out of reach rather than protected by a list
-- somebody has to maintain.

-- Public, and deliberately dull: "can this venue be paid?" is the same class of
-- fact as "is it bookable". Nothing is leaked by it.
alter table public.facilities
  add column if not exists payouts_ready boolean not null default false;

create table if not exists public.facility_payout_accounts (
  facility_id   uuid primary key references public.facilities(id) on delete cascade,
  stripe_connect_account_id text not null,
  onboarded_at  timestamptz,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- One Stripe account can never back two venues. Without this a copy-paste in
-- an admin tool silently routes one club's money to another's bank.
create unique index if not exists facility_payout_accounts_stripe_key
  on public.facility_payout_accounts (stripe_connect_account_id);

alter table public.facility_payout_accounts enable row level security;

-- No policies for anon or authenticated, on purpose. Reads go through
-- facility_payout_status(); writes are service_role only (the onboarding
-- function and the Stripe webhook). RLS with zero policies denies everyone
-- except service_role, which bypasses it.
drop policy if exists "facility payout accounts: admin read" on public.facility_payout_accounts;
create policy "facility payout accounts: admin read"
  on public.facility_payout_accounts for select using (public.is_admin());

-- ── The guard ────────────────────────────────────────────────────────────────
-- A facility manager legitimately edits their venue, so payouts_ready has to be
-- off-limits: otherwise a manager could flip their own venue to "ready" and
-- take bookings the platform cannot pay out on.
create or replace function public.facilities_guard_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if public.is_admin() then
    return new;
  end if;

  if new.verified is distinct from old.verified then
    raise exception 'facilities: verified is not user-editable';
  end if;

  if new.owner_user_id is distinct from old.owner_user_id then
    raise exception 'facilities: owner_user_id is set by approval, not by update';
  end if;

  -- Set only by the Stripe webhook, which runs as service_role.
  if new.payouts_ready is distinct from old.payouts_ready then
    raise exception 'facilities: payouts_ready reflects Stripe, not user input';
  end if;

  if new.claim_status is distinct from old.claim_status
     and not (old.claim_status = 'unclaimed' and new.claim_status = 'pending') then
    raise exception 'facilities: claim_status transition % -> % requires an admin',
      old.claim_status, new.claim_status;
  end if;

  return new;
end;
$fn$;

-- ── What the manage screen needs ─────────────────────────────────────────────
-- Readiness and permission, without ever handing out the account id.
create or replace function public.facility_payout_status(p_facility_id uuid)
returns table (
  has_account boolean,
  onboarded boolean,
  onboarded_at timestamptz,
  can_manage boolean
)
language sql
stable
security definer
set search_path = public
as $fn$
  select
    a.facility_id is not null,
    a.onboarded_at is not null,
    a.onboarded_at,
    -- Only an owner may start or resume onboarding. A manager runs the courts;
    -- accepting Stripe's terms on behalf of the company is not their call.
    public.is_facility_role_at_least(f.id, auth.uid(), 'owner'::facility_member_role)
  from public.facilities f
  left join public.facility_payout_accounts a on a.facility_id = f.id
  where f.id = p_facility_id;
$fn$;

revoke all on function public.facility_payout_status(uuid) from public;
grant execute on function public.facility_payout_status(uuid) to authenticated;

comment on table public.facility_payout_accounts is
  'A facility''s own Connect account (business_type=company) — never a manager''s personal account, because a club''s payouts belong to its EIN. Deliberately not columns on `facilities`: that table is world-readable and queried with select(*), so the id lives where no client grant reaches it.';
