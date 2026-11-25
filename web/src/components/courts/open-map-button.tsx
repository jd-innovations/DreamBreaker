"use client";

import { MapTrifold } from "@phosphor-icons/react";

/**
 * "Open map" on a court page: the spot itself (not driving directions).
 * Google Maps by default, using the venue's Google listing when we have its
 * place id (photos, reviews, hours). On iPhone/iPad/Mac Safari it opens Apple
 * Maps instead. Every URL is built from numbers and a pattern-checked place id;
 * no stored URL from imported data is used.
 */
export function OpenMapButton({ lat, lng, placeId, label }: { lat: number; lng: number; placeId: string | null; label: string }) {
  const id = placeId && /^[A-Za-z0-9_-]{10,300}$/.test(placeId) ? placeId : null;
  const google = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}${id ? `&query_place_id=${id}` : ""}`;
  const apple = `https://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent(label.slice(0, 120))}`;

  function onClick(e: React.MouseEvent<HTMLAnchorElement>) {
    const ua = navigator.userAgent;
    const apples = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg|Firefox/.test(ua));
    if (apples) {
      e.preventDefault();
      window.open(apple, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <a href={google} onClick={onClick} target="_blank" rel="noopener noreferrer"
      className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold hover:bg-secondary">
      <MapTrifold size={16} /> Open map
    </a>
  );
}
