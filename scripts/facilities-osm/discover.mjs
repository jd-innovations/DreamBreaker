#!/usr/bin/env node
/*
  Facility discovery: OpenStreetMap pickleball courts -> Google Places details
  -> CSV files for the existing admin importer (/admin/facility-import).

  Read-only everywhere. Nothing is written to Supabase; the owner uploads the
  CSV through the admin importer, which stays the only write path.

  Usage (from repo root):
    node scripts/facilities-osm/discover.mjs --state FL               # dry run, no Google calls
    node scripts/facilities-osm/discover.mjs --state FL --google      # match + photos via Google
    node scripts/facilities-osm/discover.mjs --bbox 27.05,-82.75,27.60,-82.30 --label sarasota --google

  Flags:
    --state XX            built-in bounding box (see STATES)
    --bbox s,w,n,e        custom bounding box (decimal degrees)
    --label name          output folder label (default: state or "bbox")
    --google              call Google Places (needs GOOGLE_PLACES_API_KEY)
    --max-google N        hard cap on Google requests this run (default 400)
    --refresh-osm         ignore cached Overpass responses
    --tile-deg D          Overpass tile size in degrees (default 0.5; 2 is fine for one state)

  Secrets: GOOGLE_PLACES_API_KEY is read from the environment or the repo-root
  .env.local (gitignored). It is only ever sent in the X-Goog-Api-Key header to
  places.googleapis.com / maps.googleapis.com and never logged or cached.
  Supabase is read with the PUBLIC anon key from apps/mobile/.env (RLS-bound,
  select only).

  Security design notes (rafter-secure-design, 2026-11-24):
  - Outbound fetches go to a fixed host allowlist (HOSTS); no URL comes from
    input, so there is no SSRF surface.
  - Every external response is untrusted: text is trimmed, stripped of control
    characters, length-capped, and stripped of leading = + @ (CSV formula
    injection when the owner opens the file in Excel). Websites must be http(s).
    Photo names must match the importer's resource-name regex.
  - Cost guard: --max-google caps paid requests; Google responses are cached on
    disk (cache/, gitignored) so re-runs do not pay twice. The cache holds
    response bodies only, never the key.
*/

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TOOL_DIR = path.join(ROOT, 'scripts', 'facilities-osm');
const CACHE_DIR = path.join(TOOL_DIR, 'cache');

const STATES = {
  FL: [24.3, -87.7, 31.1, -79.8],
  TX: [25.8, -106.7, 36.6, -93.5],
  GA: [30.3, -85.7, 35.1, -80.8],
  AZ: [31.3, -114.9, 37.1, -109.0],
  NC: [33.8, -84.4, 36.6, -75.4],
  SC: [32.0, -83.4, 35.3, -78.5],
  CA: [32.5, -124.5, 42.1, -114.1],
};

const HOSTS = new Set([
  'lz4.overpass-api.de',
  'z.overpass-api.de',
  'overpass-api.de',
  'places.googleapis.com',
  'maps.googleapis.com',
]);
const OVERPASS = [
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];

const CLUSTER_M = 120; // courts closer than this form one site
const GOOGLE_RADIUS_M = 150; // how far a Google place may sit from the courts
const EXISTING_M = 300; // site within this of a DreamBreaker facility = already listed
const TILE_DEG = Number(arg("--tile-deg") ?? 0.5);

// Google candidates we never accept as the venue for a court site.
const BAD_TYPES = /lodging|hotel|motel|\binn\b|store|restaurant|cafe|bar\b|night_club|office|real_estate|insurance|car_|apartment|condominium|church|place_of_worship|museum|library|performing_arts|school_district/i;
const BAD_NAMES = /residence hall|dormitory|student housing|apartments?|entire (place|home)|vacation|retreat|airbnb|bedroom|\bBR\b|heated pool|getaway|suites?\b|ballet|performing arts|museum|theat(er|re)|church|library/i;
const VENUE_TYPES = /park|sports|athletic|tennis|golf|country_club|community_center|recreation|fitness|gym|club|school|university|stadium|playground|campground|rv_park|mobile_home_park/i;
// A name that says nothing beyond "a court" (e.g. "Tennis court", "Pickleball ct").
const GENERIC_WORDS = new Set(['the', 'public', 'pickleball', 'pickle', 'ball', 'tennis', 'basketball', 'ten', 'and', 'court', 'courts', 'ct', 'cts', 'sport', 'sports']);
const isGeneric = (name) => !String(name ?? '').toLowerCase().split(/[^a-z]+/).filter(Boolean).some((w) => !GENERIC_WORDS.has(w));
const courtsName = (area, street, city) =>
  area ? `${area} Pickleball Courts` : street ? `Pickleball Courts – ${street}${city ? `, ${city}` : ''}` : 'Pickleball Courts';
