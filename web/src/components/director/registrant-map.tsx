"use client";

// Director registrant map — "where is my field from" (owner-approved 2026-10-01).
// The tournament's own director only: the RPCs refuse anyone else.
//
// Built on the players map (components/players/players-map.tsx): count pins at a
// home court (gold) or city (slate), never a personal location. Adds the venue,
// distance rings, a field summary, and division / status filters.
// Shares the site's single Maps loader id.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CircleF, GoogleMap, MarkerF, useJsApiLoader } from "@react-google-maps/api";
import { User } from "@phosphor-icons/react";
import { SafeImage } from "@/components/shared/safe-image";
import { GOOGLE_MAPS_LOADER_ID } from "@/components/nearby-map";
import { formatPlayerRating } from "@/lib/players/directory";
import {
  RING_MILES, STATUS_GROUPS, fetchRegistrantPinPlayers, fetchRegistrantPins, milesToMetres, summarize,
  type RegistrantMapData, type RegistrantPin, type RegistrantPlayer, type StatusGroup,
} from "@/lib/director/registrant-map";

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
const US_CENTER = { lat: 39.8283, lng: -98.5795 };

// Painted by Google Maps, not CSS, so concrete colours — the players map's, plus
// navy for the venue.
const PIN = { court: "#C9A84C", city: "#64748B", venue: "#0A1228" } as const;

type Selected = RegistrantPin | { kind: "unplaced"; key: "unplaced"; label: string; playerCount: number };

const chip = (on: boolean) =>
  `px-3 py-1.5 rounded-full border text-xs font-medium transition-colors whitespace-nowrap ${
    on ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
  }`;

