import type { MembershipOffer, PurchaseOutcome } from './purchases.types';

// react-native-purchases is a native module with no web implementation. Never
// import it here, so the web bundle stays build-safe -- same rule as
// calendarEvents.web.ts and QRScanner.web.tsx.
//
// StoreKit is an iOS concept anyway: there is no version of this that "works
// on web but worse". The paywall reads `unavailable` and hides the buy button
// rather than offering something that cannot complete.

export function configurePurchases(): void {}

export function purchasesReady(): boolean {
  return false;
}

export async function identifyPurchases(_userId: string | null): Promise<void> {}

export async function getMembershipOffer(): Promise<MembershipOffer | null> {
  return null;
}

export async function purchaseMembership(): Promise<PurchaseOutcome> {
  return { status: 'unavailable', reason: 'web' };
}

export async function restorePurchases(): Promise<PurchaseOutcome> {
  return { status: 'unavailable', reason: 'web' };
}
