-- Public discovery for Coach Marketplace on the web (Phase 1, owner-approved
-- 2026-09-23). Mirrors browse_listings/marketplace (20260922160100): read-only
-- functions usable signed out, none exposing anything private about a coach.
--
-- ── What a signed-out visitor may see ───────────────────────────────────────
-- The coach's display name, handle and avatar — the same three fields the
-- player directory already shows publicly — plus the offer itself and the
-- FACILITY it happens at. Never an email, never a payout account, never a
-- coach's private profile fields. A lesson happens at a public venue; that is
-- the location being shown, not where anybody lives. This is also why the web
-- lessons MAP can be public while the marketplace map is signed-in only.
--
-- ── Photos ──────────────────────────────────────────────────────────────────
-- 1 of 27 active offers has an image of its own. Rather than 26 identical
-- placeholders, the card falls back to the FACILITY's primary photo — honest,
-- because that is where the lesson happens — and the web layer falls back
-- again to a typographic card when there is no photo at all (owner decision).
-- That lifted photo coverage on the first page from 1 to 10 of 24.
--
-- ── Pricing ─────────────────────────────────────────────────────────────────
-- Public price is always the headline. premium_price_cents travels alongside
-- so the web can show a member price as a BENEFIT, matching what the app does
-- while browsing, rather than advertising a price most visitors cannot pay.
-- premium_only offers are returned and marked, not hidden: a member-only
-- lesson is a reason to become a member.
--
-- Verified as anon: browse 24 rows of 27, 7 map pins, detail 1 row.

create or replace function public.browse_coach_offers(
  p_search       text default null,
  p_offer_type   text default null,
  p_min_cents    integer default null,
  p_max_cents    integer default null,
  p_city         text default null,
  p_state        text default null,
  p_sort         text default 'newest',
  p_limit        integer default 24,
  p_offset       integer default 0
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
  total_count bigint
)
language sql stable security definer set search_path = '' as $$
  with base as (
    select o.*,
           p.full_name  coach_name,
           p.handle     coach_handle,
           p.avatar_url coach_avatar_url,
           f.name       facility_name,
           f.city       facility_city,
           f.state      facility_state,
           f.latitude::double precision  lat,
           f.longitude::double precision lng,
           coalesce(
             (select i.url from public.coach_offer_images i
               where i.coach_offer_id = o.id order by i.sort_order, i.created_at limit 1),
             (select ph.url from public.facility_photos ph
               where ph.facility_id = o.facility_id
               order by ph.is_primary desc nulls last, ph.created_at limit 1)
           ) photo_url
      from public.coach_offers o
      join public.profiles p on p.id = o.coach_id and p.deleted_at is null
      left join public.facilities f on f.id = o.facility_id
     where o.status = 'active'
       -- Sold out is not discovery. quantity_available null = unlimited.
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
  ), counted as (
    select *, count(*) over () total_count from base
  )
  select c.id, c.title, c.offer_type::text, c.description, c.skill_level_label,
         c.duration_minutes, c.max_participants, c.lessons_included,
         c.regular_price_cents, c.discounted_price_cents,
         c.premium_only, c.premium_price_cents, c.quantity_remaining,
         c.coach_id, c.coach_name, c.coach_handle, c.coach_avatar_url,
         c.facility_id, c.facility_name, c.facility_city, c.facility_state,
         c.lat, c.lng, c.photo_url, c.created_at, c.total_count
    from counted c
   order by
     case when p_sort = 'price_low'  then coalesce(c.discounted_price_cents, c.regular_price_cents) end asc,
     case when p_sort = 'price_high' then coalesce(c.discounted_price_cents, c.regular_price_cents) end desc,
     case when p_sort = 'newest' or p_sort is null then c.created_at end desc,
     c.created_at desc
   limit greatest(least(coalesce(p_limit, 24), 60), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

grant execute on function public.browse_coach_offers(text, text, integer, integer, text, text, text, integer, integer)
  to anon, authenticated;

-- One row per facility that has offers, for the map. Same shape as the
-- directory's pins: a place and a count, never a person.
create or replace function public.coach_offer_map_pins(
  p_lat double precision,
  p_lng double precision,
  p_radius_meters double precision default 80467
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

grant execute on function public.coach_offer_map_pins(double precision, double precision, double precision)
  to anon, authenticated;

-- The detail page. Separate from browse so a direct link works without
-- replaying the filters, and so a sold-out or paused offer can still be
-- explained rather than 404ing on someone who followed a shared link.
create or replace function public.coach_offer_detail(p_id uuid)
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
  photo_url text
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
         )
    from public.coach_offers o
    join public.profiles p on p.id = o.coach_id and p.deleted_at is null
    left join public.facilities f on f.id = o.facility_id
   where o.id = p_id
     -- Draft and archived offers are nobody's business; paused and sold-out
     -- ones are explained by the page instead of vanishing.
     and o.status::text in ('active', 'paused');
$$;

grant execute on function public.coach_offer_detail(uuid) to anon, authenticated;
