// /courts/<state>/<city> — every facility in one city. The page most likely to
// rank: "Pickleball courts in Sarasota, FL".

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { pageMetadata } from "@/lib/seo/site";
import { STATE_NAMES, cityHref, getDirectoryIndex, listCity, stateFromParam, stateHref } from "@/lib/courts/directory";
import { CourtCard } from "@/components/courts/court-card";

export const revalidate = 3600;
export async function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ state: string; city: string }> };

async function resolve(params: Props["params"]) {
  const p = await params;
  const code = stateFromParam(p.state);
  if (!code) return null;
  const index = await getDirectoryIndex();
  const city = index.cities[code]?.find((c) => c.slug === p.city);
  return city ? { code, city } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = await resolve(params);
  if (!r) return {};
  const where = `${r.city.city}, ${r.code}`;
  return pageMetadata({
    title: `Pickleball Courts in ${where} — Pickleball App`,
    description: `${r.city.count} place${r.city.count === 1 ? "" : "s"} to play pickleball in ${where}: court counts, indoor or outdoor, lights, and directions.`,
    path: cityHref(r.code, r.city.city),
  });
}

export default async function CityPage({ params }: Props) {
  const r = await resolve(params);
  if (!r) notFound();
  const courts = await listCity(r.code, r.city.spellings);
  if (courts.length === 0) notFound();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <Link href={stateHref(r.code)} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={14} /> {STATE_NAMES[r.code]}
      </Link>
      <header className="mt-4 space-y-2">
        <h1 className="font-display text-3xl tracking-wide sm:text-4xl">
          Pickleball courts in {r.city.city}, {r.code}
        </h1>
        <p className="text-muted-foreground">
          {courts.length} place{courts.length === 1 ? "" : "s"} to play.
        </p>
      </header>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {courts.map((c) => <CourtCard key={c.id} court={c} />)}
      </div>
    </div>
  );
}