export function RegistrantMap({
  tournamentId, divisions,
}: {
  tournamentId: string;
  divisions: { id: string; name: string }[];
}) {
  const { isLoaded } = useJsApiLoader({ id: GOOGLE_MAPS_LOADER_ID, googleMapsApiKey: KEY });
  const mapRef = useRef<google.maps.Map | null>(null);

  const [divisionId, setDivisionId] = useState<string | null>(null);
  const [statusGroup, setStatusGroup] = useState<StatusGroup>("active");
  const [data, setData] = useState<RegistrantMapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Selected | null>(null);
  const [people, setPeople] = useState<RegistrantPlayer[]>([]);
  const [loadingPeople, setLoadingPeople] = useState(false);

  // Frame the venue and every pin; zoom no closer than city level for one point.
  const fit = useCallback((d: RegistrantMapData | null) => {
    const map = mapRef.current;
    if (!map || !d) return;
    const points = [...d.pins, ...(d.venue ? [d.venue] : [])];
    if (points.length === 0) { map.setCenter(US_CENTER); map.setZoom(4); return; }
    if (points.length === 1) { map.setCenter(points[0]); map.setZoom(9); return; }
    const b = new google.maps.LatLngBounds();
    points.forEach((p) => b.extend(p));
    map.fitBounds(b, 48);
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Database fetch (an external system); state is set after it resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    setSelected(null);
    void fetchRegistrantPins(tournamentId, divisionId, statusGroup).then((r) => {
      if (cancelled) return;
      setLoading(false);
      if (!r.ok) { setError(r.message); setData(null); return; }
      setData(r.data);
      fit(r.data);
    });
    return () => { cancelled = true; };
  }, [tournamentId, divisionId, statusGroup, fit]);

  async function select(pin: Selected) {
    setSelected(pin);
    setPeople([]);
    setLoadingPeople(true);
    const r = await fetchRegistrantPinPlayers(tournamentId, pin, divisionId, statusGroup);
    setLoadingPeople(false);
    if (!r.ok) { setError(r.message); return; }
    setPeople(r.data);
  }

  if (!KEY) {
    return <p className="text-sm text-muted-foreground">The registrant map needs a Google Maps key on this deployment.</p>;
  }

  const summary = data ? summarize(data) : null;
  const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="space-y-2">
        {divisions.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Division">
            <button type="button" className={chip(divisionId === null)} aria-pressed={divisionId === null} onClick={() => setDivisionId(null)}>
              All divisions
            </button>
            {divisions.map((d) => (
              <button key={d.id} type="button" className={chip(divisionId === d.id)} aria-pressed={divisionId === d.id} onClick={() => setDivisionId(d.id)}>
                {d.name}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2" role="group" aria-label="Status">
          {STATUS_GROUPS.map((g) => (
            <button key={g.id} type="button" className={chip(statusGroup === g.id)} aria-pressed={statusGroup === g.id} onClick={() => setStatusGroup(g.id)}>
              {g.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <div className="space-y-2 min-w-0">
          <div className="relative h-[55vh] min-h-80 overflow-hidden rounded-lg border border-border bg-muted">
            {!isLoaded ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading map…</div>
            ) : (
              <GoogleMap
                mapContainerStyle={{ width: "100%", height: "100%" }}
                center={US_CENTER}
                zoom={4}
                onLoad={(m) => { mapRef.current = m; fit(data); }}
                onUnmount={() => { mapRef.current = null; }}
                options={{ clickableIcons: false, streetViewControl: false, mapTypeControl: false }}
              >
                {data?.venue && (
                  <>
                    {RING_MILES.map((mi) => (
                      <CircleF
                        key={mi}
                        center={data.venue!}
                        radius={milesToMetres(mi)}
                        options={{ clickable: false, fillOpacity: 0, strokeColor: PIN.venue, strokeOpacity: 0.35, strokeWeight: 1 }}
                      />
                    ))}
                    <MarkerF
                      position={data.venue}
                      title={`Venue — ${data.venue.name}`}
                      zIndex={1000}
                      icon={{
                        path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
                        scale: 6, fillColor: PIN.venue, fillOpacity: 1, strokeColor: "#FFFFFF", strokeWeight: 2,
                      }}
                    />
                  </>
                )}
                {data?.pins.map((p) => (
                  <MarkerF
                    key={`${p.kind}:${p.key}`}
                    position={{ lat: p.lat, lng: p.lng }}
                    title={`${p.label} — ${p.playerCount} registrant${p.playerCount === 1 ? "" : "s"}`}
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
            {loading && isLoaded && (
              <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-md bg-background/90 px-3 py-1.5 text-xs shadow">Loading…</div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="h-3 w-3 rounded-full" style={{ backgroundColor: PIN.court }} /> Home court
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="h-3 w-3 rounded-full" style={{ backgroundColor: PIN.city }} /> City (no home court set)
            </span>
            {data?.venue && <span>Rings: {RING_MILES.join(" / ")} mi from the venue</span>}
          </div>
          {data && !data.venue && (
            <p className="text-xs text-muted-foreground">This tournament isn&apos;t linked to a facility with a map location, so there&apos;s no venue pin or distance rings.</p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        {/* Summary */}
        {summary && data && (
          <aside className="space-y-4 rounded-lg border border-border bg-card p-4">
            <div>
              <p className="font-mono text-[10px] tracking-widest text-muted-foreground">REGISTRANTS</p>
              <p className="text-2xl font-bold">{summary.total}</p>
              <p className="text-xs text-muted-foreground">{summary.placed} on the map</p>
            </div>
            {summary.local != null && summary.placed > 0 && (
              <div>
                <p className="font-mono text-[10px] tracking-widest text-muted-foreground">WITHIN {RING_MILES[0]} MI</p>
                <p className="text-2xl font-bold">{pct(summary.local, summary.placed)}%</p>
                <p className="text-xs text-muted-foreground">{summary.local} of {summary.placed} placed registrants</p>
              </div>
            )}
            {summary.topCities.length > 0 && (
              <div>
                <p className="mb-1.5 font-mono text-[10px] tracking-widest text-muted-foreground">TOP CITIES</p>
                <ol className="space-y-1 text-sm">
                  {summary.topCities.map((c) => (
                    <li key={c.city} className="flex justify-between gap-3">
                      <span className="truncate">{c.city}</span><span className="font-semibold">{c.count}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {(data.unplaced > 0 || data.guests > 0) && (
              <div className="space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
                {data.unplaced > 0 && (
                  <button
                    type="button"
                    className="block text-left underline-offset-2 hover:underline"
                    onClick={() => void select({ kind: "unplaced", key: "unplaced", label: "No home court or city", playerCount: data.unplaced })}
                  >
                    {data.unplaced} with no home court or city — see who
                  </button>
                )}
                {data.guests > 0 && <p>{data.guests} guest{data.guests === 1 ? "" : "s"} with no app account (no location)</p>}
              </div>
            )}
            {summary.total === 0 && !loading && <p className="text-sm text-muted-foreground">No registrants match these filters.</p>}
          </aside>
        )}
      </div>

      {selected && (
        <section aria-live="polite" className="space-y-2">
          <h2 className="text-sm font-semibold">
            {selected.label}
            <span className="font-normal text-muted-foreground">
              {" · "}{selected.kind === "court" ? "home court" : selected.kind === "city" ? "city" : "not on the map"}
              {" · "}{selected.playerCount} registrant{selected.playerCount === 1 ? "" : "s"}
            </span>
          </h2>
          {loadingPeople ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {people.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/profile/${p.id}`}
                    className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
                      {p.avatarUrl
                        ? <SafeImage src={p.avatarUrl} alt="" fill sizes="40px" className="object-cover" />
                        : <User size={20} className="text-muted-foreground" aria-hidden />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{p.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[formatPlayerRating(p.rating), p.location, p.divisions].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <p className="text-xs text-muted-foreground">
        Registrants appear at their home court, or at their city if they haven&apos;t set one — never at a personal location.
      </p>
    </div>
  );
}
