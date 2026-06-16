"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft, Lightning, MapPin, Calendar, Users, CurrencyDollar,
  Trophy, PencilSimple, CheckCircle, Clock, Warning, Trash,
  Plus, Star, Image, Globe, UploadSimple, X, FloppyDisk,
  DotsSixVertical, Lock, LockOpen, ArrowsClockwise,
  SoccerBall, Gauge, CheckFat,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { PageShell } from "@/components/layout/page-shell";
import { createClient } from "@/lib/supabase/client";
import { getUserId } from "@/lib/dev-user";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Tournament {
  id: string;
  name: string;
  city: string;
  state: string;
  venue_name: string;
  venue_address: string;
  zip_code: string;
  event_date: string;
  format: string;
  formats: string[] | null;
  tournament_format: string | null;
  pool_count: number | null;
  draw_size: number;
  spots_filled: number;
  entry_fee_cents: number;
  hold_fee_cents: number;
  hold_duration_hours: number;
  prize_pool_cents: number | null;
  description: string | null;
  rules: string | null;
  cover_img_url: string | null;
  status: string;
  created_at: string;
}

interface Division {
  id: string;
  name: string;
  format: string;
  gender_category: string;
  draw_size: number;
  spots_filled: number;
  entry_fee_cents: number;
}

interface Sponsor {
  id: string;
  name: string;
  logo_url: string | null;
  website_url: string | null;
  tier: string;
  display_order: number;
}

interface Registration {
  id: string;
  player_id: string;
  status: string;
  division_id: string | null;
  created_at: string;
  profiles: { full_name: string | null; dupr: number | null; skill_level: string | null } | null;
}

interface BracketSeed {
  player_id: string;
  seed_number: number;
  pool_letter: string | null;
  locked: boolean;
  name: string;
  dupr: number | null;
  skill_level: string | null;
}

interface GeneratedMatch {
  round: number;
  match_index: number;
  seed_a: number;
  seed_b: number;
  name_a: string;
  name_b: string;
}

interface CourtMatch {
  player_a: string;
  player_b: string;
  round: string;
  match_id?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(cents: number) { return `$${(cents / 100).toFixed(0)}`; }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

const STRUCTURE_LABELS: Record<string, string> = {
  single_elim: "Single Elimination",
  double_elim: "Double Elimination",
  round_robin: "Round Robin",
  pool_bracket: "Pool Play → Bracket",
  mlp: "MLP Format",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Pending Approval",
  approved: "Approved",
  published: "Live",
  cancelled: "Cancelled",
};
const STATUS_COLORS: Record<string, string> = {
  draft: "text-muted-foreground border-border",
  pending_approval: "text-amber-400 border-amber-400/40 bg-amber-400/10",
  approved: "text-blue-400 border-blue-400/40 bg-blue-400/10",
  published: "text-primary border-primary/40 bg-primary/10",
  cancelled: "text-red-400 border-red-400/40 bg-red-400/10",
};
const TIER_LABELS: Record<string, string> = { title: "Title", gold: "Gold", silver: "Silver", standard: "Standard" };
const TIER_COLORS: Record<string, string> = {
  title: "text-yellow-400 border-yellow-400/40 bg-yellow-400/10",
  gold: "text-amber-400 border-amber-400/40 bg-amber-400/10",
  silver: "text-slate-300 border-slate-300/40 bg-slate-300/10",
  standard: "text-muted-foreground border-border",
};
const POOL_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];
const POOL_COLORS: Record<string, string> = {
  A: "border-violet-500/40 bg-violet-500/10 text-violet-400",
  B: "border-cyan-500/40 bg-cyan-500/10 text-cyan-400",
  C: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  D: "border-pink-500/40 bg-pink-500/10 text-pink-400",
  E: "border-green-500/40 bg-green-500/10 text-green-400",
  F: "border-orange-500/40 bg-orange-500/10 text-orange-400",
};

// Serpentine pool distribution: 1→A, 2→B, 3→C, 4→D, 5→D, 6→C, 7→B, 8→A, 9→A...
function serpentinePool(seedIndex: number, poolCount: number): string {
  const cycle = poolCount * 2 - 2;
  const pos = seedIndex % cycle;
  return POOL_LETTERS[pos < poolCount ? pos : cycle - pos];
}

// Standard single-elim bracket seeding pairs for N players
function buildElimPairs(seeds: BracketSeed[]): GeneratedMatch[] {
  const n = seeds.length;
  if (n < 2) return [];
  // Find next power of 2
  let size = 1;
  while (size < n) size *= 2;
  // Build round 1 matchups using standard bracket ordering
  const pairs: GeneratedMatch[] = [];
  for (let i = 0; i < size / 2; i++) {
    const aIdx = i;
    const bIdx = size - 1 - i;
    const seedA = seeds[aIdx];
    const seedB = seeds[bIdx];
    if (seedA && seedB) {
      pairs.push({
        round: 1,
        match_index: i,
        seed_a: aIdx + 1,
        seed_b: bIdx + 1,
        name_a: seedA.name,
        name_b: seedB.name,
      });
    }
  }
  return pairs;
}

// Round robin: everyone vs everyone
function buildRoundRobinSchedule(seeds: BracketSeed[]): GeneratedMatch[] {
  const matches: GeneratedMatch[] = [];
  let idx = 0;
  for (let i = 0; i < seeds.length; i++) {
    for (let j = i + 1; j < seeds.length; j++) {
      matches.push({
        round: 1,
        match_index: idx++,
        seed_a: i + 1,
        seed_b: j + 1,
        name_a: seeds[i].name,
        name_b: seeds[j].name,
      });
    }
  }
  return matches;
}

// ── Bracket Seed Row (draggable) ──────────────────────────────────────────────

