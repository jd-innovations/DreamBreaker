-- =============================================================================
-- Marketplace: public pickup location + server-side proximity search
-- =============================================================================
-- Phase 1 of MARKETPLACE_MAP_AUDIT.md (v3). No map, no markers, no clustering.
--
-- Two problems this closes:
--
-- 1. LISTINGS HAD NO USABLE COORDINATE. marketplace/create/index.tsx copied
--    profiles.location_lat/lng onto the listing. Those are written once during
--    onboarding from an ipapi.co IP estimate and never refreshed, so most
--    sellers have none to copy — production has 0 of 2 listings with a
--    coordinate. Distance filtering therefore could not work at all.
--
-- 2. THE COORDINATE CAME FROM THE PERSON, NOT THE PLACE. Even when present, it
--    described the seller rather than where the paddle changes hands, and every
--    listing from one seller pinned to the same point.
--
-- The v3 model (audit §5.2): the app NEVER stores a seller's precise location.
-- A listing carries a PUBLIC PICKUP COORDINATE the seller chose from public
-- options. There is deliberately no precise column here and no second table
-- shadowing one — if precise coordinates are ever genuinely needed they belong
-- in a separate protected table with its own RLS, never beside publicly
-- readable listing rows.
--
-- The client is not trusted with the stored value. The trigger below DERIVES it
-- for facility pickups, and SNAPS it for map-area pickups, so a modified client
-- cannot post an exact house.
-- =============================================================================

-- ── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE "public"."marketplace_pickup_source" AS ENUM (
  'facility',   -- a public court from the facilities directory (preferred)
  'city',       -- a city/ZIP centroid
  'map_area'    -- a point the seller dragged, snapped to a grid before storage
);

CREATE TYPE "public"."marketplace_location_precision" AS ENUM (
  'facility',      -- an actual public place; safe to pin exactly
  'neighborhood',  -- snapped to ~800m
  'city'           -- centroid only; show as an area, never a pin
);

CREATE TYPE "public"."marketplace_fulfillment" AS ENUM (
  'local_pickup', 'shipping', 'both'
);

CREATE TYPE "public"."marketplace_location_visibility" AS ENUM (
  'map',        -- discoverable by distance
  'city_only',  -- city/state text only, excluded from proximity results
  'hidden'      -- no location surfaced at all
);

-- ── Columns ──────────────────────────────────────────────────────────────────
-- All additive and nullable (or defaulted), so existing rows keep working
-- unchanged and no backfill is required.

ALTER TABLE "public"."marketplace_listings"
  ADD COLUMN "pickup_source"       "public"."marketplace_pickup_source",
  ADD COLUMN "pickup_facility_id"  uuid REFERENCES "public"."facilities"("id") ON DELETE SET NULL,
  ADD COLUMN "location_precision"  "public"."marketplace_location_precision",
  ADD COLUMN "location_postal"     text,
  ADD COLUMN "fulfillment"         "public"."marketplace_fulfillment"        NOT NULL DEFAULT 'local_pickup',
  ADD COLUMN "location_visibility" "public"."marketplace_location_visibility" NOT NULL DEFAULT 'map',
  -- Mirrors facilities.coords: a geography column kept in sync by trigger, not
  -- generated, because the value is derived from several inputs.
  ADD COLUMN "location_coords"     geography(Point, 4326);

COMMENT ON COLUMN "public"."marketplace_listings"."location_lat" IS
  'PUBLIC pickup coordinate, not the seller''s location. Derived or snapped server-side by fn_marketplace_sync_listing_location(). Never a precise address.';

-- Partial index: every proximity query filters status = ''active'' first, so the
-- index only needs to cover those rows.
CREATE INDEX "idx_marketplace_listings_coords_active"
  ON "public"."marketplace_listings" USING gist ("location_coords")
  WHERE "status" = 'active';

CREATE INDEX "idx_marketplace_listings_pickup_facility"
  ON "public"."marketplace_listings" ("pickup_facility_id");

-- ── Snapping ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION "public"."fn_snap_coordinate"(
  p_lat double precision,
  p_lng double precision,
  OUT snapped_lat double precision,
  OUT snapped_lng double precision
)
  LANGUAGE "plpgsql" IMMUTABLE
  SET "search_path" TO 'public', 'pg_temp'
  AS $$
DECLARE
  -- ~800 m of latitude. Deliberately a plain grid rather than random jitter:
  -- a random offset recomputed per request is a de-anonymisation vector,
  -- because an observer sampling the same listing repeatedly averages the noise
  -- away and recovers the true point. Snapping is deterministic and idempotent
  -- — snapping an already-snapped value returns it unchanged — so the stored
  -- coordinate is stable for the life of the listing and there is no precise
  -- value anywhere to recover.
  k_grid_deg constant double precision := 0.0072;
  v_lng_cell double precision;
