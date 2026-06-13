"use client";

import { useState } from "react";
import { Users, Trophy, CurrencyDollar, Lightning, ShieldCheck, WarningCircle, CheckCircle, X } from "@phosphor-icons/react";
import { toast } from "sonner";
import { PageShell } from "@/components/layout/page-shell";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { adminStats, adminUsers, tournaments } from "@/data/mock-data";

export default function AdminPage() {
  const [users, setUsers] = useState(adminUsers);

  const approve = (id: string) => {
    setUsers((u) => u.map((x) => x.id === id ? { ...x, status: "Active" } : x));
    toast.success("Director approved.");
  };

  const suspend = (id: string) => {
    setUsers((u) => u.map((x) => x.id === id ? { ...x, status: "Suspended" } : x));
    toast.error("User suspended.");
  };

  return (
    <PageShell>
      <section className="border-b border-border bg-card/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="font-mono text-[11px] tracking-[0.3em] text-primary mb-2">/ ADMIN PORTAL</div>
          <h1 className="font-display text-4xl sm:text-5xl tracking-wide">ADMIN DASHBOARD</h1>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { label: "TOTAL USERS", value: adminStats.totalUsers.toLocaleString(), icon: Users },
            { label: "ACTIVE PLAYERS", value: adminStats.activePlayers.toLocaleString(), icon: Lightning },
            { label: "DIRECTORS", value: adminStats.directors, icon: ShieldCheck },
            { label: "LIVE TOURNAMENTS", value: adminStats.liveTournaments, icon: Trophy },
            { label: "MONTHLY REVENUE", value: `$${(adminStats.monthlyRevenue / 1000).toFixed(1)}K`, icon: CurrencyDollar },
            { label: "HOLD FEES PENDING", value: `$${adminStats.holdFeesPending.toLocaleString()}`, icon: CurrencyDollar },
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

        <Tabs defaultValue="users" className="w-full">
          <TabsList className="rounded-full p-1 h-11 mb-6 bg-secondary inline-flex">
            <TabsTrigger value="users" className="rounded-full px-5" data-testid="admin-tab-users">Users</TabsTrigger>
            <TabsTrigger value="tournaments" className="rounded-full px-5" data-testid="admin-tab-tournaments">Tournaments</TabsTrigger>
            <TabsTrigger value="finance" className="rounded-full px-5" data-testid="admin-tab-finance">Finance</TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <div className="border border-border rounded-2xl bg-card overflow-hidden">
              <div className="p-5 border-b border-border">
                <h3 className="font-display text-xl tracking-wide">USER MANAGEMENT</h3>
              </div>
              {users.map((u) => (
                <div key={u.id} className="flex flex-wrap items-center gap-4 p-5 border-b border-border last:border-0" data-testid={`admin-user-${u.id}`}>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold">{u.name}</div>
                    <div className="text-xs text-muted-foreground">{u.role} · Joined {u.joined} · {u.tournaments} tournaments</div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-[10px] font-mono tracking-widest ${u.status === "Active" ? "bg-primary/10 text-primary" : u.status === "Pending" ? "bg-yellow-500/10 text-yellow-500" : "bg-destructive/10 text-destructive"}`}>
                    {u.status.toUpperCase()}
                  </span>
                  <div className="flex gap-2">
                    {u.status === "Pending" && (
                      <button onClick={() => approve(u.id)} className="h-8 px-3 rounded-full bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground font-semibold text-xs flex items-center gap-1 transition-all" data-testid={`admin-approve-${u.id}`}><CheckCircle size={14} />Approve</button>
                    )}
                    {u.status !== "Suspended" && (
                      <button onClick={() => suspend(u.id)} className="h-8 px-3 rounded-full bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground font-semibold text-xs flex items-center gap-1 transition-all" data-testid={`admin-suspend-${u.id}`}><X size={14} />Suspend</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="tournaments">
            <div className="border border-border rounded-2xl bg-card overflow-hidden">
              <div className="p-5 border-b border-border">
                <h3 className="font-display text-xl tracking-wide">ALL TOURNAMENTS</h3>
              </div>
              {tournaments.map((t) => {
                const pct = Math.round((t.filled / t.spots) * 100);
                return (
                  <div key={t.id} className="flex flex-wrap items-center gap-4 p-5 border-b border-border last:border-0" data-testid={`admin-tournament-${t.id}`}>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold">{t.name}</div>
                      <div className="text-xs text-muted-foreground">{t.location} · {t.date} · Dir: {t.director}</div>
                      <div className="h-1.5 w-full bg-secondary rounded-full mt-2 max-w-xs"><div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} /></div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm font-bold text-primary">{t.prize}</div>
                      <div className="text-xs text-muted-foreground">{t.filled}/{t.spots} players</div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-[10px] font-mono tracking-widest ${t.status === "Filling Fast" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>{t.status.toUpperCase()}</span>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="finance">
            <div className="border border-border rounded-2xl bg-card overflow-hidden">
              {[
                { label: "Gross Entry Fees", value: adminStats.monthlyRevenue, note: "This month" },
                { label: "Platform Revenue (5%)", value: Math.round(adminStats.monthlyRevenue * 0.05), note: "DBPB net" },
                { label: "Hold Fees Collected", value: adminStats.holdFeesPending, note: "Awaiting confirmations" },
                { label: "Director Payouts (due)", value: Math.round(adminStats.monthlyRevenue * 0.95), note: "To be disbursed" },
              ].map((r, i) => (
                <div key={i} className="flex items-center justify-between p-5 border-b border-border last:border-0">
                  <div>
                    <div className="font-semibold">{r.label}</div>
                    <div className="text-xs text-muted-foreground">{r.note}</div>
                  </div>
                  <div className="font-mono font-bold text-lg text-primary">${r.value.toLocaleString()}</div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </PageShell>
  );
}
