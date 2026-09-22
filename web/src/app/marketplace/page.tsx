/**
 * Public marketplace browse — /marketplace.
 *
 * Extends decision D3 of WEB_MOBILE_ALIGNMENT_PLAN.md (the listing page is the
 * one real web surface) with the way to FIND listings, owner-approved
 * 2026-09-22. Still read-only: offers, messages and selling stay in the app.
 *
 * A SERVER COMPONENT, like the listing page: someone arriving from a search or
 * a shared link should see paddles and prices without waiting for a bundle.
 * Filters are a plain GET form, so the page works without JavaScript and every
 * filtered view is a URL.
 *
 * Data comes from browse_listings (20260922160100): the public read path, which
 * returns no seller, no coordinates and no minimum offer. The map is signed-in
 * only (owner decision) and uses the app's own search under the viewer's
 * session — see components/marketplace/marketplace-map.tsx.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, List, MapTrifold } from "@phosphor-icons/react/dist/ssr";
import { marketplaceConditionLabel, marketplaceFulfillmentLabel } from "@shared/marketplace";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { INPUT_TEXT, SELECT } from "@/components/ui/field-classes";
import { ListingCard, type BrowseListing } from "@/components/marketplace/listing-card";
import { MarketplaceMap } from "@/components/marketplace/marketplace-map";
import {
  browseArgs, browseHref, CONDITIONS, FULFILLMENTS, hasActiveFilters, pageCount,
  parseBrowseParams, SORT_LABEL, SORTS,
} from "@/lib/marketplace/browse";

export const metadata: Metadata = {
  title: "Marketplace — Pickleball App",
  description: "Used and new pickleball paddles for sale from players near you.",
};

const MAP_KEY_PRESENT = (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "").length > 0;

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const filters = parseBrowseParams(raw);
  const supabase = await createClient();

  const [{ data: rows, error }, { data: facets }, { data: auth }] = await Promise.all([
    supabase.rpc("browse_listings", browseArgs(filters)),
    supabase.rpc("browse_listing_filters"),
    supabase.auth.getUser(),
  ]);
  if (error) console.error("[marketplace] browse_listings failed", error.message);

  const listings = (rows ?? []) as BrowseListing[];
  const total = Number(rows?.[0]?.total_count ?? 0);
  const pages = pageCount(total);
  const brands = facets?.[0]?.brands ?? [];
  const states = facets?.[0]?.states ?? [];

  const signedIn = !!auth?.user;
  const mapOffered = MAP_KEY_PRESENT && signedIn;
  const showMap = mapOffered && raw.view === "map";
  const moreOpen = !!(filters.brand || filters.condition || filters.fulfillment || filters.state
    || filters.minDollars !== null || filters.maxDollars !== null);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <p className="font-mono text-xs uppercase tracking-[0.28em] text-primary">Pickleball App Marketplace</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl tracking-wide sm:text-5xl">Paddles for sale</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Browse here. Make an offer or message a seller in the Pickleball App.
            </p>
          </div>

          {mapOffered ? (
            <div className="inline-flex rounded-md border border-border bg-card p-1" role="group" aria-label="View">
              <Button asChild size="sm" variant={showMap ? "ghost" : "secondary"}>
                <Link href={browseHref(filters, { page: 1, view: "list" })} aria-current={!showMap ? "page" : undefined}>
                  <List size={16} /> List
                </Link>
              </Button>
              <Button asChild size="sm" variant={showMap ? "secondary" : "ghost"}>
                <Link href={browseHref(filters, { page: 1, view: "map" })} aria-current={showMap ? "page" : undefined}>
                  <MapTrifold size={16} /> Map
                </Link>
              </Button>
            </div>
          ) : MAP_KEY_PRESENT ? (
            <Link href="/auth?next=/marketplace" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
              Sign in to see listings on a map
            </Link>
          ) : null}
        </div>

        {/* Plain GET form: filters are the URL. */}
        <form action="/marketplace" method="get" className="mt-6 space-y-3 rounded-lg border border-border bg-card p-4">
          {showMap && <input type="hidden" name="view" value="map" />}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto]">
            <div className="space-y-1.5">
              <Label htmlFor="mk-q" className="sr-only">Search</Label>
              <Input id="mk-q" name="q" defaultValue={filters.q} placeholder="Search title, brand or model" className={INPUT_TEXT} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mk-sort" className="sr-only">Sort</Label>
              <select id="mk-sort" name="sort" defaultValue={filters.sort} className={SELECT}>
                {SORTS.map((s) => <option key={s} value={s}>{SORT_LABEL[s]}</option>)}
              </select>
            </div>
            <Button type="submit" variant="secondary">Search</Button>
          </div>

          <details open={moreOpen} className="group">
            <summary className="cursor-pointer select-none text-sm font-medium text-muted-foreground hover:text-foreground">
              More filters
            </summary>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="mk-brand">Brand</Label>
                <select id="mk-brand" name="brand" defaultValue={filters.brand} className={SELECT}>
                  <option value="">Any brand</option>
                  {brands.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mk-condition">Condition</Label>
                <select id="mk-condition" name="condition" defaultValue={filters.condition} className={SELECT}>
                  <option value="">Any condition</option>
                  {CONDITIONS.map((c) => <option key={c} value={c}>{marketplaceConditionLabel(c)}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mk-fulfillment">Pickup or shipping</Label>
                <select id="mk-fulfillment" name="fulfillment" defaultValue={filters.fulfillment} className={SELECT}>
                  <option value="">Either</option>
                  {FULFILLMENTS.map((f) => <option key={f} value={f}>{marketplaceFulfillmentLabel(f)}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mk-state">State</Label>
                <select id="mk-state" name="state" defaultValue={filters.state} className={SELECT}>
                  <option value="">Any state</option>
                  {states.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:col-span-1">
                <div className="space-y-1.5">
                  <Label htmlFor="mk-min">Min $</Label>
                  <Input id="mk-min" name="min" type="number" inputMode="numeric" min={0} defaultValue={filters.minDollars ?? ""} className={INPUT_TEXT} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mk-max">Max $</Label>
                  <Input id="mk-max" name="max" type="number" inputMode="numeric" min={0} defaultValue={filters.maxDollars ?? ""} className={INPUT_TEXT} />
                </div>
              </div>
            </div>
          </details>

          {hasActiveFilters(filters) && (
            <Link href={showMap ? "/marketplace?view=map" : "/marketplace"} className="inline-block text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              Clear filters
            </Link>
          )}
        </form>

        {showMap ? (
          <div className="mt-6">
            <MarketplaceMap filters={filters} />
          </div>
        ) : (
          <>
            <p className="mt-6 text-sm text-muted-foreground" aria-live="polite">
              {error
                ? "Listings couldn't be loaded. Try again in a moment."
                : `${total} listing${total === 1 ? "" : "s"}${hasActiveFilters(filters) ? " match" : ""}`}
            </p>

            {listings.length === 0 && !error ? (
              <div className="mt-4 rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
                {hasActiveFilters(filters) ? "Nothing matches those filters." : "Nothing is listed right now — check back soon."}
              </div>
            ) : (
              <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {listings.map((l) => (
                  <li key={l.id}><ListingCard listing={l} /></li>
                ))}
              </ul>
            )}

            {pages > 1 && (
              <nav className="mt-8 flex items-center justify-between gap-3" aria-label="Pages">
                {filters.page > 1 ? (
                  <Button asChild variant="outline">
                    <Link href={browseHref(filters, { page: filters.page - 1 })}><ArrowLeft size={16} /> Previous</Link>
                  </Button>
                ) : <span />}
                <span className="text-sm text-muted-foreground">Page {filters.page} of {pages}</span>
                {filters.page < pages ? (
                  <Button asChild variant="outline">
                    <Link href={browseHref(filters, { page: filters.page + 1 })}>Next <ArrowRight size={16} /></Link>
                  </Button>
                ) : <span />}
              </nav>
            )}
          </>
        )}
      </div>
    </main>
  );
}
