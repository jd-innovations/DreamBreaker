#!/usr/bin/env node
/*
  Turns a curated facilities CSV export into a reviewable Supabase upsert
  migration. Idempotent: rows WITH a google_place_id upsert on google_place_id
  (preserving existing facility ids + their event/tournament links); rows
  WITHOUT one upsert on the CSV id.

  Photos: each photo's Google resource name is extracted from the export URL and
  stored on facility_photos.google_photo_name; facility_photos.url points at the
  facility-photo Edge Function (option A — server-side key, no localhost).

  Usage from repo root:
    node scripts/import-facilities-csv.mjs --file path/to/facilities.csv
    node scripts/import-facilities-csv.mjs --file data/facilities.csv --functions-url https://<ref>.supabase.co/functions/v1
*/

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'supabase', 'migrations');
const DEFAULT_FUNCTIONS_URL = 'https://fbzetvkbhneptvfruilw.supabase.co/functions/v1';
const PHOTO_WIDTH = 800;

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

// ── Minimal RFC-4180 CSV parser (handles quotes, "" escapes, embedded newlines, BOM) ──
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  // Strip UTF-8 BOM if present.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\r') {
      // ignore; handled by \n
    } else if (c === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

// ── SQL literal helpers ──
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const S  = (v) => (v == null || v === '' ? 'null' : q(v));
const N  = (v) => { const n = Number(v); return v !== '' && Number.isFinite(n) ? String(n) : 'null'; };
const I  = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? String(n) : 'null'; };
const Iz = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? String(n) : '0'; };
const B  = (v) => (String(v).trim().toLowerCase() === 'true' ? 'true' : 'false');
const Bn = (v) => { const s = String(v).trim().toLowerCase(); return s === 'true' ? 'true' : s === 'false' ? 'false' : 'null'; };
const T  = (v) => (v == null || v === '' ? 'null' : q(v));
const Tnow = (v) => (v == null || v === '' ? 'now()' : q(v));
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const U = (v) => (UUID_RE.test(String(v).trim()) ? q(v) : 'null');
const A = (v) => {
  if (!v || !String(v).trim()) return `'{}'`;
  const items = String(v).split(',').map((s) => s.trim()).filter(Boolean)
    .map((s) => `"${s.replace(/["\\]/g, '\\$&')}"`);
  return `'{${items.join(',')}}'`;
};

// Facility columns in a fixed order (id handled separately per group).
const COLS = [
  'google_place_id', 'data_source', 'source_url',
  'name', 'slug', 'facility_type',
  'address', 'address_line_2', 'city', 'state', 'postal_code', 'country',
  'latitude', 'longitude', 'phone', 'website', 'google_maps_uri', 'description',
  'court_count', 'indoor_courts', 'outdoor_courts', 'surface_type',
  'lighting', 'restrooms', 'water', 'parking',
  'pro_shop', 'lessons_available', 'open_play_available', 'reservation_required',
  'public_access', 'membership_required', 'bookable_by_public', 'booking_url',
  'fee_type', 'typical_fee', 'hours_summary',
  'skill_levels', 'amenities', 'tags',
  'status', 'data_confidence', 'verified', 'last_verified_date', 'notes',
  'import_batch_id', 'created_by', 'price_level', 'wheelchair_accessible',
  'google_rating', 'google_rating_count', 'google_types', 'business_status',
  'created_at', 'updated_at',
];

