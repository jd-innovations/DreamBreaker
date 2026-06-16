"use client";

export const dynamic = "force-dynamic";


import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Trophy, Users, Lightning, TrendUp, Calendar, MapPin,
  ArrowRight, Medal, Star, BookmarkSimple, Clock,
  Gauge, ChatCircleDots, Ticket, UserCircle,
  Gear, SignOut, List, X, SlidersHorizontal,
} from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import { getUserId } from "@/lib/dev-user";
import { MessagingPanel } from "@/components/messaging/panel";
import type { UserProfile as MessagingUserProfile, MatchSummary } from "@/components/messaging/panel";
import { NotificationBell } from "@/components/notifications/bell";
import { MatchSettingsPanel } from "@/components/shared/match-settings-panel";
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

type SavedTournament = {
  id: string;
  tournamentId: string;
  name: string;
  city: string;
  state: string;
  event_date: string;
  director_id?: string | null;
  entry_fee_cents?: number | null;
  formats?: string[];
  skill_min?: number | null;
  skill_max?: number | null;
  venue_name?: string | null;
  description?: string | null;
};

type UpcomingEvent = {
  id: string;
  registration_id: string;
  name: string;
  city: string;
  state: string;
  event_date: string;
  status: string;
  hold_expires_at?: string | null;
  director_id?: string | null;
  cancellation_policy?: string | null;
  entry_fee_cents?: number | null;
};

type DisplayMatch = {
  id: string;
  opp: string;
  result: "W" | "L" | "—";
  score: string;
  event: string;
  date: string;
};

