# Marketplace Map — Pre-Implementation Audit

**Date:** 2026-09-08
**Branch:** `feature/facility-import-pipeline` (implementation target: `feature/marketplace-map`)
**Scope:** Audit only. No code was modified.
**Evidence:** Working-tree reads on this branch + read-only queries against the production Supabase project (`fbzetvkbhneptvfruilw`).
**Revision:** v3 — **approved as the source of truth.** v2 incorporated review decisions on the pickup-location model, sold/expired exclusion, marker tap behavior, overlay provisionality, and provider strategy; v3 adds server-side coordinate enforcement (§5.2) and the binding RPC security contract (§5.5). Changes are listed in Appendix A.

---

## TL;DR

1. There is **one** interactive map in the app — `ExploreMap`, used only by the Nearby tab — and it is deliberately restricted to react-native-maps' native pin rendering. Custom marker content was removed on 2026-09-07 because it crashed under Fabric.
2. **That single constraint decides the architecture.** A `$145` price marker cannot be a `<Marker>` child. All three marker tiers must be an **overlay layer projected above the MapView** — treated as **provisional** until proven on device (§5.1).
3. **Geo queries are one-of-one.** Facilities have a real PostGIS RPC. Tournaments, community games, and marketplace listings have none — they fetch a fixed page and filter by distance in JS. Haversine is implemented **4 separate times**.
4. **Privacy: the app will never store a seller's precise coordinate.** Listings carry a *public pickup coordinate* chosen by the seller from public options. This removes the averaging-attack surface by construction rather than mitigating it (§5.2).
5. **Two live defects found** (§4). One makes the Marketplace radius filter return zero results every time it is used.

---

## 1. Current architecture and file inventory

### 1.1 Provider strategy (authoritative — repository evidence)

`react-native-maps@1.20.1` is the only mapping dependency. **No clustering library, no Mapbox, no other map SDK** in `apps/mobile/package.json`.

| Platform | Tile/marker renderer | Config |
|---|---|---|
| iOS | `PROVIDER_DEFAULT` — **Apple MapKit** | No extra native config needed |
| Android | `PROVIDER_GOOGLE` — **Google Maps** | `app.config.js:102-103` → `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY` |

This is set identically in both map components (`ExploreMap.native.tsx:21`, `VenueMapCard.native.tsx:10`) via `Platform.OS === 'ios' ? PROVIDER_DEFAULT : PROVIDER_GOOGLE`.

**Reconciling this with the earlier "Google Maps is the active stack" understanding.** Both are true of different layers, and the code comment at `ExploreMap.native.tsx:13-20` says so explicitly:

- Google Maps **is** the active renderer on Android, and Google Places / facility search data is used app-wide and is **unaffected** by the iOS provider choice.
- iOS renders tiles with Apple MapKit only because the `GoogleMaps` CocoaPod is not linked into this Xcode project ("AirGoogleMaps dir must be added to your xcode project"). Apple's provider needs no extra native SDK.
- `app.config.js:86` sets `ios.config.googleMapsApiKey` from `EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY`. **Given the provider choice, that key is not currently used to render tiles.** It is inert, not wrong — leave it.

**Decision: this is the documented provider strategy for Marketplace Map. No provider migration is in scope.** The practical consequence is that every map behavior must be verified on both providers, because they are genuinely different SDKs (§5.1).

Location permissions: `expo-location` plugin at `app.config.js:157-160`, foreground ("when in use") only. No background-location entitlement.

### 1.2 THE FABRIC CONSTRAINT (most important finding)

`ExploreMap.native.tsx:23-45` records a reproduced on-device crash:

