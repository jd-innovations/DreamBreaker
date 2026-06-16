"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Heart, X, XCircle, Lightning, MapPin, Star, ArrowRight, Trophy,
  SlidersHorizontal, ArrowLeft, ArrowUp, Users, Heartbeat,
  CheckCircle, ChatCircleDots,
} from "@phosphor-icons/react";
import { MessagingPanel } from "@/components/messaging/panel";
import type { UserProfile as MessagingUserProfile } from "@/components/messaging/panel";
import Link from "next/link";
import { toast } from "sonner";
import { PageShell } from "@/components/layout/page-shell";
import { createClient } from "@/lib/supabase/client";
import { getUserId } from "@/lib/dev-user";
import { matchPartners } from "@/data/mock-data";
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
      <div className="relative z-10 w-full sm:max-w-sm bg-card border border-border rounded-t-3xl sm:rounded-3xl p-6 pb-[120px] sm:pb-6 space-y-5 max-h-[85dvh] overflow-y-auto">
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
  const router = useRouter();
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
  const [matchedPartner, setMatchedPartner] = useState<Partner | null>(null);
  const [messagingTarget, setMessagingTarget] = useState<Partner | null>(null);
  const [allUsers, setAllUsers] = useState<MessagingUserProfile[]>([]);
  const [activeTab, setActiveTab] = useState<"discover" | "requests">("discover");
  const [incoming, setIncoming] = useState<Partner[]>([]);
  // Swipe drag
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const supabase = createClient();
    async function load() {
      const userId = await getUserId();
      if (!userId) {
        router.replace("/auth?redirect=/matchmaking");
        return;
      }
      setMyId(userId);
      const user = { id: userId };

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

      const { data: userProfiles } = await supabase.from("profiles").select("id,full_name,role,avatar_url").order("full_name");
      setAllUsers((userProfiles ?? []) as MessagingUserProfile[]);

      // Incoming likes (people who liked me that I haven't responded to)
      const { data: incomingSwipes } = await supabase
        .from("matchmaking_swipes")
        .select("requester_id")
        .eq("target_id", user.id)
        .eq("direction", "like");
      if (incomingSwipes && incomingSwipes.length > 0) {
        const incomingIds = incomingSwipes.map((s) => s.requester_id).filter((id) => !swipedIds.has(id));
        if (incomingIds.length > 0) {
          const { data: ip } = await supabase.from("profiles").select("id,full_name,handle,dupr,skill_level,location_city,location_state,avatar_url,bio,play_style,availability").in("id", incomingIds);
          setIncoming((ip ?? []).map((p) => profileToPartner(p, meDupr, meAvail)));
        }
      }

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
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(dir === "up" ? [40, 20, 40] : dir === "right" ? 40 : 20);
    }

    if (myId) {
      const supabase = createClient();
      await supabase.from("matchmaking_swipes").insert({
        requester_id: myId,
        target_id: top.id,
        direction: (dir === "left" ? "pass" : "like") as "like" | "pass",
      });

      if (dir === "right" || dir === "up") {
        // Check if the other person already liked us back → mutual match
        const { data: theirSwipe } = await supabase
          .from("matchmaking_swipes")
          .select("id")
          .eq("requester_id", top.id)
          .eq("target_id", myId)
          .in("direction", ["like"] as ("like" | "pass")[])
          .maybeSingle();

        if (theirSwipe) {
          setTimeout(() => setMatchedPartner(top), 350);
        }
      }
    }

    setTimeout(() => {
      setDeck((d) => d.slice(0, -1));
      setSwipeDir(null);
      if (dir === "right") {
        setMatches((m) => [top, ...m]);
        if (!matchedPartner) toast.success(`Liked ${top.name}!`, { description: "If they like you back, it's a match." });
      } else if (dir === "up") {
        setMatches((m) => [top, ...m]);
        if (!matchedPartner) toast.success(`Super-connected with ${top.name}!`, { description: "They'll see you at the top of their queue." });
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

  // ── Drag-to-swipe ──────────────────────────────────────────────────────────
  const SWIPE_TH = 110;
  const onCardPointerDown = (e: React.PointerEvent) => {
    if (swipeDir) return;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    dragRef.current = { x: 0, y: 0 };
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onCardPointerMove = (e: React.PointerEvent) => {
    if (!dragStartRef.current) return;
    const x = e.clientX - dragStartRef.current.x;
    const y = e.clientY - dragStartRef.current.y;
    dragRef.current = { x, y };
    setDrag({ x, y });
  };
  const onCardPointerUp = () => {
    if (!dragStartRef.current) return;
    dragStartRef.current = null;
    setDragging(false);
    const { x, y } = dragRef.current;
    setDrag({ x: 0, y: 0 });
    if (y < -SWIPE_TH && Math.abs(y) > Math.abs(x)) swipe("up");
    else if (x > SWIPE_TH) swipe("right");
    else if (x < -SWIPE_TH) swipe("left");
  };

  // Direction shown in overlays — live while dragging, locked once flying off
  const liveDir: "left" | "right" | "up" | null = swipeDir ?? (dragging
    ? (drag.y < -60 && Math.abs(drag.y) > Math.abs(drag.x) ? "up"
      : drag.x > 60 ? "right"
      : drag.x < -60 ? "left" : null)
    : null);

  return (
    <PageShell>
      {/* Tab switcher + filter */}
      <div className="border-b border-border bg-card/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3">
          <div className="flex gap-1">
            {(["discover", "requests"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`relative px-5 py-3 font-mono text-xs tracking-[0.2em] border-b-2 transition-colors ${activeTab === tab ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                {tab.toUpperCase()}
                {tab === "requests" && incoming.length > 0 && (
                  <span className="ml-2 h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground font-mono text-[9px] inline-flex items-center justify-center">
                    {incoming.length}
                  </span>
                )}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowFilters(true)}
            className="relative h-9 w-9 rounded-full border border-border flex items-center justify-center hover:bg-secondary/60 transition-colors flex-shrink-0"
            data-testid="filter-btn"
            title="Filters"
          >
            <SlidersHorizontal size={16} weight="bold" />
            {(filters.format !== "All" || filters.minDupr || filters.maxDupr || filters.availability !== "All" || filters.maxDistance !== "Any") && (
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary" />
            )}
          </button>
        </div>
      </div>

      {activeTab === "requests" && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
          {/* Incoming likes */}
          <section>
            <div className="flex items-center gap-3 mb-5">
              <h2 className="font-display text-2xl tracking-wide">INCOMING LIKES</h2>
              {incoming.length > 0 && (
                <span className="h-6 min-w-6 px-2 rounded-full bg-primary text-primary-foreground font-mono text-xs flex items-center justify-center">{incoming.length}</span>
              )}
            </div>
            {incoming.length === 0 ? (
              <div className="border border-dashed border-border rounded-2xl p-10 text-center text-muted-foreground">
                <Heart size={28} weight="duotone" className="mx-auto mb-2.5 text-primary" />
                <p className="text-sm">No pending likes yet. Keep swiping to get noticed!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {incoming.map((p) => (
                  <div key={p.id} className="border border-border rounded-2xl bg-card p-4 flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <img src={p.img} alt="" className="h-14 w-14 rounded-xl object-cover flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-display text-lg tracking-wide truncate">{p.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.dupr ? `DUPR ${p.dupr}` : p.skill_level?.replace("-", " – ")}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                          <MapPin size={10} weight="bold" className="text-primary flex-shrink-0" />{p.location}
                        </div>
                      </div>
                      <div className="font-mono text-xs text-primary flex-shrink-0">{p.matchPct}%</div>
                    </div>
                    {p.bio && <p className="text-xs text-muted-foreground line-clamp-2">{p.bio}</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          if (!myId) return;
                          const supabase = createClient();
                          await supabase.from("matchmaking_swipes").insert({ requester_id: myId, target_id: p.id, direction: "pass" as "like" | "pass" });
                          setIncoming((prev) => prev.filter((x) => x.id !== p.id));
                          toast("Passed", { description: p.name });
                        }}
                        className="flex-1 h-9 rounded-full border border-destructive text-destructive text-xs font-display tracking-[0.15em] hover:bg-destructive/10 transition-colors"
                      >PASS</button>
                      <button
                        onClick={async () => {
                          if (!myId) return;
                          const supabase = createClient();
                          await supabase.from("matchmaking_swipes").insert({ requester_id: myId, target_id: p.id, direction: "like" as "like" | "pass" });
                          setIncoming((prev) => prev.filter((x) => x.id !== p.id));
                          setMatches((prev) => [p, ...prev]);
                          setTimeout(() => setMatchedPartner(p), 100);
                        }}
                        className="flex-1 h-9 rounded-full bg-primary text-primary-foreground text-xs font-display tracking-[0.15em] hover:bg-primary/90 transition-colors flex items-center justify-center gap-1.5"
                      ><Heart size={13} weight="fill" /> LIKE BACK</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Mutual matches */}
          <section>
            <div className="flex items-center gap-3 mb-5">
              <h2 className="font-display text-2xl tracking-wide">MUTUAL MATCHES</h2>
              {matches.length > 0 && (
                <span className="h-6 min-w-6 px-2 rounded-full bg-primary text-primary-foreground font-mono text-xs flex items-center justify-center">{matches.length}</span>
              )}
            </div>
            {matches.length === 0 ? (
              <div className="border border-dashed border-border rounded-2xl p-10 text-center text-muted-foreground">
                <Heartbeat size={28} weight="duotone" className="mx-auto mb-2.5 text-primary" />
                <p className="text-sm">No mutual matches yet. Like someone back to connect!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {matches.map((m) => (
                  <div key={m.id} className="border border-border rounded-2xl bg-card p-4 flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <img src={m.img} alt="" className="h-14 w-14 rounded-xl object-cover flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-display text-lg tracking-wide truncate">{m.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {m.dupr ? `DUPR ${m.dupr}` : m.skill_level?.replace("-", " – ")}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                          <MapPin size={10} weight="bold" className="text-primary flex-shrink-0" />{m.location}
                        </div>
                      </div>
                      <div className="font-mono text-xs text-primary flex-shrink-0">{m.matchPct}%</div>
                    </div>
                    <button
                      onClick={() => setMessagingTarget(m)}
                      className="w-full h-9 rounded-full bg-primary text-primary-foreground text-xs font-display tracking-[0.15em] hover:bg-primary/90 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <ChatCircleDots size={14} weight="fill" /> MESSAGE
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {activeTab === "discover" && (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 lg:py-10 grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Card deck */}
        <div className="lg:col-span-2 flex flex-col items-center">
          <div className="relative w-full max-w-sm lg:max-w-none select-none" style={{ height: "min(600px, calc(100dvh - 200px))" }} data-testid="swipe-deck">
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
                    className={`absolute inset-x-0 inset-y-0 rounded-3xl border border-border bg-card overflow-hidden shadow-2xl transition-transform duration-300 flex flex-col lg:flex-row ${animClass}`}
                    style={{
                      zIndex: 10,
                      ...(swipeDir ? {} : {
                        transform: `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x / 18}deg)`,
                        transition: dragging ? "none" : undefined,
                      }),
                    }}
                    data-testid="top-card"
                  >
                    {/* Photo — full height on desktop; drag surface for swiping */}
                    <div
                      className="relative h-72 lg:h-full lg:w-[55%] flex-shrink-0 overflow-hidden cursor-grab active:cursor-grabbing"
                      style={{ touchAction: "none" }}
                      onPointerDown={onCardPointerDown}
                      onPointerMove={onCardPointerMove}
                      onPointerUp={onCardPointerUp}
                      onPointerCancel={onCardPointerUp}
                    >
                      <img src={topCard.img} alt="" draggable={false} className="h-full w-full object-cover object-top pointer-events-none" />
                      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent lg:bg-gradient-to-r lg:from-transparent lg:via-transparent lg:to-background" />

                      {/* Match ring */}
                      <div className="absolute top-4 left-4">
                        <MatchRing pct={topCard.matchPct} />
                      </div>

                      {/* Badge */}
                      {topCard.isTopRated && (
                        <div className="absolute top-4 right-4 px-3 py-1.5 rounded-full bg-primary text-primary-foreground font-mono text-[10px] tracking-[0.2em] font-bold">
                          TOP RATED
                        </div>
                      )}

                      {/* Swipe overlays — react live to the drag */}
                      {liveDir === "right" && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="rotate-[-20deg] border-4 border-primary rounded-2xl px-6 py-3">
                            <span className="font-display text-4xl text-primary tracking-widest">LIKE</span>
                          </div>
                        </div>
                      )}
                      {liveDir === "left" && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="rotate-[20deg] border-4 border-destructive rounded-2xl px-6 py-3">
                            <span className="font-display text-4xl text-destructive tracking-widest">PASS</span>
                          </div>
                        </div>
                      )}
                      {liveDir === "up" && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="border-4 border-sky-400 rounded-2xl px-6 py-3">
                            <span className="font-display text-4xl text-sky-400 tracking-widest">CONNECT</span>
                          </div>
                        </div>
                      )}

                      {/* Name overlay — mobile only (bottom of photo) */}
                      <div className="absolute bottom-4 left-5 right-5 lg:hidden">
                        <div className="flex items-center gap-2">
                          <h2 className="font-display text-3xl tracking-wide text-white leading-tight">{topCard.name}</h2>
                          {topCard.isVerified && <CheckCircle size={18} weight="fill" className="text-primary flex-shrink-0" />}
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          {topCard.dupr ? (
                            <span className="bg-primary text-primary-foreground text-xs font-mono font-bold px-2.5 py-1 rounded-full">{topCard.dupr} DUPR</span>
                          ) : topCard.skill_level ? (
                            <span className="bg-secondary/80 text-foreground text-xs font-mono px-2.5 py-1 rounded-full flex items-center gap-1"><Star size={11} weight="fill" className="text-primary" />{topCard.skill_level.replace("-", " – ")}</span>
                          ) : null}
                          <span className="flex items-center gap-1 text-white/80 text-xs"><MapPin size={12} weight="bold" />{topCard.location}{topCard.distance ? ` · ${topCard.distance}` : ""}</span>
                        </div>
                      </div>
                    </div>

                    {/* Info panel — desktop right side / mobile below */}
                    <div className="flex flex-col justify-between flex-1 p-6 lg:p-8 overflow-y-auto">
                      {/* Name — desktop only */}
                      <div>
                        <div className="hidden lg:block mb-5">
                          <div className="flex items-center gap-2 mb-2">
                            <h2 className="font-display text-4xl tracking-wide leading-tight">{topCard.name}</h2>
                            {topCard.isVerified && <CheckCircle size={20} weight="fill" className="text-primary flex-shrink-0" />}
                          </div>
                          <div className="flex items-center gap-3 flex-wrap">
                            {topCard.dupr ? (
                              <span className="bg-primary text-primary-foreground text-xs font-mono font-bold px-3 py-1.5 rounded-full">{topCard.dupr} DUPR</span>
                            ) : topCard.skill_level ? (
                              <span className="bg-secondary text-foreground text-xs font-mono px-3 py-1.5 rounded-full flex items-center gap-1"><Star size={11} weight="fill" className="text-primary" />{topCard.skill_level.replace("-", " – ")}</span>
                            ) : null}
                            {topCard.badges.slice(0, 2).map((b) => (
                              <span key={b} className="bg-secondary border border-border text-xs font-mono px-3 py-1.5 rounded-full">{b.toUpperCase()}</span>
                            ))}
                            <span className="flex items-center gap-1 text-muted-foreground text-xs"><MapPin size={12} weight="bold" className="text-primary" />{topCard.location}{topCard.distance ? ` · ${topCard.distance}` : ""}</span>
                          </div>
                        </div>

                        {/* Chips */}
                        <div className="flex gap-2 flex-wrap mb-4">
                          {topCard.availability && <InfoChip label="AVAILABILITY" value={topCard.availability} />}
                          {topCard.play_style && <InfoChip label="PLAY STYLE" value={topCard.play_style} />}
                        </div>

                        {/* Why matched */}
                        {topCard.matchReasons.length > 0 && (
                          <div className="mb-4">
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
                          <p className="text-sm text-muted-foreground leading-relaxed lg:line-clamp-4 line-clamp-2">{topCard.bio}</p>
                        )}
                      </div>

                      {/* Footer */}
                      <div className="flex items-center justify-between pt-4 mt-4 border-t border-border/60">
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
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

                      {/* Desktop action buttons inline in card */}
                      <div className="hidden lg:flex items-center gap-3 mt-5">
                        <button onClick={() => swipe("left")} className="flex-1 h-12 rounded-full border-2 border-destructive text-destructive font-display tracking-[0.15em] text-sm flex items-center justify-center gap-2 hover:bg-destructive/10 transition-colors active:scale-95">
                          <XCircle size={18} weight="fill" /> PASS
                        </button>
                        <button onClick={() => swipe("up")} className="h-12 w-12 rounded-full bg-foreground text-background flex items-center justify-center transition-all hover:scale-105 active:scale-95 flex-shrink-0" title="Super Connect">
                          <Lightning size={20} weight="fill" />
                        </button>
                        <button onClick={() => swipe("right")} className="flex-1 h-12 rounded-full bg-primary text-primary-foreground font-display tracking-[0.15em] text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors active:scale-95">
                          <Heart size={18} weight="fill" /> LIKE
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Action buttons — fixed above bottom nav on mobile, inline on desktop */}
          {!loading && visibleDeck.length > 0 && (
            <>
              {/* Mobile — fixed above bottom nav */}
              <div className="fixed bottom-5 left-0 right-0 px-6 lg:hidden z-40">
                <div className="flex items-center gap-3 max-w-sm mx-auto bg-background/80 backdrop-blur-md border border-border rounded-full px-4 py-3 shadow-lg">
                  <button
                    onClick={() => swipe("left")}
                    data-testid="swipe-left-btn"
                    className="flex-1 h-12 rounded-full border-2 border-destructive text-destructive font-display tracking-[0.15em] text-sm flex items-center justify-center gap-2 hover:bg-destructive/10 transition-colors active:scale-95"
                  >
                    <XCircle size={18} weight="fill" /> PASS
                  </button>
                  <button
                    onClick={() => swipe("up")}
                    data-testid="swipe-up-btn"
                    className="h-12 w-12 rounded-full bg-foreground text-background flex items-center justify-center transition-all hover:scale-105 active:scale-95 flex-shrink-0"
                    title="Super Connect"
                  >
                    <Lightning size={20} weight="fill" />
                  </button>
                  <button
                    onClick={() => swipe("right")}
                    data-testid="swipe-right-btn"
                    className="flex-1 h-12 rounded-full bg-primary text-primary-foreground font-display tracking-[0.15em] text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors active:scale-95"
                  >
                    <Heart size={18} weight="fill" /> LIKE
                  </button>
                </div>
              </div>

            </>
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

        </aside>
      </div>
      )}

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

      {/* It's a Match! modal */}
      {matchedPartner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="relative w-full max-w-sm bg-card border border-border rounded-3xl overflow-hidden shadow-2xl text-center">
            {/* Glow */}
            <div className="absolute -top-16 left-1/2 -translate-x-1/2 h-48 w-48 rounded-full bg-primary/25 blur-3xl pointer-events-none" />

            <div className="px-8 pt-10 pb-8 relative">
              {/* Avatars */}
              <div className="flex items-center justify-center gap-[-12px] mb-6">
                <img src={matchedPartner.img} alt="" className="h-20 w-20 rounded-2xl object-cover border-4 border-background shadow-lg -mr-3 z-10" />
                <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center shadow-lg z-20 border-2 border-background">
                  <Heart size={18} weight="fill" className="text-primary-foreground" />
                </div>
                <div className="h-20 w-20 rounded-2xl bg-primary/10 border-4 border-background shadow-lg -ml-3 z-10 flex items-center justify-center">
                  <span className="font-display text-2xl text-primary">YOU</span>
                </div>
              </div>

              <div className="font-mono text-[10px] tracking-[0.35em] text-primary mb-1">IT&apos;S A MATCH</div>
              <h2 className="font-display text-3xl tracking-wide mb-2">YOU & {matchedPartner.name.split(" ")[0].toUpperCase()}</h2>
              <p className="text-sm text-muted-foreground mb-8">
                You both liked each other. Start a conversation and set up a game!
              </p>

              <div className="space-y-3">
                <button
                  onClick={() => { setMessagingTarget(matchedPartner); setMatchedPartner(null); }}
                  className="w-full h-12 rounded-full bg-primary text-primary-foreground font-display tracking-[0.2em] text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors"
                >
                  <ChatCircleDots size={18} weight="fill" /> SEND A MESSAGE
                </button>
                <button
                  onClick={() => setMatchedPartner(null)}
                  className="w-full h-12 rounded-full border border-border text-sm font-display tracking-[0.15em] hover:bg-secondary transition-colors"
                >
                  KEEP SWIPING
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Messaging overlay */}
      {messagingTarget && myId && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ height: "min(620px, 90vh)" }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
              <span className="font-display tracking-wider text-sm">MESSAGE {messagingTarget.name.split(" ")[0].toUpperCase()}</span>
              <button onClick={() => setMessagingTarget(null)} className="h-7 w-7 rounded-full border border-border hover:bg-secondary flex items-center justify-center transition-colors">
                <X size={13} weight="bold" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <MessagingPanel
                currentUserId={myId}
                allUsers={allUsers}
                initialRecipientId={messagingTarget.id}
                compact
              />
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