function mapRow(get) {
  const indoor = parseInt(get('indoor_courts'), 10) || 0;
  const outdoor = parseInt(get('outdoor_courts'), 10) || 0;
  const total = parseInt(get('total_courts'), 10) || 0;
  // Satisfy check_court_subtotals (indoor+outdoor <= court_count).
  const courtCount = Math.max(total, indoor + outdoor);

  return {
    google_place_id: S(get('google_place_id')),
    data_source: get('source') ? S(get('source')) : `'manual'`,
    source_url: S(get('source_url')),
    name: S(get('facility_name')),
    slug: S(get('slug')),
    facility_type: S(get('facility_type')),
    address: get('address_line_1') ? S(get('address_line_1')) : `'Address unknown'`,
    address_line_2: S(get('address_line_2')),
    city: get('city') ? S(get('city')) : `'Unknown'`,
    state: S(get('state')),
    postal_code: S(get('zip')),
    country: get('country') ? S(get('country')) : `'US'`,
    latitude: N(get('latitude')),
    longitude: N(get('longitude')),
    phone: S(get('phone')),
    website: S(get('website_url')),
    google_maps_uri: S(get('google_maps_url')),
    description: S(get('description')),
    court_count: String(courtCount),
    indoor_courts: String(indoor),
    outdoor_courts: String(outdoor),
    surface_type: S(get('court_surface')),
    lighting: B(get('lighting')),
    restrooms: B(get('restrooms')),
    water: B(get('water')),
    parking: B(get('parking')),
    pro_shop: B(get('pro_shop')),
    lessons_available: B(get('lessons_available')),
    open_play_available: B(get('open_play_available')),
    reservation_required: B(get('reservation_required')),
    // CSV carries no public_access flag; default true (private is signalled by facility_type/claim later).
    public_access: 'true',
    membership_required: B(get('membership_required')),
    bookable_by_public: B(get('booking_available')),
    booking_url: S(get('booking_url')),
    fee_type: S(get('fee_type')),
    typical_fee: S(get('typical_fee')),
    hours_summary: S(get('hours_summary')),
    skill_levels: A(get('skill_levels')),
    amenities: A(get('amenities')),
    tags: A(get('tags')),
    status: S(get('status')),
    data_confidence: I(get('data_confidence')),
    verified: B(get('verified')),
    last_verified_date: T(get('last_verified_date')),
    notes: S(get('notes')),
    import_batch_id: U(get('import_batch_id')),
    created_by: U(get('created_by')),
    price_level: I(get('price_level')),
    wheelchair_accessible: Bn(get('wheelchair_accessible')),
    google_rating: N(get('google_rating')),
    google_rating_count: I(get('google_rating_count')),
    google_types: A(get('google_types')),
    business_status: S(get('business_status')),
    created_at: Tnow(get('created_at')),
    updated_at: Tnow(get('updated_at')),
  };
}

// Extract the Google photo resource name from an export URL; null if absent.
function photoName(rawUrl) {
  try {
    const u = new URL(rawUrl);
    const name = u.searchParams.get('name');
    return name && /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(name) ? name : null;
  } catch {
    return null;
  }
}

