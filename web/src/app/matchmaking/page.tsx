"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Heart, X, Lightning, MapPin, Star, ArrowRight, Trophy,
  SlidersHorizontal, ArrowLeft, ArrowUp, Users, Heartbeat,
  CheckCircle,
} from "@phosphor-icons/react";
import Link from "next/link";
import { toast } from "sonner";
import { PageShell } from "@/components/layout/page-shell";
import { createClient } from "@/lib/supabase/client";
import { matchPartners } from "@/data/mock-data";
import { MatchSettingsPanel } from "@/components/shared/match-settings-panel";
import { PlayerProfileSheet } from "@/components/shared/player-profile-sheet";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Partner {
  id: string;
  name: string;
  handle: string | null;
  dupr: number | null;
  skill_level: string | null;
  location: string;
  distance: string | null;
  availability: string | null;
  play_style: string | null;
  badges: string[];
  img: string;
  bio: string | null;
  matchPct: number;
  matchReasons: string[];
  tournamentOverlap: string | null;
  mutuals: number;
  isTopRated: boolean;
  isVerified: boolean;
}

interface Filters {
  format: string;
  minDupr: string;
  maxDupr: string;
  availability: string;
  maxDistance: string;
}

const DEFAULT_FILTERS: Filters = { format: "All", minDupr: "", maxDupr: "", availability: "All", maxDistance: "Any" };

const FORMATS = ["All", "Mixed Doubles", "Men's Doubles", "Women's Doubles", "Singles"];
const AVAIL_OPTIONS = ["All", "Weekends", "Weeknights", "Flexible", "Sat / Sun mornings", "Weekends + Tue evenings"];
const DISTANCES = ["Any", "5 mi", "10 mi", "25 mi", "50 mi"];

// ─── Compute match score ──────────────────────────────────────────────────────

function computeMatch(
  p: { dupr: number | null; availability: string | null; distance: string | null },
  myDupr: number | null,
  myAvail: string | null,
): { pct: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  if (p.dupr && myDupr && Math.abs(p.dupr - myDupr) <= 0.5) {
    score += 35; reasons.push("Same DUPR range");
  }
  if (p.availability && myAvail && p.availability === myAvail) {
    score += 30; reasons.push("Matching availability");
  }
  const dist = p.distance ? parseInt(p.distance) : 99;
  if (dist <= 10) { score += 25; reasons.push("Near you"); }
  else if (dist <= 25) { score += 15; }

  // base
  score += 10;

  return { pct: Math.min(score, 99), reasons };
}

// ─── Adapters ────────────────────────────────────────────────────────────────

function profileToPartner(
  p: {
    id: string; full_name: string; handle: string | null;
    dupr: number | null; skill_level: string | null;
    location_city: string | null; location_state: string | null;
    avatar_url: string | null; bio: string | null; play_style: string | null;
    availability: string | null;
  },
  myDupr: number | null,
  myAvail: string | null,
): Partner {
  const { pct, reasons } = computeMatch({ dupr: p.dupr, availability: p.availability, distance: null }, myDupr, myAvail);
  return {
    id: p.id,
    name: p.full_name,
    handle: p.handle,
    dupr: p.dupr,
    skill_level: p.skill_level,
    location: [p.location_city, p.location_state].filter(Boolean).join(", ") || "Unknown",
    distance: null,
    availability: p.availability,
    play_style: p.play_style,
    badges: [p.play_style].filter(Boolean) as string[],
    img: p.avatar_url ?? "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=600&h=800&fit=crop",
    bio: p.bio,
    matchPct: pct,
    matchReasons: reasons,
    tournamentOverlap: null,
    mutuals: 0,
    isTopRated: (p.dupr ?? 0) >= 4.5,
    isVerified: !!p.handle,
  };
}

