"use client";

// Step 3 — where the user plays, and how far they will travel.
//
// The city/state/coordinates come from an IP lookup, exactly as mobile's
// area-recommendations screen does it. That lookup is a PREFILL, never a gate:
// ad blockers and strict CSP break it often enough that the manual inputs have
// to be the real control.
//
// Coordinates matter more than they look. The partner finder keeps candidates
// whose distance cannot be computed, so a user without lat/lng surfaces to
// everyone regardless of the searcher's radius. Filling them here is what makes
// distance filtering work at all.
//
// This is the one optional step — a user is allowed to decline to say where
// they are, and `story_radius_miles` is NOT NULL DEFAULT 25, so skipping leaves
// a sane value rather than a null.

import { useEffect, useState } from "react";
import { MapPin } from "@phosphor-icons/react";
import { useOnboarding } from "@/lib/onboarding/state";
import { RADIUS_OPTIONS } from "@/lib/onboarding/options";
import { fetchIpLocation } from "@/lib/geo/ip-location";
import { StepFrame } from "@/components/onboarding/step-frame";

const inputCls =
  "w-full h-12 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring focus:border-primary/50 transition-shadow";

export default function AreaStep() {
  const { draft, update, touched, hydrating } = useOnboarding();
  const [looking, setLooking] = useState(false);
  const [lookupFailed, setLookupFailed] = useState(false);

  // Prefill once, and never over an answer the user already gave.
  useEffect(() => {
    if (hydrating) return;
    if (touched.has("estimatedCity") || touched.has("estimatedState")) return;

    let cancelled = false;
    // The lookup is a network call that cannot happen during render; this only
    // marks it in flight so the label can say so.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLooking(true);

    fetchIpLocation()
      .then((loc) => {
        if (cancelled) return;
        if (!loc || (!loc.city && !loc.state)) { setLookupFailed(true); return; }
        if (loc.city) update("estimatedCity", loc.city);
        if (loc.state) update("estimatedState", loc.state);
        if (loc.lat != null) update("estimatedLat", loc.lat);
        if (loc.lng != null) update("estimatedLng", loc.lng);
      })
      .finally(() => { if (!cancelled) setLooking(false); });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrating]);

  // Typing a city by hand invalidates coordinates that came from somewhere
  // else — better no coordinates than ones pointing at the wrong place.
  const editCity = (city: string) => {
    update("estimatedCity", city || null);
    update("estimatedLat", null);
    update("estimatedLng", null);
  };

  const radius = draft.searchRadiusMiles;

  return (
    <StepFrame slug="area">
      <div className="space-y-8">
        <div>
          <div className="flex items-center gap-2 mb-2.5">
            <MapPin size={14} weight="fill" className="text-primary" />
            <span className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground">
              {looking ? "FINDING YOUR AREA…" : "YOUR AREA"}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-3">
            <input
              value={draft.estimatedCity ?? ""}
              onChange={(e) => editCity(e.target.value)}
              placeholder="City"
              autoComplete="address-level2"
              aria-label="City"
              data-testid="onboarding-city"
              className={inputCls}
            />
            <input
              value={draft.estimatedState ?? ""}
              onChange={(e) => update("estimatedState", e.target.value || null)}
              placeholder="State"
              autoComplete="address-level1"
              aria-label="State"
              maxLength={2}
              data-testid="onboarding-state"
              className={`${inputCls} uppercase`}
            />
          </div>

          {lookupFailed && (
            <p className="text-xs text-muted-foreground mt-2">
              We couldn&apos;t work out where you are — type your city and state above.
            </p>
          )}
        </div>

        <div>
          <label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-2.5">
            HOW FAR WILL YOU TRAVEL?
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {RADIUS_OPTIONS.map((miles) => {
              const selected = radius === miles;
              return (
                <button
                  key={miles}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => update("searchRadiusMiles", miles)}
                  data-testid={`onboarding-radius-${miles}`}
                  className={`min-h-14 rounded-xl border text-sm font-medium transition-colors ${
                    selected
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-secondary/20 text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {miles} mi
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Leave this alone and we&apos;ll use 25 miles.
          </p>
        </div>
      </div>
    </StepFrame>
  );
}
