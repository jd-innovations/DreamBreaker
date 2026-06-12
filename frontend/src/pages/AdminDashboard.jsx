import React from "react";
import { PageShell } from "../components/PageShell";
import { Button } from "../components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Users, Calendar, CurrencyDollar, Lightning, ShieldCheck, MagnifyingGlass, DotsThreeVertical, Pulse } from "@phosphor-icons/react";
import { adminStats, adminUsers, tournaments } from "../data/mockData";

export default function AdminDashboard() {
  return (
    <PageShell>
      <section className="border-b border-border bg-card/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="font-mono text-[11px] tracking-[0.3em] text-primary mb-2">/ PLATFORM ADMIN</div>
          <h1 className="font-display text-5xl sm:text-6xl tracking-wide">MISSION CONTROL</h1>
          <p className="text-muted-foreground text-sm mt-2">Real-time platform health, users, tournaments and revenue.</p>
        </div>
      </section>

      {/* Stats */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-2 lg:grid-cols-6 gap-4">
        {[
          { l: "TOTAL USERS", v: adminStats.totalUsers.toLocaleString(), i: Users },
          { l: "ACTIVE PLAYERS", v: adminStats.activePlayers.toLocaleString(), i: Pulse },
          { l: "DIRECTORS", v: adminStats.directors, i: ShieldCheck },
          { l: "LIVE EVENTS", v: adminStats.liveTournaments, i: Calendar },
          { l: "REVENUE / MO", v: `$${(adminStats.monthlyRevenue / 1000).toFixed(0)}k`, i: CurrencyDollar },
          { l: "HOLDS PENDING", v: `$${(adminStats.holdFeesPending / 1000).toFixed(1)}k`, i: Lightning },
        ].map((s) => (
          <div key={s.l} className="border border-border rounded-2xl p-5 bg-card">
            <div className="flex items-center justify-between mb-3">
              <span className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground">{s.l}</span>
              <s.i size={16} weight="bold" className="text-primary" />
            </div>
            <div className="font-display text-3xl tracking-wide">{s.v}</div>
          </div>
        ))}
      </section>

      {/* Tabs */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <Tabs defaultValue="users">
          <TabsList className="rounded-full p-1 h-11 mb-6 bg-secondary">
            <TabsTrigger value="users" data-testid="admin-tab-users" className="rounded-full px-5">Users</TabsTrigger>
            <TabsTrigger value="tournaments" data-testid="admin-tab-tournaments" className="rounded-full px-5">Tournaments</TabsTrigger>
            <TabsTrigger value="finance" data-testid="admin-tab-finance" className="rounded-full px-5">Finance</TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <div className="border border-border rounded-2xl bg-card overflow-hidden">
              <div className="p-4 border-b border-border flex items-center gap-3">
                <div className="relative flex-1">
                  <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" weight="bold" />
                  <input placeholder="Search users..." data-testid="admin-user-search" className="w-full pl-9 h-10 rounded-full bg-secondary border border-border outline-none text-sm focus:ring-2 focus:ring-primary" />
                </div>
                <Button className="rounded-full bg-foreground text-background hover:bg-foreground/90 font-display tracking-[0.2em]" data-testid="admin-export-users">EXPORT CSV</Button>
              </div>
              <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3 border-b border-border bg-secondary/40 font-mono text-[10px] tracking-[0.25em] text-muted-foreground">
                <div className="col-span-4">USER</div>
                <div className="col-span-2">ROLE</div>
                <div className="col-span-2">STATUS</div>
                <div className="col-span-2">JOINED</div>
                <div className="col-span-1">EVENTS</div>
                <div className="col-span-1 text-right">·</div>
              </div>
              {adminUsers.map((u) => (
                <div key={u.id} data-testid={`admin-user-${u.id}`} className="grid grid-cols-1 md:grid-cols-12 gap-4 px-6 py-4 border-b border-border last:border-0 items-center hover:bg-secondary/30 transition-colors">
                  <div className="col-span-4 flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center font-mono font-bold text-xs">{u.name.split(" ").map(n => n[0]).join("")}</div>
                    <div className="font-semibold">{u.name}</div>
                  </div>
                  <div className="col-span-2">
                    <span className={`text-[10px] font-mono tracking-widest px-2.5 py-1 rounded-full border ${
                      u.role === "Director" ? "border-primary text-primary" : "border-border text-muted-foreground"
                    }`}>{u.role.toUpperCase()}</span>
                  </div>
                  <div className="col-span-2">
                    <span className={`text-[10px] font-mono tracking-widest ${u.status === "Active" ? "text-primary" : "text-yellow-500"}`}>● {u.status.toUpperCase()}</span>
                  </div>
                  <div className="col-span-2 text-sm font-mono text-muted-foreground">{u.joined}</div>
                  <div className="col-span-1 font-mono">{u.tournaments}</div>
                  <div className="col-span-1 flex justify-end">
                    <button className="h-9 w-9 rounded-full hover:bg-secondary flex items-center justify-center" data-testid={`admin-user-actions-${u.id}`}><DotsThreeVertical size={18} weight="bold" /></button>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="tournaments">
            <div className="border border-border rounded-2xl bg-card overflow-hidden">
              {tournaments.slice(0, 5).map((t) => (
                <div key={t.id} className="p-5 border-b border-border last:border-0 flex items-center gap-4 hover:bg-secondary/30 transition-colors" data-testid={`admin-event-${t.id}`}>
                  <img src={t.img} alt="" className="h-14 w-14 rounded-xl object-cover" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold">{t.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{t.location} · {t.date} · {t.director}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-xs text-muted-foreground">{t.filled}/{t.spots} players</div>
                    <div className="font-display text-lg text-primary tracking-wide">{t.prize}</div>
                  </div>
                  <Button size="sm" variant="ghost" className="rounded-full border border-border font-display tracking-[0.2em] text-[10px]" data-testid={`admin-event-review-${t.id}`}>REVIEW</Button>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="finance">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {[
                { l: "GROSS MTD", v: "$142,800", d: "+18%" },
                { l: "PLATFORM FEE (12%)", v: "$17,136", d: "+18%" },
                { l: "DIRECTOR PAYOUTS", v: "$125,664", d: "+18%" },
              ].map((s) => (
                <div key={s.l} className="border border-border rounded-2xl p-6 bg-card">
                  <div className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground">{s.l}</div>
                  <div className="font-display text-4xl tracking-wide mt-2">{s.v}</div>
                  <div className="text-xs text-primary font-mono mt-1">{s.d} vs last month</div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </section>
    </PageShell>
  );
}