function mockToPartner(p: (typeof matchPartners)[0], myDupr: number | null, myAvail: string | null): Partner {
  const { pct, reasons } = computeMatch({ dupr: p.dupr, availability: p.availability, distance: p.distance }, myDupr, myAvail);
  return {
    id: p.id,
    name: p.name,
    handle: null,
    dupr: p.dupr,
    skill_level: null,
    location: p.location,
    distance: p.distance,
    availability: p.availability,
    play_style: p.style,
    badges: [p.style],
    img: p.img,
    bio: p.bio,
    matchPct: pct,
    matchReasons: reasons,
    tournamentOverlap: pct > 70 ? "Austin Open" : null,
    mutuals: Math.floor(pct / 20),
    isTopRated: p.dupr >= 4.5,
    isVerified: false,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MatchRing({ pct }: { pct: number }) {
  const r = 18;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <div className="relative h-[52px] w-[52px] flex items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 44 44" fill="none">
        <circle cx="22" cy="22" r={r} stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
        <circle cx="22" cy="22" r={r} stroke="hsl(var(--primary))" strokeWidth="3"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
      </svg>
      <div className="text-center z-10">
        <div className="font-display text-[13px] leading-none text-white">{pct}%</div>
        <div className="font-mono text-[7px] tracking-wide text-white/70 leading-none mt-0.5">MATCH</div>
      </div>
    </div>
  );
}

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 bg-card/60 border border-border/60 rounded-xl px-3 py-2.5">
      <div className="font-mono text-[9px] tracking-[0.2em] text-muted-foreground mb-0.5">{label}</div>
      <div className="text-sm font-semibold leading-tight">{value}</div>
    </div>
  );
}

function ReasonPill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-primary/40 bg-primary/8 text-xs font-mono text-primary">
      <CheckCircle size={11} weight="fill" />{label}
    </span>
  );
}

// ─── Filter Drawer ────────────────────────────────────────────────────────────

