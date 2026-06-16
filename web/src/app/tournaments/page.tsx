"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { MagnifyingGlass, MapPin, Calendar, Users, Trophy, FunnelSimple } from "@phosphor-icons/react";
import { BookmarkButton } from "@/components/shared/bookmark-button";
import { ShareButton } from "@/components/shared/share-button";
import { PageShell } from "@/components/layout/page-shell";
import { createClient } from "@/lib/supabase/client";
import { tournaments as mockTournaments } from "@/data/mock-data";

const formats = ["All", "Doubles", "Singles", "Mixed", "Juniors"];
const levels = ["All", "3.0 – 4.0", "3.5 – 4.5", "4.0 – 5.0", "4.5+", "U18"];

type TournamentRow = {
  id: string;
  name: string;
  city: string;
  state: string;
  venue_name: string | null;
  venue_address: string | null;
  cover_img_url: string | null;
  format: string;
  skill_min: number | null;
  skill_max: number | null;
  draw_size: number;
  spots_filled: number;
  entry_fee_cents: number;
  hold_fee_cents: number;
  prize_pool_cents: number | null;
  event_date: string;
  status: string;
};

function toDisplayFormat(fmt: string) {
  return fmt.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function levelLabel(min: number | null, max: number | null) {
  if (!min && !max) return "Open";
  if (!max) return `${min}+`;
  return `${min} – ${max}`;
}

function statusLabel(status: string) {
  return status === "filling_fast" ? "Filling Fast" : status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Adapt mock data to the same shape so the card component stays uniform
function mockToRow(t: (typeof mockTournaments)[0]): TournamentRow {
  const [city, state] = t.location.split(", ");
  return {
    id: t.id, name: t.name, city, state: state ?? "",
    venue_name: t.venue, venue_address: null, cover_img_url: t.img,
    format: t.format.split("·")[0].trim().toLowerCase().replace(/ /g, "_"),
    skill_min: null, skill_max: null,
    draw_size: t.spots, spots_filled: t.filled,
    entry_fee_cents: t.entryFee * 100, hold_fee_cents: t.holdFee * 100,
    prize_pool_cents: parseInt(t.prize.replace(/[^0-9]/g, "")) * 100,
    event_date: t.dateISO,
    status: t.status.toLowerCase().replace(/ /g, "_"),
  };
}

export default function TournamentsPage() {
  const [q, setQ] = useState("");
  const [format, setFormat] = useState("All");
  const [level, setLevel] = useState("All");
  const [rows, setRows] = useState<TournamentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    async function load() {
      const { data } = await supabase
        .from("tournaments")
        .select("id,name,city,state,venue_name,venue_address,cover_img_url,format,skill_min,skill_max,draw_size,spots_filled,entry_fee_cents,hold_fee_cents,prize_pool_cents,event_date,status")
        .in("status", ["open", "filling_fast", "registration_closed"])
        .order("event_date", { ascending: true });
      setRows(data && data.length > 0 ? data : mockTournaments.map(mockToRow));
      setLoading(false);
    }
    load().catch(() => {
      setRows(mockTournaments.map(mockToRow));
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => rows.filter((t) => {
    const loc = `${t.city}, ${t.state}`.toLowerCase();
    const matchQ = !q || t.name.toLowerCase().includes(q.toLowerCase()) || loc.includes(q.toLowerCase());
    const matchFmt = format === "All" || toDisplayFormat(t.format).toLowerCase().includes(format.toLowerCase());
    const matchLvl = level === "All" || levelLabel(t.skill_min, t.skill_max) === level;
    return matchQ && matchFmt && matchLvl;
  }), [q, format, level, rows]);

  return (
    <PageShell>
      <section className="border-b border-border bg-card/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="font-mono text-[11px] tracking-[0.3em] text-primary mb-3">/ THE CIRCUIT</div>
          <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl tracking-wide">TOURNAMENTS</h1>
          <p className="text-muted-foreground mt-3 max-w-xl">{loading ? "Loading events…" : `${filtered.length} events. Hold a spot, register your partner, lock your rank.`}</p>
        </div>
      </section>

      <section className="border-b border-border sticky top-16 z-30 bg-background/90 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col lg:flex-row gap-3 lg:items-center">
          <div className="relative flex-1">
            <MagnifyingGlass size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" weight="bold" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tournaments, cities..." data-testid="tournament-search-input" className="w-full pl-11 pr-4 h-12 rounded-full bg-secondary border border-border outline-none text-sm focus:ring-2 focus:ring-ring" />
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <FunnelSimple size={18} weight="bold" className="text-muted-foreground hidden lg:block" />
            <div className="flex gap-1 overflow-x-auto scrollbar-hide">
              {formats.map((f) => (
                <button key={f} onClick={() => setFormat(f)} data-testid={`filter-format-${f.toLowerCase()}`} className={`px-4 h-10 rounded-full text-xs font-display tracking-[0.2em] whitespace-nowrap border transition-colors ${format === f ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>{f.toUpperCase()}</button>
              ))}
            </div>
            <div className="hidden md:block h-6 w-px bg-border mx-1" />
            <div className="flex gap-1 overflow-x-auto scrollbar-hide">
              {levels.map((l) => (
                <button key={l} onClick={() => setLevel(l)} data-testid={`filter-level-${l.replace(/\s|–|\+/g, "")}`} className={`px-4 h-10 rounded-full text-xs font-mono whitespace-nowrap border transition-colors ${level === l ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}>{l}</button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="border border-border rounded-2xl overflow-hidden bg-card animate-pulse">
                <div className="h-44 bg-secondary" />
                <div className="p-5 space-y-3">
                  <div className="h-4 bg-secondary rounded w-3/4" />
                  <div className="h-3 bg-secondary rounded w-1/2" />
                  <div className="h-2 bg-secondary rounded w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">No tournaments match your filters.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((t) => {
              const pct = Math.round((t.spots_filled / t.draw_size) * 100);
              const prizeDisplay = t.prize_pool_cents ? `$${(t.prize_pool_cents / 100).toLocaleString()}` : "—";
              const dateDisplay = new Date(t.event_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
              const fmtDisplay = toDisplayFormat(t.format);
              const lvlDisplay = levelLabel(t.skill_min, t.skill_max);
              const statusDisplay = statusLabel(t.status);
              const isFast = t.status === "filling_fast";
              const coverImg = t.cover_img_url || "https://images.unsplash.com/photo-1737477004595-e9b659bb44ca?w=800&q=80";

              return (
                <div key={t.id} data-testid={`tournament-card-${t.id}`} className="group border border-border rounded-2xl overflow-hidden bg-card hover:border-primary transition-all flex flex-col">
                  <Link href={`/tournaments/${t.id}`} className="relative h-44 overflow-hidden block">
                    <img src={coverImg} alt="" className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                    <div className="absolute top-3 left-3 flex gap-2">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-mono tracking-widest font-bold ${isFast ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"}`}>{statusDisplay.toUpperCase()}</span>
                      <span className="px-2.5 py-1 rounded-full bg-black/60 backdrop-blur text-white text-[10px] font-mono tracking-widest">{lvlDisplay}</span>
                    </div>
                    <div className="absolute bottom-3 left-3 right-3">
                      <div className="font-display text-2xl text-white tracking-wide leading-tight">{t.name}</div>
                      <div className="text-xs text-white/70 font-mono mt-1">{fmtDisplay}</div>
                    </div>
                  </Link>
                  <div className="p-5 space-y-2.5 flex-1 flex flex-col">
                    <div className="space-y-0.5">
                      {t.venue_name && (
                        <div className="text-sm font-semibold truncate">{t.venue_name}</div>
                      )}
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-1.5 text-muted-foreground min-w-0">
                          <MapPin size={13} weight="bold" className="flex-shrink-0" />
                          <span className="truncate">
                            {t.venue_address ? `${t.venue_address}, ` : ""}{t.city}, {t.state}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground flex-shrink-0 ml-2"><Calendar size={13} weight="bold" />{dateDisplay}</div>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground flex items-center gap-1"><Users size={12} weight="bold" /> {t.spots_filled}/{t.draw_size}</span>
                        <span className="font-mono text-muted-foreground">{pct}% FILLED</span>
                      </div>
                      <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} /></div>
                    </div>
                    <div className="pt-3 mt-auto border-t border-border flex items-center justify-between">
                      <div className="flex items-center gap-1.5"><Trophy size={16} weight="fill" className="text-primary" /><span className="font-display text-xl tracking-wide">{prizeDisplay}</span></div>
                      <div className="flex items-center gap-2">
                        <BookmarkButton tournamentId={t.id} size="sm" />
                        <ShareButton
                          title={t.name}
                          text={`Check out ${t.name} on Compete Pickleball — ${t.city}, ${t.state}`}
                          url={`${typeof window !== "undefined" ? window.location.origin : ""}/tournaments/${t.id}`}
                          size="sm"
                        />
                        <Link href={`/tournaments/${t.id}`}><button className="rounded-full bg-foreground text-background hover:bg-foreground/90 font-display tracking-[0.2em] text-[11px] px-4 h-9 transition-colors" data-testid={`tournament-view-${t.id}`}>VIEW</button></Link>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </PageShell>
  );
}