const PHOTO_NAME = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

// ---------- small helpers ----------

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : undefined;
}
const has = (flag) => process.argv.includes(flag);

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function haversine(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Untrusted text -> safe CSV cell value. */
function clean(v, max = 200) {
  if (v == null) return '';
  let s = String(v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/^[=+\-@]+/, '').trim();
  return s.slice(0, max);
}
function cleanUrl(v) {
  const s = clean(v, 500);
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : '';
  } catch {
    return '';
  }
}

async function fetchChecked(url, init, { timeoutMs = 120000, maxBytes = 200 * 1024 * 1024 } = {}) {
  const host = new URL(url).hostname;
  if (!HOSTS.has(host)) throw new Error(`refusing to fetch non-allowlisted host ${host}`);
  const res = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new Error(`response from ${host} exceeded ${maxBytes} bytes`);
  return { status: res.status, text: buf.toString('utf8') };
}

function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function writeCsv(file, cols, rows) {
  const lines = [cols.join(',')];
  for (const r of rows) lines.push(cols.map((c) => csvCell(r[c])).join(','));
  fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8');
}

// ---------- 1. OpenStreetMap ----------

function tiles([s, w, n, e]) {
  const out = [];
  for (let lat = s; lat < n; lat += TILE_DEG) {
    for (let lon = w; lon < e; lon += TILE_DEG) {
      out.push([lat, lon, Math.min(lat + TILE_DEG, n), Math.min(lon + TILE_DEG, e)].map((x) => +x.toFixed(4)));
    }
  }
  return out;
}

async function overpass(query, cacheKey) {
  const file = path.join(CACHE_DIR, 'osm', `${cacheKey}.json`);
  if (!has('--refresh-osm') && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  for (let attempt = 0; attempt < 6; attempt += 1) {
    for (const base of OVERPASS) {
      try {
        const { status, text } = await fetchChecked(`${base}?data=${encodeURIComponent(query)}`, {
          headers: { 'User-Agent': 'facility-osm-tool/1.0' },
        });
        if (status === 200) {
          const json = JSON.parse(text);
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, JSON.stringify(json));
          return json;
        }
      } catch {
        /* try next mirror */
      }
    }
    await sleep(15000 * (attempt + 1));
  }
  throw new Error(`Overpass failed for ${cacheKey} after retries`);
}

async function loadCourts(bbox) {
  const courts = new Map();
  const areas = new Map();
  const ts = tiles(bbox);
  for (const [i, t] of ts.entries()) {
    const b = t.join(',');
    const key = `t_${t.join('_')}`;
    const c = await overpass(`[out:json][timeout:120];nwr[sport~pickleball](${b});out center tags;`, `${key}_courts`);
    for (const el of c.elements ?? []) courts.set(`${el.type[0]}${el.id}`, el);
    if ((c.elements ?? []).length) {
      const a = await overpass(
        `[out:json][timeout:120];(nwr[leisure~"^(park|sports_centre|recreation_ground|golf_course|resort|fitness_centre|pitch)$"][name](${b});nwr[landuse=residential][name](${b});nwr[amenity~"^(community_centre|school|college|university)$"][name](${b});nwr[club][name](${b});nwr[tourism~"^(camp_site|caravan_site)$"][name](${b}););out bb tags;`,
        `${key}_areas`,
      );
      for (const el of a.elements ?? []) if (el.bounds) areas.set(`${el.type[0]}${el.id}`, el);
    }
    process.stdout.write(`\rOSM tiles ${i + 1}/${ts.length}  courts ${courts.size}`);
  }
  process.stdout.write('\n');
  return { courts: [...courts.entries()], areas: [...areas.values()] };
}

