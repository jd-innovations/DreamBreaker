import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import * as E from "@/lib/facilityDiscovery/engine";

/**
 * Admin-only backend for the "Discover" tab on /admin/facility-import.
 *
 * Read-only: it never writes to the database. The tab hands its rows to the
 * existing staging RPC (admin_stage_facility_import), so the importer's review
 * and commit steps stay the only write path.
 *
 * Work is split into small calls so none outlives a serverless function:
 *   resolve  -> area name/state -> bounding box + 1° tiles      (1 Google geocode for a city)
 *   osm      -> one tile -> new court sites + already-listed count (free)
 *   details  -> <= MAX_SITES sites -> importer rows              (<= 2 Google requests per site)
 *
 * GOOGLE_PLACES_API_KEY is a server-only env var: it is never returned, logged,
 * or included in error text. 404 (not 403) for non-admins so the route's
 * existence isn't confirmed, same as /api/admin/sentry-test.
 */

export const maxDuration = 60;

const MAX_SITES = 10;
const MAX_TILE_DEG = 1.01;

type Json = Record<string, unknown>;

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return profile?.role === "admin" ? supabase : null;
}

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

async function fetchJson(url: string, init: RequestInit, timeoutMs: number, maxBytes: number): Promise<{ status: number; json: unknown }> {
  const host = new URL(url).hostname;
  if (!E.ALLOWED_HOSTS.has(host)) throw new Error("host_not_allowed");
  const res = await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  const buf = await res.arrayBuffer();
  if (buf.byteLength > maxBytes) throw new Error("response_too_large");
  let json: unknown = null;
  try { json = JSON.parse(new TextDecoder().decode(buf)); } catch { /* non-JSON error page */ }
  return { status: res.status, json };
}

async function overpass(query: string): Promise<E.OsmElement[]> {
  for (const base of E.OVERPASS_ENDPOINTS) {
    try {
      const { status, json } = await fetchJson(`${base}?data=${encodeURIComponent(query)}`, { headers: { "User-Agent": "facility-discover/1.0" } }, 25000, 50 * 1024 * 1024);
      if (status === 200 && json && Array.isArray((json as Json).elements)) return (json as { elements: E.OsmElement[] }).elements;
    } catch { /* next mirror */ }
  }
  throw new Error("osm_busy");
}

function apiKey(): string | null {
  return process.env.GOOGLE_PLACES_API_KEY || null;
}

// ---------- input validation (the client is an admin, but still untrusted) ----------

function parseSite(v: unknown): E.Site | null {
  if (!v || typeof v !== "object") return null;
  const s = v as Json;
  const num = (x: unknown) => typeof x === "number" && Number.isFinite(x);
  const pair = (x: unknown): x is [number, number] => Array.isArray(x) && x.length === 2 && num(x[0]) && num(x[1]) && Math.abs(x[0] as number) <= 90 && Math.abs(x[1] as number) <= 180;
  if (!pair(s.center) || !Array.isArray(s.pts) || s.pts.length < 1 || s.pts.length > 300 || !s.pts.every(pair)) return null;
  const strs = (x: unknown, maxLen: number, maxCount: number) => Array.isArray(x) && x.length <= maxCount && x.every((y) => typeof y === "string" && y.length <= maxLen);
  if (!strs(s.ids, 24, 300) || !strs(s.surfaces, 40, 300) || !strs(s.access, 40, 300)) return null;
  return {
    center: s.center,
    pts: s.pts as [number, number][],
    ids: s.ids as string[],
    lit: s.lit === true,
    surfaces: s.surfaces as string[],
    access: s.access as string[],
    osmName: E.clean(s.osmName, 120),
  };
}

// ---------- actions ----------

async function resolve(body: Json) {
  let bbox: E.BBox | null = null;
  let label = "";
  if (typeof body.state === "string" && E.STATES[body.state.toUpperCase()]) {
    bbox = E.STATES[body.state.toUpperCase()];
    label = body.state.toUpperCase();
  } else if (typeof body.query === "string" && body.query.trim().length >= 2) {
    const key = apiKey();
    if (!key) return bad("google_not_configured", 503);
    const { status, json } = await fetchJson(E.forwardGeocodeUrl(key, body.query.trim()), {}, 15000, 2 * 1024 * 1024);
    const geo = json as E.GeocodeResponse | null;
    if (status !== 200 || !geo || (geo.status && geo.status !== "OK")) return bad(geo?.status === "ZERO_RESULTS" ? "place_not_found" : "geocode_failed", 502);
    bbox = E.viewportBBox(geo);
    label = E.clean(body.query, 60);
  }
  if (!bbox || !E.isValidBBox(bbox)) return bad("area_not_found");
  return NextResponse.json({ bbox, label, tiles: E.tiles(bbox, 1) });
}

