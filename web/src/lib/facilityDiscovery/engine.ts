/**
 * Facility discovery engine: OpenStreetMap pickleball courts -> court sites ->
 * Google Places details -> rows in the admin importer's CSV format.
 *
 * Shared by the admin "Discover" tab (web/src/app/api/admin/facility-discover)
 * and the local CLI (scripts/facilities-osm/discover.mjs), so both produce the
 * same rows. This file must stay self-contained (no imports) and use only
 * erasable TypeScript syntax, because the CLI loads it directly with Node's
 * built-in type stripping.
 *
 * I/O is the caller's job: this module builds requests and interprets
 * responses, it never holds the API key beyond building one request and never
 * logs. Every external response is treated as untrusted (see clean()).
 *
 * Security design notes (rafter-secure-design, 2026-11-24): fixed host
 * allowlist (no URL comes from input, so no SSRF surface); text cleaned of
 * control characters, CSV formula prefixes and over-long values; websites must
 * be http(s); photo names must match the importer's resource-name regex;
 * community courts never get a house number (could be a private home).
 */

export type BBox = [number, number, number, number]; // south, west, north, east

export interface OsmElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  bounds?: { minlat: number; minlon: number; maxlat: number; maxlon: number };
  tags?: Record<string, string>;
}

export interface Site {
  center: [number, number];
  pts: [number, number][];
  ids: string[];
  lit: boolean;
  surfaces: string[];
  access: string[];
  osmName: string;
  /** Courts OSM marks as indoor/covered/in a building; the rest are outdoor (OSM's default for a pitch). */
  indoor: number;
}

export interface ExistingFacility {
  id: string;
  google_place_id: string | null;
  name: string;
  latitude: number;
  longitude: number;
  court_count: number | null;
}

export interface BackfillSuggestion {
  facility_id: string;
  name: string;
  current_court_count: number;
  osm_court_count: number;
  distance_m: number;
}

/** One output row, keyed by the importer's CSV column names. */
export type DiscoveryRow = Record<string, string | number>;

// Loosely typed Google payloads: these are untrusted and only read defensively.
interface GoogleComponent {
  types?: string[];
  longText?: string;
  shortText?: string;
  long_name?: string;
  short_name?: string;
}
export interface GooglePlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: GoogleComponent[];
  location?: { latitude?: number; longitude?: number };
  nationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  types?: string[];
  primaryType?: string;
  primaryTypeDisplayName?: { text?: string };
  photos?: { name?: string; widthPx?: number; heightPx?: number }[];
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  businessStatus?: string;
}
export interface GeocodeResponse {
  status?: string;
  results?: { address_components?: GoogleComponent[]; geometry?: { viewport?: { northeast?: { lat: number; lng: number }; southwest?: { lat: number; lng: number } } } }[];
}

// ---------- constants ----------

