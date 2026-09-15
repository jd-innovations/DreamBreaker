// Shared shapes for the StoreKit purchase path. Screens import from
// ./purchases and never touch react-native-purchases directly, mirroring the
// calendarEvents.* split -- see purchases.native.ts / purchases.web.ts.

/**
 * The RevenueCat entitlement identifier, and it must match the dashboard
 * exactly. Everything the app asks about membership goes through this string
 * rather than a product id, which is the whole reason for the indirection:
 * the product can be renamed, repriced or replaced without the client caring.
 */
export const PLUS_ENTITLEMENT = 'plus';

export type PurchaseOutcome =
  // Apple took the money. The membership row is written by the RevenueCat
  // webhook, NOT here -- see awaitMembership() in the paywall.
  | { status: 'purchased' }
  // Restore found an active entitlement on this Apple ID.
  | { status: 'restored' }
  // Restore completed and there was nothing to restore. Not an error, and it
  // must not be reported as one: a reviewer will press Restore on a fresh
  // account and expects a calm answer.
  | { status: 'nothing_to_restore' }
  // The user backed out of Apple's sheet. Never show an error for this.
  | { status: 'cancelled' }
  // No SDK key, no configured store, or running on web. The paywall hides its
  // buy button rather than offering something that cannot work.
  | { status: 'unavailable'; reason: string }
  | { status: 'error'; message: string };

/** What the paywall needs to render a price honestly. */
export type MembershipOffer = {
  /** Package identifier, passed back to purchaseMembership(). */
  packageId: string;
  /** Localized, store-formatted price. Never build this from a number: the
   *  store decides currency, symbol placement and decimals per storefront. */
  priceString: string;
  /** e.g. 'P1Y'. Null when the store does not report one. */
  period: string | null;
  productId: string;
};
