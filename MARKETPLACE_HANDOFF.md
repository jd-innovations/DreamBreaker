# Marketplace — state of play

**Last updated:** 2026-09-09
**Branch:** `feature/marketplace-map` (off `develop-mobile`, pushed)
**Status:** the map work in `MARKETPLACE_MAP_AUDIT.md` is complete through Phase 3, plus lifecycle and a set of gap fixes. Everything below is applied to production and verified on a device.

Read `MARKETPLACE_MAP_AUDIT.md` for the *why* behind the map decisions. This file is the *what exists now*.

---

## What shipped

### Discovery

| | |
| --- | --- |
| **Server-side proximity** | `search_listings_nearby` — `ST_DWithin` over a GiST-indexed `geography` column, the same shape `search_facilities_nearby` has always used. Replaced a client-side haversine over every fetched row. |
| **Map view** | Grid/map toggle. Pins tinted by **price band** with a legend; exact price on the tap card. "Search this area" after a >2 mile pan. Reuses `ExploreMap`. |
| **Filters** | Brand, condition, price, distance, and **handoff** (`local_pickup` / `shipping`). |
| **Settings honoured** | `location_settings.marketplaceRadius` seeds the distance filter; `willingToShip` seeds the handoff filter. Both are defaults applied once, not a controlled binding. |

### Listings

- **Public pickup location.** Sellers pick a court from the facilities directory. The trigger *derives* the coordinate from `pickup_facility_id` and re-snaps map-area picks to a ~800 m grid. **No precise seller coordinate is stored anywhere, by design.**
- **Editable** — photos, pickup court, handoff, city/state, plus the original fields.
- **Lifecycle** — 30-day expiry, warning email 7 days out, one-tap renew. `sold_at` stamped by trigger on the seller's action.
- **AI listing assist** — on in production (`marketplaceAiAssist: 'included'`).
- **Minimum offer enforced** — `min_offer_cents` was collected and ignored; the offer sheet now shows and enforces it.

### Buyers

- **Saved listings** — `marketplace_saved_listings`, owner-only RLS, heart on detail, list via the header toggle.
- **Price-drop alerts** — in-app + push when a saved listing gets cheaper. Own preference (`notif_marketplace`).

---

## Decisions that will look odd without the reason

**Pins carry a price *band*, not the price.** A `$145` badge over the map was built, tested on a device, and rejected: 19–28 px of vertical placement error against the SDK's own `pointForCoordinate()`, against a 2 px gate. Fabric safety and smoothness both passed — only placement failed. Full write-up in the audit §5.1a. **Do not reopen the projection maths**; if exact prices ever become load-bearing, the path is pre-rendered `<Marker image>` assets, or positioning from `pointForCoordinate` at settle time.

**No bounds RPC.** The map derives a radius from the visible region and reuses `search_listings_nearby`. A real `ST_MakeEnvelope` query belongs with clustering, where the aggregation needs it.

**Price-drop alerts have no email.** `send-transactional-email` does not read `profiles.notif_email_enabled` — the column is written by the settings screen and honoured by nothing in the send path. An email would reach people who explicitly opted out. Also, a price alert is promotional in character and would need `layout='marketing'` plus the postal address under CAN-SPAM. Revisit once EMAIL plan Phase 5.5 lands.

**Offers are seeded chat messages, not records.** Deliberate V1 — see `lib/marketplace/offers.ts`. There is no accept/decline and no offer history. That is a V2 question, not a defect.

**Snapping must stay idempotent.** `fn_snap_coordinate` derives the longitude cell from the *snapped* latitude, not the input. Deriving it from the input made re-snapping walk the point across the grid on every write, and a coordinate that moves leaks position the same way random jitter does. Verified idempotent at 2× and 3× across latitudes −34° to 64°.

**A sweeper may assert `expired`, never `sold`.** Inherited from `close_expired_tournaments`: staleness is what a clock knows; a completed sale is not.

---

## Operational facts

**Cron:** `expire-stale-listings`, every 15 minutes, alongside the other sweepers.

**Migrations applied (9):**

```
20260908120000  marketplace_listings_anon_column_grants
20260909120000  marketplace_pickup_location
20260909180000  marketplace_fulfillment_filter
20260909200000  marketplace_listing_status_expired      (enum value, must be its own txn)
20260909200100  marketplace_listing_lifecycle
20260909210000  marketplace_listing_expiry_30_days      (supersedes the 60-day default)
20260909220000  marketplace_saved_listings
20260909230000  marketplace_price_drop_notifications
```

**Two ledger caveats.** All of these were applied through the Supabase MCP tool, which stamps its own version, so **every ledger version differs from its repo filename**. Additionally the ledger contains `20260909100314 marketplace_snap_coordinate_idempotency_fix`, which has **no repo file** — that correction was folded into `20260909120000_marketplace_pickup_location.sql` instead. The repo produces the correct end state; the ledger simply has one extra row. See `docs/DB_MIGRATION_RECONCILIATION.md`.

**Before publishing an OTA**, run the fingerprint-input check in `MOBILE_BUILD_CHECKLIST.md` → "OTA vs rebuild". `package.json`'s **scripts block** is a fingerprint input; adding a script silently orphans every future update.

---

## Not done, and why

| | |
| --- | --- |
| **Clustering / area counts (audit Phase 4)** | Needs density that does not exist. Revisit when pins actually overlap; that is also when the bounds RPC earns its place. |
| **Viewport caching** | Minor at current volume. |
| **Full component extraction (audit Phase 2)** | `ExploreMap` was generalised additively. The full `MapDetailSheet` / `useMapAreaSearch` extraction pays off when a third surface wants a map. |
| **Offer records** | See above — V1 is chat by design. |
| **Seller ratings** | Reviews exist for facilities and coaches; nothing ties them to a completed sale. |
| **Nearby's own geo defect** | `fetchNearbyPlayEvents` / `fetchNearbyTournaments` take **no coordinates** — "nearby" is a name, not a behaviour, and an event without a facility is silently invisible on the map. Re-audited 2026-09-09: 6 events and 4 tournaments, all with facilities, all within 13 miles, so the architecture is wrong but the behaviour currently is not. **Trigger points:** more than ~20 open events or tournaments (truncation starts hiding the nearest, silently), any event created without a facility, or anything beyond ~50 miles. |

---

## Testing notes

- The map, saved listings and price-drop alerts were all verified on a physical iPhone via OTA to the `preview` channel.
- Price-drop delivery was proven end to end: Expo returned `{"status":"ok"}` and the notification arrived on a second user's device.
- Expiry cannot be observed in real time — the window is 30 days. To exercise it, pull one listing's `expires_at` to inside 7 days and wait for the next sweep.
