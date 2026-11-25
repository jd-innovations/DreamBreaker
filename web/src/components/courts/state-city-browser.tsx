"use client";

import { useState } from "react";
import Link from "next/link";
import { CourtSearchForm } from "./court-search-form";

/**
 * State page body: the search box (state results first) plus the city tiles,
 * which filter as the visitor types. Every city stays in the server-rendered
 * HTML, so search engines and no-JS visitors still get the full list.
 */
export function StateCityBrowser({
  state, stateName, cities,
}: {
  state: string;
  stateName: string;
  cities: { city: string; slug: string; count: number; href: string }[];
}) {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const shown = term.length >= 2 ? cities.filter((c) => c.city.toLowerCase().includes(term)) : cities;

  return (
    <>
      <div className="mt-6">
        <CourtSearchForm state={state} stateName={stateName} onQueryChange={setQ} />
      </div>
      {term.length >= 2 && (
        <p className="mt-4 text-sm text-muted-foreground">
          {shown.length ? `${shown.length} ${shown.length === 1 ? "city matches" : "cities match"} “${q.trim()}”` : `No city in ${stateName} matches “${q.trim()}”. Courts that match are listed under the search box.`}
        </p>
      )}
      <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((c) => (
          <li key={c.slug}>
            <Link
              href={c.href}
              className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5 text-sm transition hover:border-primary/50 hover:bg-secondary/40"
            >
              <span className="truncate font-medium">{c.city}</span>
              <span className="ml-3 shrink-0 text-muted-foreground">{c.count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
