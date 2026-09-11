import type { CoachOfferType } from './offers';

export const OFFER_TYPE_OPTIONS: { value: CoachOfferType; label: string }[] = [
  { value: 'private',      label: 'Private Lesson' },
  { value: 'semi_private',  label: 'Semi-Private' },
  { value: 'group_clinic',  label: 'Group Clinic' },
  { value: 'camp',          label: 'Camp' },
  { value: 'package',       label: 'Multi-Lesson Package' },
];

export function formatPriceCents(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

export function discountPercent(regularCents: number, discountedCents: number): number {
  if (!regularCents) return 0;
  return Math.round((1 - discountedCents / regularCents) * 100);
}

export const MIN_OFFER_PHOTOS = 1;
export const MAX_OFFER_PHOTOS = 6;

/**
 * What this buyer actually pays, and why.
 *
 * Mirrors the selection inside create_coach_offer_purchase(): the member price
 * applies only when the buyer is entitled AND the offer defines one, because a
 * null premium_price_cents means every buyer pays the same. The RPC remains the
 * authority — this only decides what the screen says, and a screen that
 * disagreed with it would be promising a price the server will not honour.
 */
export function effectiveOfferPrice(
  offer: { discounted_price_cents: number; regular_price_cents: number; premium_price_cents?: number | null },
  isMember: boolean,
): { cents: number; isMemberPrice: boolean } {
  if (isMember && offer.premium_price_cents != null) {
    return { cents: offer.premium_price_cents, isMemberPrice: true };
  }
  return { cents: offer.discounted_price_cents ?? offer.regular_price_cents, isMemberPrice: false };
}
