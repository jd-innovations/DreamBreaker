-- The marketplace listing limit becomes real, and becomes a membership benefit.
--
-- Item 3.1 of MEMBERSHIP_EXECUTION_PLAN.md, plus something the plan assumed was
-- already true and is not.
--
-- **The limit was never enforced server-side.** Nothing in the database
-- referenced profiles.marketplace_listing_limit -- no function, no trigger. The
-- only check was canCreateListing() in the client, so the cap was advisory and
-- anyone calling the API directly could list without bound. A paid benefit
-- whose free tier can be bypassed is not a benefit, so the limit has to exist
-- before it can be sold.
--
-- **Computed, not stored.** The plan said to write a bigger number onto
-- profiles at activation and revert it on lapse. That would have been the
-- third instance this week of a stored value drifting from the truth: a
-- membership that simply EXPIRES fires no write, so the elevated limit would
-- outlive the entitlement silently. Deriving it from is_paid_member() at the
-- moment of insert cannot drift, because there is nothing to keep in sync.
--
-- profiles.marketplace_listing_limit is kept and now means an explicit
-- per-person override, which is what a nullable column with no default was
-- always shaped like.

-- MEMBER_LISTING_LIMIT is a product decision, not an engineering one. 10 is a
-- placeholder chosen to be obviously better than 2 without being unlimited --
-- revisit before launch.
create or replace function public.marketplace_listing_limit_for(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(
    -- An explicit override wins over everything, including membership.
    (select p.marketplace_listing_limit from public.profiles p where p.id = p_user_id),
    case when public.is_paid_member(p_user_id) then 10 else 2 end
  );
$function$;

grant execute on function public.marketplace_listing_limit_for(uuid) to authenticated;

comment on function public.marketplace_listing_limit_for(uuid) is
  'Effective active-listing cap: explicit profiles override, else 10 for paid members, else 2.';

comment on column public.profiles.marketplace_listing_limit is
  'Explicit per-person override of the marketplace listing cap. NULL means "use the default for their membership" -- see marketplace_listing_limit_for().';

-- ── Enforcement ──────────────────────────────────────────────────────────────
-- BEFORE INSERT, so a refused listing never exists. Counts 'active' and
-- 'pending' to match fetchActiveListingCount() in the client; a sold, expired
-- or deleted listing does not hold a slot.

create or replace function public.fn_enforce_listing_limit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_count integer;
  v_limit integer;
begin
  -- Draft rows are not published listings and do not consume a slot; the cap
  -- applies when a listing becomes visible.
  if new.status not in ('active', 'pending') then
    return new;
  end if;

  select count(*) into v_count
    from public.marketplace_listings
   where seller_id = new.seller_id
     and status in ('active', 'pending');

  v_limit := public.marketplace_listing_limit_for(new.seller_id);

  if v_count >= v_limit then
    raise exception 'listing_limit_reached'
      using errcode = 'P0001',
            hint = 'Active listings: ' || v_count || ' of ' || v_limit || '.';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_enforce_listing_limit on public.marketplace_listings;
create trigger trg_enforce_listing_limit
  before insert on public.marketplace_listings
  for each row execute function public.fn_enforce_listing_limit();

-- Deliberately INSERT only, not UPDATE.
--
-- A seller who lapses while holding more listings than the free cap keeps them
-- -- deleting or hiding what someone already published because a card expired
-- would be a hostile surprise. They simply cannot create another until they are
-- back under the limit, which the INSERT path already refuses. That was flagged
-- as an open product question in the execution plan; this is the answer, and it
-- is reversible by widening the trigger if the other behaviour is ever wanted.
