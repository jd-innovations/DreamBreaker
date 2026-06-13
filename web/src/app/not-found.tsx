import Link from "next/link";
import { ArrowLeft, SmileyMeh } from "@phosphor-icons/react/dist/ssr";
import { PageShell } from "@/components/layout/page-shell";

export default function NotFound() {
  return (
    <PageShell>
      <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 text-center">
        <SmileyMeh size={56} weight="duotone" className="text-primary mb-6" />
        <div className="font-mono text-[11px] tracking-[0.35em] text-primary mb-3">ERROR 404</div>
        <h1 className="font-display text-7xl sm:text-9xl tracking-wide">OUT OF BOUNDS</h1>
        <p className="text-muted-foreground mt-4 max-w-sm">
          That page doesn&apos;t exist. Maybe you faulted on the serve. Head back to the court.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 mt-10">
          <Link href="/">
            <button className="rounded-full h-13 px-8 bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-[0.2em] flex items-center gap-2 transition-colors">
              <ArrowLeft size={16} weight="bold" /> BACK TO HOME
            </button>
          </Link>
          <Link href="/tournaments">
            <button className="rounded-full h-13 px-8 border border-border hover:bg-secondary/60 font-display tracking-[0.2em] transition-colors">
              VIEW TOURNAMENTS
            </button>
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
