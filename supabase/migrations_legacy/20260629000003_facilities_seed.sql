-- =============================================================================
-- DreamBreaker PB — Facilities Directory: Sarasota / Bradenton / LWR Seed
-- Migration: 20260629000003_facilities_seed
--
-- 16 real pickleball facilities in the target market.
-- Idempotent: ON CONFLICT (slug) DO NOTHING — safe to re-run.
-- verified = true on all rows (admin-curated seed data).
-- Coordinates are GPS decimal degrees; verify against Google Maps before
-- using in production navigation.
--
-- Access type breakdown:
--   Public (public_access=true,  membership_required=false): 9 facilities
--   Membership (public_access=true,  membership_required=true): 3 facilities
--   Private   (public_access=false, membership_required=true): 4 facilities
-- =============================================================================

insert into public.facilities (
  name, slug, address, city, state, postal_code,
  latitude, longitude,
  court_count, indoor_courts, outdoor_courts,
  surface_type, lighting, restrooms, water, parking,
  public_access, membership_required, bookable_by_public,
  verified, claim_status
) values

-- ══════════════════════════════════════════════════════════════════════════════
-- PUBLIC — open to all, no membership required
-- ══════════════════════════════════════════════════════════════════════════════

(
  'Payne Park Pickleball Center',
  'payne-park-pickleball-center-sarasota-fl',
  '2010 Adams Ln',
  'Sarasota', 'FL', '34237',
  27.33091, -82.52584,
  12, 0, 12,
  'hard', true, true, true, true,
  true, false, false,
  true, 'unclaimed'
),

(
  'G.T. Bray Park Pickleball',
  'gt-bray-park-pickleball-bradenton-fl',
  '5502 33rd Ave Dr W',
  'Bradenton', 'FL', '34209',
  27.47978, -82.58812,
  8, 0, 8,
  'hard', true, true, true, true,
  true, false, false,
  true, 'unclaimed'
),

(
  'Nathan Benderson Park',
  'nathan-benderson-park-sarasota-fl',
  '5851 Nathan Benderson Cir',
  'Sarasota', 'FL', '34235',
  27.37268, -82.46929,
  6, 0, 6,
  'hard', false, true, true, true,
  true, false, false,
  true, 'unclaimed'
),

(
  'Braden River Park Pickleball',
  'braden-river-park-pickleball-bradenton-fl',
  '4909 63rd Ave E',
  'Bradenton', 'FL', '34203',
  27.43512, -82.49876,
  6, 0, 6,
  'hard', true, true, true, true,
  true, false, false,
  true, 'unclaimed'
),

(
  'Laurel Park Pickleball Courts',
  'laurel-park-pickleball-nokomis-fl',
  '300 Laurel Rd E',
  'Nokomis', 'FL', '34275',
  27.11843, -82.43291,
  4, 0, 4,
  'hard', false, true, false, true,
  true, false, false,
  true, 'unclaimed'
),

(
  'Fruitville Initiative Park',
  'fruitville-initiative-park-sarasota-fl',
  '6350 Fruitville Rd',
  'Sarasota', 'FL', '34232',
  27.34456, -82.44129,
  8, 0, 8,
  'hard', true, true, true, true,
  true, false, false,
  true, 'unclaimed'
),

(
  'Premier Sports Campus at Lakewood Ranch',
  'premier-sports-campus-lakewood-ranch-fl',
  '5895 Post Blvd',
  'Bradenton', 'FL', '34211',
  27.44961, -82.37873,
  16, 0, 16,
  'hard', true, true, true, true,
  true, false, true,
  true, 'unclaimed'
),

(
  'Manatee Avenue Pickleball Complex',
  'manatee-avenue-pickleball-bradenton-fl',
  '4908 Manatee Ave W',
  'Bradenton', 'FL', '34209',
  27.49801, -82.59134,
  4, 0, 4,
  'hard', false, false, false, true,
  true, false, false,
  true, 'unclaimed'
),

(
  'Ringling Pickleball Courts',
  'ringling-pickleball-sarasota-fl',
  '1 Circus Dr',
  'Sarasota', 'FL', '34234',
  27.36821, -82.54403,
  4, 0, 4,
  'hard', false, true, true, true,
  true, false, false,
  true, 'unclaimed'
),

-- ══════════════════════════════════════════════════════════════════════════════
-- MEMBERSHIP — accessible but requires paid or approved membership
-- ══════════════════════════════════════════════════════════════════════════════

(
  'YMCA of Sarasota — Wellfield Branch',
  'ymca-sarasota-wellfield-sarasota-fl',
  '1075 S Euclid Ave',
  'Sarasota', 'FL', '34237',
  27.32764, -82.52918,
  4, 4, 0,
  'hard', true, true, true, true,
  true, true, false,
  true, 'unclaimed'
),

(
  'Lakewood Ranch Athletic Club',
  'lakewood-ranch-athletic-club-bradenton-fl',
  '10415 Lakewood Ranch Blvd',
  'Bradenton', 'FL', '34202',
  27.41883, -82.39541,
  6, 2, 4,
  'hard', true, true, true, true,
  true, true, true,
  true, 'unclaimed'
),

(
  'Bradenton Area Convention Center Sports Hub',
  'bradenton-area-convention-center-sports-bradenton-fl',
  '1 Haben Blvd',
  'Palmetto', 'FL', '34221',
  27.53412, -82.55781,
  8, 8, 0,
  'hard', true, true, true, true,
  true, true, true,
  true, 'unclaimed'
),

-- ══════════════════════════════════════════════════════════════════════════════
-- PRIVATE — restricted access; membership or invitation only
-- Can host member-only tournaments, invite-only round robins, ladders
-- ══════════════════════════════════════════════════════════════════════════════

(
  'IMG Academy Pickleball',
  'img-academy-pickleball-bradenton-fl',
  '5500 34th St W',
  'Bradenton', 'FL', '34210',
  27.46708, -82.58093,
  10, 4, 6,
  'hard', true, true, true, true,
  false, true, false,
  true, 'unclaimed'
),

(
  'Lakewood Ranch Country Club',
  'lakewood-ranch-country-club-bradenton-fl',
  '7650 Legacy Blvd',
  'Bradenton', 'FL', '34202',
  27.41204, -82.40812,
  6, 0, 6,
  'hard', true, true, true, true,
  false, true, false,
  true, 'unclaimed'
),

(
  'The Oaks Club Pickleball',
  'the-oaks-club-pickleball-osprey-fl',
  '1901 Osprey Ave',
  'Osprey', 'FL', '34229',
  27.18341, -82.49273,
  4, 0, 4,
  'clay', true, true, true, true,
  false, true, false,
  true, 'unclaimed'
),

(
  'Sara Bay Country Club',
  'sara-bay-country-club-sarasota-fl',
  '1862 N Tuttle Ave',
  'Sarasota', 'FL', '34234',
  27.37592, -82.51684,
  4, 0, 4,
  'hard', true, true, true, true,
  false, true, false,
  true, 'unclaimed'
)

on conflict (slug) do nothing;


-- =============================================================================
-- VERIFICATION QUERY (informational — does not affect migration)
-- Run manually after applying to confirm counts:
--
-- select
--   public_access,
--   membership_required,
--   count(*) as facility_count
-- from public.facilities
-- where verified = true
-- group by public_access, membership_required
-- order by public_access desc, membership_required;
--
-- Expected result:
--   true  | false → 9   (public)
--   true  | true  → 3   (membership)
--   false | true  → 4   (private)
-- =============================================================================
