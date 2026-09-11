-- Paid membership entitlement.
--
-- Phase 2 of MEMBERSHIP_EXECUTION_PLAN.md. Nothing here knows about Apple, and
-- that is the point: entitlement is stored and read the same way whether it was
-- bought through StoreKit, bought on the web through Stripe, or comped by an
-- admin. Phase 5 adds a purchase path and changes only how a row gets created.
--
-- A TABLE rather than columns on profiles: renewals, lapses and comps are a
-- history, and every one of them is a question someone will ask later. profiles
-- is also a ~23-column hand-written INSERT inside fn_handle_new_user() which
-- silently stops populating a column the moment it is reshaped -- that trigger
-- 500'd every signup for 14 days in August for exactly that reason.
--
-- 2.2's admin grant is the item that unblocks the rest of the plan: it lets the
-- listing limit, coach member pricing and the PGD voucher all be built and
-- tested before any StoreKit work exists.

create table if not exists public.memberships (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,

  tier         text not null default 'plus',
  status       text not null default 'active',

  started_at   timestamptz not null default now(),
  -- Null means no expiry. Only reachable through an admin comp; a purchased
  -- membership always carries the date its term ends.
  expires_at   timestamptz,

  source       text not null,
  -- Apple's original_transaction_id, Stripe's subscription id, or null for a
  -- comp. What makes a renewal recognisable as the same membership later.
  external_reference_id text,

  granted_by    uuid references public.profiles(id),
  granted_note  text,
  revoked_by    uuid references public.profiles(id),
  revoked_at    timestamptz,
  revoke_reason text,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint memberships_tier_check   check (tier in ('plus')),
  constraint memberships_status_check check (status in ('active', 'expired', 'revoked')),
  constraint memberships_source_check check (source in ('iap', 'stripe', 'admin_grant'))
);

-- One active membership per person. A renewal updates the row or supersedes it;
-- it never stacks, and two active rows would make is_paid_member() ambiguous
-- about which expiry governs.
create unique index if not exists idx_memberships_one_active
  on public.memberships (user_id)
  where status = 'active';

create index if not exists idx_memberships_user on public.memberships (user_id);

drop trigger if exists trg_memberships_updated_at on public.memberships;
create trigger trg_memberships_updated_at
  before update on public.memberships
  for each row execute function public.fn_set_updated_at();

comment on table public.memberships is
  'Paid membership entitlement. Written only by SECURITY DEFINER functions; the client reads and never writes.';

-- ── RLS: read-only for the owner, read-only for admins ───────────────────────
-- Same posture as wallet_items. No insert/update/delete policy for anyone, so
-- every write goes through a function whose grants are scoped deliberately.

alter table public.memberships enable row level security;

drop policy if exists "memberships: user read own" on public.memberships;
create policy "memberships: user read own"
  on public.memberships for select
  using (user_id = (select auth.uid()));

drop policy if exists "memberships: admin read" on public.memberships;
create policy "memberships: admin read"
  on public.memberships for select
  using (public.is_admin());

-- ── is_paid_member ───────────────────────────────────────────────────────────
-- Mirrors is_admin() exactly: STABLE, SECURITY DEFINER, usable from RLS
-- policies and from other functions. Defaults to the caller so
-- `is_paid_member()` reads naturally at a call site.
--
-- Expiry is evaluated here rather than trusted from `status`, because nothing
-- sweeps expired rows -- the same lag that let a redeemed voucher keep claiming
-- to be active. A row whose expires_at has passed is not a member, whatever the
-- column says.

create or replace function public.is_paid_member(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select exists (
    select 1 from public.memberships m
     where m.user_id = p_user_id
       and m.status = 'active'
       and (m.expires_at is null or m.expires_at > now())
  );
$function$;

grant execute on function public.is_paid_member(uuid) to authenticated;

-- ── admin_grant_membership ───────────────────────────────────────────────────
-- Granted to `authenticated`, not service_role: is_admin() reads auth.uid(),
-- which is NULL under a service-role client. Same lesson as
-- admin_grant_wallet_item.

create or replace function public.admin_grant_membership(
  p_user_id    uuid,
  p_expires_at timestamptz default null,
  p_note       text        default null
)
returns public.memberships
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.memberships;
begin
  if not public.is_admin() then
    raise exception 'admin_only' using errcode = 'P0001';
  end if;

  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'expires_at_in_past' using errcode = 'P0001';
  end if;

  -- Extending an existing membership rather than stacking a second one. The
  -- partial unique index would reject the insert anyway; handling it here makes
  -- "grant again to extend" the behaviour instead of an error.
  update public.memberships
     set expires_at   = p_expires_at,
         granted_by   = auth.uid(),
         granted_note = coalesce(p_note, granted_note),
         updated_at   = now()
   where user_id = p_user_id and status = 'active'
   returning * into v_row;

  if found then
    return v_row;
  end if;

  insert into public.memberships (user_id, source, expires_at, granted_by, granted_note)
  values (p_user_id, 'admin_grant', p_expires_at, auth.uid(), p_note)
  returning * into v_row;

  return v_row;
end;
$function$;

revoke execute on function public.admin_grant_membership(uuid, timestamptz, text) from public, anon;
grant execute on function public.admin_grant_membership(uuid, timestamptz, text) to authenticated;

-- ── admin_revoke_membership ──────────────────────────────────────────────────

create or replace function public.admin_revoke_membership(
  p_user_id uuid,
  p_reason  text default null
)
returns public.memberships
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.memberships;
begin
  if not public.is_admin() then
    raise exception 'admin_only' using errcode = 'P0001';
  end if;

  -- Revoked, never deleted: what someone was given and when it was taken away
  -- is exactly the history this table exists to keep.
  update public.memberships
     set status        = 'revoked',
         revoked_by    = auth.uid(),
         revoked_at    = now(),
         revoke_reason = p_reason,
         updated_at    = now()
   where user_id = p_user_id and status = 'active'
   returning * into v_row;

  if not found then
    raise exception 'no_active_membership' using errcode = 'P0001';
  end if;

  return v_row;
end;
$function$;

revoke execute on function public.admin_revoke_membership(uuid, text) from public, anon;
grant execute on function public.admin_revoke_membership(uuid, text) to authenticated;
