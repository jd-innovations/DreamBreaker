// Address -> map pin for the "Add a court" form (2026-11-25).
//
// Signed-in users only: each call costs a Geocoding API request on the
// server-side GOOGLE_PLACES_API_KEY, which is never returned or logged. The
// outbound fetch goes to one fixed Google host (no user-chosen URL, so no SSRF),
// with redirects refused, a timeout and a response-size cap. A soft per-user
// limit (per server instance) blunts scripted abuse; the Google budget alerts
// are the backstop.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { forwardGeocodeUrl } from "@/lib/facilityDiscovery/engine";

const LIMIT_PER_HOUR = 30;
const recent = new Map<string, number[]>();

function overLimit(userId: string): boolean {
  const now = Date.now();
  const hits = (recent.get(userId) ?? []).filter((t) => now - t < 3_600_000);
  hits.push(now);
  recent.set(userId, hits);
  if (recent.size > 5000) recent.clear();
  return hits.length > LIMIT_PER_HOUR;
}

type GeoResult = {
  formatted_address?: string;
  geometry?: { location?: { lat?: number; lng?: number } };
  address_components?: { long_name: string; short_name: string; types: string[] }[];
};

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "sign_in_required" }, { status: 401 });
  if (overLimit(user.id)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 4 || q.length > 200) return NextResponse.json({ error: "invalid_query" }, { status: 400 });

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  try {
    // The host is fixed; the visitor's text is only ever an encoded query
    // value. Asserted anyway so a future change to the URL builder can't
    // quietly turn this into a fetch of a user-chosen host.
    const url = new URL(forwardGeocodeUrl(key, q));
    if (url.protocol !== "https:" || url.hostname !== "maps.googleapis.com") throw new Error("host_not_allowed");
    const res = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 512 * 1024) throw new Error("too_large");
    const json = JSON.parse(new TextDecoder().decode(buf)) as { status?: string; results?: GeoResult[] };
    const top = json.results?.[0];
    const lat = top?.geometry?.location?.lat;
    const lng = top?.geometry?.location?.lng;
    if (json.status !== "OK" || typeof lat !== "number" || typeof lng !== "number") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const part = (type: string, short = false) => {
      const c = top!.address_components?.find((a) => a.types.includes(type));
      return c ? (short ? c.short_name : c.long_name) : null;
    };
    const streetNumber = part("street_number");
    const route = part("route");
    return NextResponse.json({
      latitude: lat,
      longitude: lng,
      formatted: top!.formatted_address ?? null,
      address: [streetNumber, route].filter(Boolean).join(" ") || null,
      city: part("locality") ?? part("postal_town") ?? part("sublocality") ?? null,
      state: part("administrative_area_level_1", true),
      postal_code: part("postal_code"),
    });
  } catch {
    // Never echo the upstream error: the request URL carries the key.
    return NextResponse.json({ error: "lookup_failed" }, { status: 502 });
  }
}
