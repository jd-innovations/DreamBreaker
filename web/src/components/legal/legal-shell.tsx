import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { LEGAL_LAST_UPDATED, LEGAL_ROUTES } from "@/lib/legal";

/**
 * Shared chrome and prose primitives for the legal documents. Tailwind's
 * typography plugin is not installed, so the element styles live here rather
 * than being repeated on every paragraph in every document.
 */

export function LegalShell({
  title,
  eyebrow = "LEGAL",
  intro,
  lastUpdated = LEGAL_LAST_UPDATED,
  children,
}: {
  title: string;
  eyebrow?: string;
  intro?: React.ReactNode;
  /** Pass null on pages that are not versioned documents, e.g. support. */
  lastUpdated?: string | null;
  children: React.ReactNode;
}) {
  return (
    <PageShell>
      <article className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
        <header className="border-b border-border pb-8 mb-10">
          <div className="font-mono text-[11px] tracking-[0.35em] text-primary mb-3">{eyebrow}</div>
          <h1 className="font-display text-5xl sm:text-6xl tracking-wide">{title}</h1>
          {lastUpdated && (
            <p className="font-mono text-xs text-muted-foreground mt-4">
              LAST UPDATED · {lastUpdated.toUpperCase()}
            </p>
          )}
          {intro && <div className="text-muted-foreground mt-6 leading-relaxed">{intro}</div>}
        </header>

        <div className="space-y-10">{children}</div>

        <footer className="mt-16 pt-8 border-t border-border flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Link href={LEGAL_ROUTES.terms} className="text-primary hover:underline">
            Terms of Service
          </Link>
          <Link href={LEGAL_ROUTES.privacy} className="text-primary hover:underline">
            Privacy Policy
          </Link>
          <Link href={LEGAL_ROUTES.deleteAccount} className="text-primary hover:underline">
            Delete Your Account
          </Link>
          <Link href={LEGAL_ROUTES.help} className="text-primary hover:underline">
            Support
          </Link>
        </footer>
      </article>
    </PageShell>
  );
}

export function Section({
  id,
  heading,
  children,
}: {
  id: string;
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 space-y-4">
      <h2 className="font-display text-2xl sm:text-3xl tracking-wide text-foreground">{heading}</h2>
      {children}
    </section>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">{children}</p>;
}

export function UL({ children }: { children: React.ReactNode }) {
  return (
    <ul className="list-disc pl-5 space-y-2 text-sm sm:text-base text-muted-foreground leading-relaxed marker:text-primary">
      {children}
    </ul>
  );
}

export function OL({ children }: { children: React.ReactNode }) {
  return (
    <ol className="list-decimal pl-5 space-y-2 text-sm sm:text-base text-muted-foreground leading-relaxed marker:text-primary marker:font-mono">
      {children}
    </ol>
  );
}

export function Strong({ children }: { children: React.ReactNode }) {
  return <strong className="text-foreground font-semibold">{children}</strong>;
}

/** A callout for things a reader must not miss (irreversible actions, etc.). */
export function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card px-5 py-4 text-sm sm:text-base text-muted-foreground leading-relaxed">
      {children}
    </div>
  );
}

/** Two-column data table used by the privacy policy's collection summary. */
export function DataTable({ rows }: { rows: { what: string; why: React.ReactNode }[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-secondary/50">
          <tr>
            <th className="font-display tracking-wider px-4 py-3 text-foreground w-1/3">DATA</th>
            <th className="font-display tracking-wider px-4 py-3 text-foreground">
              WHY WE PROCESS IT
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.what} className="border-t border-border align-top">
              <td className="px-4 py-3 text-foreground font-medium">{row.what}</td>
              <td className="px-4 py-3 text-muted-foreground leading-relaxed">{row.why}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
