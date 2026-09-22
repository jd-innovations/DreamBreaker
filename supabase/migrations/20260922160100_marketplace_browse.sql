-- Public marketplace browsing for the web (/marketplace).
--
-- An anonymous visitor may read nine listing columns (20260908120000,
-- 20260916160000) and search_listings_nearby is closed to anon — rightly: it
-- returns seller_id, min_offer_cents and coordinates. These two functions are
-- the public read path instead. SECURITY DEFINER so they can read brand, model
-- and created_at — owner decision 2026-09-22: a paddle's brand and model are the
-- first thing a buyer looks for, and "listed on" is a date, not a timestamp.
--
-- What they NEVER return: seller_id, min_offer_cents, any location_* beyond
-- city/state, pickup_facility_id, postal code. The map (signed-in only, owner
-- decision 2026-09-22) uses search_listings_nearby under the viewer's session,
-- exactly as the app does, so coordinates never reach an anonymous visitor.
--
-- Listed: status = 'active', not past expires_at (the sweeper runs every 15
-- minutes; this closes that gap), not removed by an admin. Same visibility as
-- the public-read RLS policy, plus those two checks.
--
-- Fulfillment filter matches search_listings_nearby: 'both' satisfies either.

create or replace function public.browse_listings(
  p_search text default null,
  p_brand text default null,
  p_condition text default null,
  p_min_cents integer default null,
  p_max_cents integer default null,
  p_fulfillment text default null,
  p_state text default null,
  p_sort text default 'newest',
  p_limit integer default 24,
  p_offset integer default 0
)
returns table (
  id uuid,
  title text,
  brand text,
  model text,
  condition text,
  asking_price_cents integer,
  fulfillment text,
  location_city text,
  location_state text,
  listed_on date,
  photo_url text,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    l.id, l.title, l.brand, l.model, l.condition::text, l.asking_price_cents,
    l.fulfillment::text, l.location_city, l.location_state,
    (l.created_at at time zone 'UTC')::date,
    (select ph.url from public.marketplace_listing_photos ph
      where ph.listing_id = l.id order by ph.sort_order, ph.created_at limit 1),
    count(*) over ()
  from public.marketplace_listings l
  where l.status = 'active'
    and l.removed_at is null
    and (l.expires_at is null or l.expires_at > now())
    and (nullif(btrim(p_search), '') is null
         or l.title ilike '%' || btrim(p_search) || '%'
         or l.brand ilike '%' || btrim(p_search) || '%'
         or l.model ilike '%' || btrim(p_search) || '%')
    and (nullif(p_brand, '') is null or l.brand = p_brand)
    and (nullif(p_condition, '') is null or l.condition::text = p_condition)
    and (p_min_cents is null or l.asking_price_cents >= p_min_cents)
    and (p_max_cents is null or l.asking_price_cents <= p_max_cents)
    and (nullif(p_fulfillment, '') is null
         or l.fulfillment::text = 'both'
         or l.fulfillment::text = p_fulfillment)
    and (nullif(p_state, '') is null or l.location_state = p_state)
  order by
    case when p_sort = 'price_asc'  then l.asking_price_cents end asc,
    case when p_sort = 'price_desc' then l.asking_price_cents end desc,
    l.created_at desc,
    l.id
  limit least(greatest(coalesce(p_limit, 24), 1), 60)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- The brands and states that currently have something listed — the filter
-- dropdowns offer only choices that can return a result.
create or replace function public.browse_listing_filters()
returns table (brands text[], states text[])
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(array_agg(distinct l.brand order by l.brand) filter (where nullif(l.brand, '') is not null), '{}'),
    coalesce(array_agg(distinct l.location_state order by l.location_state) filter (where nullif(l.location_state, '') is not null), '{}')
  from public.marketplace_listings l
  where l.status = 'active'
    and l.removed_at is null
    and (l.expires_at is null or l.expires_at > now());
$$;

revoke all on function public.browse_listings(text, text, text, integer, integer, text, text, text, integer, integer) from public;
revoke all on function public.browse_listing_filters() from public;
grant execute on function public.browse_listings(text, text, text, integer, integer, text, text, text, integer, integer) to anon, authenticated;
grant execute on function public.browse_listing_filters() to anon, authenticated;
