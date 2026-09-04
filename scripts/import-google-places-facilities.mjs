#!/usr/bin/env node
/*
  Imports Google Places search results into a reviewable Supabase migration.

  Usage from repo root:
    $env:GOOGLE_PLACES_API_KEY="your_key"
    node scripts/import-google-places-facilities.mjs --market "Sarasota, FL" --market "Bradenton, FL" --market "Lakewood Ranch, FL"

  Or put this in .env.local, which is gitignored:
    GOOGLE_PLACES_API_KEY=your_key
*/

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'supabase', 'migrations');
const DEFAULT_MARKETS = ['Sarasota, FL', 'Bradenton, FL', 'Lakewood Ranch, FL'];
const DEFAULT_QUERIES = [
  'pickleball courts in {market}',
  'pickleball club in {market}',
  'public pickleball courts in {market}',
  'tennis club pickleball in {market}',
  'recreation center pickleball in {market}',
];

function loadDotEnvLocal() {
  const file = path.join(ROOT, '.env.local');
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}

function argsList(flag) {
  const out = [];
  for (let i = 2; i < process.argv.length; i += 1) {
    if (process.argv[i] === flag && process.argv[i + 1]) {
      out.push(process.argv[i + 1]);
      i += 1;
    }
  }
  return out;
}

function slugify(value) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

function sqlString(value) {
  if (value == null || value === '') return 'null';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '0';
}

function component(place, type, short = false) {
  const item = place.addressComponents?.find((c) => c.types?.includes(type));
  return short ? item?.shortText ?? null : item?.longText ?? null;
}

function normalizePlace(place) {
  const name = place.displayName?.text?.trim();
  const lat = place.location?.latitude;
  const lng = place.location?.longitude;
  if (!name || typeof lat !== 'number' || typeof lng !== 'number') return null;

  const streetNumber = component(place, 'street_number');
  const route = component(place, 'route');
  const address = [streetNumber, route].filter(Boolean).join(' ') || place.formattedAddress || 'Address unknown';
  const city = component(place, 'locality') || component(place, 'postal_town') || component(place, 'administrative_area_level_2') || 'Unknown';
  const state = component(place, 'administrative_area_level_1', true) || '';
  const postalCode = component(place, 'postal_code');
  const slug = slugify(`${name} ${city} ${state}`);

  return {
    google_place_id: place.id,
    data_source: 'google_places',
    name,
    slug,
    address,
    city,
    state,
    postal_code: postalCode,
    latitude: lat,
    longitude: lng,
    phone: place.nationalPhoneNumber ?? null,
    website: place.websiteUri ?? null,
    google_maps_uri: place.googleMapsUri ?? null,
    description: place.editorialSummary?.text ?? null,
  };
}

async function searchPlaces(apiKey, textQuery) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': [
        'places.id',
        'places.displayName',
        'places.formattedAddress',
        'places.addressComponents',
        'places.location',
        'places.nationalPhoneNumber',
        'places.websiteUri',
        'places.googleMapsUri',
        'places.editorialSummary',
      ].join(','),
    },
    body: JSON.stringify({ textQuery, maxResultCount: 20 }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}: ${JSON.stringify(body)}`);
  }
  return body.places ?? [];
}

function buildMigration(rows) {
  const values = rows.map((r) => `(
  ${sqlString(r.google_place_id)},
  ${sqlString(r.data_source)},
  ${sqlString(r.name)},
  ${sqlString(r.slug)},
  ${sqlString(r.address)},
  ${sqlString(r.city)}, ${sqlString(r.state)}, ${sqlString(r.postal_code)},
  ${sqlNumber(r.latitude)}, ${sqlNumber(r.longitude)},
  ${sqlString(r.phone)}, ${sqlString(r.website)}, ${sqlString(r.google_maps_uri)}, ${sqlString(r.description)},
  0, 0, 0,
  null, false, false, false, false,
  true, false, false,
  false, 'unclaimed'
)`).join(',\n');

  return `-- Facilities imported from Google Places. Review before marking verified=true.\n\ninsert into public.facilities (\n  google_place_id, data_source,\n  name, slug, address, city, state, postal_code,\n  latitude, longitude,\n  phone, website, google_maps_uri, description,\n  court_count, indoor_courts, outdoor_courts,\n  surface_type, lighting, restrooms, water, parking,\n  public_access, membership_required, bookable_by_public,\n  verified, claim_status\n) values\n${values}\non conflict (google_place_id) do update set\n  name = excluded.name,\n  address = excluded.address,\n  city = excluded.city,\n  state = excluded.state,\n  postal_code = excluded.postal_code,\n  latitude = excluded.latitude,\n  longitude = excluded.longitude,\n  phone = excluded.phone,\n  website = excluded.website,\n  google_maps_uri = excluded.google_maps_uri,\n  description = excluded.description,\n  data_source = excluded.data_source;\n`;
}

async function main() {
  loadDotEnvLocal();
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new Error('Missing GOOGLE_PLACES_API_KEY. Set it in PowerShell or .env.local.');
  }

  const markets = argsList('--market');
  const selectedMarkets = markets.length ? markets : DEFAULT_MARKETS;
  const seen = new Map();

  for (const market of selectedMarkets) {
    for (const template of DEFAULT_QUERIES) {
      const query = template.replace('{market}', market);
      console.log(`Searching: ${query}`);
      const places = await searchPlaces(apiKey, query);
      for (const place of places) {
        const normalized = normalizePlace(place);
        if (normalized?.google_place_id) seen.set(normalized.google_place_id, normalized);
      }
    }
  }

  const rows = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  if (!rows.length) throw new Error('No places returned from Google Places.');

  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const outFile = path.join(OUT_DIR, `${stamp}_google_places_facilities_import.sql`);
  fs.writeFileSync(outFile, buildMigration(rows));
  console.log(`\nWrote ${rows.length} facilities to ${outFile}`);
  console.log('Review that migration, then run: npx supabase db push');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});