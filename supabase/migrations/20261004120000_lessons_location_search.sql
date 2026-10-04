-- Lessons: location-aware discovery, "travels to you", and the test-coach leak
-- (owner-approved 2026-10-04).
--
-- ── Where a lesson is ───────────────────────────────────────────────────────
-- A lesson happens at a FACILITY (facility_id, as before), or the coach TRAVELS
-- to you from a home base CITY within travel_radius_miles, or both. The home
-- base is a city, never an address: it is placed at the average position of
-- that city's courts (private.directory_city_centroids, the players map's rule).
--
-- A lesson must have one or the other — enforced when it is published or its
-- location is edited (trigger below), not as a table constraint, so the four
-- existing lessons without a location keep working through purchases and
-- admin actions. They appear only under "Anywhere" until the coach adds one.
--
-- ── Matching "near me" ──────────────────────────────────────────────────────
-- With a position and a radius: a facility lesson qualifies when the facility
-- is inside the buyer's radius; a travel lesson qualifies when the BUYER is
-- inside the coach's travel range (the coach's range decides). distance_miles
-- is the nearer of the two; "nearest" sorts on it. The position is used for
-- this query only and stored nowhere.
--
-- ── Test coaches ────────────────────────────────────────────────────────────
-- coach_status 'test_ready' is a development fixture with no payout account
-- (13 coaches, 25 of the 27 active lessons). The mobile production build has
-- hidden them since 6.x; these public functions never did, so the web lessons
-- page listed them to everyone. Now only 'active' coaches show unless the
-- caller passes p_include_test — the internal mobile build does, for QA.
-- Showing a fixture is harmless; the param exists so internal QA keeps its
-- data. (Purchases from a fixture coach are a separate, flagged issue.)

-- ─── Columns ────────────────────────────────────────────────────────────────

alter table public.coach_offers
  add column if not exists travel_base_city text,
  add column if not exists travel_base_state text,
  add column if not exists travel_radius_miles integer;

alter table public.coach_offers
  add constraint coach_offers_travel_radius_allowed
    check (travel_radius_miles is null or travel_radius_miles in (5, 10, 15, 25)),
  -- All three together, or none.
  add constraint coach_offers_travel_complete
    check ((travel_radius_miles is null) = (nullif(btrim(travel_base_city), '') is null)
       and (travel_radius_miles is null) = (nullif(btrim(travel_base_state), '') is null));

comment on column public.coach_offers.travel_base_city is
  'Travels to you: the coach''s home base CITY (never an address), placed at its courts'' centroid. With travel_base_state and travel_radius_miles, or all null.';

-- ─── Location required on publish / location edit ───────────────────────────

create or replace function private.travel_base_point(p_city text, p_state text)
returns table (lat double precision, lng double precision)
language sql stable set search_path = '' as $$
  select c.lat, c.lng from private.directory_city_centroids() c
   where c.key = lower(btrim(p_city)) || '|' || lower(btrim(coalesce(p_state, '')));
$$;

revoke all on function private.travel_base_point(text, text) from public;

create or replace function public.fn_coach_offer_location_required()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status::text <> 'active' then return new; end if;
  -- Only on publish or a location change; never on a purchase decrement or an
  -- admin status change to an already-active legacy row.
  if tg_op = 'UPDATE'
     and old.status::text = 'active'
     and new.facility_id is not distinct from old.facility_id
     and new.travel_base_city is not distinct from old.travel_base_city
     and new.travel_base_state is not distinct from old.travel_base_state
     and new.travel_radius_miles is not distinct from old.travel_radius_miles then
    return new;
  end if;

  if new.facility_id is not null then return new; end if;
  if new.travel_radius_miles is not null then
    if exists (select 1 from private.travel_base_point(new.travel_base_city, new.travel_base_state)) then
      return new;
    end if;
    raise exception 'We couldn''t place %, %. Pick a nearby city that has courts.', new.travel_base_city, new.travel_base_state
      using errcode = '22023';
  end if;
  raise exception 'Choose where this lesson happens: a facility, a travel area, or both.'
    using errcode = '22023';
end;
$$;

drop trigger if exists trg_coach_offer_location_required on public.coach_offers;
create trigger trg_coach_offer_location_required
  before insert or update of status, facility_id, travel_base_city, travel_base_state, travel_radius_miles
  on public.coach_offers
  for each row execute function public.fn_coach_offer_location_required();

-- ─── Browse ─────────────────────────────────────────────────────────────────

drop function if exists public.browse_coach_offers(text, text, integer, integer, text, text, text, integer, integer);