function clusterSites(courts) {
  const cell = (p) => `${Math.floor(p[0] / 0.002)}:${Math.floor(p[1] / 0.002)}`;
  const grid = new Map();
  const sites = [];
  for (const [id, el] of courts) {
    const c = el.center ?? el;
    const p = [c.lat, c.lon];
    const [gx, gy] = cell(p).split(':').map(Number);
    let site = null;
    for (let dx = -1; dx <= 1 && !site; dx += 1) {
      for (let dy = -1; dy <= 1 && !site; dy += 1) {
        for (const s of grid.get(`${gx + dx}:${gy + dy}`) ?? []) {
          if (haversine(s.center, p) < CLUSTER_M) { site = s; break; }
        }
      }
    }
    const t = el.tags ?? {};
    if (!site) {
      site = { center: p, pts: [], ids: [], lit: false, surfaces: [], access: [] };
      sites.push(site);
      const k = cell(p);
      grid.set(k, [...(grid.get(k) ?? []), site]);
    }
    site.pts.push(p);
    site.ids.push(id);
    site.lit ||= t.lit === 'yes';
    if (t.surface) site.surfaces.push(t.surface);
    site.access.push(t.access ?? '');
    site.center = [site.pts.reduce((a, q) => a + q[0], 0) / site.pts.length, site.pts.reduce((a, q) => a + q[1], 0) / site.pts.length];
  }
  return sites;
}

const AREA_RANK = { park: 0, sports_centre: 0, recreation_ground: 0, community_centre: 1, golf_course: 2, resort: 2, club: 2, camp_site: 2, caravan_site: 2, school: 3, college: 3, university: 3, residential: 4 };
function nameSites(sites, areas) {
  for (const s of sites) {
    const [lat, lon] = s.center;
    const inside = areas.filter((a) => a.bounds.minlat <= lat && lat <= a.bounds.maxlat && a.bounds.minlon <= lon && lon <= a.bounds.maxlon && a.tags?.leisure !== 'pitch');
    const kind = (a) => a.tags.leisure ?? a.tags.amenity ?? a.tags.tourism ?? (a.tags.club ? 'club' : a.tags.landuse);
    const size = (a) => (a.bounds.maxlat - a.bounds.minlat) * (a.bounds.maxlon - a.bounds.minlon);
    inside.sort((a, b) => (AREA_RANK[kind(a)] ?? 5) - (AREA_RANK[kind(b)] ?? 5) || size(a) - size(b));
    s.osmName = inside[0] ? clean(inside[0].tags.name, 120) : '';
  }
}

// ---------- 2. DreamBreaker (read-only) ----------

async function loadExisting(bbox) {
  const env = { ...readEnvFile(path.join(ROOT, 'apps', 'mobile', '.env')), ...process.env };
  const url = env.EXPO_PUBLIC_SUPABASE_URL;
  const key = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY not found (apps/mobile/.env)');
  const [s, w, n, e] = bbox;
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

// ---------- 3. Google Places ----------

let googleCalls = 0;
async function google(kind, cacheKey, makeRequest) {
  const file = path.join(CACHE_DIR, 'google', kind, `${cacheKey}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const cap = Number(arg('--max-google') ?? 400);
  if (googleCalls >= cap) return null;
  googleCalls += 1;
  const { status, text } = await makeRequest();
  if (status === 429 || status >= 500) throw new Error(`Google ${kind} returned ${status}; stopping (cache keeps finished work)`);
  if (status !== 200) throw new Error(`Google ${kind} returned ${status}: ${text.slice(0, 300)}`);
  const json = JSON.parse(text);
  // The Geocoding API reports key/quota problems in a 200 body; never cache those.
  if (json.status && !['OK', 'ZERO_RESULTS'].includes(json.status)) throw new Error(`Google ${kind} status ${json.status}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(json));
  return json;
}

const PLACE_FIELDS = [
  'id', 'displayName', 'formattedAddress', 'addressComponents', 'location', 'nationalPhoneNumber',
  'websiteUri', 'googleMapsUri', 'types', 'primaryType', 'primaryTypeDisplayName', 'photos',
  'regularOpeningHours.weekdayDescriptions', 'businessStatus',
];

function nearby(apiKey, site) {
  const [lat, lon] = site.center;
  return google('nearby', `${lat.toFixed(5)}_${lon.toFixed(5)}`, () =>
    fetchChecked('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': PLACE_FIELDS.map((f) => `places.${f}`).join(',') },
      body: JSON.stringify({ maxResultCount: 20, rankPreference: 'DISTANCE', locationRestriction: { circle: { center: { latitude: lat, longitude: lon }, radius: GOOGLE_RADIUS_M } } }),
    }, { timeoutMs: 30000, maxBytes: 5 * 1024 * 1024 }),
  );
}

