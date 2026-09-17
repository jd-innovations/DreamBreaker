"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  MapPin, Calendar, Users, Plus, Confetti, ArrowRight, Sparkle, WarningCircle,
  ArrowClockwise, NavigationArrow, SortAscending, FunnelSimple, X, ListBullets,
} from "@phosphor-icons/react";
import { PageShell } from "@/components/layout/page-shell";
import { createClient } from "@/lib/supabase/client";
import { withTimeout } from "@/lib/with-timeout";
import {
  type PlayEvent, type PlayEventType, EVENT_TYPES, SKILL_RANGES,
  eventTypeLabel, statusLabel, skillLabel, skillRangeOverlaps,
  formatEventDate, formatEventTime,
} from "@/lib/community-play";
import { requestLocation, type BrowserLocation } from "@/lib/geo/browser-location";
import { distanceMiles, formatDistanceMiles, DISTANCE_STEPS, distanceStepToMiles, type DistanceStepIndex } from "@/lib/geo/distance";
import { NearbyMap, isMapAvailable, type MapPin as GeoMapPin } from "@/components/nearby-map";

type EventWithExtras = PlayEvent & {
  participant_count: number;
  facility: { latitude: number; longitude: number } | null;
  distanceMi: number | null;
};

const STATUS_FILTERS = ["All", "Open", "Live", "Completed"] as const;
type SortMode = "date" | "distance";

function StatusBadge({ status }: { status: PlayEvent["status"] }) {
  const map: Record<string, string> = {
    open: "bg-primary/15 text-primary border-primary/30",
    full: "bg-amber-400/15 text-amber-500 border-amber-400/30",
    in_progress: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
    completed: "bg-secondary text-muted-foreground border-border",
    cancelled: "bg-destructive/15 text-destructive border-destructive/30",
  };
  return (
    <span className={`px-2.5 py-1 rounded-full border font-mono text-[10px] tracking-[0.12em] ${map[status]}`}>
      {statusLabel(status).toUpperCase()}
    </span>
  );
}

