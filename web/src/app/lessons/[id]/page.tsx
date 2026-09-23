import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, MapPin, Users } from "@phosphor-icons/react/dist/ssr";
import { createClient } from "@/lib/supabase/server";
import { buildEntityMetadata } from "@/lib/og/metadata";
import { fetchCoachOfferOg } from "@/lib/og/fetchers";
import { Button } from "@/components/ui/button";
import {
  discountPercent, formatPrice, initialsOf, offerMeta, OFFER_TYPE_LABEL, placeLabel, publicPrice,
  type OfferDetail,
} from "@/lib/coaching/browse";

/**
 * A lesson, for anyone — Phase 1 of coach-marketplace web parity.
 *
 * A SERVER COMPONENT, like marketplace/[id] and for the same reason: the
 * audience is someone opening a pasted link on an unknown connection, so the
 * title, price and coach should paint without waiting for a bundle.
 *
 * READ-ONLY by design. Buying needs an account (owner decision 2026-09-23) and
 * the checkout itself is Phase 4, after the Stripe webhook round-trip is
 * proven. Until then the call to action is honest about where it leads rather
 * than pretending to sell.
 *
 * The canonical URL for a lesson is /lessons/<id>, matching the app's own
 * route. /coach/offers/<id> — the deep-link root the app registers — redirects
 * here, so both spellings work and only one page exists.
 */

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const payload = await fetchCoachOfferOg(id);
  return buildEntityMetadata("coach_offer", id, payload);
}

export default async function LessonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("coach_offer_detail", { p_id: id });
  const offer = ((data ?? [])[0] ?? null) as OfferDetail | null;

  // Draft and archived offers are filtered out by the RPC, so this covers both
  // "never existed" and "not for public eyes".
  if (!offer) notFound();

  const { cents, wasCents } = publicPrice(offer);
  const off = discountPercent(offer);
  const meta = offerMeta(offer);
  const place = placeLabel(offer);
  const paused = offer.status === "paused";
  const soldOut = offer.quantity_remaining != null && offer.quantity_remaining <= 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <Link href="/lessons" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={14} /> All lessons
      </Link>

      <div className="mt-4 overflow-hidden rounded-lg border border-border bg-card">
        <div className="relative h-48 w-full bg-muted sm:h-64">
          {offer.photo_url ? (
            <Image src={offer.photo_url} alt="" width={1200} height={640}
              className="h-full w-full object-cover" priority />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-primary/10">
              <span className="font-display text-5xl tracking-widest text-primary/70">
                {initialsOf(offer.coach_name)}
              </span>
            </div>
          )}
          <span className="absolute left-3 top-3 rounded-sm bg-background/90 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider">
            {OFFER_TYPE_LABEL[offer.offer_type] ?? offer.offer_type}
          </span>
        </div>

        <div className="space-y-4 p-5 sm:p-6">
          <div>
            {/* Body face, uppercase: same treatment as the card. The condensed
                display face is for numbers and labels, not for something a
                coach wrote (owner, 2026-09-23). */}
            <h1 className="text-xl font-semibold uppercase tracking-wide sm:text-2xl">{offer.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              with{" "}
              <Link href={`/coach/${offer.coach_id}`} className="text-foreground underline-offset-4 hover:underline">
                {offer.coach_name ?? "a coach"}
              </Link>
              {offer.coach_handle ? ` · @${offer.coach_handle}` : ""}
            </p>
          </div>

          <div className="flex flex-wrap items-baseline gap-3">
            <span className="font-display text-3xl tracking-tight">{formatPrice(cents)}</span>
            {wasCents !== null && (
              <span className="text-base text-muted-foreground line-through">{formatPrice(wasCents)}</span>
            )}
            {off !== null && (
              <span className="rounded-sm bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
                {off}% off
              </span>
            )}
            {offer.premium_only && (
              <span className="rounded-sm bg-primary/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-primary">
                Members only
              </span>
            )}
          </div>

          {!offer.premium_only && offer.premium_price_cents != null && offer.premium_price_cents < cents && (
            <p className="text-sm font-semibold text-primary">
              {formatPrice(offer.premium_price_cents)} for members
            </p>
          )}

          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            {meta && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock size={14} weight="bold" aria-hidden /> {meta}
              </div>
            )}
            {offer.skill_level_label && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Users size={14} weight="bold" aria-hidden /> {offer.skill_level_label}
              </div>
            )}
            {place && (
              <div className="flex items-center gap-2 text-muted-foreground sm:col-span-2">
                <MapPin size={14} weight="bold" aria-hidden />
                <span>{place}{offer.facility_address ? ` — ${offer.facility_address}` : ""}</span>
              </div>
            )}
          </dl>

          {offer.description && (
            <div>
              <h2 className="font-display text-sm uppercase tracking-widest text-muted-foreground">About</h2>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{offer.description}</p>
            </div>
          )}

          {offer.terms && (
            <div>
              <h2 className="font-display text-sm uppercase tracking-widest text-muted-foreground">Terms</h2>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{offer.terms}</p>
            </div>
          )}

          {/* Buying is Phase 4 and needs an account either way, so the CTA says
              what actually happens next instead of implying a checkout. */}
          <div className="rounded-md border border-border bg-background p-4">
            {paused ? (
              <p className="text-sm text-muted-foreground">
                This lesson is paused by the coach right now. It may come back — the coach&rsquo;s other
                lessons are on their profile.
              </p>
            ) : soldOut ? (
              <p className="text-sm text-muted-foreground">
                This one is fully booked. Check{" "}
                <Link href={`/coach/${offer.coach_id}`} className="underline underline-offset-4">
                  the coach&rsquo;s other lessons
                </Link>.
              </p>
            ) : (
              <>
                <p className="text-sm">Booking happens in the Pickleball App.</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Sign in on the app to book this lesson with {offer.coach_name ?? "this coach"}.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button asChild variant="secondary">
                    <Link href={`/auth?next=/lessons/${offer.id}`}>Sign in</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href={`/coach/${offer.coach_id}`}>View coach</Link>
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