type NavSection = "dashboard" | "events" | "matches" | "saved" | "messages" | "matchmaking" | "settings";

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
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [upcoming, setUpcoming] = useState<UpcomingEvent[]>([]);
  const [saved, setSaved] = useState<SavedTournament[]>([]);
  const [matches, setMatches] = useState<DisplayMatch[]>([]);
  const [stats, setStats] = useState({ wins: 0, losses: 0, tournaments: 0, duprDelta: 0 });
  const [loading, setLoading] = useState(true);
  const [navSection, setNavSection] = useState<NavSection>("dashboard");

  // Open a specific section when linked with ?section= (e.g. from the mobile nav).
  useEffect(() => {
    const sec = new URLSearchParams(window.location.search).get("section");
    const allowed: NavSection[] = ["dashboard", "events", "matches", "saved", "messages", "matchmaking", "settings"];
    // One-time init from the URL query; intentional setState on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (sec && (allowed as string[]).includes(sec)) setNavSection(sec as NavSection);
  }, []);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [messagingUnread, setMessagingUnread] = useState(0);
  const [allUsers, setAllUsers] = useState<MessagingUserProfile[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [mmMatches, setMmMatches] = useState<MatchSummary[]>([]);
  const [mmLikes, setMmLikes] = useState(0);
  // Captured once at mount; used to decide whether holds are still active.
  const [now] = useState(() => Date.now());
  const [cancelTarget, setCancelTarget] = useState<UpcomingEvent | null>(null);
  const [cancelConfirming, setCancelConfirming] = useState(false);
  const [dmDirectorId, setDmDirectorId] = useState<string | null>(null);
  const [removingBookmarkId, setRemovingBookmarkId] = useState<string | null>(null);
  const [registerTarget, setRegisterTarget] = useState<SavedTournament | null>(null);
  const [registerFormat, setRegisterFormat] = useState<string>("");
  const [waiverAccepted, setWaiverAccepted] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [registerDone, setRegisterDone] = useState(false);

  useEffect(() => {
    async function load() {
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        setUpcoming(mockTournaments.slice(0, 2).map((t, i) => { const [city, state] = t.location.split(", "); return { id: t.id, registration_id: `mock-reg-${i}`, name: t.name, city: city ?? "", state: state ?? "", event_date: t.dateISO, status: "registered" }; }));
        setMatches(mockMatches.map((m, i) => ({ id: `mock-${i}`, opp: m.opponent.split(" / ")[0], result: m.result as "W" | "L", score: m.score, event: m.event, date: m.date })));
        setStats({ wins: playerStats.wins, losses: playerStats.losses, tournaments: playerStats.tournaments, duprDelta: playerStats.duprDelta });
        setLoading(false);
        return;
      }
      const supabase = createClient();

      const userId = await getUserId();
      if (!userId) { router.push("/auth"); return; }
      setCurrentUserId(userId);
      const user = { id: userId };

      const { data: userProfiles } = await supabase.from("profiles").select("id,full_name,role,avatar_url").order("full_name");
      setAllUsers((userProfiles ?? []) as MessagingUserProfile[]);

      // Matchmaking matches + pending likes → "New Matches" strip in Messages
      const { data: mutual } = await supabase.from("v_mutual_matches").select("player_a,player_b").or(`player_a.eq.${user.id},player_b.eq.${user.id}`);
      const matchIds = (mutual ?? []).map((m) => m.player_a === user.id ? m.player_b : m.player_a).filter(Boolean) as string[];
      if (matchIds.length > 0) {
        const { data: mp } = await supabase.from("profiles").select("id,full_name,avatar_url,dupr,skill_level").in("id", matchIds);
        setMmMatches((mp ?? []).map((p) => ({ id: p.id, name: p.full_name ?? "Player", avatar: p.avatar_url, dupr: p.dupr, skill: p.skill_level })));
      }
      const { data: mySwipes } = await supabase.from("matchmaking_swipes").select("target_id").eq("requester_id", user.id);
      const swipedSet = new Set((mySwipes ?? []).map((s) => s.target_id));
      const { data: incomingLikes } = await supabase.from("matchmaking_swipes").select("requester_id").eq("target_id", user.id).eq("direction", "like");
      setMmLikes(new Set((incomingLikes ?? []).map((s) => s.requester_id).filter((id) => !swipedSet.has(id))).size);

      const { data: prof } = await supabase
        .from("profiles")
        .select("id,full_name,handle,dupr,skill_level,location_city,location_state")
        .eq("id", user.id)
        .single();
      if (prof) setProfile(prof);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: regs } = await (supabase as any)
        .from("registrations")
        .select("id, status, hold_expires_at, tournament:tournaments!tournament_id(id, name, city, state, event_date, status, director_id, cancellation_policy, entry_fee_cents)")
        .eq("player_id", user.id)
        .in("status", ["held", "registered", "checked_in"])
        .order("created_at", { ascending: false })
        .limit(10);

      const liveUpcoming: UpcomingEvent[] = (regs ?? [])
        .map((r: { id: string; status: string; hold_expires_at?: string | null; tournament: { id: string; name: string; city: string; state: string; event_date: string; status: string; director_id?: string | null; cancellation_policy?: string | null; entry_fee_cents?: number | null } | null }) => {
          const t = r.tournament;
          if (!t) return null;
          return { id: t.id, registration_id: r.id, name: t.name, city: t.city, state: t.state, event_date: t.event_date, status: r.status, hold_expires_at: r.hold_expires_at, director_id: t.director_id, cancellation_policy: t.cancellation_policy, entry_fee_cents: t.entry_fee_cents };
        })
        .filter(Boolean) as UpcomingEvent[];

      setUpcoming(liveUpcoming.length > 0 ? liveUpcoming : mockTournaments.slice(0, 2).map((t, i) => {
        const [city, state] = t.location.split(", ");
        return { id: t.id, registration_id: `mock-reg-${i}`, name: t.name, city: city ?? "", state: state ?? "", event_date: t.dateISO, status: "registered" };
      }));

      const { data: matchRows } = await supabase
        .from("bracket_matches")
        .select("id, round, winner, score_team1, score_team2, completed_at, scheduled_at, tournament:tournaments!tournament_id(name), t1a:profiles!team1_player_a(full_name), t1b:profiles!team1_player_b(full_name), t2a:profiles!team2_player_a(full_name), t2b:profiles!team2_player_b(full_name)")
        .or(`team1_player_a.eq.${user.id},team1_player_b.eq.${user.id},team2_player_a.eq.${user.id},team2_player_b.eq.${user.id}`)
        .not("winner", "is", null)
        .order("completed_at", { ascending: false })
        .limit(20);

      if (matchRows && matchRows.length > 0) {
        const processed = matchRows.map((m) => processMatch(m as Parameters<typeof processMatch>[0], user.id));
        setMatches(processed);
        setStats((s) => ({ ...s, wins: processed.filter((m) => m.result === "W").length, losses: processed.filter((m) => m.result === "L").length }));
      } else {
        setMatches(mockMatches.map((m, i) => ({ id: `mock-${i}`, opp: m.opponent.split(" / ")[0], result: m.result as "W" | "L", score: m.score, event: m.event, date: m.date })));
        setStats({ wins: playerStats.wins, losses: playerStats.losses, tournaments: playerStats.tournaments, duprDelta: playerStats.duprDelta });
      }

      const { count } = await supabase.from("registrations").select("tournament_id", { count: "exact", head: true }).eq("player_id", user.id).in("status", ["registered", "checked_in"]);
      if (count && count > 0) setStats((s) => ({ ...s, tournaments: count }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: bookmarkRows } = await (supabase as any).from("tournament_bookmarks").select("id, tournament:tournaments!tournament_id(id, name, city, state, event_date, director_id, entry_fee_cents, formats, skill_min, skill_max, venue_name, description)").eq("player_id", user.id).order("created_at", { ascending: false }).limit(10);
      if (bookmarkRows && bookmarkRows.length > 0) {
        setSaved(bookmarkRows.map((b: { id: string; tournament: unknown }) => {
          const t = b.tournament as { id: string; name: string; city: string; state: string; event_date: string; director_id?: string | null; entry_fee_cents?: number | null; formats?: string[]; skill_min?: number | null; skill_max?: number | null; venue_name?: string | null; description?: string | null } | null;
          return { id: b.id, tournamentId: t?.id ?? "", name: t?.name ?? "—", city: t?.city ?? "", state: t?.state ?? "", event_date: t?.event_date ?? "", director_id: t?.director_id, entry_fee_cents: t?.entry_fee_cents, formats: t?.formats, skill_min: t?.skill_min, skill_max: t?.skill_max, venue_name: t?.venue_name, description: t?.description };
        }));
      }

      const { data: duprRows } = await supabase.from("dupr_history").select("delta").eq("player_id", user.id).order("recorded_at", { ascending: false }).limit(5);
      if (duprRows && duprRows.length > 0) {
        const delta = duprRows.reduce((sum, r) => sum + (r.delta ?? 0), 0);
        setStats((s) => ({ ...s, duprDelta: Math.round(delta * 100) / 100 }));
      }

      setLoading(false);
    }

    load().catch(() => {
      setUpcoming(mockTournaments.slice(0, 2).map((t, i) => { const [city, state] = t.location.split(", "); return { id: t.id, registration_id: `mock-reg-${i}`, name: t.name, city: city ?? "", state: state ?? "", event_date: t.dateISO, status: "registered" }; }));
      setMatches(mockMatches.map((m, i) => ({ id: `mock-${i}`, opp: m.opponent.split(" / ")[0], result: m.result as "W" | "L", score: m.score, event: m.event, date: m.date })));
      setStats({ wins: playerStats.wins, losses: playerStats.losses, tournaments: playerStats.tournaments, duprDelta: playerStats.duprDelta });
      setLoading(false);
    });
  }, []);

  const firstName = profile?.full_name?.split(" ")[0]?.toUpperCase() ?? "PLAYER";
  const dupr = profile?.dupr;
  const winRate = stats.wins + stats.losses > 0 ? Math.round((stats.wins / (stats.wins + stats.losses)) * 100) : 0;

  // ── Sidebar content ──────────────────────────────────────────────────────────
  const renderSidebar = () => (
    <>
      <div className="px-5 py-5 border-b border-border flex-shrink-0">
        <Link href="/" className="flex items-center gap-2">
          <Lightning size={18} weight="fill" className="text-primary" />
          <span className="font-display tracking-wider text-sm">DreamBreakerPB</span>
        </Link>
        <div className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground mt-1">PLAYER PORTAL</div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <div className="font-mono text-[9px] tracking-widest text-muted-foreground px-3 mb-2">OVERVIEW</div>
        <button onClick={() => { setNavSection("dashboard"); setMobileSidebarOpen(false); }}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${navSection === "dashboard" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
          <Gauge size={16} weight={navSection === "dashboard" ? "fill" : "regular"} />
          Dashboard
        </button>

        <div className="font-mono text-[9px] tracking-widest text-muted-foreground px-3 mt-4 mb-2">MY GAME</div>
        {([
          { id: "events" as NavSection, icon: Calendar, label: "My Events", badge: upcoming.filter((e) => e.status === "held").length },
          { id: "matches" as NavSection, icon: Trophy, label: "Match History", badge: 0 },
          { id: "saved" as NavSection, icon: BookmarkSimple, label: "Saved", badge: saved.length },
        ]).map(({ id, icon: Icon, label, badge }) => (
          <button key={id} onClick={() => { setNavSection(id); setMobileSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${navSection === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
            <Icon size={16} weight={navSection === id ? "fill" : "regular"} />
            {label}
            {badge > 0 && <span className={`ml-auto text-[10px] font-mono px-1.5 rounded-full ${navSection === id ? "bg-white/20 text-white" : "bg-amber-400/20 text-amber-400"}`}>{badge}</span>}
          </button>
        ))}

        <div className="font-mono text-[9px] tracking-widest text-muted-foreground px-3 mt-4 mb-2">COMMUNICATIONS</div>
        <button onClick={() => { setNavSection("messages"); setMobileSidebarOpen(false); }}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${navSection === "messages" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
          <ChatCircleDots size={16} weight={navSection === "messages" ? "fill" : "regular"} />
          Messages
          {messagingUnread > 0 && <span className={`ml-auto text-[10px] font-mono px-1.5 rounded-full ${navSection === "messages" ? "bg-white/20 text-white" : "bg-primary/10 text-primary"}`}>{messagingUnread}</span>}
        </button>
        <button onClick={() => { setNavSection("matchmaking"); setMobileSidebarOpen(false); }}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${navSection === "matchmaking" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
          <SlidersHorizontal size={16} weight={navSection === "matchmaking" ? "fill" : "regular"} />
          Match Settings
        </button>
      </nav>

      <div className="border-t border-border px-3 py-3 space-y-0.5 flex-shrink-0">
        <button onClick={() => { setNavSection("settings"); setMobileSidebarOpen(false); }}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${navSection === "settings" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
          <Gear size={16} /> Settings
        </button>
        <Link href="/tournaments">
          <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <Ticket size={16} /> Find Tournament
          </button>
        </Link>
        <Link href="/matchmaking">
          <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <Users size={16} /> Find Partner
          </button>
        </Link>
        <Link href="/auth">
          <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <SignOut size={16} /> Log out
          </button>
        </Link>
        <div className="flex items-center gap-3 px-3 py-2.5 mt-1 border-t border-border">
          <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
            <span className="font-display text-sm text-primary">{firstName[0]}</span>
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{profile?.full_name ?? "Player"}</div>
            <div className="text-[10px] text-muted-foreground">{dupr ? `DUPR ${dupr}` : profile?.skill_level ?? "Player"}</div>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
    <div className="flex h-screen bg-background overflow-hidden">

      {/* ── Desktop sidebar ── */}
      <aside className="hidden lg:flex flex-col w-64 border-r border-border bg-card flex-shrink-0">
        {renderSidebar()}
      </aside>

      {/* ── Mobile sidebar overlay ── */}
      {mobileSidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" onClick={() => setMobileSidebarOpen(false)} />
          <aside className="relative z-10 flex flex-col w-72 bg-card border-r border-border">
            {renderSidebar()}
          </aside>
        </div>
      )}

      {/* ── Main ── */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top bar */}
        <header className="flex-shrink-0 border-b border-border bg-card/80 backdrop-blur-sm px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileSidebarOpen(true)} className="lg:hidden h-8 w-8 rounded-lg border border-border flex items-center justify-center hover:bg-secondary transition-colors">
              <List size={16} weight="bold" />
            </button>
            <div className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground hidden sm:block">/ PLAYER DASHBOARD</div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/tournaments">
              <button className="hidden sm:flex h-8 px-4 rounded-full border border-border hover:bg-secondary text-xs font-display tracking-wider transition-colors items-center gap-1.5">
                <Ticket size={13} /> FIND TOURNAMENT
              </button>
            </Link>
            <Link href="/matchmaking">
              <button className="h-8 px-4 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-display tracking-wider transition-colors flex items-center gap-1.5">
                <Users size={13} weight="bold" /> FIND PARTNER
              </button>
            </Link>
            {currentUserId && <NotificationBell userId={currentUserId} />}
            <Link href="/profile">
              <button className="h-8 w-8 rounded-full border border-border flex items-center justify-center hover:bg-secondary transition-colors">
                <UserCircle size={18} />
              </button>
            </Link>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-8 space-y-6">

          {/* ── Dashboard overview ── */}
          {navSection === "dashboard" && (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-3xl sm:text-4xl tracking-wide">
                  WELCOME BACK, <span className="text-primary">{firstName}</span>
                </h1>
                <p className="text-muted-foreground text-sm mt-1">
                  {dupr ? `DUPR ${dupr}` : profile?.skill_level?.replace("-", " – ") ?? "Complete your profile to set your rating"}
                  {stats.tournaments > 0 ? ` · ${stats.tournaments} tournament${stats.tournaments > 1 ? "s" : ""} this season` : ""}
                </p>
              </div>

              {/* Stat cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "WIN RATE", value: winRate > 0 ? `${winRate}%` : "—", sub: stats.wins + stats.losses > 0 ? `${stats.wins}W – ${stats.losses}L` : "No matches yet", icon: Trophy },
                  { label: dupr ? "DUPR RATING" : "SKILL LEVEL", value: dupr ?? profile?.skill_level?.replace("-", " – ") ?? "—", sub: stats.duprDelta !== 0 ? `${stats.duprDelta > 0 ? "↑ +" : "↓ "}${Math.abs(stats.duprDelta)} this month` : dupr ? "No recent change" : "Self-rated", icon: TrendUp },
                  { label: "TOURNAMENTS", value: stats.tournaments > 0 ? stats.tournaments : "—", sub: stats.tournaments > 0 ? "this season" : "Register for your first", icon: Medal },
                  { label: "RATING", value: dupr ? dupr : profile?.skill_level ?? "—", sub: dupr ? "DUPR verified" : "Self-rated level", icon: Star },
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
                    <button onClick={() => setNavSection("matches")} className="text-xs text-primary hover:underline font-mono">VIEW ALL</button>
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

                {/* Upcoming events */}
                <div className="border border-border rounded-2xl bg-card overflow-hidden">
                  <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                    <div className="font-display tracking-[0.15em]">UPCOMING</div>
                    <button onClick={() => setNavSection("events")} className="text-xs text-primary hover:underline font-mono">VIEW ALL</button>
                  </div>
                  {upcoming.length === 0 ? (
                    <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                      <Calendar size={24} weight="duotone" className="mx-auto mb-2 text-primary" />
                      No upcoming events.
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {upcoming.slice(0, 3).map((e) => {
                        const isHeld = e.status === "held";
                        return (
                          <Link key={e.id} href={`/tournaments/${e.id}`} className="px-5 py-4 flex items-start gap-3 hover:bg-secondary/40 transition-colors block">
                            <Calendar size={16} weight="bold" className={`mt-0.5 flex-shrink-0 ${isHeld ? "text-amber-500" : "text-primary"}`} />
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-semibold truncate">{e.name}</div>
                              <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1"><MapPin size={11} /> {e.city}, {e.state}</div>
                              <div className={`text-[10px] font-mono mt-1 ${isHeld ? "text-amber-500" : "text-primary"}`}>{formatDate(e.event_date)} · {e.status.replace(/_/g, " ").toUpperCase()}</div>
                            </div>
                            <ArrowRight size={14} className="text-muted-foreground flex-shrink-0 mt-0.5" />
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── My Events ── */}
          {navSection === "events" && (
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-xl tracking-wide">MY EVENTS</h2>
                <p className="text-sm text-muted-foreground">Your registrations and holds</p>
              </div>
              <div className="border border-border rounded-2xl bg-card overflow-hidden">
                {upcoming.length === 0 ? (
                  <div className="px-6 py-16 text-center">
                    <Calendar size={36} weight="duotone" className="mx-auto mb-3 text-primary" />
                    <p className="font-display tracking-wide text-muted-foreground">NO UPCOMING EVENTS</p>
                    <Link href="/tournaments">
                      <button className="mt-4 h-10 px-6 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-display tracking-wider transition-colors">
                        FIND TOURNAMENTS
                      </button>
                    </Link>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {upcoming.map((e) => {
                      const isHeld = e.status === "held";
                      const holdExpiry = e.hold_expires_at ? new Date(e.hold_expires_at) : null;
                      const holdActive = holdExpiry && holdExpiry.getTime() > now;
                      return (
                        <div key={e.id} className="px-6 py-5 space-y-3">
                          {/* Event info row */}
                          <Link href={`/tournaments/${e.id}`} className="flex items-start gap-4 hover:opacity-80 transition-opacity block">
                            <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isHeld ? "bg-amber-400/10" : "bg-primary/10"}`}>
                              <Calendar size={18} weight="bold" className={isHeld ? "text-amber-500" : "text-primary"} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold">{e.name}</div>
                              <div className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5"><MapPin size={12} /> {e.city}, {e.state}</div>
                              <div className="flex items-center gap-3 mt-1.5">
                                <span className="text-[10px] font-mono text-muted-foreground">{formatDate(e.event_date)}</span>
                                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${isHeld ? "bg-amber-400/10 text-amber-500" : "bg-primary/10 text-primary"}`}>{e.status.replace(/_/g, " ").toUpperCase()}</span>
                              </div>
                            </div>
                            <ArrowRight size={16} className="text-muted-foreground flex-shrink-0 mt-1" />
                          </Link>

                          {/* Hold expiry bar */}
                          {isHeld && holdActive && (
                            <div className="flex items-center gap-2 ml-14">
                              <Clock size={13} className="text-amber-500 flex-shrink-0" />
                              <span className="text-xs font-mono text-amber-500">
                                Hold expires {holdExpiry!.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                              </span>
                              <Link href={`/tournaments/${e.id}`} className="ml-auto">
                                <button className="h-7 px-4 rounded-full bg-primary text-primary-foreground font-display tracking-[0.15em] text-[10px] flex items-center gap-1 hover:bg-primary/90 transition-colors">
                                  <Lightning size={11} weight="fill" /> COMPLETE
                                </button>
                              </Link>
                            </div>
                          )}

                          {/* Quick actions */}
                          <div className="flex items-center gap-2 ml-14 flex-wrap">
                            <Link href={`/tournaments/${e.id}`}>
                              <button className="h-8 px-4 rounded-full border border-border text-xs font-mono tracking-wide hover:bg-secondary/60 transition-colors flex items-center gap-1.5">
                                <Ticket size={13} /> VIEW DETAILS
                              </button>
                            </Link>
                            {e.director_id && (
                              <button
                                onClick={() => { setDmDirectorId(e.director_id!); setNavSection("messages"); }}
                                className="h-8 px-4 rounded-full border border-border text-xs font-mono tracking-wide hover:bg-secondary/60 transition-colors flex items-center gap-1.5"
                              >
                                <ChatCircleDots size={13} /> MESSAGE DIRECTOR
                              </button>
                            )}
                            <button
                              onClick={() => setCancelTarget(e)}
                              className="h-8 px-4 rounded-full border border-destructive/50 text-destructive text-xs font-mono tracking-wide hover:bg-destructive/10 transition-colors flex items-center gap-1.5 ml-auto"
                            >
                              <X size={13} weight="bold" /> CANCEL
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Match history ── */}
          {navSection === "matches" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-display text-xl tracking-wide">MATCH HISTORY</h2>
                  <p className="text-sm text-muted-foreground">{stats.wins}W – {stats.losses}L · {winRate > 0 ? `${winRate}% win rate` : "No matches yet"}</p>
                </div>
              </div>
              <div className="border border-border rounded-2xl bg-card overflow-hidden">
                {matches.length === 0 ? (
                  <div className="px-6 py-16 text-center">
                    <Trophy size={36} weight="duotone" className="mx-auto mb-3 text-primary" />
                    <p className="font-display tracking-wide text-muted-foreground">NO MATCHES YET</p>
                    <Link href="/tournaments">
                      <button className="mt-4 h-10 px-6 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-display tracking-wider transition-colors">
                        FIND TOURNAMENTS
                      </button>
                    </Link>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {matches.map((m) => (
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
            </div>
          )}

          {/* ── Saved tournaments ── */}
          {navSection === "saved" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-display text-xl tracking-wide">SAVED TOURNAMENTS</h2>
                  <p className="text-sm text-muted-foreground">{saved.length} bookmarked</p>
                </div>
                <Link href="/tournaments">
                  <button className="h-9 px-5 rounded-full border border-border hover:bg-secondary text-sm font-display tracking-wider transition-colors">
                    BROWSE ALL
                  </button>
                </Link>
              </div>
              <div className="border border-border rounded-2xl bg-card overflow-hidden">
                {saved.length === 0 ? (
                  <div className="px-6 py-16 text-center">
                    <BookmarkSimple size={36} weight="duotone" className="mx-auto mb-3 text-primary" />
                    <p className="font-display tracking-wide text-muted-foreground">NO SAVED TOURNAMENTS</p>
                    <Link href="/tournaments">
                      <button className="mt-4 h-10 px-6 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-display tracking-wider transition-colors">
                        BROWSE TOURNAMENTS
                      </button>
                    </Link>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {saved.map((t) => (
                      <div key={t.id} className="px-6 py-5 space-y-3">
                        {/* Info row */}
                        <Link href={`/tournaments/${t.tournamentId}`} className="flex items-start gap-4 hover:opacity-80 transition-opacity block">
                          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <BookmarkSimple size={18} weight="fill" className="text-primary" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold">{t.name}</div>
                            <div className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5"><MapPin size={12} /> {t.city}, {t.state}</div>
                            {t.event_date && <div className="text-[10px] font-mono mt-1 text-muted-foreground">{formatDate(t.event_date)}</div>}
                          </div>
                          <ArrowRight size={16} className="text-muted-foreground flex-shrink-0 mt-1" />
                        </Link>

                        {/* Quick actions */}
                        <div className="flex items-center gap-2 ml-14 flex-wrap">
                          <Link href={`/tournaments/${t.tournamentId}`}>
                            <button className="h-8 px-4 rounded-full border border-border text-xs font-mono tracking-wide hover:bg-secondary/60 transition-colors flex items-center gap-1.5">
                              <Ticket size={13} /> VIEW DETAILS
                            </button>
                          </Link>
                          <button
                            onClick={() => { setRegisterTarget(t); setRegisterFormat((t.formats ?? [])[0] ?? ""); setWaiverAccepted(false); setRegisterDone(false); }}
                            className="h-8 px-4 rounded-full bg-primary/10 text-primary border border-primary/30 text-xs font-mono tracking-wide hover:bg-primary/20 transition-colors flex items-center gap-1.5"
                          >
                            <Lightning size={13} weight="fill" /> REGISTER
                          </button>
                          {t.director_id && (
                            <button
                              onClick={() => { setDmDirectorId(t.director_id!); setNavSection("messages"); }}
                              className="h-8 px-4 rounded-full border border-border text-xs font-mono tracking-wide hover:bg-secondary/60 transition-colors flex items-center gap-1.5"
                            >
                              <ChatCircleDots size={13} /> MESSAGE DIRECTOR
                            </button>
                          )}
                          <button
                            disabled={removingBookmarkId === t.id}
                            onClick={async () => {
                              setRemovingBookmarkId(t.id);
                              const supabase = createClient();
                              await supabase.from("tournament_bookmarks").delete().eq("id", t.id);
                              setSaved((prev) => prev.filter((s) => s.id !== t.id));
                              setRemovingBookmarkId(null);
                            }}
                            className="h-8 px-4 rounded-full border border-destructive/50 text-destructive text-xs font-mono tracking-wide hover:bg-destructive/10 transition-colors flex items-center gap-1.5 ml-auto disabled:opacity-50"
                          >
                            {removingBookmarkId === t.id
                              ? <span className="h-3 w-3 rounded-full border-2 border-destructive border-t-transparent animate-spin" />
                              : <BookmarkSimple size={13} />}
                            REMOVE
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Messages ── */}
          {navSection === "messages" && currentUserId && (
            <div className="space-y-4">
              <MessagingPanel
                currentUserId={currentUserId}
                allUsers={allUsers}
                onUnreadChange={setMessagingUnread}
                matches={mmMatches}
                likesCount={mmLikes}
                initialRecipientId={dmDirectorId ?? undefined}
              />
            </div>
          )}

          {/* ── Matchmaking Settings ── */}
          {navSection === "matchmaking" && (
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-xl tracking-wide">MATCH SETTINGS</h2>
                <p className="text-sm text-muted-foreground">Control your discoverability and partner preferences</p>
              </div>
              <MatchSettingsPanel
                myDupr={profile?.dupr ?? null}
                myAvail={null}
                myLocation={profile?.location_city ? `${profile.location_city}, ${profile.location_state ?? ""}`.trim().replace(/,$/, "") : null}
                myStyle={null}
                myBio={null}
              />
            </div>
          )}

          {/* ── Settings ── */}
          {navSection === "settings" && (
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-xl tracking-wide">SETTINGS</h2>
                <p className="text-sm text-muted-foreground">Manage your account and preferences</p>
              </div>
              <div className="border border-border rounded-2xl bg-card p-6 space-y-4">
                <h3 className="font-semibold">Account</h3>
                <Link href="/profile">
                  <button className="w-full sm:w-auto h-10 px-6 rounded-full border border-border hover:bg-secondary text-sm font-display tracking-wider transition-colors flex items-center gap-2">
                    <UserCircle size={15} /> EDIT PROFILE
                  </button>
                </Link>
              </div>
              <div className="border border-border rounded-2xl bg-card p-6 space-y-4">
                <h3 className="font-semibold">Links</h3>
                <div className="flex flex-wrap gap-3">
                  <Link href="/tournaments"><button className="h-10 px-5 rounded-full border border-border hover:bg-secondary text-sm font-display tracking-wider transition-colors">TOURNAMENTS</button></Link>
                  <Link href="/matchmaking"><button className="h-10 px-5 rounded-full border border-border hover:bg-secondary text-sm font-display tracking-wider transition-colors">MATCHMAKING</button></Link>
                  <Link href="/holds"><button className="h-10 px-5 rounded-full border border-border hover:bg-secondary text-sm font-display tracking-wider transition-colors">MY HOLDS</button></Link>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>

      {/* ── Mobile bottom nav ── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-card border-t border-border flex items-center justify-around px-1 py-2">
        {([
          { id: "dashboard" as NavSection, icon: Gauge, label: "Home" },
          { id: "events" as NavSection, icon: Calendar, label: "Events" },
          { id: "matches" as NavSection, icon: Trophy, label: "Matches" },
          { id: "messages" as NavSection, icon: ChatCircleDots, label: "Msgs" },
          { id: "saved" as NavSection, icon: BookmarkSimple, label: "Saved" },
        ]).map(({ id, icon: Icon, label }) => (
          <button key={id} onClick={() => setNavSection(id)}
            className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl transition-colors min-w-0 flex-1 ${navSection === id ? "text-primary" : "text-muted-foreground"}`}>
            <div className="relative">
              <Icon size={20} weight={navSection === id ? "fill" : "regular"} />
              {id === "messages" && messagingUnread > 0 && (
                <span className="absolute -top-1 -right-1.5 h-4 min-w-4 rounded-full bg-primary text-[9px] font-mono text-primary-foreground flex items-center justify-center px-0.5">
                  {messagingUnread > 9 ? "9+" : messagingUnread}
                </span>
              )}
              {id === "events" && upcoming.filter((e) => e.status === "held").length > 0 && (
                <span className="absolute -top-1 -right-1.5 h-4 min-w-4 rounded-full bg-amber-400 text-[9px] font-mono text-black flex items-center justify-center px-0.5">
                  {upcoming.filter((e) => e.status === "held").length}
                </span>
              )}
            </div>
            <span className="text-[9px] font-mono tracking-wide truncate">{label.toUpperCase()}</span>
          </button>
        ))}
      </nav>

    </div>

    {/* ── Cancel Registration Lightbox ───────────────────────────────────── */}
    {cancelTarget && (() => {
      const eventDate = new Date(cancelTarget.event_date);
      const daysUntil = Math.ceil((eventDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      const feeCents = cancelTarget.entry_fee_cents ?? 0;
      const refundTier = daysUntil >= 7 ? "full" : daysUntil >= 3 ? "half" : "none";
      const refundLabel = refundTier === "full"
        ? feeCents > 0 ? `Full refund — $${(feeCents / 100).toFixed(2)}` : "Full refund eligible"
        : refundTier === "half"
          ? feeCents > 0 ? `50% refund — $${(feeCents / 200).toFixed(2)}` : "50% refund eligible"
          : "No refund (within 72 hours)";
      const refundColor = refundTier === "full" ? "text-emerald-400" : refundTier === "half" ? "text-amber-400" : "text-destructive";
      const policy = cancelTarget.cancellation_policy ?? "Full refund if cancelled 7 or more days before the event. 50% refund if cancelled 3–6 days before. No refund within 72 hours of the event start.";

      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-card border border-border rounded-3xl overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-border">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] tracking-[0.25em] text-destructive mb-1">CANCEL REGISTRATION</p>
                  <h2 className="font-display text-xl tracking-wide leading-tight">{cancelTarget.name}</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">{cancelTarget.city}, {cancelTarget.state} · {formatDate(cancelTarget.event_date)}</p>
                </div>
                <button onClick={() => setCancelTarget(null)} className="h-8 w-8 rounded-full border border-border flex items-center justify-center hover:bg-secondary flex-shrink-0 transition-colors">
                  <X size={14} weight="bold" />
                </button>
              </div>
            </div>

            {/* Consequences */}
            <div className="px-6 py-5 space-y-4">
              {/* Refund status */}
              <div className="flex items-center justify-between p-4 rounded-2xl bg-secondary/60 border border-white/10">
                <div>
                  <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground mb-0.5">REFUND STATUS</p>
                  <p className={`font-semibold text-sm ${refundColor}`}>{refundLabel}</p>
                </div>
                <div className={`text-xs font-mono px-3 py-1.5 rounded-full border ${refundTier === "full" ? "border-emerald-400/40 text-emerald-400 bg-emerald-400/10" : refundTier === "half" ? "border-amber-400/40 text-amber-400 bg-amber-400/10" : "border-destructive/40 text-destructive bg-destructive/10"}`}>
                  {daysUntil > 0 ? `${daysUntil}d away` : "Today"}
                </div>
              </div>

              {/* What happens */}
              <div>
                <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground mb-3">WHAT HAPPENS IF YOU CANCEL</p>
                <ul className="space-y-2.5">
                  {[
                    { icon: "⚠️", text: "Your registered spot will be immediately released to the waitlist." },
                    { icon: "🔒", text: "You may not be able to re-register if the event fills up." },
                    { icon: "💳", text: refundLabel },
                    { icon: "📊", text: "No impact to your DUPR rating for this event." },
                  ].map(({ icon, text }) => (
                    <li key={text} className="flex items-start gap-3 text-sm text-muted-foreground">
                      <span className="text-base leading-tight flex-shrink-0">{icon}</span>
                      <span className="leading-snug">{text}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Policy */}
              <details className="group">
                <summary className="cursor-pointer font-mono text-[10px] tracking-[0.2em] text-muted-foreground hover:text-foreground transition-colors list-none flex items-center gap-1.5">
                  <span className="group-open:rotate-90 transition-transform inline-block">▶</span> CANCELLATION POLICY
                </summary>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed border-l-2 border-border pl-3">{policy}</p>
              </details>
            </div>

            {/* CTAs */}
            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={() => setCancelTarget(null)}
                className="flex-1 h-9 rounded-full border border-white/20 text-sm font-display tracking-[0.15em] hover:bg-secondary transition-colors"
              >
                KEEP REGISTRATION
              </button>
              <button
                disabled={cancelConfirming}
                onClick={async () => {
                  if (cancelTarget.registration_id.startsWith("mock-")) {
                    setUpcoming((prev) => prev.filter((e) => e.id !== cancelTarget.id));
                    setCancelTarget(null);
                    return;
                  }
                  setCancelConfirming(true);
                  const supabase = createClient();
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  await (supabase as any).from("registrations").update({ status: "cancelled" }).eq("id", cancelTarget.registration_id);
                  setUpcoming((prev) => prev.filter((e) => e.id !== cancelTarget.id));
                  setCancelTarget(null);
                  setCancelConfirming(false);
                }}
                className="flex-1 h-9 rounded-full bg-destructive text-white text-sm font-display tracking-[0.15em] border border-white/20 hover:bg-destructive/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {cancelConfirming ? <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" /> : null}
                CONFIRM CANCEL
              </button>
            </div>
          </div>
        </div>
      );
    })()}

    {/* ── Register Lightbox ──────────────────────────────────────────────── */}
    {registerTarget && (() => {
      const t = registerTarget;
      const fee = t.entry_fee_cents ?? 0;
      const fmts = t.formats ?? [];
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-card border border-border rounded-3xl overflow-hidden shadow-2xl">

            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-border">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] tracking-[0.25em] text-primary mb-1">REGISTER</p>
                  <h2 className="font-display text-xl tracking-wide leading-tight">{t.name}</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {t.venue_name ? `${t.venue_name} · ` : ""}{t.city}, {t.state} · {formatDate(t.event_date)}
                  </p>
                </div>
                <button onClick={() => setRegisterTarget(null)} className="h-8 w-8 rounded-full border border-border flex items-center justify-center hover:bg-secondary flex-shrink-0 transition-colors">
                  <X size={14} weight="bold" />
                </button>
              </div>
            </div>

            {registerDone ? (
              /* ── Success state ── */
              <div className="px-6 py-10 text-center space-y-4">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <Trophy size={32} weight="duotone" className="text-primary" />
                </div>
                <div>
                  <p className="font-display text-xl tracking-wide">YOU&apos;RE IN!</p>
                  <p className="text-sm text-muted-foreground mt-1">Registration confirmed for {t.name}.</p>
                </div>
                <button
                  onClick={() => { setRegisterTarget(null); setNavSection("events"); }}
                  className="h-9 px-8 rounded-full bg-primary text-primary-foreground font-display tracking-[0.15em] text-sm border border-white/20 hover:bg-primary/90 transition-colors"
                >
                  VIEW MY EVENTS
                </button>
              </div>
            ) : (
              <>
                <div className="px-6 py-5 space-y-5">
                  {/* Tournament summary */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-secondary/60 border border-white/10 rounded-2xl px-4 py-3">
                      <p className="font-mono text-[9px] tracking-[0.2em] text-muted-foreground mb-0.5">ENTRY FEE</p>
                      <p className="font-display text-lg tracking-wide">{fee > 0 ? `$${(fee / 100).toFixed(2)}` : "FREE"}</p>
                    </div>
                    <div className="bg-secondary/60 border border-white/10 rounded-2xl px-4 py-3">
                      <p className="font-mono text-[9px] tracking-[0.2em] text-muted-foreground mb-0.5">SKILL LEVEL</p>
                      <p className="font-display text-lg tracking-wide">
                        {t.skill_min || t.skill_max ? `${t.skill_min ?? "?"} – ${t.skill_max ?? "?"}` : "Open"}
                      </p>
                    </div>
                  </div>

                  {/* Format selector */}
                  {fmts.length > 0 && (
                    <div>
                      <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground mb-2">SELECT FORMAT</p>
                      <div className="flex flex-wrap gap-2">
                        {fmts.map((f) => (
                          <button
                            key={f}
                            onClick={() => setRegisterFormat(f)}
                            className={`h-8 px-4 rounded-full text-xs font-mono border transition-colors ${registerFormat === f ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}
                          >
                            {f}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Description snippet */}
                  {t.description && (
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{t.description}</p>
                  )}

                  {/* Waiver */}
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <div
                      onClick={() => setWaiverAccepted((v) => !v)}
                      className={`mt-0.5 h-5 w-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${waiverAccepted ? "bg-primary border-primary" : "border-border group-hover:border-primary/50"}`}
                    >
                      {waiverAccepted && <span className="text-primary-foreground text-[10px] font-bold">✓</span>}
                    </div>
                    <span className="text-xs text-muted-foreground leading-relaxed">
                      I agree to the tournament waiver and release of liability. I understand the cancellation policy applies to this registration.
                    </span>
                  </label>
                </div>

                {/* CTAs */}
                <div className="px-6 pb-6 flex gap-3">
                  <button
                    onClick={() => setRegisterTarget(null)}
                    className="flex-1 h-9 rounded-full border border-white/20 text-sm font-display tracking-[0.15em] hover:bg-secondary transition-colors"
                  >
                    CANCEL
                  </button>
                  <button
                    disabled={!waiverAccepted || registering || (fmts.length > 0 && !registerFormat)}
                    onClick={async () => {
                      if (!currentUserId || !waiverAccepted) return;
                      setRegistering(true);
                      const supabase = createClient();
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const { data: reg } = await (supabase as any)
                        .from("registrations")
                        .insert({
                          tournament_id: t.tournamentId,
                          player_id: currentUserId,
                          status: "registered",
                          waiver_accepted_at: new Date().toISOString(),
                        })
                        .select("id")
                        .single();
                      setRegistering(false);
                      if (reg) {
                        setRegisterDone(true);
                        // Optimistically add to upcoming events and remove from saved
                        setUpcoming((prev) => [
                          { id: t.tournamentId, registration_id: reg.id, name: t.name, city: t.city, state: t.state, event_date: t.event_date, status: "registered", director_id: t.director_id },
                          ...prev,
                        ]);
                        setSaved((prev) => prev.filter((s) => s.tournamentId !== t.tournamentId));
                      }
                    }}
                    className="flex-1 h-9 rounded-full bg-primary text-primary-foreground text-sm font-display tracking-[0.15em] border border-white/20 hover:bg-primary/90 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {registering ? <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" /> : null}
                    {fee > 0 ? `PAY $${(fee / 100).toFixed(2)} & REGISTER` : "COMPLETE REGISTRATION"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      );
    })()}
    </>
  );
}
