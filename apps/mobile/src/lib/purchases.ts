// Type-resolution fallback only. Metro always prefers the platform-specific
// file at bundle time (.native.ts on iOS/Android, .web.ts on web) -- this plain
// .ts exists purely so TypeScript's module resolver can find the import
// (mirrors calendarEvents.ts).
export {
  configurePurchases,
  purchasesReady,
  identifyPurchases,
  getMembershipOffer,
  purchaseMembership,
  restorePurchases,
} from './purchases.native';
export { PLUS_ENTITLEMENT } from './purchases.types';
export type { MembershipOffer, PurchaseOutcome } from './purchases.types';