create function public.browse_coach_offers(
  p_search       text default null,
  p_offer_type   text default null,
  p_min_cents    integer default null,
  p_max_cents    integer default null,
  p_city         text default null,
  p_state        text default null,
  p_sort         text default 'newest',   -- newest | price_low | price_high | nearest
  p_limit        integer default 24,
  p_offset       integer default 0,
  p_lat          double precision default null,
  p_lng          double precision default null,
  p_radius_miles double precision default null,  -- null = anywhere
  p_include_test boolean default false
)
returns table (
  id uuid,
  title text,
  offer_type text,
  description text,
  skill_level_label text,
  duration_minutes integer,
  max_participants integer,
  lessons_included integer,
  regular_price_cents integer,
  discounted_price_cents integer,
  premium_only boolean,
  premium_price_cents integer,
  quantity_remaining integer,
  coach_id uuid,
  coach_name text,
  coach_handle text,
  coach_avatar_url text,
  facility_id uuid,
  facility_name text,
  city text,
  state text,
  latitude double precision,
  longitude double precision,
  photo_url text,
  created_at timestamptz,
  travel_base_city text,
  travel_base_state text,
  travel_radius_miles integer,
  distance_miles double precision,
  total_count bigint
)
language sql stable security definer set search_path = '' as $$
  with me as (
    select case when p_lat is not null and p_lng is not null
                then public.st_setsrid(public.st_makepoint(p_lng, p_lat), 4326)::public.geography end as pt
  ),
  base as (
    select o.*,
           p.full_name coach_name, p.handle coach_handle, p.avatar_url coach_avatar_url,
           f.name facility_name, f.city facility_city, f.state facility_state,
           f.latitude::double precision lat, f.longitude::double precision lng,
           coalesce(
             (select i.url from public.coach_offer_images i
               where i.coach_offer_id = o.id order by i.sort_order, i.created_at limit 1),
             (select ph.url from public.facility_photos ph
               where ph.facility_id = o.facility_id
               order by ph.is_primary desc nulls last, ph.created_at limit 1)
           ) photo_url,
           -- Miles from the buyer to the facility, and to the travel base.
           case when me.pt is not null and f.latitude is not null and f.longitude is not null
                then public.st_distance(me.pt,
                       public.st_setsrid(public.st_makepoint(f.longitude, f.latitude), 4326)::public.geography) / 1609.344
           end as fac_mi,
           case when me.pt is not null and o.travel_radius_miles is not null and tb.lat is not null
                then public.st_distance(me.pt,
                       public.st_setsrid(public.st_makepoint(tb.lng, tb.lat), 4326)::public.geography) / 1609.344
           end as base_mi
      from public.coach_offers o
      cross join me
      join public.profiles p on p.id = o.coach_id and p.deleted_at is null
      left join public.facilities f on f.id = o.facility_id
      left join lateral private.travel_base_point(o.travel_base_city, o.travel_base_state) tb on true
     where o.status = 'active'
       and o.removed_at is null
       and (p.coach_status = 'active' or (coalesce(p_include_test, false) and p.coach_status = 'test_ready'))
       and (o.quantity_available is null or coalesce(o.quantity_remaining, 0) > 0)
       and (p_offer_type is null or o.offer_type::text = p_offer_type)
       and (p_min_cents is null or coalesce(o.discounted_price_cents, o.regular_price_cents) >= p_min_cents)
       and (p_max_cents is null or coalesce(o.discounted_price_cents, o.regular_price_cents) <= p_max_cents)
       and (p_city is null or f.city ilike p_city)
       and (p_state is null or f.state ilike p_state)
       and (
         p_search is null or btrim(p_search) = '' or
         o.title ilike '%' || btrim(p_search) || '%' or
         o.description ilike '%' || btrim(p_search) || '%' or
         p.full_name ilike '%' || btrim(p_search) || '%' or
         f.name ilike '%' || btrim(p_search) || '%'
       )
  ),
  located as (
    select b.*,
           case when b.fac_mi is not null and b.base_mi is not null then least(b.fac_mi, b.base_mi)
                else coalesce(b.fac_mi, b.base_mi) end as dist_mi
      from base b
     where p_radius_miles is null or (select pt from me) is null
        or (b.fac_mi is not null and b.fac_mi <= p_radius_miles)
        or (b.base_mi is not null and b.base_mi <= b.travel_radius_miles)
  ),
  counted as (
    select *, count(*) over () total_count from located
  )
  select c.id, c.title, c.offer_type::text, c.description, c.skill_level_label,
         c.duration_minutes, c.max_participants, c.lessons_included,
         c.regular_price_cents, c.discounted_price_cents,
         c.premium_only, c.premium_price_cents, c.quantity_remaining,
         c.coach_id, c.coach_name, c.coach_handle, c.coach_avatar_url,
         c.facility_id, c.facility_name, c.facility_city, c.facility_state,
         c.lat, c.lng, c.photo_url, c.created_at,
         c.travel_base_city, c.travel_base_state, c.travel_radius_miles,
         round(c.dist_mi::numeric, 1)::double precision, c.total_count
    from counted c
   order by
     case when p_sort = 'nearest'    then c.dist_mi end asc nulls last,
     case when p_sort = 'price_low'  then coalesce(c.discounted_price_cents, c.regular_price_cents) end asc,
     case when p_sort = 'price_high' then coalesce(c.discounted_price_cents, c.regular_price_cents) end desc,
     case when p_sort = 'newest' or p_sort is null then c.created_at end desc,
     c.created_at desc
   limit greatest(least(coalesce(p_limit, 24), 60), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.browse_coach_offers(text, text, integer, integer, text, text, text, integer, integer, double precision, double precision, double precision, boolean) from public;
grant execute on function public.browse_coach_offers(text, text, integer, integer, text, text, text, integer, integer, double precision, double precision, double precision, boolean)
  to anon, authenticated;

-- ─── Map pins: same coach rule ──────────────────────────────────────────────

drop function if exists public.coach_offer_map_pins(double precision, double precision, double precision);

create function public.coach_offer_map_pins(
  p_lat double precision,
  p_lng double precision,
  p_radius_meters double precision default 80467,
  p_include_test boolean default false
)
returns table (
  facility_id uuid,
  facility_name text,
  city text,
  state text,
  latitude double precision,
  longitude double precision,
  offer_count integer,
  min_price_cents integer
)
language sql stable security definer set search_path = '' as $$
  select f.id, f.name, f.city, f.state,
         f.latitude::double precision, f.longitude::double precision,
         count(*)::integer,
         min(coalesce(o.discounted_price_cents, o.regular_price_cents))::integer
    from public.coach_offers o
    join public.facilities f on f.id = o.facility_id
    join public.profiles p on p.id = o.coach_id and p.deleted_at is null
   where o.status = 'active'
     and o.removed_at is null
     and (p.coach_status = 'active' or (coalesce(p_include_test, false) and p.coach_status = 'test_ready'))
     and (o.quantity_available is null or coalesce(o.quantity_remaining, 0) > 0)
     and f.latitude is not null and f.longitude is not null
     and public.st_dwithin(
           public.st_setsrid(public.st_makepoint(f.longitude, f.latitude), 4326)::public.geography,
           public.st_setsrid(public.st_makepoint(p_lng, p_lat), 4326)::public.geography,
           greatest(least(coalesce(p_radius_meters, 80467), 500000), 1))
   group by f.id, f.name, f.city, f.state, f.latitude, f.longitude
   order by count(*) desc, f.name
   limit 300;
$$;

revoke all on function public.coach_offer_map_pins(double precision, double precision, double precision, boolean) from public;
grant execute on function public.coach_offer_map_pins(double precision, double precision, double precision, boolean)
  to anon, authenticated;

-- ─── Detail: carries the travel area ────────────────────────────────────────
-- Unchanged visibility (a shared link to a fixture's lesson still explains
-- itself); only the travel fields are added.

drop function if exists public.coach_offer_detail(uuid);

create function public.coach_offer_detail(p_id uuid)
returns table (
  id uuid,
  title text,
  offer_type text,
  description text,
  terms text,
  skill_level_label text,
  duration_minutes integer,
  max_participants integer,
  lessons_included integer,
  regular_price_cents integer,
  discounted_price_cents integer,
  premium_only boolean,
  premium_price_cents integer,
  quantity_remaining integer,
  purchase_limit_per_customer integer,
  status text,
  coach_id uuid,
  coach_name text,
  coach_handle text,
  coach_avatar_url text,
  coach_bio text,
  facility_id uuid,
  facility_name text,
  facility_address text,
  city text,
  state text,
  latitude double precision,
  longitude double precision,
  photo_url text,
  travel_base_city text,
  travel_base_state text,
  travel_radius_miles integer
)
language sql stable security definer set search_path = '' as $$
  select o.id, o.title, o.offer_type::text, o.description, o.terms, o.skill_level_label,
         o.duration_minutes, o.max_participants, o.lessons_included,
         o.regular_price_cents, o.discounted_price_cents,
         o.premium_only, o.premium_price_cents, o.quantity_remaining,
         o.purchase_limit_per_customer, o.status::text,
         o.coach_id, p.full_name, p.handle, p.avatar_url, p.bio,
         o.facility_id, f.name, f.address, f.city, f.state,
         f.latitude::double precision, f.longitude::double precision,
         coalesce(
           (select i.url from public.coach_offer_images i
             where i.coach_offer_id = o.id order by i.sort_order, i.created_at limit 1),
           (select ph.url from public.facility_photos ph
             where ph.facility_id = o.facility_id
             order by ph.is_primary desc nulls last, ph.created_at limit 1)
         ),
         o.travel_base_city, o.travel_base_state, o.travel_radius_miles
    from public.coach_offers o
    join public.profiles p on p.id = o.coach_id and p.deleted_at is null
    left join public.facilities f on f.id = o.facility_id
   where o.id = p_id
     and o.removed_at is null
     and o.status::text in ('active', 'paused');
$$;

revoke all on function public.coach_offer_detail(uuid) from public;
grant execute on function public.coach_offer_detail(uuid) to anon, authenticated;
