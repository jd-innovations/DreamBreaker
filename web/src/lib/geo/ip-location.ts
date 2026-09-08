// Best-effort city/state/coordinates from the caller's IP.
//
// This is how mobile fills `location_city/state/lat/lng` too — its
// `area-recommendations.tsx` calls the same service. It is NOT GPS, and it does
// not prompt for permission, which is why the flow ports to web at all.
//
// It is best-effort by design: ad blockers, corporate proxies and strict CSP
// will all break the request for a meaningful share of users. The step it feeds
// must therefore treat manual entry as the primary control and this as a
// prefill. Never block on it.

export type IpLocation = {
  city: string | null;
  state: string | null;
  lat: number | null;
  lng: number | null;
};

const TIMEOUT_MS = 3000;

export async function fetchIpLocation(): Promise<IpLocation | null> {
  if (typeof window === "undefined") return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch("https://ipapi.co/json/", { signal: controller.signal });
    if (!res.ok) return null;

    const data: unknown = await res.json();
    if (typeof data !== "object" || data === null) return null;

    const d = data as Record<string, unknown>;
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

    return {
      city: str(d.city),
      // ipapi returns the two-letter code as region_code.
      state: str(d.region_code) ?? str(d.region),
      lat: num(d.latitude),
      lng: num(d.longitude),
    };
  } catch {
    // Aborted, blocked, offline, or rate-limited — all the same to the caller.
    return null;
  } finally {
    clearTimeout(timer);
  }
}
