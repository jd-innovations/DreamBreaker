"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Lightning, X, Plus, Users, CurrencyDollar, Trophy, MapPin, Calendar,
  PencilSimple, Eye, Warning, CheckCircle, Clock, ArrowRight, Gauge,
  ChartBar, ClipboardText, Gear, SignOut, CaretDown, CaretUp,
  TrendUp, TrendDown, Ticket, Star, Funnel, Bell, MagnifyingGlass,
  ArrowSquareOut, Broadcast,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { getUserId } from "@/lib/dev-user";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Tournament {
  id: string;
  name: string;
  city: string;
  state: string;
  venue_name: string;
  event_date: string;
  format: string;
  draw_size: number;
  spots_filled: number;
  entry_fee_cents: number;
  hold_fee_cents: number;
  prize_pool_cents: number | null;
  status: string;
  created_at: string;
  registered: number;
  held: number;
  revenue_cents: number;
}

interface Registration {
  id: string;
  player_id: string;
  status: string;
  division_id: string | null;
  created_at: string;
  profiles: { full_name: string | null; dupr_rating: number | null } | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft", pending_approval: "Pending", approved: "Approved",
  published: "Live", cancelled: "Cancelled",
};
const STATUS_DOT: Record<string, string> = {
  draft: "bg-muted-foreground", pending_approval: "bg-amber-400",
  approved: "bg-blue-400", published: "bg-primary", cancelled: "bg-red-400",
};

