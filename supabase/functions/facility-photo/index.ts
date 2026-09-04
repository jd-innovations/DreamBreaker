import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Public proxy for Google Places photos. Facilities store the durable photo
// resource name ("places/{place_id}/photos/{ref}"); this function fetches the
// image bytes from Google with the server-side API key and streams them back,
// so the key never reaches the client. Deployed with verify_jwt = false.

const GOOGLE_PLACES_API_KEY = Deno.env.get("GOOGLE_PLACES_API_KEY") ?? "";

const CORS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Only genuine Places photo resource names — blocks SSRF / arbitrary fetches.
const NAME_RE = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: CORS });
  }
  if (!GOOGLE_PLACES_API_KEY) {
    return new Response("Photo service not configured", { status: 500, headers: CORS });
  }

  const url = new URL(req.url);
  const name = url.searchParams.get("name");
  const wRaw = parseInt(url.searchParams.get("w") ?? "800", 10);
  const maxWidthPx = Number.isFinite(wRaw) ? Math.min(Math.max(wRaw, 1), 1600) : 800;

  if (!name || !NAME_RE.test(name)) {
    return new Response("Invalid photo name", { status: 400, headers: CORS });
  }

  const googleUrl =
    `https://places.googleapis.com/v1/${name}/media` +
    `?maxWidthPx=${maxWidthPx}&key=${GOOGLE_PLACES_API_KEY}`;

  let upstream: Response;
  try {
    upstream = await fetch(googleUrl, { redirect: "follow" });
  } catch {
    return new Response("Upstream fetch failed", { status: 502, headers: CORS });
  }

  if (!upstream.ok || !upstream.body) {
    return new Response("Photo not available", { status: 502, headers: CORS });
  }

  const headers = new Headers(CORS);
  headers.set("Content-Type", upstream.headers.get("Content-Type") ?? "image/jpeg");
  // Photos are immutable per resource name — cache hard at the CDN/client.
  headers.set("Cache-Control", "public, max-age=604800, immutable");
  return new Response(upstream.body, { status: 200, headers });
});
