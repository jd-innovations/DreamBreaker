"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Lightning, MapPin, Calendar, Users, CurrencyDollar,
  Trophy, PencilSimple, CheckCircle, Clock, Warning, Trash,
  Plus, Star, Image, Globe, UploadSimple, X, FloppyDisk,
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
  profiles: { full_name: string | null; dupr_rating: number | null } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(cents: number) { return `$${(cents / 100).toFixed(0)}`; }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

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

// ── Page ─────────────────────────────────────────────────────────────────────

export default function DirectorTournamentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "sponsors" | "roster">("overview");

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

  const detailsFormRef = useRef<HTMLFormElement>(null);

  const load = useCallback(async () => {
    // `loading` initializes to true; the spinner shows until this resolves.
    try {
      const userId = await getUserId();
      if (!userId) { router.push("/auth"); return; }
      const supabase = createClient();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: t, error } = await (supabase as any)
        .from("tournaments")
        .select("id,name,city,state,venue_name,venue_address,zip_code,event_date,format,formats,draw_size,spots_filled,entry_fee_cents,hold_fee_cents,hold_duration_hours,prize_pool_cents,description,rules,cover_img_url,status,created_at")
        .eq("id", id)
        .eq("director_id", userId)
        .single();

      if (error || !t) { toast.error("Tournament not found or access denied."); router.push("/director"); return; }
      setTournament(t as Tournament);
      setBannerUrl((t as Tournament).cover_img_url ?? "");

      // Divisions
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: divs } = await (supabase as any)
        .from("divisions")
        .select("id,name,format,gender_category,draw_size,spots_filled,entry_fee_cents")
        .eq("tournament_id", id)
        .order("created_at", { ascending: true });
      setDivisions((divs ?? []) as Division[]);

      // Sponsors
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: spons } = await (supabase as any)
        .from("tournament_sponsors")
        .select("id,name,logo_url,website_url,tier,display_order")
        .eq("tournament_id", id)
        .order("display_order", { ascending: true });
      setSponsors((spons ?? []) as Sponsor[]);

      // Registrations
      const { data: regs } = await supabase
        .from("registrations")
        .select("id,player_id,status,division_id,created_at,profiles(full_name,dupr_rating)")
        .eq("tournament_id", id)
        .order("created_at", { ascending: true });
      setRegistrations((regs ?? []) as unknown as Registration[]);
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => { load(); }, [load]);

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
  const revenue = registrations.filter((r) => r.status === "registered").length * tournament.entry_fee_cents;

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
        {/* Dark overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />

        {/* Banner edit button */}
        <button
          onClick={() => setEditingBanner(true)}
          className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-background/80 backdrop-blur border border-border text-xs font-mono tracking-wider hover:bg-background transition-colors"
        >
          <UploadSimple size={13} weight="bold" /> CHANGE BANNER
        </button>

        {/* Status badge */}
        <div className="absolute top-4 left-4">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-mono tracking-wider ${STATUS_COLORS[tournament.status] ?? ""}`}>
            {tournament.status === "published" ? <Lightning size={11} weight="fill" /> : <Clock size={11} weight="bold" />}
            {STATUS_LABELS[tournament.status] ?? tournament.status.toUpperCase()}
          </span>
        </div>

        {/* Title over banner */}
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
            <p className="text-sm text-muted-foreground mb-4">Paste a direct image URL (JPG, PNG, WebP). Recommended size: 1600×600px.</p>
            <input
              type="url"
              value={bannerUrl}
              onChange={(e) => setBannerUrl(e.target.value)}
              placeholder="https://example.com/banner.jpg"
              className="w-full h-12 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring mb-4"
            />
            {bannerUrl && (
              <img src={bannerUrl} alt="Preview" className="w-full h-32 object-cover rounded-xl mb-4" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            )}
            <div className="flex gap-3">
              <button onClick={() => setEditingBanner(false)} className="flex-1 h-11 rounded-full border border-border hover:bg-secondary text-sm font-display tracking-wider transition-colors">CANCEL</button>
              <button onClick={saveBanner} disabled={savingBanner} className="flex-1 h-11 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-display tracking-wider transition-colors disabled:opacity-50">
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
        <div className="flex gap-1 border-b border-border mb-8">
          {(["overview", "sponsors", "roster"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2.5 font-mono text-xs tracking-widest transition-colors border-b-2 -mb-px ${activeTab === tab ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {tab.toUpperCase()}
              {tab === "sponsors" && sponsors.length > 0 && <span className="ml-1.5 text-primary">({sponsors.length})</span>}
              {tab === "roster" && registrations.length > 0 && <span className="ml-1.5 text-primary">({registrations.length})</span>}
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
                  <textarea name="description" rows={4} defaultValue={tournament.description ?? ""} placeholder="Tell players what makes this event special…" className="w-full rounded-xl bg-secondary border border-border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring resize-none" />
                </div>
                <div>
                  <label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1.5">RULES &amp; NOTES</label>
                  <textarea name="rules" rows={3} defaultValue={tournament.rules ?? ""} placeholder="Format, skill levels, scheduling notes…" className="w-full rounded-xl bg-secondary border border-border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring resize-none" />
                </div>
                <button type="submit" disabled={savingDetails} className="w-full h-11 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-[0.2em] text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  <FloppyDisk size={15} weight="bold" />
                  {savingDetails ? "SAVING…" : "SAVE CHANGES"}
                </button>
              </form>
            ) : (
              <>
                {/* Info grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
                    <h3 className="font-mono text-[10px] tracking-widest text-muted-foreground">EVENT INFO</h3>
                    <div className="flex items-start gap-3">
                      <Calendar size={16} className="text-primary mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="text-sm font-semibold">{fmtDate(tournament.event_date)}</div>
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
                        <div className="text-xs text-muted-foreground">Hold valid for {tournament.hold_duration_hours}h</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Users size={16} className="text-primary mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="text-sm font-semibold">{tournament.spots_filled} / {tournament.draw_size} spots filled</div>
                        <div className="w-full h-1.5 bg-secondary rounded-full mt-1.5">
                          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min(100, (tournament.spots_filled / tournament.draw_size) * 100)}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Divisions */}
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

                {/* Description */}
                {tournament.description && (
                  <div className="rounded-2xl border border-border bg-card p-5">
                    <h3 className="font-mono text-[10px] tracking-widest text-muted-foreground mb-3">DESCRIPTION</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{tournament.description}</p>
                  </div>
                )}

                {/* Rules */}
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
                  <button type="button" onClick={() => setShowSponsorForm(false)} className="flex-1 h-11 rounded-full border border-border hover:bg-secondary text-sm font-display tracking-wider transition-colors">CANCEL</button>
                  <button type="submit" disabled={addingSponsor} className="flex-1 h-11 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-display tracking-wider transition-colors disabled:opacity-50">
                    {addingSponsor ? "ADDING…" : "ADD"}
                  </button>
                </div>
              </form>
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
                        <div className="text-xs text-muted-foreground">{div?.name ?? "Open"} · DUPR {r.profiles?.dupr_rating ?? "—"}</div>
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
      </div>
    </PageShell>
  );
}