export const OVERPASS_ENDPOINTS = [
  "https://lz4.overpass-api.de/api/interpreter",
  "https://z.overpass-api.de/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];
export const ALLOWED_HOSTS = new Set([
  "lz4.overpass-api.de",
  "z.overpass-api.de",
  "overpass-api.de",
  "places.googleapis.com",
  "maps.googleapis.com",
]);

export const STATES: Record<string, BBox> = {
  FL: [24.3, -87.7, 31.1, -79.8],
  TX: [25.8, -106.7, 36.6, -93.5],
  GA: [30.3, -85.7, 35.1, -80.8],
  AZ: [31.3, -114.9, 37.1, -109.0],
  NC: [33.8, -84.4, 36.6, -75.4],
  SC: [32.0, -83.4, 35.3, -78.5],
  CA: [32.5, -124.5, 42.1, -114.1],
  NJ: [38.9, -75.6, 41.4, -73.9],
  TN: [34.9, -90.4, 36.7, -81.6],
};

export const CLUSTER_M = 120; // courts closer than this form one site
export const GOOGLE_RADIUS_M = 150; // how far a Google place may sit from the courts
export const EXISTING_M = 300; // site within this of a DreamBreaker facility = already listed

const BAD_TYPES = /lodging|hotel|motel|\binn\b|store|restaurant|cafe|bar\b|night_club|office|real_estate|insurance|car_|apartment|condominium|church|place_of_worship|museum|library|performing_arts|school_district/i;
const BAD_NAMES = /residence hall|dormitory|student housing|apartments?\b|entire (place|home)|vacation|retreat|airbnb|bedroom|\bBR\b|heated pool|getaway|suites?\b|ballet|performing arts|museum|theat(er|re)|church|library/i;
export const PHOTO_NAME = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

const GENERIC_WORDS = new Set(["the", "public", "pickleball", "pickle", "ball", "tennis", "basketball", "ten", "and", "court", "courts", "ct", "cts", "sport", "sports"]);

export const PLACE_FIELDS = [
  "id", "displayName", "formattedAddress", "addressComponents", "location", "nationalPhoneNumber",
  "websiteUri", "googleMapsUri", "types", "primaryType", "primaryTypeDisplayName", "photos",
  "regularOpeningHours.weekdayDescriptions", "businessStatus",
];

export const COLUMNS = [
  "facility_name", "address_line_1", "city", "state", "zip", "country", "latitude", "longitude", "phone",
  "website_url", "google_place_id", "google_maps_url", "google_types", "primary_type", "primary_type_label",
  "photos", "photos_count", "hours_summary", "total_courts", "indoor_courts", "outdoor_courts", "lighting", "court_surface", "membership_required",
  "source", "notes", "osm_ids", "osm_court_count", "osm_area_name",
];

/** OSM's default for leisure=pitch is outdoor; these tags say otherwise. location=roof stays outdoor. */
export function isIndoorCourt(t: Record<string, string>): boolean {
  return t.indoor === "yes" || t.indoor === "room" || t.covered === "yes" || t.location === "indoor" ||
    (!!t.building && t.building !== "no") || t.leisure === "sports_centre" || t.leisure === "sports_hall";
}

export const OSM_CREDIT = "Pickleball courts confirmed via OpenStreetMap (© OpenStreetMap contributors)";

// ---------- helpers ----------

export function haversine(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Untrusted text -> safe CSV cell value. */
export function clean(v: unknown, max = 200): string {
  if (v == null) return "";
  let s = String(v).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(/^[=+\-@]+/, "").trim();
  return s.slice(0, max);
}

export function cleanUrl(v: unknown): string {
  const s = clean(v, 500);
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : "";
  } catch {
    return "";
  }
}

export const isGeneric = (name: unknown): boolean =>
  !String(name ?? "").toLowerCase().split(/[^a-z]+/).filter(Boolean).some((w) => !GENERIC_WORDS.has(w));

const courtsName = (area: string, street: string, city: string): string =>
  area ? `${area} Pickleball Courts` : street ? `Pickleball Courts – ${street}${city ? `, ${city}` : ""}` : "Pickleball Courts";

export function isValidBBox(b: unknown): b is BBox {
  if (!Array.isArray(b) || b.length !== 4 || !b.every((x) => typeof x === "number" && Number.isFinite(x))) return false;
  const [s, w, n, e] = b as number[];
  return s >= -90 && n <= 90 && w >= -180 && e <= 180 && s < n && w < e;
}

export function tiles([s, w, n, e]: BBox, deg: number): BBox[] {
  const out: BBox[] = [];
  for (let lat = s; lat < n; lat += deg) {
    for (let lon = w; lon < e; lon += deg) {
      out.push([lat, lon, Math.min(lat + deg, n), Math.min(lon + deg, e)].map((x) => +x.toFixed(4)) as BBox);
    }
  }
  return out;
}

// ---------- OpenStreetMap ----------

export function courtsQuery(b: BBox): string {
  return `[out:json][timeout:120];nwr[sport~pickleball](${b.join(",")});out center tags;`;
}

export function areasQuery(b: BBox): string {
  const bb = b.join(",");
  return `[out:json][timeout:120];(nwr[leisure~"^(park|sports_centre|recreation_ground|golf_course|resort|fitness_centre)$"][name](${bb});nwr[landuse=residential][name](${bb});nwr[amenity~"^(community_centre|school|college|university)$"][name](${bb});nwr[club][name](${bb});nwr[tourism~"^(camp_site|caravan_site)$"][name](${bb}););out bb tags;`;
}

export function clusterSites(courts: OsmElement[]): Site[] {
  const cellKey = (p: [number, number]) => `${Math.floor(p[0] / 0.002)}:${Math.floor(p[1] / 0.002)}`;
  const grid = new Map<string, Site[]>();
  const sites: Site[] = [];
  const seen = new Set<string>();
  for (const el of courts) {
    const id = `${el.type[0]}${el.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const c = el.center ?? (el.lat != null && el.lon != null ? { lat: el.lat, lon: el.lon } : null);
    if (!c) continue;
    const p: [number, number] = [c.lat, c.lon];
    const [gx, gy] = cellKey(p).split(":").map(Number);
    let site: Site | null = null;
    for (let dx = -1; dx <= 1 && !site; dx += 1) {
      for (let dy = -1; dy <= 1 && !site; dy += 1) {
        for (const s of grid.get(`${gx + dx}:${gy + dy}`) ?? []) {
          if (haversine(s.center, p) < CLUSTER_M) { site = s; break; }
        }
      }
    }
    const t = el.tags ?? {};
    if (!site) {
      site = { center: p, pts: [], ids: [], lit: false, surfaces: [], access: [], osmName: "", indoor: 0 };
      sites.push(site);
      const k = cellKey(p);
      grid.set(k, [...(grid.get(k) ?? []), site]);
    }
    site.pts.push(p);
    site.ids.push(id);
    site.lit = site.lit || t.lit === "yes";
    if (t.surface) site.surfaces.push(t.surface);
    site.access.push(t.access ?? "");
    if (isIndoorCourt(t)) site.indoor += 1;
    site.center = [site.pts.reduce((a, q) => a + q[0], 0) / site.pts.length, site.pts.reduce((a, q) => a + q[1], 0) / site.pts.length];
  }
  return sites;
}

const AREA_RANK: Record<string, number> = { park: 0, sports_centre: 0, recreation_ground: 0, community_centre: 1, golf_course: 2, resort: 2, club: 2, camp_site: 2, caravan_site: 2, school: 3, college: 3, university: 3, residential: 4 };

export function nameSites(sites: Site[], areas: OsmElement[]): void {
  const withBounds = areas.filter((a) => a.bounds && a.tags?.name);
  const kind = (a: OsmElement) => a.tags?._kind ?? a.tags?.leisure ?? a.tags?.amenity ?? a.tags?.tourism ?? (a.tags?.club ? "club" : a.tags?.landuse ?? "");
  const size = (a: OsmElement) => (a.bounds!.maxlat - a.bounds!.minlat) * (a.bounds!.maxlon - a.bounds!.minlon);
  for (const s of sites) {
    const [lat, lon] = s.center;
    const inside = withBounds.filter((a) => a.bounds!.minlat <= lat && lat <= a.bounds!.maxlat && a.bounds!.minlon <= lon && lon <= a.bounds!.maxlon);
    inside.sort((a, b) => (AREA_RANK[kind(a)] ?? 5) - (AREA_RANK[kind(b)] ?? 5) || size(a) - size(b));
    s.osmName = inside[0] ? clean(inside[0].tags!.name, 120) : "";
  }
}

// ---------- snapshots ----------
// The public Overpass servers are often overloaded, so the Discover tab reads a
// committed snapshot per state (web/src/lib/facilityDiscovery/snapshots) and
// only falls back to live Overpass outside it. Refresh with:
//   node scripts/facilities-osm/discover.mjs --state FL --tile-deg 2 --refresh-osm --write-snapshot

/** courts: [osmId, lat, lon, lit, surface, access, indoor]; areas: [name, kind, minlat, minlon, maxlat, maxlon] */
export interface OsmSnapshot {
  state: string;
  bbox: BBox;
  generatedAt: string;
  courts: [string, number, number, number, string, string, number?][];
  areas: [string, string, number, number, number, number][];
}

const AREA_KIND = (t: Record<string, string>) => t.leisure ?? t.amenity ?? t.tourism ?? (t.club ? "club" : t.landuse ?? "");

export function buildSnapshot(state: string, bbox: BBox, courts: OsmElement[], areas: OsmElement[], generatedAt: string): OsmSnapshot {
  const seen = new Set<string>();
  const outCourts: OsmSnapshot["courts"] = [];
  for (const el of courts) {
    const id = `${el.type[0]}${el.id}`;
    const c = el.center ?? (el.lat != null && el.lon != null ? { lat: el.lat, lon: el.lon } : null);
    if (seen.has(id) || !c) continue;
    seen.add(id);
    const t = el.tags ?? {};
    outCourts.push([id, +c.lat.toFixed(6), +c.lon.toFixed(6), t.lit === "yes" ? 1 : 0, clean(t.surface, 40), clean(t.access, 40), isIndoorCourt(t) ? 1 : 0]);
  }
  // Keep only named areas that contain at least one court: all nameSites() needs.
  const seenArea = new Set<string>();
  const outAreas: OsmSnapshot["areas"] = [];
  for (const a of areas) {
    const key = `${a.type[0]}${a.id}`;
    if (seenArea.has(key) || !a.bounds || !a.tags?.name) continue;
    const b = a.bounds;
    if (!outCourts.some((c) => b.minlat <= c[1] && c[1] <= b.maxlat && b.minlon <= c[2] && c[2] <= b.maxlon)) continue;
    seenArea.add(key);
    outAreas.push([clean(a.tags.name, 120), AREA_KIND(a.tags), +b.minlat.toFixed(6), +b.minlon.toFixed(6), +b.maxlat.toFixed(6), +b.maxlon.toFixed(6)]);
  }
  return { state, bbox, generatedAt, courts: outCourts, areas: outAreas };
}

const TYPE_BY_PREFIX: Record<string, string> = { n: "node", w: "way", r: "relation" };

/** Courts and areas from a snapshot for one tile, shaped like Overpass elements. */
export function fromSnapshot(snap: OsmSnapshot, [s, w, n, e]: BBox): { courts: OsmElement[]; areas: OsmElement[] } {
  const courts: OsmElement[] = snap.courts
    .filter((c) => s <= c[1] && c[1] <= n && w <= c[2] && c[2] <= e)
    .map(([id, lat, lon, lit, surface, access, indoor]) => {
      const tags: Record<string, string> = { sport: "pickleball" };
      if (indoor) tags.indoor = "yes";
      if (lit) tags.lit = "yes";
      if (surface) tags.surface = surface;
      if (access) tags.access = access;
      return { type: TYPE_BY_PREFIX[id[0]] ?? "way", id: Number(id.slice(1)), center: { lat, lon }, tags };
    });
  const areas: OsmElement[] = snap.areas
    .filter((a) => a[2] <= n && a[4] >= s && a[3] <= e && a[5] >= w)
    .map(([name, kind, minlat, minlon, maxlat, maxlon], i) => ({ type: "way", id: i, bounds: { minlat, minlon, maxlat, maxlon }, tags: { name, _kind: kind } }));
  return { courts, areas };
}

/** Snapshot that fully covers a tile, if any. */
export function snapshotFor(snaps: OsmSnapshot[], [s, w, n, e]: BBox): OsmSnapshot | null {
  return snaps.find((x) => x.bbox[0] <= s && x.bbox[1] <= w && x.bbox[2] >= n && x.bbox[3] >= e) ?? null;
}

/** Split sites into new ones and ones already listed (with court-count suggestions). */
export function splitExisting(sites: Site[], existing: ExistingFacility[]): { fresh: Site[]; backfill: BackfillSuggestion[] } {
  const backfill = new Map<string, BackfillSuggestion>();
  const fresh: Site[] = [];
  for (const s of sites) {
    let best: { f: ExistingFacility; d: number } | null = null;
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
  return { fresh, backfill: [...backfill.values()] };
}

// ---------- Google ----------

export function nearbyRequest(apiKey: string, site: Site): { url: string; init: RequestInit } {
  const [lat, lon] = site.center;
  return {
    url: "https://places.googleapis.com/v1/places:searchNearby",
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": PLACE_FIELDS.map((f) => `places.${f}`).join(",") },
      body: JSON.stringify({ maxResultCount: 20, rankPreference: "DISTANCE", locationRestriction: { circle: { center: { latitude: lat, longitude: lon }, radius: GOOGLE_RADIUS_M } } }),
    },
  };
}

/** The Geocoding API takes the key as a query parameter; callers must never log this URL. */
export function reverseGeocodeUrl(apiKey: string, site: Site): string {
  const [lat, lon] = site.center;
  return `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&result_type=street_address|route|premise&key=${encodeURIComponent(apiKey)}`;
}

export function forwardGeocodeUrl(apiKey: string, query: string): string {
  return `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query.slice(0, 120))}&components=country:US&key=${encodeURIComponent(apiKey)}`;
}

export function viewportBBox(geo: GeocodeResponse, padDeg = 0.03): BBox | null {
  const v = geo.results?.[0]?.geometry?.viewport;
  if (!v?.northeast || !v?.southwest) return null;
  return [v.southwest.lat - padDeg, v.southwest.lng - padDeg, v.northeast.lat + padDeg, v.northeast.lng + padDeg].map((x) => +x.toFixed(4)) as BBox;
}

// A place with a racquet-sport name is the venue almost whatever its type.
const STRONG_NAME = /pickle|tennis|racquet|paddle|\bcourts?\b/i;
// Otherwise it must be a place people go to play: a park, club, community or rec
// centre, golf/country club, or a court/field-type place with a real name.
const VENUE_PRIMARY = new Set([
  "park", "city_park", "state_park", "national_park", "community_center", "recreation_center", "sports_complex",
  "sports_club", "country_club", "golf_course", "tennis_court", "sports_activity_location", "athletic_field",
  "stadium", "arena", "rv_park", "mobile_home_park", "campground", "resort_hotel",
]);
// Never the venue on their own (playground next to the courts, the pool, a lot,
// a preschool, a gym or a company that happens to be nearest).
const WEAK_NAME = /playground|\bpool\b|swimming|parking|valet|beach access|\btrail(head)?\b|dog beach|fishing|gazebo|\bfield\b|soccer|baseball|softball|\bllc\b|\binc\b|\bcorp\b|services|fitness|gym|barbell|learning|preschool|head start|daycare|dance|gymnastics|sailing|motorcycle|volleyball|\bfc\b|ayso/i;

const NOT_A_VENUE = /\bllc\b|\binc\b|\bcorp\b|wellness|physio|fitness|\bgym\b|splash|patio|hockey|\brink\b|polo|\bplaza\b/i;

function acceptable(place: GooglePlace): boolean {
  const name = place.displayName?.text ?? "";
  const types = [...(place.types ?? []), place.primaryType ?? ""].join(" ");
  if (place.businessStatus === "CLOSED_PERMANENTLY") return false;
  if (typeof place.location?.latitude !== "number" || typeof place.location?.longitude !== "number") return false;
  if (BAD_NAMES.test(name) || BAD_TYPES.test(types)) return false;
  // A business or non-court place whose name merely contains "court"
  // ("Off The Court Fitness & Wellness, LLC") is never the venue unless the
  // name actually says pickleball or tennis.
  if (NOT_A_VENUE.test(name) && !/pickle|tennis/i.test(name)) return false;
  if (STRONG_NAME.test(name)) return true;
  if (WEAK_NAME.test(name)) return false;
  return VENUE_PRIMARY.has(place.primaryType ?? "");
}

/** Best acceptable Google place for a site, or null. */
export function pickPlace(places: GooglePlace[] | undefined, site: Site): GooglePlace | null {
  const cands = (places ?? [])
    .filter(acceptable)
    .map((p) => ({ p, d: haversine(site.center, [p.location!.latitude!, p.location!.longitude!]) }))
    .filter((x) => x.d <= GOOGLE_RADIUS_M + 50)
    .sort((a, b) =>
      Number(/pickle/i.test(b.p.displayName?.text ?? "")) - Number(/pickle/i.test(a.p.displayName?.text ?? "")) ||
      Number(STRONG_NAME.test(b.p.displayName?.text ?? "")) - Number(STRONG_NAME.test(a.p.displayName?.text ?? "")) ||
      a.d - b.d);
  return cands[0]?.p ?? null;
}

/** Google falls back to a plus code ("Q9P4+4R9") when a place has no street address; that is not an address. */
const notPlusCode = (v: string | undefined): string => (v && !/^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}$/i.test(v.trim()) ? v : "");

const comp = (components: GoogleComponent[] | undefined, type: string, short = false): string => {
  const c = (components ?? []).find((x) => x.types?.includes(type));
  return c ? String((short ? c.shortText ?? c.short_name : c.longText ?? c.long_name) ?? "") : "";
};

// ---------- rows ----------

function siteFacts(site: Site): DiscoveryRow {
  const counts = new Map<string, number>();
  for (const x of site.surfaces) counts.set(x, (counts.get(x) ?? 0) + 1);
  const surface = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  const priv = site.access.filter((a) => a === "private" || a === "customers" || a === "members").length * 2 > site.access.length;
  const indoor = Math.min(site.indoor ?? 0, site.pts.length);
  return {
    total_courts: site.pts.length,
    indoor_courts: indoor,
    outdoor_courts: site.pts.length - indoor,
    lighting: site.lit ? "true" : "",
    court_surface: clean(surface, 40),
    membership_required: priv ? "true" : "",
    osm_ids: [...site.ids].sort().join(";"),
    osm_court_count: site.pts.length,
    osm_area_name: site.osmName,
    notes: OSM_CREDIT,
  };
}

export function rowFromPlace(place: GooglePlace, site: Site): DiscoveryRow {
  const photos = (place.photos ?? [])
    .filter((p) => PHOTO_NAME.test(p.name ?? ""))
    .slice(0, 10)
    .map((p) => ({ name: p.name, widthPx: p.widthPx, heightPx: p.heightPx }));
  const route = comp(place.addressComponents, "route");
  const city = comp(place.addressComponents, "locality") || comp(place.addressComponents, "postal_town") || comp(place.addressComponents, "administrative_area_level_3");
  const generic = isGeneric(place.displayName?.text);
  // Generic court listings are usually amenities inside a residential community,
  // where the house number Google attaches can be a private home: street only.
  const street = generic ? route : [comp(place.addressComponents, "street_number"), route].filter(Boolean).join(" ");
  return {
    facility_name: clean(generic ? courtsName(site.osmName, route, city) : place.displayName?.text, 120),
    address_line_1: clean(street || (generic ? "" : notPlusCode(place.formattedAddress?.split(",")[0])), 160),
    city: clean(city, 80),
    state: clean(comp(place.addressComponents, "administrative_area_level_1", true), 10),
    zip: clean(comp(place.addressComponents, "postal_code"), 12),
    country: "US",
    latitude: place.location?.latitude ?? site.center[0],
    longitude: place.location?.longitude ?? site.center[1],
    phone: clean(place.nationalPhoneNumber, 30),
    website_url: cleanUrl(place.websiteUri),
    google_place_id: clean(place.id, 200),
    google_maps_url: cleanUrl(place.googleMapsUri),
    google_types: (place.types ?? []).map((t) => clean(t, 60)).join(","),
    primary_type: clean(place.primaryType, 60),
    primary_type_label: clean(place.primaryTypeDisplayName?.text, 80),
    photos: photos.length ? JSON.stringify(photos) : "",
    photos_count: photos.length,
    hours_summary: clean((place.regularOpeningHours?.weekdayDescriptions ?? []).join("; "), 400),
    source: "osm+google_places",
    ...siteFacts(site),
    // A venue named "Indoor ..." is indoor even when OSM only mapped the courts.
    ...(/\bindoor\b/i.test(place.displayName?.text ?? "") ? { indoor_courts: site.pts.length, outdoor_courts: 0 } : {}),
  };
}

export function rowFromGeocode(geo: GeocodeResponse | null, site: Site): DiscoveryRow {
  const r = geo?.results?.[0];
  // Reverse geocoding snaps to the nearest house: street name only, never a number.
  const street = r ? comp(r.address_components, "route") : "";
  const city = r ? comp(r.address_components, "locality") || comp(r.address_components, "postal_town") || comp(r.address_components, "administrative_area_level_3") : "";
  return {
    // "Pine Ridge Estates" alone reads like a neighborhood listing; say what it is.
    facility_name: clean(site.osmName ? (STRONG_NAME.test(site.osmName) ? site.osmName : `${site.osmName} Pickleball Courts`) : courtsName("", street, city), 120),
    address_line_1: clean(street, 160),
    city: clean(city, 80),
    state: r ? clean(comp(r.address_components, "administrative_area_level_1", true), 10) : "",
    zip: r ? clean(comp(r.address_components, "postal_code"), 12) : "",
    country: "US",
    latitude: +site.center[0].toFixed(6),
    longitude: +site.center[1].toFixed(6),
    google_place_id: "",
    source: "osm",
    ...siteFacts(site),
  };
}

/** Merge rows that resolved to the same Google place (one venue, several court clusters). */
export function mergeByPlace(rows: DiscoveryRow[]): DiscoveryRow[] {
  const byId = new Map<string, DiscoveryRow>();
  const out: DiscoveryRow[] = [];
  for (const r of rows) {
    const id = String(r.google_place_id ?? "");
    const prev = id ? byId.get(id) : undefined;
    if (!prev) {
      if (id) byId.set(id, r);
      out.push(r);
      continue;
    }
    const courts = Number(prev.total_courts) + Number(r.total_courts);
    prev.total_courts = courts;
    prev.osm_court_count = courts;
    prev.osm_ids = [String(prev.osm_ids), String(r.osm_ids)].filter(Boolean).join(";");
    if (r.lighting === "true") prev.lighting = "true";
  }
  return out;
}

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: DiscoveryRow[], cols: string[] = COLUMNS): string {
  return [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\n") + "\n";
}
