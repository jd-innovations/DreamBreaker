-- Add a fulfillment filter to search_listings_nearby.
--
-- DROP + CREATE rather than CREATE OR REPLACE: adding a parameter changes the
-- signature, so a replace would define a second overload and leave PostgREST
-- picking between them. Both statements run in one migration, so the swap is
-- atomic and there is no window where the function is missing.
--
-- ── "Offers this", not "is exactly this" ─────────────────────────────────────
-- The parameter asks what the BUYER needs, which is not the same as the
-- listing's stored enum:
--
--   'local_pickup' -> fulfillment IN ('local_pickup', 'both')
--   'shipping'     -> fulfillment IN ('shipping', 'both')
--   NULL           -> no constraint
--
-- A listing marked 'both' satisfies either. Matching the enum exactly would
-- hide every 'both' listing from both filters, which is the opposite of what
-- the seller chose it for.
--
-- This one parameter serves two UI surfaces:
--   * the Handoff filter chips on the browse grid, and
--   * location_settings.willing_to_ship, whose own label reads "Show listings
--     that offer shipping" -- so switching it off is simply
--     fulfillment_filter => 'local_pickup'.

DROP FUNCTION IF EXISTS "public"."search_listings_nearby"(
  double precision, double precision, double precision, text, text, text,
  integer, integer, boolean, integer);

CREATE OR REPLACE FUNCTION "public"."search_listings_nearby"(
    "lat"               double precision,
    "lng"               double precision,
    "radius_meters"     double precision DEFAULT 80467,  -- 50 mi
    "search_query"      text    DEFAULT NULL,
    "brand_filter"      text    DEFAULT NULL,
    "condition_filter"  text    DEFAULT NULL,
    "min_price_cents"   integer DEFAULT NULL,
    "max_price_cents"   integer DEFAULT NULL,
    "include_unlocated" boolean DEFAULT true,
    "result_limit"      integer DEFAULT 100,
    "fulfillment_filter" text   DEFAULT NULL
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
    AND l.location_visibility = 'map'
    AND (
      (
        l.location_coords IS NOT NULL
        AND ST_DWithin(
          l.location_coords,
          ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
          greatest(least(radius_meters, 500000), 1)
        )
      )
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
    -- "Offers this" — 'both' satisfies either side. See the header.
    AND (
      fulfillment_filter IS NULL
      OR l.fulfillment = 'both'
      OR l.fulfillment = fulfillment_filter::marketplace_fulfillment
    )
  ORDER BY (l.location_coords IS NULL), distance_meters ASC NULLS LAST, l.created_at DESC
  LIMIT greatest(least(result_limit, 200), 1);
$$;

COMMENT ON FUNCTION "public"."search_listings_nearby" IS
  'Proximity search for the Marketplace browse grid. SECURITY INVOKER with an explicit status = active filter, so a seller''s own non-active listings never leak in. fulfillment_filter asks what the buyer needs ("offers this"), so a listing marked both satisfies either side. Un-located listings are included by default until every listing carries a pickup coordinate.';

REVOKE ALL ON FUNCTION "public"."search_listings_nearby"(
  double precision, double precision, double precision, text, text, text,
  integer, integer, boolean, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."search_listings_nearby"(
  double precision, double precision, double precision, text, text, text,
  integer, integer, boolean, integer, text) FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."search_listings_nearby"(
  double precision, double precision, double precision, text, text, text,
  integer, integer, boolean, integer, text) TO "authenticated";
