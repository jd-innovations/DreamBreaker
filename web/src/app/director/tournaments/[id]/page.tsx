"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft, Lightning, MapPin, Calendar, Users, CurrencyDollar,
  Trophy, PencilSimple, CheckCircle, Clock, Warning, Trash,
  Plus, Star, Image, Globe, UploadSimple, X, FloppyDisk,
  DotsSixVertical, Lock, LockOpen, ArrowsClockwise,
  Gauge,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { PageShell } from "@/components/layout/page-shell";
import { createClient } from "@/lib/supabase/client";
import { getUserId } from "@/lib/dev-user";
import { BracketTree } from "@/components/shared/bracket-tree";
import { tournamentOpsStatus } from "@shared/status";
import { STATUS_BADGE_CLASS } from "@/lib/status";
// SafeImage (not next/image directly): both srcs on this page are
// director-typed free text (cover_img_url, logo_url), not app-controlled
// uploads -- see lib/image-hosts.ts. No alias needed since SafeImage is a
// distinct name from the Phosphor `Image` icon this file already imports.
import { SafeImage } from "@/components/shared/safe-image";
import { DayOfBoard } from "@/components/director/day-of-board";
import { LiveBrackets } from "@/components/tournament/live-brackets";
import { LiveQueuePanel } from "@/components/tournament/live-queue-panel";
import { LiveTournamentProvider, useLiveTournamentData } from "@/components/tournament/live-tournament-context";
import { buildDivisionBracket } from "@/lib/tournament/day-of";
import { AddRegistrationDialog } from "@/components/director/add-registration-dialog";
import { PoolPlayPanel } from "@/components/director/pool-play-panel";
import { directorCancelRegistration, formatFee, onsiteLabel } from "@/lib/tournament/director-registrations";

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
  registration_closes_at: string | null;
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
  hold_cutoff_days: number;
  refund_cutoff_days: number;
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
  partner_id: string | null;
  guest_player_id: string | null;
  guest_partner_id: string | null;
  status: string;
  division_id: string | null;
  created_at: string;
  onsite_tender: string | null;
  onsite_amount_cents: number | null;
  profiles: { full_name: string | null; dupr: number | null; skill_level: string | null } | null;
  partner: { full_name: string | null; dupr: number | null } | null;
}

const ROSTER_STATUS: Record<string, { label: string; cls: string }> = {
  registered: { label: "REGISTERED", cls: "text-primary border-primary/30 bg-primary/10" },
  checked_in: { label: "CHECKED IN", cls: "text-green-500 border-green-500/30 bg-green-500/10" },
  held: { label: "HELD", cls: "text-amber-400 border-amber-400/30 bg-amber-400/10" },
};

interface BracketSeed {
  player_id: string;
  seed_number: number;
  pool_letter: string | null;
  locked: boolean;
  name: string;
  dupr: number | null;
  skill_level: string | null;
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

// THIRD copy of a tournament status map, and the most divergent: it covered
// only five of the ten statuses, so a live tournament fell through to
// `tournament.status.toUpperCase()` and rendered the raw token
// "REGISTRATION_CLOSED". It also called `published` "Live" where the other two
// pages said "Published".
//
// Now from packages/shared/src/status.ts like the rest.
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

// ── Page ─────────────────────────────────────────────────────────────────────

export default function DirectorTournamentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  // Guest names come from tournament_guest_names (the guests table is creator-only).
  const [guestNames, setGuestNames] = useState<Map<string, string>>(new Map());
  const [rosterQuery, setRosterQuery] = useState("");
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const validTabs = ["overview", "sponsors", "roster", "bracket", "dayof", "live"] as const;
  type TabId = typeof validTabs[number];
  const initialTab = (validTabs.includes(searchParams.get("tab") as TabId) ? searchParams.get("tab") : "overview") as TabId;
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  // LIVE BRACKETS shares one live source between the tree and the queue column;
  // nothing loads while another tab is open.
  const liveData = useLiveTournamentData(activeTab === "live" ? id : null);

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
  const [building, setBuilding] = useState(false);
  // Elimination matches saved per division (bracket_matches, pool_label null).
  const [savedBrackets, setSavedBrackets] = useState<Record<string, { matches: number; scored: number }>>({});
  const [dragSeedIdx, setDragSeedIdx] = useState<number | null>(null);
  const [dragOverSeedIdx, setDragOverSeedIdx] = useState<number | null>(null);

  const detailsFormRef = useRef<HTMLFormElement>(null);

