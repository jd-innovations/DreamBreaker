// /courts/<state> — every city in a state with a court count. A hub page:
// "Pickleball courts in Florida".

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { pageMetadata } from "@/lib/seo/site";
import { STATE_NAMES, cityHref, getDirectoryIndex, stateFromParam, stateHref } from "@/lib/courts/directory";
import { StateCityBrowser } from "@/components/courts/state-city-browser";

export const revalidate = 3600;
export async function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ state: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const code = stateFromParam((await params).state);
  if (!code) return {};
  const index = await getDirectoryIndex();
  const count = index.states.find((s) => s.state === code)?.count ?? 0;
  const name = STATE_NAMES[code];
  return pageMetadata({
    title: `Pickleball Courts in ${name} — Pickleball App`,
    description: `${count.toLocaleString()} places to play pickleball in ${name}, by city: parks, clubs and indoor courts with court counts and directions.`,
    path: stateHref(code),
  });
}

export default async function StatePage({ params }: Props) {
  const code = stateFromParam((await params).state);
  if (!code) notFound();
  const index = await getDirectoryIndex();
  const cities = index.cities[code];
  if (!cities?.length) notFound();
  const total = cities.reduce((n, c) => n + c.count, 0);
  const name = STATE_NAMES[code];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <Link href="/courts" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={14} /> All states
      </Link>
      <header className="mt-4 space-y-2">
        <h1 className="font-display text-3xl tracking-wide sm:text-4xl">Pickleball courts in {name}</h1>
        <p className="text-muted-foreground">
          {total.toLocaleString()} places to play in {cities.length.toLocaleString()} {cities.length === 1 ? "city" : "cities"}.
        </p>
      </header>
      <StateCityBrowser
        state={code}
        stateName={name}
        cities={cities.map((c) => ({ city: c.city, slug: c.slug, count: c.count, href: cityHref(code, c.city) }))}
      />
    </div>
  );
}
