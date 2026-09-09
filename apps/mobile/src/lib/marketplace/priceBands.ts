import { colors } from '@/theme';

// Price bands for Marketplace map pins.
//
// WHY BANDS AND NOT THE PRICE. The 2026-09-09 device spike
// (MARKETPLACE_MAP_AUDIT.md §5.1a) rejected drawing a "$145" badge over the
// map: placement was off by 19-28px vertically and the audit's bail-out rule
// says switch presentation rather than keep tuning projection maths. What is
// left is what react-native-maps can render natively on a childless <Marker> —
// `pinColor`, and later a static `image` — so the price has to be expressed as
// a small fixed set rather than free text.
//
// Colour carries the band on the pin; the exact price is one tap away on the
// bottom card. That split is deliberate: the map answers "where and roughly how
// much", the card answers "what exactly".
//
// UPGRADE PATH: when pin artwork exists, each band gains an `image` and
// ExploreMap passes it through as <Marker image={...} /> — the native prop, not
// a child. The bands below are already the right granularity for that; nothing
// else has to change.

export type PriceBand = {
  key: 'under_100' | 'mid' | 'upper' | 'premium';
  label: string;
  /** Inclusive lower bound, in cents. */
  minCents: number;
  /** Exclusive upper bound, in cents. Infinity for the top band. */
  maxCents: number;
  color: string;
};

export const PRICE_BANDS: PriceBand[] = [
  { key: 'under_100', label: 'Under $100', minCents: 0,     maxCents: 10000,    color: '#2E7D5B' },
  { key: 'mid',       label: '$100–199',   minCents: 10000, maxCents: 20000,    color: colors.gold },
  { key: 'upper',     label: '$200–299',   minCents: 20000, maxCents: 30000,    color: '#C2410C' },
  { key: 'premium',   label: '$300+',      minCents: 30000, maxCents: Infinity, color: '#8A2540' },
];

export function priceBandFor(askingPriceCents: number): PriceBand {
  return (
    PRICE_BANDS.find((b) => askingPriceCents >= b.minCents && askingPriceCents < b.maxCents)
    // Only reachable for a negative price, which the table's CHECK constraint
    // forbids — but a colourless pin would be worse than a wrong-band one.
    ?? PRICE_BANDS[PRICE_BANDS.length - 1]
  );
}
