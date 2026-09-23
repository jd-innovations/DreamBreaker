"use client";

// Coach Marketplace discovery — /lessons. Public: a signed-out visitor can
// browse everything, and only buying needs an account (owner decision
// 2026-09-23). The route matches the app's own /lessons so a shared link works
// on either side.
//
// List and Map are two views of the same search. The map is public here,
// unlike the marketplace map, because a pin is a FACILITY — a venue already
// listed publicly — not a person.
//
// Filters live in the URL so a search survives a refresh and can be shared;
// the map's "See these lessons" link is just a /lessons?city= URL.

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { MagnifyingGlass, MapTrifold, Rows } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { INPUT_TEXT, SELECT } from "@/components/ui/field-classes";
import { cn } from "@/lib/utils";
import { OfferCard } from "@/components/coaching/offer-card";
import { LessonsMap, lessonsMapAvailable } from "@/components/coaching/lessons-map";
import {
  browseHref, fetchOffers, filtersFromParams, OFFER_PAGE_SIZE, OFFER_SORTS, OFFER_TYPES,
  type OfferCard as Offer, type OfferFilters,
} from "@/lib/coaching/browse";

export default function LessonsPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-4 py-10 text-sm text-muted-foreground sm:px-6">Loading…</div>}>
      <Lessons />
    </Suspense>
  );
}

function Lessons() {
  const router = useRouter();
  const params = useSearchParams();
  const filters = filtersFromParams(params);

  const [offers, setOffers] = useState<Offer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(filters.search);
  const [view, setView] = useState<"list" | "map">(params.get("view") === "map" ? "map" : "list");

  const mapOn = lessonsMapAvailable();

  const load = useCallback(async (f: OfferFilters) => {
    setLoading(true);
    const r = await fetchOffers(f);
    setLoading(false);
    if (!r.ok) { toast.error(r.message); return; }
    setOffers(r.data);
    setTotal(Number(r.data[0]?.total_count ?? 0));
  }, []);

  // load() flips `loading` before awaiting, which the cascading-render rule
  // flags. Same shape as /marketplace and the admin lists in this repo: the
  // URL is the source of truth for a search, so the fetch belongs to the
  // params changing, not to an event handler.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(filtersFromParams(params));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  function apply(overrides: Partial<OfferFilters>) {
    // Any filter change resets to page 1: page 3 of a different search is
    // nobody's intent.
    router.push(browseHref(filters, { page: 1, ...overrides }));
  }

  const pages = Math.max(1, Math.ceil(total / OFFER_PAGE_SIZE));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="font-heading text-4xl">Lessons</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Private lessons, clinics and camps from coaches near you. Browse freely — you only need an
        account to book.
      </p>

      {/* Search + filters */}
      <form
        className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_11rem_11rem_auto]"
        onSubmit={(e) => { e.preventDefault(); apply({ search }); }}
      >
        <div className="relative">
          <Label htmlFor="lesson-q" className="sr-only">Search lessons</Label>
          <MagnifyingGlass size={16} aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="lesson-q"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Coach, lesson or venue"
            className={cn(INPUT_TEXT, "pl-9")}
          />
        </div>

        <div>
          <Label htmlFor="lesson-type" className="sr-only">Type</Label>
          <select id="lesson-type" value={filters.type} className={SELECT}
            onChange={(e) => apply({ type: e.target.value })}>
            {OFFER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        <div>
          <Label htmlFor="lesson-sort" className="sr-only">Sort</Label>
          <select id="lesson-sort" value={filters.sort} className={SELECT}
            onChange={(e) => apply({ sort: e.target.value })}>
            {OFFER_SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        <Button type="submit" variant="secondary">Search</Button>
      </form>

      {/* The city filter only appears when one is set, since it arrives from
          the map rather than from a control the visitor hunts for. */}
      {filters.city && (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <span className="rounded-sm bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
            {filters.city}
          </span>
          <button type="button" onClick={() => apply({ city: "" })}
            className="text-xs text-muted-foreground underline-offset-4 hover:underline">
            Clear city
          </button>
        </div>
      )}

      <div className="mt-6 flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {loading ? "Loading…" : `${total} ${total === 1 ? "lesson" : "lessons"}`}
        </p>

        {mapOn && (
          <div className="inline-flex rounded-md border border-border bg-card p-1" role="group" aria-label="View">
            <Button type="button" size="sm" variant={view === "list" ? "secondary" : "ghost"}
              aria-pressed={view === "list"} onClick={() => setView("list")}>
              <Rows size={14} /> List
            </Button>
            <Button type="button" size="sm" variant={view === "map" ? "secondary" : "ghost"}
              aria-pressed={view === "map"} onClick={() => setView("map")}>
              <MapTrifold size={14} /> Map
            </Button>
          </div>
        )}
      </div>

      {view === "map" && mapOn ? (
        <div className="mt-4"><LessonsMap /></div>
      ) : (
        <>
          {!loading && offers.length === 0 && (
            <div className="mt-4 rounded-lg border border-border bg-card p-10 text-center text-sm text-muted-foreground">
              No lessons match that. Try a wider search.
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {offers.map((o) => <OfferCard key={o.id} offer={o} />)}
          </div>

          {pages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-3">
              <Button variant="secondary" disabled={filters.page <= 1}
                onClick={() => router.push(browseHref(filters, { page: filters.page - 1 }))}>
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">Page {filters.page} of {pages}</span>
              <Button variant="secondary" disabled={filters.page >= pages}
                onClick={() => router.push(browseHref(filters, { page: filters.page + 1 }))}>
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
