"use client";

// Map view for /lessons — public, unlike the marketplace map.
//
// It can be public because nothing here is private: a pin is a FACILITY, which
// is a venue already listed publicly, and the count is how many lessons happen
// there. No coach location, no home address, no precise anything. That is the
// same reason the directory map is allowed to show home courts.
//
// Data: coach_offer_map_pins (20260923300000), executable by anon.
//
// Renders nothing without NEXT_PUBLIC_GOOGLE_MAPS_API_KEY; the page hides the
// Map toggle in that case and the list stands alone.

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { GoogleMap, InfoWindowF, MarkerF, useJsApiLoader } from "@react-google-maps/api";
import { NavigationArrow } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { GOOGLE_MAPS_LOADER_ID } from "@/components/nearby-map";
import { fetchOfferMapPins, formatPrice, type MapPin } from "@/lib/coaching/browse";

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
export const lessonsMapAvailable = () => KEY.length > 0;

const US_CENTER = { lat: 39.8283, lng: -98.5795 };
const RESEARCH_METRES = 3_200; // ~2 miles, matching the other maps

function metresBetween(a: google.maps.LatLngLiteral, b: google.maps.LatLngLiteral): number {
  const R = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Radius that covers what the viewer can actually see, so a search matches the view. */
function radiusForBounds(map: google.maps.Map): number {
  const b = map.getBounds();
  if (!b) return 80_467;
  const ne = b.getNorthEast();
  const sw = b.getSouthWest();
  const diagonal = metresBetween(
    { lat: ne.lat(), lng: ne.lng() },
    { lat: sw.lat(), lng: sw.lng() },
  );
  return Math.min(Math.max(diagonal / 2, 1_000), 500_000);
}

export function LessonsMap() {
  const { isLoaded } = useJsApiLoader({ id: GOOGLE_MAPS_LOADER_ID, googleMapsApiKey: KEY });
  const [pins, setPins] = useState<MapPin[]>([]);
  const [open, setOpen] = useState<MapPin | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSearchHere, setShowSearchHere] = useState(false);
  const mapRef = useRef<google.maps.Map | null>(null);
  const searchedAt = useRef<google.maps.LatLngLiteral | null>(null);

  const search = useCallback(async (centre: google.maps.LatLngLiteral, radius: number) => {
    setLoading(true);
    const r = await fetchOfferMapPins(centre.lat, centre.lng, radius);
    setLoading(false);
    setShowSearchHere(false);
    searchedAt.current = centre;
    if (r.ok) setPins(r.data);
  }, []);

  const onLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    // Start wide: with 7 venues across 9 cities, a tight default would open on
    // an empty patch of map and look broken.
    void search(US_CENTER, 500_000);
  }, [search]);

  // Offer "Search this area" only once the viewer has moved somewhere new,
  // rather than on every idle event.
  const onIdle = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const c = map.getCenter();
    if (!c || !searchedAt.current) return;
    const moved = metresBetween({ lat: c.lat(), lng: c.lng() }, searchedAt.current);
    if (moved > RESEARCH_METRES) setShowSearchHere(true);
  }, []);

  if (!isLoaded) {
    return (
      <div className="flex h-[60vh] items-center justify-center rounded-lg border border-border bg-card text-sm text-muted-foreground">
        Loading map…
      </div>
    );
  }

  return (
    <div className="relative">
      <GoogleMap
        mapContainerClassName="h-[60vh] w-full rounded-lg border border-border"
        center={US_CENTER}
        zoom={4}
        onLoad={onLoad}
        onIdle={onIdle}
        options={{ streetViewControl: false, mapTypeControl: false, fullscreenControl: false }}
      >
        {pins.map((p) => (
          <MarkerF
            key={p.facility_id}
            position={{ lat: p.latitude, lng: p.longitude }}
            onClick={() => setOpen(p)}
            label={{
              text: String(p.offer_count),
              color: "#0A1228",
              fontSize: "11px",
              fontWeight: "700",
            }}
          />
        ))}

        {open && (
          <InfoWindowF
            position={{ lat: open.latitude, lng: open.longitude }}
            onCloseClick={() => setOpen(null)}
          >
            <div className="min-w-44 space-y-1 p-1">
              <p className="text-sm font-semibold text-neutral-900">{open.facility_name}</p>
              <p className="text-xs text-neutral-600">
                {[open.city, open.state].filter(Boolean).join(", ")}
              </p>
              <p className="text-xs text-neutral-600">
                {open.offer_count} {open.offer_count === 1 ? "lesson" : "lessons"}
                {open.min_price_cents != null ? ` · from ${formatPrice(open.min_price_cents)}` : ""}
              </p>
              <Link
                href={`/lessons?city=${encodeURIComponent(open.city ?? "")}`}
                className="text-xs font-semibold text-blue-700 underline-offset-4 hover:underline"
              >
                See these lessons
              </Link>
            </div>
          </InfoWindowF>
        )}
      </GoogleMap>

      {showSearchHere && (
        <div className="absolute left-1/2 top-3 -translate-x-1/2">
          <Button
            size="sm"
            variant="secondary"
            disabled={loading}
            onClick={() => {
              const map = mapRef.current;
              const c = map?.getCenter();
              if (!map || !c) return;
              void search({ lat: c.lat(), lng: c.lng() }, radiusForBounds(map));
            }}
          >
            <NavigationArrow size={14} weight="bold" /> {loading ? "Searching…" : "Search this area"}
          </Button>
        </div>
      )}

      {!loading && pins.length === 0 && (
        <p className="mt-3 text-center text-sm text-muted-foreground">
          No lessons in this area yet. Try zooming out.
        </p>
      )}
    </div>
  );
}
