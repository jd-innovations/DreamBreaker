"use client";

// Players map for /players — signed-in only (the page is behind a sign-in
// layout, and the RPCs refuse anon). Owner decision 2026-09-22: NO precise
// location. Pins are:
//
//   court  a player's home court — a public place already shown on their profile
//   city   players with no home court, at the average position of their city's
//          courts. There is no zip level: profiles store no postal code.
//
// Each pin carries a count, never a person; tapping lists who is there.
// Data: directory_map_pins / directory_map_players (20260922170000), which apply
// the directory's rules — discoverable only, blocks in both directions.
//
// Hidden without NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (not provisioned yet); the page
// then hides the Map tab. Shares the site's single Maps loader id.

import { useCallback, useEffect, useRef, useState } from "react";
import { GoogleMap, MarkerF, useJsApiLoader } from "@react-google-maps/api";
import { NavigationArrow } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { GOOGLE_MAPS_LOADER_ID } from "@/components/nearby-map";
import { radiusForBounds } from "@/lib/marketplace/browse";
import {
  fetchMapPins, fetchPinPlayers, type DirectoryPlayer, type MapPin,
} from "@/lib/players/directory";
import { PlayerRow } from "@/components/players/player-row";

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
export const playersMapAvailable = () => KEY.length > 0;

const US_CENTER = { lat: 39.8283, lng: -98.5795 };
const RESEARCH_METRES = 3_200; // ~2 miles, as the marketplace map

// Painted by Google Maps, not CSS, so concrete colours: brand gold for courts,
// slate for the coarser city fallback.
const PIN = { court: "#C9A84C", city: "#64748B" } as const;

function metresBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function PlayersMap({ onMessage }: { onMessage: (p: DirectoryPlayer) => void }) {
  const { isLoaded } = useJsApiLoader({ id: GOOGLE_MAPS_LOADER_ID, googleMapsApiKey: KEY });
  const mapRef = useRef<google.maps.Map | null>(null);
  const lastSearch = useRef<{ lat: number; lng: number } | null>(null);

  const [center, setCenter] = useState(US_CENTER);
  const [zoom, setZoom] = useState(4);
  const [located, setLocated] = useState(false);
  const [pins, setPins] = useState<MapPin[]>([]);
  const [moved, setMoved] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<MapPin | null>(null);
  const [people, setPeople] = useState<DirectoryPlayer[]>([]);
  const [loadingPeople, setLoadingPeople] = useState(false);

  useEffect(() => {
    if (!navigator.geolocation) return;
    // The viewer's own position only centres the map in their browser; it is
    // never sent anywhere or stored.
    navigator.geolocation.getCurrentPosition(
      (pos) => { setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setZoom(10); setLocated(true); },
      () => {},
      { timeout: 8000, maximumAge: 600_000 },
    );
  }, []);

  const searchVisible = useCallback(async () => {
    const map = mapRef.current;
    const bounds = map?.getBounds();
    const c = map?.getCenter();
    if (!bounds || !c) return;
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const at = { lat: c.lat(), lng: c.lng() };
    setSearching(true);
    setError(null);
    const r = await fetchMapPins(at.lat, at.lng,
      radiusForBounds({ lat: sw.lat(), lng: sw.lng() }, { lat: ne.lat(), lng: ne.lng() }));
    setSearching(false);
    if (!r.ok) { setError(r.message); return; }
    lastSearch.current = at;
    setMoved(false);
    setPins(r.data);
  }, []);

  const onIdle = useCallback(() => {
    const c = mapRef.current?.getCenter();
    if (!c) return;
    if (!lastSearch.current) { void searchVisible(); return; }
    if (metresBetween({ lat: c.lat(), lng: c.lng() }, lastSearch.current) > RESEARCH_METRES) setMoved(true);
  }, [searchVisible]);

  async function select(pin: MapPin) {
    setSelected(pin);
    setPeople([]);
    setLoadingPeople(true);
    const r = await fetchPinPlayers(pin);
    setLoadingPeople(false);
    if (!r.ok) { setError(r.message); return; }
    setPeople(r.data);
  }

  if (!playersMapAvailable()) return null;

  const total = pins.reduce((n, p) => n + p.playerCount, 0);

  return (
    <div className="space-y-3">
      <div className="relative h-[55vh] min-h-80 overflow-hidden rounded-lg border border-border bg-muted">
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
                key={`${p.kind}:${p.key}`}
                position={{ lat: p.lat, lng: p.lng }}
                title={`${p.label} — ${p.playerCount} player${p.playerCount === 1 ? "" : "s"}`}
                onClick={() => void select(p)}
                label={{ text: String(p.playerCount), color: "#0A1228", fontSize: "12px", fontWeight: "700" }}
                icon={{
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: p.playerCount > 9 ? 16 : 13,
                  fillColor: PIN[p.kind],
                  fillOpacity: selected?.key === p.key ? 1 : 0.9,
                  strokeColor: "#FFFFFF",
                  strokeWeight: selected?.key === p.key ? 3 : 2,
                }}
              />
            ))}
          </GoogleMap>
        )}

        {moved && (
          <div className="absolute left-1/2 top-3 -translate-x-1/2">
            <Button size="sm" variant="secondary" className="shadow-md" onClick={() => void searchVisible()} disabled={searching}>
              <NavigationArrow size={14} weight="fill" /> {searching ? "Searching…" : "Search this area"}
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-3 w-3 rounded-full" style={{ backgroundColor: PIN.court }} /> Home court
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-3 w-3 rounded-full" style={{ backgroundColor: PIN.city }} /> City (no home court set)
        </span>
        <span className="ml-auto">{searching ? "Searching…" : `${total} player${total === 1 ? "" : "s"} in view`}</span>
      </div>
      {!located && (
        <p className="text-xs text-muted-foreground">
          Location is off, so the map starts on the whole US. Zoom to an area, then tap Search this area.
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {selected && (
        <section aria-live="polite" className="space-y-2">
          <h2 className="text-sm font-semibold">
            {selected.label}
            <span className="font-normal text-muted-foreground">
              {" · "}{selected.kind === "court" ? "home court" : "city"} · {selected.playerCount} player{selected.playerCount === 1 ? "" : "s"}
            </span>
          </h2>
          {loadingPeople ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <ul className="space-y-2">
              {people.map((p) => <PlayerRow key={p.id} player={p} onMessage={onMessage} />)}
            </ul>
          )}
        </section>
      )}

      <p className="text-xs text-muted-foreground">
        Players appear at their home court, or at their city if they haven&apos;t set one — never at a personal
        location. Only players who allow discovery are shown.
      </p>
    </div>
  );
}