BEGIN
  IF p_lat IS NULL OR p_lng IS NULL THEN
    snapped_lat := NULL;
    snapped_lng := NULL;
    RETURN;
  END IF;

  snapped_lat := round((p_lat / k_grid_deg)::numeric, 0)::double precision * k_grid_deg;

  -- Longitude degrees shrink toward the poles, so widen the cell to keep the
  -- snapped area roughly square on the ground.
  --
  -- Derived from snapped_lat, NOT p_lat. Deriving it from the input latitude
  -- made the function NON-IDEMPOTENT (caught by test, 2026-09-09): once the
  -- latitude snapped, the cell width changed, so re-snapping moved the point
  -- again. The trigger re-snaps on every write, so a listing edited twice would
  -- have walked across the grid — and a walking coordinate leaks position the
  -- same way random jitter does. snapped_lat is exactly on-grid and maps to
  -- itself, which makes the cell width stable and the whole function a fixed
  -- point after one application.
  v_lng_cell := k_grid_deg / greatest(cos(radians(snapped_lat)), 0.01);
  snapped_lng := round((p_lng / v_lng_cell)::numeric, 0)::double precision * v_lng_cell;
END;
$$;

-- ── Write-path trigger ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION "public"."fn_marketplace_sync_listing_location"()
  RETURNS trigger
  LANGUAGE "plpgsql"
  SET "search_path" TO 'public', 'pg_temp'
  AS $$
DECLARE
  v_lat  double precision;
  v_lng  double precision;
  v_snap record;
BEGIN
  -- 1. FACILITY: derive, never accept. Any client-supplied coordinate is
  --    discarded in favour of the facility's own, so a caller cannot claim a
  --    court and then pin somewhere else.
  IF NEW.pickup_source = 'facility' AND NEW.pickup_facility_id IS NOT NULL THEN
    SELECT f.latitude::double precision, f.longitude::double precision
      INTO v_lat, v_lng
      FROM public.facilities f
     WHERE f.id = NEW.pickup_facility_id;

    IF v_lat IS NULL THEN
      RAISE EXCEPTION 'pickup_facility_id % has no coordinates', NEW.pickup_facility_id;
    END IF;

    NEW.location_lat := v_lat;
    NEW.location_lng := v_lng;
    NEW.location_precision := 'facility';

  -- 2. MAP AREA: re-snap unconditionally. The client snaps first so the precise
  --    value never crosses the network (and so never reaches Postgres statement
  --    logs as a parameter); this makes that a no-op for honest clients and a
  --    correction for modified ones.
  ELSIF NEW.pickup_source = 'map_area' THEN
    v_snap := public.fn_snap_coordinate(NEW.location_lat, NEW.location_lng);
    NEW.location_lat := v_snap.snapped_lat;
    NEW.location_lng := v_snap.snapped_lng;
    NEW.location_precision := 'neighborhood';

  -- 3. CITY: a centroid is already coarse. Snap anyway so a caller cannot pass
  --    a precise point while claiming city precision.
  ELSIF NEW.pickup_source = 'city' THEN
    v_snap := public.fn_snap_coordinate(NEW.location_lat, NEW.location_lng);
    NEW.location_lat := v_snap.snapped_lat;
    NEW.location_lng := v_snap.snapped_lng;
    NEW.location_precision := 'city';
  END IF;

  -- 4. Keep the geography column in sync, same pattern as facilities.coords.
  IF NEW.location_lat IS NOT NULL AND NEW.location_lng IS NOT NULL THEN
    NEW.location_coords := ST_SetSRID(ST_MakePoint(NEW.location_lng, NEW.location_lat), 4326)::geography;
  ELSE
    NEW.location_coords := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER "trg_marketplace_sync_listing_location"
  BEFORE INSERT OR UPDATE OF pickup_source, pickup_facility_id, location_lat, location_lng
  ON "public"."marketplace_listings"
  FOR EACH ROW EXECUTE FUNCTION "public"."fn_marketplace_sync_listing_location"();

-- ── Proximity search ─────────────────────────────────────────────────────────
-- Shape copied from search_facilities_nearby (20260810005233): ST_DWithin over
-- a GiST-indexed geography column, ordered by ST_Distance.
--
-- SECURITY INVOKER, deliberately. search_facilities_nearby is DEFINER because
-- facilities are world-readable; listings are not, and a DEFINER function here
-- would have to re-implement the RLS predicate correctly forever. As INVOKER,
-- RLS still applies as a backstop AND the explicit status filter below is the
-- primary gate — belt and braces rather than either alone.
--
-- Note the explicit status = 'active': RLS permits `status = 'active' OR
-- seller_id = auth.uid()`, so without this a seller would see their own sold
-- and deleted listings mixed into the browse grid.

