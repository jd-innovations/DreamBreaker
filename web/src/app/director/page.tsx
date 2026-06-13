"use client";

import { useState } from "react";
import { Plus, Trophy, Users, CurrencyDollar, Lightning, WarningCircle, CheckCircle } from "@phosphor-icons/react";
import { toast } from "sonner";
import { PageShell } from "@/components/layout/page-shell";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { directorStats, directorTournaments } from "@/data/mock-data";

export default function DirectorPage() {
  const [showCreate, setShowCreate] = useState(false);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setShowCreate(false);
    toast.success("Tournament created!", { description: "It's now visible on the circuit page." });
  };

  return (
    <PageShell>
      <section className="border-b border-border bg-card/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex items-center justify-between">
          <div>
            <div className="font-mono text-[11px] tracking-[0.3em] text-primary mb-2">/ DIRECTOR PORTAL</div>
            <h1 className="font-display text-4xl sm:text-5xl tracking-wide">DIRECTOR DASHBOARD</h1>
          </div>
          <button onClick={() => setShowCreate(true)} className="hidden sm:flex rounded-full h-11 px-6 bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-[0.2em] text-sm items-center gap-2 transition-colors" data-testid="director-create-btn">
            <Plus size={16} weight="bold" /> NEW TOURNAMENT
          </button>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "TOURNAMENTS HOSTED", value: directorStats.tournamentsHosted, icon: Trophy },
            { label: "ACTIVE EVENTS", value: directorStats.activeTournaments, icon: Lightning },
            { label: "TOTAL PLAYERS", value: directorStats.totalPlayers.toLocaleString(), icon: Users },
            { label: "REVENUE", value: `$${directorStats.revenue.toLocaleString()}`, icon: CurrencyDollar },
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

          <TabsContent value="tournaments">
            <div className="border border-border rounded-2xl bg-card overflow-hidden">
              <div className="flex items-center justify-between p-5 border-b border-border">
                <h3 className="font-display text-xl tracking-wide">MY TOURNAMENTS</h3>
                <button onClick={() => setShowCreate(true)} className="sm:hidden rounded-full h-9 px-4 bg-primary text-primary-foreground font-display tracking-[0.15em] text-xs flex items-center gap-1.5" data-testid="director-create-mobile-btn"><Plus size={14} />NEW</button>
              </div>
              {directorTournaments.map((t) => {
                const pct = Math.round((t.registered / t.capacity) * 100);
                return (
                  <div key={t.id} className="p-5 border-b border-border last:border-0 flex flex-col sm:flex-row sm:items-center gap-3" data-testid={`director-tournament-${t.id}`}>
                    <div className="flex-1 min-w-0">
                      <div className="font-display text-xl tracking-wide">{t.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{t.date} · {t.registered}/{t.capacity} players</div>
                      <div className="h-1.5 w-full bg-secondary rounded-full mt-2 max-w-xs"><div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} /></div>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="mr-2">
                        <div className="font-mono text-xs text-muted-foreground">REVENUE</div>
                        <div className="font-mono font-bold text-primary">${t.revenue.toLocaleString()}</div>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-[10px] font-mono tracking-widest ${t.status === "Almost Full" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>{t.status.toUpperCase()}</span>
                      <button className="h-9 px-4 rounded-full border border-border hover:bg-secondary/60 text-sm font-semibold transition-colors" data-testid={`director-manage-${t.id}`}>Manage</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="players">
            <div className="border border-border rounded-2xl bg-card p-8 text-center text-muted-foreground">
              <Users size={32} weight="duotone" className="mx-auto mb-3 text-primary" />
              <div className="font-display text-2xl tracking-wide mb-1">PLAYER MANAGEMENT</div>
              <p className="text-sm">Select a tournament above to manage its player roster, add substitutes, and process no-shows.</p>
            </div>
          </TabsContent>

          <TabsContent value="revenue">
            <div className="border border-border rounded-2xl bg-card overflow-hidden">
              {[
                { label: "Entry Fees Collected", amount: directorStats.revenue * 0.85, note: "Net of platform fee" },
                { label: "Hold Fees Collected", amount: directorStats.upcomingHolds * 12, note: `${directorStats.upcomingHolds} pending holds` },
                { label: "Platform Fee (5%)", amount: -(directorStats.revenue * 0.05), note: "DBPB platform cut" },
              ].map((r, i) => (
                <div key={i} className="flex items-center justify-between p-5 border-b border-border last:border-0">
                  <div>
                    <div className="font-semibold">{r.label}</div>
                    <div className="text-xs text-muted-foreground">{r.note}</div>
                  </div>
                  <div className={`font-mono font-bold text-lg ${r.amount < 0 ? "text-destructive" : "text-primary"}`}>{r.amount < 0 ? "-" : ""}${Math.abs(r.amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                </div>
              ))}
              <div className="flex items-center justify-between p-5 bg-primary/5">
                <div className="font-display text-xl tracking-wide">NET PAYOUT</div>
                <div className="font-mono font-bold text-2xl text-primary">${Math.round(directorStats.revenue * 0.95).toLocaleString()}</div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" data-testid="create-tournament-dialog">
          <div className="w-full max-w-lg border border-border rounded-2xl bg-card p-6 shadow-2xl">
            <h2 className="font-display text-3xl tracking-wide mb-6">CREATE TOURNAMENT</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div><label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-1.5">NAME</label><input required placeholder="e.g. Spring Slam Open" className="w-full h-12 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" data-testid="create-name" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-1.5">DATE</label><input type="date" required className="w-full h-12 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" data-testid="create-date" /></div>
                <div><label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-1.5">CAPACITY</label><input type="number" required placeholder="32" className="w-full h-12 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" data-testid="create-capacity" /></div>
              </div>
              <div><label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-1.5">VENUE</label><input required placeholder="Arena name, City, State" className="w-full h-12 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" data-testid="create-venue" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-1.5">ENTRY FEE ($)</label><input type="number" required placeholder="75" className="w-full h-12 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" data-testid="create-entry-fee" /></div>
                <div><label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-1.5">HOLD FEE ($)</label><input type="number" required placeholder="10" className="w-full h-12 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" data-testid="create-hold-fee" /></div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="flex-1 h-12 rounded-full border border-border hover:bg-secondary/60 font-display tracking-[0.2em] text-sm transition-colors" data-testid="create-cancel-btn">CANCEL</button>
                <button type="submit" className="flex-1 h-12 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-[0.2em] text-sm transition-colors" data-testid="create-submit-btn">CREATE</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageShell>
  );
}
