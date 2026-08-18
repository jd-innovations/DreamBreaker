-- Booking Engine discovery fix: search_facilities_nearby() currently has no
-- way to filter on bookable_by_public (the Booking Engine's actual gate --
-- distinct from public_access, which is about physical public access, not
-- online reservations) and its search_query does not match postal_code.
-- Both gaps were flagged during Booking Engine Phase 2 UI verification.
--
-- Additive only: bookable_only is a new parameter defaulted to false, so
-- every existing caller (onboarding/area-recommendations.tsx,
-- log-session/select-location.tsx, select-home-court.tsx -- all of which
-- pass publicOnly, not bookableOnly) is unaffected.

CREATE OR REPLACE FUNCTION "public"."search_facilities_nearby"(
    "lat" double precision,
    "lng" double precision,
    "radius_meters" double precision DEFAULT 25000,
    "search_query" text DEFAULT NULL::text,
    "verified_only" boolean DEFAULT false,
    "public_only" boolean DEFAULT false,
    "result_limit" integer DEFAULT 50,
    "bookable_only" boolean DEFAULT false
  )
  RETURNS TABLE(
    id uuid, name text, slug text, address text, city text, state text, postal_code text,
    latitude numeric, longitude numeric, phone text, website text, description text,
    court_count integer, indoor_courts integer, outdoor_courts integer, surface_type text,
    lighting boolean, restrooms boolean, water boolean, parking boolean,
    public_access boolean, membership_required boolean, bookable_by_public boolean,
    claim_status text, owner_user_id uuid, verified boolean, created_at timestamptz, updated_at timestamptz,
    distance_meters double precision
  )
  LANGUAGE "sql" STABLE SECURITY DEFINER
  SET "search_path" TO 'public'
  AS $$
  select
    f.id, f.name, f.slug, f.address, f.city, f.state, f.postal_code,
    f.latitude, f.longitude, f.phone, f.website, f.description,
    f.court_count, f.indoor_courts, f.outdoor_courts, f.surface_type,
    f.lighting, f.restrooms, f.water, f.parking,
    f.public_access, f.membership_required, f.bookable_by_public,
    f.claim_status, f.owner_user_id, f.verified, f.created_at, f.updated_at,
    ST_Distance(
      f.coords,
      ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
    ) as distance_meters
  from public.facilities f
  where
    ST_DWithin(
      f.coords,
      ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
      greatest(radius_meters, 1)
    )
    and (
      search_query is null
      or f.name        ilike '%' || search_query || '%'
      or f.city         ilike '%' || search_query || '%'
      or f.state        ilike '%' || search_query || '%'
      or f.postal_code  ilike '%' || search_query || '%'
      or f.address      ilike '%' || search_query || '%'
    )
    and (not verified_only  or f.verified = true)
    and (not public_only    or f.public_access = true)
    and (not bookable_only  or f.bookable_by_public = true)
  order by distance_meters asc
  limit least(result_limit, 200);
$$;
