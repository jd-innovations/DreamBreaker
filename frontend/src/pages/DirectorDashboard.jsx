import React, { useState } from "react";
import { PageShell } from "../components/PageShell";
import { Button } from "../components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Plus, Users, CurrencyDollar, Trophy, Calendar, DotsThreeVertical, ChartLine, Lightning } from "@phosphor-icons/react";
import { directorStats, directorTournaments } from "../data/mockData";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";

export default function DirectorDashboard() {
  const [createOpen, setCreateOpen] = useState(false);

  const create = (e) => {
    e.preventDefault();
    setCreateOpen(false);
    toast.success("Tournament drafted!", { description: "Review and publish from the Tournaments tab." });
  };

  return (
    <PageShell>
      <section className="border-b border-border bg-card/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="font-mono text-[11px] tracking-[0.3em] text-primary mb-2">/ DIRECTOR HUB</div>
            <h1 className="font-display text-5xl sm:text-6xl tracking-wide leading-none">CONTROL ROOM</h1>
            <p className="text-muted-foreground text-sm mt-2">Marco Velasquez · 14 tournaments hosted · 4.9★ rating</p>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="rounded-full bg-primary text-primary-foreground h-12 px-6 font-display tracking-[0.2em]" data-testid="director-create-btn">
            <Plus size={18} weight="bold" /> CREATE TOURNAMENT
          </Button>
        </div>
      </section>

      {/* Stats */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: "ACTIVE", value: directorStats.activeTournaments, icon: Calendar },
          { label: "HOSTED", value: directorStats.tournamentsHosted, icon: Trophy },
          { label: "PLAYERS", value: directorStats.totalPlayers.toLocaleString(), icon: Users },
          { label: "REVENUE '25", value: `$${(directorStats.revenue / 1000).toFixed(1)}k`, icon: CurrencyDollar },
          { label: "HOLDS", value: directorStats.upcomingHolds, icon: Lightning },
        ].map((s) => (
          <div key={s.label} className="border border-border rounded-2xl p-5 bg-card">
            <div className="flex items-center justify-between mb-3">
              <span className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground">{s.label}</span>
              <s.icon size={16} weight="bold" className="text-primary" />
            </div>
            <div className="font-display text-4xl tracking-wide">{s.value}</div>
          </div>
        ))}
      </section>

      {/* Tabs */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <Tabs defaultValue="tournaments">
          <TabsList className="rounded-full p-1 h-11 mb-6 bg-secondary">
            <TabsTrigger value="tournaments" data-testid="dir-tab-tournaments" className="rounded-full px-5">Tournaments</TabsTrigger>
            <TabsTrigger value="players" data-testid="dir-tab-players" className="rounded-full px-5">Players</TabsTrigger>
            <TabsTrigger value="revenue" data-testid="dir-tab-revenue" className="rounded-full px-5">Revenue</TabsTrigger>
          </TabsList>

          <TabsContent value="tournaments">
            <div className="border border-border rounded-2xl bg-card overflow-hidden">
              <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3 border-b border-border bg-secondary/40 font-mono text-[10px] tracking-[0.25em] text-muted-foreground">
                <div className="col-span-4">EVENT</div>
                <div className="col-span-2">DATE</div>
                <div className="col-span-3">REGISTRATION</div>
                <div className="col-span-2">REVENUE</div>
                <div className="col-span-1 text-right">·</div>
              </div>
              {directorTournaments.map((t) => {
                const pct = Math.round((t.registered / t.capacity) * 100);
                return (
                  <div key={t.id} data-testid={`dir-tournament-${t.id}`} className="grid grid-cols-1 md:grid-cols-12 gap-4 px-6 py-4 border-b border-border last:border-0 items-center hover:bg-secondary/30 transition-colors">
                    <div className="col-span-4">
                      <div className="font-semibold">{t.name}</div>
                      <div className="text-[10px] font-mono text-muted-foreground tracking-widest">{t.status.toUpperCase()}</div>
                    </div>
                    <div className="col-span-2 font-mono text-sm">{t.date}</div>
                    <div className="col-span-3">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-mono">{t.registered}/{t.capacity}</span>
                        <span className="font-mono text-muted-foreground">{pct}%</span>
                      </div>
                      <div className="h-1.5 bg-secondary rounded-full overflow-hidden"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div>
                    </div>
                    <div className="col-span-2 font-display text-xl tracking-wide text-primary">${t.revenue.toLocaleString()}</div>
                    <div className="col-span-1 flex justify-end">
                      <button className="h-9 w-9 rounded-full hover:bg-secondary flex items-center justify-center" data-testid={`dir-actions-${t.id}`}><DotsThreeVertical size={18} weight="bold" /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="players">
            <div className="border border-border rounded-2xl bg-card p-10 text-center">
              <Users size={36} weight="bold" className="text-primary mx-auto mb-3" />
              <h3 className="font-display text-2xl tracking-wide">612 PLAYERS ACROSS 3 EVENTS</h3>
              <p className="text-sm text-muted-foreground mt-2">Player roster, communications and ranking tools live here.</p>
            </div>
          </TabsContent>

          <TabsContent value="revenue">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="border border-border rounded-2xl p-6 bg-card md:col-span-2">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-display text-2xl tracking-wide">REVENUE TREND</h3>
                  <ChartLine size={20} weight="bold" className="text-primary" />
                </div>
                <div className="flex items-end gap-2 h-40">
                  {[24, 38, 32, 51, 44, 67, 58, 72, 65, 81, 76, 92].map((v, i) => (
                    <div key={i} className="flex-1 bg-primary/30 rounded-t hover:bg-primary transition-colors relative group" style={{ height: `${v}%` }}>
                      <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 text-[10px] font-mono transition-opacity">${v * 100}</div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between mt-2 font-mono text-[10px] text-muted-foreground tracking-widest">
                  {["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"].map((m) => <span key={m}>{m}</span>)}
                </div>
              </div>
              <div className="border border-border rounded-2xl p-6 bg-card space-y-4">
                <h3 className="font-display text-2xl tracking-wide">PAYOUTS</h3>
                {[
                  { l: "Entry Fees", v: "$22,810" },
                  { l: "Hold Fees", v: "$4,640" },
                  { l: "Sponsorships", v: "$1,000" },
                ].map((r) => (
                  <div key={r.l} className="flex justify-between text-sm border-b border-border pb-3">
                    <span className="text-muted-foreground">{r.l}</span>
                    <span className="font-mono font-bold">{r.v}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-2">
                  <span className="font-display text-xl tracking-wide">TOTAL</span>
                  <span className="font-mono font-bold text-primary text-lg">${directorStats.revenue.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </section>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-xl border-border">
          <DialogHeader>
            <DialogTitle className="font-display text-3xl tracking-wide">CREATE TOURNAMENT</DialogTitle>
            <DialogDescription>Drafts go live after admin approval.</DialogDescription>
          </DialogHeader>
          <form onSubmit={create} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <Label className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground">EVENT NAME</Label>
                <Input required placeholder="e.g. Capital City Open" data-testid="create-name" className="bg-secondary border-border h-11 mt-1" />
              </div>
              <div>
                <Label className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground">CITY</Label>
                <Input required placeholder="Austin, TX" data-testid="create-city" className="bg-secondary border-border h-11 mt-1" />
              </div>
              <div>
                <Label className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground">DATE</Label>
                <Input type="date" required data-testid="create-date" className="bg-secondary border-border h-11 mt-1" />
              </div>
              <div>
                <Label className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground">ENTRY FEE ($)</Label>
                <Input type="number" required placeholder="65" data-testid="create-fee" className="bg-secondary border-border h-11 mt-1" />
              </div>
              <div>
                <Label className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground">DRAW SIZE</Label>
                <Input type="number" required placeholder="32" data-testid="create-draw" className="bg-secondary border-border h-11 mt-1" />
              </div>
            </div>
            <DialogFooter className="pt-3 gap-2">
              <Button type="button" variant="ghost" className="rounded-full" onClick={() => setCreateOpen(false)} data-testid="create-cancel-btn">Cancel</Button>
              <Button type="submit" className="rounded-full bg-primary text-primary-foreground font-display tracking-[0.2em] px-6" data-testid="create-submit-btn">CREATE DRAFT</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
