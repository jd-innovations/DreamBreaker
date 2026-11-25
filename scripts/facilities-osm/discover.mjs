#!/usr/bin/env node
/*
  Facility discovery CLI: OpenStreetMap pickleball courts -> Google Places
  details -> CSV files for the admin importer (/admin/facility-import).

  The logic lives in web/src/lib/facilityDiscovery/engine.ts, shared with the
  admin "Discover" tab, so both produce identical rows. This file only does the
  I/O the browser tab can't: whole-state runs, an on-disk cache, local CSVs.

  Read-only everywhere: nothing is written to Supabase. Needs Node 22.18+ /
  24 (loads the engine with built-in TypeScript stripping).

  Usage (from repo root):
    node scripts/facilities-osm/discover.mjs --state FL --tile-deg 2               # dry run, no Google calls
    node scripts/facilities-osm/discover.mjs --state FL --tile-deg 2 --google      # match + photos via Google
    node scripts/facilities-osm/discover.mjs --bbox 27.38,-82.72,27.56,-82.42 --label bradenton --google

  Flags:
    --state XX            built-in bounding box (see STATES in the engine)
    --bbox s,w,n,e        custom bounding box (decimal degrees)
    --label name          output folder label (default: state or "bbox")
    --google              call Google Places (needs GOOGLE_PLACES_API_KEY)
    --max-google N        hard cap on Google requests this run (default 400)
    --refresh-osm         ignore cached Overpass responses
    --tile-deg D          Overpass tile size in degrees (default 0.5; 2 is fine for one state)
    --skip-failed         keep going when a tile can't be downloaded (listed in summary.json;
                          re-run later without it to fill them in)
    --elements FILE       read courts from pbf-extract.py output instead of Overpass
                          (see README "No Overpass"); trimmed to the state/bbox
    --from-snapshot       with --state: read the committed Discover snapshot instead of Overpass
    --write-snapshot      with --state: save the courts as the Discover tab's snapshot
                          (web/src/lib/facilityDiscovery/snapshots/<STATE>.json), then commit it

  Secrets: GOOGLE_PLACES_API_KEY from the environment or the repo-root
  .env.local (gitignored). It is sent only to Google hosts, never logged or
  cached (errors are redacted). Supabase is read with the PUBLIC anon key from
  apps/mobile/.env (RLS-bound, select only).
*/

import fs from 'node:fs';
import path from 'node:path';
import * as E from '../../web/src/lib/facilityDiscovery/engine.ts';

const ROOT = process.cwd();
const TOOL_DIR = path.join(ROOT, 'scripts', 'facilities-osm');
const CACHE_DIR = path.join(TOOL_DIR, 'cache');

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : undefined;
}
const has = (flag) => process.argv.includes(flag);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return out;
}

const apiKeyFromEnv = () => process.env.GOOGLE_PLACES_API_KEY || readEnvFile(path.join(ROOT, '.env.local')).GOOGLE_PLACES_API_KEY;
const redact = (msg) => {
  const k = apiKeyFromEnv();
  return k ? String(msg).split(k).join('[redacted]') : String(msg);
};

async function fetchChecked(url, init = {}, { timeoutMs = 120000, maxBytes = 200 * 1024 * 1024 } = {}) {
  const host = new URL(url).hostname;
  if (!E.ALLOWED_HOSTS.has(host)) throw new Error(`refusing to fetch non-allowlisted host ${host}`);
  const res = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new Error(`response from ${host} exceeded ${maxBytes} bytes`);
  return { status: res.status, text: buf.toString('utf8') };
}

async function cached(file, load) {
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const json = await load();
  if (json != null) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(json));
  }
  return json;
}

// ---------- OpenStreetMap ----------

async function overpass(query, cacheKey) {
  const file = path.join(CACHE_DIR, 'osm', `${cacheKey}.json`);
  if (has('--refresh-osm') && fs.existsSync(file)) fs.rmSync(file);
  return cached(file, async () => {
    for (let attempt = 0; attempt < (has('--skip-failed') ? 2 : 6); attempt += 1) {
      for (const base of E.OVERPASS_ENDPOINTS) {
        try {
          const { status, text } = await fetchChecked(`${base}?data=${encodeURIComponent(query)}`, { headers: { 'User-Agent': 'facility-osm-tool/1.0' } });
          if (status === 200) return JSON.parse(text);
        } catch {
          /* next mirror */
        }
      }
      await sleep(15000 * (attempt + 1));
    }
    throw new Error(`Overpass failed for ${cacheKey} after retries`);
  });
}

const skippedTiles = [];

