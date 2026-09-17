"use client";

// Dual-mode location picker for Community Play event creation: search a real
// `facilities` row (gives the event real lat/lng, which is what makes
// distance-based "nearby" sorting on /play possible), or fall back to free
// text for a venue that isn't in the facilities directory yet. Mirrors
// mobile's FacilityPicker (apps/mobile/src/components/FacilityPicker.tsx),
// which offers the same two modes for the same reason.
//
// Renders hidden inputs so it drops into the existing FormData-based submit
// handler in play/create/page.tsx without changing how that handler reads
// its fields (name="location" / "venue_name" / "city" / "state" /
// "facility_id" match the existing field names exactly).

import { useEffect, useRef, useState } from "react";
import { MagnifyingGlass, MapPin, X, PencilSimple } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";

export type PickedFacility = {
  id: string;
  name: string;
  city: string;
  state: string;
  address: string;
  latitude: number;
  longitude: number;
};

type FacilityRow = {
  id: string;
  name: string;
  city: string;
  state: string;
  address: string;
  latitude: number;
  longitude: number;
};

const inputCls = "w-full h-11 rounded-xl bg-secondary border border-border px-3.5 text-sm outline-none focus:ring-2 focus:ring-ring focus:border-primary/50 transition-shadow";

async function searchFacilities(query: string): Promise<FacilityRow[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const supabase = createClient();
  const { data } = await supabase
    .from("facilities")
    .select("id, name, city, state, address, latitude, longitude")
    .or(`name.ilike.%${trimmed}%,city.ilike.%${trimmed}%`)
    .limit(8);
  return data ?? [];
}

export function FacilityPicker({ defaultManualLocation }: { defaultManualLocation?: string }) {
  const [mode, setMode] = useState<"facility" | "manual">("facility");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FacilityRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<PickedFacility | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (mode !== "facility" || selected) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // Dropdown only renders once the query is 2+ chars (see the render
    // below), so a short/empty query just skips scheduling a search —
    // no need to clear `results` synchronously here.
    if (query.trim().length < 2) return;
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const rows = await searchFacilities(query);
      setResults(rows);
      setSearching(false);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, mode, selected]);

  if (mode === "manual") {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="font-mono text-[10px] tracking-widest text-muted-foreground">LOCATION</label>
          <button
            type="button"
            onClick={() => { setMode("facility"); setSelected(null); }}
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            <MagnifyingGlass size={12} weight="bold" /> Search facilities instead
          </button>
        </div>
        <input name="location" required defaultValue={defaultManualLocation} placeholder="Zilker Park Courts, Austin" className={inputCls} />
        <p className="text-xs text-muted-foreground">
          Manually-entered venues won&apos;t show a distance badge in nearby search — pick a listed facility above if it&apos;s available.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1.5">VENUE NAME (OPTIONAL)</label>
            <input name="venue_name" placeholder="Zilker Park" className={inputCls} />
          </div>
          <div />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1.5">CITY (OPTIONAL)</label>
            <input name="city" placeholder="Austin" className={inputCls} />
          </div>
          <div>
            <label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1.5">STATE (OPTIONAL)</label>
            <input name="state" maxLength={2} placeholder="TX" className={inputCls} />
          </div>
        </div>
      </div>
    );
  }

  if (selected) {
    return (
      <div>
        <label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1.5">LOCATION</label>
        <div className="flex items-center gap-2.5 rounded-xl bg-secondary border border-border px-3.5 h-11">
          <MapPin size={15} weight="fill" className="text-primary flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm truncate">{selected.name}</p>
            <p className="text-xs text-muted-foreground truncate">{selected.city}, {selected.state}</p>
          </div>
          <button type="button" onClick={() => setSelected(null)} aria-label="Clear selected facility" className="text-muted-foreground hover:text-foreground flex-shrink-0">
            <X size={15} weight="bold" />
          </button>
        </div>
        <input type="hidden" name="facility_id" value={selected.id} />
        <input type="hidden" name="location" value={selected.name} />
        <input type="hidden" name="venue_name" value={selected.name} />
        <input type="hidden" name="city" value={selected.city} />
        <input type="hidden" name="state" value={selected.state} />
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-1.5">
        <label className="font-mono text-[10px] tracking-widest text-muted-foreground">LOCATION</label>
        <button
          type="button"
          onClick={() => setMode("manual")}
          className="text-xs text-primary hover:underline flex items-center gap-1"
        >
          <PencilSimple size={12} weight="bold" /> Enter manually
        </button>
      </div>
      <div className="relative">
        <MagnifyingGlass size={15} weight="bold" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search facilities by name or city…"
          className={`${inputCls} pl-10`}
        />
      </div>
      {query.trim().length >= 2 && (
        <div className="mt-1.5 rounded-xl border border-border bg-card overflow-hidden max-h-64 overflow-y-auto">
          {searching ? (
            <p className="px-3.5 py-3 text-sm text-muted-foreground">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-3.5 py-3 text-sm text-muted-foreground">No facilities found. Try entering the location manually.</p>
          ) : (
            results.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => { setSelected(f); setQuery(""); setResults([]); }}
                className="w-full text-left px-3.5 py-2.5 hover:bg-secondary transition-colors flex items-center gap-2.5 border-b border-border last:border-b-0"
              >
                <MapPin size={14} weight="fill" className="text-primary flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm truncate">{f.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{f.city}, {f.state}</p>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
