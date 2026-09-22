"use client";

// Map view for the /play Community Play discovery page (Phase 5 of
// COMMUNITY_GAMES_WEB_PLAN.md). Uses Google Maps JS API — the provider
// decision made for this project — rather than Mapbox/Leaflet.
//
// Gated behind NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: this key requires a Google
// Cloud project with the Maps JavaScript API enabled and billing configured
// (see the plan doc's Phase 5 setup notes), which is provisioned outside of
// this codebase. Until that key exists, `isMapAvailable()` returns false and
// callers should hide the map toggle entirely rather than rendering a
// broken/blank map — the list view is the fully-functional default either
// way, matching mobile's map/list split where list is the fallback.

import { useCallback, useRef, useState } from "react";
import { GoogleMap, MarkerF, InfoWindowF, useJsApiLoader } from "@react-google-maps/api";
import Link from "next/link";
import { NavigationArrow } from "@phosphor-icons/react";

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

/**
 * One loader id for every map on the site. @react-google-maps/api loads the
 * script once per page session and throws if a second map asks with different
 * options — so the marketplace map (components/marketplace/marketplace-map.tsx)
 * reuses this id rather than choosing its own.
 */
export const GOOGLE_MAPS_LOADER_ID = "community-play-nearby-map";

export function isMapAvailable(): boolean {
  return GOOGLE_MAPS_API_KEY.length > 0;
}

export type MapPin = {
  id: string;
  lat: number;
  lng: number;
  title: string;
  subtitle: string;
  href: string;
};

const containerStyle = { width: "100%", height: "100%" };

// Fallback center (used only until pins or the user's location narrow it) —
// intentionally the geographic-ish center of the continental US rather than
// mobile's Lakewood Ranch, FL fallback: web has no single default market the
// way the mobile app's original launch market did.
const DEFAULT_CENTER = { lat: 39.8283, lng: -98.5795 };
const DEFAULT_ZOOM = 4;
const FOCUSED_ZOOM = 11;

export function NearbyMap({
  pins, center, onSearchThisArea,
}: {
  pins: MapPin[];
  center: { lat: number; lng: number } | null;
  onSearchThisArea?: (center: { lat: number; lng: number }) => void;
}) {
  const { isLoaded } = useJsApiLoader({
    id: GOOGLE_MAPS_LOADER_ID,
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
  });
  const [activePin, setActivePin] = useState<MapPin | null>(null);
  const [panCenter, setPanCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [showSearchArea, setShowSearchArea] = useState(false);
  const mapRef = useRef<google.maps.Map | null>(null);

  const handleDragEnd = useCallback(() => {
    const c = mapRef.current?.getCenter();
    if (!c) return;
    setPanCenter({ lat: c.lat(), lng: c.lng() });
    setShowSearchArea(true);
  }, []);

  if (!isMapAvailable()) return null;

  if (!isLoaded) {
    return (
      <div className="h-full flex items-center justify-center bg-secondary rounded-2xl">
        <div className="h-8 w-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  const mapCenter = center ?? (pins[0] ? { lat: pins[0].lat, lng: pins[0].lng } : DEFAULT_CENTER);

  return (
    <div className="relative h-full">
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={mapCenter}
        zoom={center || pins.length > 0 ? FOCUSED_ZOOM : DEFAULT_ZOOM}
        onLoad={(map) => { mapRef.current = map; }}
        onUnmount={() => { mapRef.current = null; }}
        onDragEnd={handleDragEnd}
        options={{ disableDefaultUI: false, clickableIcons: false }}
      >
        {pins.map((p) => (
          <MarkerF
            key={p.id}
            position={{ lat: p.lat, lng: p.lng }}
            onClick={() => setActivePin(p)}
          />
        ))}
        {activePin && (
          <InfoWindowF
            position={{ lat: activePin.lat, lng: activePin.lng }}
            onCloseClick={() => setActivePin(null)}
          >
            <Link href={activePin.href} className="block min-w-[160px]">
              <p className="text-sm font-semibold text-black">{activePin.title}</p>
              <p className="text-xs text-black/60">{activePin.subtitle}</p>
            </Link>
          </InfoWindowF>
        )}
      </GoogleMap>

      {showSearchArea && panCenter && onSearchThisArea && (
        <button
          onClick={() => { onSearchThisArea(panCenter); setShowSearchArea(false); }}
          className="absolute top-3 left-1/2 -translate-x-1/2 h-9 px-4 rounded-full bg-primary text-primary-foreground text-xs font-mono tracking-wider shadow-lg flex items-center gap-1.5"
        >
          <NavigationArrow size={12} weight="fill" /> SEARCH THIS AREA
        </button>
      )}
    </div>
  );
}