async function osm(supabase: NonNullable<Awaited<ReturnType<typeof requireAdmin>>>, body: Json) {
  const t = body.bbox;
  if (!E.isValidBBox(t) || t[2] - t[0] > MAX_TILE_DEG || t[3] - t[1] > MAX_TILE_DEG) return bad("tile_too_large");
  let courts: E.OsmElement[];
  let areas: E.OsmElement[] = [];
  try {
    courts = await overpass(E.courtsQuery(t));
    if (courts.length) areas = await overpass(E.areasQuery(t));
  } catch {
    return bad("osm_busy", 503);
  }
  const sites = E.clusterSites(courts);
  E.nameSites(sites, areas);

  // Pad by ~300 m so a facility just outside the tile still counts as "already listed".
  const pad = 0.004;
  const { data: existing, error } = await supabase
    .from("facilities")
    .select("id,google_place_id,name,latitude,longitude,court_count")
    .gte("latitude", t[0] - pad).lte("latitude", t[2] + pad)
    .gte("longitude", t[1] - pad).lte("longitude", t[3] + pad)
    .limit(5000);
  if (error) return bad("facilities_read_failed", 500);
  const known = (existing ?? []).filter((f) => f.latitude != null && f.longitude != null) as E.ExistingFacility[];
  const { fresh, backfill } = E.splitExisting(sites, known);
  return NextResponse.json({ courts: courts.length, sites: fresh, alreadyListed: sites.length - fresh.length, backfill });
}

async function details(supabase: NonNullable<Awaited<ReturnType<typeof requireAdmin>>>, body: Json) {
  const key = apiKey();
  if (!key) return bad("google_not_configured", 503);
  if (!Array.isArray(body.sites) || body.sites.length === 0 || body.sites.length > MAX_SITES) return bad("bad_sites");
  const sites = body.sites.map(parseSite);
  if (sites.some((s) => s === null)) return bad("bad_sites");
  const includeUnmatched = body.includeUnmatched === true;

  const matched: { site: E.Site; place: E.GooglePlace }[] = [];
  const unmatched: E.Site[] = [];
  let googleRequests = 0;
  for (const site of sites as E.Site[]) {
    const { url, init } = E.nearbyRequest(key, site);
    googleRequests += 1;
    const { status, json } = await fetchJson(url, init, 20000, 5 * 1024 * 1024);
    if (status === 429) return bad("google_quota", 429);
    if (status !== 200) return bad("google_failed", 502);
    const pick = E.pickPlace((json as { places?: E.GooglePlace[] } | null)?.places, site);
    if (pick?.id) matched.push({ site, place: pick });
    else unmatched.push(site);
  }

  // Drop places DreamBreaker already lists (e.g. under slightly different coordinates).
  const ids = matched.map((m) => E.clean(m.place.id, 200)).filter(Boolean);
  let listed = new Set<string>();
  if (ids.length) {
    const { data, error } = await supabase.from("facilities").select("google_place_id").in("google_place_id", ids);
    if (error) return bad("facilities_read_failed", 500);
    listed = new Set((data ?? []).map((r) => r.google_place_id).filter((x): x is string => !!x));
  }
  const rows = matched.filter((m) => !listed.has(E.clean(m.place.id, 200))).map((m) => E.rowFromPlace(m.place, m.site));

  const unmatchedRows: E.DiscoveryRow[] = [];
  if (includeUnmatched) {
    for (const site of unmatched) {
      googleRequests += 1;
      const { status, json } = await fetchJson(E.reverseGeocodeUrl(key, site), {}, 15000, 2 * 1024 * 1024);
      const geo = json as E.GeocodeResponse | null;
      unmatchedRows.push(E.rowFromGeocode(status === 200 && geo?.status === "OK" ? geo : null, site));
    }
  }
  return NextResponse.json({ rows, unmatchedRows, unmatchedCount: unmatched.length, alreadyListed: matched.length - rows.length, googleRequests });
}

export async function POST(request: Request) {
  const supabase = await requireAdmin();
  if (!supabase) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let body: Json;
  try {
    const text = await request.text();
    if (text.length > 512 * 1024) return bad("body_too_large", 413);
    body = JSON.parse(text) as Json;
  } catch {
    return bad("bad_json");
  }

  try {
    switch (body.action) {
      case "resolve": return await resolve(body);
      case "osm": return await osm(supabase, body);
      case "details": return await details(supabase, body);
      default: return bad("unknown_action");
    }
  } catch {
    // Never echo upstream errors: a Geocoding URL carries the key.
    return bad("discover_failed", 500);
  }
}
