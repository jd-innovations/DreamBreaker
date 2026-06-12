import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageShell } from "../components/PageShell";
import { MagnifyingGlass, MapPin, Calendar, Users, Trophy, FunnelSimple } from "@phosphor-icons/react";
import { Button } from "../components/ui/button";
import { tournaments } from "../data/mockData";

const formats = ["All", "Doubles", "Singles", "Mixed", "Juniors"];
const levels = ["All", "3.0 – 4.0", "3.5 – 4.5", "4.0 – 5.0", "4.5+", "U18"];

export default function Tournaments() {
  const [q, setQ] = useState("");
  const [format, setFormat] = useState("All");
  const [level, setLevel] = useState("All");

  const filtered = useMemo(() => {
    return tournaments.filter((t) => {
      const matchQ =
        !q ||
        t.name.toLowerCase().includes(q.toLowerCase()) ||
        t.location.toLowerCase().includes(q.toLowerCase());
      const matchFmt = format === "All" || t.format.toLowerCase().includes(format.toLowerCase());
      const matchLvl = level === "All" || t.level === level;
      return matchQ && matchFmt && matchLvl;
    });
  }, [q, format, level]);

  return (
    <PageShell>
      <section className="border-b border-border bg-card/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="font-mono text-[11px] tracking-[0.3em] text-primary mb-3">/ THE CIRCUIT</div>
          <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl tracking-wide">TOURNAMENTS</h1>
          <p className="text-muted-foreground mt-3 max-w-xl">
            {filtered.length} events across {new Set(tournaments.map(t => t.location.split(",")[1])).size} regions. Hold a spot, register your partner, lock your rank.
          </p>
        </div>
      </section>

      {/* Filters */}
      <section className="border-b border-border sticky top-16 z-30 bg-background/90 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col lg:flex-row gap-3 lg:items-center">
          <div className="relative flex-1">
            <MagnifyingGlass size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" weight="bold" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search tournaments, cities..."
              data-testid="tournament-search-input"
              className="w-full pl-11 pr-4 h-12 rounded-full bg-secondary border border-border outline-none text-sm focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <FunnelSimple size={18} weight="bold" className="text-muted-foreground hidden lg:block" />
            <div className="flex gap-1 overflow-x-auto scrollbar-hide">
              {formats.map((f) => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  data-testid={`filter-format-${f.toLowerCase()}`}
                  className={`px-4 h-10 rounded-full text-xs font-display tracking-[0.2em] whitespace-nowrap border transition-colors ${
                    format === f ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="hidden md:block h-6 w-px bg-border mx-1" />
            <div className="flex gap-1 overflow-x-auto scrollbar-hide">
              {levels.map((l) => (
                <button
                  key={l}
                  onClick={() => setLevel(l)}
                  data-testid={`filter-level-${l.replace(/\s|–|\+/g, "")}`}
                  className={`px-4 h-10 rounded-full text-xs font-mono whitespace-nowrap border transition-colors ${
                    level === l ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">No tournaments match your filters.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((t) => {
              const pct = Math.round((t.filled / t.spots) * 100);
              return (
                <div
                  key={t.id}
                  data-testid={`tournament-card-${t.id}`}
                  className="group border border-border rounded-2xl overflow-hidden bg-card hover:border-primary transition-all flex flex-col"
                >
                  <Link to={`/tournaments/${t.id}`} className="relative h-44 overflow-hidden block">
                    <img src={t.img} alt="" className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                    <div className="absolute top-3 left-3 flex gap-2">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-mono tracking-widest font-bold ${
                        t.status === "Filling Fast" ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"
                      }`}>
                        {t.status.toUpperCase()}
                      </span>
                      <span className="px-2.5 py-1 rounded-full bg-black/60 backdrop-blur text-white text-[10px] font-mono tracking-widest">
                        {t.level}
                      </span>
                    </div>
                    <div className="absolute bottom-3 left-3 right-3">
                      <div className="font-display text-2xl text-white tracking-wide leading-tight">{t.name}</div>
                      <div className="text-xs text-white/70 font-mono mt-1">{t.format}</div>
                    </div>
                  </Link>
                  <div className="p-5 space-y-2.5 flex-1 flex flex-col">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground"><MapPin size={14} weight="bold" />{t.location}</div>
                      <div className="flex items-center gap-2 text-muted-foreground"><Calendar size={14} weight="bold" />{t.date}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground flex items-center gap-1"><Users size={12} weight="bold" /> {t.filled}/{t.spots}</span>
                        <span className="font-mono text-muted-foreground">{pct}% FILLED</span>
                      </div>
                      <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div className="pt-3 mt-auto border-t border-border flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Trophy size={16} weight="fill" className="text-primary" />
                        <span className="font-display text-xl tracking-wide">{t.prize}</span>
                      </div>
                      <Link to={`/tournaments/${t.id}`}>
                        <Button size="sm" className="rounded-full bg-foreground text-background hover:bg-foreground/90 font-display tracking-[0.2em] text-[11px] px-4" data-testid={`tournament-view-${t.id}`}>
                          VIEW
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </PageShell>
  );
}
