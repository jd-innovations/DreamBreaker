"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  MapPin, Calendar, Users, Plus, Confetti, ArrowRight, Sparkle, WarningCircle, ArrowClockwise,
} from "@phosphor-icons/react";
import { PageShell } from "@/components/layout/page-shell";
import { createClient } from "@/lib/supabase/client";
import { withTimeout } from "@/lib/with-timeout";
import {
  type PlayEvent, eventTypeLabel, statusLabel, skillLabel, formatEventDate, formatEventTime,
} from "@/lib/community-play";

type EventWithCount = PlayEvent & { participant_count: number };

const STATUS_FILTERS = ["All", "Open", "Live", "Completed"] as const;

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

function EventCard({ e }: { e: EventWithCount }) {
  const spotsLeft = e.max_players - e.participant_count;
  const time = formatEventTime(e.start_time);
  return (
    <Link href={`/play/${e.id}`} className="block group">
      <div className="border border-border rounded-2xl bg-card p-5 hover:border-primary/40 hover:shadow-lg transition-all duration-200 h-full flex flex-col">
        <div className="flex items-start justify-between gap-3 mb-3">
          <span className="px-2.5 py-1 rounded-full bg-secondary border border-border font-mono text-[10px] tracking-[0.12em] text-muted-foreground">
            {eventTypeLabel(e.event_type).toUpperCase()}
          </span>
          <StatusBadge status={e.status} />
        </div>

        <h3 className="font-display text-xl tracking-wide leading-tight mb-2 group-hover:text-primary transition-colors line-clamp-2">
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

export default function PlayBrowsePage() {
  const [events, setEvents] = useState<EventWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<(typeof STATUS_FILTERS)[number]>("All");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const supabase = createClient();
        const { data: rows } = await withTimeout(
          supabase.from("play_events").select("*").neq("status", "cancelled").order("event_date", { ascending: true }),
        );
        if (cancelled) return;
        if (!rows || rows.length === 0) { setEvents([]); return; }

        const ids = rows.map((r) => r.id);
        const { data: parts } = await withTimeout(
          supabase.from("play_participants_public").select("event_id").in("event_id", ids),
        );
        if (cancelled) return;

        const counts: Record<string, number> = {};
        (parts ?? []).forEach((p) => { if (p.event_id) counts[p.event_id] = (counts[p.event_id] ?? 0) + 1; });

        setEvents(rows.map((r) => ({ ...r, participant_count: counts[r.id] ?? 0 })));
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [reloadKey]);

  const filtered = events.filter((e) => {
    if (filter === "All") return true;
    if (filter === "Open") return e.status === "open" || e.status === "full";
    if (filter === "Live") return e.status === "in_progress";
    if (filter === "Completed") return e.status === "completed";
    return true;
  });

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
                Host or join a recreational round robin in minutes. No account needed to play —
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
        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 h-9 rounded-full text-xs font-mono tracking-wider border transition-colors flex-shrink-0 ${
                filter === f ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"
              }`}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>

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
        ) : filtered.length === 0 ? (
          <div className="border border-dashed border-border rounded-3xl py-20 text-center">
            <Confetti size={44} weight="duotone" className="mx-auto mb-4 text-primary" />
            <h3 className="font-display text-2xl tracking-wide mb-2">NO EVENTS YET</h3>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto mb-6">
              Be the first to host a community round robin. It takes about a minute to set up.
            </p>
            <Link href="/play/create">
              <button className="h-11 px-7 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-[0.15em] text-sm transition-colors inline-flex items-center gap-2">
                <Plus size={16} weight="bold" /> HOST AN EVENT
              </button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((e) => <EventCard key={e.id} e={e} />)}
          </div>
        )}
      </section>
    </PageShell>
  );
}
