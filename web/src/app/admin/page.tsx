"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Lightning, X, Plus, Users, CurrencyDollar, Trophy,
  Gauge, ChartBar, CheckCircle, Clock, Warning,
  Gear, SignOut, CaretDown, CaretUp, TrendUp,
  ShieldCheck, MagnifyingGlass, Bell,
  ArrowSquareOut, Envelope, UserCircle, Megaphone,
  CheckFat, Ticket, PencilSimple, Trash, ArrowRight,
  WarningCircle, Broadcast, Star, ChatCircleDots,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { getUserId } from "@/lib/dev-user";
import { MessagingPanel } from "@/components/messaging/panel";
import type { UserProfile as MessagingUserProfile } from "@/components/messaging/panel";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  handle: string | null;
  role: string;
  director_status: string | null;
  director_events_hosted: number | null;
  director_rating: number | null;
  created_at: string;
  location_city: string | null;
  location_state: string | null;
  avatar_url: string | null;
}

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
  prize_pool_cents: number | null;
  status: string;
  director_id: string;
  submitted_for_approval_at: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  created_at: string;
  director_name?: string;
  registration_count?: number;
}

interface Message {
  id: string;
  to: string;
  toLabel: string;
  subject: string;
  body: string;
  sentAt: string;
  type: "individual" | "broadcast";
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_DOT: Record<string, string> = {
  draft: "bg-muted-foreground",
  pending_approval: "bg-amber-400",
  approved: "bg-blue-400",
  published: "bg-primary",
  open: "bg-primary",
  filling_fast: "bg-orange-400",
  registration_closed: "bg-slate-400",
  in_progress: "bg-green-400",
  completed: "bg-muted-foreground",
  cancelled: "bg-red-400",
};
const STATUS_LABEL: Record<string, string> = {
  draft: "Draft", pending_approval: "Pending", approved: "Approved",
  published: "Live", open: "Open", filling_fast: "Filling Fast",
  registration_closed: "Reg. Closed", in_progress: "In Progress",
  completed: "Completed", cancelled: "Cancelled",
};
const ROLE_COLOR: Record<string, string> = {
  admin: "text-yellow-400 border-yellow-400/40 bg-yellow-400/10",
  director: "text-blue-400 border-blue-400/40 bg-blue-400/10",
  player_director: "text-purple-400 border-purple-400/40 bg-purple-400/10",
  player: "text-muted-foreground border-border",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function fmt(cents: number) { return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`; }

// ── Mini bar chart ────────────────────────────────────────────────────────────

function MiniBar({ data, color = "var(--primary)" }: { data: number[]; color?: string }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex items-end gap-0.5 h-10">
      {data.map((v, i) => (
        <div key={i} className="flex-1 rounded-sm" style={{ height: `${(v / max) * 100}%`, backgroundColor: color, opacity: 0.35 + (i / data.length) * 0.65 }} />
      ))}
    </div>
  );
}

// ── Reject modal ──────────────────────────────────────────────────────────────

function RejectModal({ tournamentName, onConfirm, onClose }: { tournamentName: string; onConfirm: (reason: string) => void; onClose: () => void }) {
  const [reason, setReason] = useState("");
  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-6 shadow-2xl">
        <h3 className="font-display text-xl tracking-wide mb-1">REJECT TOURNAMENT</h3>
        <p className="text-sm text-muted-foreground mb-4">Provide a reason for rejecting <strong>{tournamentName}</strong>. This will be shared with the director.</p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          placeholder="e.g. Missing venue details, insufficient registration window…"
          className="w-full rounded-xl bg-secondary border border-border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring resize-none mb-4"
        />
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 h-11 rounded-full border border-border hover:bg-secondary text-sm font-display tracking-wider transition-colors">CANCEL</button>
          <button onClick={() => reason.trim() && onConfirm(reason.trim())} disabled={!reason.trim()}
            className="flex-1 h-11 rounded-full bg-red-500 text-white hover:bg-red-600 text-sm font-display tracking-wider transition-colors disabled:opacity-40">
            REJECT
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type NavSection = "dashboard" | "approvals" | "directors" | "users" | "tournaments" | "finance" | "comms" | "messages" | "settings";

export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [adminName, setAdminName] = useState("Admin");
  const [navSection, setNavSection] = useState<NavSection>("dashboard");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Data
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);

  // UI state
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState<string>("all");
  const [tournamentSearch, setTournamentSearch] = useState("");
  const [tournamentStatusFilter, setTournamentStatusFilter] = useState<string>("all");
  const [rejectTarget, setRejectTarget] = useState<Tournament | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);

  const [messagingUnread, setMessagingUnread] = useState(0);
  const [allUsers, setAllUsers] = useState<MessagingUserProfile[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Comms
  const [messages, setMessages] = useState<Message[]>([]);
  const [composeRecipientType, setComposeRecipientType] = useState<"all" | "directors" | "individual">("directors");
  const [composeRecipientId, setComposeRecipientId] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [showEmailList, setShowEmailList] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const userId = await getUserId();
      if (!userId) { router.push("/auth"); return; }
      setCurrentUserId(userId);
      const supabase = createClient();

      const { data: profile } = await supabase.from("profiles").select("full_name,role").eq("id", userId).single();
      if (!profile || profile.role !== "admin") { router.push("/dashboard"); return; }
      setAdminName((profile.full_name as string | null) ?? "Admin");

      // Load all profiles
      const { data: profs } = await supabase.from("profiles")
        .select("id,email,full_name,handle,role,director_status,director_events_hosted,director_rating,created_at,location_city,location_state,avatar_url")
        .order("created_at", { ascending: false });
      setProfiles((profs ?? []) as Profile[]);
      setAllUsers((profs ?? []).map((p) => ({ id: p.id, full_name: p.full_name as string | null, role: p.role as string, avatar_url: (p as { avatar_url?: string | null }).avatar_url ?? null })) as MessagingUserProfile[]);

      // Load all tournaments with director name
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: ts } = await (supabase as any).from("tournaments")
        .select("id,name,city,state,venue_name,event_date,format,draw_size,spots_filled,entry_fee_cents,prize_pool_cents,status,director_id,submitted_for_approval_at,approved_at,rejected_reason,created_at")
        .order("created_at", { ascending: false });

      if (ts && ts.length > 0) {
        const directorIds = [...new Set((ts as Tournament[]).map((t) => t.director_id))];
        const { data: dirs } = await supabase.from("profiles").select("id,full_name").in("id", directorIds);
        const dirMap: Record<string, string> = {};
        for (const d of dirs ?? []) dirMap[d.id] = d.full_name ?? "Unknown";
        setTournaments((ts as Tournament[]).map((t) => ({ ...t, director_name: dirMap[t.director_id] ?? "Unknown" })));
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Approvals ───────────────────────────────────────────────────────────────

  const approveTournament = async (id: string) => {
    setActioning(id);
    const userId = await getUserId();
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("tournaments").update({
      status: "approved", approved_at: new Date().toISOString(), approved_by: userId, rejected_reason: null,
    }).eq("id", id);
    setActioning(null);
    if (error) { toast.error("Failed to approve."); return; }
    setTournaments((prev) => prev.map((t) => t.id === id ? { ...t, status: "approved", approved_at: new Date().toISOString() } : t));
    toast.success("Tournament approved!");
  };

  const rejectTournament = async (id: string, reason: string) => {
    setActioning(id);
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("tournaments").update({ status: "draft", rejected_reason: reason }).eq("id", id);
    setActioning(null);
    setRejectTarget(null);
    if (error) { toast.error("Failed to reject."); return; }
    setTournaments((prev) => prev.map((t) => t.id === id ? { ...t, status: "draft", rejected_reason: reason } : t));
    toast("Tournament returned to director.", { description: "Rejection reason saved." });
  };

  // ── Director approval ────────────────────────────────────────────────────────

  const approveDirector = async (profileId: string) => {
    setActioning(profileId);
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("profiles").update({ director_status: "approved", role: "director" }).eq("id", profileId);
    setActioning(null);
    if (error) { toast.error("Failed to approve director."); return; }
    setProfiles((prev) => prev.map((p) => p.id === profileId ? { ...p, director_status: "approved", role: "director" } : p));
    toast.success("Director approved!");
  };

  const suspendDirector = async (profileId: string) => {
    setActioning(profileId);
    const supabase = createClient();
    const { error } = await supabase.from("profiles").update({ director_status: "suspended" }).eq("id", profileId);
    setActioning(null);
    if (error) { toast.error("Failed to suspend."); return; }
    setProfiles((prev) => prev.map((p) => p.id === profileId ? { ...p, director_status: "suspended" } : p));
    toast("Director suspended.");
  };

  const reactivateDirector = async (profileId: string) => {
    setActioning(profileId);
    const supabase = createClient();
    const { error } = await supabase.from("profiles").update({ director_status: "approved" }).eq("id", profileId);
    setActioning(null);
    if (error) { toast.error("Failed to reactivate."); return; }
    setProfiles((prev) => prev.map((p) => p.id === profileId ? { ...p, director_status: "approved" } : p));
    toast.success("Director reactivated.");
  };

  // ── Communications ──────────────────────────────────────────────────────────

  const getRecipientEmails = () => {
    if (composeRecipientType === "all") return profiles.map((p) => p.email).filter(Boolean);
    if (composeRecipientType === "directors") return profiles.filter((p) => p.role === "director" || p.role === "player_director").map((p) => p.email).filter(Boolean);
    const target = profiles.find((p) => p.id === composeRecipientId);
    return target ? [target.email] : [];
  };

  const handleSendMessage = () => {
    const emails = getRecipientEmails();
    if (!composeSubject.trim() || !composeBody.trim()) { toast.error("Subject and body are required."); return; }
    if (emails.length === 0) { toast.error("No recipients found."); return; }

    const newMsg: Message = {
      id: Date.now().toString(),
      to: emails.join(", "),
      toLabel: composeRecipientType === "all" ? "All Users" : composeRecipientType === "directors" ? "All Directors" : (profiles.find((p) => p.id === composeRecipientId)?.full_name ?? "Individual"),
      subject: composeSubject,
      body: composeBody,
      sentAt: new Date().toISOString(),
      type: composeRecipientType === "individual" ? "individual" : "broadcast",
    };
    setMessages((prev) => [newMsg, ...prev]);
    setComposeSubject("");
    setComposeBody("");
    toast.success("Message queued!", { description: `To: ${newMsg.toLabel} · ${emails.length} recipient${emails.length > 1 ? "s" : ""}` });
  };

  // ── Derived data ─────────────────────────────────────────────────────────────

  const pendingTournaments = tournaments.filter((t) => t.status === "pending_approval");
  const pendingDirectors = profiles.filter((p) => p.director_status === "pending");
  const directors = profiles.filter((p) => ["director", "player_director"].includes(p.role));
  const totalRevenue = tournaments.reduce((s, t) => s + (t.spots_filled * t.entry_fee_cents), 0);
  const platformRevenue = Math.round(totalRevenue * 0.05);
  const liveTournaments = tournaments.filter((t) => ["published", "open", "filling_fast", "in_progress"].includes(t.status));

  const filteredProfiles = profiles.filter((p) => {
    const matchesSearch = !userSearch || (p.full_name ?? "").toLowerCase().includes(userSearch.toLowerCase()) || (p.email ?? "").toLowerCase().includes(userSearch.toLowerCase());
    const matchesRole = userRoleFilter === "all" || p.role === userRoleFilter;
    return matchesSearch && matchesRole;
  });

  const filteredTournaments = tournaments.filter((t) => {
    const matchesSearch = !tournamentSearch || t.name.toLowerCase().includes(tournamentSearch.toLowerCase()) || (t.director_name ?? "").toLowerCase().includes(tournamentSearch.toLowerCase());
    const matchesStatus = tournamentStatusFilter === "all" || t.status === tournamentStatusFilter;
    return matchesSearch && matchesStatus;
  });

  // Simulated weekly signup data
  const weeklySignups = Array.from({ length: 12 }, (_, i) => Math.round(5 + i * 3 + Math.random() * 8));

  const firstName = adminName.split(" ")[0];

  // ── Sidebar ───────────────────────────────────────────────────────────────────

  const SidebarContent = () => (
    <>
      <div className="px-5 py-5 border-b border-border flex-shrink-0">
        <Link href="/" className="flex items-center gap-2">
          <Lightning size={18} weight="fill" className="text-primary" />
          <span className="font-display tracking-wider text-sm">DreamBreakerPB</span>
        </Link>
        <div className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground mt-1">ADMIN PORTAL</div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <div className="font-mono text-[9px] tracking-widest text-muted-foreground px-3 mb-2">PLATFORM</div>
        {([
          { id: "dashboard", icon: Gauge, label: "Dashboard" },
          { id: "finance", icon: CurrencyDollar, label: "Finance" },
        ] as const).map(({ id, icon: Icon, label }) => (
          <button key={id} onClick={() => { setNavSection(id); setMobileSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${navSection === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
            <Icon size={16} weight={navSection === id ? "fill" : "regular"} />{label}
          </button>
        ))}

        <div className="font-mono text-[9px] tracking-widest text-muted-foreground px-3 mt-4 mb-2">QUEUE</div>
        {([
          { id: "approvals", icon: CheckFat, label: "Approvals", badge: pendingTournaments.length },
          { id: "directors", icon: ShieldCheck, label: "Directors", badge: pendingDirectors.length },
        ] as const).map(({ id, icon: Icon, label, badge }) => (
          <button key={id} onClick={() => { setNavSection(id); setMobileSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${navSection === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
            <Icon size={16} weight={navSection === id ? "fill" : "regular"} />
            {label}
            {badge > 0 && <span className={`ml-auto text-[10px] font-mono px-1.5 rounded-full ${navSection === id ? "bg-white/20 text-white" : "bg-amber-400/20 text-amber-400"}`}>{badge}</span>}
          </button>
        ))}

        <div className="font-mono text-[9px] tracking-widest text-muted-foreground px-3 mt-4 mb-2">MANAGEMENT</div>
        {([
          { id: "users", icon: Users, label: "Users", badge: profiles.length },
          { id: "tournaments", icon: Trophy, label: "Tournaments", badge: tournaments.length },
        ] as const).map(({ id, icon: Icon, label, badge }) => (
          <button key={id} onClick={() => { setNavSection(id); setMobileSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${navSection === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
            <Icon size={16} weight={navSection === id ? "fill" : "regular"} />
            {label}
            <span className={`ml-auto text-[10px] font-mono px-1.5 rounded-full ${navSection === id ? "bg-white/20 text-white" : "bg-primary/10 text-primary"}`}>{badge}</span>
          </button>
        ))}

        <div className="font-mono text-[9px] tracking-widest text-muted-foreground px-3 mt-4 mb-2">COMMUNICATIONS</div>
        <button onClick={() => { setNavSection("messages"); setMobileSidebarOpen(false); }}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${navSection === "messages" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
          <ChatCircleDots size={16} weight={navSection === "messages" ? "fill" : "regular"} />
          Messages
          {messagingUnread > 0 && <span className={`ml-auto text-[10px] font-mono px-1.5 rounded-full ${navSection === "messages" ? "bg-white/20 text-white" : "bg-primary/10 text-primary"}`}>{messagingUnread}</span>}
        </button>
        <button onClick={() => { setNavSection("comms"); setMobileSidebarOpen(false); }}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${navSection === "comms" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
          <Envelope size={16} weight={navSection === "comms" ? "fill" : "regular"} />
          Email Comms
          {messages.length > 0 && <span className={`ml-auto text-[10px] font-mono px-1.5 rounded-full ${navSection === "comms" ? "bg-white/20 text-white" : "bg-primary/10 text-primary"}`}>{messages.length}</span>}
        </button>
      </nav>

      <div className="border-t border-border px-3 py-3 space-y-0.5 flex-shrink-0">
        <button onClick={() => { setNavSection("settings"); setMobileSidebarOpen(false); }}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${navSection === "settings" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
          <Gear size={16} /> Settings
        </button>
        <Link href="/dashboard">
          <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <Users size={16} /> Player View
          </button>
        </Link>
        <Link href="/director">
          <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <Trophy size={16} /> Director View
          </button>
        </Link>
        <Link href="/auth">
          <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <SignOut size={16} /> Log out
          </button>
        </Link>
        <div className="flex items-center gap-3 px-3 py-2.5 mt-1 border-t border-border">
          <div className="h-8 w-8 rounded-full bg-yellow-400/20 flex items-center justify-center flex-shrink-0">
            <span className="font-display text-sm text-yellow-400">{firstName[0]}</span>
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{adminName}</div>
            <div className="text-[10px] text-yellow-400 font-mono">ADMINISTRATOR</div>
          </div>
        </div>
      </div>
    </>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Mobile sidebar overlay */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setMobileSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-card border-r border-border flex flex-col z-50">
            <div className="flex items-center justify-between px-5 pt-4 pb-0 flex-shrink-0">
              <span className="font-mono text-[10px] tracking-widest text-muted-foreground">MENU</span>
              <button onClick={() => setMobileSidebarOpen(false)} className="h-8 w-8 rounded-full border border-border flex items-center justify-center">
                <X size={14} weight="bold" />
              </button>
            </div>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="w-60 flex-shrink-0 border-r border-border bg-card hidden lg:flex flex-col h-screen sticky top-0">
        <SidebarContent />
      </aside>

      {/* Main */}
      <main className="flex-1 min-h-screen overflow-y-auto pb-20 lg:pb-0">
        {/* Header */}
        <header className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => setMobileSidebarOpen(true)} className="lg:hidden h-9 w-9 rounded-xl border border-border flex items-center justify-center flex-shrink-0 hover:bg-secondary transition-colors">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>
            <div className="min-w-0">
              <h1 className="font-display text-lg sm:text-2xl tracking-wide truncate">
                {navSection === "dashboard" && "Admin Dashboard"}
                {navSection === "approvals" && "Tournament Approvals"}
                {navSection === "directors" && "Director Management"}
                {navSection === "users" && "User Management"}
                {navSection === "tournaments" && "All Tournaments"}
                {navSection === "finance" && "Finance & Revenue"}
                {navSection === "comms" && "Communications"}
                {navSection === "settings" && "Platform Settings"}
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
                {pendingTournaments.length > 0 && `${pendingTournaments.length} tournament${pendingTournaments.length > 1 ? "s" : ""} pending approval`}
                {pendingTournaments.length === 0 && "All clear — no pending items"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {(pendingTournaments.length > 0 || pendingDirectors.length > 0) && (
              <button onClick={() => setNavSection("approvals")} className="h-9 px-3 rounded-full bg-amber-400/10 border border-amber-400/30 text-amber-400 text-xs font-mono flex items-center gap-1.5">
                <Warning size={13} weight="fill" /> {pendingTournaments.length + pendingDirectors.length} PENDING
              </button>
            )}
            <button className="h-9 w-9 rounded-full border border-border hover:bg-secondary flex items-center justify-center transition-colors">
              <Bell size={14} />
            </button>
          </div>
        </header>

        <div className="px-4 sm:px-6 lg:px-8 py-5 sm:py-8">

          {/* ── Dashboard ── */}
          {navSection === "dashboard" && (
            <div className="space-y-6">
              {/* KPI row */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "Total Users", value: profiles.length.toLocaleString(), sub: `${directors.length} directors`, icon: Users, trend: "+12%", up: true },
                  { label: "Live Tournaments", value: liveTournaments.length, sub: `${tournaments.length} total`, icon: Trophy, trend: `${pendingTournaments.length} pending`, up: pendingTournaments.length === 0 },
                  { label: "Platform Revenue", value: fmt(platformRevenue), sub: "5% of gross", icon: CurrencyDollar, trend: "+8%", up: true },
                  { label: "Pending Actions", value: pendingTournaments.length + pendingDirectors.length, sub: "needs review", icon: WarningCircle, trend: pendingTournaments.length + pendingDirectors.length > 0 ? "Action needed" : "All clear", up: (pendingTournaments.length + pendingDirectors.length) === 0 },
                ].map((card) => (
                  <div key={card.label} className="rounded-2xl border border-border bg-card p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
                        <card.icon size={18} className="text-primary" />
                      </div>
                      <span className={`text-xs font-mono flex items-center gap-1 ${card.up ? "text-primary" : "text-amber-400"}`}>
                        {card.trend}
                      </span>
                    </div>
                    <div className="font-display text-3xl tracking-wide">{card.value}</div>
                    <div className="font-mono text-[10px] tracking-widest text-muted-foreground mt-1">{card.label.toUpperCase()}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{card.sub}</div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* User growth chart */}
                <div className="lg:col-span-3 rounded-2xl border border-border bg-card p-6">
                  <h3 className="font-semibold mb-1">Platform Growth</h3>
                  <p className="text-xs text-muted-foreground mb-5">Weekly new signups · last 12 weeks</p>
                  <MiniBar data={weeklySignups} />
                  <div className="flex justify-between text-[10px] text-muted-foreground font-mono mt-2">
                    <span>12 weeks ago</span><span>This week</span>
                  </div>

                  {/* Status breakdown */}
                  <div className="mt-6 pt-5 border-t border-border grid grid-cols-3 gap-4">
                    {[
                      { label: "Players", value: profiles.filter((p) => p.role === "player").length, color: "bg-primary" },
                      { label: "Directors", value: directors.length, color: "bg-blue-400" },
                      { label: "Pending Dir.", value: pendingDirectors.length, color: "bg-amber-400" },
                    ].map((s) => (
                      <div key={s.label}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className={`h-2 w-2 rounded-full ${s.color}`} />
                          <span className="text-[10px] font-mono text-muted-foreground">{s.label.toUpperCase()}</span>
                        </div>
                        <div className="font-display text-2xl">{s.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right panel */}
                <div className="lg:col-span-2 space-y-3">
                  {/* Pending approvals quick view */}
                  {pendingTournaments.length > 0 && (
                    <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Warning size={14} weight="fill" className="text-amber-400" />
                        <span className="font-mono text-[10px] tracking-widest text-amber-400">{pendingTournaments.length} AWAITING APPROVAL</span>
                      </div>
                      <div className="space-y-2">
                        {pendingTournaments.slice(0, 3).map((t) => (
                          <div key={t.id} className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">{t.name}</div>
                              <div className="text-xs text-muted-foreground">{t.director_name} · {t.city}, {t.state}</div>
                            </div>
                            <button onClick={() => approveTournament(t.id)} disabled={actioning === t.id}
                              className="flex-shrink-0 h-7 px-3 rounded-full bg-primary text-primary-foreground text-[10px] font-mono hover:bg-primary/90 transition-colors disabled:opacity-50">
                              {actioning === t.id ? "…" : "APPROVE"}
                            </button>
                          </div>
                        ))}
                        {pendingTournaments.length > 3 && (
                          <button onClick={() => setNavSection("approvals")} className="text-xs text-primary font-mono hover:underline">
                            +{pendingTournaments.length - 3} more →
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Director applications */}
                  {pendingDirectors.length > 0 && (
                    <div className="rounded-2xl border border-blue-400/30 bg-blue-400/5 p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <ShieldCheck size={14} weight="fill" className="text-blue-400" />
                        <span className="font-mono text-[10px] tracking-widest text-blue-400">{pendingDirectors.length} DIRECTOR APPLICATION{pendingDirectors.length > 1 ? "S" : ""}</span>
                      </div>
                      <div className="space-y-2">
                        {pendingDirectors.slice(0, 2).map((p) => (
                          <div key={p.id} className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">{p.full_name ?? "Unknown"}</div>
                              <div className="text-xs text-muted-foreground truncate">{p.email}</div>
                            </div>
                            <button onClick={() => approveDirector(p.id)} disabled={actioning === p.id}
                              className="flex-shrink-0 h-7 px-3 rounded-full bg-blue-400/20 text-blue-400 border border-blue-400/30 text-[10px] font-mono hover:bg-blue-400 hover:text-white transition-colors disabled:opacity-50">
                              {actioning === p.id ? "…" : "APPROVE"}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* All clear */}
                  {pendingTournaments.length === 0 && pendingDirectors.length === 0 && (
                    <div className="rounded-2xl border border-border bg-card p-4 text-center py-8">
                      <CheckCircle size={28} className="text-primary mx-auto mb-2" weight="fill" />
                      <p className="text-sm font-semibold">All caught up</p>
                      <p className="text-xs text-muted-foreground mt-1">No pending approvals</p>
                    </div>
                  )}

                  {/* Revenue snapshot */}
                  <div className="rounded-2xl border border-border bg-card p-4">
                    <div className="font-mono text-[10px] tracking-widest text-muted-foreground mb-3">REVENUE SNAPSHOT</div>
                    <div className="space-y-2">
                      {[
                        { label: "Gross Entry Fees", value: fmt(totalRevenue) },
                        { label: "Platform (5%)", value: fmt(platformRevenue), highlight: true },
                        { label: "Director Payouts", value: fmt(totalRevenue - platformRevenue) },
                      ].map((r) => (
                        <div key={r.label} className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">{r.label}</span>
                          <span className={`font-mono text-xs font-semibold ${r.highlight ? "text-primary" : "text-foreground"}`}>{r.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Approvals ── */}
          {navSection === "approvals" && (
            <div className="space-y-6">
              {pendingTournaments.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-16 text-center">
                  <CheckCircle size={40} className="text-primary mx-auto mb-3" weight="fill" />
                  <h3 className="font-display text-xl tracking-wide mb-1">ALL CAUGHT UP</h3>
                  <p className="text-sm text-muted-foreground">No tournaments pending approval.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {pendingTournaments.map((t) => (
                    <div key={t.id} className="rounded-2xl border border-amber-400/20 bg-card p-5 sm:p-6">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-display text-xl tracking-wide">{t.name}</span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border text-amber-400 border-amber-400/30 bg-amber-400/10">PENDING</span>
                          </div>
                          <div className="text-sm text-muted-foreground">{t.venue_name} · {t.city}, {t.state}</div>
                          <div className="text-sm text-muted-foreground">Director: <span className="text-foreground font-medium">{t.director_name}</span></div>
                          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {[
                              { label: "Date", value: fmtDate(t.event_date) },
                              { label: "Capacity", value: `${t.draw_size} players` },
                              { label: "Entry Fee", value: fmt(t.entry_fee_cents) },
                              { label: "Prize Pool", value: t.prize_pool_cents ? fmt(t.prize_pool_cents) : "None" },
                            ].map((s) => (
                              <div key={s.label}>
                                <div className="font-mono text-[9px] tracking-widest text-muted-foreground">{s.label.toUpperCase()}</div>
                                <div className="text-sm font-medium mt-0.5">{s.value}</div>
                              </div>
                            ))}
                          </div>
                          {t.submitted_for_approval_at && (
                            <div className="text-xs text-muted-foreground mt-3">
                              Submitted {fmtTime(t.submitted_for_approval_at)}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <Link href={`/tournaments/${t.id}`} target="_blank">
                            <button className="h-10 w-10 rounded-full border border-border hover:bg-secondary flex items-center justify-center transition-colors" title="Preview">
                              <ArrowSquareOut size={14} />
                            </button>
                          </Link>
                          <button onClick={() => setRejectTarget(t)} disabled={actioning === t.id}
                            className="h-10 px-5 rounded-full border border-red-400/30 text-red-400 hover:bg-red-400/10 font-display tracking-wider text-sm transition-colors disabled:opacity-40">
                            REJECT
                          </button>
                          <button onClick={() => approveTournament(t.id)} disabled={actioning === t.id}
                            className="h-10 px-5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-wider text-sm transition-colors disabled:opacity-50">
                            {actioning === t.id ? "APPROVING…" : "APPROVE"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Directors ── */}
          {navSection === "directors" && (
            <div className="space-y-4">
              {/* Pending applications */}
              {pendingDirectors.length > 0 && (
                <>
                  <div className="font-mono text-[10px] tracking-widest text-amber-400 flex items-center gap-2">
                    <Warning size={12} weight="fill" /> {pendingDirectors.length} PENDING APPLICATION{pendingDirectors.length > 1 ? "S" : ""}
                  </div>
                  {pendingDirectors.map((p) => (
                    <div key={p.id} className="rounded-2xl border border-amber-400/20 bg-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-full bg-amber-400/10 flex items-center justify-center flex-shrink-0">
                          <span className="font-display text-sm text-amber-400">{(p.full_name ?? "?")[0]}</span>
                        </div>
                        <div>
                          <div className="font-semibold">{p.full_name ?? "Unknown"}</div>
                          <div className="text-xs text-muted-foreground">{p.email}</div>
                          {p.location_city && <div className="text-xs text-muted-foreground">{p.location_city}, {p.location_state}</div>}
                          <div className="text-xs text-muted-foreground">Joined {fmtDate(p.created_at)}</div>
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button onClick={() => approveDirector(p.id)} disabled={actioning === p.id}
                          className="h-9 px-5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-wider text-sm transition-colors disabled:opacity-50">
                          {actioning === p.id ? "…" : "APPROVE"}
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="border-t border-border pt-4" />
                </>
              )}

              {/* All directors */}
              <div className="font-mono text-[10px] tracking-widest text-muted-foreground flex items-center gap-2">
                <ShieldCheck size={12} /> {directors.length} APPROVED DIRECTORS
              </div>
              {directors.length === 0 && (
                <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
                  <ShieldCheck size={32} className="mx-auto mb-3" />
                  <p>No approved directors yet.</p>
                </div>
              )}
              {directors.map((p) => {
                const theirTournaments = tournaments.filter((t) => t.director_id === p.id);
                return (
                  <div key={p.id} className="rounded-2xl border border-border bg-card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-blue-400/10 flex items-center justify-center flex-shrink-0">
                        <span className="font-display text-sm text-blue-400">{(p.full_name ?? "?")[0]}</span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{p.full_name ?? "Unknown"}</span>
                          {p.director_status === "suspended" && (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border text-red-400 border-red-400/30 bg-red-400/10">SUSPENDED</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{p.email}</div>
                        <div className="text-xs text-muted-foreground">{theirTournaments.length} tournament{theirTournaments.length !== 1 ? "s" : ""} · {p.director_rating ? `${p.director_rating}★` : "No rating"}</div>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0 flex-wrap">
                      <button onClick={() => { setNavSection("comms"); setComposeRecipientType("individual"); setComposeRecipientId(p.id); }}
                        className="h-8 px-3 rounded-full border border-border hover:bg-secondary text-xs font-mono flex items-center gap-1.5 transition-colors">
                        <Envelope size={12} /> Message
                      </button>
                      {p.director_status === "suspended" ? (
                        <button onClick={() => reactivateDirector(p.id)} disabled={actioning === p.id}
                          className="h-8 px-3 rounded-full border border-primary/30 text-primary hover:bg-primary/10 text-xs font-mono transition-colors disabled:opacity-50">
                          {actioning === p.id ? "…" : "Reactivate"}
                        </button>
                      ) : (
                        <button onClick={() => suspendDirector(p.id)} disabled={actioning === p.id}
                          className="h-8 px-3 rounded-full border border-red-400/30 text-red-400 hover:bg-red-400/10 text-xs font-mono transition-colors disabled:opacity-50">
                          {actioning === p.id ? "…" : "Suspend"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Users ── */}
          {navSection === "users" && (
            <div className="space-y-4">
              {/* Filters */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <MagnifyingGlass size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Search by name or email…"
                    className="w-full h-10 rounded-xl bg-secondary border border-border pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <select value={userRoleFilter} onChange={(e) => setUserRoleFilter(e.target.value)}
                  className="h-10 rounded-xl bg-secondary border border-border px-3 text-sm outline-none focus:ring-2 focus:ring-ring">
                  <option value="all">All Roles</option>
                  <option value="player">Players</option>
                  <option value="director">Directors</option>
                  <option value="player_director">Player/Directors</option>
                  <option value="admin">Admins</option>
                </select>
              </div>

              <div className="text-xs text-muted-foreground font-mono">{filteredProfiles.length} USERS</div>

              <div className="rounded-2xl border border-border bg-card overflow-hidden">
                {filteredProfiles.length === 0 && (
                  <div className="p-12 text-center text-muted-foreground">No users match your filters.</div>
                )}
                {filteredProfiles.map((p) => (
                  <div key={p.id} className="flex flex-wrap items-center gap-3 sm:gap-4 p-4 sm:p-5 border-b border-border/50 last:border-0">
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="font-display text-sm text-primary">{(p.full_name ?? p.email ?? "?")[0].toUpperCase()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{p.full_name ?? "No name"}</span>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${ROLE_COLOR[p.role] ?? "text-muted-foreground border-border"}`}>{p.role.toUpperCase()}</span>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{p.email}</div>
                      <div className="text-xs text-muted-foreground">Joined {fmtDate(p.created_at)}{p.location_city ? ` · ${p.location_city}, ${p.location_state}` : ""}</div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button onClick={() => { setNavSection("comms"); setComposeRecipientType("individual"); setComposeRecipientId(p.id); }}
                        className="h-8 px-3 rounded-full border border-border hover:bg-secondary text-xs font-mono flex items-center gap-1.5 transition-colors">
                        <Envelope size={12} /> Message
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Tournaments ── */}
          {navSection === "tournaments" && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <MagnifyingGlass size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input value={tournamentSearch} onChange={(e) => setTournamentSearch(e.target.value)} placeholder="Search tournaments or directors…"
                    className="w-full h-10 rounded-xl bg-secondary border border-border pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <select value={tournamentStatusFilter} onChange={(e) => setTournamentStatusFilter(e.target.value)}
                  className="h-10 rounded-xl bg-secondary border border-border px-3 text-sm outline-none focus:ring-2 focus:ring-ring">
                  <option value="all">All Statuses</option>
                  <option value="pending_approval">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="published">Live</option>
                  <option value="open">Open</option>
                  <option value="draft">Draft</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div className="text-xs text-muted-foreground font-mono">{filteredTournaments.length} TOURNAMENTS</div>

              <div className="rounded-2xl border border-border bg-card overflow-hidden">
                {filteredTournaments.length === 0 && (
                  <div className="p-12 text-center text-muted-foreground">No tournaments match your filters.</div>
                )}
                {filteredTournaments.map((t) => {
                  const pct = t.draw_size > 0 ? Math.round((t.spots_filled / t.draw_size) * 100) : 0;
                  return (
                    <div key={t.id} className="flex flex-wrap items-center gap-4 p-4 sm:p-5 border-b border-border/50 last:border-0">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className={`h-2 w-2 rounded-full flex-shrink-0 ${STATUS_DOT[t.status] ?? "bg-muted-foreground"}`} />
                          <span className="font-medium text-sm">{t.name}</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border text-muted-foreground border-border">{STATUS_LABEL[t.status] ?? t.status}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">{t.city}, {t.state} · {fmtDate(t.event_date)} · Dir: {t.director_name}</div>
                        <div className="flex items-center gap-2 mt-1.5">
                          <div className="flex-1 max-w-[120px] h-1.5 bg-secondary rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[10px] font-mono text-muted-foreground">{t.spots_filled}/{t.draw_size}</span>
                          {t.prize_pool_cents && <span className="text-[10px] font-mono text-primary">{fmt(t.prize_pool_cents)} prize</span>}
                        </div>
                        {t.rejected_reason && (
                          <div className="text-xs text-red-400 mt-1">Rejected: {t.rejected_reason}</div>
                        )}
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        {t.status === "pending_approval" && (
                          <button onClick={() => approveTournament(t.id)} disabled={actioning === t.id}
                            className="h-8 px-3 rounded-full bg-primary/10 text-primary border border-primary/30 text-xs font-mono hover:bg-primary hover:text-primary-foreground transition-colors disabled:opacity-50">
                            {actioning === t.id ? "…" : "Approve"}
                          </button>
                        )}
                        <Link href={`/tournaments/${t.id}`} target="_blank">
                          <button className="h-8 w-8 rounded-full border border-border hover:bg-secondary flex items-center justify-center transition-colors">
                            <ArrowSquareOut size={13} />
                          </button>
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Finance ── */}
          {navSection === "finance" && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "Gross Revenue", value: fmt(totalRevenue), sub: "all-time entry fees" },
                  { label: "Platform (5%)", value: fmt(platformRevenue), sub: "DBPB earnings" },
                  { label: "Director Payouts", value: fmt(totalRevenue - platformRevenue), sub: "owed to directors" },
                  { label: "Live Tournaments", value: liveTournaments.length, sub: `${tournaments.length} total` },
                ].map((s) => (
                  <div key={s.label} className="rounded-2xl border border-border bg-card p-5">
                    <div className="font-display text-3xl tracking-wide">{s.value}</div>
                    <div className="font-mono text-[10px] tracking-widest text-muted-foreground mt-1">{s.label.toUpperCase()}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{s.sub}</div>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-border bg-card p-6">
                <h3 className="font-semibold mb-1">Revenue by Tournament</h3>
                <p className="text-xs text-muted-foreground mb-6">All tournaments with entry fee income</p>
                <div className="space-y-3 overflow-x-auto">
                  <div className="min-w-[420px]">
                    {tournaments.filter((t) => t.spots_filled > 0).sort((a, b) => (b.spots_filled * b.entry_fee_cents) - (a.spots_filled * a.entry_fee_cents)).map((t) => {
                      const gross = t.spots_filled * t.entry_fee_cents;
                      const platform = Math.round(gross * 0.05);
                      const maxGross = Math.max(...tournaments.map((x) => x.spots_filled * x.entry_fee_cents), 1);
                      return (
                        <div key={t.id} className="flex items-center gap-4 py-2">
                          <div className="w-32 sm:w-44 text-sm truncate flex-shrink-0">{t.name}</div>
                          <div className="flex-1 h-2.5 bg-secondary rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${(gross / maxGross) * 100}%` }} />
                          </div>
                          <div className="font-mono text-xs text-muted-foreground w-14 text-right flex-shrink-0">{fmt(gross)}</div>
                          <div className="font-mono text-xs text-primary w-14 text-right flex-shrink-0">+{fmt(platform)}</div>
                          <div className="text-[10px] font-mono text-muted-foreground w-20 text-right flex-shrink-0">{t.director_name}</div>
                        </div>
                      );
                    })}
                    {tournaments.filter((t) => t.spots_filled > 0).length === 0 && (
                      <p className="text-sm text-muted-foreground py-4">No revenue yet.</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card p-6">
                <h3 className="font-semibold mb-4">Platform Fee Breakdown</h3>
                {[
                  { label: "Gross Entry Fees Collected", value: fmt(totalRevenue), note: "Sum of all confirmed registrations × entry fee" },
                  { label: "Platform Revenue (5%)", value: fmt(platformRevenue), note: "DreamBreakerPB earnings", highlight: true },
                  { label: "Director Payouts Due", value: fmt(totalRevenue - platformRevenue), note: "95% owed to directors after events" },
                ].map((r) => (
                  <div key={r.label} className={`flex items-center justify-between py-4 border-b border-border last:border-0 ${r.highlight ? "bg-primary/5 -mx-6 px-6 rounded" : ""}`}>
                    <div>
                      <div className={`font-semibold text-sm ${r.highlight ? "text-primary" : ""}`}>{r.label}</div>
                      <div className="text-xs text-muted-foreground">{r.note}</div>
                    </div>
                    <div className={`font-mono font-bold text-lg ${r.highlight ? "text-primary" : ""}`}>{r.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Communications ── */}
          {navSection === "comms" && (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              {/* Compose */}
              <div className="lg:col-span-3 space-y-4">
                <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Megaphone size={16} className="text-primary" />
                    <h3 className="font-display text-xl tracking-wide">COMPOSE MESSAGE</h3>
                  </div>
                  <p className="text-xs text-muted-foreground">Messages are queued and sent via email. In-app messaging coming soon.</p>

                  {/* Recipient type */}
                  <div>
                    <label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-2">SEND TO</label>
                    <div className="flex gap-2 flex-wrap">
                      {([
                        { value: "all", label: `All Users (${profiles.length})` },
                        { value: "directors", label: `All Directors (${directors.length})` },
                        { value: "individual", label: "Individual" },
                      ] as const).map((opt) => (
                        <button key={opt.value} onClick={() => setComposeRecipientType(opt.value)}
                          className={`h-9 px-4 rounded-full text-sm border transition-colors ${composeRecipientType === opt.value ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-secondary"}`}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Individual search */}
                  {composeRecipientType === "individual" && (
                    <div>
                      <label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1.5">SELECT RECIPIENT</label>
                      <select value={composeRecipientId} onChange={(e) => setComposeRecipientId(e.target.value)}
                        className="w-full h-11 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring">
                        <option value="">— Select user —</option>
                        {profiles.map((p) => (
                          <option key={p.id} value={p.id}>{p.full_name ?? "No name"} ({p.email}) · {p.role}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1.5">SUBJECT</label>
                    <input value={composeSubject} onChange={(e) => setComposeSubject(e.target.value)} placeholder="e.g. Important update from DreamBreakerPB"
                      className="w-full h-11 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" />
                  </div>

                  <div>
                    <label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1.5">MESSAGE</label>
                    <textarea value={composeBody} onChange={(e) => setComposeBody(e.target.value)} rows={6}
                      placeholder="Write your message here…"
                      className="w-full rounded-xl bg-secondary border border-border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring resize-none" />
                  </div>

                  {/* Email list preview */}
                  <div>
                    <button onClick={() => setShowEmailList(!showEmailList)} className="text-xs text-primary font-mono hover:underline flex items-center gap-1">
                      {showEmailList ? "Hide" : "Preview"} recipient emails ({getRecipientEmails().length})
                    </button>
                    {showEmailList && (
                      <div className="mt-2 p-3 rounded-xl bg-secondary border border-border text-xs text-muted-foreground break-all max-h-32 overflow-y-auto">
                        {getRecipientEmails().join(", ") || "No recipients"}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-3 pt-1">
                    <button onClick={() => {
                      const emails = getRecipientEmails();
                      if (emails.length > 0 && composeSubject && composeBody) {
                        window.open(`mailto:${emails.join(",")}?subject=${encodeURIComponent(composeSubject)}&body=${encodeURIComponent(composeBody)}`);
                      }
                    }} className="flex-1 h-11 rounded-full border border-border hover:bg-secondary text-sm font-display tracking-wider transition-colors flex items-center justify-center gap-2">
                      <Envelope size={14} /> OPEN IN EMAIL CLIENT
                    </button>
                    <button onClick={handleSendMessage} className="flex-1 h-11 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-display tracking-wider transition-colors flex items-center justify-center gap-2">
                      <Broadcast size={14} /> QUEUE &amp; SEND
                    </button>
                  </div>
                </div>
              </div>

              {/* Sent history */}
              <div className="lg:col-span-2 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <Clock size={13} className="text-muted-foreground" />
                  <span className="font-mono text-[10px] tracking-widest text-muted-foreground">MESSAGE HISTORY</span>
                </div>
                {messages.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border p-8 text-center">
                    <Envelope size={28} className="text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No messages sent yet.</p>
                  </div>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} className="rounded-2xl border border-border bg-card p-4">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="font-semibold text-sm truncate">{m.subject}</div>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border flex-shrink-0 ${m.type === "broadcast" ? "text-primary border-primary/30 bg-primary/10" : "text-muted-foreground border-border"}`}>
                          {m.type === "broadcast" ? "BROADCAST" : "DIRECT"}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mb-2">To: {m.toLabel}</div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{m.body}</p>
                      <div className="text-[10px] font-mono text-muted-foreground mt-2">{fmtTime(m.sentAt)}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ── Settings ── */}
          {navSection === "settings" && (
            <div className="space-y-6 max-w-2xl">
              <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
                <h3 className="font-semibold">Platform Configuration</h3>
                <div className="space-y-3">
                  {[
                    { label: "Platform Fee", value: "5%", note: "Applied to all entry fees" },
                    { label: "Hold Duration", value: "72 hours", note: "Default hold expiry window" },
                    { label: "Director Approval", value: "Manual", note: "Admins review all applications" },
                    { label: "Tournament Approval", value: "Manual", note: "All tournaments require approval before going live" },
                  ].map((s) => (
                    <div key={s.label} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                      <div>
                        <div className="font-medium text-sm">{s.label}</div>
                        <div className="text-xs text-muted-foreground">{s.note}</div>
                      </div>
                      <div className="font-mono text-sm text-primary">{s.value}</div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Configuration changes coming soon via admin API.</p>
              </div>

              <div className="rounded-2xl border border-border bg-card p-6 space-y-3">
                <h3 className="font-semibold">Platform Stats</h3>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: "Total Users", value: profiles.length },
                    { label: "Total Tournaments", value: tournaments.length },
                    { label: "Approved Directors", value: directors.filter((d) => d.director_status === "approved").length },
                    { label: "Live Events", value: liveTournaments.length },
                  ].map((s) => (
                    <div key={s.label} className="rounded-xl bg-secondary p-3">
                      <div className="font-display text-2xl">{s.value}</div>
                      <div className="font-mono text-[10px] tracking-widest text-muted-foreground mt-0.5">{s.label.toUpperCase()}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Messages ── */}
          {navSection === "messages" && currentUserId && (
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-xl tracking-wide">MESSAGES</h2>
                <p className="text-sm text-muted-foreground">Direct messaging with directors and users</p>
              </div>
              <MessagingPanel
                currentUserId={currentUserId}
                allUsers={allUsers}
                onUnreadChange={setMessagingUnread}
              />
            </div>
          )}

        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-card border-t border-border flex items-center justify-around px-1 py-2">
        {([
          { id: "dashboard" as NavSection, icon: Gauge, label: "Home", badge: 0 },
          { id: "approvals" as NavSection, icon: CheckFat, label: "Approvals", badge: pendingTournaments.length },
          { id: "users" as NavSection, icon: Users, label: "Users", badge: 0 },
          { id: "messages" as NavSection, icon: ChatCircleDots, label: "Msgs", badge: messagingUnread },
          { id: "comms" as NavSection, icon: Envelope, label: "Email", badge: 0 },
        ]).map(({ id, icon: Icon, label, badge }) => (
          <button key={id} onClick={() => setNavSection(id)}
            className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl transition-colors min-w-0 flex-1 relative ${navSection === id ? "text-primary" : "text-muted-foreground"}`}>
            <div className="relative">
              <Icon size={20} weight={navSection === id ? "fill" : "regular"} />
              {badge > 0 && (
                <span className={`absolute -top-1 -right-1.5 h-4 min-w-4 rounded-full text-[9px] font-mono flex items-center justify-center px-0.5 ${id === "approvals" ? "bg-amber-400 text-black" : "bg-primary text-primary-foreground"}`}>{badge > 9 ? "9+" : badge}</span>
              )}
            </div>
            <span className="text-[9px] font-mono tracking-wide truncate">{label.toUpperCase()}</span>
          </button>
        ))}
      </nav>

      {/* Reject modal */}
      {rejectTarget && (
        <RejectModal
          tournamentName={rejectTarget.name}
          onConfirm={(reason) => rejectTournament(rejectTarget.id, reason)}
          onClose={() => setRejectTarget(null)}
        />
      )}
    </div>
  );
}
