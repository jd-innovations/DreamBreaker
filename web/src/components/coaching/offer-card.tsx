import Image from "next/image";
import Link from "next/link";
import { Clock, MapPin, Users } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/utils";
import {
  discountPercent, formatPrice, initialsOf, offerMeta, OFFER_TYPE_LABEL, placeLabel, publicPrice,
  type OfferCard as Offer,
} from "@/lib/coaching/browse";

// One offer in the /lessons list.
//
// ── Why the photo is not the hero ───────────────────────────────────────────
// 1 of 27 active offers has an image of its own. The browse function falls
// back to the FACILITY's photo — honest, since that is where the lesson
// happens — and this falls back again to a typographic panel (owner decision,
// 2026-09-23). So the card is designed to read well with NO image at all:
// the coach, the format, the price and the place carry it, and a photo is a
// bonus rather than a requirement.

export function OfferCard({ offer }: { offer: Offer }) {
  const { cents, wasCents } = publicPrice(offer);
  const off = discountPercent(offer);
  const meta = offerMeta(offer);
  const place = placeLabel(offer);

  return (
    <Link
      href={`/lessons/${offer.id}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-primary/40"
    >
      <div className="relative h-32 w-full shrink-0 overflow-hidden bg-muted">
        {offer.photo_url ? (
          <Image
            src={offer.photo_url}
            alt=""
            width={480}
            height={256}
            className="h-full w-full object-cover"
          />
        ) : (
          // The typographic fallback: the coach's initials over a flat panel,
          // using theme tokens so it works in both themes.
          <div className="flex h-full w-full items-center justify-center bg-primary/10">
            <span className="font-display text-3xl tracking-widest text-primary/70">
              {initialsOf(offer.coach_name)}
            </span>
          </div>
        )}

        <span className="absolute left-2 top-2 rounded-sm bg-background/90 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-foreground">
          {OFFER_TYPE_LABEL[offer.offer_type] ?? offer.offer_type}
        </span>

        {off !== null && (
          <span className="absolute right-2 top-2 rounded-sm bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">
            {off}% off
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-3.5">
        {/* Plain semibold, not font-display: the display face is condensed and
            is for numbers and labels (the price below, the type chip). A lesson
            title is something a coach wrote, and reads better unstyled — same
            split the marketplace card uses. */}
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug">{offer.title}</h3>

        <p className="truncate text-xs text-muted-foreground">
          with {offer.coach_name ?? "a coach"}
          {offer.coach_handle ? ` · @${offer.coach_handle}` : ""}
        </p>

        {meta && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock size={12} weight="bold" aria-hidden />
            {meta}
          </p>
        )}

        {place && (
          <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            <MapPin size={12} weight="bold" aria-hidden />
            <span className="truncate">{place}</span>
          </p>
        )}

        <div className="mt-auto flex items-baseline gap-2 pt-2">
          <span className="font-display text-lg tracking-tight">{formatPrice(cents)}</span>
          {wasCents !== null && (
            <span className="text-xs text-muted-foreground line-through">{formatPrice(wasCents)}</span>
          )}
          {offer.premium_only && (
            <span className="ml-auto rounded-sm bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
              Members
            </span>
          )}
        </div>

        {/* A member price is shown as a benefit, never as the headline: most
            visitors are not members, and a price they cannot pay is bait. */}
        {!offer.premium_only && offer.premium_price_cents != null &&
          offer.premium_price_cents < cents && (
          <p className="text-[11px] font-semibold text-primary">
            {formatPrice(offer.premium_price_cents)} for members
          </p>
        )}

        {offer.max_participants != null && offer.max_participants > 1 &&
          offer.quantity_remaining != null && offer.quantity_remaining <= 3 && (
          <p className={cn("flex items-center gap-1 text-[11px] font-semibold text-destructive")}>
            <Users size={11} weight="bold" aria-hidden />
            {offer.quantity_remaining} left
          </p>
        )}
      </div>
    </Link>
  );
}
