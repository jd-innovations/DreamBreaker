import { Platform } from 'react-native';
import Purchases, { type CustomerInfo, type PurchasesPackage } from 'react-native-purchases';
import { PLUS_ENTITLEMENT, type MembershipOffer, type PurchaseOutcome } from './purchases.types';

/**
 * StoreKit, via RevenueCat. Phase 5 section 3 of MEMBERSHIP_PHASE5_STOREKIT.md.
 *
 * Nothing here is a source of truth. Entitlement is read from our own
 * `memberships` table (see lib/supabase/membership.ts), written by the
 * RevenueCat webhook. This module only *acquires* entitlement and reports what
 * the store said. Reading RevenueCat's customer info as truth would give us two
 * sources that drift, and every benefit is enforced server-side against ours.
 *
 * Every function here fails soft. A store outage, a missing key or an
 * unconfigured product must degrade to "you cannot buy right now" -- never to a
 * thrown error that takes a screen down, and never to a wrong entitlement.
 */

// Public SDK key. Safe in the bundle by design -- it can only make non-potent
// changes to a subscriber. The secret key must never appear in the app.
//
// ABSENT on the `production` profile until an App Store app config exists in
// RevenueCat and mints an `appl_` key. Absent rather than empty because EAS
// rejects an empty env value outright ("is not allowed to be empty") and the
// build will not start. A `test_` key is RevenueCat's Test Store: the SDK works
// and no real purchase is ever made, which is what we want on development and
// preview.
//
// The string checks are not paranoia. An undefined EXPO_PUBLIC_* can reach the
// bundle as the literal text "undefined" depending on how the export ran, and
// a key of "undefined" would configure the SDK with garbage instead of cleanly
// doing nothing. Same trap the web env loader documents for NEXT_PUBLIC_*.
const RAW_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
const API_KEY =
  !RAW_KEY || RAW_KEY === 'undefined' || RAW_KEY === 'null' || RAW_KEY.trim() === ''
    ? ''
    : RAW_KEY.trim();

let configured = false;

function unavailable(reason: string): PurchaseOutcome {
  return { status: 'unavailable', reason };
}

/**
 * Idempotent, and safe to call from anywhere. Deliberately NOT called at module
 * load: configuring reaches into a native module, and doing that as a side
 * effect of an import makes the failure land wherever the bundler happens to
 * evaluate this file.
 */
/** RevenueCat's Test Store. Usable ONLY in a debug build -- see below. */
const IS_TEST_STORE_KEY = API_KEY.startsWith('test_');

export function configurePurchases(): void {
  if (configured) return;
  // iOS only for now. There is no Android key, and configuring with an iOS key
  // on Android silently produces a customer that can never purchase.
  if (Platform.OS !== 'ios') return;
  if (!API_KEY) return;

  // THE SDK FORCE-CLOSES THE APP for this, so the guard is not optional.
  //
  // Found on the first preview build (2026-09-16): configuring with a `test_`
  // key in a RELEASE binary shows "Wrong API Key — the app will close now to
  // protect the security of test purchases" and terminates. `preview` is a
  // release build despite being internally distributed, so the whole app was
  // unusable, not just membership.
  //
  // Mirroring RevenueCat's own rule here rather than relying on which key a
  // build profile happens to carry: a Test Store key must never reach a
  // release build, and their docs say never to ship one to a store at all.
  // Skipping leaves the app fully working with membership simply unavailable,
  // which is the correct outcome for a build that could not sell anyway.
  if (IS_TEST_STORE_KEY && !__DEV__) {
    if (__DEV__) console.warn('[purchases] test key in a release build — not configuring');
    return;
  }

  try {
    Purchases.configure({ apiKey: API_KEY });
    configured = true;
  } catch (e) {
    if (__DEV__) console.warn('[purchases] configure failed', e);
  }
}

export function purchasesReady(): boolean {
  configurePurchases();
  return configured;
}

/**
 * Make RevenueCat's app_user_id BE the Supabase user id.
 *
 * This is the integration's most common failure. Without it purchases attach to
 * an anonymous RevenueCat id, the webhook has no way to name the buyer, and the
 * membership is never written -- the money moves and nothing happens. The
 * webhook records exactly this case as `unknown_app_user_id` rather than
 * guessing.
 *
 * Called from the single auth store in hooks/useSession.ts, so sign-in and
 * sign-out both reach it without four call sites drifting apart.
 */
export async function identifyPurchases(userId: string | null): Promise<void> {
  if (!purchasesReady()) return;
  try {
    if (userId) {
      await Purchases.logIn(userId);
    } else {
      // Throws when the current user is already anonymous -- which is the
      // normal state on a fresh install signing out. Not an error worth
      // surfacing; the catch below covers it.
      await Purchases.logOut();
    }
  } catch (e) {
    if (__DEV__) console.warn('[purchases] identify failed', e);
  }
}

function currentPackage(
  offerings: Awaited<ReturnType<typeof Purchases.getOfferings>>,
): PurchasesPackage | null {
  // The `current` offering is whatever the dashboard is presenting today, which
  // is the point of offerings -- packaging can change without an app update.
  // One tier, so the first package is the one.
  return offerings.current?.availablePackages?.[0] ?? null;
}

/** The price to show. Null means there is nothing purchasable right now. */
export async function getMembershipOffer(): Promise<MembershipOffer | null> {
  if (!purchasesReady()) return null;
  try {
    const pkg = currentPackage(await Purchases.getOfferings());
    if (!pkg) return null;
    return {
      packageId: pkg.identifier,
      priceString: pkg.product.priceString,
      period: pkg.product.subscriptionPeriod ?? null,
      productId: pkg.product.identifier,
    };
  } catch (e) {
    if (__DEV__) console.warn('[purchases] getOfferings failed', e);
    return null;
  }
}

function hasPlus(info: CustomerInfo): boolean {
  return info.entitlements.active[PLUS_ENTITLEMENT] != null;
}

export async function purchaseMembership(): Promise<PurchaseOutcome> {
  if (!purchasesReady()) return unavailable('not_configured');

  let pkg: PurchasesPackage | null = null;
  try {
    pkg = currentPackage(await Purchases.getOfferings());
  } catch {
    return unavailable('offerings_unreachable');
  }
  if (!pkg) return unavailable('no_offering');

  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    if (hasPlus(customerInfo)) return { status: 'purchased' };
    // Paid, but the entitlement is not attached -- almost always the dashboard
    // product/entitlement mapping. Reported as an error rather than silently
    // succeeding, because the webhook will not have written a membership
    // either and the user would be left with a charge and nothing to show.
    return { status: 'error', message: 'Purchase completed but membership was not applied.' };
  } catch (e) {
    const err = e as { userCancelled?: boolean; message?: string };
    if (err?.userCancelled) return { status: 'cancelled' };
    return { status: 'error', message: err?.message ?? 'Purchase failed.' };
  }
}

/**
 * Required by App Review, and reviewers do press it. Guideline 3.1.1 asks for a
 * restore mechanism, and a fresh reviewer account will have nothing to restore
 * -- which is why `nothing_to_restore` is its own outcome and not an error.
 */
export async function restorePurchases(): Promise<PurchaseOutcome> {
  if (!purchasesReady()) return unavailable('not_configured');
  try {
    const info = await Purchases.restorePurchases();
    return hasPlus(info) ? { status: 'restored' } : { status: 'nothing_to_restore' };
  } catch (e) {
    const err = e as { message?: string };
    return { status: 'error', message: err?.message ?? 'Could not restore purchases.' };
  }
}