function FilterDrawer({ filters, onChange, onClose }: { filters: Filters; onChange: (f: Filters) => void; onClose: () => void }) {
  const [local, setLocal] = useState(filters);
  const set = (k: keyof Filters, v: string) => setLocal((f) => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full sm:max-w-sm bg-card border border-border rounded-t-3xl sm:rounded-3xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-2xl tracking-wide">FILTERS</h3>
          <button onClick={onClose} className="h-9 w-9 rounded-full border border-border flex items-center justify-center hover:bg-secondary transition-colors"><X size={16} weight="bold" /></button>
        </div>

        <div>
          <p className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground mb-2">FORMAT</p>
          <div className="flex flex-wrap gap-2">
            {FORMATS.map((f) => (
              <button key={f} onClick={() => set("format", f)} className={`px-3 h-8 rounded-full text-xs font-mono border transition-colors ${local.format === f ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}>{f}</button>
            ))}
          </div>
        </div>

        <div>
          <p className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground mb-2">DUPR RANGE</p>
          <div className="flex items-center gap-3">
            <input value={local.minDupr} onChange={(e) => set("minDupr", e.target.value)} placeholder="3.0" className="flex-1 h-10 rounded-xl bg-secondary border border-border px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
            <span className="text-muted-foreground">–</span>
            <input value={local.maxDupr} onChange={(e) => set("maxDupr", e.target.value)} placeholder="5.0" className="flex-1 h-10 rounded-xl bg-secondary border border-border px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </div>
        </div>

        <div>
          <p className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground mb-2">AVAILABILITY</p>
          <div className="flex flex-wrap gap-2">
            {AVAIL_OPTIONS.map((a) => (
              <button key={a} onClick={() => set("availability", a)} className={`px-3 h-8 rounded-full text-xs font-mono border transition-colors ${local.availability === a ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}>{a}</button>
            ))}
          </div>
        </div>

        <div>
          <p className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground mb-2">MAX DISTANCE</p>
          <div className="flex gap-2">
            {DISTANCES.map((d) => (
              <button key={d} onClick={() => set("maxDistance", d)} className={`px-3 h-8 rounded-full text-xs font-mono border transition-colors ${local.maxDistance === d ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}>{d}</button>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-2 border-t border-border">
          <button onClick={() => { onChange(local); onClose(); }} className="flex-1 h-11 rounded-full bg-primary text-primary-foreground font-display tracking-[0.2em] text-sm">APPLY</button>
          <button onClick={() => { setLocal(DEFAULT_FILTERS); onChange(DEFAULT_FILTERS); }} className="h-11 px-5 rounded-full border border-border text-sm hover:bg-secondary transition-colors">Reset</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function MatchmakingPage() {
  const [deck, setDeck] = useState<Partner[]>([]);
  const [matches, setMatches] = useState<Partner[]>([]);
  const [swipeDir, setSwipeDir] = useState<"left" | "right" | "up" | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [myDupr, setMyDupr] = useState<number | null>(null);
  const [myAvail, setMyAvail] = useState<string | null>(null);
  const [myLocation, setMyLocation] = useState<string | null>(null);
  const [myStyle, setMyStyle] = useState<string | null>(null);
  const [myBio, setMyBio] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [sheetPartner, setSheetPartner] = useState<Partner | null>(null);

  useEffect(() => {
    const supabase = createClient();
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setDeck(matchPartners.map((p) => mockToPartner(p, null, null)));
        setLoading(false);
        return;
      }
      setMyId(user.id);

      // Get my profile for match scoring
      const { data: me } = await supabase.from("profiles").select("dupr,availability,location_city,location_state,play_style,bio").eq("id", user.id).single();
      const meDupr = me?.dupr ?? null;
      const meAvail = me?.availability ?? null;
      setMyDupr(meDupr);
      setMyAvail(meAvail);
      setMyLocation([me?.location_city, me?.location_state].filter(Boolean).join(", ") || null);
      setMyStyle(me?.play_style ?? null);
      setMyBio(me?.bio ?? null);

      const { data: alreadySwiped } = await supabase.from("matchmaking_swipes").select("target_id").eq("requester_id", user.id);
      const swipedIds = new Set((alreadySwiped ?? []).map((s) => s.target_id));

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id,full_name,handle,dupr,skill_level,location_city,location_state,avatar_url,bio,play_style,availability")
        .eq("role", "player")
        .neq("id", user.id)
        .order("dupr", { ascending: false })
        .limit(20);

      const partners = (profiles ?? []).filter((p) => !swipedIds.has(p.id)).map((p) => profileToPartner(p, meDupr, meAvail));
      setDeck(partners.length > 0 ? [...partners].reverse() : matchPartners.map((p) => mockToPartner(p, meDupr, meAvail)));

      // Mutual matches
      const { data: mutual } = await supabase.from("v_mutual_matches").select("player_a,player_b").or(`player_a.eq.${user.id},player_b.eq.${user.id}`);
      if (mutual && mutual.length > 0) {
        const ids = mutual.map((m) => m.player_a === user.id ? m.player_b : m.player_a).filter(Boolean) as string[];
        const { data: mp } = await supabase.from("profiles").select("id,full_name,handle,dupr,skill_level,location_city,location_state,avatar_url,bio,play_style,availability").in("id", ids);
        setMatches((mp ?? []).map((p) => profileToPartner(p, meDupr, meAvail)));
      }

      setLoading(false);
    }
    load().catch(() => {
      setDeck(matchPartners.map((p) => mockToPartner(p, null, null)));
      setLoading(false);
    });
  }, []);

  const top = deck[deck.length - 1];

  const swipe = useCallback(async (dir: "left" | "right" | "up") => {
    if (!top) return;
    setSwipeDir(dir);

    if (myId) {
      const supabase = createClient();
      await supabase.from("matchmaking_swipes").insert({
        requester_id: myId,
        target_id: top.id,
        direction: dir === "left" ? "pass" : "like",
      });
    }

    setTimeout(() => {
      setDeck((d) => d.slice(0, -1));
      setSwipeDir(null);
      if (dir === "right") {
        setMatches((m) => [top, ...m]);
        toast.success(`Liked ${top.name}!`, { description: "If they like you back, it's a match." });
      } else if (dir === "up") {
        setMatches((m) => [top, ...m]);
        toast.success(`Super-connected with ${top.name}!`, { description: "They'll see you at the top of their queue." });
      }
    }, 300);
  }, [top, myId]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!top || showFilters || sheetPartner) return;
      if (e.key === "ArrowLeft") swipe("left");
      if (e.key === "ArrowRight") swipe("right");
      if (e.key === "ArrowUp") swipe("up");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [top, swipe, showFilters]);

  // Filter the deck
  const visibleDeck = deck.filter((p) => {
    if (filters.minDupr && (p.dupr ?? 0) < parseFloat(filters.minDupr)) return false;
    if (filters.maxDupr && (p.dupr ?? 99) > parseFloat(filters.maxDupr)) return false;
    if (filters.availability !== "All" && p.availability !== filters.availability) return false;
    if (filters.maxDistance !== "Any") {
      const maxMi = parseInt(filters.maxDistance);
      const dist = p.distance ? parseInt(p.distance) : 999;
      if (dist > maxMi) return false;
    }
    return true;
  });

  const topCard = visibleDeck[visibleDeck.length - 1];

  const animClass = swipeDir === "right"
    ? "translate-x-[120%] rotate-[18deg]"
    : swipeDir === "left"
      ? "translate-x-[-120%] rotate-[-18deg]"
      : swipeDir === "up"
        ? "-translate-y-[120%] scale-95 opacity-0"
        : "";

  return (
    <PageShell>
      {/* Header */}
      <section className="border-b border-border bg-card/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex items-end justify-between">
          <div>
            <div className="font-mono text-[11px] tracking-[0.3em] text-primary mb-2">/ PARTNER FINDER</div>
            <h1 className="font-display text-4xl sm:text-5xl tracking-wide">FIND YOUR <span className="text-primary">PARTNER</span></h1>
            <p className="text-muted-foreground text-sm mt-1.5">
              {loading ? "Finding players near you…" : `${visibleDeck.length} partners near you`}
            </p>
            {!loading && (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-muted-foreground text-xs font-mono">swipe or use</span>
                <span className="inline-flex items-center gap-1.5">
                  <kbd className="px-2.5 py-1 rounded-full bg-secondary border border-border text-[11px] font-mono">← pass</kbd>
                  <kbd className="px-2.5 py-1 rounded-full bg-secondary border border-border text-[11px] font-mono">→ like</kbd>
                  <kbd className="px-2.5 py-1 rounded-full bg-secondary border border-border text-[11px] font-mono">↑ connect</kbd>
                </span>
              </div>
            )}
          </div>
          <button
            onClick={() => setShowFilters(true)}
            className="h-11 px-4 rounded-full border border-border flex items-center gap-2 text-sm hover:bg-secondary/60 transition-colors"
            data-testid="filter-btn"
          >
            <SlidersHorizontal size={16} weight="bold" />
            <span className="font-mono text-xs tracking-[0.15em]">FILTERS</span>
            {(filters.format !== "All" || filters.minDupr || filters.maxDupr || filters.availability !== "All" || filters.maxDistance !== "Any") && (
              <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />
            )}
          </button>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Card deck */}
        <div className="lg:col-span-2 flex flex-col items-center">
          <div className="relative w-full max-w-sm select-none" style={{ height: 580 }} data-testid="swipe-deck">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="h-12 w-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
              </div>
            ) : visibleDeck.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full border border-dashed border-border rounded-3xl text-muted-foreground gap-3 px-8 text-center">
                <Trophy size={40} weight="duotone" className="text-primary" />
                <div className="font-display text-2xl tracking-wide">ALL CAUGHT UP</div>
                <p className="text-sm">No more players to review. Check back soon or adjust your filters.</p>
                <button onClick={() => setFilters(DEFAULT_FILTERS)} className="mt-2 h-10 px-6 rounded-full border border-border hover:bg-secondary/60 text-sm font-mono tracking-wider transition-colors">RESET FILTERS</button>
              </div>
            ) : (
              <>
                {/* Stacked cards behind */}
                {visibleDeck.slice(-3, -1).map((p, i, arr) => {
                  const depth = arr.length - 1 - i;
                  return (
                    <div
                      key={p.id}
                      className="absolute inset-x-0 inset-y-0 rounded-3xl border border-border bg-card overflow-hidden shadow-lg"
                      style={{ bottom: `${-depth * 10}px`, transform: `scale(${1 - depth * 0.03})`, transformOrigin: "bottom center", zIndex: i + 1 }}
                    />
                  );
                })}

                {/* Top card */}
                {topCard && (
                  <div
                    key={topCard.id}
                    className={`absolute inset-x-0 rounded-3xl border border-border bg-card overflow-hidden shadow-2xl transition-all duration-300 ${animClass}`}
                    style={{ zIndex: 10 }}
                    data-testid="top-card"
                  >
                    {/* Photo section */}
                    <div className="relative h-72 overflow-hidden">
                      <img src={topCard.img} alt="" className="h-full w-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />

                      {/* Match ring — top left */}
                      <div className="absolute top-4 left-4">
                        <MatchRing pct={topCard.matchPct} />
                      </div>

                      {/* Badge — top right */}
                      {topCard.isTopRated && (
                        <div className="absolute top-4 right-4 px-3 py-1.5 rounded-full bg-primary text-primary-foreground font-mono text-[10px] tracking-[0.2em] font-bold">
                          TOP RATED
                        </div>
                      )}

                      {/* Swipe overlays */}
                      {swipeDir === "right" && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="rotate-[-20deg] border-4 border-primary rounded-2xl px-6 py-3">
                            <span className="font-display text-4xl text-primary tracking-widest">LIKE</span>
                          </div>
                        </div>
                      )}
                      {swipeDir === "left" && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="rotate-[20deg] border-4 border-destructive rounded-2xl px-6 py-3">
                            <span className="font-display text-4xl text-destructive tracking-widest">PASS</span>
                          </div>
                        </div>
                      )}
                      {swipeDir === "up" && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="border-4 border-sky-400 rounded-2xl px-6 py-3">
                            <span className="font-display text-4xl text-sky-400 tracking-widest">CONNECT</span>
                          </div>
                        </div>
                      )}

                      {/* Name / DUPR overlay */}
                      <div className="absolute bottom-4 left-5 right-5">
                        <div className="flex items-center gap-2">
                          <h2 className="font-display text-3xl tracking-wide text-white leading-tight">{topCard.name}</h2>
                          {topCard.isVerified && <CheckCircle size={18} weight="fill" className="text-primary flex-shrink-0" />}
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          {topCard.dupr ? (
                            <span className="flex items-center gap-1 bg-primary text-primary-foreground text-xs font-mono font-bold px-2.5 py-1 rounded-full">
                              {topCard.dupr} DUPR
                            </span>
                          ) : topCard.skill_level ? (
                            <span className="flex items-center gap-1 bg-secondary/80 text-foreground text-xs font-mono px-2.5 py-1 rounded-full">
                              <Star size={11} weight="fill" className="text-primary" />
                              {topCard.skill_level.replace("-", " – ")}
                            </span>
                          ) : null}
                          {topCard.badges.slice(0, 1).map((b) => (
                            <span key={b} className="bg-foreground/80 text-background text-xs font-mono px-2.5 py-1 rounded-full">{b.toUpperCase()}</span>
                          ))}
                          <span className="flex items-center gap-1 text-white/80 text-xs">
                            <MapPin size={12} weight="bold" />{topCard.location}{topCard.distance ? ` · ${topCard.distance}` : ""}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Info section */}
                    <div className="p-5 space-y-4">
                      {/* Availability + preferred side chips */}
                      <div className="flex gap-2">
                        {topCard.availability && <InfoChip label="AVAILABILITY" value={topCard.availability} />}
                        {topCard.play_style && <InfoChip label="PLAY STYLE" value={topCard.play_style} />}
                      </div>

                      {/* Why we matched */}
                      {topCard.matchReasons.length > 0 && (
                        <div>
                          <p className="font-mono text-[9px] tracking-[0.25em] text-primary mb-2 flex items-center gap-1.5">
                            <Lightning size={10} weight="fill" /> WHY WE MATCHED YOU
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {topCard.matchReasons.map((r) => <ReasonPill key={r} label={r} />)}
                          </div>
                        </div>
                      )}

                      {/* Bio */}
                      {topCard.bio && (
                        <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">{topCard.bio}</p>
                      )}

                      {/* Footer: tournament overlap + mutuals + PROFILE */}
                      <div className="flex items-center justify-between pt-3 border-t border-border/60">
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          {topCard.tournamentOverlap && (
                            <span className="flex items-center gap-1">
                              <Trophy size={12} weight="fill" className="text-primary" />
                              <span className="font-semibold text-foreground">{topCard.tournamentOverlap}</span> overlap
                            </span>
                          )}
                          {topCard.mutuals > 0 && (
                            <span className="flex items-center gap-1">
                              <Users size={12} weight="fill" className="text-primary" />
                              <span className="font-semibold text-foreground">{topCard.mutuals}</span> mutuals
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => setSheetPartner(topCard)}
                          className="flex items-center gap-1 text-xs font-display tracking-[0.15em] text-primary hover:underline"
                          data-testid="open-profile-sheet"
                        >
                          PROFILE <ArrowRight size={12} weight="bold" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Action buttons */}
          {!loading && visibleDeck.length > 0 && (
            <div className="flex items-center gap-5 mt-8">
              {/* Pass */}
              <button
                onClick={() => swipe("left")}
                title="Pass (←)"
                data-testid="swipe-left-btn"
                className="h-16 w-16 rounded-full border-2 border-destructive bg-card flex items-center justify-center transition-all shadow-lg hover:bg-destructive/10 active:scale-95"
              >
                <X size={28} weight="bold" className="text-destructive" />
              </button>

              {/* Super connect (↑) */}
              <button
                onClick={() => swipe("up")}
                title="Super Connect (↑)"
                data-testid="swipe-up-btn"
                className="h-20 w-20 rounded-full bg-foreground text-background flex items-center justify-center transition-all shadow-xl hover:scale-105 active:scale-95"
              >
                <Lightning size={32} weight="fill" />
              </button>

              {/* Like */}
              <button
                onClick={() => swipe("right")}
                title="Like (→)"
                data-testid="swipe-right-btn"
                className="h-16 w-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center transition-all shadow-lg hover:bg-primary/90 hover:scale-105 active:scale-95"
              >
                <Heart size={28} weight="fill" />
              </button>
            </div>
          )}

          {/* Swipe hint */}
          {!loading && visibleDeck.length > 0 && (
            <div className="flex items-center gap-4 mt-4 text-[10px] font-mono tracking-wider text-muted-foreground">
              <span className="flex items-center gap-1"><ArrowLeft size={10} /> PASS</span>
              <span className="flex items-center gap-1"><ArrowUp size={10} /> SUPER CONNECT</span>
              <span className="flex items-center gap-1">LIKE <ArrowRight size={10} /></span>
            </div>
          )}
        </div>

        {/* Matches sidebar */}
        <aside className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl tracking-wide">MATCHES</h2>
            {matches.length > 0 && (
              <span className="h-6 min-w-6 px-2 rounded-full bg-primary text-primary-foreground font-mono text-xs flex items-center justify-center">{matches.length}</span>
            )}
          </div>

          {matches.length === 0 ? (
            <div className="border border-dashed border-border rounded-2xl p-8 text-center text-muted-foreground">
              <Heartbeat size={28} weight="duotone" className="mx-auto mb-2.5 text-primary" />
              <p className="text-sm leading-relaxed">Swipe right or super-connect with players you want to partner with.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {matches.map((m) => (
                <div key={m.id} className="border border-border rounded-2xl bg-card p-4 flex items-center gap-3 hover:border-primary/50 transition-colors" data-testid={`match-card-${m.id}`}>
                  <img src={m.img} alt="" className="h-12 w-12 rounded-xl object-cover flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-display text-lg tracking-wide truncate">{m.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {m.dupr ? `DUPR ${m.dupr}` : m.skill_level?.replace("-", " – ")}
                      {(m.dupr || m.skill_level) ? " · " : ""}{m.location}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="font-mono text-[10px] text-primary">{m.matchPct}%</span>
                    <button onClick={() => setSheetPartner(m)} className="h-8 w-8 rounded-full bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground flex items-center justify-center transition-all" data-testid={`msg-${m.id}-btn`}>
                      <ArrowRight size={14} weight="bold" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Match settings panel */}
          <MatchSettingsPanel
            myDupr={myDupr}
            myAvail={myAvail}
            myLocation={myLocation}
            myStyle={myStyle}
            myBio={myBio}
          />
        </aside>
      </div>

      {/* Filter drawer */}
      {showFilters && (
        <FilterDrawer filters={filters} onChange={setFilters} onClose={() => setShowFilters(false)} />
      )}

      {/* Player profile sheet */}
      {sheetPartner && (
        <PlayerProfileSheet
          partner={sheetPartner}
          onClose={() => setSheetPartner(null)}
          onPass={() => { swipe("left"); setSheetPartner(null); }}
          onLike={() => { swipe("right"); setSheetPartner(null); }}
          onSuperConnect={() => { swipe("up"); setSheetPartner(null); }}
        />
      )}
    </PageShell>
  );
}