  const load = useCallback(async () => {
    try {
      const userId = await getUserId();
      if (!userId) { router.push("/auth"); return; }
      const supabase = createClient();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: t, error } = await (supabase as any)
        .from("tournaments")
        .select("id,name,city,state,venue_name,venue_address,zip_code,event_date,registration_closes_at,format,formats,tournament_format,pool_count,draw_size,spots_filled,entry_fee_cents,hold_fee_cents,hold_duration_hours,hold_cutoff_days,refund_cutoff_days,prize_pool_cents,description,rules,cover_img_url,status,created_at")
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

      const [{ data: regs }, { data: guests }] = await Promise.all([
        supabase
          .from("registrations")
          .select("id,player_id,partner_id,guest_player_id,guest_partner_id,status,division_id,created_at,onsite_tender,onsite_amount_cents,profiles!player_id(full_name,dupr,skill_level),partner:profiles!partner_id(full_name,dupr)")
          .eq("tournament_id", id)
          .order("created_at", { ascending: true }),
        supabase.rpc("tournament_guest_names", { p_tournament_id: id }),
      ]);
      setRegistrations((regs ?? []) as unknown as Registration[]);
      setGuestNames(new Map((guests ?? []).map((g) => [g.guest_id, g.display_name])));

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

  const loadSavedBrackets = useCallback(async () => {
    const { data } = await createClient()
      .from("bracket_matches")
      .select("division_id, score_team1")
      .eq("tournament_id", id)
      .is("pool_label", null);
    const next: Record<string, { matches: number; scored: number }> = {};
    for (const r of data ?? []) {
      if (!r.division_id) continue;
      const cur = next[r.division_id] ?? { matches: 0, scored: 0 };
      cur.matches += 1;
      if (r.score_team1) cur.scored += 1;
      next[r.division_id] = cur;
    }
    setSavedBrackets(next);
  }, [id]);

  // Database fetches (an external system); state is set after they resolve.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); loadSavedBrackets(); }, [load, loadSavedBrackets]);

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

  // Bracket tree click-to-swap
  const handleSwapSeeds = useCallback((seedNumA: number, seedNumB: number) => {
    setSeeds((prev) =>
      prev.map((s) => {
        if (s.seed_number === seedNumA) return { ...s, seed_number: seedNumB };
        if (s.seed_number === seedNumB) return { ...s, seed_number: seedNumA };
        return s;
      }).sort((a, b) => a.seed_number - b.seed_number)
    );
  }, []);

  // Build and save single-elimination brackets for every division
  // (bracket_matches), using the seed list where set, then registration
  // order. The same builder as mobile (packages/shared/src/bracketBuild.ts),
  // so Day Of, the queue and courts run on it from either device.
  const generateMatches = useCallback(async () => {
    if (!tournament) return;
    const fmt = tournament.tournament_format ?? "single_elim";
    if (fmt === "pool_bracket") {
      toast.info("Pool Play → Bracket: generate pools per division below, then build the bracket from the standings.");
      return;
    }
    if (fmt !== "single_elim" && !window.confirm(`${STRUCTURE_LABELS[fmt] ?? fmt} isn't supported yet. Build Single Elimination brackets instead?`)) return;

    const targets = divisions.filter((d) => registrations.some((r) => r.division_id === d.id));
    if (targets.length === 0) { toast.error("No division has registered players yet."); return; }
    const scored = targets.filter((d) => (savedBrackets[d.id]?.scored ?? 0) > 0);
    if (scored.length > 0 && !window.confirm(
      `Rebuilding replaces recorded scores in ${scored.map((d) => `${d.name} (${savedBrackets[d.id].scored})`).join(", ")}. Continue?`,
    )) return;

    setBuilding(true);
    const seedByPlayer = new Map(seeds.map((s) => [s.player_id, s.seed_number]));
    const built: string[] = [];
    const skipped: string[] = [];
    for (const d of targets) {
      const result = await buildDivisionBracket({ tournamentId: id, divisionId: d.id, registrations, seedByPlayer });
      if (result.ok) built.push(`${d.name} (${result.teams})`);
      else skipped.push(`${d.name}: ${result.error}`);
    }
    setBuilding(false);
    await loadSavedBrackets();
    if (built.length) toast.success(`Brackets saved: ${built.join(", ")}.`);
    if (skipped.length) toast.error(skipped.join(" "));
  }, [tournament, divisions, registrations, savedBrackets, seeds, id, loadSavedBrackets]);

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
      registration_closes_at: fd.get("registration_closes_at") as string,
      description: (fd.get("description") as string) || null,
      rules: (fd.get("rules") as string) || null,
      prize_pool_cents: fd.get("prize_pool") ? Math.round(parseFloat(fd.get("prize_pool") as string) * 100) : null,
      hold_cutoff_days: parseInt(fd.get("hold_cutoff_days") as string, 10) || 7,
      refund_cutoff_days: parseInt(fd.get("refund_cutoff_days") as string, 10) || 15,
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
  // Paid-on-site entries are recorded, never processed, so they stay out of Revenue.
  const revenue = registrations.filter((r) => r.status === "registered" && !r.onsite_tender).length * tournament.entry_fee_cents;
  const checkedIn = registrations.filter((r) => r.status === "checked_in").length;
  const onsiteCollected = registrations
    .filter((r) => ["registered", "checked_in", "held"].includes(r.status))
    .reduce((sum, r) => sum + (r.onsite_amount_cents ?? 0), 0);
  const playerName = (r: Registration) =>
    r.profiles?.full_name ?? (r.guest_player_id ? guestNames.get(r.guest_player_id) : null) ?? "Unknown Player";
  const partnerName = (r: Registration) =>
    r.partner?.full_name ?? (r.guest_partner_id ? guestNames.get(r.guest_partner_id) : null) ?? null;
  const rosterNeedle = rosterQuery.trim().toLowerCase();
  const rosterRows = rosterNeedle
    ? registrations.filter((r) => [playerName(r), partnerName(r) ?? ""].some((n) => n.toLowerCase().includes(rosterNeedle)))
    : registrations;
  const structureLabel = STRUCTURE_LABELS[tournament.tournament_format ?? "single_elim"] ?? "Single Elimination";
  const poolCount = tournament.pool_count ?? 4;

  return (
    <PageShell hideFooter>
      {/* ── Banner ── */}
      <div className="relative w-full h-56 sm:h-72 lg:h-96 bg-card overflow-hidden group">
        {tournament.cover_img_url ? (
          <SafeImage src={tournament.cover_img_url} alt="Banner" fill priority sizes="100vw" className="object-cover" />
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
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-mono tracking-wider ${STATUS_BADGE_CLASS[tournamentOpsStatus(tournament.status).tone]}`}>
            {tournament.status === "published" ? <Lightning size={11} weight="fill" /> : <Clock size={11} weight="bold" />}
            {tournamentOpsStatus(tournament.status).label}
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-border bg-background/70 text-xs font-mono tracking-wider text-muted-foreground">
            {structureLabel}
          </span>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-6 lg:p-10">
          <div className="w-full">
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
            {/* Deliberately plain <img>, not next/image: this previews whatever URL
                the director just typed into the field above, which can be any
                host. next/image throws at request time for a host outside
                remotePatterns, so it cannot preview an arbitrary URL the way
                this control is meant to. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
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
      {/* Full width on every tab (owner, 2026-09-29); padding matches the header. */}
      <div className="w-full px-6 lg:px-10 py-8">

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
          {(["overview", "bracket", "dayof", "live", "roster", "sponsors"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 font-mono text-xs tracking-widest transition-colors border-b-2 -mb-px whitespace-nowrap ${activeTab === tab ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {tab === "dayof" ? "DAY OF" : tab === "live" ? "LIVE BRACKETS" : tab.toUpperCase()}
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
                  <label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1.5">REGISTRATION CLOSES</label>
                  <input name="registration_closes_at" type="date" defaultValue={tournament.registration_closes_at ? tournament.registration_closes_at.slice(0, 10) : ""} required className="w-full h-11 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" />
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
                <div>
                  <label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1.5">
                    HOLD CUTOFF (DAYS BEFORE EVENT)
                  </label>
                  <input
                    name="hold_cutoff_days"
                    type="number"
                    min={1}
                    max={90}
                    defaultValue={tournament.hold_cutoff_days ?? 7}
                    className="w-full h-11 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Unredeemed holds are cancelled this many days before the event. The hold fee is forfeited and waitlisted players are promoted in order, each with 24 hours to complete payment.
                  </p>
                </div>
                <div>
                  <label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1.5">
                    REFUND CUTOFF (DAYS BEFORE EVENT)
                  </label>
                  <input
                    name="refund_cutoff_days"
                    type="number"
                    min={0}
                    max={365}
                    defaultValue={tournament.refund_cutoff_days ?? 15}
                    className="w-full h-11 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Players who cancel at least this many days before the event are eligible for a full entry-fee refund. Inside the window, no refund. This does not apply to Hold My Spot deposits, which are always non-refundable. Refunds are currently issued manually — this setting decides eligibility, not payout.
                  </p>
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
                      <Clock size={16} className="text-primary mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="text-sm font-semibold">
                          {tournament.registration_closes_at ? `Registration closes ${fmtDate(tournament.registration_closes_at)}` : "Registration close date not set"}
                        </div>
                      </div>
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
                        <div className="text-xs text-muted-foreground">Hold valid for {tournament.hold_duration_hours}h · Cutoff {tournament.hold_cutoff_days ?? 7} days before event</div>
                        <div className="text-xs text-muted-foreground">Entry fee refundable up to {tournament.refund_cutoff_days ?? 15} days before event · deposits non-refundable</div>
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

            {/* Action buttons (single elimination; pool play uses the pool panel) */}
            {tournament.tournament_format !== "pool_bracket" && (<>
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
                disabled={building || registrations.length < 2}
                className="flex items-center gap-2 h-10 px-5 rounded-full border border-border hover:bg-secondary font-display tracking-wider text-sm transition-colors disabled:opacity-40"
              >
                <Gauge size={14} weight="fill" /> {building ? "BUILDING…" : "GENERATE MATCHES"}
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

            {divisions.length > 0 && (
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="font-mono text-[10px] tracking-widest text-muted-foreground mb-2">SAVED BRACKETS · USED ON THE DAY (WEB AND MOBILE)</p>
                <div className="space-y-1.5">
                  {divisions.map((d) => {
                    const b = savedBrackets[d.id];
                    return (
                      <div key={d.id} className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate">{d.name}</span>
                        <span className={`font-mono text-[10px] tracking-widest ${b ? "text-primary" : "text-muted-foreground"}`}>
                          {b ? `SAVED · ${b.matches} MATCHES${b.scored ? ` · ${b.scored} SCORED` : ""}` : "NOT BUILT"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            </>)}

            {tournament.tournament_format === "pool_bracket" ? (
              <PoolPlayPanel
                tournamentId={id}
                divisions={divisions.map((d) => ({ id: d.id, name: d.name }))}
                registrations={registrations.map((r) => ({
                  ...r,
                  playerDupr: r.profiles?.dupr ?? null,
                  partnerDupr: r.partner?.dupr ?? null,
                }))}
                preferredPoolCount={tournament.pool_count}
              />
            ) : seeds.length === 0 && registrations.filter((r) => r.status === "registered").length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-12 text-center">
                <Trophy size={32} className="text-muted-foreground mx-auto mb-3" />
                <p className="font-display text-xl tracking-wide mb-1">NO REGISTERED PLAYERS</p>
                <p className="text-sm text-muted-foreground">Players must register before you can seed the bracket.</p>
              </div>
            ) : seeds.length > 0 ? (
              /* Visual bracket tree */
              <div className="pt-2">
                <BracketTree
                  seeds={seeds}
                  locked={bracketLocked}
                  onSwapSeeds={handleSwapSeeds}
                />
              </div>
            ) : (
              /* Unseeded registered players — shown before Auto-Seed is run */
              <div className="space-y-2">
                <p className="font-mono text-[10px] tracking-widest text-muted-foreground mb-3">
                  RUN AUTO-SEED OR LOCK BRACKET TO GENERATE THE DRAW
                </p>
                {registrations.filter((r) => r.status === "registered").map((r) => (
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
          </div>
        )}

        {/* ── Day Of tab (Command Center): live data, shared with mobile ── */}
        {activeTab === "dayof" && (
          <DayOfBoard tournamentId={id} onGoToBracket={() => setActiveTab("bracket")} />
        )}

        {/* ── Live brackets + leaderboard (read-only, same view as the public page) ── */}
        {activeTab === "live" && (
          <LiveTournamentProvider value={liveData}>
            {/* Queue column beside the tree from xl; stacked above it below. */}
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
              <div className="min-w-0 order-2 xl:order-1"><LiveBrackets tournamentId={id} director /></div>
              <div className="order-1 xl:order-2 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto">
                <LiveQueuePanel />
              </div>
            </div>
          </LiveTournamentProvider>
        )}

        {/* ── Roster tab ── */}
        {activeTab === "roster" && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={rosterQuery}
                onChange={(e) => setRosterQuery(e.target.value)}
                placeholder="Search player or partner"
                aria-label="Search registrations"
                className="flex-1 min-w-[12rem] h-10 rounded-full bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <button onClick={() => setAddingPlayer(true)} className="flex items-center gap-1.5 px-4 h-10 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-display tracking-wider transition-colors">
                <Plus size={13} weight="bold" /> ADD PLAYER
              </button>
            </div>
            {registrations.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-12 text-center">
                <Users size={32} className="text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No registrations yet. Walk-ins can be added with Add Player, even after registration closes.</p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono text-muted-foreground px-1">
                  <span>{registered} registered</span>
                  <span>{checkedIn} checked in</span>
                  <span>{held} held</span>
                  {onsiteCollected > 0 && <span>${(onsiteCollected / 100).toFixed(onsiteCollected % 100 === 0 ? 0 : 2)} collected on site</span>}
                </div>
                {rosterRows.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-border p-8 text-center">
                    <p className="text-sm text-muted-foreground mb-3">No player or partner matches “{rosterQuery.trim()}”.</p>
                    <button onClick={() => setRosterQuery("")} className="h-9 px-4 rounded-full border border-border hover:bg-secondary text-xs font-display tracking-wider">CLEAR SEARCH</button>
                  </div>
                )}
                {rosterRows.map((r) => {
                  const div = divisions.find((d) => d.id === r.division_id);
                  const name = playerName(r);
                  const partner = partnerName(r);
                  const status = ROSTER_STATUS[r.status] ?? { label: r.status.replace(/_/g, " ").toUpperCase(), cls: "text-muted-foreground border-border" };
                  const meta = [
                    div?.name ?? "Open",
                    r.profiles?.dupr ? `DUPR ${r.profiles.dupr}` : r.profiles?.skill_level?.replace("-", " – ") ?? (r.guest_player_id ? "Guest" : "—"),
                    onsiteLabel(r.onsite_tender, r.onsite_amount_cents),
                  ].filter(Boolean).join(" · ");
                  return (
                    <div key={r.id} className="flex items-center gap-3 sm:gap-4 rounded-xl border border-border bg-card px-4 py-3">
                      <div className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                        <span className="font-display text-sm text-primary">{name[0]}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {name}{partner && <span className="text-muted-foreground font-normal"> &amp; {partner}</span>}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{meta}</div>
                      </div>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border whitespace-nowrap ${status.cls}`}>
                        {status.label}
                      </span>
                      {/* Same action and messages as mobile's workspace; the
                          cancel-registration function authorises, refunds and
                          promotes the waitlist server-side. */}
                      {["registered", "checked_in", "held"].includes(r.status) && (
                        <button
                          disabled={cancellingId !== null}
                          onClick={async () => {
                            if (!window.confirm(`Cancel ${name}'s registration? This cannot be undone.`)) return;
                            setCancellingId(r.id);
                            const result = await directorCancelRegistration(r.id);
                            setCancellingId(null);
                            if (!result.cancelled) {
                              toast.error(result.error === "not_authorized"
                                ? "You are not able to cancel this registration."
                                : "Could not cancel. Please try again.");
                              return;
                            }
                            if (result.refundStatus === "submitted") {
                              toast.success(`Registration cancelled. ${formatFee(result.refundedCents)} has been refunded to the player's original payment method.`);
                            } else if (result.refundStatus === "failed") {
                              toast.warning("Registration cancelled. The refund could not be processed automatically and needs manual follow-up.");
                            } else if (r.onsite_tender && r.onsite_tender !== "comp") {
                              toast.success(`Registration cancelled. ${name} paid ${formatFee(r.onsite_amount_cents ?? 0)} on site. Refund them at the desk if needed.`);
                            } else {
                              toast.success("Registration cancelled.");
                            }
                            await load();
                          }}
                          aria-label={`Cancel ${name}'s registration`}
                          className="h-7 px-2.5 rounded-full border border-border hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive font-mono text-[10px] whitespace-nowrap transition-colors disabled:opacity-40"
                        >
                          {cancellingId === r.id ? "…" : "CANCEL"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </>
            )}
            {addingPlayer && (
              <AddRegistrationDialog tournamentId={id} onClose={() => setAddingPlayer(false)} onAdded={load} />
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
                  <SafeImage src={s.logo_url} alt={s.name} width={40} height={40} className="h-10 w-10 object-contain rounded-lg bg-secondary flex-shrink-0" />
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

    </PageShell>
  );
}
