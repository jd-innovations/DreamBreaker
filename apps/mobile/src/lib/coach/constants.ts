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
