// Client-side CSV parsing + column mapping for the admin facility-import
// workflow (web/src/app/admin/facility-import). Mirrors
// scripts/import-facilities-csv.mjs's parseCsv()/mapRow() as closely as
// possible — same RFC-4180 parser, same CSV column names — so a CSV curated
// for one still works with the other. Diverges only where it has to:
// - No SQL literal building (produces plain JS values for the
//   admin_stage_facility_import RPC's jsonb payload instead).
// - No import_batch_id/created_by/created_at/updated_at columns — those are
//   the server side's job now (admin_stage_facility_import /
//   admin_commit_facility_import), not the uploader's.
//
// Photo handling (2026-09-08 update): only the PRIMARY photo, same as the
// CLI script — this is not a gallery importer. Extracts the Google Places
// photo resource name from the export's `photos` column and builds the same
// facility-photo proxy URL the script builds, so admin_commit_facility_import
// can upsert one facility_photos row per facility on commit. Still no
// gallery, still no re-upload/re-host of the image — this only ever points
// at Google's photo via the existing proxy.

export interface MappedFacilityRow {
  google_place_id: string | null;
  data_source: string | null;
  source_url: string | null;
  name: string | null;
  slug: string | null;
  facility_type: string | null;
  address: string;
  address_line_2: string | null;
  city: string;
  state: string | null;
  postal_code: string | null;
  country: string;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  website: string | null;
  google_maps_uri: string | null;
  description: string | null;
  court_count: number;
  indoor_courts: number;
  outdoor_courts: number;
  surface_type: string | null;
  lighting: boolean;
  restrooms: boolean;
  water: boolean;
  parking: boolean;
  pro_shop: boolean;
  lessons_available: boolean;
  open_play_available: boolean;
  reservation_required: boolean;
  public_access: boolean;
  membership_required: boolean;
  bookable_by_public: boolean;
  booking_url: string | null;
  fee_type: string | null;
  typical_fee: string | null;
  hours_summary: string | null;
  skill_levels: string[];
  amenities: string[];
  tags: string[];
  status: string | null;
  data_confidence: number | null;
  last_verified_date: string | null;
  notes: string | null;
  price_level: number | null;
  wheelchair_accessible: boolean | null;
  google_rating: number | null;
  google_rating_count: number | null;
  google_types: string[];
  business_status: string | null;
  /** Facility-photo proxy URL for the primary photo, or null if the CSV has none. */
  photo_url: string | null;
  /** Google Places photo resource name ("places/{id}/photos/{ref}"), or null. */
  photo_google_name: string | null;
}

export interface StageRowInput {
  row_number: number;
  raw: Record<string, string>;
  mapped: MappedFacilityRow;
}

export interface ParsedCsv {
  rows: StageRowInput[];
  skipped: { rowNumber: number; reason: string }[];
}

