# facilities-osm

Finds pickleball venues from **OpenStreetMap courts** (the truth of where courts
exist), fills in details from **Google Places**, and writes CSVs for the existing
admin importer at `/admin/facility-import`. It never writes to Supabase.

The logic lives in `web/src/lib/facilityDiscovery/engine.ts`, shared with the
admin **Discover** tab (`/admin/facility-import` → Discover, backed by
`/api/admin/facility-discover`). Use the tab for a city; use this CLI for whole
states (on-disk cache, resumable). Needs Node 22.18+ (loads the engine with
built-in TypeScript stripping; the "MODULE_TYPELESS_PACKAGE_JSON" warning it
prints is harmless).

## Run

From the repo root:

```bash
# 1. Dry run: OpenStreetMap + DreamBreaker comparison only, no Google cost
node scripts/facilities-osm/discover.mjs --state FL --tile-deg 2

# 2. Real run: Google match, photos, addresses (capped at --max-google requests)
node scripts/facilities-osm/discover.mjs --state FL --tile-deg 2 --google --max-google 2000
```

Custom area: `--bbox south,west,north,east --label name`.

Needs `GOOGLE_PLACES_API_KEY` in the repo-root `.env.local` (gitignored) with
**Places API (New)** and **Geocoding API** enabled on the key's project. Supabase
is read with the public anon key from `apps/mobile/.env`.

Re-running is cheap: Overpass and Google responses are cached in `cache/`
(gitignored), so an interrupted run resumes without paying twice.

## Snapshots (what the Discover tab reads)

The public Overpass servers are often overloaded, so the Discover tab reads a
committed snapshot per state from `web/src/lib/facilityDiscovery/snapshots/`
and only goes live outside those states. Refresh a state monthly or so:

```bash
node scripts/facilities-osm/discover.mjs --state FL --tile-deg 2 --refresh-osm --write-snapshot
```

Then add a new state's JSON to `snapshots/index.ts`, commit, and deploy.

## No Overpass (Geofabrik download) — preferred for whole states

Overpass went down for everyone on 2026-11-25 (PC, Vercel and a third network
all timed out). A state's full OSM extract from Geofabrik gives the same courts
without it (verified: FL matched the Overpass snapshot court-for-court).

```bash
# 1. Download into the gitignored cache and check the published md5
curl -L -o scripts/facilities-osm/cache/pbf/north-carolina.osm.pbf \
  https://download.geofabrik.de/north-america/us/north-carolina-latest.osm.pbf
curl -L https://download.geofabrik.de/north-america/us/north-carolina-latest.osm.pbf.md5

# 2. Extract courts + naming areas (pyosmium in a venv outside the repo; NC ~30 s)
<venv python> -I scripts/facilities-osm/pbf-extract.py scripts/facilities-osm/cache/pbf/north-carolina.osm.pbf scripts/facilities-osm/cache/pbf/NC-elements.json

# 3. Snapshot for the Discover tab, and/or a normal CLI run (dry or --google)
node scripts/facilities-osm/discover.mjs --state NC --elements scripts/facilities-osm/cache/pbf/NC-elements.json --write-snapshot
node scripts/facilities-osm/discover.mjs --state NC --elements scripts/facilities-osm/cache/pbf/NC-elements.json --google
```

A state download holds only that state, so courts just over the border (inside
the state's bbox) are left out; Overpass runs included them. `--from-snapshot`
reruns the CLI from a committed snapshot without any download.

## Output (`out/<label>-<date>/`)

| File | What it is |
| --- | --- |
| `import-matched.csv` | Court sites matched to a Google place: name, address, phone, website, photos, court count. Upload this. |
| `import-unmatched.csv` | Court sites with no acceptable Google place: OSM name (or "Pickleball Courts") + reverse-geocoded address, no `google_place_id`. Review before uploading. |
| `pending-sites.csv` | Sites not looked up yet (dry run, or the `--max-google` cap was reached). |
| `existing-court-counts.csv` | DreamBreaker facilities that OSM has courts for: suggested `court_count` backfill. |
| `summary.json` | Counts for the run. |

## Rules

- Courts within 120 m form one site; a site within 300 m of an existing
  DreamBreaker facility counts as already listed.
- The Google match must be within 150 m and must not be lodging, a store, a
  restaurant, an office, a church, a museum or a rental. A name containing
  "pickle" wins; otherwise the nearest park, club or sports venue wins.
- Two sites matching one Google place are merged (court counts added).
- Private courts (OSM `access=private/members/customers`) are kept and marked
  `membership_required=true`; the owner lists any venue where pickleball is played.
- Every row carries `notes` crediting © OpenStreetMap contributors (ODbL). The
  app must also show that credit wherever OSM-derived venues appear.
