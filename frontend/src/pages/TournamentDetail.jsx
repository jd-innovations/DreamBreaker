import React, { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { PageShell } from "../components/PageShell";
import { Button } from "../components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { MapPin, Calendar, Users, Trophy, Lightning, ShieldCheck, Clock, Medal, CurrencyDollar } from "@phosphor-icons/react";
import { tournaments } from "../data/mockData";
import { HoldMySpotDialog } from "../components/HoldMySpotDialog";
import { toast } from "sonner";

export default function TournamentDetail() {
  const { id } = useParams();
  const t = tournaments.find((x) => x.id === id) || tournaments[0];
  const [holdOpen, setHoldOpen] = useState(false);
  const pct = Math.round((t.filled / t.spots) * 100);

  const handleRegister = () => {
    toast.success("Registration complete!", { description: `You're in for ${t.name}. Bracket releases 48h before play.` });
  };

  return (
    <PageShell>
      {/* Hero */}
      <section className="relative border-b border-border overflow-hidden">
        <div className="absolute inset-0">
          <img src={t.img} alt="" className="h-full w-full object-cover opacity-50 dark:opacity-60" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-background/30" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
          <Link to="/tournaments" className="font-mono text-[11px] tracking-[0.3em] text-primary mb-4 inline-block" data-testid="back-to-tournaments">
            ← BACK TO CIRCUIT
          </Link>
          <div className="flex flex-wrap gap-2 mb-4">
            <span className="px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-mono tracking-widest font-bold">{t.status.toUpperCase()}</span>
            <span className="px-3 py-1.5 rounded-full bg-secondary text-foreground text-[10px] font-mono tracking-widest">{t.level}</span>
            <span className="px-3 py-1.5 rounded-full bg-secondary text-foreground text-[10px] font-mono tracking-widest">{t.format.toUpperCase()}</span>
          </div>
          <h1 className="font-display text-5xl sm:text-7xl lg:text-8xl tracking-wide leading-[0.9] max-w-4xl">{t.name.toUpperCase()}</h1>
          <div className="flex flex-wrap gap-6 mt-6 text-sm">
            <div className="flex items-center gap-2"><MapPin size={16} weight="bold" className="text-primary" /><span>{t.venue}, {t.location}</span></div>
            <div className="flex items-center gap-2"><Calendar size={16} weight="bold" className="text-primary" /><span>{t.date}</span></div>
            <div className="flex items-center gap-2"><Trophy size={16} weight="fill" className="text-primary" /><span className="font-mono">{t.prize} prize pool</span></div>
          </div>
        </div>
      </section>

      {/* Main */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="rounded-full p-1 h-11 mb-6 bg-secondary">
              <TabsTrigger value="overview" data-testid="tab-overview" className="rounded-full px-5">Overview</TabsTrigger>
              <TabsTrigger value="schedule" data-testid="tab-schedule" className="rounded-full px-5">Schedule</TabsTrigger>
              <TabsTrigger value="prize" data-testid="tab-prize" className="rounded-full px-5">Prize</TabsTrigger>
              <TabsTrigger value="rules" data-testid="tab-rules" className="rounded-full px-5">Rules</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <div className="border border-border rounded-2xl p-6 bg-card">
                <h3 className="font-display text-2xl tracking-wide mb-3">ABOUT THIS EVENT</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  The {t.name} is part of the Dream Breaker PB Pro Circuit. {t.format} with players from across the region competing for {t.prize} in cash + sponsor prizes.
                  Pool play seeds into a knockout bracket. Live scoring on every court.
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "ENTRY FEE", value: `$${t.entryFee}` },
                  { label: "FORMAT", value: t.format.split("·")[0].trim() },
                  { label: "DRAW SIZE", value: t.spots },
                  { label: "DIRECTOR", value: t.director.split(" ")[0] },
                ].map((s) => (
                  <div key={s.label} className="border border-border rounded-xl p-4">
                    <div className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground">{s.label}</div>
                    <div className="font-display text-2xl tracking-wide mt-1">{s.value}</div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="schedule">
              <div className="border border-border rounded-2xl divide-y divide-border bg-card">
                {["Check-in 7:00 AM", "Pool Play 8:00 AM – 12:00 PM", "Lunch 12:00 PM", "Knockouts 1:00 PM – 5:00 PM", "Finals 5:30 PM", "Awards 7:00 PM"].map((row, i) => (
                  <div key={i} className="flex items-center gap-4 p-4">
                    <div className="font-mono text-xs text-primary w-8">{String(i + 1).padStart(2, "0")}</div>
                    <div className="font-semibold">{row}</div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="prize">
              <div className="border border-border rounded-2xl bg-card overflow-hidden">
                {[
                  { p: "1st Place", a: Math.round(t.entryFee * t.spots * 0.45), icon: Trophy },
                  { p: "2nd Place", a: Math.round(t.entryFee * t.spots * 0.25), icon: Medal },
                  { p: "3rd Place", a: Math.round(t.entryFee * t.spots * 0.15), icon: Medal },
                  { p: "4th Place", a: Math.round(t.entryFee * t.spots * 0.08), icon: Medal },
                ].map((row, i) => (
                  <div key={i} className="flex items-center justify-between p-5 border-b border-border last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/15 text-primary flex items-center justify-center">
                        <row.icon size={18} weight="fill" />
                      </div>
                      <span className="font-display text-xl tracking-wide">{row.p}</span>
                    </div>
                    <span className="font-mono font-bold text-primary text-lg">${row.a.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="rules">
              <div className="border border-border rounded-2xl p-6 bg-card space-y-3 text-sm text-muted-foreground">
                <p>· USAPA official rules. Rally scoring to 11, win by 2.</p>
                <p>· Players must check in 30 minutes prior to first match.</p>
                <p>· DUPR rating verified at registration. Sandbagging results in disqualification.</p>
                <p>· Hold My Spot fees are refundable up to 7 days before play.</p>
                <p>· {`Tournament director's decisions are final.`}</p>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Side: registration */}
        <aside className="lg:sticky lg:top-24 self-start">
          <div className="border border-border rounded-2xl bg-card p-6 space-y-5">
            <div>
              <div className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground mb-1">SPOTS</div>
              <div className="flex items-end justify-between">
                <div className="font-display text-5xl tracking-wide">{t.spots - t.filled}</div>
                <div className="text-sm text-muted-foreground">of {t.spots} left</div>
              </div>
              <div className="h-2 w-full bg-secondary rounded-full mt-3 overflow-hidden">
                <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-border">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Entry fee</span>
                <span className="font-mono font-bold">${t.entryFee}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Hold My Spot fee</span>
                <span className="font-mono font-bold text-primary">${t.holdFee}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Button
                onClick={() => setHoldOpen(true)}
                className="w-full h-12 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-[0.2em]"
                data-testid="hold-spot-trigger-btn"
              >
                <Lightning size={16} weight="fill" /> HOLD MY SPOT
              </Button>
              <Button
                onClick={handleRegister}
                variant="ghost"
                className="w-full h-12 rounded-full border border-border font-display tracking-[0.2em]"
                data-testid="register-now-btn"
              >
                REGISTER NOW · ${t.entryFee}
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border text-center">
              <div className="text-[10px] font-mono text-muted-foreground"><ShieldCheck size={14} weight="bold" className="mx-auto mb-1 text-primary" /> REFUNDABLE</div>
              <div className="text-[10px] font-mono text-muted-foreground"><Clock size={14} weight="bold" className="mx-auto mb-1 text-primary" /> 72H HOLD</div>
              <div className="text-[10px] font-mono text-muted-foreground"><CurrencyDollar size={14} weight="bold" className="mx-auto mb-1 text-primary" /> SECURE</div>
            </div>

            <Link to="/matchmaking">
              <Button variant="ghost" className="w-full h-11 rounded-full border border-dashed border-border font-semibold text-sm mt-2" data-testid="find-partner-link">
                Need a partner? Find one →
              </Button>
            </Link>
          </div>
        </aside>
      </section>

      <HoldMySpotDialog open={holdOpen} onOpenChange={setHoldOpen} tournament={t} />
    </PageShell>
  );
}
