"use client";

import { useState, use, useEffect } from "react";
import Link from "next/link";
import {
  MapPin, Calendar, Trophy, Lightning, ShieldCheck, Clock,
  Medal, CurrencyDollar, HandGrabbing, CaretDown, ChatCircle,
  NavigationArrow, CheckCircle, ChatCircleDots, X, ArrowSquareOut,
} from "@phosphor-icons/react";
import { MessagingPanel } from "@/components/messaging/panel";
import type { UserProfile as MessagingUserProfile } from "@/components/messaging/panel";
import { toast } from "sonner";
import { PageShell } from "@/components/layout/page-shell";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { HoldMySpotDialog, type HoldTournament } from "@/components/shared/hold-my-spot-dialog";
import { DreamBreakerInsights } from "@/components/shared/dreambreaker-insights";
import { BookmarkButton } from "@/components/shared/bookmark-button";
import { ShareButton } from "@/components/shared/share-button";
import { createClient } from "@/lib/supabase/client";
import { computeInsight, buildMockInsightInput, type InsightResult } from "@/lib/insights";
import { tournaments as mockTournaments, matchPartners } from "@/data/mock-data";
import { getUserId } from "@/lib/dev-user";

// ── FAQ data ──────────────────────────────────────────────────────────────────
const FAQ_ITEMS = [
  { q: "Can I change my partner after registering?", a: "Yes — partner substitutions are allowed up to 72 hours before first match. Contact the director to make the change." },
  { q: "What happens if my partner drops out?", a: "You may find a replacement partner or request a refund up to 7 days before the event date. Inside 7 days, hold fees are non-refundable." },
  { q: "Is there a waitlist if the tournament fills?", a: "Yes. Once the draw is full you'll be placed on a waitlist automatically. We'll notify you if a spot opens." },
  { q: "What rating verification is required?", a: "DUPR rating is verified at registration. Self-rated players are welcome but may be re-rated post-event if scores warrant it." },
  { q: "Are there age restrictions?", a: "This is an open-age event. Juniors under 18 require a guardian signature on the waiver." },
  { q: "When does the bracket release?", a: "Brackets are published 48 hours before play begins. You'll receive an email and in-app notification." },
];

// ── Countdown hook ─────────────────────────────────────────────────────────────
function useCountdown(targetDate: Date | null) {
  const calc = () => {
    if (!targetDate) return null;
    const diff = targetDate.getTime() - Date.now();
    if (diff <= 0) return null;
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return { d, h, m, s };
  };
  const [time, setTime] = useState(calc);
  useEffect(() => {
    const id = setInterval(() => setTime(calc()), 1000);
    return () => clearInterval(id);
  });
  return time;
}

function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="font-mono font-bold text-2xl leading-none tabular-nums text-primary">
        {String(value).padStart(2, "0")}
      </span>
      <span className="font-mono text-[9px] tracking-[0.2em] text-muted-foreground mt-0.5">{label}</span>
    </div>
  );
}

// ── Attendee type ─────────────────────────────────────────────────────────────
type Attendee = {
  id: string;
  name: string;
  avatar: string | null;
  ratingLabel: string;
  kind: "going" | "holding" | "interested";
  isFriend?: boolean;
};

// ── Division type ──────────────────────────────────────────────────────────────
type Division = {
  id: string;
  name: string;
  format: string;
  gender_category: string | null;
  draw_size: number;
  spots_filled: number;
  entry_fee_cents: number | null;
};

type DivisionReg = { status: string; hold_expires_at: string | null; division_id: string | null };

