// The seller tip for a listing that hasn't sold (owner-approved 2026-10-04).
//
// Data: listing_seller_insight (20261004150000). The expiring-listing EMAIL
// builds the same sentences in SQL (expire_stale_listings); keep the two in
// step when the wording changes. Honesty rules: comparables only with 3+,
// "list for" (asking prices, not sale prices), never invented demand.

export type ListingInsight = {
  kind: string; // conversations | saved | priced | generic
  saves: number;
  conversations: number;
  comp_count: number;
  comp_low_cents: number | null;
  comp_high_cents: number | null;
  comp_median_cents: number | null;
  asking_cents: number;
  suggested_cents: number;
};

/** Which action the tip's button takes. */
export type ListingTipAction = 'price' | 'messages' | 'edit';

export type ListingTip = { text: string; cta: string; action: ListingTipAction };

const dollars = (cents: number) => `$${Math.round(cents / 100)}`;

export function listingTip(i: ListingInsight, brand: string, model: string): ListingTip {
  if (i.kind === 'conversations') {
    const n = i.conversations;
    return {
      text: `You had ${n} ${n === 1 ? 'conversation' : 'conversations'} about it. Reply or make a counter-offer to close the sale.`,
      cta: 'Open messages',
      action: 'messages',
    };
  }
  if (i.kind === 'saved') {
    const n = i.saves;
    return {
      text: n === 1
        ? "1 person saved your paddle. Drop the price and we'll notify them instantly."
        : `${n} people saved your paddle. Drop the price and we'll notify all ${n} instantly.`,
      cta: 'Lower the price',
      action: 'price',
    };
  }
  if (i.kind === 'priced' && i.comp_low_cents != null && i.comp_high_cents != null) {
    const range = `${dollars(i.comp_low_cents)}–${dollars(i.comp_high_cents)}`;
    if (i.asking_cents > i.comp_high_cents) {
      return {
        text: `It hasn't caught attention yet. Similar ${brand} ${model} paddles list for ${range} (yours is ${dollars(i.asking_cents)}). A lower price or better photos usually help.`,
        cta: 'Lower the price',
        action: 'price',
      };
    }
    return {
      text: `Your price is in line with similar ${brand} ${model} paddles (${range}). Fresh photos or a few words on its condition usually help.`,
      cta: 'Update my listing',
      action: 'edit',
    };
  }
  return {
    text: "It hasn't caught attention yet. A sharper price or adding photos usually helps.",
    cta: 'Lower the price',
    action: 'price',
  };
}