> A custom component with custom child components inside a `<Marker>` (react-native-maps#5378) caused SIGABRT during `RCTMountingManager`'s `mountChildComponentView`, reliably, on tap-to-navigate. A markers-with-no-children diagnostic build reproduced the same tap sequence with zero crashes, confirming the cause.

Fix applied: native `pinColor` prop, **no React children at all**. The file explicitly notes:

- A child `<Image>` is **still a React child** and stays on the broken path.
- Only the native `image` prop (asset as a prop, no child view) is safe.

`newArchEnabled` is not set in `app.config.js`, so Expo SDK 54's default (Fabric on) applies.

### 1.3 File inventory

| Path | Role | Notes |
|---|---|---|
| `apps/mobile/src/components/ExploreMap.native.tsx` | Interactive map | 111 lines. MapView + native pins + GPS button. **Only interactive map in the app.** |
| `apps/mobile/src/components/ExploreMap.web.tsx` | Web stub | Placeholder; react-native-maps has no web support |
| `apps/mobile/src/components/ExploreMap.tsx` | Type-resolution shim | Re-export so TS resolves; Metro picks the platform file |
| `apps/mobile/src/components/ExploreMap.types.ts` | Shared types | `Region`, `MapPinLike`, `ExploreMapProps` |
| `apps/mobile/src/components/VenueMapCard.{native,web,types}.tsx` | Static single-pin map | 29 lines. All gestures disabled. Used by 4 screens |
| `apps/mobile/src/components/LocationCard.tsx` | Address + map block | Wraps VenueMapCard with address/directions row |
| `apps/mobile/src/app/(tabs)/nearby.tsx` | Map screen | **1,303 lines.** Holds every map behavior, all screen-local |
| `apps/mobile/src/lib/location.ts` | GPS hook | `useCurrentLocation()`, `Coordinates`, `FALLBACK_LOCATION` (Lakewood Ranch) |
| `apps/mobile/src/hooks/useLocationSettings.ts` | Prefs | Supabase `location_settings` + SecureStore cache. **Already has marketplace fields** |
| `apps/mobile/src/lib/supabase/facilities.ts` | Geo query | The only real geographic query in the app |
| `apps/mobile/src/lib/supabase/playEvents.ts` | Event fetch | `fetchNearbyPlayEvents(limit)` — **no geographic filter despite the name** |
| `apps/mobile/src/lib/supabase/tournaments.ts` | Tournament fetch | `fetchNearbyTournaments(limit)` — same |
| `apps/mobile/src/app/(tabs)/marketplace.tsx` | Listing grid | 2-column FlatList. No map. Client-side radius filter at line 320 |
| `apps/mobile/src/lib/marketplace/listingService.ts` | Listing queries | **No geographic parameters at all** |
| `apps/mobile/src/app/log-session/select-location.tsx` | **Facility picker** | Consumes `search_facilities_nearby`; list-only, no map. **Reusable as the pickup-area picker** |
| `apps/mobile/src/app/onboarding/area-recommendations.tsx` | Coordinate origin | `estimateFromIp()` at line 132 — source of every profile coordinate |
| `apps/mobile/src/app/location-settings.tsx` | Prefs screen | 485 lines. Radius + visibility toggles. Uses `Location.reverseGeocodeAsync` at line 186 |

### 1.4 Behavior-by-behavior

| Behavior | State | Where / how |
|---|---|---|
| Markers | Native only | `<Marker pinColor>` tinted by category via `gameTypePillStyle()`. Standard teardrop. No custom artwork |
| Price / count badges | **Absent** | None anywhere. Blocked from Marker-child approach by the Fabric crash |
| Clustering | **Absent** | No library, no logic. Every pin renders individually at every zoom |
| Selected marker | Minimal | Opacity only — `1` vs `0.9` (`ExploreMap.native.tsx:86`). No size/z-order/color change |
| Bottom card | Screen-local | `BottomSheet` + `FacilityBottomSheet` inside `nearby.tsx`, one `Animated.Value` (spring in, timing out). **Neither is exported** |
| Carousel | **Absent** | One sheet for one selected pin. No horizontal paging, no map–card sync. **This is a gap for the tier-2 requirement (§5.1)** |
| Map region | Solid | Deliberately *uncontrolled*: `region` is a camera target animated to on identity change, so it never fights user panning. Documented at `ExploreMap.types.ts:16-21` |
| "Search this area" | **Courts only** | `nearby.tsx:638-657`. Pan sets `pannedCenter`; pill appears past 2-mile drift; tap promotes to `searchCenter`. Gated on `category === 'court'` — does nothing for games or tournaments |
| Current location | Solid | `useCurrentLocation()`: last-known fix, then balanced-accuracy fix. `followRef` guards against camera re-centering on GPS jitter |
| Permissions | Solid | Requested on mount in the hook; denial → Lakewood Ranch with `isFallback: true`. Onboarding screen 6 is skippable |
| List / map toggle | Screen-local | Header icon button flipping `view: 'map' \| 'list'` (`nearby.tsx:604, 824-832`). Clears selection on switch |
| Pagination | **Absent** | Every fetch is a bare `.limit()` — 50 facilities, 20 events, 20 tournaments. No cursor, silent truncation |
| Caching | **Absent for map data** | Refetches on every screen focus. `eventShellCache` is a detail-screen shell cache, not a map cache |
| Pitch / rotation | **Enabled by default** | `ExploreMap` does not disable them. `VenueMapCard` disables all gestures. Relevant to §5.1 |

### 1.5 How tournaments and games become coordinates

Both share the same two-step shape, and **neither is geographically queried**:

**Step 1 — the fetch is not "nearby".**
- `fetchNearbyPlayEvents(20)` (`playEvents.ts:320`): open/full events from today forward, ordered by date, limit 20.
- `fetchNearbyTournaments(20)` (`tournaments.ts:143`): same for visible statuses.
- **Neither takes a latitude, longitude, or radius.** The user's location plays no part in *which* rows come back.

**Step 2 — coordinates are inherited from the facility.**
- Both embed `facility:facilities!…(latitude, longitude)`.
- `playEventToPin()` / `tournamentToPin()` (`nearby.tsx:110-162`) return `null` when `facility` is absent, and those nulls are filtered out — so **an event without a linked facility is silently invisible on the map**.
- Distance is computed client-side and rendered as a `"3.2 mi away"` string.

**This is also the precedent for the Marketplace pickup model:** events already derive their public coordinate from a public facility rather than from any person. Listings should work the same way (§5.2).

### 1.6 Verified server-side geography (production)

- PostGIS **3.3.7** installed.
- `facilities.coords` is a `geography` column, **not generated** — kept in sync by trigger `trg_sync_facility_coords`.
- `idx_facilities_coords` — GiST index on that column.
- `search_facilities_nearby` (defined `20260810005233_booking_search_bookable_and_zip.sql:12`) filters with `ST_DWithin`, orders by `ST_Distance`, `SECURITY DEFINER`, `search_path` pinned.
- **This is the model the Marketplace should follow.**

### 1.7 Duplicated distance math (4 copies)

| Location | Signature |
|---|---|
| `apps/mobile/src/app/(tabs)/nearby.tsx:90` | `distanceMiles(from, to)` — object args |
| `apps/mobile/src/app/(tabs)/marketplace.tsx:33` | `haversineMiles(lat1, lng1, lat2, lng2)` — scalar args |
| `apps/mobile/src/app/players/[id].tsx:67` | `haversineMiles(a, b)` — object args |
| `apps/mobile/src/lib/useFinderCandidates.ts:70` | `haversineMiles(from, to)` — object args |

### 1.8 Existing approximate-location / privacy behavior

**There is no approximation, jitter, snapping, or coordinate-visibility logic anywhere in the codebase.** What exists is this chain:

1. `onboarding/area-recommendations.tsx:132` — `estimateFromIp()` calls `https://ipapi.co/json/`, stores returned lat/lng as `estimatedLat/estimatedLng`, falls back to Lakewood Ranch.
2. `lib/onboarding/finalize.ts:110-111` — writes those into `profiles.location_lat/location_lng`. **This is the only write path.** `edit-profile.tsx:511-512` updates city/state but never coordinates, so a profile coordinate is set once at signup and never refreshed.
3. `marketplace/create/index.tsx:165-166` — copies `profile.location_lat/location_lng` straight onto the new listing.

So a listing pin sits at an IP-geolocation estimate of the seller's ISP egress at signup — city-level, and coincidentally not their home. **But** migration `20260825120000_restrict_anon_profile_columns.sql` describes these same columns as *"precise home coordinates"* and excludes them from the `anon` grant on `profiles`. That is the intent the schema was written against. The Marketplace inherits none of that protection (§4.1).

**Step 3 is removed under the new model (§5.2).** Listings will not inherit any profile coordinate.

### 1.9 Available geocoding capability

- `expo-location` is already a dependency; `Location.reverseGeocodeAsync` is already used at `location-settings.tsx:186`.
- `Location.geocodeAsync` (forward: address/ZIP → coordinate) is available in the same module and **currently unused**.
- **Caveat:** on iOS this routes through Apple's geocoder, requires network, is rate-limited, and returns varying precision. It is adequate for a city/ZIP centroid; it is not something to depend on synchronously in a create flow without a fallback.
- The **facility picker path needs no geocoding at all**, which is one reason it should be the default (§5.2).

---

## 2. Reusable component matrix

Your constraint — no parallel components, no duplicated geographic-query logic — lands almost entirely on `nearby.tsx`. Nearly every reusable map behavior is a private function or local component inside that 1,303-line file, so **"generalize" here mostly means extract what already works, behavior unchanged**.

### 2.1 Reuse as-is

| Asset | Reasoning |
|---|---|
| `VenueMapCard.*` | Takes `latitude, longitude, name` and nothing else. Drops straight into listing detail for the pickup-area map. **Zero change** |
| `LocationCard` | Address + map + directions block. Works for a listing's public pickup area |
| `useCurrentLocation()` | **Already used** by `marketplace.tsx:255`. Permission, fallback, last-known-fix all solved |
| `useLocationSettings()` | `marketplaceRadius`, `willingToShip`, `showExactLocation` **already exist** in the table and type. The Marketplace ignores them and keeps local `radiusMiles` state — wiring it up is a **deletion**, not an addition |
| `tabBarClearance()` | Map padding and floating-control offsets |
| `log-session/select-location.tsx` facility picker | **Promoted to primary reuse.** Already searches public facilities by proximity and returns one with coordinates. Becomes the default pickup-area picker (§5.2) |

### 2.2 Generalize (do NOT duplicate)

| Asset | Required change |
|---|---|
| `ExploreMap` + `.types` | `MapPinLike.category` is a closed union `'community' \| 'tournament' \| 'court'` and `pinColorFor()` switches on it. Needs: open pin model, optional `overlay` render slot for badges, `onMapPress` to deselect, and opt-in `pitchEnabled`/`rotateEnabled` flags (§5.1). Existing callers keep identical behavior |
| Haversine ×4 | Collapse into one `lib/geo.ts` exporting `distanceMiles`, `milesToMeters`, `regionFromCoords`, `regionToBounds`. Formula is identical in all four — mechanical |
| "Search this area" | Extract `nearby.tsx:638-657` → `useMapAreaSearch()` returning `{ effectiveOrigin, showSearchButton, onRegionChange, onSearchArea, reset }`. **Removing the `category === 'court'` gate is a behavior change to Nearby — separate, explicitly-approved step** |
| `BottomSheet` (in `nearby.tsx`) | Extract sheet chrome + `Animated` choreography as `MapDetailSheet`, card contents as children. Nearby keeps its two card bodies; Marketplace supplies a listing body |
| List / map toggle | One `MapListToggle`. Duplicating guarantees drift in icon, placement, selection-clearing |
| Region helpers | `locationToRegion()` + `DEFAULT_REGION_DELTA` move into `lib/geo.ts` |
| `PinPhoto` | Photo-with-initials-fallback thumbnail. Listings have photos and a fallback need |

### 2.3 Marketplace-specific (genuinely new)

| Asset | Reasoning |
|---|---|
| `MapBadgeLayer` — price / count / cluster badges | Nothing comparable exists |
| `MapResultsCarousel` — horizontal listing carousel for tier-2 taps | **No carousel exists anywhere in the app to generalize from.** Nearby's sheet is single-selection only |
| Listing cluster tiers | No clustering exists to generalize from. Build server-side; Nearby can adopt later |
| Pickup-area picker composition | The facility picker is reused, but the mode switcher around it (facility / city / map area) is new |

### 2.4 Pattern, not code

| Asset | Reasoning |
|---|---|
| `search_facilities_nearby` | **Do not extend it to listings** — it returns the facilities row shape. Copy its *shape*: `ST_DWithin` + GiST + `SECURITY DEFINER` + pinned `search_path` |

### 2.5 No longer needed under the revised model

| Dropped from v1 | Why |
|---|---|
| Sold / expired map treatment | Sold and expired listings are **excluded from discovery entirely** (§5.4). No pin states to design |
| Deterministic per-listing jitter over a precise coordinate | The app never holds a precise coordinate to jitter (§5.2). Snapping applies only to the optional map-area picker, at input time |

### 2.6 Sequencing note

Every "generalize" row is a refactor of a screen with no test coverage and a documented on-device crash history. Each should be extracted and shipped **with Nearby still as its only consumer** and verified unchanged, before Marketplace becomes a second caller. Doing the extraction and the new feature in one step is how the Nearby regression happens.

---

## 3. Database and API gaps

### 3.1 What `marketplace_listings` already has

From `20260807203246_marketplace.sql:28-53`:
- `location_city`, `location_state`, `location_lat`, `location_lng` (both `double precision`, both nullable)
- Status enum: `active | pending | sold | deleted`
- Indexes on `(status, created_at)`, `seller_id`, `brand`

**Note:** `location_lat` / `location_lng` are **reused as the public pickup coordinate** under the revised model. No precise-coordinate columns are added, so this is a semantic change plus new supporting columns, not a coordinate migration.

### 3.2 Schema gaps

| Gap | Impact | Proposed shape |
|---|---|---|
| No geography column | No `ST_DWithin` possible; no spatial index; every radius query scans and filters in JS | `location_coords geography(Point,4326)` + GiST index, synced by trigger from `location_lat/lng` — the `facilities.coords` / `trg_sync_facility_coords` pattern |
| No pickup-source provenance | Cannot tell a facility-anchored coordinate from a city centroid, so the UI cannot honestly say how precise the pin is | `pickup_source` enum: `facility \| city \| map_area`; `pickup_facility_id uuid NULL REFERENCES facilities(id)`; `location_precision` enum: `facility \| neighborhood \| city` (drives map copy and circle radius) |
| No pickup preference | Map cannot distinguish shippable from meet-in-person; a ship-only listing should not be pinned at all | `fulfillment` enum: `local_pickup \| shipping \| both`. `location_settings.willing_to_ship` already exists as the seller-level default to prefill from |
| No location visibility control | Per-listing opt-out impossible | `location_visibility` enum: `map \| city_only \| hidden`, default `map`. `hidden` and `city_only` are excluded from map results |
| No `expired` status, no expiry | Stale listings would pin forever. No TTL, no scheduled job, no `expires_at` in any marketplace migration | `ALTER TYPE … ADD VALUE 'expired'` + `expires_at timestamptz`. **Note:** the enum-value addition cannot run in the same transaction as a statement using it — split the migration |
| No `sold_at` | No way to order seller history or drive saved-item state | `sold_at timestamptz`, set by a status trigger |
| No geo index of any kind | Confirmed: the only GiST index in the schema is `idx_facilities_coords` | GiST on `location_coords`, plus a partial index for the discovery predicate: `(location_coords) WHERE status = 'active'` |
| No postal code | ZIP is a natural pickup-area input and is not stored | `location_postal text NULL` |

**Explicitly NOT added:** `precise_lat`, `precise_lng`, or any other exact-location column on `marketplace_listings`. See §5.2.

### 3.3 API gaps

- **No geographic RPC for listings.** `fetchListings()` (`listingService.ts:38`) accepts query, brand, condition, price range, sort — **no coordinates**. Filtering happens at `marketplace.tsx:320-325` in JS, after rows are already on the device.
- **No viewport / bounds query anywhere in the app.** Every geographic query is radius-from-a-point. A map needs bounds (`ST_MakeEnvelope`), which does not exist for any entity.
- **No aggregation endpoint.** Cluster counts require grouping in the database; nothing does this today.
- **No cell-scoped query.** The tier-2 carousel needs "give me the listings in *this* aggregate cell" — a distinct call from the bounds query (§5.3).
- **No pagination contract.** All list fetches are bare limits. A map that pans needs a stable cursor, and the carousel needs a bounded page.
- **Status filtering must be explicit in the RPC.** RLS permits `status = 'active' OR seller_id = auth.uid()`, so a `SECURITY DEFINER` RPC that does not filter would return the caller's own sold and expired listings onto the map. §5.4 makes this a required predicate, not an incidental one.

---

## 4. Privacy and performance risks

### 4.1 LIVE DEFECT — listing coordinates readable by anonymous clients

**Severity: privacy, live.**

Queried against production `information_schema.column_privileges`: the `anon` role holds `SELECT` on `marketplace_listings.location_lat` and `location_lng` — along with every other column.

The hardening migration of 2026-08-25 revoked the table grant on `profiles` and granted back a safe column list, but `marketplace_listings` was created two weeks earlier and **never received the same treatment**, so it still carries Supabase's default `GRANT ALL`. Combined with the RLS policy `status = 'active'`, an unauthenticated caller holding only the publishable key can enumerate coordinates for every active listing.

- **Why it is not currently an exposure:** zero listings have coordinates (§4.2), and the values that *would* be written are IP-level estimates.
- **Why it must be fixed anyway:** the map is the feature that will start populating that column, and grants should be correct before data exists rather than after.
- **Under the revised model the exposure is bounded by design** — the only coordinate stored is a public pickup point the seller deliberately chose. The grant fix is still required; it is no longer the last line of defense.
- **Fix:** mirror `20260825120000` — revoke the table grant, grant back an explicit safe column list.

### 4.2 LIVE DEFECT — the Marketplace radius filter always returns zero results

**Severity: correctness, live.**

Production counts (2026-09-08): **2 listings total, 1 active, 0 with a non-null `location_lat`.**

The filter at `marketplace.tsx:320-325` excludes any listing with null coordinates once a radius is chosen — a deliberate, commented decision — so selecting "Within 5 mi", or any other radius, **empties the grid every time**.

Root cause is upstream: `create/index.tsx:165-166` copies `profile.location_lat`, and profile coordinates are only ever written by `finalize.ts` during onboarding. Any seller who signed up before that path existed, or skipped it, has null coordinates to copy.

- **Fix:** stop inheriting the profile coordinate (§5.2 removes this path entirely). Until listings reliably carry a pickup coordinate, treat "no coordinates" as unfiltered rather than excluded.

### 4.3 Resolved by design — seller coordinate reuse and jitter attacks

v1 flagged two risks that the revised model eliminates rather than mitigates:

| v1 risk | Status under v2 |
|---|---|
| Every listing from one seller pins to the identical point, leaking that they are the same person | **Resolved.** The coordinate comes from the listing's chosen pickup area, not the seller. Two listings may still share a point if the seller picks the same facility — but that point is a public court, not a home, and reveals nothing |
| Random per-request jitter is a de-anonymization vector, because repeated sampling averages the noise away | **Resolved by construction.** There is no precise value stored to recover. For the optional map-area picker, the coordinate is snapped **once at input time** and only the snapped value is persisted — the original is never written to the database at all |

**Residual risk to watch:** a seller who habitually picks the facility nearest their home narrows their neighborhood over many listings. This is inherent to any local marketplace, is the same exposure a Nearby event organizer already accepts, and is acceptable — but the create flow should say plainly that the pickup area is public.

### 4.4 Performance risks

| Risk | Detail | Fix |
|---|---|---|
| Fetch-everything-then-filter | Every listing matching non-geographic filters is transferred to the device and filtered there. At 194 facilities the equivalent pattern is fine; at a few thousand listings it is a large payload on cellular, on every screen focus, with no cache | Move the filter into a bounds-scoped RPC **before** the map ships, not after |
| Unbounded marker count, no clustering | `ExploreMap` renders one `<Marker>` per pin unconditionally. Today's ceilings (50/20/20) hide this. A zoomed-out Marketplace map over a metro area has no such ceiling, and marker count is the classic react-native-maps performance cliff | Server-side aggregation (§5.3) |
| Overlay badges re-project every camera frame | Badge positions recompute as the camera moves. Naively on `onRegionChange` this is a JS-thread recompute per frame across every visible badge | Project in JS from the region rather than calling the bridge per marker; cap the badge layer to the visible set; hide badges mid-gesture and restore on `onRegionChangeComplete`. **If this is not smooth, fall back rather than optimize (§5.1)** |
| Carousel + map sync | A horizontal carousel that pans the map on scroll is a second source of camera changes, which can fight the badge projection and the "Search this area" drift detection | Drive the camera from carousel selection only on settle, not during scroll; suppress area-search drift while a carousel-driven animation is in flight |
| Silent truncation at the limit | `fetchFacilities({ limit: 50 })` and the two `limit: 20` event fetches drop rows past the cap with no indication. On a map this reads as "there is nothing there" rather than "there is more" | Worth fixing generally; worth not repeating for listings |

---

## 5. Recommended implementation architecture

### 5.1 Marker rendering — provisional, with a defined fallback

All three tiers carry text, which is exactly what the documented crash forbids inside a `<Marker>`.

| Approach | Verdict |
|---|---|
| Custom marker children | **Rejected.** The exact pattern that crashed on 2026-09-07 |
| Pre-rendered `<Marker image>` assets | **Held in reserve — this is the fallback.** Fabric-safe. The native `image` prop takes a static asset, so it cannot show an arbitrary price, but it *can* show a small set of pre-rendered price-band pins (e.g. `<$50`, `$50–99`, `$100–199`, `$200+`) and pre-rendered count pins (`2`, `3`, `4`, `5+`, `9+`). Less precise, entirely robust |
| Absolutely-positioned overlay above the MapView | **Preferred, but PROVISIONAL.** Badges are ordinary RN views, never Marker children, so the crash path is untouched. Screen position comes from projecting each coordinate against the current region |

**Why the overlay is provisional.** Manual projection over a native map degrades under rotation, pitch, map padding, provider differences, Mercator distortion at high latitude, and rapid pinch/pan. None of that is hypothetical — `ExploreMap` currently sets `mapPadding` and leaves pitch and rotation enabled.

**Spike constraints:**
- **Disable pitch and rotation** (`pitchEnabled={false}`, `rotateEnabled={false}`) for the spike and for the Marketplace map unless someone argues those interactions matter here. Nearby keeps its current behavior; this is a Marketplace-map setting, not a global change.
- Account for `mapPadding` explicitly in the projection — it offsets the visual center from the region center.
- Test both providers. They are different SDKs, not a rendering detail.

**Bail-out rule:** if smooth tracking cannot be demonstrated in the spike, **use the pre-rendered `<Marker image>` presentation instead of building fragile projection math.** Do not iterate on the projection to rescue it. The exact price on the pin is a nice-to-have; a map that drifts or crashes is not shippable.

### 5.1a SPIKE RESULT — 2026-09-09: overlay REJECTED, fallback adopted

Run on a physical iPhone against Apple MapKit, via OTA to the preview build.
Branch `spike/marketplace-map-marker-overlay`, cherry-picked onto
`feature/marketplace-map` as `d8e34e9` / `514ecf7` / `bbdcb8b`.

**Fabric safety: CONFIRMED.** An absolutely-positioned badge over `MapView`
with a childless `<Marker pinColor>` underneath survived 1008 region-change
events, 21 badge taps, and navigate-away/return with no crash and no stale
badge. The original worry — that anything badge-like re-enters the
react-native-maps#5378 path — is settled. It does not.

**Smoothness: PASSED.** Reported as smooth on device; no lag or judder during
pan, pinch or zoom.

**Accuracy: FAILED, twice.**

| Run | mapPadding | MAX delta vs `pointForCoordinate()` | Gate |
| --- | --- | --- | --- |
| 1 | on (top 16 / bottom ~144) | **28.42px** | fail (<2px) |
| 2 | off | **19.44px** | fail (<2px) |

The error is entirely vertical — run 1 read `badge x 156.8 y 361.4` against
`sdk x 156.8 y 340.8`. Longitude is exact to the tenth of a pixel; latitude is
not. `mapPadding` was the obvious suspect because it is the only vertically
asymmetric input, and disabling it moved the number without fixing it, so the
model is wrong independently of padding.

**Decision: use the pre-rendered `<Marker image>` presentation** (§5.1's named
fallback) — price bands rather than exact prices, count pins rather than exact
counts. Per the bail-out rule this audit set before the spike ran, the
projection math is not being iterated on. Two failed measurements is the signal
to switch presentations, not to keep tuning.

**What this costs:** a pin reads `$100–199` instead of `$145`. Tier 2 and 3
(§5.3) are unaffected — those were always going to be small fixed sets
(`2`,`3`,`4`,`5+`,`9+`), which pre-rendered assets serve exactly as well.

**A path back, if exact prices ever become load-bearing:** stop projecting and
ask the SDK. `mapRef.pointForCoordinate()` is ground truth — it is what proved
the overlay wrong — and it could position badges directly. It is async and one
call per marker, so it suits a settle-time layout (badges hidden during
gesture, placed on `onRegionChangeComplete`) rather than per-frame tracking.
That is a different design, not a correction to this one, and it should be
costed on its own rather than reached for reflexively.

**Android: never tested.** No Android hardware and no emulator available. The
fallback is provider-independent by construction — it uses the library's own
native rendering path — which is a further point in its favour.

**Android verification caveat:** no physical Android device is available. The Android gate may be satisfied on an emulator initially, but **the spike result must be recorded as "unverified on physical Android hardware"** and re-checked before release. Emulators do not reproduce real GPU compositing, frame pacing, or touch timing.

### 5.2 Location model — no precise seller coordinates, ever

**Decision: the app does not store a seller's precise location.** Listing creation asks for a *public pickup area*, and only that public coordinate is stored.

**Input modes, in order of preference:**

| Mode | `pickup_source` | Coordinate origin | Precision | Notes |
|---|---|---|---|---|
| **Pickleball facility** (default) | `facility` | `facilities.latitude/longitude` of the selected facility | `facility` | **Reuses the existing picker** at `log-session/select-location.tsx`. No geocoding, no new privacy surface, and it doubles as a genuinely good meetup suggestion |
| City / ZIP | `city` | `Location.geocodeAsync` centroid, or a stored city centroid | `city` | Requires network; needs a fallback. Displayed as an area, never a point |
| Approximate map area | `map_area` | Seller drags a map; the point is **snapped to a ~800 m grid at input time** and only the snapped value is submitted | `neighborhood` | The unsnapped point is never sent to the server. Copy must say the area is public |

**The client is never trusted with the stored coordinate.** Client-side snapping is a UI affordance so the seller sees the area they are publishing. It is not a control. A modified client can submit anything, so **the database write path derives or re-snaps the coordinate server-side before storing it**, per source:

| `pickup_source` | Server-side write rule |
|---|---|
| `facility` | **Derive, do not accept.** `location_lat/lng` are set from `facilities.latitude/longitude` via `pickup_facility_id`. Any client-supplied coordinate is discarded. A `pickup_facility_id` that does not resolve rejects the write |
| `city` | Validate: the submitted coordinate must fall within a sane radius of the claimed `location_city`/`location_state`/`location_postal`, else reject. `location_precision` is forced to `city` regardless of what the client sent |
| `map_area` | **Re-snap unconditionally** to the same ~800 m grid, in the same `BEFORE INSERT OR UPDATE` trigger that syncs `location_coords` |

**Snapping must be idempotent** — snapping an already-snapped value returns that value unchanged. This is what makes the whole pipeline safe rather than merely redundant: the client sends an already-snapped coordinate, so **the unsnapped value never crosses the network at all**, and the server re-snap is a no-op for honest clients and a correction for modified ones. It also means the coordinate is stable across an edit that does not move the pin.

**The unsnapped coordinate must never be persisted, logged, or returned.** Concretely:
- No column, no audit table, no JSONB blob holds it.
- It is never an RPC or trigger **parameter**, because Postgres statement logging (`log_statement`, `log_min_duration_statement`, `auto_explain`) captures parameter values. Because the client already snaps before sending, there is no precise value in any parameter to capture — this is the reason to snap on both sides rather than server-only.
- No RPC return column, view, or error message echoes it. Rejection messages say *why* the coordinate was rejected, never what it was.
- Client-side: do not write the unsnapped point to analytics, Sentry breadcrumbs, or `console.warn`.

**Rules:**
- `location_lat` / `location_lng` hold the public pickup coordinate. There is no second, more precise coordinate anywhere.
- The exact meetup point is agreed privately in messaging — the marketplace already routes buyer/seller conversation through `get_or_create_direct_conversation` (see the header comment in `20260807203246_marketplace.sql`), so no new surface is needed for that.
- Listing detail renders the area **as a circle sized by `location_precision`**, not a pin, for `city` and `neighborhood`. A `facility` source may render a pin, because the pin is a public court.
- **If precise coordinates are ever genuinely needed,** they go in a separate protected table (e.g. `marketplace_listing_private_location`) with its own RLS, its own grants, and no `anon` access — never as columns beside publicly-readable listing rows.
- Remove `create/index.tsx:165-166` — the profile-coordinate inheritance — entirely.

### 5.3 Marker hierarchy and required tap behavior

| Tier | Marker | Tap behavior | Data required |
|---|---|---|---|
| 1 | `$145` | **Open that listing preview** in `MapDetailSheet` | Listing id + card fields, already in the bounds response |
| 2 | `3 listings` | **Open a horizontal listing carousel / area-results sheet** for that cell | `cell_key` + count in the badge; **a follow-up cell query** supplies the listings |
| 3 | `47` | **Zoom into that cluster's bounds** | `bbox` (min/max lat/lng) returned per aggregate row so the client can animate without a second call |

**API consequences — this is what makes the interaction possible:**

- `search_listings_in_bounds(min_lat, min_lng, max_lat, max_lng, zoom, filters…)` returns a **discriminated result**: individual listing rows above the tier-1 zoom threshold, and `ST_SnapToGrid` aggregate rows below it. Every aggregate row carries `cell_key`, `count`, a representative centroid, **and `bbox`**.
- `fetch_listings_in_cell(cell_key, filters…, limit, cursor)` is a **separate RPC** that returns the full listing cards for one tier-2 cell, paged. Chosen over inlining preview rows in the bounds response because inlining N cards per cell multiplies the payload of the one call that fires on every pan — the carousel query fires only on an explicit tap.
- `cell_key` must be **deterministic from the grid parameters**, so a tap can resolve to the same cell the badge was drawn from even if the map moved slightly between render and tap.
- Both RPCs apply the **same** filter set (brand, condition, price, fulfillment) and the same status predicate (§5.4), or the carousel will disagree with the badge count.

### 5.4 Sold and expired listings are excluded from discovery

**Decision: sold and expired listings never appear in Marketplace discovery — grid or map.**

| Listing state | Grid | Map | Where it *is* visible |
|---|---|---|---|
| `active` | Yes | Yes | — |
| `pending` | Yes (marked) | Yes (marked) | Still a live listing |
| `sold` | **No** | **No** | Seller history, saved-item state, direct detail link |
| `expired` | **No** | **No** | Seller management only (`my-listings`) |
| `deleted` | No | No | Nowhere |

**Implementation notes:**
- Both RPCs must filter `status IN ('active','pending') AND (expires_at IS NULL OR expires_at > now())` **explicitly**. RLS alone is not sufficient: it permits `seller_id = auth.uid()`, so a `SECURITY DEFINER` function without this predicate would put the caller's own sold listings back on their map.
- Aggregate counts must use the same predicate, or a cluster badge reading `47` will open a carousel containing fewer.
- A direct link to a sold listing still resolves — it just is not discoverable. Saved items should show a "no longer available" state rather than 404.

### 5.5 RPC security contract (binding on both geographic RPCs)

`search_listings_in_bounds` and `fetch_listings_in_cell` are both `SECURITY DEFINER`, which means they run with the definer's privileges and **RLS does not protect them**. Every requirement below is mandatory for both, and each has a test in the Phase 1 and Phase 4 gates.

| # | Requirement | Implementation |
|---|---|---|
| 1 | **Explicit active-status predicate** | `WHERE status = 'active' AND (expires_at IS NULL OR expires_at > now())` written into the function body. Never inherited from RLS, which permits `seller_id = auth.uid()` and would otherwise surface the caller's own sold, expired, pending, and deleted rows |
| 2 | **Pinned `search_path`** | `SET search_path TO 'public'` in the function definition, matching `search_facilities_nearby`. Without it a `SECURITY DEFINER` function is schema-hijackable |
| 3 | **Validated bounds** | Reject inverted or absurd envelopes: `min_lat < max_lat`, `min_lng < max_lng`, latitudes within ±90, longitudes within ±180, and a maximum envelope area — an unbounded whole-world request must not be a way to dump the table. Clamp rather than error where clamping is unambiguous |
| 4 | **Validated zoom** | Clamp to the supported band. Zoom selects the aggregation grid, so an out-of-range value must not produce a degenerate grid (one cell containing everything, or one cell per listing) |
| 5 | **Enforced maximum result size** | A hard server-side `LIMIT` independent of any client-supplied limit, plus a clamped page size on the cell query. The client cannot raise it |
| 6 | **Public location fields only** | An explicit `RETURNS TABLE(...)` column list — never `SELECT *`, never `RETURNS SETOF marketplace_listings`. `seller_id` is returned only if the UI needs it; no seller profile coordinates, no email, no Stripe identifiers, nothing from `profiles` beyond display name and avatar |
| 7 | **No seller-only row leakage** | Requirement 1 is the mechanism; the test is the proof. Sign in as a seller who owns a sold listing and a hidden listing, call both RPCs over an envelope containing them, and assert neither appears |
| 8 | **Aggregate counts match carousel results** | Both functions share one filter predicate — factor it into a single SQL expression or an inlineable helper used by both, rather than writing it twice. A badge reading `3 listings` that opens a carousel of 2 is the bug this prevents |

Additional notes:
- `location_visibility` of `city_only` or `hidden` is excluded from map results by the same shared predicate.
- Grant `EXECUTE` deliberately. Decide per RPC whether `anon` needs it at all; if the Marketplace map is signed-in only, grant to `authenticated` and not `anon`.
- Run `mcp__supabase__get_advisors` after the migration — the security advisor flags unpinned `search_path` and over-permissive definer functions, and it costs nothing.

### 5.6 Client modules

| Module | Status | Purpose |
|---|---|---|
| `lib/geo.ts` | New (consolidation) | Distance, region, bounds math; the four haversine copies collapse into it |
| `ExploreMap` | Generalized | Open pin model, `overlay` slot, `onMapPress`, opt-in pitch/rotate flags |
| `MapBadgeLayer` | New | Projection + rendering of the three tiers — **or** the pre-rendered marker fallback behind the same interface, so the decision in §5.1 does not ripple outward |
| `MapResultsCarousel` | New | Tier-2 horizontal carousel, fed by `fetch_listings_in_cell` |
| `useMapAreaSearch()` | Extracted | From `nearby.tsx:638-657`, behavior preserved |
| `MapDetailSheet` | Extracted | Sheet chrome + animation, contents as children |
| `MapListToggle` | Extracted | Shared toggle |
| `PickupAreaPicker` | New (composition) | Mode switcher wrapping the **existing** facility picker |
| `listingService.fetchListingsInBounds()` / `fetchListingsInCell()` | New | Client halves of the two RPCs |

---

## 6. Phased implementation plan

Sequenced per review. **Phases 1 and 3 are worth doing even if the map is deferred** — one closes a grant gap, the other fixes a filter that is broken in production today.

### Step 1 — Branch

Create `feature/marketplace-map` off the current branch. All work below lands there.

### Step 2 — PHASE 0: Fix coordinate grants and the broken radius filter (~0.5–1 day)

- Revoke the table grant on `marketplace_listings` from `anon` and `authenticated`; grant back an explicit safe column list, mirroring `20260825120000`.
- Stop excluding null-coordinate listings from the radius filter at `marketplace.tsx:320-325` — treat missing coordinates as unfiltered.

**Gate:** an anon `curl` for a non-granted column fails with 42501; the granted columns still return; selecting a radius in the Marketplace no longer empties the grid.

### Step 3 — SPIKE: Fabric-safe price badge (~half day)

- Throwaway branch: `ExploreMap` + a hardcoded absolutely-positioned `$145` badge tracking one coordinate.
- **Pitch and rotation disabled.** `mapPadding` accounted for in the projection.
- Run on iOS (MapKit) **and** Android (Google, emulator acceptable — record as unverified on physical hardware).
- Pinch, pan, fling. Watch for drift, lag, and any crash.

**Gate:** badges stay locked to their coordinates through a full gesture on both providers, with no crash.
**If the gate fails:** adopt the pre-rendered `<Marker image>` price-band presentation (§5.1). **Do not iterate on the projection.** Record the decision and move on — later phases are written against the `MapBadgeLayer` interface either way.

### Step 4 — PHASE 1: Decide and build the public pickup-location model (~1.5–2 days)

- Schema: `location_coords` + GiST (partial on `status = 'active'`), `pickup_source`, `pickup_facility_id`, `location_precision`, `location_postal`, `fulfillment`, `location_visibility`. **No precise columns.**
- Trigger to sync `location_coords` from `location_lat/lng`, styled on `trg_sync_facility_coords`.
- `PickupAreaPicker` in create + edit flows, defaulting to the **existing** facility picker. Delete the profile-coordinate inheritance at `create/index.tsx:165-166`.
- Server-side derive/validate/re-snap in the write trigger, per the source table in §5.2.
- `search_listings_in_bounds` RPC meeting the full §5.5 security contract.
- Point the existing grid's radius filter at the RPC; delete the client-side haversine there.

**Gate:**
- A listing created through each of the three input modes carries a sensible public coordinate.
- **Adversarial write test:** submit an unsnapped `map_area` coordinate, a `facility` source with a mismatched coordinate, and a `city` source with a coordinate in another state, via direct REST calls that bypass the app. Each is corrected or rejected server-side; nothing precise is stored.
- Grep the migration and RPC definitions: no unsnapped value appears in any column, parameter, return column, or error message.
- **§5.5 items 1–7 each have a passing test**, including the seller-owned-sold-listing leakage test.
- The grid returns correct radius results against real data.

### Step 5 — PHASE 2: Extract shared components, Nearby as the only consumer (~2 days)

- `lib/geo.ts`; migrate all four haversine call sites.
- Extract `useMapAreaSearch`, `MapDetailSheet`, `MapListToggle`; open up `ExploreMap`'s pin model, add the overlay slot and the pitch/rotate flags.
- **Ship with Nearby as the only consumer.**

### Step 6 — GATE: Verify Nearby is unchanged

Verified on device across all three tabs — pins, colors, selection, both sheet variants, "Search this area", locate button, list/map toggle, access filters. **Behavior identical to before.** This gate protects the existing surfaces; do not let Step 7 start early.

### Step 7 — PHASE 3: Marketplace grid/map toggle and tier-1 price pins (~2–3 days)

- Map/list toggle on the Marketplace tab, reusing the extracted control.
- Bounds-driven fetching on `onRegionChangeComplete`; "Search this area" via the shared hook.
- `MapBadgeLayer` rendering price badges only. Tap → listing preview in `MapDetailSheet`.
- Pitch/rotation disabled on this map.
- Sold and expired excluded (§5.4) — nothing to render for them.

**Gate:** prices legible and correctly placed at street zoom; panning fetches the new viewport; no sold or expired listing appears on the map, including the caller's own.

### Step 8 — PHASE 4: Area counts, carousel, and clusters (~2–3 days)

- Zoom-banded aggregation in the bounds RPC via `ST_SnapToGrid`, returning `cell_key`, `count`, centroid, `bbox`.
- `fetch_listings_in_cell` RPC + `MapResultsCarousel`.
- Tier-2 tap → carousel. Tier-3 tap → animate to `bbox`.
- Cap the badge layer to the visible set; suppress area-search drift during carousel-driven camera moves.

**Gate:**
- A seeded metro-scale dataset (several hundred listings) pans and zooms without payload or frame rate degrading.
- **Badge count equals carousel length** for every tier-2 cell tested (§5.5 item 8).
- `fetch_listings_in_cell` re-tested against the full §5.5 contract — it is the second `SECURITY DEFINER` function and inherits none of the first one's guarantees.
- Bounds and zoom validation exercised with hostile inputs: inverted envelope, whole-world envelope, out-of-range zoom, oversized client limit.
- Test the tails: a single listing alone, the densest cell, and a cell at the viewport edge.

### Step 9 — PHASE 5: Expiration lifecycle and viewport caching (~1–2 days)

- `expires_at` + scheduled expiry job; `sold_at` set by trigger; both drop the listing out of discovery automatically.
- Saved-item and direct-link handling for sold listings ("no longer available", not a 404).
- Short-TTL viewport cache so back-navigation does not refetch.
- Wire `location_settings.marketplaceRadius` and `willingToShip` into the Marketplace, replacing its local radius state.
- **ASK BEFORE DOING:** removing the `category === 'court'` gate would give Nearby's games and tournaments the "Search this area" behavior they lack, and a bounds query would fix `fetchNearbyPlayEvents` not actually being nearby. Both change **existing** surfaces and need explicit sign-off.

---

## Appendix A — revision history

| # | Change | Sections affected |
|---|---|---|
| 1 | **No precise seller coordinates.** `precise_lat`/`precise_lng` and the derived-approximation scheme are dropped. Listings store one public pickup coordinate chosen from facility / city-ZIP / snapped map area. Precise data, if ever needed, goes in a separate protected table | §3.2, §4.3, §5.2, Step 4 |
| 2 | **Sold and expired excluded from discovery**, not styled distinctly. Explicit status predicate required in both RPCs because RLS permits owner rows | §2.5, §3.3, §5.4, Steps 7 and 9 |
| 3 | **Tap behavior specified** per tier, with the API consequences: `cell_key` + `bbox` on aggregates, and a separate `fetch_listings_in_cell` RPC to populate the carousel | §5.3, §2.3, Step 8 |
| 4 | **Overlay treated as provisional** with a named fallback (pre-rendered `<Marker image>` price bands), pitch/rotation disabled for the spike, `mapPadding` called out, and a bail-out rule instead of iterating on projection math. Android emulator accepted for the gate, recorded as unverified on physical hardware | §5.1, §4.4, Step 3 |
| 5 | **Provider discrepancy resolved.** Repository evidence is authoritative: Apple MapKit on iOS, Google Maps on Android. Google remains the Places/facility data stack app-wide, which is what the earlier understanding referred to. No provider migration in scope | §1.1 |
| 6 | Sequencing reordered: branch → grants/filter fix → spike → location model → extraction → Nearby gate → tier 1 → tier 2/3 → lifecycle | §6 |

### v2 → v3

| # | Change | Sections affected |
|---|---|---|
| 7 | **Server-side coordinate enforcement.** Client-side snapping is a UI affordance, not a control. The write path derives the coordinate from the facility record, validates the city coordinate, and unconditionally re-snaps map-area coordinates. Snapping is idempotent, so the client snaps *first* and the unsnapped value never crosses the network — which is also what keeps it out of Postgres statement logs, since it is never a parameter. Explicit prohibition on persisting, logging, returning, or echoing it in error messages, client analytics included | §5.2, Step 4 gate |
| 8 | **Binding RPC security contract** for both `SECURITY DEFINER` geographic functions: explicit active-status predicate, pinned `search_path`, validated bounds and zoom, server-enforced maximum result size, explicit public-column return list, no seller-only row leakage, and a single shared filter predicate so aggregate counts match carousel results. Eight numbered requirements, each with a gate test | §5.5, §3.3, Steps 4 and 8 gates |

## Appendix B — verification notes

- §1–§4 were read out of the working tree on this branch or queried read-only against production. File and line references are the evidence.
- **Unverified claims**, both deliberately gated rather than assumed:
  - The overlay badge's on-device behavior (§5.1) — hence the spike and the bail-out rule.
  - `Location.geocodeAsync` behavior for the city/ZIP mode (§1.9) — available in an already-installed module, but never exercised in this codebase.
- Production counts read 2026-09-08 and will drift: 2 listings, 1 active, 0 with coordinates, 194 facilities, PostGIS 3.3.7.
- No code was modified by this audit.
