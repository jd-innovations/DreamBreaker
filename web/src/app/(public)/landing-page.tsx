import Link from "next/link";
import { ArrowRight, Plus, Heart, Lightning, Trophy, Users, MapPin, Calendar } from "@phosphor-icons/react/dist/ssr";
import { PageShell } from "@/components/layout/page-shell";
import { tournaments, HERO_IMG } from "@/data/mock-data";

const stats = [
  { label: "ACTIVE PLAYERS", value: "12,480" },
  { label: "LIVE TOURNAMENTS", value: "184" },
  { label: "PARTNERS MATCHED", value: "3,210" },
  { label: "PRIZE PAID '25", value: "$1.2M" },
];

const features = [
  { icon: Lightning, tag: "HOLD MY SPOT", title: "Reserve your slot in seconds", body: "Pay a small refundable fee to lock your tournament entry. Confirm later, no scramble." },
  { icon: Heart, tag: "MATCHMAKING", title: "Tinder-style partner finder", body: "Swipe through verified players by DUPR, distance and play style. Match. Compete." },
  { icon: Trophy, tag: "BRACKETS", title: "Live brackets & rankings", body: "Auto-generated draws. Real-time scoring. Auto-updated DUPR after every event." },
];

export default function LandingPage() {
  return (
    <PageShell>
      {/* HERO */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0">
          <img src={HERO_IMG} alt="" className="h-full w-full object-cover object-center opacity-50 dark:opacity-60" />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/85 to-background/20 dark:from-background dark:via-background/70 dark:to-transparent" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 mb-6">
              <span className="h-2 w-2 rounded-full bg-primary animate-pulse-glow" />
              <span className="font-mono text-[11px] tracking-[0.35em] text-primary">PICKLEBALL TOURNAMENTS</span>
            </div>
            <h1 className="font-display text-foreground text-6xl sm:text-7xl lg:text-8xl leading-[0.85] tracking-wide">
              PLAY.<br />COMPETE.<br /><span className="text-primary">HAVE FUN.</span>
            </h1>
            <div className="h-1 w-16 bg-primary my-7" />
            <p className="text-base sm:text-lg text-muted-foreground max-w-md">
              Compete in elite pickleball tournaments. Find partners. Hold your spot. Earn your rank. Make your mark.
            </p>
            <div className="mt-9 flex flex-col sm:flex-row gap-3 max-w-xl">
              <Link href="/tournaments" className="flex-1">
                <button className="w-full rounded-full h-14 bg-secondary/80 text-foreground hover:bg-secondary border border-border text-sm font-display tracking-[0.2em] flex items-center justify-between px-7 transition-colors" data-testid="hero-explore-btn">
                  EXPLORE TOURNAMENTS <ArrowRight size={18} weight="bold" />
                </button>
              </Link>
              <Link href="/director" className="flex-1">
                <button className="w-full rounded-full h-14 bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-display tracking-[0.2em] flex items-center justify-between px-7 transition-colors" data-testid="hero-create-btn">
                  CREATE TOURNAMENT <Plus size={18} weight="bold" />
                </button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* STATS */}
      <section className="border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 grid grid-cols-2 lg:grid-cols-4 gap-y-8">
          {stats.map((s) => (
            <div key={s.label} className="border-l-2 border-primary pl-4">
              <div className="font-display text-4xl lg:text-5xl tracking-wide">{s.value}</div>
              <div className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="flex items-end justify-between flex-wrap gap-4 mb-10">
          <div>
            <div className="font-mono text-[11px] tracking-[0.3em] text-primary mb-3">/ THE PLATFORM</div>
            <h2 className="font-display text-4xl sm:text-5xl lg:text-6xl tracking-wide max-w-xl">BUILT FOR PLAYERS<br />WHO CAME TO WIN.</h2>
          </div>
          <p className="text-sm text-muted-foreground max-w-sm">Three tools that change how you compete. No more spreadsheets, no more &quot;DM for partner&quot; posts, no more missed spots.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {features.map((f, i) => (
            <div key={f.title} data-testid={`feature-card-${i}`} className="border border-border rounded-2xl p-7 bg-card hover:border-primary transition-all duration-300 group">
              <div className="flex items-center justify-between mb-10">
                <div className="h-11 w-11 rounded-full bg-primary/15 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <f.icon size={22} weight="bold" />
                </div>
                <span className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground">{f.tag}</span>
              </div>
              <h3 className="font-display text-2xl tracking-wide mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURED TOURNAMENTS */}
      <section className="border-t border-border bg-card/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="flex items-end justify-between flex-wrap gap-4 mb-10">
            <div>
              <div className="font-mono text-[11px] tracking-[0.3em] text-primary mb-3">/ NOW OPEN</div>
              <h2 className="font-display text-4xl sm:text-5xl lg:text-6xl tracking-wide">FEATURED EVENTS</h2>
            </div>
            <Link href="/tournaments" className="font-display tracking-[0.2em] text-sm flex items-center gap-2 text-primary hover:gap-3 transition-all" data-testid="featured-viewall-link">
              VIEW ALL <ArrowRight size={16} weight="bold" />
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {tournaments.slice(0, 3).map((t) => (
              <Link key={t.id} href={`/tournaments/${t.id}`} data-testid={`featured-tournament-${t.id}`} className="group border border-border rounded-2xl overflow-hidden bg-card hover:border-primary transition-all">
                <div className="relative h-44 overflow-hidden">
                  <img src={t.img} alt="" className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                  <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-primary text-primary-foreground text-[10px] font-mono tracking-widest font-bold">{t.status.toUpperCase()}</div>
                  <div className="absolute bottom-3 left-3 right-3"><div className="font-display text-2xl text-white tracking-wide">{t.name}</div></div>
                </div>
                <div className="p-5 space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><MapPin size={14} weight="bold" /><span>{t.location}</span></div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><Calendar size={14} weight="bold" /><span>{t.date}</span></div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><Users size={14} weight="bold" /><span>{t.filled} / {t.spots} players</span></div>
                  <div className="pt-3 mt-2 border-t border-border flex items-center justify-between">
                    <span className="font-mono text-xs text-muted-foreground">PRIZE</span>
                    <span className="font-display text-xl text-primary tracking-wide">{t.prize}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="border border-border rounded-3xl p-10 lg:p-16 bg-card relative overflow-hidden">
          <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
          <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
            <div>
              <div className="font-mono text-[11px] tracking-[0.3em] text-primary mb-3">/ READY TO PLAY</div>
              <h2 className="font-display text-5xl lg:text-6xl tracking-wide leading-[0.95]">YOUR NEXT TROPHY<br />IS ONE SWIPE AWAY.</h2>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 lg:justify-end">
              <Link href="/matchmaking"><button className="rounded-full h-14 px-8 bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-[0.2em] transition-colors" data-testid="cta-matchmaking-btn">FIND PARTNER</button></Link>
              <Link href="/auth?mode=signup"><button className="rounded-full h-14 px-8 border border-border hover:bg-secondary/60 font-display tracking-[0.2em] transition-colors" data-testid="cta-signup-btn">CREATE ACCOUNT</button></Link>
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
