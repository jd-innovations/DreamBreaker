import React from "react";
import { PageShell } from "../components/PageShell";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Trophy, Clock, MapPin } from "@phosphor-icons/react";
import { bracketMatches, scheduleBlocks } from "../data/mockData";

const MatchNode = ({ m }) => (
  <div className="border border-border rounded-xl bg-card overflow-hidden w-56" data-testid={`bracket-match-${m.id}`}>
    {[
      { name: m.p1, score: m.s1, winner: m.winner === 1 },
      { name: m.p2, score: m.s2, winner: m.winner === 2 },
    ].map((row, i) => (
      <div key={i} className={`flex items-center justify-between px-3 py-2.5 text-sm ${i === 0 ? "border-b border-border" : ""} ${row.winner ? "bg-primary/10" : ""}`}>
        <span className={`truncate ${row.winner ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{row.name}</span>
        <span className={`font-mono ml-2 ${row.winner ? "text-primary font-bold" : "text-muted-foreground"}`}>{row.score}</span>
      </div>
    ))}
  </div>
);

export default function Brackets() {
  return (
    <PageShell>
      <section className="border-b border-border bg-card/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="font-mono text-[11px] tracking-[0.3em] text-primary mb-2">/ SUNSET SLAM OPEN · DOUBLES 4.5</div>
          <h1 className="font-display text-5xl sm:text-6xl tracking-wide">THE DRAW</h1>
          <p className="text-muted-foreground text-sm mt-2">Live brackets, scoring, and schedule. Center Court livestream available.</p>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs defaultValue="bracket">
          <TabsList className="rounded-full p-1 h-11 mb-6 bg-secondary">
            <TabsTrigger value="bracket" data-testid="bracket-tab-draw" className="rounded-full px-5">Bracket</TabsTrigger>
            <TabsTrigger value="schedule" data-testid="bracket-tab-schedule" className="rounded-full px-5">Schedule</TabsTrigger>
          </TabsList>

          <TabsContent value="bracket">
            <div className="overflow-x-auto pb-4">
              <div className="flex gap-12 min-w-max px-2">
                {/* QF */}
                <div className="flex flex-col gap-6 justify-around">
                  <div className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground mb-1">QUARTERFINALS</div>
                  <div className="space-y-5">{bracketMatches.qf.slice(0, 2).map((m) => <MatchNode key={m.id} m={m} />)}</div>
                  <div className="space-y-5">{bracketMatches.qf.slice(2).map((m) => <MatchNode key={m.id} m={m} />)}</div>
                </div>
                {/* SF */}
                <div className="flex flex-col gap-12 justify-around pt-12">
                  <div className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground mb-1">SEMIFINALS</div>
                  {bracketMatches.sf.map((m) => <MatchNode key={m.id} m={m} />)}
                </div>
                {/* F */}
                <div className="flex flex-col justify-center pt-12">
                  <div className="font-mono text-[10px] tracking-[0.3em] text-primary mb-1">FINAL</div>
                  {bracketMatches.f.map((m) => <MatchNode key={m.id} m={m} />)}
                  <div className="mt-6 text-center">
                    <div className="h-16 w-16 mx-auto rounded-full bg-primary/15 text-primary flex items-center justify-center mb-2"><Trophy size={28} weight="fill" /></div>
                    <div className="font-display text-2xl tracking-wide">CHAMPION</div>
                    <div className="text-xs text-muted-foreground font-mono">TBD</div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="schedule">
            <div className="border border-border rounded-2xl bg-card divide-y divide-border overflow-hidden">
              {scheduleBlocks.map((b, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-4" data-testid={`schedule-row-${i}`}>
                  <div className="h-12 w-20 rounded-xl bg-secondary flex flex-col items-center justify-center font-mono shrink-0">
                    <Clock size={12} weight="bold" className="text-primary mb-0.5" />
                    <span className="text-xs font-bold">{b.time}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold">{b.match}</div>
                    <div className="text-xs text-muted-foreground font-mono flex items-center gap-2 mt-0.5"><MapPin size={11} weight="bold" /> {b.court}</div>
                  </div>
                  <span className="text-[10px] font-mono tracking-widest px-2.5 py-1 rounded-full border border-border text-muted-foreground">{b.round}</span>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </section>
    </PageShell>
  );
}
