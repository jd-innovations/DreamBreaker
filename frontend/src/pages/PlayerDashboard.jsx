import React from "react";
import { Link } from "react-router-dom";
import { PageShell } from "../components/PageShell";
import { Button } from "../components/ui/button";
import { TrendUp, TrendDown, Trophy, Calendar, Heart, Lightning, ArrowRight, Medal } from "@phosphor-icons/react";
import { playerStats, upcomingForPlayer, recentMatches, tournaments } from "../data/mockData";

const StatCard = ({ label, value, sub, delta, icon: Icon }) => (
  <div className="border border-border rounded-2xl p-5 bg-card">
    <div className="flex items-center justify-between mb-3">
      <span className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground">{label}</span>
      <Icon size={16} weight="bold" className="text-primary" />
    </div>
    <div className="font-display text-4xl tracking-wide">{value}</div>
    {delta !== undefined && (
      <div className={`flex items-center gap-1 text-xs mt-2 font-mono ${delta >= 0 ? "text-primary" : "text-destructive"}`}>
        {delta >= 0 ? <TrendUp size={12} weight="bold" /> : <TrendDown size={12} weight="bold" />}
        {delta >= 0 ? "+" : ""}{delta} {sub}
      </div>
    )}
    {sub && delta === undefined && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
  </div>
);

export default function PlayerDashboard() {
  const winRate = Math.round((playerStats.wins / (playerStats.wins + playerStats.losses)) * 100);

  return (
    <PageShell>
      {/* Header */}
      <section className="border-b border-border bg-card/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex flex-col md:flex-row md:items-center gap-6">
          <img src={playerStats.img} alt="" className="h-24 w-24 rounded-2xl object-cover border-2 border-primary" />
          <div className="flex-1">
            <div className="font-mono text-[11px] tracking-[0.3em] text-primary mb-1">/ PLAYER DASHBOARD</div>
            <h1 className="font-display text-5xl sm:text-6xl tracking-wide leading-none">{playerStats.name.toUpperCase()}</h1>
            <div className="text-sm text-muted-foreground mt-1 font-mono">{playerStats.handle} · {playerStats.location}</div>
          </div>
          <div className="flex gap-2">
            <Link to="/profile"><Button variant="ghost" className="rounded-full border border-border font-display tracking-[0.2em]" data-testid="dashboard-profile-btn">PROFILE</Button></Link>
            <Link to="/matchmaking"><Button className="rounded-full bg-primary text-primary-foreground font-display tracking-[0.2em]" data-testid="dashboard-swipe-btn">FIND PARTNER</Button></Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="DUPR" value={playerStats.dupr.toFixed(2)} delta={playerStats.duprDelta} sub="this month" icon={Medal} />
        <StatCard label="GLOBAL RANK" value={`#${playerStats.ranking}`} delta={playerStats.rankingDelta} sub="positions" icon={Trophy} />
        <StatCard label="WIN RATE" value={`${winRate}%`} sub={`${playerStats.wins}W · ${playerStats.losses}L`} icon={TrendUp} />
        <StatCard label="PRIZE WON" value={`$${playerStats.prizeWon}`} sub={`${playerStats.tournaments} events`} icon={Lightning} />
      </section>

      {/* Body */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upcoming */}
        <div className="lg:col-span-2 space-y-6">
          <div className="border border-border rounded-2xl bg-card">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h3 className="font-display text-2xl tracking-wide">UPCOMING</h3>
              <Link to="/tournaments" className="text-xs font-mono text-primary tracking-widest" data-testid="upcoming-viewall">VIEW ALL →</Link>
            </div>
            <div className="divide-y divide-border">
              {upcomingForPlayer.map((u) => (
                <div key={u.id} className="p-5 flex items-center gap-4" data-testid={`upcoming-${u.id}`}>
                  <div className="h-12 w-12 rounded-xl bg-secondary flex flex-col items-center justify-center font-mono shrink-0">
                    <span className="text-[9px] text-muted-foreground">{u.date.split(" ")[0].toUpperCase()}</span>
                    <span className="text-lg font-bold leading-none">{u.date.split(" ")[1]}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{u.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">Partner: {u.partner}</div>
                  </div>
                  <span className={`text-[10px] font-mono tracking-widest px-2.5 py-1 rounded-full ${
                    u.status === "Registered" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground border border-border"
                  }`}>
                    {u.status.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent matches */}
          <div className="border border-border rounded-2xl bg-card">
            <div className="p-5 border-b border-border">
              <h3 className="font-display text-2xl tracking-wide">RECENT RESULTS</h3>
            </div>
            <div className="divide-y divide-border">
              {recentMatches.map((m) => (
                <div key={m.id} className="p-4 flex items-center gap-4" data-testid={`match-${m.id}`}>
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center font-display text-lg ${
                    m.result === "W" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                  }`}>
                    {m.result}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">vs {m.opponent}</div>
                    <div className="text-xs text-muted-foreground">{m.event} · {m.date}</div>
                  </div>
                  <div className="font-mono text-sm text-right">{m.score}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column */}
        <aside className="space-y-6">
          <div className="border border-border rounded-2xl p-5 bg-card">
            <h3 className="font-display text-2xl tracking-wide mb-3">QUICK ACTIONS</h3>
            <div className="space-y-2">
              <Link to="/tournaments"><Button className="w-full justify-between rounded-full bg-primary text-primary-foreground font-display tracking-[0.2em] h-11" data-testid="quick-find-tournaments"><span className="flex items-center gap-2"><Calendar size={16} weight="bold" /> FIND TOURNAMENT</span><ArrowRight size={14} weight="bold" /></Button></Link>
              <Link to="/matchmaking"><Button variant="ghost" className="w-full justify-between rounded-full border border-border h-11 font-display tracking-[0.2em]" data-testid="quick-find-partner"><span className="flex items-center gap-2"><Heart size={16} weight="bold" /> FIND PARTNER</span><ArrowRight size={14} weight="bold" /></Button></Link>
              <Link to="/brackets"><Button variant="ghost" className="w-full justify-between rounded-full border border-border h-11 font-display tracking-[0.2em]" data-testid="quick-brackets"><span className="flex items-center gap-2"><Trophy size={16} weight="bold" /> VIEW BRACKETS</span><ArrowRight size={14} weight="bold" /></Button></Link>
            </div>
          </div>

          <div className="border border-border rounded-2xl p-5 bg-card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-2xl tracking-wide">RECOMMENDED</h3>
              <Lightning size={18} weight="fill" className="text-primary" />
            </div>
            <div className="space-y-3">
              {tournaments.slice(0, 2).map((t) => (
                <Link key={t.id} to={`/tournaments/${t.id}`} className="block group" data-testid={`reco-${t.id}`}>
                  <div className="relative h-24 rounded-xl overflow-hidden">
                    <img src={t.img} alt="" className="h-full w-full object-cover group-hover:scale-105 transition-transform" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
                    <div className="absolute bottom-2 left-3 right-3 text-white">
                      <div className="font-display text-base tracking-wide">{t.name}</div>
                      <div className="text-[10px] font-mono text-white/70">{t.location} · {t.date}</div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </aside>
      </section>
    </PageShell>
  );
}