function divisionLabel(d: Division) {
  return d.name || d.format.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Types ──────────────────────────────────────────────────────────────────────
type LiveTournament = {
  id: string;
  name: string;
  city: string;
  state: string;
  venue_name: string | null;
  venue_address: string | null;
  cover_img_url: string | null;
  format: string;
  bracket_type: string;
  skill_min: number | null;
  skill_max: number | null;
  draw_size: number;
  spots_filled: number;
  entry_fee_cents: number;
  hold_fee_cents: number;
  hold_duration_hours: number;
  prize_pool_cents: number | null;
  event_date: string;
  registration_opens_at: string | null;
  registration_closes_at: string | null;
  created_at: string;
  status: string;
  description: string | null;
  rules: string | null;
  director: {
    id: string;
    full_name: string;
    director_events_hosted: number;
    director_rating: number | null;
  } | null;
};

// Normalise mock tournament to the same display shape
function mockToLive(t: typeof mockTournaments[0]) {
  const [city, state] = t.location.split(", ");
  return {
    id: t.id,
    name: t.name,
    city: city ?? t.location,
    state: state ?? "",
    venue_name: t.venue,
    venue_address: null,
    cover_img_url: t.img,
    format: t.format.split("·")[0].trim(),
    bracket_type: "single_elim",
    skill_min: null,
    skill_max: null,
    draw_size: t.spots,
    spots_filled: t.filled,
    entry_fee_cents: t.entryFee * 100,
    hold_fee_cents: t.holdFee * 100,
    hold_duration_hours: 72,
    prize_pool_cents: parseInt(t.prize.replace(/[^0-9]/g, ""), 10) * 100,
    event_date: t.dateISO,
    registration_opens_at: null,
    registration_closes_at: new Date(Date.now() + 3 * 86400000).toISOString(),
    created_at: new Date(Date.now() - 14 * 86400000).toISOString(),
    status: t.status.toLowerCase().replace(/ /g, "_"),
    description: null,
    rules: null,
    director: { id: "mock", full_name: t.director, director_events_hosted: 8, director_rating: 4.6 },
  } satisfies LiveTournament;
}

// ── Page ───────────────────────────────────────────────────────────────────────
// ── DivisionCard ──────────────────────────────────────────────────────────────
function DivisionHoldExpiry({ expiry }: { expiry: Date | null }) {
  const calc = () => {
    if (!expiry) return null;
    const diff = expiry.getTime() - Date.now();
    if (diff <= 0) return null;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return { h, m };
  };
  const [t, setT] = useState(calc);
  useEffect(() => { const id = setInterval(() => setT(calc()), 30000); return () => clearInterval(id); });
  if (!expiry) return null;
  if (!t) return <span className="text-destructive text-[10px] font-mono">EXPIRED</span>;
  return <span className="text-amber-500 text-[10px] font-mono">{t.h}h {t.m}m left</span>;
}

function DivisionCard({
  div, divFee, holdFee, isHeld, isRegistered, holdExpire, completing, cancelling, onHold, onComplete, onCancel,
}: {
  div: Division; divFee: number; holdFee: number;
  isHeld: boolean; isRegistered: boolean; holdExpire: Date | null;
  completing: boolean; cancelling: boolean;
  onHold: () => void; onComplete: () => void; onCancel: () => void;
}) {
  const pct = Math.round((div.spots_filled / div.draw_size) * 100);
  const fee = divFee / 100;
  const hold = holdFee / 100;

  return (
    <div className={`rounded-xl border p-4 space-y-3 transition-colors ${isRegistered ? "border-primary/40 bg-primary/5" : isHeld ? "border-amber-500/40 bg-amber-500/5" : "border-border bg-secondary/20"}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-display tracking-wide text-base">{divisionLabel(div)}</div>
          <div className="text-[10px] font-mono text-muted-foreground mt-0.5">{div.draw_size - div.spots_filled} spots left · ${fee} entry</div>
        </div>
        {isRegistered && <CheckCircle size={18} weight="fill" className="text-primary flex-shrink-0 mt-0.5" />}
        {isHeld && <DivisionHoldExpiry expiry={holdExpire} />}
      </div>

      <div className="h-1 w-full bg-secondary rounded-full overflow-hidden">
        <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>

      {isRegistered ? (
        <div className="text-[10px] font-mono text-primary tracking-widest">✓ REGISTERED</div>
      ) : isHeld ? (
        <div className="flex gap-2">
          <button onClick={onComplete} disabled={completing} className="flex-1 h-9 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-[0.15em] text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50">
            <Lightning size={12} weight="fill" /> {completing ? "CONFIRMING…" : `CONFIRM · $${fee - hold}`}
          </button>
          <button onClick={onCancel} disabled={cancelling} className="h-9 px-3 rounded-full border border-border hover:bg-destructive/10 hover:border-destructive/40 hover:text-destructive font-mono text-[10px] transition-colors disabled:opacity-50">
            {cancelling ? "…" : "CANCEL"}
          </button>
        </div>
      ) : (
        <button onClick={onHold} className="w-full h-9 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-[0.15em] text-xs flex items-center justify-center gap-1.5 transition-colors">
          <HandGrabbing size={13} weight="fill" /> HOLD MY SPOT · ${hold}
        </button>
      )}
    </div>
  );
}

export default function TournamentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [tournament, setTournament] = useState<LiveTournament | null>(null);
  const [insight, setInsight] = useState<InsightResult | null>(null);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [holdOpen, setHoldOpen] = useState(false);
  const [activeDivision, setActiveDivision] = useState<Division | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  // keyed by division_id (or "legacy" for null division_id)
  const [myRegs, setMyRegs] = useState<Map<string, DivisionReg>>(new Map());
  const [spotsFilled, setSpotsFilled] = useState(0);
  const [completing, setCompleting] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<MessagingUserProfile[]>([]);
  const [messagingTarget, setMessagingTarget] = useState<{ id: string; name: string } | null>(null);

  // Legacy single-format helpers
  const legacyReg = myRegs.get("legacy") ?? null;

  // Fetch tournament + compute insights
  useEffect(() => {
    const supabase = createClient();

    async function load() {
      // Tournament + director profile
      const { data: live } = await supabase
        .from("tournaments")
        .select(`
          id, name, city, state, venue_name, venue_address, cover_img_url,
          format, bracket_type, skill_min, skill_max, draw_size, spots_filled,
          entry_fee_cents, hold_fee_cents, hold_duration_hours, prize_pool_cents,
          event_date, registration_opens_at, registration_closes_at,
          created_at, status, description, rules,
          director:profiles!director_id (
            id, full_name, director_events_hosted, director_rating
          )
        `)
        .eq("id", id)
        .single();

      let t: LiveTournament;
      let regDates: string[] = [];

      if (live) {
        t = live as unknown as LiveTournament;

        // Registration timestamps for velocity signal
        const { data: regs } = await supabase
          .from("registrations")
          .select("created_at")
          .eq("tournament_id", id)
          .in("status", ["held", "registered", "checked_in"])
          .order("created_at", { ascending: false });

        regDates = (regs ?? []).map((r) => r.created_at);
      } else {
        // Fall back to mock
        const mock = mockTournaments.find((x) => x.id === id) ?? mockTournaments[0];
        t = mockToLive(mock);
        // Build synthetic registration dates from mock data
        const mockInput = buildMockInsightInput(mock);
        regDates = mockInput.recentRegistrationDates;
      }

      setTournament(t);
      setSpotsFilled(t.spots_filled);

      // Load divisions
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: divRows } = await (supabase as any)
        .from("divisions")
        .select("id, name, format, gender_category, draw_size, spots_filled, entry_fee_cents")
        .eq("tournament_id", id)
        .order("created_at", { ascending: true });
      if (divRows && divRows.length > 0) setDivisions(divRows as Division[]);

      // Check current user's registrations (all divisions)
      const userId = await getUserId();
      if (userId) {
        setCurrentUserId(userId);
        const { data: userProfiles } = await supabase.from("profiles").select("id,full_name,role,avatar_url").order("full_name");
        setAllUsers((userProfiles ?? []) as MessagingUserProfile[]);

        const { data: userRegs } = await supabase
          .from("registrations")
          .select("status, hold_expires_at, division_id")
          .eq("tournament_id", id)
          .eq("player_id", userId)
          .in("status", ["held", "registered", "checked_in"]);
        if (userRegs && userRegs.length > 0) {
          const map = new Map<string, DivisionReg>();
          for (const r of userRegs) {
            map.set(r.division_id ?? "legacy", r as DivisionReg);
          }
          setMyRegs(map);
        }
      }

      // Fetch attendees: registered/held players + bookmarks
      const { data: regRows } = await supabase
        .from("registrations")
        .select(`
          status,
          player:profiles!player_id (
            id, full_name, avatar_url, dupr, skill_level
          )
        `)
        .eq("tournament_id", id)
        .in("status", ["registered", "checked_in", "held"])
        .limit(20);

      const { data: bookmarkRows } = await supabase
        .from("tournament_bookmarks")
        .select(`
          player:profiles!player_id (
            id, full_name, avatar_url, dupr, skill_level
          )
        `)
        .eq("tournament_id", id)
        .limit(20);

      const seen = new Set<string>();
      const liveAttendees: Attendee[] = [];

      for (const row of (regRows ?? [])) {
        const p = row.player as { id: string; full_name: string; avatar_url: string | null; dupr: number | null; skill_level: string | null } | null;
        if (!p || seen.has(p.id)) continue;
        seen.add(p.id);
        liveAttendees.push({
          id: p.id,
          name: p.full_name,
          avatar: p.avatar_url,
          ratingLabel: p.dupr ? `${p.dupr} DUPR` : p.skill_level ? `${p.skill_level.replace("-", "–")} Self` : "—",
          kind: (row.status === "held" ? "holding" : "going") as Attendee["kind"],
        });
      }

      for (const row of (bookmarkRows ?? [])) {
        const p = row.player as { id: string; full_name: string; avatar_url: string | null; dupr: number | null; skill_level: string | null } | null;
        if (!p || seen.has(p.id)) continue;
        seen.add(p.id);
        liveAttendees.push({
          id: p.id,
          name: p.full_name,
          avatar: p.avatar_url,
          ratingLabel: p.dupr ? `${p.dupr} DUPR` : p.skill_level ? `${p.skill_level.replace("-", "–")} Self` : "—",
          kind: "interested",
        });
      }

      if (liveAttendees.length > 0) {
        setAttendees(liveAttendees);
      } else {
        // Mock fallback: first 4 matchPartners as attendees
        setAttendees(
          matchPartners.slice(0, 5).map((p, i) => ({
            id: p.id,
            name: p.name,
            avatar: p.img,
            ratingLabel: `${p.dupr} DUPR`,
            kind: (["going", "going", "holding", "interested", "going"] as Attendee["kind"][])[i],
            isFriend: i < 2,
          })),
        );
      }

      // Only show insights banner for open/filling events
      const showInsights = ["open", "filling_fast"].includes(t.status);
      if (showInsights) {
        setInsight(
          computeInsight({
            drawSize: t.draw_size,
            spotsFilled: t.spots_filled,
            eventDate: t.event_date,
            registrationClosesAt: t.registration_closes_at,
            registrationOpensAt: t.registration_opens_at,
            createdAt: t.created_at,
            status: t.status,
            city: t.city,
            state: t.state,
            directorEventsHosted: t.director?.director_events_hosted ?? 0,
            directorRating: t.director?.director_rating ?? null,
            recentRegistrationDates: regDates,
          }),
        );
      }
    }

    load().catch(() => {
      // Network failure — show mock data so the page never hangs
      const mock = mockTournaments.find((x) => x.id === id) ?? mockTournaments[0];
      setTournament(mockToLive(mock));
      const mockInput = buildMockInsightInput(mock);
      setInsight(computeInsight(mockInput));
      setAttendees(
        matchPartners.slice(0, 5).map((p, i) => ({
          id: p.id,
          name: p.name,
          avatar: p.img,
          ratingLabel: `${p.dupr} DUPR`,
          kind: (["going", "going", "holding", "interested", "going"] as Attendee["kind"][])[i],
          isFriend: i < 2,
        })),
      );
    });
  }, [id]);

  // Countdown to registration close
  const regCloseDate = tournament?.registration_closes_at
    ? new Date(tournament.registration_closes_at)
    : null;
  const countdown = useCountdown(regCloseDate);

  const holdExpireDate = legacyReg?.hold_expires_at
    ? new Date(legacyReg.hold_expires_at)
    : null;
  const holdCountdown = useCountdown(holdExpireDate);

  const completeRegistration = async (divisionId: string | null) => {
    const key = divisionId ?? "legacy";
    setCompleting(key);
    try {
      const userId = await getUserId();
      if (!userId) { toast.error("Not signed in."); return; }
      const supabase = createClient();
      let q = supabase
        .from("registrations")
        .update({ status: "registered", entry_fee_paid_cents: 0, updated_at: new Date().toISOString() })
        .eq("tournament_id", id)
        .eq("player_id", userId)
        .eq("status", "held");
      if (divisionId) q = q.eq("division_id", divisionId);
      else q = (q as typeof q).is("division_id", null);
      const { error } = await q;
      if (error) { toast.error("Could not complete registration. Please try again."); return; }
      setMyRegs((prev) => {
        const next = new Map(prev);
        const existing = next.get(key);
        if (existing) next.set(key, { ...existing, status: "registered" });
        return next;
      });
      toast.success("You're registered!", { description: "Bracket releases 48h before play. See you on the court." });
    } finally {
      setCompleting(null);
    }
  };

  const cancelHold = async (divisionId: string | null) => {
    const key = divisionId ?? "legacy";
    setCancelling(key);
    const userId = await getUserId();
    if (!userId) { setCancelling(null); return; }
    const supabase = createClient();
    let q = supabase
      .from("registrations")
      .update({ status: "withdrawn", updated_at: new Date().toISOString() })
      .eq("tournament_id", id)
      .eq("player_id", userId)
      .eq("status", "held");
    if (divisionId) q = q.eq("division_id", divisionId);
    else q = (q as typeof q).is("division_id", null);
    const { error } = await q;
    setCancelling(null);
    if (error) { toast.error("Could not cancel hold."); return; }
    setMyRegs((prev) => { const next = new Map(prev); next.delete(key); return next; });
    setSpotsFilled((n) => Math.max(0, n - 1));
    toast.info("Hold cancelled. Your spot has been released.");
  };

  const handleRegister = () =>
    toast.success("Registration complete!", {
      description: `You're in for ${tournament?.name ?? "this tournament"}. Bracket releases 48h before play.`,
    });

  const contactDirector = () =>
    toast.info(`Message sent to ${tournament?.director?.full_name ?? "the director"}`, {
      description: "They'll reply in the app within 24 hours.",
    });

  // Loading skeleton
  if (!tournament) {
    return (
      <PageShell>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 space-y-6 animate-pulse">
          <div className="h-12 bg-secondary rounded-xl w-2/3" />
          <div className="h-6 bg-secondary rounded w-1/3" />
          <div className="h-64 bg-secondary rounded-2xl" />
        </div>
      </PageShell>
    );
  }

  const t = tournament;
  const pct = Math.round((spotsFilled / t.draw_size) * 100);
  const prizeDisplay = t.prize_pool_cents
    ? `$${(t.prize_pool_cents / 100).toLocaleString()}`
    : "—";
  const entryFee = t.entry_fee_cents / 100;
  const holdFee = t.hold_fee_cents / 100;
  const dateDisplay = new Date(t.event_date).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
  const levelLabel = t.skill_min && t.skill_max
    ? `${t.skill_min} – ${t.skill_max}`
    : t.skill_min
    ? `${t.skill_min}+`
    : "Open";
  const formatDisplay = t.format.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const statusDisplay = t.status === "filling_fast" ? "Filling Fast"
    : t.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const mapsQuery = encodeURIComponent(
    [t.venue_name, t.venue_address, t.city, t.state].filter(Boolean).join(", "),
  );
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${mapsQuery}`;

  const holdTournament: HoldTournament = {
    id: t.id,
    name: t.name,
    city: t.city,
    state: t.state,
    event_date: t.event_date,
    format: t.format,
    entry_fee_cents: t.entry_fee_cents,
    hold_fee_cents: t.hold_fee_cents,
    hold_duration_hours: t.hold_duration_hours,
  };

  return (
    <PageShell>
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="relative border-b border-border overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={t.cover_img_url ?? "https://images.unsplash.com/photo-1737477004595-e9b659bb44ca?w=1200&q=80"}
            alt=""
            className="h-full w-full object-cover opacity-50 dark:opacity-60"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-background/30" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
          <Link href="/tournaments" className="font-mono text-[11px] tracking-[0.3em] text-primary mb-4 inline-block" data-testid="back-to-tournaments">
            ← BACK TO CIRCUIT
          </Link>
          <div className="flex flex-wrap gap-2 mb-4">
            <span className="px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-mono tracking-widest font-bold">
              {statusDisplay.toUpperCase()}
            </span>
            <span className="px-3 py-1.5 rounded-full bg-secondary text-foreground text-[10px] font-mono tracking-widest">
              {levelLabel}
            </span>
            <span className="px-3 py-1.5 rounded-full bg-secondary text-foreground text-[10px] font-mono tracking-widest">
              {formatDisplay.toUpperCase()}
            </span>
          </div>
          <h1 className="font-display text-5xl sm:text-7xl lg:text-8xl tracking-wide leading-[0.9] max-w-4xl">
            {t.name.toUpperCase()}
          </h1>
          <div className="flex flex-wrap gap-6 mt-6 text-sm">
            <div className="flex items-center gap-2">
              <MapPin size={16} weight="bold" className="text-primary" />
              <span>
                {t.venue_name ? <><span className="font-semibold">{t.venue_name}</span>, </> : null}
                {t.city}, {t.state}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar size={16} weight="bold" className="text-primary" />
              <span>{dateDisplay}</span>
            </div>
            {t.prize_pool_cents && (
              <div className="flex items-center gap-2">
                <Trophy size={16} weight="fill" className="text-primary" />
                <span className="font-mono">{prizeDisplay} prize pool</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── DreamBreaker Insights banner ─────────────────────────── */}
      {insight && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
          <DreamBreakerInsights insight={insight} />
        </div>
      )}

      {/* ── Main content grid ─────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Tabs + map */}
        <div className="lg:col-span-2 space-y-6">
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="rounded-full p-1 bg-secondary flex flex-wrap h-auto gap-1 mb-6">
              <TabsTrigger value="overview" data-testid="tab-overview" className="rounded-full px-4">Overview</TabsTrigger>
              <TabsTrigger value="schedule" data-testid="tab-schedule" className="rounded-full px-4">Schedule</TabsTrigger>
              <TabsTrigger value="prize" data-testid="tab-prize" className="rounded-full px-4">Prize</TabsTrigger>
              <TabsTrigger value="rules" data-testid="tab-rules" className="rounded-full px-4">Rules</TabsTrigger>
              <TabsTrigger value="faq" data-testid="tab-faq" className="rounded-full px-4">FAQ</TabsTrigger>
            </TabsList>

            {/* Overview */}
            <TabsContent value="overview" className="space-y-6">
              <div className="border border-border rounded-2xl p-6 bg-card">
                <h3 className="font-display text-2xl tracking-wide mb-3">ABOUT THIS EVENT</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {t.description ?? `The ${t.name} is part of the Compete Pickleball Pro Circuit. ${formatDisplay} with players from across the region competing for ${prizeDisplay} in cash + sponsor prizes. Pool play seeds into a knockout bracket. Live scoring on every court.`}
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "ENTRY FEE", value: `$${entryFee}`, onClick: undefined },
                  { label: "FORMAT", value: formatDisplay, onClick: undefined },
                  { label: "DRAW SIZE", value: String(t.draw_size), onClick: undefined },
                  { label: "DIRECTOR", value: t.director?.full_name?.split(" ")[0] ?? "—", onClick: contactDirector },
                ].map((s) =>
                  s.onClick ? (
                    <button
                      key={s.label}
                      onClick={s.onClick}
                      className="border border-border rounded-xl p-4 text-left hover:border-primary hover:bg-primary/5 transition-all group"
                      data-testid="contact-director-btn"
                    >
                      <div className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground">{s.label}</div>
                      <div className="font-display text-2xl tracking-wide mt-1">{s.value}</div>
                      <div className="flex items-center gap-1 text-[10px] font-mono text-primary mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <ChatCircle size={11} weight="fill" /> CONTACT
                      </div>
                    </button>
                  ) : (
                    <div key={s.label} className="border border-border rounded-xl p-4">
                      <div className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground">{s.label}</div>
                      <div className="font-display text-2xl tracking-wide mt-1">{s.value}</div>
                    </div>
                  ),
                )}
              </div>
            </TabsContent>

            {/* Schedule */}
            <TabsContent value="schedule">
              <div className="border border-border rounded-2xl divide-y divide-border bg-card">
                {["Check-in 7:00 AM", "Pool Play 8:00 AM – 12:00 PM", "Lunch 12:00 PM", "Knockouts 1:00 PM – 5:00 PM", "Finals 5:30 PM", "Awards 7:00 PM"].map((row, i) => (
                  <div key={i} className="flex items-center gap-4 p-4">
                    <div className="font-mono text-xs text-primary w-8">{String(i + 1).padStart(2, "0")}</div>
                    <div className="font-semibold">{row}</div>
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* Prize */}
            <TabsContent value="prize">
              <div className="border border-border rounded-2xl bg-card overflow-hidden">
                {[
                  { p: "1st Place", a: Math.round(entryFee * t.draw_size * 0.45), icon: Trophy },
                  { p: "2nd Place", a: Math.round(entryFee * t.draw_size * 0.25), icon: Medal },
                  { p: "3rd Place", a: Math.round(entryFee * t.draw_size * 0.15), icon: Medal },
                  { p: "4th Place", a: Math.round(entryFee * t.draw_size * 0.08), icon: Medal },
                ].map((row, i) => (
                  <div key={i} className="flex items-center justify-between p-5 border-b border-border last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/15 text-primary flex items-center justify-center">
                        <row.icon size={18} weight="fill" />
                      </div>
                      <span className="font-display text-xl tracking-wide">{row.p}</span>
                    </div>
                    <span className="font-mono font-bold text-primary text-lg">${row.a.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* Rules */}
            <TabsContent value="rules">
              <div className="border border-border rounded-2xl p-6 bg-card space-y-3 text-sm text-muted-foreground">
                {t.rules
                  ? t.rules.split("\n").map((line, i) => <p key={i}>{line}</p>)
                  : <>
                    <p>· USAPA official rules. Rally scoring to 11, win by 2.</p>
                    <p>· Players must check in 30 minutes prior to first match.</p>
                    <p>· DUPR rating verified at registration. Sandbagging results in disqualification.</p>
                    <p>· Hold My Spot fees are refundable up to 7 days before play.</p>
                    <p>· Tournament director&apos;s decisions are final.</p>
                  </>
                }
              </div>
            </TabsContent>

            {/* FAQ */}
            <TabsContent value="faq" className="space-y-3">
              <div className="border border-border rounded-2xl bg-card overflow-hidden divide-y divide-border">
                {FAQ_ITEMS.map((item, i) => (
                  <div key={i}>
                    <button
                      onClick={() => setOpenFaq(openFaq === i ? null : i)}
                      className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-secondary/40 transition-colors"
                      data-testid={`faq-item-${i}`}
                    >
                      <span className="font-semibold text-sm pr-4">{item.q}</span>
                      <CaretDown
                        size={16}
                        weight="bold"
                        className={`text-primary flex-shrink-0 transition-transform duration-200 ${openFaq === i ? "rotate-180" : ""}`}
                      />
                    </button>
                    {openFaq === i && (
                      <div className="px-5 pb-4 text-sm text-muted-foreground leading-relaxed border-t border-border/50 pt-3">
                        {item.a}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="border border-dashed border-border rounded-2xl p-6 text-center space-y-3">
                <ChatCircle size={28} weight="duotone" className="mx-auto text-primary" />
                <div className="font-display text-xl tracking-wide">STILL HAVE QUESTIONS?</div>
                <p className="text-sm text-muted-foreground">
                  Can&apos;t find the answer you&apos;re looking for? Reach out to {t.director?.full_name ?? "the director"} directly.
                </p>
                <button
                  onClick={contactDirector}
                  className="h-11 px-6 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-[0.2em] text-sm flex items-center gap-2 mx-auto transition-colors"
                  data-testid="faq-contact-btn"
                >
                  <ChatCircle size={15} weight="fill" /> CONTACT DIRECTOR
                </button>
              </div>
            </TabsContent>
          </Tabs>

          {/* Map card */}
          <div className="border border-border rounded-2xl bg-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <MapPin size={16} weight="fill" className="text-primary flex-shrink-0" />
                <div className="min-w-0">
                  <div className="font-display tracking-[0.15em] text-sm truncate">
                    {t.venue_name ?? `${t.city}, ${t.state}`}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {[t.venue_address, t.city, t.state].filter(Boolean).join(", ")}
                  </div>
                </div>
              </div>
              <a
                href={directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="h-9 px-4 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-[0.15em] text-[11px] flex items-center gap-1.5 transition-colors flex-shrink-0"
                data-testid="get-directions-btn"
              >
                <NavigationArrow size={13} weight="fill" /> DIRECTIONS
              </a>
            </div>
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="block relative h-44 bg-secondary overflow-hidden group">
              <iframe
                title="venue-map"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                src={`https://maps.google.com/maps?q=${mapsQuery}&output=embed&z=15`}
                className="w-full h-full border-0 pointer-events-none"
              />
              <div className="absolute inset-0 bg-transparent group-hover:bg-primary/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                <span className="bg-background/80 backdrop-blur px-4 py-2 rounded-full font-display text-sm tracking-wide">OPEN IN MAPS</span>
              </div>
            </a>
          </div>
        </div>

        {/* ── Sidebar ───────────────────────────────────────────────── */}
        <aside className="lg:sticky lg:top-24 self-start space-y-4">
          <div className="border border-border rounded-2xl bg-card p-6 space-y-5">
            {/* Registration countdown */}
            {countdown && (
              <div className="border border-primary/30 rounded-xl px-4 py-3 bg-primary/5">
                <div className="font-mono text-[9px] tracking-[0.3em] text-muted-foreground mb-2 text-center">REGISTRATION CLOSES IN</div>
                <div className="flex items-center justify-center gap-3">
                  <CountdownUnit value={countdown.d} label="DAYS" />
                  <span className="font-mono text-primary text-xl font-bold leading-none mb-2">:</span>
                  <CountdownUnit value={countdown.h} label="HRS" />
                  <span className="font-mono text-primary text-xl font-bold leading-none mb-2">:</span>
                  <CountdownUnit value={countdown.m} label="MIN" />
                  <span className="font-mono text-primary text-xl font-bold leading-none mb-2">:</span>
                  <CountdownUnit value={countdown.s} label="SEC" />
                </div>
              </div>
            )}

            {/* Spots */}
            <div>
              <div className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground mb-1">SPOTS</div>
              <div className="flex items-end justify-between">
                <div className="font-display text-5xl tracking-wide">{t.draw_size - spotsFilled}</div>
                <div className="text-sm text-muted-foreground">of {t.draw_size} left</div>
              </div>
              <div className="h-2 w-full bg-secondary rounded-full mt-3 overflow-hidden">
                <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
              </div>
            </div>

            {/* Fees */}
            <div className="space-y-2 pt-2 border-t border-border">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Entry fee</span>
                <span className="font-mono font-bold">${entryFee}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Hold My Spot fee</span>
                <span className="font-mono font-bold text-primary">${holdFee}</span>
              </div>
            </div>

            {/* CTAs — per-division if divisions exist, legacy single-format otherwise */}
            <div className="space-y-3">
              {divisions.length > 0 ? (
                <>
                  <div className="font-mono text-[9px] tracking-[0.3em] text-muted-foreground">EVENTS</div>
                  {divisions.map((div) => {
                    const key = div.id;
                    const reg = myRegs.get(key);
                    const divFee = div.entry_fee_cents ?? t.entry_fee_cents;
                    const isHeld = reg?.status === "held";
                    const isRegistered = reg?.status === "registered" || reg?.status === "checked_in";
                    const divHoldExpire = reg?.hold_expires_at ? new Date(reg.hold_expires_at) : null;

                    return (
                      <DivisionCard
                        key={div.id}
                        div={div}
                        divFee={divFee}
                        holdFee={t.hold_fee_cents}
                        isHeld={isHeld}
                        isRegistered={isRegistered}
                        holdExpire={divHoldExpire}
                        completing={completing === key}
                        cancelling={cancelling === key}
                        onHold={() => { setActiveDivision(div); setHoldOpen(true); }}
                        onComplete={() => completeRegistration(div.id)}
                        onCancel={() => cancelHold(div.id)}
                      />
                    );
                  })}
                </>
              ) : (
                /* Legacy single-format CTA */
                legacyReg?.status === "held" ? (
                  <>
                    <div className="border border-amber-500/40 rounded-xl px-4 py-3 bg-amber-500/5">
                      <div className="font-mono text-[9px] tracking-[0.3em] text-amber-500 mb-2 text-center">
                        {holdCountdown ? "HOLD EXPIRES IN" : "HOLD EXPIRED"}
                      </div>
                      {holdCountdown ? (
                        <div className="flex items-center justify-center gap-2">
                          <CountdownUnit value={holdCountdown.d} label="DAYS" />
                          <span className="font-mono text-amber-500 text-lg font-bold leading-none mb-2">:</span>
                          <CountdownUnit value={holdCountdown.h} label="HRS" />
                          <span className="font-mono text-amber-500 text-lg font-bold leading-none mb-2">:</span>
                          <CountdownUnit value={holdCountdown.m} label="MIN" />
                          <span className="font-mono text-amber-500 text-lg font-bold leading-none mb-2">:</span>
                          <CountdownUnit value={holdCountdown.s} label="SEC" />
                        </div>
                      ) : (
                        <p className="text-center text-xs text-destructive">Your hold has expired.</p>
                      )}
                    </div>
                    {holdCountdown && (
                      <button onClick={() => completeRegistration(null)} disabled={completing !== null} className="w-full h-12 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-[0.2em] flex items-center justify-center gap-2 transition-colors disabled:opacity-50" data-testid="complete-registration-btn">
                        <Lightning size={16} weight="fill" /> {completing ? "CONFIRMING…" : `COMPLETE · $${entryFee - holdFee}`}
                      </button>
                    )}
                    <button onClick={() => cancelHold(null)} className="w-full h-10 rounded-full border border-border hover:bg-destructive/10 hover:border-destructive/40 hover:text-destructive font-mono text-xs tracking-widest transition-colors" data-testid="cancel-hold-btn">
                      CANCEL HOLD
                    </button>
                  </>
                ) : legacyReg?.status === "registered" || legacyReg?.status === "checked_in" ? (
                  <div className="space-y-2">
                    <div className="w-full h-12 rounded-full bg-primary/10 border border-primary/30 font-display tracking-[0.15em] flex items-center justify-center gap-2 text-primary text-sm" data-testid="registered-state">
                      <CheckCircle size={17} weight="fill" /> YOU&apos;RE REGISTERED
                    </div>
                    <p className="text-center text-xs text-muted-foreground">Bracket drops 48h before play · {new Date(t.event_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                  </div>
                ) : (
                  <>
                    <button onClick={() => { setActiveDivision(null); setHoldOpen(true); }} className="w-full h-12 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-[0.2em] flex items-center justify-center gap-2 transition-colors" data-testid="hold-spot-trigger-btn">
                      <HandGrabbing size={17} weight="fill" /> HOLD MY SPOT
                    </button>
                    <button onClick={handleRegister} className="w-full h-12 rounded-full border border-border hover:bg-secondary/60 font-display tracking-[0.2em] flex items-center justify-center gap-2 transition-colors" data-testid="register-now-btn">
                      <Lightning size={16} weight="fill" className="text-primary" /> REGISTER NOW · ${entryFee}
                    </button>
                  </>
                )
              )}
            </div>

            {/* Trust badges */}
            <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border text-center">
              <div className="text-[10px] font-mono text-muted-foreground"><ShieldCheck size={14} weight="bold" className="mx-auto mb-1 text-primary" /> REFUNDABLE</div>
              <div className="text-[10px] font-mono text-muted-foreground"><Clock size={14} weight="bold" className="mx-auto mb-1 text-primary" /> {t.hold_duration_hours}H HOLD</div>
              <div className="text-[10px] font-mono text-muted-foreground"><CurrencyDollar size={14} weight="bold" className="mx-auto mb-1 text-primary" /> SECURE</div>
            </div>

            {/* Bookmark + Share */}
            <div className="flex gap-2 pt-1">
              <BookmarkButton tournamentId={t.id} className="flex-1 w-auto rounded-xl" />
              <ShareButton
                title={t.name}
                text={`Check out ${t.name} on Compete Pickleball — ${t.city}, ${t.state}`}
                url={typeof window !== "undefined" ? window.location.href : `/tournaments/${t.id}`}
                className="flex-1"
              />
            </div>

            <Link href="/matchmaking">
              <button className="w-full h-11 rounded-full border border-dashed border-border font-semibold text-sm hover:bg-secondary/60 transition-colors" data-testid="find-partner-link">
                Need a partner? Find one →
              </button>
            </Link>
          </div>

          {/* Who's Going */}
          {attendees.length > 0 && (
            <div className="border border-border rounded-2xl bg-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-xl tracking-wide">WHO&apos;S GOING</h3>
                <div className="text-[10px] font-mono text-muted-foreground">
                  {attendees.filter((a) => a.isFriend).length > 0 && (
                    <span className="text-primary mr-2">
                      {attendees.filter((a) => a.isFriend).length} friend{attendees.filter((a) => a.isFriend).length > 1 ? "s" : ""}
                    </span>
                  )}
                  {attendees.filter((a) => a.kind === "interested").length > 0 && (
                    <span>{attendees.filter((a) => a.kind !== "interested").length > 0 ? "· " : ""}{attendees.filter((a) => a.kind === "interested").length} interested</span>
                  )}
                </div>
              </div>

              <div className="space-y-2" data-testid="whos-going-list">
                {attendees.slice(0, 6).map((a) => (
                  <div key={a.id} className="flex items-center gap-3 group rounded-xl px-2 py-1.5 hover:bg-secondary/40 transition-colors -mx-2">
                    {/* Avatar */}
                    <Link href={`/profile/${a.id}`} className="relative flex-shrink-0">
                      {a.avatar ? (
                        <img src={a.avatar} alt="" className="h-9 w-9 rounded-full object-cover" />
                      ) : (
                        <div className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center font-display text-sm">
                          {a.name.charAt(0)}
                        </div>
                      )}
                      {a.isFriend && (
                        <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-primary border-2 border-card" />
                      )}
                    </Link>

                    {/* Name + rating */}
                    <div className="flex-1 min-w-0">
                      <Link href={`/profile/${a.id}`} className="block">
                        <div className="text-sm font-semibold leading-tight truncate hover:text-primary transition-colors">
                          {a.name.split(" ")[0]} {a.name.split(" ").slice(1).map((n) => n.charAt(0) + ".").join(" ")}
                        </div>
                      </Link>
                      <div className="text-[11px] text-muted-foreground">{a.ratingLabel}</div>
                    </div>

                    {/* Status badge */}
                    <span
                      className={`text-[10px] font-mono font-bold tracking-widest px-2 py-0.5 rounded-full flex-shrink-0 ${
                        a.kind === "going"
                          ? "bg-primary/15 text-primary"
                          : a.kind === "holding"
                          ? "bg-secondary text-muted-foreground"
                          : "bg-secondary/60 text-muted-foreground/70"
                      }`}
                    >
                      {a.kind === "going" ? "GOING" : a.kind === "holding" ? "HELD" : "INTERESTED"}
                    </span>

                    {/* Action buttons — show on hover or always for mobile */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Link href={`/profile/${a.id}`}>
                        <button className="h-7 w-7 rounded-full border border-border hover:bg-secondary flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100" title="View profile">
                          <ArrowSquareOut size={12} />
                        </button>
                      </Link>
                      {currentUserId && currentUserId !== a.id && (
                        <button
                          onClick={() => setMessagingTarget({ id: a.id, name: a.name })}
                          className="h-7 w-7 rounded-full border border-border hover:bg-primary/10 hover:border-primary/40 hover:text-primary flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
                          title="Send message"
                        >
                          <ChatCircleDots size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {attendees.length > 6 && (
                <div className="text-[11px] font-mono text-muted-foreground text-center pt-1">
                  +{attendees.length - 6} more attending
                </div>
              )}
            </div>
          )}
        </aside>
      </section>

      {/* ── Messaging overlay ── */}
      {messagingTarget && currentUserId && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ height: "min(620px, 90vh)" }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
              <span className="font-display tracking-wider text-sm">
                MESSAGE {messagingTarget.name.split(" ")[0].toUpperCase()}
              </span>
              <button
                onClick={() => setMessagingTarget(null)}
                className="h-7 w-7 rounded-full border border-border hover:bg-secondary flex items-center justify-center transition-colors"
              >
                <X size={13} weight="bold" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <MessagingPanel
                currentUserId={currentUserId}
                allUsers={allUsers}
                initialRecipientId={messagingTarget.id}
                compact
              />
            </div>
          </div>
        </div>
      )}

      <HoldMySpotDialog
        open={holdOpen}
        onOpenChange={setHoldOpen}
        tournament={{
          ...holdTournament,
          division_id: activeDivision?.id ?? null,
          division_name: activeDivision ? divisionLabel(activeDivision) : null,
          entry_fee_cents: activeDivision?.entry_fee_cents ?? holdTournament.entry_fee_cents,
        }}
        onSuccess={(expiresAt, divisionId) => {
          const key = divisionId ?? "legacy";
          setMyRegs((prev) => new Map(prev).set(key, { status: "held", hold_expires_at: expiresAt, division_id: divisionId ?? null }));
          setSpotsFilled((n) => n + 1);
        }}
      />
    </PageShell>
  );
}