function reverseGeocode(apiKey, site) {
  const [lat, lon] = site.center;
  return google('geocode', `${lat.toFixed(5)}_${lon.toFixed(5)}`, () =>
    // The Geocoding API takes the key as a query parameter; this URL is never logged.
    fetchChecked(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&result_type=street_address|route|premise&key=${encodeURIComponent(apiKey)}`, {}, { timeoutMs: 30000, maxBytes: 2 * 1024 * 1024 }),
  );
}

function acceptable(place) {
  const name = place.displayName?.text ?? '';
  const types = [...(place.types ?? []), place.primaryType ?? ''].join(' ');
  if (place.businessStatus === 'CLOSED_PERMANENTLY') return false;
  if (BAD_NAMES.test(name) || BAD_TYPES.test(types)) return false;
  return /pickle/i.test(name) || VENUE_TYPES.test(types);
}

const comp = (place, type, short = false) => {
  const c = (place.addressComponents ?? place.address_components ?? []).find((x) => x.types?.includes(type));
  return c ? (short ? c.shortText ?? c.short_name : c.longText ?? c.long_name) : '';
};

// ---------- 4. Rows ----------

const COLS = [
  'facility_name', 'address_line_1', 'city', 'state', 'zip', 'country', 'latitude', 'longitude', 'phone',
  'website_url', 'google_place_id', 'google_maps_url', 'google_types', 'primary_type', 'primary_type_label',
  'photos', 'photos_count', 'hours_summary', 'total_courts', 'lighting', 'court_surface', 'membership_required',
  'source', 'notes', 'osm_ids', 'osm_court_count', 'osm_area_name',
];

function siteFacts(site) {
  const surface = Object.entries(site.surfaces.reduce((m, x) => ({ ...m, [x]: (m[x] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  const priv = site.access.filter((a) => ['private', 'customers', 'members'].includes(a)).length * 2 > site.access.length;
  return {
    total_courts: site.pts.length,
    lighting: site.lit ? 'true' : '',
    court_surface: clean(surface, 40),
    membership_required: priv ? 'true' : '',
    osm_ids: [...site.ids].sort().join(';'),
    osm_court_count: site.pts.length,
    osm_area_name: site.osmName,
    notes: 'Pickleball courts confirmed via OpenStreetMap (© OpenStreetMap contributors)',
  };
}

function rowFromPlace(place, site) {
  const photos = (place.photos ?? [])
    .filter((p) => PHOTO_NAME.test(p.name ?? ''))
    .slice(0, 10)
    .map((p) => ({ name: p.name, widthPx: p.widthPx, heightPx: p.heightPx }));
  const route = comp(place, 'route');
  const city = comp(place, 'locality') || comp(place, 'postal_town') || comp(place, 'administrative_area_level_3');
  const generic = isGeneric(place.displayName?.text);
  // Generic court listings are usually amenities inside a residential community, where
  // the house number Google attaches can be a private home. Publish the street only.
  const street = generic ? route : [comp(place, 'street_number'), route].filter(Boolean).join(' ');
  return {
    facility_name: clean(generic ? courtsName(site.osmName, route, city) : place.displayName?.text, 120),
    address_line_1: clean(street || (generic ? '' : place.formattedAddress?.split(',')[0]), 160),
    city: clean(city, 80),
    state: clean(comp(place, 'administrative_area_level_1', true), 10),
    zip: clean(comp(place, 'postal_code'), 12),
    country: 'US',
    latitude: place.location?.latitude,
    longitude: place.location?.longitude,
    phone: clean(place.nationalPhoneNumber, 30),
    website_url: cleanUrl(place.websiteUri),
    google_place_id: clean(place.id, 200),
    google_maps_url: cleanUrl(place.googleMapsUri),
    google_types: (place.types ?? []).map((t) => clean(t, 60)).join(','),
    primary_type: clean(place.primaryType, 60),
    primary_type_label: clean(place.primaryTypeDisplayName?.text, 80),
    photos: photos.length ? JSON.stringify(photos) : '',
    photos_count: photos.length,
    hours_summary: clean((place.regularOpeningHours?.weekdayDescriptions ?? []).join('; '), 400),
    source: 'osm+google_places',
    ...siteFacts(site),
  };
}

function rowFromGeocode(geo, site) {
  const r = geo?.results?.[0];
  // Reverse geocoding snaps to the nearest house; a house number here could publish a
  // private home address as a venue. Street name only.
  const street = r ? comp(r, 'route') : '';
  const city = r ? comp(r, 'locality') || comp(r, 'postal_town') || comp(r, 'administrative_area_level_3') : '';
  return {
    facility_name: clean(site.osmName ? site.osmName : courtsName('', street, city), 120),
    address_line_1: clean(street, 160),
    city: clean(city, 80),
    state: r ? clean(comp(r, 'administrative_area_level_1', true), 10) : '',
    zip: r ? clean(comp(r, 'postal_code'), 12) : '',
    country: 'US',
    latitude: +site.center[0].toFixed(6),
    longitude: +site.center[1].toFixed(6),
    google_place_id: '',
    source: 'osm',
    ...siteFacts(site),
  };
}

// ---------- main ----------

async function main() {
  const state = arg('--state')?.toUpperCase();
  const bbox = arg('--bbox') ? arg('--bbox').split(',').map(Number) : STATES[state];
  if (!bbox || bbox.length !== 4 || bbox.some((x) => !Number.isFinite(x))) {
    console.error('Give --state XX (one of ' + Object.keys(STATES).join(', ') + ') or --bbox s,w,n,e');
    process.exit(1);
  }
  const label = (arg('--label') ?? state ?? 'bbox').replace(/[^A-Za-z0-9_-]/g, '');
  const outDir = path.join(TOOL_DIR, 'out', `${label}-${new Date().toISOString().slice(0, 10)}`);
  fs.mkdirSync(outDir, { recursive: true });

  const { courts, areas } = await loadCourts(bbox);
  const sites = clusterSites(courts);
  nameSites(sites, areas);
  console.log(`OSM: ${courts.length} courts -> ${sites.length} sites`);

  const existing = await loadExisting(bbox);
  console.log(`DreamBreaker facilities in area: ${existing.length}`);

  // Sites already listed -> court-count suggestions for those facilities.
  const backfill = new Map();
  const fresh = [];
  for (const s of sites) {
    let best = null;
    for (const f of existing) {
      const d = haversine(s.center, [f.latitude, f.longitude]);
      if (d < EXISTING_M && (!best || d < best.d)) best = { f, d };
    }
    if (best) {
      const b = backfill.get(best.f.id) ?? { facility_id: best.f.id, name: clean(best.f.name, 120), current_court_count: best.f.court_count ?? 0, osm_court_count: 0, distance_m: Math.round(best.d) };
      b.osm_court_count += s.pts.length;
      backfill.set(best.f.id, b);
    } else fresh.push(s);
  }
  console.log(`Already listed: ${sites.length - fresh.length} sites (${backfill.size} facilities); new: ${fresh.length}`);

  const useGoogle = has('--google');
  const apiKey = useGoogle ? (process.env.GOOGLE_PLACES_API_KEY || readEnvFile(path.join(ROOT, '.env.local')).GOOGLE_PLACES_API_KEY) : null;
  if (useGoogle && !apiKey) {
    console.error('GOOGLE_PLACES_API_KEY is not set (env or repo-root .env.local)');
    process.exit(1);
  }

  const existingIds = new Set(existing.map((f) => f.google_place_id).filter(Boolean));
  const matched = new Map();
  const unmatched = [];
  const pending = [];
  let stopped = null;

  for (const [i, s] of fresh.entries()) {
    if (!useGoogle) { pending.push(s); continue; }
    let res;
    try {
      res = await nearby(apiKey, s);
    } catch (err) {
      stopped = err.message;
      pending.push(...fresh.slice(i));
      break;
    }
    if (res === null) { pending.push(s); continue; }
    const cands = (res.places ?? [])
      .filter(acceptable)
      .map((p) => ({ p, d: haversine(s.center, [p.location.latitude, p.location.longitude]) }))
      .sort((a, b) => (/pickle/i.test(b.p.displayName?.text ?? '') - /pickle/i.test(a.p.displayName?.text ?? '')) || a.d - b.d);
    const pick = cands[0]?.p;
    if (!pick) { unmatched.push(s); continue; }
    if (existingIds.has(pick.id)) continue; // listed under a different location
    const prev = matched.get(pick.id);
    if (prev) {
      // Two court clusters, one venue: merge them.
      prev.site.pts.push(...s.pts); prev.site.ids.push(...s.ids); prev.site.lit ||= s.lit;
      prev.site.surfaces.push(...s.surfaces); prev.site.access.push(...s.access);
    } else matched.set(pick.id, { place: pick, site: s });
    process.stdout.write(`\rGoogle: ${i + 1}/${fresh.length}  matched ${matched.size}  unmatched ${unmatched.length}  calls ${googleCalls}`);
  }
  if (useGoogle) process.stdout.write('\n');

  const rows = [...matched.values()].map(({ place, site }) => rowFromPlace(place, site));
  const unRows = [];
  for (const s of unmatched) {
    let geo = null;
    try { geo = await reverseGeocode(apiKey, s); } catch (err) { stopped ??= err.message; }
    unRows.push(rowFromGeocode(geo, s));
  }

  writeCsv(path.join(outDir, 'import-matched.csv'), COLS, rows);
  writeCsv(path.join(outDir, 'import-unmatched.csv'), COLS, unRows);
  writeCsv(path.join(outDir, 'pending-sites.csv'), ['latitude', 'longitude', 'osm_area_name', 'osm_court_count', 'osm_ids'],
    pending.map((s) => ({ latitude: s.center[0].toFixed(6), longitude: s.center[1].toFixed(6), osm_area_name: s.osmName, osm_court_count: s.pts.length, osm_ids: s.ids.join(';') })));
  writeCsv(path.join(outDir, 'existing-court-counts.csv'), ['facility_id', 'name', 'current_court_count', 'osm_court_count', 'distance_m'], [...backfill.values()]);

  const summary = {
    area: label, bbox, osm_courts: courts.length, osm_sites: sites.length,
    already_listed_sites: sites.length - fresh.length, existing_facilities_with_osm_counts: backfill.size,
    new_sites: fresh.length, google_used: useGoogle, google_requests_this_run: googleCalls,
    matched_rows: rows.length, matched_with_photos: rows.filter((r) => r.photos).length,
    unmatched_rows: unRows.length, pending_sites: pending.length,
    estimated_google_requests_for_pending: pending.length * 2,
    stopped_early: stopped ? redact(stopped) : null,
  };
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Output: ${outDir}`);
}

const redact = (msg) => {
  const k = process.env.GOOGLE_PLACES_API_KEY || readEnvFile(path.join(ROOT, '.env.local')).GOOGLE_PLACES_API_KEY;
  return k ? String(msg).split(k).join('[redacted]') : String(msg);
};

main().catch((err) => {
  console.error(redact(err.message));
  process.exit(1);
});