async function loadOsm(bbox, tileDeg) {
  const courts = [];
  const areas = [];
  const ts = E.tiles(bbox, tileDeg);
  for (const [i, t] of ts.entries()) {
    const key = `t_${t.join('_')}`;
    let c;
    try {
      c = await overpass(E.courtsQuery(t), `${key}_courts`);
    } catch (err) {
      if (!has('--skip-failed')) throw err;
      skippedTiles.push(t);
      continue;
    }
    courts.push(...(c.elements ?? []));
    if ((c.elements ?? []).length) {
      try {
        const a = await overpass(E.areasQuery(t), `${key}_areas`);
        areas.push(...(a.elements ?? []));
      } catch (err) {
        if (!has('--skip-failed')) throw err; // names only: courts still count
      }
    }
    process.stdout.write(`\rOSM tiles ${i + 1}/${ts.length}  courts ${courts.length}`);
  }
  process.stdout.write('\n');
  return { courts, areas };
}

// ---------- DreamBreaker (read-only) ----------

async function loadExisting([s, w, n, e]) {
  const env = { ...readEnvFile(path.join(ROOT, 'apps', 'mobile', '.env')), ...process.env };
  const url = env.EXPO_PUBLIC_SUPABASE_URL;
  const key = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY not found (apps/mobile/.env)');
  const out = [];
  for (let from = 0; ; from += 1000) {
    const q = `${url}/rest/v1/facilities?select=id,google_place_id,name,latitude,longitude,court_count&latitude=gte.${s}&latitude=lte.${n}&longitude=gte.${w}&longitude=lte.${e}&order=id`;
    const res = await fetch(q, { headers: { apikey: key, Range: `${from}-${from + 999}` }, signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new Error(`Supabase read failed: ${res.status}`);
    const page = await res.json();
    out.push(...page);
    if (page.length < 1000) break;
  }
  return out.filter((f) => f.latitude != null && f.longitude != null);
}

// ---------- Google (capped + cached) ----------

let googleCalls = 0;
function google(kind, site, makeRequest) {
  const [lat, lon] = site.center;
  const file = path.join(CACHE_DIR, 'google', kind, `${lat.toFixed(5)}_${lon.toFixed(5)}.json`);
  return cached(file, async () => {
    if (googleCalls >= Number(arg('--max-google') ?? 400)) return null;
    googleCalls += 1;
    const { status, text } = await makeRequest();
    if (status === 429 || status >= 500) throw new Error(`Google ${kind} returned ${status}; stopping (cache keeps finished work)`);
    if (status !== 200) throw new Error(`Google ${kind} returned ${status}: ${text.slice(0, 300)}`);
    const json = JSON.parse(text);
    // The Geocoding API reports key/quota problems in a 200 body; never cache those.
    if (json.status && !['OK', 'ZERO_RESULTS'].includes(json.status)) throw new Error(`Google ${kind} status ${json.status}`);
    return json;
  });
}

// ---------- main ----------
// No Overpass: --elements <file> reads pbf-extract.py output (a Geofabrik state
// download), --from-snapshot reads the committed Discover snapshot for --state.
// Both are trimmed to the run's bbox so a --bbox run still means that area.
function loadLocalOsm(state, [s, w, n, e]) {
  const inBox = (p) => p && s <= p.lat && p.lat <= n && w <= p.lon && p.lon <= e;
  const overlaps = (b) => b && b.minlat <= n && b.maxlat >= s && b.minlon <= e && b.maxlon >= w;
  if (arg('--elements')) {
    const data = JSON.parse(fs.readFileSync(arg('--elements'), 'utf8'));
    if (!Array.isArray(data.courts) || !Array.isArray(data.areas)) throw new Error('--elements file must hold { courts: [], areas: [] }');
    const courts = data.courts.filter((c) => inBox(c.center ?? { lat: c.lat, lon: c.lon }));
    const areas = data.areas.filter((a) => overlaps(a.bounds));
    console.log(`OSM from ${path.basename(arg('--elements'))}: ${courts.length} courts, ${areas.length} named areas`);
    return { courts, areas };
  }
  if (has('--from-snapshot')) {
    const file = path.join(ROOT, 'web', 'src', 'lib', 'facilityDiscovery', 'snapshots', `${state}.json`);
    if (!state || !fs.existsSync(file)) throw new Error(`--from-snapshot: no snapshot for ${state ?? '(no --state)'}`);
    const out = E.fromSnapshot(JSON.parse(fs.readFileSync(file, 'utf8')), [s, w, n, e]);
    console.log(`OSM from snapshot ${state}.json: ${out.courts.length} courts`);
    return out;
  }
  return null;
}

async function main() {
  const state = arg('--state')?.toUpperCase();
  const bbox = arg('--bbox') ? arg('--bbox').split(',').map(Number) : E.STATES[state];
  if (!E.isValidBBox(bbox)) {
    console.error('Give --state XX (one of ' + Object.keys(E.STATES).join(', ') + ') or --bbox s,w,n,e');
    process.exit(1);
  }
  const label = (arg('--label') ?? state ?? 'bbox').replace(/[^A-Za-z0-9_-]/g, '');
  const outDir = path.join(TOOL_DIR, 'out', `${label}-${new Date().toISOString().slice(0, 10)}`);
  fs.mkdirSync(outDir, { recursive: true });

  const { courts, areas } = loadLocalOsm(state, bbox) ?? await loadOsm(bbox, Number(arg('--tile-deg') ?? 0.5));
  if (has('--write-snapshot')) {
    if (!state || arg('--bbox')) { console.error('--write-snapshot needs --state (and no --bbox)'); process.exit(1); }
    const snap = E.buildSnapshot(state, bbox, courts, areas, new Date().toISOString().slice(0, 10));
    const file = path.join(ROOT, 'web', 'src', 'lib', 'facilityDiscovery', 'snapshots', `${state}.json`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(snap));
    console.log(`Snapshot: ${snap.courts.length} courts, ${snap.areas.length} named areas -> ${path.relative(ROOT, file)} (${Math.round(fs.statSync(file).size / 1024)} KB)`);
  }
  const sites = E.clusterSites(courts);
  E.nameSites(sites, areas);
  console.log(`OSM: ${courts.length} courts -> ${sites.length} sites`);

  const existing = await loadExisting(bbox);
  const { fresh, backfill } = E.splitExisting(sites, existing);
  console.log(`DreamBreaker facilities in area: ${existing.length}; already listed sites: ${sites.length - fresh.length}; new: ${fresh.length}`);

  const useGoogle = has('--google');
  const apiKey = useGoogle ? apiKeyFromEnv() : null;
  if (useGoogle && !apiKey) {
    console.error('GOOGLE_PLACES_API_KEY is not set (env or repo-root .env.local)');
    process.exit(1);
  }

  const existingIds = new Set(existing.map((f) => f.google_place_id).filter(Boolean));
  const matched = [];
  const unmatchedSites = [];
  const pending = [];
  let stopped = null;

  for (const [i, s] of fresh.entries()) {
    if (!useGoogle || stopped) { pending.push(s); continue; }
    let res;
    try {
      res = await google('nearby', s, () => {
        const { url, init } = E.nearbyRequest(apiKey, s);
        return fetchChecked(url, init, { timeoutMs: 30000, maxBytes: 5 * 1024 * 1024 });
      });
    } catch (err) {
      stopped = err.message;
      pending.push(s);
      continue;
    }
    if (res === null) { pending.push(s); continue; }
    const pick = E.pickPlace(res.places, s);
    if (!pick) unmatchedSites.push(s);
    else if (!existingIds.has(pick.id)) matched.push(E.rowFromPlace(pick, s));
    process.stdout.write(`\rGoogle: ${i + 1}/${fresh.length}  matched ${matched.length}  unmatched ${unmatchedSites.length}  calls ${googleCalls}`);
  }
  if (useGoogle) process.stdout.write('\n');

  const unmatched = [];
  for (const s of unmatchedSites) {
    let geo = null;
    try {
      geo = await google('geocode', s, () => fetchChecked(E.reverseGeocodeUrl(apiKey, s), {}, { timeoutMs: 30000, maxBytes: 2 * 1024 * 1024 }));
    } catch (err) {
      stopped ??= err.message;
    }
    unmatched.push(E.rowFromGeocode(geo, s));
  }

  const rows = E.mergeByPlace(matched);
  fs.writeFileSync(path.join(outDir, 'import-matched.csv'), E.toCsv(rows), 'utf8');
  fs.writeFileSync(path.join(outDir, 'import-unmatched.csv'), E.toCsv(unmatched), 'utf8');
  fs.writeFileSync(path.join(outDir, 'pending-sites.csv'), E.toCsv(
    pending.map((s) => ({ latitude: s.center[0].toFixed(6), longitude: s.center[1].toFixed(6), osm_area_name: s.osmName, osm_court_count: s.pts.length, osm_ids: s.ids.join(';') })),
    ['latitude', 'longitude', 'osm_area_name', 'osm_court_count', 'osm_ids'],
  ), 'utf8');
  fs.writeFileSync(path.join(outDir, 'existing-court-counts.csv'), E.toCsv(backfill, ['facility_id', 'name', 'current_court_count', 'osm_court_count', 'distance_m']), 'utf8');

  const summary = {
    area: label, bbox, osm_courts: courts.length, osm_sites: sites.length,
    already_listed_sites: sites.length - fresh.length, existing_facilities_with_osm_counts: backfill.length,
    new_sites: fresh.length, google_used: useGoogle, google_requests_this_run: googleCalls,
    matched_rows: rows.length, matched_with_photos: rows.filter((r) => r.photos).length,
    unmatched_rows: unmatched.length, pending_sites: pending.length,
    estimated_google_requests_for_pending: pending.length * 2,
    stopped_early: stopped ? redact(stopped) : null,
    skipped_osm_tiles: skippedTiles,
  };
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Output: ${outDir}`);
}

main().catch((err) => {
  console.error(redact(err.message));
  process.exit(1);
});
