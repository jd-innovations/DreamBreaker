"use client";

// "Courts near me" on /courts. The visitor's position comes from the browser
// only after they tap, is used for this one query, and is never put in the URL
// or stored (same rule as /lessons, 2026-10-04).

import { useState } from "react";
import { NavigationArrow } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import { CourtCard } from "@/components/courts/court-card";
import type { CourtListing } from "@/lib/courts/directory";

const RADIUS_METERS = 40_234; // 25 miles

type Result = CourtListing & { miles: number };

export function NearMe() {
  const [state, setState] = useState<"idle" | "locating" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [results, setResults] = useState<Result[]>([]);

  function locate() {
    if (!navigator.geolocation) {
      setState("error");
      setMessage("Your browser can't share a location. Search by city or ZIP instead.");
      return;
    }
    setState("locating");
    setMessage(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setState("loading");
        const { data, error } = await createClient().rpc("search_facilities_nearby", {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          radius_meters: RADIUS_METERS,
          search_query: undefined,
          verified_only: false,
          public_only: false,
          result_limit: 30,
          bookable_only: false,
        });
        if (error) {
          setState("error");
          setMessage("Couldn't load courts near you. Please try again.");
          return;
        }
        const rows = (data ?? [])
          .filter((r) => r.slug && r.city && r.state)
          .map((r) => ({
            id: r.id, name: r.name, slug: r.slug!, address: r.address, city: r.city, state: r.state,
            court_count: r.court_count, indoor_courts: r.indoor_courts, outdoor_courts: r.outdoor_courts,
            lighting: r.lighting, public_access: r.public_access, photo_url: null,
            miles: r.distance_meters / 1609.344,
          }));
        setResults(rows);
        setState("done");
      },
      () => {
        setState("error");
        setMessage("Location is off for this site. Search by city or ZIP instead.");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }

  const busy = state === "locating" || state === "loading";

  return (
    <section aria-label="Courts near me" className="space-y-3">
      <button
        type="button"
        onClick={locate}
        disabled={busy}
        className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold transition hover:bg-secondary disabled:opacity-60"
      >
        <NavigationArrow size={16} />
        {state === "locating" ? "Finding you…" : state === "loading" ? "Loading courts…" : "Courts near me"}
      </button>
      {message && <p className="text-sm text-muted-foreground" role="status">{message}</p>}
      {state === "done" && (
        results.length === 0 ? (
          <p className="text-sm text-muted-foreground" role="status">No courts within 25 miles yet. Try a city search.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {results.map((r) => (
              <CourtCard key={r.id} court={r} distance={r.miles < 1 ? "Under 1 mi" : `${Math.round(r.miles)} mi`} />
            ))}
          </div>
        )
      )}
    </section>
  );
}