// ── Minimal RFC-4180 CSV parser (handles quotes, "" escapes, embedded newlines, BOM) ──
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
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
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\r") {
      // ignore; handled by \n
    } else if (c === "\n") {
      row.push(field); field = "";
      rows.push(row); row = [];
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function toNum(v: string): number | null {
  const t = v.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
function toInt(v: string): number | null {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}
function toIntZ(v: string): number {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}
function toBool(v: string): boolean {
  return v.trim().toLowerCase() === "true";
}
function toBoolN(v: string): boolean | null {
  const s = v.trim().toLowerCase();
  return s === "true" ? true : s === "false" ? false : null;
}
function toStr(v: string): string | null {
  return v == null || v.trim() === "" ? null : v.trim();
}
function toArr(v: string): string[] {
  if (!v || !v.trim()) return [];
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

// Same resource-name shape the facility-photo edge function's NAME_RE
// requires — a photo whose name doesn't match this is silently dropped
// rather than stored, same as the CLI script.
const GOOGLE_PHOTO_NAME_RE = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

interface RawPhotoEntry {
  url?: string;
  is_primary?: boolean;
}

function extractPrimaryPhoto(
  rawPhotosJson: string,
  functionsBaseUrl: string,
): { url: string | null; googleName: string | null } {
  const none = { url: null, googleName: null };
  if (!rawPhotosJson || !rawPhotosJson.trim()) return none;

  let photos: unknown;
  try {
    photos = JSON.parse(rawPhotosJson);
  } catch {
    return none;
  }
  const list = Array.isArray(photos) ? (photos as RawPhotoEntry[]) : [];
  const primary = list.find((p) => p?.is_primary) ?? list[0] ?? null;
  if (!primary?.url) return none;

  let name: string | null = null;
  try {
    const parsed = new URL(primary.url);
    const n = parsed.searchParams.get("name");
    name = n && GOOGLE_PHOTO_NAME_RE.test(n) ? n : null;
  } catch {
    name = null;
  }
  if (!name) return none;

  const proxyUrl = `${functionsBaseUrl.replace(/\/$/, "")}/facility-photo?name=${encodeURIComponent(name)}&w=800`;
  return { url: proxyUrl, googleName: name };
}

function mapRow(get: (key: string) => string, functionsBaseUrl: string): MappedFacilityRow {
  const indoor = toIntZ(get("indoor_courts"));
  const outdoor = toIntZ(get("outdoor_courts"));
  const total = toIntZ(get("total_courts"));
  const courtCount = Math.max(total, indoor + outdoor);
  const photo = extractPrimaryPhoto(get("photos"), functionsBaseUrl);

  return {
    google_place_id: toStr(get("google_place_id")),
    data_source: toStr(get("source")),
    source_url: toStr(get("source_url")),
    name: toStr(get("facility_name")),
    slug: toStr(get("slug")),
    facility_type: toStr(get("facility_type")),
    address: toStr(get("address_line_1")) ?? "Address unknown",
    address_line_2: toStr(get("address_line_2")),
    city: toStr(get("city")) ?? "Unknown",
    state: toStr(get("state")),
    postal_code: toStr(get("zip")),
    country: toStr(get("country")) ?? "US",
    latitude: toNum(get("latitude")),
    longitude: toNum(get("longitude")),
    phone: toStr(get("phone")),
    website: toStr(get("website_url")),
    google_maps_uri: toStr(get("google_maps_url")),
    description: toStr(get("description")),
    court_count: courtCount,
    indoor_courts: indoor,
    outdoor_courts: outdoor,
    surface_type: toStr(get("court_surface")),
    lighting: toBool(get("lighting")),
    restrooms: toBool(get("restrooms")),
    water: toBool(get("water")),
    parking: toBool(get("parking")),
    pro_shop: toBool(get("pro_shop")),
    lessons_available: toBool(get("lessons_available")),
    open_play_available: toBool(get("open_play_available")),
    reservation_required: toBool(get("reservation_required")),
    // CSV carries no public_access flag; default true, same as the script.
    public_access: true,
    membership_required: toBool(get("membership_required")),
    bookable_by_public: toBool(get("booking_available")),
    booking_url: toStr(get("booking_url")),
    fee_type: toStr(get("fee_type")),
    typical_fee: toStr(get("typical_fee")),
    hours_summary: toStr(get("hours_summary")),
    skill_levels: toArr(get("skill_levels")),
    amenities: toArr(get("amenities")),
    tags: toArr(get("tags")),
    status: toStr(get("status")),
    data_confidence: toInt(get("data_confidence")),
    last_verified_date: toStr(get("last_verified_date")),
    notes: toStr(get("notes")),
    price_level: toInt(get("price_level")),
    wheelchair_accessible: toBoolN(get("wheelchair_accessible")),
    google_rating: toNum(get("google_rating")),
    google_rating_count: toInt(get("google_rating_count")),
    google_types: toArr(get("google_types")),
    business_status: toStr(get("business_status")),
    photo_url: photo.url,
    photo_google_name: photo.googleName,
  };
}

export function parseFacilityCsv(text: string, functionsBaseUrl: string): ParsedCsv {
  const rawRows = parseCsv(text).filter((r) => r.length > 1 && r.some((c) => c !== ""));
  if (rawRows.length < 2) {
    return { rows: [], skipped: [{ rowNumber: 0, reason: "CSV has no data rows" }] };
  }

  const header = rawRows[0].map((h) => h.trim());
  const idx = new Map(header.map((h, i) => [h, i]));
  const col = (r: string[], key: string) => (idx.has(key) ? (r[idx.get(key)!] ?? "") : "");

  const rows: StageRowInput[] = [];
  const skipped: { rowNumber: number; reason: string }[] = [];

  for (let i = 1; i < rawRows.length; i += 1) {
    const r = rawRows[i];
    const get = (k: string) => col(r, k);
    const name = get("facility_name").trim();
    if (!name) { skipped.push({ rowNumber: i, reason: "missing facility_name" }); continue; }

    const raw: Record<string, string> = {};
    header.forEach((h, j) => { raw[h] = r[j] ?? ""; });

    rows.push({ row_number: i, raw, mapped: mapRow(get, functionsBaseUrl) });
  }

  return { rows, skipped };
}
