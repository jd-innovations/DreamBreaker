"use client";

// Marketplace map for /marketplace?view=map — SIGNED-IN ONLY (owner decision
// 2026-09-22). The page renders this only for a signed-in viewer, and the data
// comes from search_listings_nearby under that viewer's own session — the RPC
// the app's map uses, which anon cannot execute — so pickup coordinates never
// reach an anonymous visitor.
//
// Same behaviour as the app's map (MARKETPLACE_HANDOFF.md):
//   - only listings whose seller chose map visibility (the RPC filters that)
//   - pins coloured by PRICE BAND with a legend; the exact price is on the
//     tap card, never on the pin
//   - "Search this area" after the map moves more than ~2 miles
//   - pins are a public court or an ~800 m grid cell; no precise seller
//     location exists to show
//
// Renders nothing without NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (not provisioned yet);
// the page hides the map toggle in that case, and the list is the default.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { GoogleMap, InfoWindowF, MarkerF, useJsApiLoader } from "@react-google-maps/api";
import { NavigationArrow } from "@phosphor-icons/react";
import { formatCents } from "@shared/money";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { GOOGLE_MAPS_LOADER_ID } from "@/components/nearby-map";
import {
  browseArgs, PRICE_BANDS, priceBandFor, radiusForBounds, type BrowseFilters,
} from "@/lib/marketplace/browse";

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
export const marketplaceMapAvailable = () => KEY.length > 0;

const US_CENTER = { lat: 39.8283, lng: -98.5795 };
const RESEARCH_METRES = 3_200; // ~2 miles, the app's threshold

type Pin = {
  id: string;
  title: string;
  lat: number;
  lng: number;
  cents: number;
  place: string;
};

function metresBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function MarketplaceMap({ filters }: { filters: BrowseFilters }) {
  const { isLoaded } = useJsApiLoader({ id: GOOGLE_MAPS_LOADER_ID, googleMapsApiKey: KEY });
  const mapRef = useRef<google.maps.Map | null>(null);
  const lastSearch = useRef<{ lat: number; lng: number } | null>(null);

  const [center, setCenter] = useState(US_CENTER);
  const [zoom, setZoom] = useState(4);
  const [located, setLocated] = useState(false);
  const [pins, setPins] = useState<Pin[]>([]);
  const [active, setActive] = useState<Pin | null>(null);
  const [moved, setMoved] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (at: { lat: number; lng: number }, radius: number) => {
    setSearching(true);
    setError(null);
    const a = browseArgs(filters);
    const { data, error: rpcError } = await createClient().rpc("search_listings_nearby", {
      lat: at.lat,
      lng: at.lng,
      radius_meters: radius,
      search_query: a.p_search,
      brand_filter: a.p_brand,
      condition_filter: a.p_condition,
      min_price_cents: a.p_min_cents,
      max_price_cents: a.p_max_cents,
      fulfillment_filter: a.p_fulfillment,
      include_unlocated: false,
      result_limit: 200,
    });
    setSearching(false);
    if (rpcError) { setError("Couldn't load listings for this area."); return; }
    lastSearch.current = at;
    setMoved(false);
    setPins(
      (data ?? [])
        .filter((l) => l.location_lat !== null && l.location_lng !== null)
        .map((l) => ({
          id: l.id,
          title: l.title,
          lat: l.location_lat as number,
          lng: l.location_lng as number,
          cents: l.asking_price_cents,
          place: [l.location_city, l.location_state].filter(Boolean).join(", "),
        })),
    );
  }, [filters]);

  // Start where the viewer is, if the browser will say; otherwise the whole US.
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setZoom(10);
        setLocated(true);
      },
      () => { /* denied: stay on the US view and ask the viewer to pan */ },
      { timeout: 8000, maximumAge: 600_000 },
    );
  }, []);

  const searchVisible = useCallback(() => {
    const map = mapRef.current;
    const bounds = map?.getBounds();
    const c = map?.getCenter();
    if (!bounds || !c) return;
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    void search(
      { lat: c.lat(), lng: c.lng() },
      radiusForBounds({ lat: sw.lat(), lng: sw.lng() }, { lat: ne.lat(), lng: ne.lng() }),
    );
  }, [search]);

  const onIdle = useCallback(() => {
    const c = mapRef.current?.getCenter();
    if (!c) return;
    const here = { lat: c.lat(), lng: c.lng() };
    if (!lastSearch.current) { searchVisible(); return; }
    if (metresBetween(here, lastSearch.current) > RESEARCH_METRES) setMoved(true);
  }, [searchVisible]);

  // Filters changed (new URL): search the current view again.
  useEffect(() => {
    if (mapRef.current && lastSearch.current) searchVisible();
  }, [filters, searchVisible]);

  if (!marketplaceMapAvailable()) return null;

  return (
    <div className="space-y-3">
      <div className="relative h-[60vh] min-h-80 overflow-hidden rounded-lg border border-border bg-muted">
        {!isLoaded ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading map…</div>
        ) : (
          <GoogleMap
            mapContainerStyle={{ width: "100%", height: "100%" }}
            center={center}
            zoom={zoom}
            onLoad={(m) => { mapRef.current = m; }}
            onUnmount={() => { mapRef.current = null; }}
            onIdle={onIdle}
            options={{ clickableIcons: false, streetViewControl: false, mapTypeControl: false }}
          >
            {pins.map((p) => (
              <MarkerF
                key={p.id}
                position={{ lat: p.lat, lng: p.lng }}
                title={p.title}
                onClick={() => setActive(p)}
                icon={{
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 9,
                  fillColor: priceBandFor(p.cents).color,
                  fillOpacity: 1,
                  strokeColor: "#FFFFFF",
                  strokeWeight: 2,
                }}
              />
            ))}
            {active && (
              <InfoWindowF position={{ lat: active.lat, lng: active.lng }} onCloseClick={() => setActive(null)}>
                <div className="min-w-40 max-w-56 text-black">
                  <p className="text-sm font-semibold">{active.title}</p>
                  <p className="text-sm">{formatCents(active.cents, { omitZeroCents: true })}</p>
                  {active.place && <p className="text-xs opacity-60">{active.place}</p>}
                  <Link href={`/marketplace/${active.id}`} className="mt-1 inline-block text-xs font-semibold underline">
                    View listing
                  </Link>
                </div>
              </InfoWindowF>
            )}
          </GoogleMap>
        )}

        {moved && (
          <div className="absolute left-1/2 top-3 -translate-x-1/2">
            <Button size="sm" variant="secondary" className="shadow-md" onClick={searchVisible} disabled={searching}>
              <NavigationArrow size={14} weight="fill" /> {searching ? "Searching…" : "Search this area"}
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        {PRICE_BANDS.map((b) => (
          <span key={b.key} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-3 w-3 rounded-full border border-background" style={{ backgroundColor: b.color }} />
            {b.label}
          </span>
        ))}
        <span className="ml-auto">
          {searching ? "Searching…" : `${pins.length} on the map`}
        </span>
      </div>
      {!located && (
        <p className="text-xs text-muted-foreground">
          Location is off, so the map starts on the whole US. Zoom to an area, then tap Search this area.
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">
        Pins mark a public court or an approximate area chosen by the seller — never a home address. Listings whose
        sellers chose city-only or no location appear in the list, not on the map.
      </p>
    </div>
  );
}
