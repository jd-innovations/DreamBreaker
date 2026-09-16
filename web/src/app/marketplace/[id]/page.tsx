import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buildEntityMetadata } from "@/lib/og/metadata";
import { fetchMarketplaceListingOg } from "@/lib/og/fetchers";
import { formatCents } from "@shared/money";
import { ListingGallery } from "./listing-gallery";

/**
 * D1 of WEB_MOBILE_ALIGNMENT_PLAN.md: the one web stub that becomes a real
 * page (decision D3).
 *
 * WHY THIS ONE and not the other six. Every other MobileLinkFallback stub is a
 * link you only possess if you already use the app — a booking, a conversation,
 * a group. A marketplace listing is the one link someone pastes where the
 * RECIPIENT MAY NOT HAVE THE APP, and answering that with "install our app to
 * see the price" is how a seller loses a sale.
 *
 * READ-ONLY, deliberately. Making an offer, messaging the seller and editing a
 * listing all stay on mobile; this page shows what is for sale and hands off.
 * That is the whole of decision D3, and widening it is a product decision, not
 * a refactor.
 *
 * A SERVER COMPONENT, unlike the other detail pages here, which are fully
 * client-rendered. The audience is someone opening a pasted link on an unknown
 * connection, so price and title should paint without waiting for a bundle.
 * Only the photo gallery ships JavaScript.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const payload = await fetchMarketplaceListingOg(id);
  return buildEntityMetadata("marketplace", id, payload);
}

// What an ANONYMOUS visitor is allowed to read. Not an arbitrary subset: these
// are exactly the columns granted to `anon` on marketplace_listings. Adding
// `condition` or `fulfillment` here — both genuinely useful to a buyer —
// requires widening that grant, which is a security decision rather than a
// query change, so the page is built to be correct without them.
const LISTING_COLUMNS =
  "id, title, description, asking_price_cents, location_city, location_state, status";

export default async function MarketplaceListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: listing } = await supabase
    .from("marketplace_listings")
    .select(LISTING_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  // RLS returns active listings, plus the seller's own. So a sold or expired
  // listing is indistinguishable from one that never existed, for a visitor
  // who is not the seller — and 404 is the honest answer to "I cannot show you
  // this", rather than inventing a "no longer available" state we cannot
  // actually verify.
  if (!listing) notFound();

  const { data: photos } = await supabase
    .from("marketplace_listing_photos")
    .select("id, url")
    .eq("listing_id", id)
    .order("sort_order", { ascending: true });

  const location = [listing.location_city, listing.location_state]
    .filter(Boolean)
    .join(", ");
  const appUrl = `https://pickleballapp.app/marketplace/${encodeURIComponent(id)}`;
  const isSold = listing.status === "sold";

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
        <p className="font-mono text-xs uppercase tracking-[0.28em] text-primary">
          Pickleball App Marketplace
        </p>

        {/* Two columns on desktop, stacked on a phone. The plan's pattern
            mapping: mobile's stacked scroll becomes a responsive layout, not a
            stretched phone. */}
        <div className="mt-6 grid gap-8 lg:grid-cols-2 lg:gap-12">
          <ListingGallery photos={photos ?? []} title={listing.title} />

          <div className="space-y-6">
            <div>
              <h1 className="font-display text-3xl leading-tight tracking-wide sm:text-4xl">
                {listing.title}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="font-display text-3xl text-primary">
                  {formatCents(listing.asking_price_cents, { omitZeroCents: true })}
                </span>
                {isSold && (
                  <span className="rounded-full border border-border bg-muted/40 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    Sold
                  </span>
                )}
              </div>
              {location && (
                <p className="mt-2 text-sm text-muted-foreground">{location}</p>
              )}
            </div>

            {listing.description?.trim() && (
              <div>
                <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Description
                </h2>
                {/* whitespace-pre-line: sellers type line breaks and losing
                    them turns a spec list into a paragraph. */}
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-foreground/90">
                  {listing.description}
                </p>
              </div>
            )}

            <div className="space-y-3 rounded-2xl border border-border bg-card/60 p-5">
              <p className="text-sm text-muted-foreground">
                {isSold
                  ? "This paddle has been sold. Browse the rest of the marketplace in the app."
                  : "Offers and messages with the seller happen in the app."}
              </p>
              <a
                href={appUrl}
                className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-6 font-display text-sm tracking-[0.18em] text-primary-foreground transition hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {isSold ? "Open in app" : "Make an offer in the app"}
              </a>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
