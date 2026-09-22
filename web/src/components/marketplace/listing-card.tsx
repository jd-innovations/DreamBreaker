import Image from "next/image";
import Link from "next/link";
import { Tag } from "@phosphor-icons/react/dist/ssr";
import { formatCents } from "@shared/money";
import { marketplaceConditionLabel, marketplaceFulfillmentLabel } from "@shared/marketplace";

// One listing on the public browse grid. Only what browse_listings returns —
// no seller, no coordinates, no minimum offer. Links to the public listing page.

export type BrowseListing = {
  id: string;
  title: string;
  brand: string | null;
  model: string | null;
  condition: string;
  asking_price_cents: number;
  fulfillment: string;
  location_city: string | null;
  location_state: string | null;
  listed_on: string;
  photo_url: string | null;
};

function listedLabel(isoDate: string): string {
  // A calendar date (UTC), shown as a date — not converted to local time.
  const d = new Date(`${isoDate}T00:00:00Z`);
  return `Listed ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
}

export function ListingCard({ listing }: { listing: BrowseListing }) {
  const brandModel = [listing.brand, listing.model].filter(Boolean).join(" · ");
  const place = [listing.location_city, listing.location_state].filter(Boolean).join(", ");
  return (
    <Link
      href={`/marketplace/${listing.id}`}
      className="group block overflow-hidden rounded-lg border border-border bg-card text-card-foreground transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-muted">
        {listing.photo_url ? (
          <Image
            src={listing.photo_url}
            alt=""
            width={480}
            height={360}
            className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]"
          />
        ) : (
          <Tag size={28} weight="fill" className="text-muted-foreground" aria-hidden />
        )}
      </div>
      <div className="space-y-1 p-3">
        <div className="font-display text-2xl leading-none text-primary">
          {formatCents(listing.asking_price_cents, { omitZeroCents: true })}
        </div>
        <h2 className="line-clamp-2 break-words text-sm font-semibold">{listing.title}</h2>
        {brandModel && <p className="truncate text-xs text-muted-foreground">{brandModel}</p>}
        <p className="text-xs text-muted-foreground">
          {marketplaceConditionLabel(listing.condition)} · {marketplaceFulfillmentLabel(listing.fulfillment)}
        </p>
        <p className="flex flex-wrap justify-between gap-x-2 text-xs text-muted-foreground">
          <span className="truncate">{place}</span>
          <span>{listedLabel(listing.listed_on)}</span>
        </p>
      </div>
    </Link>
  );
}
