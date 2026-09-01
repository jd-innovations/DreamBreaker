import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/lib/supabase';

// Stripe Connect onboarding, launched from the app.
//
// Role-generic because the gap is: mobile has no Connect flow for anyone.
// Coaches cannot take payouts and directors cannot charge an entry fee, and
// three screens tell them to "connect Stripe payouts on the Pickleball App
// website" without linking anywhere.
//
// The link opens in the system browser rather than an in-app WebView on
// purpose: Stripe onboarding collects identity documents and bank details, and
// people are right to want their own browser's address bar and password
// manager for that. openAuthSessionAsync also closes itself on redirect back
// to our origin, so the user lands back in the app when Stripe is done.

export type ConnectRole = 'director' | 'coach';

export const CONNECT_ERROR_MESSAGES: Record<string, string> = {
  not_authenticated: 'Please sign in to set up payouts.',
  profile_not_found: 'We could not load your profile. Please try again.',
  not_approved_director: 'Your director application needs to be approved before you can set up payouts.',
  coach_mode_not_activated: 'Turn on Coach Mode before setting up payouts.',
  account_save_failed: 'We could not finish setting up your payout account. Please try again.',
  onboarding_link_failed: 'Stripe could not start onboarding right now. Please try again shortly.',
  offline: "You're offline. Connect to the internet and try again.",
};

export function connectErrorMessage(code: string): string {
  return CONNECT_ERROR_MESSAGES[code] ?? 'Something went wrong. Please try again.';
}

async function extractErrorCode(error: unknown): Promise<string> {
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    try {
      const body = await context.clone().json();
      if (typeof body?.error === 'string') return body.error;
    } catch {
      // fall through
    }
  }
  return 'unknown_error';
}

export type StartConnectResult =
  | { ok: true; completed: boolean }
  | { ok: false; code: string };

/**
 * Fetches a fresh Stripe AccountLink and opens it.
 *
 * `completed` only means the browser closed by returning to our origin — NOT
 * that onboarding succeeded. Stripe decides that, and it reaches us through
 * the account.updated webhook, which is what sets stripe_connect_onboarded_at
 * and flips coach_status to active. Callers must re-read the profile rather
 * than assuming, exactly as the payment hooks poll instead of trusting the
 * PaymentSheet result.
 */
export async function startConnectOnboarding(role: ConnectRole): Promise<StartConnectResult> {
  const { data, error } = await supabase.functions.invoke('create-connect-onboarding-link', {
    body: { role },
  });
  if (error || !data?.url) {
    return { ok: false, code: await extractErrorCode(error) };
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, 'pickleballapp://');
  return { ok: true, completed: result.type === 'success' };
}
