"use client";

import { CheckCircle, Clock, ArrowRight } from "@phosphor-icons/react";
import { PageShell } from "@/components/layout/page-shell";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { bracketMatches, scheduleBlocks } from "@/data/mock-data";

type RawMatch = { id: string; p1: string; p2: string; s1: number | string; s2: number | string; winner: number };

function MatchNode({ m, label }: { m: RawMatch; label: string }) {
  const done = m.winner !== 0;
  return (
    <div className={`border rounded-xl bg-card overflow-hidden w-52 ${done ? "border-border" : "border-primary/50"}`} data-testid={`match-node-${m.id}`}>
      <div className="p-2 space-y-0.5">
        {[{ name: m.p1, score: m.s1, win: m.winner === 1 }, { name: m.p2, score: m.s2, win: m.winner === 2 }].map((p) => (
          <div key={p.name} className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg ${p.win ? "bg-primary/10" : ""}`}>
            <span className={`text-sm font-semibold truncate ${p.win ? "text-primary" : ""}`}>{p.name}</span>
            {done && <span className={`font-mono text-sm font-bold ml-2 ${p.win ? "text-primary" : "text-muted-foreground"}`}>{p.score}</span>}
          </div>
        ))}
      </div>
      <div className="px-3 py-1.5 border-t border-border bg-secondary/40 flex items-center gap-1.5">
        {done ? <CheckCircle size={12} weight="fill" className="text-primary" /> : <Clock size={12} weight="bold" className="text-muted-foreground" />}
        <span className="font-mono text-[10px] tracking-widest text-muted-foreground">{label} · {done ? "FINAL" : "UPCOMING"}</span>
      </div>
    </div>
  );
}

const rounds: Array<{ key: keyof typeof bracketMatches; label: string }> = [
  { key: "qf", label: "Quarterfinals" },
  { key: "sf", label: "Semifinals" },
  { key: "f", label: "Final" },
];

export default function BracketsPage() {
  return (
    <PageShell>
      <section className="border-b border-border bg-card/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="font-mono text-[11px] tracking-[0.3em] text-primary mb-2">/ LIVE DRAW</div>
          <h1 className="font-display text-4xl sm:text-5xl tracking-wide">BRACKETS</h1>
          <p className="text-muted-foreground text-sm mt-1.5">Miami Open Pro Doubles · Jun 8–9, 2025</p>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs defaultValue="bracket" className="w-full">
          <TabsList className="rounded-full p-1 h-11 mb-6 bg-secondary inline-flex">
            <TabsTrigger value="bracket" className="rounded-full px-5" data-testid="bracket-tab-bracket">Bracket</TabsTrigger>
            <TabsTrigger value="schedule" className="rounded-full px-5" data-testid="bracket-tab-schedule">Schedule</TabsTrigger>
          </TabsList>

          <TabsContent value="bracket">
            <div className="overflow-x-auto pb-4 scrollbar-hide">
              <div className="flex gap-12 items-start min-w-max">
                {rounds.map(({ key, label }, ri) => (
                  <div key={key} className="flex flex-col gap-6">
                    <div className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground px-2">{label.toUpperCase()}</div>
                    {(bracketMatches[key] as RawMatch[]).map((m) => (
                      <div key={m.id} className="relative">
                        <MatchNode m={m} label={label.slice(0, 2).toUpperCase()} />
                        {ri < rounds.length - 1 && (
                          <div className="absolute -right-8 top-1/2 -translate-y-1/2 text-muted-foreground"><ArrowRight size={16} /></div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="schedule">
            <div className="border border-border rounded-2xl bg-card overflow-hidden">
              {scheduleBlocks.map((block, i) => (
                <div key={i} className="flex gap-4 p-5 border-b border-border last:border-0">
                  <div className="w-28 flex-shrink-0">
                    <div className="font-mono text-sm font-bold text-primary">{block.time}</div>
                    <div className="text-xs text-muted-foreground">{block.court}</div>
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-sm">{block.match}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{block.round}</div>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </PageShell>
  );
}
