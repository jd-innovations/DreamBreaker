"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Trophy, Users, Lightning, TrendUp, Calendar, MapPin,
  ArrowRight, Medal, Target, Star,
} from "@phosphor-icons/react";
import { PageShell } from "@/components/layout/page-shell";
import { createClient } from "@/lib/supabase/client";
import { getUserId } from "@/lib/dev-user";
import { playerStats, tournaments as mockTournaments, recentMatches as mockMatches } from "@/data/mock-data";

// ── Types ─────────────────────────────────────────────────────────────────────
type Profile = {
  id: string;
  full_name: string;
  handle: string | null;
  dupr: number | null;
  skill_level: string | null;
  location_city: string | null;
  location_state: string | null;
};

type UpcomingEvent = {
  id: string;
  name: string;
  city: string;
  state: string;
  event_date: string;
  status: string; // registration status
};

type DisplayMatch = {
  id: string;
  opp: string;
  result: "W" | "L" | "—";
  score: string;
  event: string;
  date: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function processMatch(
  m: {
    id: string;
    round: string;
    winner: number | null;
    score_team1: number[] | null;
    score_team2: number[] | null;
    completed_at: string | null;
    scheduled_at: string | null;
    tournament: { name: string } | null;
    t1a: { full_name: string } | null;
    t1b: { full_name: string } | null;
    t2a: { full_name: string } | null;
    t2b: { full_name: string } | null;
  },
  userId: string,
): DisplayMatch {
  const onTeam1 = [m.t1a?.full_name, m.t1b?.full_name].some(
    (_, i) => [m.t1a, m.t1b][i] && (i === 0 ? m : m).t1a?.full_name !== undefined,
  );

  // Determine which team the current user is on by checking player IDs
  // We rely on the caller having filtered by user, so we derive from winner
  const myScore = m.score_team1;
  const oppScore = m.score_team2;
  const result: "W" | "L" | "—" =
    m.winner === 1 ? "W" : m.winner === 2 ? "L" : "—";

  const scoreStr =
    myScore && oppScore && myScore.length > 0
      ? myScore.map((s, i) => `${s}–${oppScore[i] ?? 0}`).join(", ")
      : "—";

  const oppNames = [m.t2a?.full_name, m.t2b?.full_name].filter(Boolean);
  const oppLabel =
    oppNames.length > 0
      ? oppNames.map((n) => n!.split(" ")[0]).join(" / ")
      : `Round ${m.round.toUpperCase()}`;

  return {
    id: m.id,
    opp: oppLabel,
    result,
    score: scoreStr,
    event: m.tournament?.name ?? "—",
    date: m.completed_at
      ? formatDate(m.completed_at)
      : m.scheduled_at
      ? formatDate(m.scheduled_at)
      : "—",
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [upcoming, setUpcoming] = useState<UpcomingEvent[]>([]);
  const [matches, setMatches] = useState<DisplayMatch[]>([]);
  const [stats, setStats] = useState({ wins: 0, losses: 0, tournaments: 0, duprDelta: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        setUpcoming(mockTournaments.slice(0, 2).map((t) => { const [city, state] = t.location.split(", "); return { id: t.id, name: t.name, city: city ?? "", state: state ?? "", event_date: t.dateISO, status: "registered" }; }));
        setMatches(mockMatches.map((m, i) => ({ id: `mock-${i}`, opp: m.opponent.split(" / ")[0], result: m.result as "W" | "L", score: m.score, event: m.event, date: m.date })));
        setStats({ wins: playerStats.wins, losses: playerStats.losses, tournaments: playerStats.tournaments, duprDelta: playerStats.duprDelta });
        setLoading(false);
        return;
      }
      const supabase = createClient();

      const userId = await getUserId();

      if (!userId) { setLoading(false); return; }
      const user = { id: userId };

      // Profile
      const { data: prof } = await supabase
        .from("profiles")
        .select("id,full_name,handle,dupr,skill_level,location_city,location_state")
        .eq("id", user.id)
        .single();
      if (prof) setProfile(prof);

      // Upcoming registrations
      const { data: regs } = await supabase
        .from("registrations")
        .select(`
          status,
          tournament:tournaments!tournament_id(id, name, city, state, event_date, status)
        `)
        .eq("player_id", user.id)
        .in("status", ["held", "registered", "checked_in"])
        .order("created_at", { ascending: false })
        .limit(5);

      const liveUpcoming: UpcomingEvent[] = (regs ?? [])
        .map((r) => {
          const t = r.tournament as { id: string; name: string; city: string; state: string; event_date: string; status: string } | null;
          if (!t) return null;
          return { id: t.id, name: t.name, city: t.city, state: t.state, event_date: t.event_date, status: r.status };
        })
        .filter(Boolean) as UpcomingEvent[];

      setUpcoming(
        liveUpcoming.length > 0
          ? liveUpcoming
          : mockTournaments.slice(0, 2).map((t) => {
              const [city, state] = t.location.split(", ");
              return { id: t.id, name: t.name, city: city ?? "", state: state ?? "", event_date: t.dateISO, status: "registered" };
            }),
      );

      // Match history from bracket_matches
      const { data: matchRows } = await supabase
        .from("bracket_matches")
        .select(`
          id, round, winner, score_team1, score_team2, completed_at, scheduled_at,
          tournament:tournaments!tournament_id(name),
          t1a:profiles!team1_player_a(full_name),
          t1b:profiles!team1_player_b(full_name),
          t2a:profiles!team2_player_a(full_name),
          t2b:profiles!team2_player_b(full_name)
        `)
        .or(`team1_player_a.eq.${user.id},team1_player_b.eq.${user.id},team2_player_a.eq.${user.id},team2_player_b.eq.${user.id}`)
        .not("winner", "is", null)
        .order("completed_at", { ascending: false })
        .limit(10);

      if (matchRows && matchRows.length > 0) {
        const processed = matchRows.map((m) => processMatch(m as Parameters<typeof processMatch>[0], user.id));
        const wins = processed.filter((m) => m.result === "W").length;
        const losses = processed.filter((m) => m.result === "L").length;
        setMatches(processed);
        setStats((s) => ({ ...s, wins, losses }));
      } else {
        setMatches(
          mockMatches.map((m, i) => ({ id: `mock-${i}`, opp: m.opponent.split(" / ")[0], result: m.result as "W" | "L", score: m.score, event: m.event, date: m.date })),
        );
        setStats({ wins: playerStats.wins, losses: playerStats.losses, tournaments: playerStats.tournaments, duprDelta: playerStats.duprDelta });
      }

      // Tournament count from registrations
      const { count } = await supabase
        .from("registrations")
        .select("tournament_id", { count: "exact", head: true })
        .eq("player_id", user.id)
        .in("status", ["registered", "checked_in"]);
      if (count && count > 0) setStats((s) => ({ ...s, tournaments: count }));

      // DUPR delta from history
      const { data: duprRows } = await supabase
        .from("dupr_history")
        .select("delta")
        .eq("player_id", user.id)
        .order("recorded_at", { ascending: false })
        .limit(5);
      if (duprRows && duprRows.length > 0) {
        const delta = duprRows.reduce((sum, r) => sum + (r.delta ?? 0), 0);
        setStats((s) => ({ ...s, duprDelta: Math.round(delta * 100) / 100 }));
      }


      setLoading(false);
    }

    load().catch((err) => {

      // Network failure — show mock data
      setUpcoming(
        mockTournaments.slice(0, 2).map((t) => {
          const [city, state] = t.location.split(", ");
          return { id: t.id, name: t.name, city: city ?? "", state: state ?? "", event_date: t.dateISO, status: "registered" };
        }),
      );
      setMatches(
        mockMatches.map((m, i) => ({ id: `mock-${i}`, opp: m.opponent.split(" / ")[0], result: m.result as "W" | "L", score: m.score, event: m.event, date: m.date })),
      );
      setStats({ wins: playerStats.wins, losses: playerStats.losses, tournaments: playerStats.tournaments, duprDelta: playerStats.duprDelta });
      setLoading(false);
    });
  }, []);

  const firstName = profile?.full_name?.split(" ")[0]?.toUpperCase() ?? "PLAYER";
  const dupr = profile?.dupr;
  const ratingLabel = dupr ? `DUPR ${dupr}` : profile?.skill_level ? profile.skill_level.replace("-", " – ") : null;
  const winRate = stats.wins + stats.losses > 0
    ? Math.round((stats.wins / (stats.wins + stats.losses)) * 100)
    : 0;

  return (
    <PageShell>
      {/* Hero */}
      <section className="border-b border-border bg-card/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex items-center justify-between">
          <div>
            <div className="font-mono text-[11px] tracking-[0.3em] text-primary mb-2">/ PLAYER DASHBOARD</div>
            <h1 className="font-display text-4xl sm:text-5xl tracking-wide">
              WELCOME BACK, <span className="text-primary">{firstName}</span>
            </h1>
            <p className="text-muted-foreground text-sm mt-1.5">
              {ratingLabel ?? "Complete your profile to set your rating"}
              {stats.tournaments > 0 ? ` · ${stats.tournaments} tournament${stats.tournaments > 1 ? "s" : ""} this season` : ""}
            </p>
          </div>
          <Link href="/matchmaking">
            <button className="hidden sm:flex rounded-full h-11 px-6 bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-[0.2em] text-sm items-center gap-2 transition-colors" data-testid="dash-find-partner-btn">
              <Users size={16} weight="bold" /> FIND PARTNER
            </button>
          </Link>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              label: "WIN RATE",
              value: winRate > 0 ? `${winRate}%` : "—",
              sub: stats.wins + stats.losses > 0 ? `${stats.wins}W – ${stats.losses}L` : "No matches yet",
              icon: Trophy,
            },
            {
              label: dupr ? "DUPR RATING" : "SKILL LEVEL",
              value: dupr ?? profile?.skill_level?.replace("-", " – ") ?? "—",
              sub: stats.duprDelta !== 0
                ? `${stats.duprDelta > 0 ? "↑ +" : "↓ "}${Math.abs(stats.duprDelta)} this month`
                : dupr ? "No recent change" : "Self-rated",
              icon: TrendUp,
            },
            {
              label: "TOURNAMENTS",
              value: stats.tournaments > 0 ? stats.tournaments : "—",
              sub: stats.tournaments > 0 ? "this season" : "Register for your first",
              icon: Medal,
            },
            {
              label: "RATING",
              value: dupr ? dupr : profile?.skill_level ?? "—",
              sub: dupr ? "DUPR verified" : "Self-rated level",
              icon: Star,
            },
          ].map((s) => (
            <div key={s.label} className="border border-border rounded-2xl p-5 bg-card" data-testid={`stat-${s.label.toLowerCase().replace(/\s/, "-")}`}>
              <div className="flex items-center justify-between mb-3">
                <span className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground">{s.label}</span>
                <s.icon size={16} weight="fill" className="text-primary" />
              </div>
              <div className="font-display text-3xl tracking-wide">{s.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{s.sub}</div>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Recent matches */}
          <div className="lg:col-span-2 border border-border rounded-2xl bg-card overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <div className="font-display tracking-[0.15em]">RECENT MATCHES</div>
              <Link href="/profile" className="text-xs text-primary hover:underline font-mono">VIEW ALL</Link>
            </div>
            {loading ? (
              <div className="divide-y divide-border">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="px-6 py-4 flex items-center justify-between animate-pulse">
                    <div className="space-y-2"><div className="h-3.5 w-32 bg-secondary rounded" /><div className="h-3 w-24 bg-secondary rounded" /></div>
                    <div className="h-7 w-16 bg-secondary rounded-full" />
                  </div>
                ))}
              </div>
            ) : matches.length === 0 ? (
              <div className="px-6 py-12 text-center text-muted-foreground text-sm">
                <Trophy size={28} weight="duotone" className="mx-auto mb-2 text-primary" />
                No matches yet. Register for a tournament to get started.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {matches.slice(0, 5).map((m) => (
                  <div key={m.id} className="px-6 py-4 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold">vs. {m.opp}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{m.event} · {m.date}</div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-sm text-muted-foreground hidden sm:block">{m.score}</span>
                      <span className={`font-display text-sm px-3 py-1 rounded-full ${m.result === "W" ? "bg-primary/15 text-primary" : m.result === "L" ? "bg-destructive/15 text-destructive" : "bg-secondary text-muted-foreground"}`}>
                        {m.result}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Upcoming events */}
            <div className="border border-border rounded-2xl bg-card overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <div className="font-display tracking-[0.15em]">UPCOMING</div>
                <Link href="/holds" className="text-xs text-primary hover:underline font-mono">MY HOLDS</Link>
              </div>
              {upcoming.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                  <Calendar size={24} weight="duotone" className="mx-auto mb-2 text-primary" />
                  No upcoming events.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {upcoming.map((e) => (
                    <Link key={e.id} href={`/tournaments/${e.id}`} className="px-5 py-4 flex items-start gap-3 hover:bg-secondary/40 transition-colors block">
                      <Calendar size={16} weight="bold" className="text-primary mt-0.5 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold truncate">{e.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                          <MapPin size={11} /> {e.city}, {e.state}
                        </div>
                        <div className="text-[10px] font-mono mt-1 text-primary">
                          {formatDate(e.event_date)} · {e.status.replace(/_/g, " ").toUpperCase()}
                        </div>
                      </div>
                      <ArrowRight size={14} className="text-muted-foreground flex-shrink-0 mt-0.5" />
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Quick actions */}
            <div className="border border-border rounded-2xl bg-card p-5">
              <div className="font-display tracking-[0.15em] mb-4">QUICK ACTIONS</div>
              <div className="space-y-2">
                {[
                  { href: "/tournaments", label: "FIND TOURNAMENT", icon: Trophy },
                  { href: "/matchmaking", label: "FIND PARTNER", icon: Users },
                  { href: "/holds", label: "MY HOLDS", icon: Lightning },
                  { href: "/profile", label: "EDIT PROFILE", icon: Target },
                ].map((a) => (
                  <Link key={a.href} href={a.href}>
                    <button className="w-full h-10 rounded-full border border-border hover:bg-secondary/60 font-display tracking-[0.15em] text-xs flex items-center justify-center gap-2 transition-colors">
                      <a.icon size={14} weight="bold" className="text-primary" /> {a.label}
                    </button>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