function SeedRow({
  seed, index, locked, isDragging, isDragOver,
  onDragStart, onDragEnter, onDragEnd, onDragOver, onDrop,
}: {
  seed: BracketSeed; index: number; locked: boolean;
  isDragging: boolean; isDragOver: boolean;
  onDragStart: () => void; onDragEnter: () => void; onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void; onDrop: () => void;
}) {
  return (
    <div
      draggable={!locked}
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all select-none
        ${isDragging ? "opacity-40" : ""}
        ${isDragOver ? "border-primary bg-primary/5 scale-[1.01]" : "border-border bg-card"}
        ${locked ? "cursor-default" : "cursor-grab active:cursor-grabbing"}`}
    >
      {!locked && <DotsSixVertical size={14} className="text-muted-foreground flex-shrink-0" />}
      <div className="h-7 w-7 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
        <span className="font-mono text-xs font-bold text-primary">{index + 1}</span>
      </div>
      {seed.pool_letter && (
        <span className={`px-2 py-0.5 rounded-full border font-mono text-[9px] tracking-widest font-bold ${POOL_COLORS[seed.pool_letter] ?? "border-border text-muted-foreground"}`}>
          {seed.pool_letter}
        </span>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate">{seed.name}</div>
        <div className="text-xs text-muted-foreground">
          {seed.dupr ? `DUPR ${seed.dupr}` : seed.skill_level?.replace("-", " – ") ?? "—"}
        </div>
      </div>
    </div>
  );
}

// ── Pool Column ───────────────────────────────────────────────────────────────

function PoolColumn({
  letter, seeds, locked, draggingPlayerId, dragOverPool,
  onDragOver, onDrop, onSeedDragStart, onSeedDragEnd,
}: {
  letter: string; seeds: BracketSeed[]; locked: boolean;
  draggingPlayerId: string | null; dragOverPool: string | null;
  onDragOver: (e: React.DragEvent, pool: string) => void;
  onDrop: (pool: string) => void;
  onSeedDragStart: (playerId: string) => void;
  onSeedDragEnd: () => void;
}) {
  const isOver = dragOverPool === letter;
  return (
    <div
      onDragOver={(e) => onDragOver(e, letter)}
      onDrop={() => onDrop(letter)}
      className={`flex-1 min-w-0 rounded-2xl border-2 p-3 transition-all ${isOver ? "border-primary bg-primary/5" : "border-border bg-card"}`}
    >
      <div className={`font-mono text-[10px] tracking-[0.3em] font-bold mb-3 px-1 ${POOL_COLORS[letter]?.split(" ")[2] ?? "text-muted-foreground"}`}>
        POOL {letter}
      </div>
      <div className="space-y-2">
        {seeds.length === 0 && (
          <div className="h-12 rounded-xl border-2 border-dashed border-border flex items-center justify-center">
            <span className="text-xs text-muted-foreground">Drop here</span>
          </div>
        )}
        {seeds.map((s) => (
          <div
            key={s.player_id}
            draggable={!locked}
            onDragStart={() => onSeedDragStart(s.player_id)}
            onDragEnd={onSeedDragEnd}
            className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 transition-all
              ${draggingPlayerId === s.player_id ? "opacity-40" : ""}
              ${locked ? "cursor-default" : "cursor-grab active:cursor-grabbing"}
              border-border bg-secondary/40`}
          >
            {!locked && <DotsSixVertical size={12} className="text-muted-foreground flex-shrink-0" />}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold truncate">{s.name}</div>
              <div className="text-[10px] text-muted-foreground">{s.dupr ? `DUPR ${s.dupr}` : s.skill_level?.replace("-", " – ") ?? "—"}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Score Entry Modal ─────────────────────────────────────────────────────────

function ScoreModal({
  match, courtNum, onClose, onSave,
}: {
  match: CourtMatch; courtNum: number;
  onClose: () => void;
  onSave: (scoreA: number, scoreB: number) => void;
}) {
  const [scoreA, setScoreA] = useState("");
  const [scoreB, setScoreB] = useState("");
  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display text-xl tracking-wide">ENTER SCORE</h3>
          <button onClick={onClose} className="h-8 w-8 rounded-full border border-border flex items-center justify-center hover:bg-secondary">
            <X size={13} weight="bold" />
          </button>
        </div>
        <div className="font-mono text-[10px] tracking-widest text-muted-foreground mb-3">COURT {courtNum} · {match.round.toUpperCase()}</div>
        <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center mb-6">
          <div className="text-center">
            <div className="text-xs text-muted-foreground mb-1 truncate">{match.player_a}</div>
            <input
              type="number" min={0} max={99} value={scoreA}
              onChange={(e) => setScoreA(e.target.value)}
              className="w-full h-14 rounded-xl bg-secondary border border-border text-center text-2xl font-display outline-none focus:ring-2 focus:ring-ring"
              placeholder="0"
            />
          </div>
          <div className="text-muted-foreground font-mono text-sm">VS</div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground mb-1 truncate">{match.player_b}</div>
            <input
              type="number" min={0} max={99} value={scoreB}
              onChange={(e) => setScoreB(e.target.value)}
              className="w-full h-14 rounded-xl bg-secondary border border-border text-center text-2xl font-display outline-none focus:ring-2 focus:ring-ring"
              placeholder="0"
            />
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 h-11 rounded-full border border-border hover:bg-secondary font-display tracking-wider text-sm">CANCEL</button>
          <button
            onClick={() => {
              const a = parseInt(scoreA, 10);
              const b = parseInt(scoreB, 10);
              if (isNaN(a) || isNaN(b)) { toast.error("Enter both scores."); return; }
              onSave(a, b);
            }}
            className="flex-1 h-11 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-wider text-sm flex items-center justify-center gap-2"
          >
            <CheckFat size={14} weight="fill" /> CONFIRM
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function DirectorTournamentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const validTabs = ["overview", "sponsors", "roster", "bracket", "dayof"] as const;
  type TabId = typeof validTabs[number];
  const initialTab = (validTabs.includes(searchParams.get("tab") as TabId) ? searchParams.get("tab") : "overview") as TabId;
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  // Edit state
  const [editingBanner, setEditingBanner] = useState(false);
  const [bannerUrl, setBannerUrl] = useState("");
  const [savingBanner, setSavingBanner] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);

  // Sponsor form
  const [showSponsorForm, setShowSponsorForm] = useState(false);
  const [addingSponsor, setAddingSponsor] = useState(false);
  const [removingSponsor, setRemovingSponsor] = useState<string | null>(null);

  // Bracket state
  const [seeds, setSeeds] = useState<BracketSeed[]>([]);
  const [bracketLocked, setBracketLocked] = useState(false);
  const [savingSeeds, setSavingSeeds] = useState(false);
  const [generatedMatches, setGeneratedMatches] = useState<GeneratedMatch[]>([]);
  const [dragSeedIdx, setDragSeedIdx] = useState<number | null>(null);
  const [dragOverSeedIdx, setDragOverSeedIdx] = useState<number | null>(null);
  const [draggingPlayerId, setDraggingPlayerId] = useState<string | null>(null);
  const [dragOverPool, setDragOverPool] = useState<string | null>(null);

  // Day-of command center state
  const [courts, setCourts] = useState(4);
  const [courtAssignments, setCourtAssignments] = useState<Record<number, CourtMatch | null>>({});
  const [matchQueue, setMatchQueue] = useState<CourtMatch[]>([]);
  const [draggingMatchIdx, setDraggingMatchIdx] = useState<number | null>(null);
  const [dragOverCourt, setDragOverCourt] = useState<number | null>(null);
  const [scoreModal, setScoreModal] = useState<{ match: CourtMatch; court: number } | null>(null);
  const [completedMatches, setCompletedMatches] = useState<Set<string>>(new Set());

  const detailsFormRef = useRef<HTMLFormElement>(null);

  const load = useCallback(async () => {
    try {
      const userId = await getUserId();
      if (!userId) { router.push("/auth"); return; }
      const supabase = createClient();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: t, error } = await (supabase as any)
        .from("tournaments")
        .select("id,name,city,state,venue_name,venue_address,zip_code,event_date,format,formats,tournament_format,pool_count,draw_size,spots_filled,entry_fee_cents,hold_fee_cents,hold_duration_hours,prize_pool_cents,description,rules,cover_img_url,status,created_at")
        .eq("id", id)
        .eq("director_id", userId)
        .single();

      if (error || !t) { toast.error("Tournament not found or access denied."); router.push("/director"); return; }
      setTournament(t as Tournament);
      setBannerUrl((t as Tournament).cover_img_url ?? "");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: divs } = await (supabase as any)
        .from("divisions")
        .select("id,name,format,gender_category,draw_size,spots_filled,entry_fee_cents")
        .eq("tournament_id", id)
        .order("created_at", { ascending: true });
      setDivisions((divs ?? []) as Division[]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: spons } = await (supabase as any)
        .from("tournament_sponsors")
        .select("id,name,logo_url,website_url,tier,display_order")
        .eq("tournament_id", id)
        .order("display_order", { ascending: true });
      setSponsors((spons ?? []) as Sponsor[]);

      const { data: regs } = await supabase
        .from("registrations")
        .select("id,player_id,status,division_id,created_at,profiles!player_id(full_name,dupr,skill_level)")
        .eq("tournament_id", id)
        .order("created_at", { ascending: true });
      setRegistrations((regs ?? []) as unknown as Registration[]);

      // Bracket seeds
      const { data: seedRows } = await supabase
        .from("bracket_seeds")
        .select("player_id,seed_number,pool_letter,locked")
        .eq("tournament_id", id)
        .order("seed_number", { ascending: true });

      if (seedRows && seedRows.length > 0) {
        const regMap = new Map((regs as unknown as Registration[] ?? []).map((r: Registration) => [r.player_id, r]));
        const mapped: BracketSeed[] = seedRows.map((s: { player_id: string; seed_number: number; pool_letter: string | null; locked: boolean | null }) => {
          const reg = regMap.get(s.player_id);
          return {
            player_id: s.player_id,
            seed_number: s.seed_number,
            pool_letter: s.pool_letter,
            locked: s.locked ?? false,
            name: reg?.profiles?.full_name ?? "Unknown",
            dupr: reg?.profiles?.dupr ?? null,
            skill_level: reg?.profiles?.skill_level ?? null,
          };
        });
        setSeeds(mapped);
        setBracketLocked(mapped.some((s) => s.locked));
      }
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => { load(); }, [load]);

  // Auto-seed from registrations sorted by DUPR
  const autoSeed = useCallback(() => {
    const registered = registrations.filter((r) => r.status === "registered" || r.status === "checked_in");
    const sorted = [...registered].sort((a, b) => {
      const da = a.profiles?.dupr ?? 0;
      const db = b.profiles?.dupr ?? 0;
      return db - da;
    });
    const poolCount = tournament?.pool_count ?? 4;
    const fmt = tournament?.tournament_format ?? "single_elim";
    const newSeeds: BracketSeed[] = sorted.map((r, i) => ({
      player_id: r.player_id,
      seed_number: i + 1,
      pool_letter: fmt === "pool_bracket" ? serpentinePool(i, poolCount) : null,
      locked: false,
      name: r.profiles?.full_name ?? "Unknown",
      dupr: r.profiles?.dupr ?? null,
      skill_level: r.profiles?.skill_level ?? null,
    }));
    setSeeds(newSeeds);
    setBracketLocked(false);
    setGeneratedMatches([]);
    toast.success("Auto-seeded by DUPR rating.");
  }, [registrations, tournament]);

  // Seed list drag-to-reorder
  const handleSeedDragStart = (idx: number) => setDragSeedIdx(idx);
  const handleSeedDragEnter = (idx: number) => {
    if (dragSeedIdx === null || dragSeedIdx === idx) return;
    setDragOverSeedIdx(idx);
    setSeeds((prev) => {
      const next = [...prev];
      const [item] = next.splice(dragSeedIdx, 1);
      next.splice(idx, 0, item);
      return next.map((s, i) => ({ ...s, seed_number: i + 1 }));
    });
    setDragSeedIdx(idx);
  };
  const handleSeedDragEnd = () => { setDragSeedIdx(null); setDragOverSeedIdx(null); };

  // Pool drag-and-drop
  const handlePoolDragStart = (playerId: string) => setDraggingPlayerId(playerId);
  const handlePoolDragEnd = () => { setDraggingPlayerId(null); setDragOverPool(null); };
  const handlePoolDragOver = (e: React.DragEvent, pool: string) => { e.preventDefault(); setDragOverPool(pool); };
  const handlePoolDrop = (pool: string) => {
    if (!draggingPlayerId) return;
    setSeeds((prev) => prev.map((s) => s.player_id === draggingPlayerId ? { ...s, pool_letter: pool } : s));
    setDraggingPlayerId(null);
    setDragOverPool(null);
  };

  // Generate matches preview
  const generateMatches = useCallback(() => {
    if (seeds.length < 2) { toast.error("Need at least 2 seeded players."); return; }
    const fmt = tournament?.tournament_format ?? "single_elim";
    let matches: GeneratedMatch[] = [];
    if (fmt === "round_robin") {
      matches = buildRoundRobinSchedule(seeds);
    } else {
      matches = buildElimPairs(seeds);
    }
    setGeneratedMatches(matches);
    // Populate day-of match queue
    setMatchQueue(matches.map((m) => ({
      player_a: m.name_a,
      player_b: m.name_b,
      round: fmt === "round_robin" ? "Round Robin" : `Round ${m.round}`,
    })));
    toast.success(`${matches.length} match${matches.length !== 1 ? "es" : ""} generated.`);
  }, [seeds, tournament]);

  // Save + lock seeds to DB
  const lockBracket = useCallback(async () => {
    if (seeds.length === 0) { toast.error("No seeds to lock."); return; }
    setSavingSeeds(true);
    const supabase = createClient();
    await supabase.from("bracket_seeds").delete().eq("tournament_id", id);
    const rows = seeds.map((s) => ({
      tournament_id: id,
      player_id: s.player_id,
      seed_number: s.seed_number,
      pool_letter: s.pool_letter,
      locked: true,
    }));
    const { error } = await supabase.from("bracket_seeds").insert(rows);
    setSavingSeeds(false);
    if (error) { toast.error("Failed to lock bracket."); return; }
    setSeeds((prev) => prev.map((s) => ({ ...s, locked: true })));
    setBracketLocked(true);
    toast.success("Bracket locked and saved.");
  }, [seeds, id]);

  const unlockBracket = useCallback(async () => {
    const supabase = createClient();
    await supabase.from("bracket_seeds").update({ locked: false }).eq("tournament_id", id);
    setSeeds((prev) => prev.map((s) => ({ ...s, locked: false })));
    setBracketLocked(false);
    toast.success("Bracket unlocked for editing.");
  }, [id]);

  // Day-of: drag match from queue to court
  const handleMatchDragStart = (idx: number) => setDraggingMatchIdx(idx);
  const handleMatchDragEnd = () => { setDraggingMatchIdx(null); setDragOverCourt(null); };
  const handleCourtDragOver = (e: React.DragEvent, court: number) => { e.preventDefault(); setDragOverCourt(court); };
  const handleCourtDrop = (courtNum: number) => {
    if (draggingMatchIdx === null) return;
    const match = matchQueue[draggingMatchIdx];
    if (!match) return;
    setCourtAssignments((prev) => ({ ...prev, [courtNum]: match }));
    setMatchQueue((prev) => prev.filter((_, i) => i !== draggingMatchIdx));
    setDraggingMatchIdx(null);
    setDragOverCourt(null);
    toast.success(`Match assigned to Court ${courtNum}.`);
  };
  const clearCourt = (courtNum: number) => {
    const match = courtAssignments[courtNum];
    if (match) setMatchQueue((prev) => [match, ...prev]);
    setCourtAssignments((prev) => ({ ...prev, [courtNum]: null }));
  };
  const completeMatch = (courtNum: number, scoreA: number, scoreB: number) => {
    const match = courtAssignments[courtNum];
    if (!match) return;
    const winner = scoreA > scoreB ? match.player_a : match.player_b;
    const key = `${match.player_a}-${match.player_b}`;
    setCompletedMatches((prev) => new Set(prev).add(key));
    setCourtAssignments((prev) => ({ ...prev, [courtNum]: null }));
    setScoreModal(null);
    toast.success(`Match complete — ${winner} wins ${scoreA}–${scoreB}.`);
  };

  const saveBanner = async () => {
    if (!tournament) return;
    setSavingBanner(true);
    const supabase = createClient();
    const { error } = await supabase.from("tournaments").update({ cover_img_url: bannerUrl || null }).eq("id", id);
    setSavingBanner(false);
    if (error) { toast.error("Failed to save banner."); return; }
    setTournament((t) => t ? { ...t, cover_img_url: bannerUrl || null } : t);
    setEditingBanner(false);
    toast.success("Banner updated!");
  };

  const saveDetails = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSavingDetails(true);
    const fd = new FormData(e.currentTarget);
    const supabase = createClient();
    const updates = {
      name: fd.get("name") as string,
      venue_name: fd.get("venue_name") as string,
      venue_address: fd.get("venue_address") as string,
      city: fd.get("city") as string,
      state: fd.get("state") as string,
      zip_code: fd.get("zip_code") as string,
      event_date: fd.get("event_date") as string,
      description: (fd.get("description") as string) || null,
      rules: (fd.get("rules") as string) || null,
      prize_pool_cents: fd.get("prize_pool") ? Math.round(parseFloat(fd.get("prize_pool") as string) * 100) : null,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("tournaments").update(updates).eq("id", id);
    setSavingDetails(false);
    if (error) { toast.error("Failed to save."); return; }
    setTournament((t) => t ? { ...t, ...updates } : t);
    setEditingDetails(false);
    toast.success("Details saved!");
  };

  const submitForApproval = async () => {
    if (!tournament) return;
    const supabase = createClient();
    const { error } = await supabase.from("tournaments").update({ status: "pending_approval", submitted_for_approval_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast.error("Failed to submit."); return; }
    setTournament((t) => t ? { ...t, status: "pending_approval" } : t);
    toast.success("Submitted for approval!");
  };

  const addSponsor = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAddingSponsor(true);
    const fd = new FormData(e.currentTarget);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (createClient() as any)
      .from("tournament_sponsors")
      .insert({
        tournament_id: id,
        name: fd.get("sp_name") as string,
        logo_url: (fd.get("sp_logo") as string) || null,
        website_url: (fd.get("sp_website") as string) || null,
        tier: fd.get("sp_tier") as string,
        display_order: sponsors.length,
      })
      .select("id,name,logo_url,website_url,tier,display_order")
      .single();
    setAddingSponsor(false);
    if (error) { toast.error("Failed to add sponsor."); return; }
    setSponsors((prev) => [...prev, data as Sponsor]);
    setShowSponsorForm(false);
    (e.target as HTMLFormElement).reset();
    toast.success("Sponsor added!");
  };

  const removeSponsor = async (sponsorId: string) => {
    setRemovingSponsor(sponsorId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (createClient() as any).from("tournament_sponsors").delete().eq("id", sponsorId);
    setRemovingSponsor(null);
    if (error) { toast.error("Failed to remove sponsor."); return; }
    setSponsors((prev) => prev.filter((s) => s.id !== sponsorId));
    toast.success("Sponsor removed.");
  };

  if (loading) {
    return (
      <PageShell hideFooter>
        <div className="min-h-screen flex items-center justify-center">
          <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      </PageShell>
    );
  }

  if (!tournament) return null;

  const registered = registrations.filter((r) => r.status === "registered").length;
  const held = registrations.filter((r) => r.status === "held").length;
  const revenue = registered * tournament.entry_fee_cents;
  const structureLabel = STRUCTURE_LABELS[tournament.tournament_format ?? "single_elim"] ?? "Single Elimination";
  const poolCount = tournament.pool_count ?? 4;

  return (
    <PageShell hideFooter>
      {/* ── Banner ── */}
      <div className="relative w-full h-56 sm:h-72 lg:h-96 bg-card overflow-hidden group">
        {tournament.cover_img_url ? (
          <img src={tournament.cover_img_url} alt="Banner" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-card via-secondary to-primary/20 flex items-center justify-center">
            <div className="text-center opacity-40">
              <Image size={48} className="mx-auto mb-2" />
              <p className="font-mono text-xs tracking-widest">NO BANNER IMAGE</p>
            </div>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        <button
          onClick={() => setEditingBanner(true)}
          className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-background/80 backdrop-blur border border-border text-xs font-mono tracking-wider hover:bg-background transition-colors"
        >
          <UploadSimple size={13} weight="bold" /> CHANGE BANNER
        </button>
        <div className="absolute top-4 left-4 flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-mono tracking-wider ${STATUS_COLORS[tournament.status] ?? ""}`}>
            {tournament.status === "published" ? <Lightning size={11} weight="fill" /> : <Clock size={11} weight="bold" />}
            {STATUS_LABELS[tournament.status] ?? tournament.status.toUpperCase()}
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-border bg-background/70 text-xs font-mono tracking-wider text-muted-foreground">
            {structureLabel}
          </span>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-6 lg:p-10">
          <div className="max-w-5xl mx-auto">
            <button onClick={() => router.push("/director")} className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground mb-3 transition-colors">
              <ArrowLeft size={13} weight="bold" /> BACK TO DASHBOARD
            </button>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl tracking-wide text-foreground leading-tight">{tournament.name}</h1>
            <p className="text-muted-foreground mt-1 text-sm">{tournament.venue_name} · {tournament.city}, {tournament.state} · {fmtDate(tournament.event_date)}</p>
          </div>
        </div>
      </div>

      {/* ── Banner edit modal ── */}
      {editingBanner && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-card border border-border rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-2xl tracking-wide">BANNER IMAGE</h3>
              <button onClick={() => setEditingBanner(false)} className="h-8 w-8 rounded-full border border-border flex items-center justify-center hover:bg-secondary">
                <X size={14} weight="bold" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">Paste a direct image URL. Recommended: 1600×600px.</p>
            <input type="url" value={bannerUrl} onChange={(e) => setBannerUrl(e.target.value)} placeholder="https://example.com/banner.jpg" className="w-full h-12 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring mb-4" />
            {bannerUrl && <img src={bannerUrl} alt="Preview" className="w-full h-32 object-cover rounded-xl mb-4" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />}
            <div className="flex gap-3">
              <button onClick={() => setEditingBanner(false)} className="flex-1 h-11 rounded-full border border-border hover:bg-secondary text-sm font-display tracking-wider">CANCEL</button>
              <button onClick={saveBanner} disabled={savingBanner} className="flex-1 h-11 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-display tracking-wider disabled:opacity-50">
                {savingBanner ? "SAVING…" : "SAVE BANNER"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main content ── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            { icon: Users, label: "Registered", value: registered, sub: `of ${tournament.draw_size}` },
            { icon: Clock, label: "Held Spots", value: held, sub: "pending confirm" },
            { icon: CurrencyDollar, label: "Revenue", value: `$${(revenue / 100).toFixed(0)}`, sub: "gross" },
            { icon: Trophy, label: "Prize Pool", value: tournament.prize_pool_cents ? fmt(tournament.prize_pool_cents) : "—", sub: "total" },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-1">
                <s.icon size={14} className="text-primary" />
                <span className="font-mono text-[10px] tracking-widest text-muted-foreground">{s.label.toUpperCase()}</span>
              </div>
              <div className="font-display text-2xl tracking-wide">{s.value}</div>
              <div className="text-xs text-muted-foreground">{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-3 mb-8">
          {tournament.status === "draft" && (
            <button onClick={submitForApproval} className="flex items-center gap-2 px-5 h-11 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-wider text-sm transition-colors">
              <CheckCircle size={16} weight="fill" /> SUBMIT FOR APPROVAL
            </button>
          )}
          {tournament.status === "pending_approval" && (
            <div className="flex items-center gap-2 px-5 h-11 rounded-full bg-amber-400/10 border border-amber-400/30 text-amber-400 font-mono text-xs tracking-wider">
              <Clock size={14} weight="bold" /> AWAITING REVIEW
            </div>
          )}
          <button onClick={() => setEditingDetails(!editingDetails)} className={`flex items-center gap-2 px-5 h-11 rounded-full border font-display tracking-wider text-sm transition-colors ${editingDetails ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-secondary"}`}>
            <PencilSimple size={14} weight="bold" /> {editingDetails ? "EDITING…" : "EDIT DETAILS"}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border mb-8 overflow-x-auto scrollbar-hide">
          {(["overview", "bracket", "dayof", "roster", "sponsors"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 font-mono text-xs tracking-widest transition-colors border-b-2 -mb-px whitespace-nowrap ${activeTab === tab ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {tab === "dayof" ? "DAY OF" : tab.toUpperCase()}
              {tab === "sponsors" && sponsors.length > 0 && <span className="ml-1.5 text-primary">({sponsors.length})</span>}
              {tab === "roster" && registrations.length > 0 && <span className="ml-1.5 text-primary">({registrations.length})</span>}
              {tab === "bracket" && seeds.length > 0 && <span className="ml-1.5 text-primary">({seeds.length})</span>}
            </button>
          ))}
        </div>

        {/* ── Overview tab ── */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {editingDetails ? (
              <form ref={detailsFormRef} onSubmit={saveDetails} className="space-y-4 rounded-2xl border border-primary/30 bg-card p-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-display text-xl tracking-wide">EDIT DETAILS</h3>
                  <button type="button" onClick={() => setEditingDetails(false)} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                </div>
                <div>
                  <label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1.5">EVENT NAME</label>
                  <input name="name" defaultValue={tournament.name} required className="w-full h-11 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1.5">VENUE NAME</label>
                    <input name="venue_name" defaultValue={tournament.venue_name} required className="w-full h-11 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                  <div>
                    <label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1.5">EVENT DATE</label>
                    <input name="event_date" type="date" defaultValue={tournament.event_date} required className="w-full h-11 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                </div>
                <div>
                  <label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1.5">VENUE ADDRESS</label>
                  <input name="venue_address" defaultValue={tournament.venue_address ?? ""} className="w-full h-11 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1.5">CITY</label>
                    <input name="city" defaultValue={tournament.city} required className="w-full h-11 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                  <div>
                    <label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1.5">STATE</label>
                    <input name="state" defaultValue={tournament.state} required maxLength={2} className="w-full h-11 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                  <div>
                    <label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1.5">ZIP</label>
                    <input name="zip_code" defaultValue={tournament.zip_code ?? ""} className="w-full h-11 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                </div>
                <div>
                  <label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1.5">PRIZE POOL ($)</label>
                  <input name="prize_pool" type="number" min={0} step="0.01" defaultValue={tournament.prize_pool_cents ? tournament.prize_pool_cents / 100 : ""} placeholder="Optional" className="w-full h-11 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div>
                  <label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1.5">DESCRIPTION</label>
                  <textarea name="description" rows={4} defaultValue={tournament.description ?? ""} className="w-full rounded-xl bg-secondary border border-border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring resize-none" />
                </div>
                <div>
                  <label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1.5">RULES &amp; NOTES</label>
                  <textarea name="rules" rows={3} defaultValue={tournament.rules ?? ""} className="w-full rounded-xl bg-secondary border border-border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring resize-none" />
                </div>
                <button type="submit" disabled={savingDetails} className="w-full h-11 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-[0.2em] text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                  <FloppyDisk size={15} weight="bold" />{savingDetails ? "SAVING…" : "SAVE CHANGES"}
                </button>
              </form>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
                    <h3 className="font-mono text-[10px] tracking-widest text-muted-foreground">EVENT INFO</h3>
                    <div className="flex items-start gap-3">
                      <Calendar size={16} className="text-primary mt-0.5 flex-shrink-0" />
                      <div><div className="text-sm font-semibold">{fmtDate(tournament.event_date)}</div></div>
                    </div>
                    <div className="flex items-start gap-3">
                      <MapPin size={16} className="text-primary mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="text-sm font-semibold">{tournament.venue_name}</div>
                        <div className="text-xs text-muted-foreground">{tournament.venue_address}{tournament.city ? `, ${tournament.city}, ${tournament.state}` : ""} {tournament.zip_code}</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <CurrencyDollar size={16} className="text-primary mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="text-sm font-semibold">{fmt(tournament.entry_fee_cents)} entry · {fmt(tournament.hold_fee_cents)} hold</div>
                        <div className="text-xs text-muted-foreground">Hold valid for {tournament.hold_duration_hours}h</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Users size={16} className="text-primary mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <div className="text-sm font-semibold">{tournament.spots_filled} / {tournament.draw_size} spots filled</div>
                        <div className="w-full h-1.5 bg-secondary rounded-full mt-1.5">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, (tournament.spots_filled / tournament.draw_size) * 100)}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border bg-card p-5">
                    <h3 className="font-mono text-[10px] tracking-widest text-muted-foreground mb-3">EVENTS / DIVISIONS</h3>
                    {divisions.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No divisions set up.</p>
                    ) : (
                      <div className="space-y-2">
                        {divisions.map((d) => (
                          <div key={d.id} className="flex items-center justify-between rounded-xl bg-secondary/60 px-3 py-2">
                            <span className="text-sm font-medium">{d.name}</span>
                            <span className="font-mono text-xs text-muted-foreground">{d.spots_filled}/{d.draw_size}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {tournament.description && (
                  <div className="rounded-2xl border border-border bg-card p-5">
                    <h3 className="font-mono text-[10px] tracking-widest text-muted-foreground mb-3">DESCRIPTION</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{tournament.description}</p>
                  </div>
                )}
                {tournament.rules && (
                  <div className="rounded-2xl border border-border bg-card p-5">
                    <h3 className="font-mono text-[10px] tracking-widest text-muted-foreground mb-3">RULES &amp; NOTES</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{tournament.rules}</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Bracket tab ── */}
        {activeTab === "bracket" && (
          <div className="space-y-6">
            {/* Header info */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="px-3 py-1.5 rounded-full border border-border bg-card font-mono text-xs">
                {structureLabel}
              </span>
              {tournament.tournament_format === "pool_bracket" && (
                <span className="px-3 py-1.5 rounded-full border border-border bg-card font-mono text-xs text-muted-foreground">
                  {poolCount} pools
                </span>
              )}
              {bracketLocked && (
                <span className="px-3 py-1.5 rounded-full border border-primary/40 bg-primary/10 font-mono text-xs text-primary flex items-center gap-1.5">
                  <Lock size={10} weight="fill" /> LOCKED
                </span>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={autoSeed}
                disabled={bracketLocked}
                className="flex items-center gap-2 h-10 px-5 rounded-full border border-border hover:bg-secondary font-display tracking-wider text-sm transition-colors disabled:opacity-40"
              >
                <ArrowsClockwise size={14} weight="bold" /> AUTO-SEED BY DUPR
              </button>
              <button
                onClick={generateMatches}
                disabled={seeds.length < 2 || bracketLocked}
                className="flex items-center gap-2 h-10 px-5 rounded-full border border-border hover:bg-secondary font-display tracking-wider text-sm transition-colors disabled:opacity-40"
              >
                <Gauge size={14} weight="fill" /> GENERATE MATCHES
              </button>
              {!bracketLocked ? (
                <button
                  onClick={lockBracket}
                  disabled={seeds.length === 0 || savingSeeds}
                  className="flex items-center gap-2 h-10 px-5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-wider text-sm transition-colors disabled:opacity-40"
                >
                  <Lock size={14} weight="fill" /> {savingSeeds ? "SAVING…" : "LOCK BRACKET"}
                </button>
              ) : (
                <button
                  onClick={unlockBracket}
                  className="flex items-center gap-2 h-10 px-5 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 font-display tracking-wider text-sm transition-colors"
                >
                  <LockOpen size={14} weight="fill" /> UNLOCK
                </button>
              )}
            </div>

            {seeds.length === 0 && registrations.filter((r) => r.status === "registered").length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-12 text-center">
                <Trophy size={32} className="text-muted-foreground mx-auto mb-3" />
                <p className="font-display text-xl tracking-wide mb-1">NO REGISTERED PLAYERS</p>
                <p className="text-sm text-muted-foreground">Players must register before you can seed the bracket.</p>
              </div>
            ) : tournament.tournament_format === "pool_bracket" ? (
              /* Pool Play layout */
              <div className="space-y-4">
                <p className="font-mono text-[10px] tracking-widest text-muted-foreground">
                  DRAG PLAYERS BETWEEN POOLS · SERPENTINE AUTO-SEEDED
                </p>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {POOL_LETTERS.slice(0, poolCount).map((letter) => (
                    <PoolColumn
                      key={letter}
                      letter={letter}
                      seeds={seeds.filter((s) => s.pool_letter === letter)}
                      locked={bracketLocked}
                      draggingPlayerId={draggingPlayerId}
                      dragOverPool={dragOverPool}
                      onDragOver={handlePoolDragOver}
                      onDrop={handlePoolDrop}
                      onSeedDragStart={handlePoolDragStart}
                      onSeedDragEnd={handlePoolDragEnd}
                    />
                  ))}
                </div>
                {/* Unassigned players */}
                {seeds.filter((s) => !s.pool_letter).length > 0 && (
                  <div className="rounded-2xl border border-dashed border-amber-500/40 bg-amber-500/5 p-4">
                    <p className="font-mono text-[10px] tracking-widest text-amber-400 mb-3">UNASSIGNED — DRAG TO A POOL</p>
                    <div className="flex flex-wrap gap-2">
                      {seeds.filter((s) => !s.pool_letter).map((s) => (
                        <div
                          key={s.player_id}
                          draggable={!bracketLocked}
                          onDragStart={() => handlePoolDragStart(s.player_id)}
                          onDragEnd={handlePoolDragEnd}
                          className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 cursor-grab active:cursor-grabbing"
                        >
                          <DotsSixVertical size={12} className="text-muted-foreground" />
                          <span className="text-xs font-semibold">{s.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Seed list (single elim / round robin / double elim) */
              <div className="space-y-2">
                <p className="font-mono text-[10px] tracking-widest text-muted-foreground mb-3">
                  {bracketLocked ? "BRACKET LOCKED — UNLOCK TO EDIT" : "DRAG TO REORDER SEEDS"}
                </p>
                {seeds.map((seed, idx) => (
                  <SeedRow
                    key={seed.player_id}
                    seed={seed}
                    index={idx}
                    locked={bracketLocked}
                    isDragging={dragSeedIdx === idx}
                    isDragOver={dragOverSeedIdx === idx}
                    onDragStart={() => handleSeedDragStart(idx)}
                    onDragEnter={() => handleSeedDragEnter(idx)}
                    onDragEnd={handleSeedDragEnd}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {}}
                  />
                ))}
                {/* Registered players not yet seeded */}
                {seeds.length === 0 && registrations.filter((r) => r.status === "registered").map((r) => (
                  <div key={r.id} className="flex items-center gap-3 rounded-xl border border-dashed border-border px-3 py-2.5 text-muted-foreground">
                    <div className="h-7 w-7 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                      <span className="font-mono text-xs">?</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{r.profiles?.full_name ?? "Unknown"}</div>
                      <div className="text-xs">{r.profiles?.dupr ? `DUPR ${r.profiles.dupr}` : r.profiles?.skill_level ?? "—"}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Generated matches preview */}
            {generatedMatches.length > 0 && (
              <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
                <h3 className="font-mono text-[10px] tracking-widest text-muted-foreground">
                  MATCH SCHEDULE PREVIEW · {generatedMatches.length} MATCHES
                </h3>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {generatedMatches.map((m, i) => (
                    <div key={i} className="flex items-center justify-between rounded-xl bg-secondary/50 px-3 py-2 text-sm">
                      <span className="font-mono text-[10px] text-muted-foreground w-20 flex-shrink-0">
                        {m.round === 1 ? "R1" : `R${m.round}`} · M{m.match_index + 1}
                      </span>
                      <span className="flex-1 truncate text-center">{m.name_a}</span>
                      <span className="font-mono text-xs text-muted-foreground px-2">VS</span>
                      <span className="flex-1 truncate text-center">{m.name_b}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Day Of tab (Command Center) ── */}
        {activeTab === "dayof" && (
          <div className="space-y-6">
            {/* Court count selector */}
            <div className="flex items-center gap-4 flex-wrap">
              <span className="font-mono text-[10px] tracking-widest text-muted-foreground">COURTS</span>
              <div className="flex gap-2">
                {[2, 3, 4, 6, 8].map((n) => (
                  <button key={n} onClick={() => setCourts(n)}
                    className={`h-9 w-9 rounded-xl border font-mono text-sm transition-all ${courts === n ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/50"}`}>
                    {n}
                  </button>
                ))}
              </div>
              <span className="font-mono text-[10px] text-muted-foreground">
                {Object.values(courtAssignments).filter(Boolean).length} ACTIVE · {completedMatches.size} DONE
              </span>
            </div>

            {matchQueue.length === 0 && Object.values(courtAssignments).every((v) => !v) && (
              <div className="rounded-2xl border border-dashed border-border p-10 text-center">
                <SoccerBall size={32} className="text-muted-foreground mx-auto mb-3" />
                <p className="font-display text-xl tracking-wide mb-1">NO MATCHES QUEUED</p>
                <p className="text-sm text-muted-foreground">Generate matches in the Bracket tab first, then return here on tournament day.</p>
                <button onClick={() => setActiveTab("bracket")} className="mt-4 h-10 px-6 rounded-full border border-border hover:bg-secondary font-display tracking-wider text-sm transition-colors">
                  GO TO BRACKET
                </button>
              </div>
            )}

            {(matchQueue.length > 0 || Object.values(courtAssignments).some(Boolean)) && (
              <>
                {/* Courts grid */}
                <div>
                  <p className="font-mono text-[10px] tracking-widest text-muted-foreground mb-3">
                    COURTS — DRAG A MATCH FROM THE QUEUE TO ASSIGN
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {Array.from({ length: courts }, (_, i) => i + 1).map((courtNum) => {
                      const match = courtAssignments[courtNum];
                      const isOver = dragOverCourt === courtNum;
                      return (
                        <div
                          key={courtNum}
                          onDragOver={(e) => handleCourtDragOver(e, courtNum)}
                          onDrop={() => handleCourtDrop(courtNum)}
                          onDragLeave={() => setDragOverCourt(null)}
                          className={`rounded-2xl border-2 p-3 min-h-[120px] flex flex-col transition-all ${
                            isOver ? "border-primary bg-primary/5 scale-[1.02]" :
                            match ? "border-primary/30 bg-card" : "border-dashed border-border bg-card/50"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-mono text-[10px] tracking-widest text-muted-foreground">COURT {courtNum}</span>
                            {match && (
                              <button onClick={() => clearCourt(courtNum)} className="h-5 w-5 rounded-full hover:bg-destructive/10 hover:text-destructive flex items-center justify-center transition-colors">
                                <X size={10} weight="bold" />
                              </button>
                            )}
                          </div>
                          {match ? (
                            <div className="flex-1 flex flex-col justify-between">
                              <div>
                                <div className="text-xs font-mono text-muted-foreground mb-2">{match.round}</div>
                                <div className="space-y-1">
                                  <div className="text-sm font-semibold truncate">{match.player_a}</div>
                                  <div className="font-mono text-[10px] text-muted-foreground text-center">VS</div>
                                  <div className="text-sm font-semibold truncate">{match.player_b}</div>
                                </div>
                              </div>
                              <button
                                onClick={() => setScoreModal({ match, court: courtNum })}
                                className="mt-3 w-full h-8 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-mono text-[10px] tracking-widest transition-colors flex items-center justify-center gap-1.5"
                              >
                                <CheckFat size={11} weight="fill" /> SCORE
                              </button>
                            </div>
                          ) : (
                            <div className="flex-1 flex items-center justify-center text-muted-foreground/40">
                              <span className="text-xs font-mono">EMPTY</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Match queue */}
                {matchQueue.length > 0 && (
                  <div>
                    <p className="font-mono text-[10px] tracking-widest text-muted-foreground mb-3">
                      MATCH QUEUE · {matchQueue.length} PENDING — DRAG TO COURT
                    </p>
                    <div className="space-y-2">
                      {matchQueue.map((match, idx) => (
                        <div
                          key={idx}
                          draggable
                          onDragStart={() => handleMatchDragStart(idx)}
                          onDragEnd={handleMatchDragEnd}
                          className={`flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 cursor-grab active:cursor-grabbing transition-all ${draggingMatchIdx === idx ? "opacity-40 scale-95" : "hover:border-primary/40"}`}
                        >
                          <DotsSixVertical size={14} className="text-muted-foreground flex-shrink-0" />
                          <div className="flex-shrink-0">
                            <span className="font-mono text-[10px] text-muted-foreground">{match.round}</span>
                          </div>
                          <div className="flex-1 min-w-0 flex items-center gap-2">
                            <span className="text-sm font-semibold truncate flex-1">{match.player_a}</span>
                            <span className="font-mono text-[10px] text-muted-foreground flex-shrink-0">VS</span>
                            <span className="text-sm font-semibold truncate flex-1 text-right">{match.player_b}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Completed matches */}
                {completedMatches.size > 0 && (
                  <div className="rounded-2xl border border-border bg-card p-4">
                    <p className="font-mono text-[10px] tracking-widest text-muted-foreground mb-2">
                      COMPLETED · {completedMatches.size}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {Array.from(completedMatches).map((key) => (
                        <span key={key} className="px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-mono text-primary flex items-center gap-1.5">
                          <CheckFat size={10} weight="fill" /> {key.split("-")[0]}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Roster tab ── */}
        {activeTab === "roster" && (
          <div className="space-y-3">
            {registrations.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-12 text-center">
                <Users size={32} className="text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No registrations yet.</p>
              </div>
            ) : (
              <>
                <div className="flex gap-4 text-xs font-mono text-muted-foreground px-1">
                  <span>{registered} registered</span>
                  <span>{held} held</span>
                </div>
                {registrations.map((r) => {
                  const div = divisions.find((d) => d.id === r.division_id);
                  return (
                    <div key={r.id} className="flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3">
                      <div className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                        <span className="font-display text-sm text-primary">{(r.profiles?.full_name ?? "?")[0]}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{r.profiles?.full_name ?? "Unknown Player"}</div>
                        <div className="text-xs text-muted-foreground">{div?.name ?? "Open"} · {r.profiles?.dupr ? `DUPR ${r.profiles.dupr}` : r.profiles?.skill_level?.replace("-", " – ") ?? "—"}</div>
                      </div>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${r.status === "registered" ? "text-primary border-primary/30 bg-primary/10" : "text-amber-400 border-amber-400/30 bg-amber-400/10"}`}>
                        {r.status === "registered" ? "REGISTERED" : "HELD"}
                      </span>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        {/* ── Sponsors tab ── */}
        {activeTab === "sponsors" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{sponsors.length} sponsor{sponsors.length !== 1 ? "s" : ""} · shown on your tournament page</p>
              <button onClick={() => setShowSponsorForm(true)} className="flex items-center gap-1.5 px-4 h-9 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-display tracking-wider transition-colors">
                <Plus size={13} weight="bold" /> ADD SPONSOR
              </button>
            </div>
            {sponsors.length === 0 && !showSponsorForm && (
              <div className="rounded-2xl border border-dashed border-border p-12 text-center">
                <Star size={32} className="text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No sponsors yet. Add your first one.</p>
              </div>
            )}
            {sponsors.map((s) => (
              <div key={s.id} className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4">
                {s.logo_url ? (
                  <img src={s.logo_url} alt={s.name} className="h-10 w-10 object-contain rounded-lg bg-secondary flex-shrink-0" />
                ) : (
                  <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                    <Star size={18} className="text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{s.name}</span>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${TIER_COLORS[s.tier] ?? ""}`}>
                      {TIER_LABELS[s.tier] ?? s.tier}
                    </span>
                  </div>
                  {s.website_url && (
                    <a href={s.website_url} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 mt-0.5">
                      <Globe size={11} /> {s.website_url.replace(/^https?:\/\//, "")}
                    </a>
                  )}
                </div>
                <button onClick={() => removeSponsor(s.id)} disabled={removingSponsor === s.id} className="h-8 w-8 rounded-full border border-border flex items-center justify-center hover:border-red-400 hover:text-red-400 transition-colors disabled:opacity-40">
                  <Trash size={14} weight="bold" />
                </button>
              </div>
            ))}
            {showSponsorForm && (
              <form onSubmit={addSponsor} className="rounded-2xl border border-primary/30 bg-card p-5 space-y-3">
                <h4 className="font-display tracking-wider text-lg">ADD SPONSOR</h4>
                <div>
                  <label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1">NAME *</label>
                  <input name="sp_name" required placeholder="Acme Paddles" className="w-full h-11 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div>
                  <label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1">TIER</label>
                  <select name="sp_tier" className="w-full h-11 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring">
                    <option value="title">Title</option>
                    <option value="gold">Gold</option>
                    <option value="silver">Silver</option>
                    <option value="standard">Standard</option>
                  </select>
                </div>
                <div>
                  <label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1">LOGO URL</label>
                  <input name="sp_logo" type="url" placeholder="https://example.com/logo.png" className="w-full h-11 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div>
                  <label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1">WEBSITE</label>
                  <input name="sp_website" type="url" placeholder="https://example.com" className="w-full h-11 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => setShowSponsorForm(false)} className="flex-1 h-11 rounded-full border border-border hover:bg-secondary text-sm font-display tracking-wider">CANCEL</button>
                  <button type="submit" disabled={addingSponsor} className="flex-1 h-11 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-display tracking-wider disabled:opacity-50">
                    {addingSponsor ? "ADDING…" : "ADD"}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>

      {/* Score entry modal */}
      {scoreModal && (
        <ScoreModal
          match={scoreModal.match}
          courtNum={scoreModal.court}
          onClose={() => setScoreModal(null)}
          onSave={(a, b) => completeMatch(scoreModal.court, a, b)}
        />
      )}
    </PageShell>
  );
}
