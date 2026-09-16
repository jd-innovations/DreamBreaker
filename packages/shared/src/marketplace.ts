/**
 * Marketplace vocabulary shared by both apps.
 *
 * The wording here is MOBILE'S, copied deliberately rather than improved:
 * `conditionLabel` in apps/mobile/src/lib/marketplace/constants.ts and the
 * handoff wording in apps/mobile/src/app/marketplace/[id].tsx. Mobile is the
 * consumer reference (workstream D), and a listing that says "Like New" in the
 * app and "Nearly new" on the web is the exact drift this package exists to
 * stop.
 *
 * Web adopted this first; mobile still has its own copies. That is not
 * finished work, it is the same staging used for the status vocabulary -- the
 * shared definition lands first and matches existing behaviour exactly, so
 * mobile's later swap is provably a no-op.
 */

export type MarketplaceCondition = 'new' | 'like_new' | 'excellent' | 'good' | 'fair';

const CONDITION_LABELS: Record<MarketplaceCondition, string> = {
  new: 'New',
  like_new: 'Like New',
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
};

export function marketplaceConditionLabel(condition: string): string {
  return CONDITION_LABELS[condition as MarketplaceCondition] ?? condition;
}

export type MarketplaceFulfillment = 'local_pickup' | 'shipping' | 'both';

/**
 * How the paddle gets from seller to buyer.
 *
 * Phrased from the BUYER's point of view, as mobile has it -- "Ships to buyer"
 * rather than "Shipping". The value answers "how do I get this", not "what
 * option did the seller tick".
 */
export function marketplaceFulfillmentLabel(fulfillment: string): string {
  switch (fulfillment) {
    case 'shipping':
      return 'Ships to buyer';
    case 'both':
      return 'Local pickup or shipping';
    case 'local_pickup':
      return 'Local pickup';
    default:
      return 'Local pickup';
  }
}