CREATE OR REPLACE FUNCTION "public"."search_listings_nearby"(
    "lat"             double precision,
    "lng"             double precision,
    "radius_meters"   double precision DEFAULT 80467,  -- 50 mi
    "search_query"    text    DEFAULT NULL,
    "brand_filter"    text    DEFAULT NULL,
    "condition_filter" text   DEFAULT NULL,
    "min_price_cents" integer DEFAULT NULL,
    "max_price_cents" integer DEFAULT NULL,
    "include_unlocated" boolean DEFAULT true,
    "result_limit"    integer DEFAULT 100
  )
  RETURNS TABLE(
    id uuid, seller_id uuid, brand text, model text, title text,
    condition marketplace_condition, asking_price_cents integer,
    min_offer_cents integer, description text, status marketplace_listing_status,
    location_city text, location_state text,
    location_lat double precision, location_lng double precision,
    location_precision marketplace_location_precision,
    fulfillment marketplace_fulfillment,
    pickup_facility_id uuid,
    created_at timestamptz, updated_at timestamptz,
    distance_meters double precision
  )
  LANGUAGE "sql" STABLE SECURITY INVOKER
  SET "search_path" TO 'public', 'pg_temp'
  AS $$
  SELECT
    l.id, l.seller_id, l.brand, l.model, l.title,
    l.condition, l.asking_price_cents,
    l.min_offer_cents, l.description, l.status,
    l.location_city, l.location_state,
    l.location_lat, l.location_lng,
    l.location_precision,
    l.fulfillment,
    l.pickup_facility_id,
    l.created_at, l.updated_at,
    CASE
      WHEN l.location_coords IS NULL THEN NULL
      ELSE ST_Distance(l.location_coords, ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography)
    END AS distance_meters
  FROM public.marketplace_listings l
  WHERE
    l.status = 'active'
    -- city_only and hidden opt out of proximity discovery entirely.
    AND l.location_visibility = 'map'
    AND (
      -- Located and inside the radius...
      (
        l.location_coords IS NOT NULL
        AND ST_DWithin(
          l.location_coords,
          ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
          greatest(least(radius_meters, 500000), 1)   -- clamp: 1 m .. 500 km
        )
      )
      -- ...or un-located, and the caller still wants those.
      --
      -- Phase 0 (§4.2) established this: excluding coordinate-less listings
      -- emptied the grid, because no listing had a coordinate. It stays until
      -- every listing carries a pickup location, then the caller can pass
      -- include_unlocated => false.
      OR (include_unlocated AND l.location_coords IS NULL)
    )
    AND (search_query IS NULL OR (
          l.title ilike '%' || search_query || '%'
       OR l.brand ilike '%' || search_query || '%'
       OR l.model ilike '%' || search_query || '%'))
    AND (brand_filter     IS NULL OR l.brand = brand_filter)
    AND (condition_filter IS NULL OR l.condition = condition_filter::marketplace_condition)
    AND (min_price_cents  IS NULL OR l.asking_price_cents >= min_price_cents)
    AND (max_price_cents  IS NULL OR l.asking_price_cents <= max_price_cents)
  -- Located rows first, nearest to furthest; un-located rows last, newest first.
  ORDER BY (l.location_coords IS NULL), distance_meters ASC NULLS LAST, l.created_at DESC
  LIMIT greatest(least(result_limit, 200), 1);   -- server-enforced ceiling
$$;

COMMENT ON FUNCTION "public"."search_listings_nearby" IS
  'Proximity search for the Marketplace browse grid. SECURITY INVOKER with an explicit status = active filter, so a seller''s own non-active listings never leak in. Un-located listings are included by default until every listing carries a pickup coordinate.';

REVOKE ALL ON FUNCTION "public"."search_listings_nearby"(
  double precision, double precision, double precision, text, text, text,
  integer, integer, boolean, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."search_listings_nearby"(
  double precision, double precision, double precision, text, text, text,
  integer, integer, boolean, integer) FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."search_listings_nearby"(
  double precision, double precision, double precision, text, text, text,
  integer, integer, boolean, integer) TO "authenticated";

-- ── anon column grants ───────────────────────────────────────────────────────
-- 20260908120000 replaced anon's table grant with an explicit column list, so
-- the columns added above are already unreadable by anon and stay that way.
-- Nothing to grant: the public share page (web/src/lib/og/fetchers.ts) needs
-- none of them. This comment exists so the next person does not "fix" the
-- omission.
