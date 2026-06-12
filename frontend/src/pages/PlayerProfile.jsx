import React from "react";
import { PageShell } from "../components/PageShell";
import { Button } from "../components/ui/button";
import { Medal, Trophy, MapPin, Hand, ShareNetwork, PencilSimple, Heart } from "@phosphor-icons/react";
import { playerStats, recentMatches, matchPartners } from "../data/mockData";

export default function PlayerProfile() {
  return (
    <PageShell>
      {/* Cover */}
      <section className="relative h-56 sm:h-64 bg-gradient-to-br from-primary/30 via-card to-background border-b border-border overflow-hidden">
        <div className="absolute inset-0 grain" />
        <div className="absolute top-4 right-4 flex gap-2">
          <Button variant="ghost" size="sm" className="rounded-full border border-border bg-background/70 backdrop-blur" data-testid="profile-share-btn"><ShareNetwork size={14} weight="bold" /> Share</Button>
          <Button size="sm" className="rounded-full bg-primary text-primary-foreground font-display tracking-[0.2em]" data-testid="profile-edit-btn"><PencilSimple size={14} weight="bold" /> EDIT</Button>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-16 relative">
        <div className="flex flex-col md:flex-row gap-6 items-start">
          <img src={playerStats.img} alt="" className="h-32 w-32 rounded-2xl object-cover border-4 border-background ring-2 ring-primary" />
          <div className="flex-1 pt-4">
            <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.3em] text-primary">/ PLAYER · ACTIVE</div>
            <h1 className="font-display text-5xl sm:text-6xl tracking-wide leading-none mt-1">{playerStats.name.toUpperCase()}</h1>
            <div className="flex flex-wrap gap-4 mt-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5"><MapPin size={14} weight="bold" />{playerStats.location}</span>
              <span className="flex items-center gap-1.5"><Hand size={14} weight="bold" />{playerStats.hand}-handed</span>
              <span className="flex items-center gap-1.5 font-mono">{playerStats.paddle}</span>
            </div>
          </div>
        </div>

        {/* Bio + Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
          <div className="lg:col-span-2 border border-border rounded-2xl p-6 bg-card">
            <h3 className="font-display text-2xl tracking-wide mb-3">BIO</h3>
            <p className="text-muted-foreground">{playerStats.bio}</p>
            <div className="grid grid-cols-3 gap-3 mt-6">
              {[
                { l: "DUPR", v: playerStats.dupr.toFixed(2), i: Medal },
                { l: "WINS", v: playerStats.wins, i: Trophy },
                { l: "EVENTS", v: playerStats.tournaments, i: Heart },
              ].map((s) => (
                <div key={s.l} className="border border-border rounded-xl p-4 text-center">
                  <s.i size={18} weight="fill" className="text-primary mx-auto mb-1" />
                  <div className="font-display text-3xl tracking-wide">{s.v}</div>
                  <div className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground">{s.l}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="border border-border rounded-2xl p-6 bg-card">
            <h3 className="font-display text-2xl tracking-wide mb-3">ACHIEVEMENTS</h3>
            <div className="space-y-3">
              {[
                { t: "Capital City Open Champ", d: "Doubles · Feb 2026" },
                { t: "Top 500 DUPR", d: "Jan 2026" },
                { t: "5 Event Streak", d: "Active" },
              ].map((a) => (
                <div key={a.t} className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/15 text-primary flex items-center justify-center"><Trophy size={16} weight="fill" /></div>
                  <div>
                    <div className="font-semibold text-sm">{a.t}</div>
                    <div className="text-[11px] font-mono text-muted-foreground">{a.d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Match history + partners */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 my-8">
          <div className="border border-border rounded-2xl bg-card">
            <div className="p-5 border-b border-border"><h3 className="font-display text-2xl tracking-wide">MATCH HISTORY</h3></div>
            <div className="divide-y divide-border">
              {recentMatches.map((m) => (
                <div key={m.id} className="p-4 flex items-center gap-3">
                  <div className={`h-8 w-8 rounded-full font-display flex items-center justify-center text-sm ${m.result === "W" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>{m.result}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">vs {m.opponent}</div>
                    <div className="text-[11px] font-mono text-muted-foreground">{m.event} · {m.date}</div>
                  </div>
                  <div className="font-mono text-sm">{m.score}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="border border-border rounded-2xl bg-card">
            <div className="p-5 border-b border-border"><h3 className="font-display text-2xl tracking-wide">FAVORITE PARTNERS</h3></div>
            <div className="divide-y divide-border">
              {matchPartners.slice(0, 4).map((p) => (
                <div key={p.id} className="p-4 flex items-center gap-3">
                  <img src={p.img} alt="" className="h-10 w-10 rounded-full object-cover" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{p.name}</div>
                    <div className="text-[11px] font-mono text-muted-foreground">DUPR {p.dupr} · {p.location}</div>
                  </div>
                  <Button size="sm" variant="ghost" className="rounded-full border border-border text-[10px] font-display tracking-[0.2em]" data-testid={`partner-invite-${p.id}`}>INVITE</Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
