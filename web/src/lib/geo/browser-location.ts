// Browser geolocation for "nearby" features (Community Play discovery,
// facility search), with the existing IP-based lookup as a non-blocking
// fallback when the permission prompt is denied, unsupported, or times out.
//
// This intentionally does NOT auto-request on mount — geolocation requires a
// user gesture in most browsers' recommended UX (and some browsers now block
// silent requests outright), so callers should surface a "Show games near
// you" affordance and call request() from a click handler. See
// components/location-prompt.tsx for the shared UI.
//
// Mirrors the mobile pattern (apps/mobile/src/lib/location.ts) in shape —
// { lat, lng, loading, error, refresh() } — but the fallback differs:
// mobile falls back to a hardcoded coordinate, web falls back to the
// existing best-effort IP lookup (fetchIpLocation) already used by
// onboarding, since that infra exists and IP-level accuracy is a reasonable
// bridge for "which city are you in" even when GPS isn't available.

import { fetchIpLocation } from "./ip-location";

// "manual" isn't produced by requestLocation() itself — it's set by callers
// when the user repositions the map center directly (the "search this area"
// pattern), same idea as mobile's pannedCenter/searchCenter override in
// apps/mobile/src/app/(tabs)/nearby.tsx.
export type LocationSource = "gps" | "ip" | "manual" | "none";

export type BrowserLocation = {
  lat: number;
  lng: number;
  source: LocationSource;
};

const GEOLOCATION_TIMEOUT_MS = 8000;

function isSecureContextAvailable(): boolean {
  if (typeof window === "undefined") return false;
  // navigator.geolocation silently misbehaves (or is unavailable) outside a
  // secure context in most browsers; check explicitly so we skip straight to
  // the IP fallback instead of waiting out a doomed permission prompt.
  return window.isSecureContext !== false;
}

function getGpsPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("geolocation_unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: GEOLOCATION_TIMEOUT_MS,
      maximumAge: 5 * 60 * 1000, // 5 min cache, same window mobile uses
    });
  });
}

/**
 * Requests the user's location: browser GPS/Wi-Fi geolocation first (needs a
 * permission grant), falling back to best-effort IP geolocation on denial,
 * timeout, or an insecure context. Returns null only if both fail — callers
 * should treat null as "couldn't determine location" and leave nearby
 * features unfiltered rather than blocking the page.
 */
export async function requestLocation(): Promise<BrowserLocation | null> {
  if (isSecureContextAvailable()) {
    try {
      const position = await getGpsPosition();
      return {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        source: "gps",
      };
    } catch {
      // Denied, timed out, or unsupported — fall through to IP lookup.
    }
  }

  const ip = await fetchIpLocation();
  if (ip?.lat != null && ip?.lng != null) {
    return { lat: ip.lat, lng: ip.lng, source: "ip" };
  }

  return null;
}