function EventCard({ e }: { e: EventWithExtras }) {
  const spotsLeft = e.max_players - e.participant_count;
  const time = formatEventTime(e.start_time);
  return (
    <Link href={`/play/${e.id}`} className="block group">
      <div className="border border-border rounded-2xl bg-card p-5 hover:border-primary/40 hover:shadow-lg transition-all duration-200 h-full flex flex-col">
        <div className="flex items-start justify-between gap-3 mb-3">
          <span className="px-2.5 py-1 rounded-full bg-secondary border border-border font-mono text-[10px] tracking-[0.12em] text-muted-foreground">
            {eventTypeLabel(e.event_type).toUpperCase()}
          </span>
          <div className="flex items-center gap-1.5">
            {e.distanceMi != null && (
              <span className="px-2 py-1 rounded-full bg-primary/10 text-primary font-mono text-[10px] tracking-[0.08em] flex items-center gap-1">
                <NavigationArrow size={9} weight="fill" /> {formatDistanceMiles(e.distanceMi)}
              </span>
            )}
            <StatusBadge status={e.status} />
          </div>
        </div>

        <h3 className="font-display text-xl tracking-tight leading-[0.85] mb-2 group-hover:text-primary transition-colors line-clamp-2">
          {e.name}
        </h3>

        <div className="space-y-1.5 text-sm text-muted-foreground flex-1">
          <div className="flex items-center gap-1.5">
            <Calendar size={13} weight="bold" className="text-primary flex-shrink-0" />
            {formatEventDate(e.event_date)}{time ? ` · ${time}` : ""}
          </div>
          <div className="flex items-center gap-1.5">
            <MapPin size={13} weight="bold" className="text-primary flex-shrink-0" />
            <span className="truncate">{e.venue_name ? `${e.venue_name} · ` : ""}{e.location}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Sparkle size={13} weight="bold" className="text-primary flex-shrink-0" />
            {skillLabel(e.skill_min, e.skill_max)}
          </div>
        </div>

        <div className="flex items-center justify-between pt-3 mt-3 border-t border-border/60">
          <div className="flex items-center gap-1.5 text-sm">
            <Users size={14} weight="fill" className="text-primary" />
            <span className="font-semibold">{e.participant_count}</span>
            <span className="text-muted-foreground">/ {e.max_players}</span>
          </div>
          {e.status === "open" && spotsLeft > 0 ? (
            <span className="text-xs font-mono text-primary flex items-center gap-1">
              {spotsLeft} {spotsLeft === 1 ? "spot" : "spots"} left <ArrowRight size={12} weight="bold" />
            </span>
          ) : (
            <span className="text-xs font-mono text-muted-foreground flex items-center gap-1">
              View <ArrowRight size={12} weight="bold" />
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function LocationRow({
  location, locating, onRequest,
}: { location: BrowserLocation | null; locating: boolean; onRequest: () => void }) {
  if (location) {
    const label = location.source === "gps"
      ? "Showing distance from your location"
      : location.source === "manual"
        ? "Showing distance from the map area"
        : "Showing distance from your approximate location";
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono tracking-wide">
        <NavigationArrow size={12} weight="fill" className="text-primary" />
        {label}
      </div>
    );
  }
  return (
    <button
      onClick={onRequest}
      disabled={locating}
      className="flex items-center gap-1.5 text-xs font-mono tracking-wide text-primary hover:underline disabled:opacity-60"
    >
      <NavigationArrow size={12} weight="fill" />
      {locating ? "Finding you…" : "Show games near you"}
    </button>
  );
}

export default function PlayBrowsePage() {
  const [rawEvents, setRawEvents] = useState<(PlayEvent & { participant_count: number; facility: { latitude: number; longitude: number } | null })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("All");
  const [typeFilter, setTypeFilter] = useState<PlayEventType | "all">("all");
  const [reloadKey, setReloadKey] = useState(0);

  const [location, setLocation] = useState<BrowserLocation | null>(null);
  const [locating, setLocating] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("date");
  const [distanceStep, setDistanceStep] = useState<DistanceStepIndex>(3);
  const [selectedSkillLabels, setSelectedSkillLabels] = useState<string[]>([]);
  const [hideFull, setHideFull] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const supabase = createClient();
        const { data: rows } = await withTimeout(
          supabase
            .from("play_events")
            .select("*, facility:facilities!play_events_facility_id_fkey(latitude,longitude)")
            .neq("status", "cancelled")
            .neq("event_type", "practice")
            .order("event_date", { ascending: true }),
        );
        if (cancelled) return;
        if (!rows || rows.length === 0) { setRawEvents([]); return; }

        const ids = rows.map((r) => r.id);
        const { data: parts } = await withTimeout(
          supabase.from("play_participants_public").select("event_id").in("event_id", ids),
        );
        if (cancelled) return;

        const counts: Record<string, number> = {};
        (parts ?? []).forEach((p) => { if (p.event_id) counts[p.event_id] = (counts[p.event_id] ?? 0) + 1; });

        setRawEvents(rows.map((r) => ({ ...r, participant_count: counts[r.id] ?? 0 })));
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [reloadKey]);

  async function handleRequestLocation() {
    setLocating(true);
    const loc = await requestLocation();
    setLocating(false);
    if (loc) {
      setLocation(loc);
      setSortMode("distance");
    }
  }

  // Attach computed distance (only possible for events tied to a real
  // facility — see COMMUNITY_GAMES_WEB_PLAN.md Phase 2/3: manual-location
  // events have no coordinates and simply show no distance badge).
  const events: EventWithExtras[] = useMemo(() => {
    return rawEvents.map((e) => {
      const facilityCoords = e.facility;
      const distanceMi = location && facilityCoords
        ? distanceMiles(location, { lat: facilityCoords.latitude, lng: facilityCoords.longitude })
        : null;
      return { ...e, distanceMi };
    });
  }, [rawEvents, location]);

  const maxDistanceMi = distanceStepToMiles(distanceStep);

  const filtered = events.filter((e) => {
    if (statusFilter === "Open" && !(e.status === "open" || e.status === "full")) return false;
    if (statusFilter === "Live" && e.status !== "in_progress") return false;
    if (statusFilter === "Completed" && e.status !== "completed") return false;
    if (typeFilter !== "all" && e.event_type !== typeFilter) return false;
    if (hideFull && e.max_players > 0 && e.participant_count >= e.max_players) return false;
    // Distance filter only excludes events we could actually measure —
    // manual-location events (no distanceMi) pass through untouched, same
    // as mobile's ExploreFilterModal semantics.
    if (maxDistanceMi != null && e.distanceMi != null && e.distanceMi > maxDistanceMi) return false;
    if (!skillRangeOverlaps(e.skill_min, e.skill_max, selectedSkillLabels)) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortMode === "distance") {
      // Events without a distance sort after ones with a known distance —
      // avoids implying "0 mi away" for manually-entered locations.
      if (a.distanceMi == null && b.distanceMi == null) return 0;
      if (a.distanceMi == null) return 1;
      if (b.distanceMi == null) return -1;
      return a.distanceMi - b.distanceMi;
    }
    return a.event_date.localeCompare(b.event_date);
  });

  const activeFilterCount = (typeFilter !== "all" ? 1 : 0) + selectedSkillLabels.length + (hideFull ? 1 : 0) + (maxDistanceMi != null ? 1 : 0);

  // Only events tied to a real facility have coordinates to drop a pin at —
  // manually-located events simply don't appear on the map (they still show
  // up in list view). See COMMUNITY_GAMES_WEB_PLAN.md Phase 5.
  const mapPins: GeoMapPin[] = sorted
    .filter((e): e is EventWithExtras & { facility: { latitude: number; longitude: number } } => e.facility != null)
    .map((e) => ({
      id: e.id,
      lat: e.facility.latitude,
      lng: e.facility.longitude,
      title: e.name,
      subtitle: `${eventTypeLabel(e.event_type)} · ${formatEventDate(e.event_date)}`,
      href: `/play/${e.id}`,
    }));

  function handleSearchThisArea(center: { lat: number; lng: number }) {
    setLocation({ lat: center.lat, lng: center.lng, source: "manual" });
    setSortMode("distance");
  }

  return (
    <PageShell>
      {/* Hero */}
      <section className="border-b border-border bg-gradient-to-b from-primary/5 to-transparent">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 mb-3">
                <Confetti size={18} weight="fill" className="text-primary" />
                <span className="font-mono text-[11px] tracking-[0.25em] text-primary">COMMUNITY PLAY</span>
              </div>
              <h1 className="font-display text-4xl sm:text-5xl tracking-wide leading-[0.95]">
                CASUAL PICKLEBALL,<br />ZERO HASSLE
              </h1>
              <p className="text-muted-foreground mt-4 text-base leading-relaxed">
                Host or join a quick game, round robin, mixer, or clinic in minutes. No account needed to play —
                just grab a paddle and show up. Organizers get a shareable link and built-in scoring.
              </p>
            </div>
            <Link href="/play/create" className="flex-shrink-0">
              <button className="h-12 px-7 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-[0.15em] text-sm transition-colors flex items-center gap-2 shadow-lg shadow-primary/20">
                <Plus size={17} weight="bold" /> HOST AN EVENT
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* Filters + grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-4 h-9 rounded-full text-xs font-mono tracking-wider border transition-colors flex-shrink-0 ${
                  statusFilter === f ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"
                }`}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <LocationRow location={location} locating={locating} onRequest={handleRequestLocation} />
            <button
              onClick={() => setSortMode((m) => (m === "date" ? "distance" : "date"))}
              disabled={!location}
              className="flex items-center gap-1.5 text-xs font-mono tracking-wider text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
              title={location ? "Toggle sort" : "Show games near you to sort by distance"}
            >
              <SortAscending size={14} weight="bold" />
              {sortMode === "date" ? "DATE" : "DISTANCE"}
            </button>
            <button
              onClick={() => setShowFilters((v) => !v)}
              className="flex items-center gap-1.5 h-9 px-3.5 rounded-full border border-border hover:border-primary/50 text-xs font-mono tracking-wider transition-colors"
            >
              <FunnelSimple size={14} weight="bold" />
              FILTERS{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </button>
            {isMapAvailable() && (
              <button
                onClick={() => setViewMode((v) => (v === "list" ? "map" : "list"))}
                className="flex items-center gap-1.5 h-9 px-3.5 rounded-full border border-border hover:border-primary/50 text-xs font-mono tracking-wider transition-colors"
              >
                {viewMode === "list" ? <MapPin size={14} weight="bold" /> : <ListBullets size={14} weight="bold" />}
                {viewMode === "list" ? "MAP" : "LIST"}
              </button>
            )}
          </div>
        </div>

        {showFilters && (
          <div className="rounded-2xl border border-border bg-card p-4 mb-6 space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] tracking-widest text-muted-foreground">TYPE</span>
              <button onClick={() => setShowFilters(false)} className="text-muted-foreground hover:text-foreground" aria-label="Close filters">
                <X size={15} weight="bold" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setTypeFilter("all")}
                className={`px-3 h-8 rounded-full text-xs font-mono tracking-wider border transition-colors ${typeFilter === "all" ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}
              >
                ALL TYPES
              </button>
              {EVENT_TYPES.filter((t) => t.available).map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTypeFilter(t.value)}
                  className={`px-3 h-8 rounded-full text-xs font-mono tracking-wider border transition-colors ${typeFilter === t.value ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}
                >
                  {t.label.toUpperCase()}
                </button>
              ))}
            </div>

            <div>
              <span className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-2">
                MAX DISTANCE{!location ? " (show games near you first)" : ""}
              </span>
              <div className="flex flex-wrap gap-2">
                {DISTANCE_STEPS.map((label, idx) => (
                  <button
                    key={label}
                    onClick={() => setDistanceStep(idx as DistanceStepIndex)}
                    disabled={!location}
                    className={`px-3 h-8 rounded-full text-xs font-mono tracking-wider border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${distanceStep === idx ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}
                  >
                    {label.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-2">SKILL LEVEL</span>
              <div className="flex flex-wrap gap-2">
                {SKILL_RANGES.map((r) => {
                  const active = selectedSkillLabels.includes(r.label);
                  return (
                    <button
                      key={r.label}
                      onClick={() => setSelectedSkillLabels((prev) => active ? prev.filter((l) => l !== r.label) : [...prev, r.label])}
                      className={`px-3 h-8 rounded-full text-xs font-mono tracking-wider border transition-colors ${active ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}
                    >
                      {r.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={hideFull} onChange={(e) => setHideFull(e.target.checked)} className="h-4 w-4 accent-primary" />
              Hide full games
            </label>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="border border-border rounded-2xl bg-card p-5 h-56 animate-pulse">
                <div className="h-5 w-24 bg-secondary rounded-full mb-4" />
                <div className="h-6 w-3/4 bg-secondary rounded mb-3" />
                <div className="space-y-2"><div className="h-3 w-1/2 bg-secondary rounded" /><div className="h-3 w-2/3 bg-secondary rounded" /></div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="border border-dashed border-border rounded-3xl py-20 text-center">
            <WarningCircle size={44} weight="duotone" className="mx-auto mb-4 text-primary" />
            <h3 className="font-display text-2xl tracking-wide mb-2">COULDN&apos;T LOAD EVENTS</h3>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto mb-6">
              The connection timed out. This can happen on a flaky network or a stale session. If it keeps happening, try signing out and back in.
            </p>
            <button onClick={() => { setLoading(true); setError(false); setReloadKey((k) => k + 1); }} className="h-11 px-7 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-[0.15em] text-sm transition-colors inline-flex items-center gap-2">
              <ArrowClockwise size={16} weight="bold" /> RETRY
            </button>
          </div>
        ) : sorted.length === 0 ? (
          <div className="border border-dashed border-border rounded-3xl py-20 text-center">
            <Confetti size={44} weight="duotone" className="mx-auto mb-4 text-primary" />
            <h3 className="font-display text-2xl tracking-wide mb-2">
              {rawEvents.length === 0 ? "NO EVENTS YET" : "NO MATCHES FOR YOUR FILTERS"}
            </h3>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto mb-6">
              {rawEvents.length === 0
                ? "Be the first to host a community game. It takes about a minute to set up."
                : "Try widening your distance, skill, or type filters."}
            </p>
            <Link href="/play/create">
              <button className="h-11 px-7 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-[0.15em] text-sm transition-colors inline-flex items-center gap-2">
                <Plus size={16} weight="bold" /> HOST AN EVENT
              </button>
            </Link>
          </div>
        ) : viewMode === "map" ? (
          <div className="h-[560px] rounded-2xl overflow-hidden border border-border">
            <NearbyMap
              pins={mapPins}
              center={location ? { lat: location.lat, lng: location.lng } : null}
              onSearchThisArea={handleSearchThisArea}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sorted.map((e) => <EventCard key={e.id} e={e} />)}
          </div>
        )}
      </section>
    </PageShell>
  );
}
