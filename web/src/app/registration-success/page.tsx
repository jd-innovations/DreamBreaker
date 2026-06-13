import Link from "next/link";
import { CheckCircle, Calendar, MapPin, Trophy, ArrowRight, Users } from "@phosphor-icons/react/dist/ssr";
import { PageShell } from "@/components/layout/page-shell";
import { tournaments } from "@/data/mock-data";

export default function RegistrationSuccessPage() {
  const t = tournaments[0];

  return (
    <PageShell>
      <div className="max-w-lg mx-auto px-4 sm:px-6 py-16 text-center">
        <div className="h-20 w-20 rounded-full bg-primary/15 flex items-center justify-center mx-auto mb-6">
          <CheckCircle size={44} weight="fill" className="text-primary" />
        </div>
        <div className="font-mono text-[11px] tracking-[0.35em] text-primary mb-3">YOU&apos;RE IN</div>
        <h1 className="font-display text-5xl sm:text-6xl tracking-wide leading-[0.95]">REGISTRATION<br />CONFIRMED</h1>
        <p className="text-muted-foreground mt-4 text-sm">
          Your spot is locked. A confirmation email is on its way. Bracket releases 48h before play.
        </p>

        <div className="border border-border rounded-2xl bg-card p-6 mt-8 text-left space-y-3">
          <div className="font-display text-2xl tracking-wide mb-1">{t.name}</div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><MapPin size={14} weight="bold" className="text-primary" />{t.venue}, {t.location}</div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Calendar size={14} weight="bold" className="text-primary" />{t.date}</div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Trophy size={14} weight="fill" className="text-primary" />{t.prize} prize pool · {t.format}</div>
          <div className="h-px bg-border my-2" />
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Amount charged</span>
            <span className="font-mono font-bold">${t.entryFee}.00</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-8">
          <Link href="/matchmaking">
            <button className="w-full rounded-full h-12 bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-[0.2em] flex items-center justify-center gap-2 transition-colors" data-testid="success-find-partner-btn">
              <Users size={16} weight="bold" /> FIND PARTNER
            </button>
          </Link>
          <Link href="/dashboard">
            <button className="w-full rounded-full h-12 border border-border hover:bg-secondary/60 font-display tracking-[0.2em] flex items-center justify-center gap-2 transition-colors" data-testid="success-dashboard-btn">
              MY DASHBOARD <ArrowRight size={16} weight="bold" />
            </button>
          </Link>
        </div>

        <Link href="/tournaments" className="inline-block mt-5 text-xs text-muted-foreground hover:text-primary transition-colors" data-testid="success-browse-more-link">
          Browse more tournaments →
        </Link>
      </div>
    </PageShell>
  );
}
