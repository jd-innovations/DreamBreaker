// /courts — the public court directory: search box, "near me", and every state.
// Server-rendered so the state list and search results are in the HTML.

import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo/site";
import { getDirectoryIndex, searchCourts, searchWords, stateHref } from "@/lib/courts/directory";
import { CourtSearchForm } from "@/components/courts/court-search-form";
import { CourtCard } from "@/components/courts/court-card";
import { NearMe } from "@/components/courts/near-me";

type Props = { searchParams: Promise<{ q?: string | string[] }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = await searchParams;
  const base = pageMetadata({
    title: "Pickleball Courts Near You — Pickleball App",
    description: "Find pickleball courts by city or ZIP: indoor and outdoor, public parks and clubs, with court counts and directions.",
    path: "/courts",
  });
  // A search result page is for the visitor, not for the index.
  return typeof q === "string" && q.trim() ? { ...base, robots: { index: false, follow: true } } : base;
}

export default async function CourtsPage({ searchParams }: Props) {
  const { q: rawQ } = await searchParams;
  const q = typeof rawQ === "string" ? rawQ.trim() : "";
  const searching = searchWords(q).length > 0;

  const [index, results] = await Promise.all([
    getDirectoryIndex(),
    searching ? searchCourts(q) : Promise.resolve(null),
  ]);
  const total = index.states.reduce((n, s) => n + s.count, 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="space-y-2">
        <h1 className="font-display text-3xl tracking-wide sm:text-4xl">Pickleball courts</h1>
        <p className="text-muted-foreground">
          {total.toLocaleString()} places to play across {index.states.length} states and territories.
        </p>
      </header>

      <div className="mt-6 space-y-4">
        <CourtSearchForm defaultValue={q} />
        <NearMe />
      </div>

      {results && (
        <section className="mt-8" aria-label="Search results">
          <h2 className="text-lg font-semibold">
            {results.length === 0
              ? `No courts match “${q}”`
              : `${results.length}${results.length === 60 ? "+" : ""} result${results.length === 1 ? "" : "s"} for “${q}”`}
          </h2>
          {results.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Try a city name, a ZIP code, or fewer words.</p>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {results.map((c) => <CourtCard key={c.id} court={c} />)}
            </div>
          )}
        </section>
      )}

      <section className="mt-10 rounded-2xl border border-border p-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
        <div>
          <h2 className="font-semibold">Know a court that isn&apos;t listed?</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Add it for other players. Every submission is reviewed before it goes live.</p>
        </div>
        <Link href="/courts/suggest"
          className="mt-3 inline-flex h-10 shrink-0 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 sm:mt-0">
          Add a court
        </Link>
      </section>

      <section className="mt-10" aria-label="Browse by state">
        <h2 className="text-lg font-semibold">Browse by state</h2>
        <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {index.states.map((s) => (
            <li key={s.state}>
              <Link
                href={stateHref(s.state)}
                className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5 text-sm transition hover:border-primary/50 hover:bg-secondary/40"
              >
                <span className="font-medium">{s.name}</span>
                <span className="text-muted-foreground">{s.count.toLocaleString()}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