const FORMAT_OPTIONS = [
  { label: "Men's Doubles",   format: "doubles",       gender: "mens",  short: "MD" },
  { label: "Women's Doubles", format: "doubles",       gender: "womens",short: "WD" },
  { label: "Mixed Doubles",   format: "mixed_doubles", gender: "mixed", short: "MXD" },
  { label: "Singles",         format: "singles",       gender: "open",  short: "SGL" },
  { label: "Juniors",         format: "juniors",       gender: "open",  short: "JR" },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmt(cents: number) { return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`; }

// ── Mini bar chart ────────────────────────────────────────────────────────────

function MiniBarChart({ data, color = "var(--primary)" }: { data: number[]; color?: string }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex items-end gap-0.5 h-12">
      {data.map((v, i) => (
        <div key={i} className="flex-1 rounded-sm transition-all" style={{ height: `${(v / max) * 100}%`, backgroundColor: color, opacity: i === data.length - 1 ? 1 : 0.4 + (i / data.length) * 0.4 }} />
      ))}
    </div>
  );
}

// ── Funnel bar ────────────────────────────────────────────────────────────────

function FunnelBar({ label, value, total, pct }: { label: string; value: number; total: number; pct: number }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono text-foreground">{value.toLocaleString()} · <span className="text-muted-foreground">{pct}%</span></span>
      </div>
      <div className="h-5 w-full bg-secondary rounded overflow-hidden">
        <div className="h-full rounded transition-all duration-500" style={{ width: `${(value / total) * 100}%`, backgroundColor: "var(--primary)" }} />
      </div>
    </div>
  );
}

// ── Create Dialog ─────────────────────────────────────────────────────────────

function CreateDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (t: Tournament) => void }) {
  const [loading, setLoading] = useState(false);
  const [selectedFormats, setSelectedFormats] = useState<Set<string>>(new Set(["doubles/mens"]));

  const toggleFormat = (key: string) => {
    setSelectedFormats((prev) => {
      const next = new Set(prev);
      if (next.has(key)) { if (next.size === 1) return prev; next.delete(key); } else { next.add(key); }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    try {
      const userId = await getUserId();
      if (!userId) { toast.error("Not signed in."); return; }
      const supabase = createClient();
      const primaryKey = [...selectedFormats][0];
      const primaryFmt = FORMAT_OPTIONS.find((f) => `${f.format}/${f.gender}` === primaryKey);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const insertPayload: any = {
        director_id: userId,
        name: fd.get("name") as string,
        venue_name: fd.get("venue") as string,
        venue_address: fd.get("venue_address") as string,
        city: fd.get("city") as string,
        state: fd.get("state") as string,
        zip_code: fd.get("zip_code") as string,
        event_date: fd.get("date") as string,
        format: primaryFmt?.format ?? "doubles",
        formats: [...selectedFormats].map((k) => k.split("/")[0]),
        draw_size: parseInt(fd.get("capacity") as string, 10),
        entry_fee_cents: Math.round(parseFloat(fd.get("entry_fee") as string) * 100),
        hold_fee_cents: Math.round(parseFloat(fd.get("hold_fee") as string) * 100),
        prize_pool_cents: fd.get("prize_pool") ? Math.round(parseFloat(fd.get("prize_pool") as string) * 100) : null,
        description: (fd.get("description") as string) || null,
        status: "draft", spots_filled: 0,
      };
      const { data, error } = await supabase.from("tournaments").insert(insertPayload)
        .select("id,name,city,state,venue_name,event_date,format,draw_size,spots_filled,entry_fee_cents,hold_fee_cents,prize_pool_cents,status,created_at")
        .single();
      if (error) { toast.error("Failed to create: " + error.message); return; }
      const divisionRows = [...selectedFormats].map((key) => {
        const opt = FORMAT_OPTIONS.find((f) => `${f.format}/${f.gender}` === key)!;
        return { tournament_id: (data as { id: string }).id, name: opt.label, format: opt.format, gender_category: opt.gender, draw_size: insertPayload.draw_size, entry_fee_cents: insertPayload.entry_fee_cents, spots_filled: 0 };
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await supabase.from("divisions").insert(divisionRows as any);
      toast.success("Tournament created!", { description: `${divisionRows.length} event${divisionRows.length > 1 ? "s" : ""} added.` });
      onCreated({ ...data as Tournament, registered: 0, held: 0, revenue_cents: 0 });
      onClose();
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg border border-border rounded-2xl bg-card shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 flex-shrink-0">
          <h2 className="font-display text-3xl tracking-wide">NEW TOURNAMENT</h2>
          <button onClick={onClose} className="h-9 w-9 rounded-full border border-border flex items-center justify-center hover:bg-secondary transition-colors"><X size={16} weight="bold" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto px-6 pb-6 flex-1 min-h-0">
          <div><label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1.5">EVENT NAME</label><input name="name" required placeholder="e.g. Spring Slam Open" className="w-full h-12 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" /></div>
          <div><label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1.5">VENUE NAME</label><input name="venue" required placeholder="e.g. Lakewood Ranch Sports Complex" className="w-full h-12 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" /></div>
          <div><label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1.5">VENUE ADDRESS</label><input name="venue_address" required placeholder="123 Main St" className="w-full h-12 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1.5">CITY</label><input name="city" required placeholder="Bradenton" className="w-full h-12 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" /></div>
            <div><label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1.5">STATE</label><input name="state" required placeholder="FL" maxLength={2} className="w-full h-12 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" /></div>
            <div><label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1.5">ZIP</label><input name="zip_code" required placeholder="34202" className="w-full h-12 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" /></div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="font-mono text-[10px] tracking-widest text-muted-foreground">EVENTS / FORMATS</label>
              <span className="font-mono text-[10px] text-primary">{selectedFormats.size} SELECTED</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {FORMAT_OPTIONS.map((opt) => {
                const key = `${opt.format}/${opt.gender}`;
                const active = selectedFormats.has(key);
                return (
                  <button type="button" key={key} onClick={() => toggleFormat(key)}
                    className={`relative h-11 px-3 rounded-xl border text-left text-xs font-semibold transition-all flex items-center gap-2 ${active ? "border-primary bg-primary/10 text-foreground" : "border-border hover:border-primary/50 text-muted-foreground"}`}>
                    {active && <div className="absolute top-1.5 right-1.5 h-3.5 w-3.5 rounded-full bg-primary flex items-center justify-center"><svg width="7" height="7" viewBox="0 0 7 7" fill="none"><path d="M1 3.5l1.5 1.5 3-3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></div>}
                    <span className="font-mono text-[10px] text-primary font-bold">{opt.short}</span>
                    <span className="truncate">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div><label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1.5">EVENT DATE</label><input name="date" type="date" required className="w-full h-12 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1.5">DRAW SIZE</label><input name="capacity" type="number" required placeholder="32" min={4} className="w-full h-12 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" /></div>
            <div><label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1.5">ENTRY FEE ($)</label><input name="entry_fee" type="number" required placeholder="75" min={0} step="0.01" className="w-full h-12 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" /></div>
            <div><label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1.5">HOLD FEE ($)</label><input name="hold_fee" type="number" required placeholder="10" min={0} step="0.01" className="w-full h-12 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" /></div>
          </div>
          <div><label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1.5">PRIZE POOL ($) <span className="text-muted-foreground/60">— optional</span></label><input name="prize_pool" type="number" placeholder="2500" min={0} step="0.01" className="w-full h-12 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" /></div>
          <div><label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1.5">DESCRIPTION <span className="text-muted-foreground/60">— optional</span></label><textarea name="description" rows={3} placeholder="Tell players what makes this event special…" className="w-full rounded-xl bg-secondary border border-border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring resize-none" /></div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 h-12 rounded-full border border-border hover:bg-secondary/60 font-display tracking-[0.2em] text-sm transition-colors">CANCEL</button>
            <button type="submit" disabled={loading} className="flex-1 h-12 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-[0.2em] text-sm transition-colors disabled:opacity-50">{loading ? "CREATING…" : "CREATE DRAFT"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type NavSection = "dashboard" | "registrations" | "checkin" | "analytics" | "settings";

export default function DirectorPage() {
  const router = useRouter();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileName, setProfileName] = useState<string>("");
  const [showCreate, setShowCreate] = useState(false);
  const [navSection, setNavSection] = useState<NavSection>("dashboard");
  const [tournamentPickerOpen, setTournamentPickerOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [regsLoaded, setRegsLoaded] = useState<string | null>(null);
  const [checkinSearch, setCheckinSearch] = useState("");

  const selected = tournaments.find((t) => t.id === selectedId) ?? null;

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const userId = await getUserId();
      if (!userId) { router.push("/auth"); return; }
      const supabase = createClient();

      const { data: profile } = await supabase.from("profiles").select("full_name,role").eq("id", userId).single();
      if (profile) {
        setProfileName((profile.full_name as string | null) ?? "Director");
        if (!["director", "player_director", "admin"].includes(profile.role as string)) {
          router.push("/dashboard"); return;
        }
      }

      const { data: ts } = await supabase.from("tournaments")
        .select("id,name,city,state,venue_name,event_date,format,draw_size,spots_filled,entry_fee_cents,hold_fee_cents,prize_pool_cents,status,created_at")
        .eq("director_id", userId)
        .order("event_date", { ascending: true });

      if (!ts || ts.length === 0) { setLoading(false); return; }

      const ids = ts.map((t) => t.id);
      const { data: regs } = await supabase.from("registrations")
        .select("tournament_id,status,entry_fee_paid_cents")
        .in("tournament_id", ids);

      const regMap: Record<string, { registered: number; held: number; revenue_cents: number }> = {};
      for (const r of regs ?? []) {
        if (!regMap[r.tournament_id]) regMap[r.tournament_id] = { registered: 0, held: 0, revenue_cents: 0 };
        if (r.status === "registered") { regMap[r.tournament_id].registered++; regMap[r.tournament_id].revenue_cents += r.entry_fee_paid_cents ?? 0; }
        if (r.status === "held") regMap[r.tournament_id].held++;
      }

      const enriched = ts.map((t) => ({ ...t, registered: regMap[t.id]?.registered ?? 0, held: regMap[t.id]?.held ?? 0, revenue_cents: regMap[t.id]?.revenue_cents ?? 0 })) as Tournament[];
      setTournaments(enriched);
      setSelectedId(enriched[0]?.id ?? null);
    } finally { setLoading(false); }
  };

  const loadRegistrations = async (tid: string) => {
    if (regsLoaded === tid) return;
    const supabase = createClient();
    const { data } = await supabase.from("registrations")
      .select("id,player_id,status,division_id,created_at,profiles(full_name,dupr_rating)")
      .eq("tournament_id", tid)
      .order("created_at", { ascending: true });
    setRegistrations((data ?? []) as unknown as Registration[]);
    setRegsLoaded(tid);
  };

  const submitForApproval = async (id: string) => {
    setPublishing(id);
    const supabase = createClient();
    const { error } = await supabase.from("tournaments").update({ status: "pending_approval", submitted_for_approval_at: new Date().toISOString() }).eq("id", id);
    setPublishing(null);
    if (error) { toast.error("Failed to submit."); return; }
    setTournaments((prev) => prev.map((t) => t.id === id ? { ...t, status: "pending_approval" } : t));
    toast.success("Submitted for approval!");
  };

  const checkIn = async (regId: string) => {
    const supabase = createClient();
    const { error } = await supabase.from("registrations").update({ status: "checked_in" }).eq("id", regId);
    if (error) { toast.error("Check-in failed."); return; }
    setRegistrations((prev) => prev.map((r) => r.id === regId ? { ...r, status: "checked_in" } : r));
    toast.success("Player checked in!");
  };

  // Simulated weekly registration data (last 12 weeks)
  const weeklyData = selected
    ? (() => {
        const weeks = 12;
        const base = Math.max(1, selected.registered);
        return Array.from({ length: weeks }, (_, i) => Math.round(base * (0.3 + (i / weeks) * 0.7) * (0.7 + Math.random() * 0.6)));
      })()
    : Array(12).fill(0);

  const fillPct = selected ? Math.round((selected.registered / selected.draw_size) * 100) : 0;
  const holdPct = selected ? Math.round((selected.held / selected.draw_size) * 100) : 0;
  const totalRevenue = tournaments.reduce((s, t) => s + t.revenue_cents, 0);
  const totalRegistered = tournaments.reduce((s, t) => s + t.registered, 0);

  // Simulated funnel
  const pageViews = selected ? selected.registered * 8 + selected.held * 3 + 120 : 0;
  const funnelData = selected ? [
    { label: "Page views", value: pageViews, pct: 100 },
    { label: "Started registration", value: Math.round(pageViews * 0.34), pct: 34 },
    { label: "Added to cart", value: Math.round(pageViews * 0.19), pct: 19 },
    { label: "Completed payment", value: selected.registered, pct: Math.max(1, Math.round((selected.registered / pageViews) * 100)) },
  ] : [];

  const insights = selected ? [
    selected.held > 5 && { icon: Warning, color: "text-amber-400", title: `${selected.held} holds expiring soon`, body: `$${((selected.held * selected.hold_fee_cents) / 100).toFixed(0)} in unpaid balances. Send reminders to recover spots.`, action: "Send Reminders" },
    fillPct < 50 && { icon: TrendUp, color: "text-primary", title: "Registration momentum", body: `At current pace, ${selected.name} will fill ${fillPct}% by event day. Consider promoting on social.`, action: "View Players" },
    selected.prize_pool_cents && { icon: Trophy, color: "text-yellow-400", title: "Prize pool attracts players", body: `${fmt(selected.prize_pool_cents)} prize pool is 3.2× the platform average — highlight it in your listing.`, action: "Edit Details" },
  ].filter(Boolean) : [];

  const firstName = profileName.split(" ")[0];

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="px-5 py-5 border-b border-border">
        <Link href="/" className="flex items-center gap-2">
          <Lightning size={18} weight="fill" className="text-primary" />
          <span className="font-display tracking-wider text-sm">DreamBreakerPB</span>
        </Link>
        <div className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground mt-1">TOURNAMENT DIRECTOR</div>
      </div>

      {/* Tournament selector */}
      <div className="px-3 py-3 border-b border-border">
        <button
          onClick={() => setTournamentPickerOpen(!tournamentPickerOpen)}
          className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-secondary transition-colors"
        >
          <div className="font-mono text-[9px] tracking-widest text-muted-foreground mb-0.5">MANAGING</div>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="font-semibold text-sm truncate">{selected?.name ?? "No tournaments"}</div>
              {selected && (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[selected.status]}`} />
                  <span className="text-[10px] text-muted-foreground">{STATUS_LABELS[selected.status]} · {selected.city}</span>
                </div>
              )}
            </div>
            {tournamentPickerOpen ? <CaretUp size={12} className="flex-shrink-0 text-muted-foreground" /> : <CaretDown size={12} className="flex-shrink-0 text-muted-foreground" />}
          </div>
        </button>

        {tournamentPickerOpen && (
          <div className="mt-1 space-y-0.5 max-h-48 overflow-y-auto">
            {tournaments.map((t) => (
              <button key={t.id} onClick={() => { setSelectedId(t.id); setTournamentPickerOpen(false); setRegsLoaded(null); setMobileSidebarOpen(false); }}
                className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-colors ${t.id === selectedId ? "bg-primary/10 text-foreground" : "hover:bg-secondary text-muted-foreground"}`}>
                <div className="flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[t.status]}`} />
                  <span className="truncate">{t.name}</span>
                </div>
              </button>
            ))}
            <button onClick={() => { setShowCreate(true); setTournamentPickerOpen(false); setMobileSidebarOpen(false); }}
              className="w-full text-left px-3 py-2 rounded-xl text-sm text-primary hover:bg-primary/10 transition-colors flex items-center gap-2">
              <Plus size={13} weight="bold" /> New Tournament
            </button>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <div className="font-mono text-[9px] tracking-widest text-muted-foreground px-3 mb-2">OVERVIEW</div>
        {([
          { id: "dashboard", icon: Gauge, label: "Dashboard" },
          { id: "analytics", icon: ChartBar, label: "Analytics" },
        ] as const).map(({ id, icon: Icon, label }) => (
          <button key={id} onClick={() => { setNavSection(id); setMobileSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${navSection === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
            <Icon size={16} weight={navSection === id ? "fill" : "regular"} />
            {label}
          </button>
        ))}

        <div className="font-mono text-[9px] tracking-widest text-muted-foreground px-3 mt-4 mb-2">OPERATIONS</div>
        {([
          { id: "registrations", icon: Ticket, label: "Registration" },
          { id: "checkin", icon: ClipboardText, label: "Check-In" },
        ] as const).map(({ id, icon: Icon, label }) => (
          <button key={id} onClick={() => { setNavSection(id); if (selectedId) loadRegistrations(selectedId); setMobileSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${navSection === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
            <Icon size={16} weight={navSection === id ? "fill" : "regular"} />
            {label}
            {id === "registrations" && selected && selected.registered + selected.held > 0 && (
              <span className="ml-auto text-[10px] font-mono bg-primary/20 text-primary px-1.5 rounded-full">{selected.registered + selected.held}</span>
            )}
          </button>
        ))}

        <div className="font-mono text-[9px] tracking-widest text-muted-foreground px-3 mt-4 mb-2">TOURNAMENT</div>
        {selected && (
          <Link href={`/director/tournaments/${selected.id}`} onClick={() => setMobileSidebarOpen(false)}>
            <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              <Star size={16} />
              Manage &amp; Sponsors
            </button>
          </Link>
        )}
        {selected && (
          <Link href={`/tournaments/${selected.id}`} target="_blank" onClick={() => setMobileSidebarOpen(false)}>
            <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              <ArrowSquareOut size={16} />
              View Public Page
            </button>
          </Link>
        )}
      </nav>

      {/* Bottom */}
      <div className="border-t border-border px-3 py-3 space-y-0.5">
        <button onClick={() => { setNavSection("settings"); setMobileSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${navSection === "settings" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
          <Gear size={16} /> Settings
        </button>
        <Link href="/dashboard">
          <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <Users size={16} /> Player View
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
            <div className="text-sm font-medium truncate">{profileName}</div>
            <div className="text-[10px] text-muted-foreground">Tournament Director</div>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* ── Mobile sidebar overlay ── */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setMobileSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-card border-r border-border flex flex-col z-50">
            <div className="flex items-center justify-between px-5 pt-4 pb-0">
              <span className="font-mono text-[10px] tracking-widest text-muted-foreground">MENU</span>
              <button onClick={() => setMobileSidebarOpen(false)} className="h-8 w-8 rounded-full border border-border flex items-center justify-center">
                <X size={14} weight="bold" />
              </button>
            </div>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* ── Desktop Sidebar ── */}
      <aside className="w-60 flex-shrink-0 border-r border-border bg-card hidden lg:flex flex-col h-screen sticky top-0">
        <SidebarContent />
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 min-h-screen overflow-y-auto pb-20 lg:pb-0">
        {/* Top bar */}
        <header className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* Hamburger — mobile only */}
            <button onClick={() => setMobileSidebarOpen(true)} className="lg:hidden h-9 w-9 rounded-xl border border-border flex items-center justify-center flex-shrink-0 hover:bg-secondary transition-colors">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
            <div className="min-w-0">
              <h1 className="font-display text-lg sm:text-2xl tracking-wide truncate">{selected?.name ?? "Director Dashboard"}</h1>
              {selected && <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block truncate">{selected.venue_name} · {selected.city}, {selected.state} · {formatDate(selected.event_date)}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button className="h-9 w-9 sm:w-auto sm:px-4 rounded-full border border-border hover:bg-secondary text-sm transition-colors flex items-center justify-center gap-2">
              <Bell size={14} /> <span className="hidden sm:inline">Notifications</span>
            </button>
            <button onClick={() => setShowCreate(true)} className="h-9 px-3 sm:px-4 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-display tracking-wider transition-colors flex items-center gap-1.5">
              <Plus size={14} weight="bold" /> <span className="hidden sm:inline">New Tournament</span>
            </button>
          </div>
        </header>

        <div className="px-4 sm:px-6 lg:px-8 py-5 sm:py-8">

          {/* ── No tournaments ── */}
          {tournaments.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <Lightning size={48} className="text-primary mb-4" />
              <h2 className="font-display text-3xl tracking-wide mb-2">CREATE YOUR FIRST TOURNAMENT</h2>
              <p className="text-muted-foreground mb-8 max-w-sm">Start managing tournaments, tracking registrations, and growing your event.</p>
              <button onClick={() => setShowCreate(true)} className="h-12 px-8 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-wider text-sm transition-colors flex items-center gap-2">
                <Plus size={16} weight="bold" /> CREATE TOURNAMENT
              </button>
            </div>
          )}

          {/* ── Dashboard ── */}
          {navSection === "dashboard" && selected && (
            <div className="space-y-6">
              {/* KPI cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "Revenue", value: fmt(selected.revenue_cents), sub: `${totalRevenue > selected.revenue_cents ? fmt(totalRevenue) + " total" : "this event"}`, icon: CurrencyDollar, trend: "+12%", up: true },
                  { label: "Registrations", value: selected.registered, sub: `${selected.held} holds pending`, icon: Ticket, trend: `+${selected.held}`, up: true },
                  { label: "Fill Rate", value: `${fillPct}%`, sub: `${selected.draw_size - selected.registered} spots left`, icon: Funnel, trend: fillPct >= 50 ? "On track" : "Below avg", up: fillPct >= 50 },
                  { label: "Prize Pool", value: selected.prize_pool_cents ? fmt(selected.prize_pool_cents) : "—", sub: "total payout", icon: Trophy, trend: selected.prize_pool_cents ? "Set" : "Not set", up: !!selected.prize_pool_cents },
                ].map((card) => (
                  <div key={card.label} className="rounded-2xl border border-border bg-card p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
                        <card.icon size={18} className="text-primary" />
                      </div>
                      <span className={`text-xs font-mono flex items-center gap-1 ${card.up ? "text-primary" : "text-muted-foreground"}`}>
                        {card.up ? <TrendUp size={11} /> : <TrendDown size={11} />} {card.trend}
                      </span>
                    </div>
                    <div className="font-display text-3xl tracking-wide">{card.value}</div>
                    <div className="font-mono text-[10px] tracking-widest text-muted-foreground mt-1">{card.label.toUpperCase()}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{card.sub}</div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* Conversion funnel */}
                <div className="lg:col-span-3 rounded-2xl border border-border bg-card p-6">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-semibold">Conversion Funnel</h3>
                  </div>
                  <p className="text-xs text-muted-foreground mb-5">Discovery → registration · estimated</p>
                  <div className="space-y-4">
                    {funnelData.map((row) => (
                      <FunnelBar key={row.label} {...row} total={funnelData[0].value} />
                    ))}
                  </div>

                  <div className="mt-6 pt-5 border-t border-border">
                    <h4 className="font-semibold text-sm mb-4">Registrations over time</h4>
                    <MiniBarChart data={weeklyData} />
                    <div className="flex justify-between text-[10px] text-muted-foreground font-mono mt-1">
                      <span>12 weeks ago</span><span>This week</span>
                    </div>
                  </div>
                </div>

                {/* AI Insights */}
                <div className="lg:col-span-2 space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Broadcast size={14} className="text-primary" />
                    <span className="font-mono text-[10px] tracking-widest text-muted-foreground">AI INSIGHTS &amp; ACTIONS</span>
                  </div>

                  {insights.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-border p-6 text-center">
                      <p className="text-sm text-muted-foreground">Insights appear as your event fills up.</p>
                    </div>
                  )}

                  {(insights as Array<{ icon: React.ComponentType<{ size: number; weight?: string; className?: string }>; color: string; title: string; body: string; action: string }>).map((ins, i) => (
                    <div key={i} className="rounded-2xl border border-border bg-card p-4">
                      <div className="flex items-start gap-3 mb-2">
                        <ins.icon size={16} weight="fill" className={ins.color} />
                        <span className="font-semibold text-sm leading-tight">{ins.title}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-3 ml-7">{ins.body}</p>
                      <button className="ml-7 flex items-center gap-1.5 text-xs font-mono text-primary hover:underline">
                        <CheckCircle size={12} weight="bold" /> {ins.action}
                      </button>
                    </div>
                  ))}

                  {/* All tournaments summary */}
                  <div className="rounded-2xl border border-border bg-card p-4">
                    <div className="font-mono text-[10px] tracking-widest text-muted-foreground mb-3">ALL TOURNAMENTS</div>
                    <div className="space-y-2">
                      {tournaments.slice(0, 4).map((t) => (
                        <button key={t.id} onClick={() => setSelectedId(t.id)} className={`w-full text-left flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors ${t.id === selectedId ? "bg-primary/10" : "hover:bg-secondary"}`}>
                          <span className={`h-2 w-2 rounded-full flex-shrink-0 ${STATUS_DOT[t.status]}`} />
                          <span className="text-xs truncate flex-1">{t.name}</span>
                          <span className="text-[10px] font-mono text-muted-foreground">{Math.round((t.registered / t.draw_size) * 100)}%</span>
                        </button>
                      ))}
                    </div>
                    <button onClick={() => setShowCreate(true)} className="mt-3 w-full text-xs text-primary font-mono hover:underline flex items-center justify-center gap-1">
                      <Plus size={11} weight="bold" /> Add tournament
                    </button>
                  </div>
                </div>
              </div>

              {/* Status/actions row */}
              {selected.status === "draft" && (
                <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <Warning size={20} weight="fill" className="text-primary flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold">This tournament is in draft</div>
                      <div className="text-sm text-muted-foreground">Submit for approval to make it visible to players and open registration.</div>
                    </div>
                  </div>
                  <div className="flex gap-3 flex-shrink-0">
                    <Link href={`/director/tournaments/${selected.id}`}>
                      <button className="h-10 px-5 rounded-full border border-border hover:bg-secondary text-sm font-display tracking-wider transition-colors flex items-center gap-1.5">
                        <PencilSimple size={14} /> Edit Details
                      </button>
                    </Link>
                    <button onClick={() => submitForApproval(selected.id)} disabled={publishing === selected.id}
                      className="h-10 px-5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-display tracking-wider transition-colors disabled:opacity-50 flex items-center gap-1.5">
                      <CheckCircle size={14} weight="fill" />
                      {publishing === selected.id ? "Submitting…" : "Submit for Approval"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Analytics ── */}
          {navSection === "analytics" && (
            <div className="space-y-6">
              {/* Platform totals */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "Total Revenue", value: fmt(totalRevenue) },
                  { label: "Total Registrations", value: totalRegistered },
                  { label: "Tournaments", value: tournaments.length },
                  { label: "Avg Fill Rate", value: `${Math.round(tournaments.reduce((s, t) => s + (t.registered / t.draw_size), 0) / Math.max(1, tournaments.length) * 100)}%` },
                ].map((s) => (
                  <div key={s.label} className="rounded-2xl border border-border bg-card p-5">
                    <div className="font-display text-3xl tracking-wide">{s.value}</div>
                    <div className="font-mono text-[10px] tracking-widest text-muted-foreground mt-1">{s.label.toUpperCase()}</div>
                  </div>
                ))}
              </div>
              <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 overflow-x-auto">
                <h3 className="font-semibold mb-1">Revenue &amp; Registrations by Tournament</h3>
                <p className="text-xs text-muted-foreground mb-6">All events you manage</p>
                <div className="space-y-4 min-w-[360px]">
                  {tournaments.map((t) => {
                    const pct = Math.round((t.registered / t.draw_size) * 100);
                    return (
                      <div key={t.id} className="flex items-center gap-3 sm:gap-4">
                        <button onClick={() => { setSelectedId(t.id); setNavSection("dashboard"); }} className="text-sm font-medium text-left w-24 sm:w-36 truncate hover:text-primary transition-colors flex-shrink-0">{t.name}</button>
                        <div className="flex-1 h-3 bg-secondary rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="font-mono text-xs text-muted-foreground w-10 sm:w-12 text-right flex-shrink-0">{pct}%</span>
                        <span className="font-mono text-xs text-primary w-16 sm:w-20 text-right flex-shrink-0">{fmt(t.revenue_cents)}</span>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border w-16 sm:w-20 text-center flex-shrink-0 ${STATUS_DOT[t.status] === "bg-primary" ? "text-primary border-primary/30" : "text-muted-foreground border-border"}`}>{STATUS_LABELS[t.status]}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── Registrations ── */}
          {navSection === "registrations" && selected && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-display text-xl tracking-wide">REGISTRATIONS</h2>
                  <p className="text-sm text-muted-foreground">{selected.name} · {selected.registered} confirmed · {selected.held} held</p>
                </div>
                <button className="h-9 px-4 rounded-full border border-border hover:bg-secondary text-sm transition-colors flex items-center gap-2">
                  Export CSV <ArrowRight size={13} />
                </button>
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: "Confirmed", value: selected.registered, color: "text-primary" },
                  { label: "Held", value: selected.held, color: "text-amber-400" },
                  { label: "Open Spots", value: selected.draw_size - selected.registered - selected.held, color: "text-muted-foreground" },
                ].map((c) => (
                  <div key={c.label} className="rounded-xl border border-border bg-card p-4 text-center">
                    <div className={`font-display text-2xl tracking-wide ${c.color}`}>{c.value}</div>
                    <div className="font-mono text-[10px] tracking-widest text-muted-foreground mt-1">{c.label.toUpperCase()}</div>
                  </div>
                ))}
              </div>

              {/* Fill bar */}
              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="flex justify-between text-xs font-mono text-muted-foreground mb-2">
                  <span>{selected.registered + selected.held} of {selected.draw_size} spots taken</span>
                  <span>{fillPct + holdPct}% filled</span>
                </div>
                <div className="h-3 w-full bg-secondary rounded-full overflow-hidden flex">
                  <div className="h-full bg-primary transition-all" style={{ width: `${fillPct}%` }} />
                  <div className="h-full bg-amber-400/60 transition-all" style={{ width: `${holdPct}%` }} />
                </div>
                <div className="flex gap-4 mt-2 text-[10px] font-mono text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary inline-block" /> Registered</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400/60 inline-block" /> Held</span>
                </div>
              </div>

              {/* Player list */}
              {registrations.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
                  <Ticket size={32} className="mx-auto mb-3" />
                  <p>No registrations yet for this tournament.</p>
                </div>
              ) : (
                <div className="rounded-2xl border border-border bg-card overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-secondary/50">
                        <th className="text-left px-5 py-3 font-mono text-[10px] tracking-widest text-muted-foreground">PLAYER</th>
                        <th className="text-left px-4 py-3 font-mono text-[10px] tracking-widest text-muted-foreground hidden sm:table-cell">DUPR</th>
                        <th className="text-left px-4 py-3 font-mono text-[10px] tracking-widest text-muted-foreground hidden md:table-cell">DIVISION</th>
                        <th className="text-left px-4 py-3 font-mono text-[10px] tracking-widest text-muted-foreground">STATUS</th>
                        <th className="text-left px-4 py-3 font-mono text-[10px] tracking-widest text-muted-foreground hidden sm:table-cell">DATE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {registrations.map((r) => (
                        <tr key={r.id} className="border-b border-border/50 last:border-0 hover:bg-secondary/30 transition-colors">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                                <span className="font-display text-xs text-primary">{(r.profiles?.full_name ?? "?")[0]}</span>
                              </div>
                              <span className="font-medium truncate max-w-[120px]">{r.profiles?.full_name ?? "Unknown"}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground hidden sm:table-cell">{r.profiles?.dupr_rating ?? "—"}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">{r.division_id ? "Division" : "Open"}</td>
                          <td className="px-4 py-3">
                            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${r.status === "registered" ? "text-primary border-primary/30 bg-primary/10" : r.status === "checked_in" ? "text-green-400 border-green-400/30 bg-green-400/10" : "text-amber-400 border-amber-400/30 bg-amber-400/10"}`}>
                              {r.status === "registered" ? "CONFIRMED" : r.status === "checked_in" ? "CHECKED IN" : "HELD"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell">{new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Check-In ── */}
          {navSection === "checkin" && selected && (
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-xl tracking-wide">CHECK-IN</h2>
                <p className="text-sm text-muted-foreground">{selected.name} · Day-of player check-in</p>
              </div>
              <div className="relative">
                <MagnifyingGlass size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={checkinSearch}
                  onChange={(e) => { setCheckinSearch(e.target.value); if (selectedId) loadRegistrations(selectedId); }}
                  placeholder="Search player name…"
                  className="w-full h-12 rounded-xl bg-secondary border border-border pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: "Checked In", value: registrations.filter((r) => r.status === "checked_in").length, color: "text-green-400" },
                  { label: "Awaiting", value: registrations.filter((r) => r.status === "registered").length, color: "text-primary" },
                  { label: "No Show", value: registrations.filter((r) => r.status === "held").length, color: "text-muted-foreground" },
                ].map((c) => (
                  <div key={c.label} className="rounded-xl border border-border bg-card p-4 text-center">
                    <div className={`font-display text-2xl tracking-wide ${c.color}`}>{c.value}</div>
                    <div className="font-mono text-[10px] tracking-widest text-muted-foreground mt-1">{c.label.toUpperCase()}</div>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-border bg-card overflow-hidden">
                {registrations.filter((r) => !checkinSearch || r.profiles?.full_name?.toLowerCase().includes(checkinSearch.toLowerCase())).map((r) => (
                  <div key={r.id} className="flex items-center gap-4 px-5 py-3 border-b border-border/50 last:border-0">
                    <div className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <span className="font-display text-sm text-primary">{(r.profiles?.full_name ?? "?")[0]}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{r.profiles?.full_name ?? "Unknown"}</div>
                      <div className="text-xs text-muted-foreground">DUPR {r.profiles?.dupr_rating ?? "—"}</div>
                    </div>
                    {r.status === "checked_in" ? (
                      <span className="flex items-center gap-1.5 text-green-400 text-xs font-mono">
                        <CheckCircle size={14} weight="fill" /> CHECKED IN
                      </span>
                    ) : r.status === "registered" ? (
                      <button onClick={() => checkIn(r.id)} className="h-9 px-4 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-display tracking-wider transition-colors">
                        CHECK IN
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground font-mono">HOLD</span>
                    )}
                  </div>
                ))}
                {registrations.filter((r) => !checkinSearch || r.profiles?.full_name?.toLowerCase().includes(checkinSearch.toLowerCase())).length === 0 && (
                  <div className="p-12 text-center text-muted-foreground">
                    <ClipboardText size={32} className="mx-auto mb-3" />
                    <p>{checkinSearch ? "No players match your search." : "No registrations yet."}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Settings ── */}
          {navSection === "settings" && (
            <div className="space-y-6 max-w-lg">
              <h2 className="font-display text-xl tracking-wide">SETTINGS</h2>
              {selected ? (
                <>
                  <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
                    <h3 className="font-semibold">Current Tournament</h3>
                    <p className="text-sm text-muted-foreground">Manage details, banner, and sponsors for <strong>{selected.name}</strong>.</p>
                    <Link href={`/director/tournaments/${selected.id}`}>
                      <button className="h-10 px-5 rounded-full border border-border hover:bg-secondary text-sm font-display tracking-wider transition-colors flex items-center gap-2 mt-2">
                        Open Full Management <ArrowRight size={14} />
                      </button>
                    </Link>
                  </div>
                  <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
                    <h3 className="font-semibold">Notifications</h3>
                    <p className="text-sm text-muted-foreground">Email alerts for new registrations, hold expirations, and approval updates.</p>
                    <div className="text-xs text-muted-foreground font-mono">COMING SOON</div>
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground">Select a tournament to manage its settings.</p>
              )}
            </div>
          )}
        </div>
      </main>

      {/* ── Mobile bottom nav ── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-card border-t border-border flex items-center justify-around px-2 py-2 safe-area-pb">
        {([
          { id: "dashboard", icon: Gauge, label: "Home" },
          { id: "analytics", icon: ChartBar, label: "Analytics" },
          { id: "registrations", icon: Ticket, label: "Registrations" },
          { id: "checkin", icon: ClipboardText, label: "Check-In" },
          { id: "settings", icon: Gear, label: "Settings" },
        ] as const).map(({ id, icon: Icon, label }) => (
          <button key={id}
            onClick={() => { setNavSection(id); if (id === "registrations" || id === "checkin") { if (selectedId) loadRegistrations(selectedId); } }}
            className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors min-w-0 flex-1 ${navSection === id ? "text-primary" : "text-muted-foreground"}`}
          >
            <Icon size={20} weight={navSection === id ? "fill" : "regular"} />
            <span className="text-[9px] font-mono tracking-wide truncate">{label.toUpperCase()}</span>
          </button>
        ))}
      </nav>

      {showCreate && (
        <CreateDialog onClose={() => setShowCreate(false)} onCreated={(t) => {
          setTournaments((prev) => [...prev, t]);
          setSelectedId(t.id);
          setShowCreate(false);
        }} />
      )}
    </div>
  );
}