function main() {
  const file = arg('--file');
  if (!file) throw new Error('Missing --file <path-to-csv>');
  const functionsUrl = arg('--functions-url', DEFAULT_FUNCTIONS_URL).replace(/\/$/, '');

  const text = fs.readFileSync(path.resolve(file), 'utf8');
  const rows = parseCsv(text).filter((r) => r.length > 1 && r.some((c) => c !== ''));
  if (rows.length < 2) throw new Error('CSV has no data rows.');

  const header = rows[0].map((h) => h.trim());
  const idx = new Map(header.map((h, i) => [h, i]));
  const col = (r, key) => (idx.has(key) ? (r[idx.get(key)] ?? '') : '');

  const facGoogle = [];   // rows with google_place_id  → conflict on google_place_id
  const facById = [];     // rows without               → conflict on id
  const photoGoogle = []; // [google_place_id, proxyUrl, name, is_primary]
  const photoById = [];   // [csv_id, proxyUrl, name, is_primary]

  for (let i = 1; i < rows.length; i += 1) {
    const r = rows[i];
    const get = (k) => col(r, k);
    const id = get('id').trim();
    const gpid = get('google_place_id').trim();
    const name = get('facility_name').trim();
    if (!name) { console.warn(`Row ${i}: missing facility_name — skipped`); continue; }

    const rec = mapRow(get);
    if (gpid) facGoogle.push(rec);
    else if (UUID_RE.test(id)) facById.push({ id: q(id), ...rec });
    else { console.warn(`Row ${i} (${name}): no google_place_id and no valid id — skipped`); continue; }

    // Photos — only the primary photo is imported (one per facility), not the
    // full gallery. Keeps import volume + Google Photos API surface small;
    // prefers the row marked is_primary, else the first proxy-able photo.
    let photos = [];
    const rawPhotos = get('photos').trim();
    if (rawPhotos) {
      try { photos = JSON.parse(rawPhotos); } catch { console.warn(`Row ${i} (${name}): photos not valid JSON — skipped photos`); }
    }
    const photoList = Array.isArray(photos) ? photos : [];
    const primary = photoList.find((p) => p?.is_primary) ?? photoList[0] ?? null;
    if (primary) {
      const nm = photoName(primary?.url ?? '');
      if (nm) {
        const proxyUrl = `${functionsUrl}/facility-photo?name=${encodeURIComponent(nm)}&w=${PHOTO_WIDTH}`;
        const tuple = [q(proxyUrl), q(nm), 'true'];
        if (gpid) photoGoogle.push([q(gpid), ...tuple]);
        else photoById.push([q(id), ...tuple]);
      }
    }
  }

  const updateSet = (cols) =>
    cols.filter((c) => c !== 'created_at').map((c) => `  ${c} = excluded.${c}`).join(',\n');

  const parts = [];
  parts.push(`-- Curated facilities directory import. Review before applying.\n-- ${facGoogle.length} google-keyed + ${facById.length} id-keyed facilities, ${photoGoogle.length + photoById.length} photos.\n`);

  if (facGoogle.length) {
    const values = facGoogle.map((rec) => `(${COLS.map((c) => rec[c]).join(', ')})`).join(',\n');
    parts.push(
      `insert into public.facilities (\n  ${COLS.join(', ')}\n) values\n${values}\n` +
      `on conflict (google_place_id) do update set\n${updateSet(COLS.filter((c) => c !== 'google_place_id'))};\n`,
    );
  }
  if (facById.length) {
    const cols = ['id', ...COLS.filter((c) => c !== 'google_place_id')];
    const values = facById.map((rec) => `(${cols.map((c) => rec[c] ?? 'null').join(', ')})`).join(',\n');
    parts.push(
      `insert into public.facilities (\n  ${cols.join(', ')}\n) values\n${values}\n` +
      `on conflict (id) do update set\n${updateSet(cols.filter((c) => c !== 'id'))};\n`,
    );
  }

  const photoInsert = (tuples, joinKey) =>
    `insert into public.facility_photos (facility_id, url, google_photo_name, is_primary)\n` +
    `select f.id, v.url, v.name, v.is_primary\n` +
    `from public.facilities f\n` +
    `join (values\n${tuples.map((t) => `  (${t.join(', ')})`).join(',\n')}\n) as v(${joinKey}, url, name, is_primary)\n` +
    `  on f.${joinKey} = v.${joinKey}\n` +
    `on conflict (facility_id, google_photo_name) where google_photo_name is not null\n` +
    `do update set url = excluded.url, is_primary = excluded.is_primary;\n`;

  if (photoGoogle.length) parts.push(photoInsert(photoGoogle, 'google_place_id'));
  if (photoById.length)   parts.push(photoInsert(photoById, 'id'));

  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const outFile = path.join(OUT_DIR, `${stamp}_facilities_csv_import.sql`);
  fs.writeFileSync(outFile, parts.join('\n'));
  console.log(`Wrote ${facGoogle.length + facById.length} facilities and ${photoGoogle.length + photoById.length} photos to`);
  console.log(`  ${outFile}`);
  console.log('Review it, then apply via supabase db push (or hand it to Claude to apply).');
}

main();
