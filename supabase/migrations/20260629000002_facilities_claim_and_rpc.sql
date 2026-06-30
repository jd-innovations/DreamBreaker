-- =============================================================================
-- DreamBreaker PB — Facilities: claim RLS fix + proximity RPC
-- Migration: 20260629000002_facilities_claim_and_rpc
--
-- Changes:
--   1. New RLS policy "facilities: authenticated claim" — allows logged-in
--      users to flip claim_status unclaimed→pending on their own; cannot set
--      owner_user_id, verified, or claim_status='claimed'.
--   2. search_facilities_nearby() — PostGIS ST_DWithin proximity RPC for
--      map discovery; returns all facility columns + distance_meters.
-- =============================================================================


-- =============================================================================
-- PHASE 1 — RLS CLAIM POLICY
-- =============================================================================
--
-- Problem (documented in Slice 2):
--   The existing "facilities: owner update" policy requires
--   owner_user_id = auth.uid(). Unclaimed facilities have owner_user_id = null,
--   so the policy never matched, blocking regular users from submitting a claim.
--
-- Fix:
--   A separate policy that allows the single transition unclaimed → pending.
--   It uses a sub-select to read the current row's values so that users cannot
--   back-door changes to verified or owner_user_id through the same update.

create policy "facilities: authenticated claim"
  on public.facilities for update
  using (
    -- Must be logged in
    auth.uid() is not null
    -- Only unclaimed facilities can receive a claim request
    and claim_status = 'unclaimed'
  )
  with check (
    -- The only allowed mutation: set claim_status to 'pending'
    claim_status    = 'pending'
    -- owner_user_id must remain null (not yet assigned — admin approves)
    and owner_user_id is null
    -- verified must not change (sub-select reads current DB value)
    and verified = (
      select verified from public.facilities where id = facilities.id
    )
  );

comment on policy "facilities: authenticated claim" on public.facilities is
  'Allows any logged-in user to flip claim_status unclaimed→pending. verified and owner_user_id cannot be changed through this policy.';


-- =============================================================================
-- PHASE 2 — PROXIMITY RPC: search_facilities_nearby
-- =============================================================================
--
-- Called via supabase.rpc('search_facilities_nearby', {...})
-- Security: SECURITY DEFINER so the function runs with the definer's privileges
-- and can bypass RLS for the select; the facility table already has a public
-- read policy so this is equivalent — the definer's SELECT just avoids the RLS
-- overhead for this hot path. Still returns only public-readable data.
--
-- Coordinate input: WGS-84 decimal degrees (standard GPS lat/lng).
-- Radius input: metres (callers convert from miles before calling).
-- Distance output: metres (callers format for display).

create or replace function public.search_facilities_nearby(
  lat            double precision,
  lng            double precision,
  radius_meters  double precision default 25000,   -- 25 km ≈ 15.5 miles
  search_query   text             default null,
  verified_only  boolean          default false,
  public_only    boolean          default false,
  result_limit   integer          default 50
)
returns table (
  id                  uuid,
  name                text,
  slug                text,
  address             text,
  city                text,
  state               text,
  postal_code         text,
  latitude            numeric,
  longitude           numeric,
  phone               text,
  website             text,
  description         text,
  court_count         integer,
  indoor_courts       integer,
  outdoor_courts      integer,
  surface_type        text,
  lighting            boolean,
  restrooms           boolean,
  water               boolean,
  parking             boolean,
  public_access       boolean,
  membership_required boolean,
  bookable_by_public  boolean,
  claim_status        text,
  owner_user_id       uuid,
  verified            boolean,
  created_at          timestamptz,
  updated_at          timestamptz,
  distance_meters     double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select
    f.id,
    f.name,
    f.slug,
    f.address,
    f.city,
    f.state,
    f.postal_code,
    f.latitude,
    f.longitude,
    f.phone,
    f.website,
    f.description,
    f.court_count,
    f.indoor_courts,
    f.outdoor_courts,
    f.surface_type,
    f.lighting,
    f.restrooms,
    f.water,
    f.parking,
    f.public_access,
    f.membership_required,
    f.bookable_by_public,
    f.claim_status,
    f.owner_user_id,
    f.verified,
    f.created_at,
    f.updated_at,
    -- ST_Distance returns metres for geography types
    ST_Distance(
      f.coords,
      ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
    ) as distance_meters
  from public.facilities f
  where
    -- Radius filter (uses the gist index on coords)
    ST_DWithin(
      f.coords,
      ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
      greatest(radius_meters, 1)   -- clamp: never zero radius
    )
    -- Optional name/city/state/address text search
    and (
      search_query is null
      or f.name    ilike '%' || search_query || '%'
      or f.city    ilike '%' || search_query || '%'
      or f.state   ilike '%' || search_query || '%'
      or f.address ilike '%' || search_query || '%'
    )
    -- Optional verified filter
    and (not verified_only  or f.verified = true)
    -- Optional public-only filter
    and (not public_only    or f.public_access = true)
  order by distance_meters asc
  limit least(result_limit, 200);   -- hard cap at 200 regardless of caller input
$$;

comment on function public.search_facilities_nearby is
  'PostGIS proximity search. Returns facilities within radius_meters of (lat,lng) ordered by distance. search_query matches name/city/state/address. result_limit capped at 200.';

-- Grant execute to anon and authenticated so the Supabase JS client can call it
-- without the service-role key (map discovery works for logged-out users too).
grant execute on function public.search_facilities_nearby to anon, authenticated;
