"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus, Trophy, Users, CurrencyDollar, Lightning, X,
  ArrowRight, CheckCircle, Clock, PencilSimple, Eye,
  Warning, MapPin, Calendar,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { PageShell } from "@/components/layout/page-shell";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/client";
import { getUserId } from "@/lib/dev-user";

// ── Types ─────────────────────────────────────────────────────────────────────

type Tournament = {
  id: string;
  name: string;
  city: string;
  state: string;
  venue_name: string | null;
  event_date: string;
  format: string;
  draw_size: number;
  spots_filled: number;
  entry_fee_cents: number;
  hold_fee_cents: number;
  prize_pool_cents: number | null;
  status: string;
  created_at: string;
  // aggregated
  registered: number;
  held: number;
  revenue_cents: number;
};

type Registration = {
  id: string;
  status: string;
  entry_fee_paid_cents: number;
  hold_fee_paid_cents: number;
  hold_expires_at: string | null;
  created_at: string;
  player: { id: string; full_name: string; dupr: number | null; skill_level: string | null; avatar_url: string | null } | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  draft: "DRAFT",
  pending_approval: "PENDING",
  open: "OPEN",
  filling_fast: "FILLING FAST",
  registration_closed: "REG. CLOSED",
  in_progress: "IN PROGRESS",
  completed: "COMPLETED",
  cancelled: "CANCELLED",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-secondary text-muted-foreground",
  pending_approval: "bg-amber-500/15 text-amber-500",
  open: "bg-primary/15 text-primary",
  filling_fast: "bg-orange-500/15 text-orange-400",
  registration_closed: "bg-secondary text-muted-foreground",
  in_progress: "bg-primary/20 text-primary",
  completed: "bg-secondary text-muted-foreground",
  cancelled: "bg-destructive/15 text-destructive",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Create Dialog ─────────────────────────────────────────────────────────────

function CreateDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (t: Tournament) => void }) {
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);

    try {
      const userId = await getUserId();
      if (!userId) { toast.error("Not signed in."); return; }
      const supabase = createClient();

      const name = fd.get("name") as string;
      const city = fd.get("city") as string;
      const state = fd.get("state") as string;
      const venue_name = (fd.get("venue") as string) || null;
      const event_date = fd.get("date") as string;
      const format = fd.get("format") as string;
      const draw_size = parseInt(fd.get("capacity") as string, 10);
      const entry_fee_cents = Math.round(parseFloat(fd.get("entry_fee") as string) * 100);
      const hold_fee_cents = Math.round(parseFloat(fd.get("hold_fee") as string) * 100);
      const prize_raw = fd.get("prize_pool") as string;
      const prize_pool_cents = prize_raw ? Math.round(parseFloat(prize_raw) * 100) : null;
      const description = (fd.get("description") as string) || null;

      const { data, error } = await supabase
        .from("tournaments")
        .insert({
          director_id: userId,
          name, city, state, venue_name, event_date,
          format: format as "singles" | "doubles" | "mixed_doubles" | "juniors",
          draw_size,
          entry_fee_cents, hold_fee_cents,
          prize_pool_cents, description,
          status: "draft",
          spots_filled: 0,
        })
        .select("id,name,city,state,venue_name,event_date,format,draw_size,spots_filled,entry_fee_cents,hold_fee_cents,prize_pool_cents,status,created_at")
        .single();

      if (error) { toast.error("Failed to create tournament: " + error.message); return; }

      toast.success("Tournament created!", { description: "It's saved as a draft. Submit for approval when ready." });
      onCreated({ ...data as Tournament, registered: 0, held: 0, revenue_cents: 0 });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto" data-testid="create-tournament-dialog">
      <div className="w-full max-w-lg border border-border rounded-2xl bg-card p-6 shadow-2xl my-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display text-3xl tracking-wide">CREATE TOURNAMENT</h2>
          <button onClick={onClose} className="h-9 w-9 rounded-full border border-border flex items-center justify-center hover:bg-secondary transition-colors">
            <X size={16} weight="bold" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-1.5">TOURNAMENT NAME</label>
            <input name="name" required placeholder="e.g. Spring Slam Open" className="w-full h-12 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" data-testid="create-name" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-1.5">CITY</label>
              <input name="city" required placeholder="Austin" className="w-full h-12 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-1.5">STATE</label>
              <input name="state" required placeholder="TX" maxLength={2} className="w-full h-12 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </div>

          <div>
            <label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-1.5">VENUE NAME</label>
            <input name="venue" placeholder="Arena name (optional)" className="w-full h-12 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-1.5">EVENT DATE</label>
              <input name="date" type="date" required className="w-full h-12 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" data-testid="create-date" />
            </div>
            <div>
              <label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-1.5">FORMAT</label>
              <select name="format" required className="w-full h-12 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring cursor-pointer">
                <option value="doubles">Doubles</option>
                <option value="mixed_doubles">Mixed Doubles</option>
                <option value="singles">Singles</option>
                <option value="juniors">Juniors</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-1.5">DRAW SIZE</label>
              <input name="capacity" type="number" required placeholder="32" min={4} className="w-full h-12 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" data-testid="create-capacity" />
            </div>
            <div>
              <label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-1.5">ENTRY FEE ($)</label>
              <input name="entry_fee" type="number" required placeholder="75" min={0} step="0.01" className="w-full h-12 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" data-testid="create-entry-fee" />
            </div>
            <div>
              <label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-1.5">HOLD FEE ($)</label>
              <input name="hold_fee" type="number" required placeholder="10" min={0} step="0.01" className="w-full h-12 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" data-testid="create-hold-fee" />
            </div>
          </div>

          <div>
            <label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-1.5">PRIZE POOL ($) <span className="text-muted-foreground/60">— optional</span></label>
            <input name="prize_pool" type="number" placeholder="2500" min={0} step="0.01" className="w-full h-12 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </div>

          <div>
            <label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-1.5">DESCRIPTION <span className="text-muted-foreground/60">— optional</span></label>
            <textarea name="description" rows={3} placeholder="Tell players what makes this event special..." className="w-full rounded-xl bg-secondary border border-border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring resize-none" />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 h-12 rounded-full border border-border hover:bg-secondary/60 font-display tracking-[0.2em] text-sm transition-colors" data-testid="create-cancel-btn">
              CANCEL
            </button>
            <button type="submit" disabled={loading} className="flex-1 h-12 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-[0.2em] text-sm transition-colors disabled:opacity-50" data-testid="create-submit-btn">
              {loading ? "CREATING…" : "CREATE DRAFT"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DirectorPage() {
  const router = useRouter();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    async function load() {
      const uid = await getUserId();
      if (!uid) { router.replace("/auth?redirect=/director"); return; }
      setUserId(uid);

      const supabase = createClient();

      // Check role
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", uid)
        .single();

      if (profile && profile.role !== "director" && profile.role !== "admin") {
        setAccessDenied(true);
        setLoading(false);
        return;
      }

      // Load tournaments with registration counts
      const { data: rows } = await supabase
        .from("tournaments")
        .select("id,name,city,state,venue_name,event_date,format,draw_size,spots_filled,entry_fee_cents,hold_fee_cents,prize_pool_cents,status,created_at")
        .eq("director_id", uid)
        .order("event_date", { ascending: false });

      if (!rows || rows.length === 0) { setLoading(false); return; }

      // For each tournament, get registration breakdown
      const ids = rows.map((r) => r.id);
      const { data: regs } = await supabase
        .from("registrations")
        .select("tournament_id, status, entry_fee_paid_cents, hold_fee_paid_cents")
        .in("tournament_id", ids);

      const regMap: Record<string, { registered: number; held: number; revenue_cents: number }> = {};
      for (const reg of regs ?? []) {
        if (!regMap[reg.tournament_id]) regMap[reg.tournament_id] = { registered: 0, held: 0, revenue_cents: 0 };
        if (reg.status === "registered" || reg.status === "checked_in") regMap[reg.tournament_id].registered++;
        if (reg.status === "held") regMap[reg.tournament_id].held++;
        regMap[reg.tournament_id].revenue_cents += (reg.entry_fee_paid_cents ?? 0) + (reg.hold_fee_paid_cents ?? 0);
      }

      setTournaments(rows.map((t) => ({
        ...t,
        registered: regMap[t.id]?.registered ?? 0,
        held: regMap[t.id]?.held ?? 0,
        revenue_cents: regMap[t.id]?.revenue_cents ?? 0,
      })));
      setLoading(false);
    }
    load().catch(() => setLoading(false));
  }, []);

  const loadRegistrations = async (tournamentId: string) => {
    setSelectedId(tournamentId);
    const supabase = createClient();
    const { data } = await supabase
      .from("registrations")
      .select(`
        id, status, entry_fee_paid_cents, hold_fee_paid_cents, hold_expires_at, created_at,
        player:profiles!player_id(id, full_name, dupr, skill_level, avatar_url)
      `)
      .eq("tournament_id", tournamentId)
      .in("status", ["held", "registered", "checked_in", "withdrawn"])
      .order("created_at", { ascending: true });
    setRegistrations((data ?? []) as unknown as Registration[]);
  };

  const submitForApproval = async (tournamentId: string) => {
    setPublishing(tournamentId);
    const supabase = createClient();
    const { error } = await supabase
      .from("tournaments")
      .update({ status: "pending_approval", submitted_for_approval_at: new Date().toISOString() })
      .eq("id", tournamentId)
      .eq("director_id", userId!);
    setPublishing(null);
    if (error) { toast.error("Failed to submit."); return; }
    setTournaments((prev) => prev.map((t) => t.id === tournamentId ? { ...t, status: "pending_approval" } : t));
    toast.success("Submitted for approval!", { description: "Our team will review it within 24 hours." });
  };

  // Stats
  const totalRevenue = tournaments.reduce((s, t) => s + t.revenue_cents, 0);
  const totalPlayers = tournaments.reduce((s, t) => s + t.registered, 0);
  const activeCount = tournaments.filter((t) => ["open", "filling_fast", "in_progress", "pending_approval"].includes(t.status)).length;

  if (loading) {
    return (
      <PageShell>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 flex items-center justify-center">
          <div className="h-12 w-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
        </div>
      </PageShell>
    );
  }

  if (accessDenied) {
    return (
      <PageShell>
        <div className="max-w-3xl mx-auto px-4 py-24 text-center">
          <Warning size={48} weight="duotone" className="mx-auto mb-4 text-destructive" />
          <h1 className="font-display text-4xl tracking-wide mb-2">ACCESS RESTRICTED</h1>
          <p className="text-muted-foreground mb-6">This portal is for tournament directors only. Sign up as a director to create and manage events.</p>
          <Link href="/auth">
            <button className="h-12 px-8 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-[0.2em] text-sm transition-colors">
              CREATE DIRECTOR ACCOUNT
            </button>
          </Link>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      {/* Header */}
      <section className="border-b border-border bg-card/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex items-center justify-between">
          <div>
            <div className="font-mono text-[11px] tracking-[0.3em] text-primary mb-2">/ DIRECTOR PORTAL</div>
            <h1 className="font-display text-4xl sm:text-5xl tracking-wide">DIRECTOR DASHBOARD</h1>
            <p className="text-muted-foreground text-sm mt-1.5">{tournaments.length} tournament{tournaments.length !== 1 ? "s" : ""} · {totalPlayers} players registered</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="hidden sm:flex rounded-full h-11 px-6 bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-[0.2em] text-sm items-center gap-2 transition-colors"
            data-testid="director-create-btn"
          >
            <Plus size={16} weight="bold" /> NEW TOURNAMENT
          </button>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "TOURNAMENTS HOSTED", value: tournaments.length, icon: Trophy },
            { label: "ACTIVE EVENTS", value: activeCount, icon: Lightning },
            { label: "TOTAL PLAYERS", value: totalPlayers.toLocaleString(), icon: Users },
            { label: "REVENUE COLLECTED", value: `$${(totalRevenue / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, icon: CurrencyDollar },
          ].map((s) => (
            <div key={s.label} className="border border-border rounded-2xl p-5 bg-card">
              <div className="flex items-center justify-between mb-3">
                <div className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground">{s.label}</div>
                <s.icon size={16} weight="fill" className="text-primary" />
              </div>
              <div className="font-display text-4xl tracking-wide">{s.value}</div>
            </div>
          ))}
        </div>

        <Tabs defaultValue="tournaments" className="w-full">
          <TabsList className="rounded-full p-1 h-11 mb-6 bg-secondary inline-flex">
            <TabsTrigger value="tournaments" className="rounded-full px-5" data-testid="director-tab-tournaments">Tournaments</TabsTrigger>
            <TabsTrigger value="players" className="rounded-full px-5" data-testid="director-tab-players">Players</TabsTrigger>
            <TabsTrigger value="revenue" className="rounded-full px-5" data-testid="director-tab-revenue">Revenue</TabsTrigger>
          </TabsList>

          {/* Tournaments tab */}
          <TabsContent value="tournaments">
            <div className="border border-border rounded-2xl bg-card overflow-hidden">
              <div className="flex items-center justify-between p-5 border-b border-border">
                <h3 className="font-display text-xl tracking-wide">MY TOURNAMENTS</h3>
                <button onClick={() => setShowCreate(true)} className="sm:hidden rounded-full h-9 px-4 bg-primary text-primary-foreground font-display tracking-[0.15em] text-xs flex items-center gap-1.5">
                  <Plus size={14} /> NEW
                </button>
              </div>

              {tournaments.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground">
                  <Trophy size={36} weight="duotone" className="mx-auto mb-3 text-primary" />
                  <div className="font-display text-2xl tracking-wide mb-1">NO TOURNAMENTS YET</div>
                  <p className="text-sm mb-6">Create your first tournament and start building your circuit.</p>
                  <button onClick={() => setShowCreate(true)} className="h-11 px-6 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-[0.2em] text-sm transition-colors">
                    CREATE TOURNAMENT
                  </button>
                </div>
              ) : (
                tournaments.map((t) => {
                  const pct = Math.round(((t.registered + t.held) / t.draw_size) * 100);
                  const isDraft = t.status === "draft";
                  return (
                    <div key={t.id} className="p-5 border-b border-border last:border-0" data-testid={`director-tournament-${t.id}`}>
                      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 flex-wrap">
                            <div className="font-display text-xl tracking-wide">{t.name}</div>
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono tracking-widest ${STATUS_COLORS[t.status] ?? "bg-secondary text-muted-foreground"}`}>
                              {STATUS_LABELS[t.status] ?? t.status.toUpperCase()}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><MapPin size={11} weight="bold" className="text-primary" />{t.city}, {t.state}</span>
                            <span className="flex items-center gap-1"><Calendar size={11} weight="bold" className="text-primary" />{formatDate(t.event_date)}</span>
                            <span>{t.format.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</span>
                          </div>

                          {/* Fill bar */}
                          <div className="mt-3 max-w-xs">
                            <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground mb-1">
                              <span>{t.registered} registered · {t.held} held</span>
                              <span>{t.draw_size - t.registered - t.held} spots left</span>
                            </div>
                            <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                          <div className="text-right mr-2">
                            <div className="font-mono text-xs text-muted-foreground">REVENUE</div>
                            <div className="font-mono font-bold text-primary">${(t.revenue_cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                          </div>

                          {isDraft && (
                            <button
                              onClick={() => submitForApproval(t.id)}
                              disabled={publishing === t.id}
                              className="h-9 px-4 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-display tracking-[0.15em] transition-colors disabled:opacity-50 flex items-center gap-1.5"
                              data-testid={`director-publish-${t.id}`}
                            >
                              <Lightning size={13} weight="fill" />
                              {publishing === t.id ? "SUBMITTING…" : "SUBMIT"}
                            </button>
                          )}

                          <button
                            onClick={() => loadRegistrations(t.id)}
                            className="h-9 px-4 rounded-full border border-border hover:bg-secondary/60 text-xs font-semibold transition-colors flex items-center gap-1.5"
                            data-testid={`director-roster-${t.id}`}
                          >
                            <Users size={13} /> ROSTER
                          </button>

                          <Link href={`/tournaments/${t.id}`}>
                            <button className="h-9 w-9 rounded-full border border-border hover:bg-secondary/60 transition-colors flex items-center justify-center" data-testid={`director-view-${t.id}`}>
                              <Eye size={14} weight="bold" />
                            </button>
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </TabsContent>

          {/* Players tab */}
          <TabsContent value="players">
            {!selectedId ? (
              <div className="border border-dashed border-border rounded-2xl p-12 text-center text-muted-foreground">
                <Users size={32} weight="duotone" className="mx-auto mb-3 text-primary" />
                <div className="font-display text-2xl tracking-wide mb-1">SELECT A TOURNAMENT</div>
                <p className="text-sm">Click ROSTER on any tournament in the Tournaments tab to view its player list here.</p>
              </div>
            ) : (
              <div className="border border-border rounded-2xl bg-card overflow-hidden">
                <div className="flex items-center justify-between p-5 border-b border-border">
                  <div>
                    <h3 className="font-display text-xl tracking-wide">
                      {tournaments.find((t) => t.id === selectedId)?.name ?? "ROSTER"}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{registrations.length} entries</p>
                  </div>
                  <button onClick={() => setSelectedId(null)} className="h-9 w-9 rounded-full border border-border flex items-center justify-center hover:bg-secondary transition-colors">
                    <X size={14} weight="bold" />
                  </button>
                </div>

                {registrations.length === 0 ? (
                  <div className="p-10 text-center text-muted-foreground text-sm">No registrations yet.</div>
                ) : (
                  <div className="divide-y divide-border">
                    {registrations.map((r, i) => (
                      <div key={r.id} className="flex items-center gap-4 px-5 py-3">
                        <span className="font-mono text-xs text-muted-foreground w-6 flex-shrink-0">{i + 1}</span>
                        {r.player?.avatar_url ? (
                          <img src={r.player.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center font-display text-sm flex-shrink-0">
                            {r.player?.full_name?.charAt(0) ?? "?"}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold truncate">{r.player?.full_name ?? "Unknown"}</div>
                          <div className="text-xs text-muted-foreground">
                            {r.player?.dupr ? `${r.player.dupr} DUPR` : r.player?.skill_level?.replace("-", " – ") ?? "—"}
                          </div>
                        </div>
                        <span className={`text-[10px] font-mono font-bold tracking-widest px-2.5 py-1 rounded-full flex-shrink-0 ${
                          r.status === "registered" || r.status === "checked_in"
                            ? "bg-primary/15 text-primary"
                            : r.status === "held"
                            ? "bg-amber-500/15 text-amber-500"
                            : "bg-secondary text-muted-foreground"
                        }`}>
                          {r.status.toUpperCase()}
                        </span>
                        <div className="text-xs text-muted-foreground hidden sm:block flex-shrink-0">
                          {formatDate(r.created_at)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* Revenue tab */}
          <TabsContent value="revenue">
            {tournaments.length === 0 ? (
              <div className="border border-dashed border-border rounded-2xl p-12 text-center text-muted-foreground">
                <CurrencyDollar size={32} weight="duotone" className="mx-auto mb-3 text-primary" />
                <div className="font-display text-xl tracking-wide mb-1">NO REVENUE YET</div>
                <p className="text-sm">Revenue appears here once players register for your tournaments.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Per-tournament breakdown */}
                <div className="border border-border rounded-2xl bg-card overflow-hidden">
                  <div className="p-5 border-b border-border">
                    <h3 className="font-display text-xl tracking-wide">PER TOURNAMENT</h3>
                  </div>
                  <div className="divide-y divide-border">
                    {tournaments.map((t) => (
                      <div key={t.id} className="flex items-center justify-between px-5 py-4">
                        <div>
                          <div className="font-semibold text-sm">{t.name}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{t.registered} registered · ${(t.entry_fee_cents / 100).toFixed(0)} entry</div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono font-bold text-primary">${(t.revenue_cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                          <div className="text-[10px] font-mono text-muted-foreground">collected</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Summary */}
                <div className="border border-border rounded-2xl bg-card overflow-hidden">
                  {[
                    { label: "Gross Revenue", amount: totalRevenue / 100, note: "All entry + hold fees collected" },
                    { label: "Platform Fee (5%)", amount: -(totalRevenue / 100) * 0.05, note: "DreamBreaker PB platform cut" },
                  ].map((r, i) => (
                    <div key={i} className="flex items-center justify-between p-5 border-b border-border">
                      <div>
                        <div className="font-semibold">{r.label}</div>
                        <div className="text-xs text-muted-foreground">{r.note}</div>
                      </div>
                      <div className={`font-mono font-bold text-lg ${r.amount < 0 ? "text-destructive" : "text-primary"}`}>
                        {r.amount < 0 ? "-" : ""}${Math.abs(r.amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center justify-between p-5 bg-primary/5">
                    <div className="font-display text-xl tracking-wide">NET PAYOUT</div>
                    <div className="font-mono font-bold text-2xl text-primary">
                      ${((totalRevenue / 100) * 0.95).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {showCreate && (
        <CreateDialog
          onClose={() => setShowCreate(false)}
          onCreated={(t) => setTournaments((prev) => [t, ...prev])}
        />
      )}
    </PageShell>
  );
}
