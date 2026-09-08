import { supabase } from '@/lib/supabase';

// Real Stripe saved-payment-methods support, replacing the hardcoded
// "Visa •••• 4321" placeholder in payments-settings.tsx (see that file's own
// TODO comment). Deliberately Stripe-SDK-free, same reasoning as
// reservationPaymentIntent.ts: only useSavedPaymentMethods.ts (the hook that
// presents PaymentSheet) imports @stripe/stripe-react-native.
//
// `payment_methods` and the `set_default_payment_method` RPC are new
// (migration 20260907130000) and aren't in the generated Supabase types yet
// -- `as any` on those two call sites, same pattern as fetchDirectorTournamentMetrics
// in lib/supabase/tournaments.ts. Remove once the migration is applied and
// `supabase gen types` is re-run.

export type SavedPaymentMethod = {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
};

export const PAYMENT_METHOD_ERROR_MESSAGES: Record<string, string> = {
  not_authenticated: 'Please sign in to manage payment methods.',
  customer_save_failed: 'Could not save your payment profile. Please try again.',
  setup_intent_failed: 'Could not start card setup. Please try again.',
  setup_intent_not_found: 'That card setup could not be found. Please try again.',
  setup_intent_not_succeeded: 'Card setup did not complete. Please try again.',
  not_a_card: 'Only cards can be saved right now.',
  payment_method_save_failed: 'Your card was saved with Stripe but we could not record it. Please contact support.',
  confirm_failed: 'Could not confirm your card. Please try again.',
  payment_method_not_found: 'That payment method could not be found.',
  delete_failed: 'Could not remove this card. Please try again.',
  offline: "You're offline. Connect to the internet and try again.",
};

export function paymentMethodErrorMessage(code: string): string {
  return PAYMENT_METHOD_ERROR_MESSAGES[code] ?? 'Something went wrong. Please try again.';
}

async function extractErrorCode(error: unknown): Promise<string> {
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    try {
      const body = await context.clone().json();
      if (typeof body?.error === 'string') return body.error;
    } catch {
      // fall through to unknown_error
    }
  }
  return 'unknown_error';
}

function rowToSavedPaymentMethod(row: {
  id: string; brand: string; last4: string; exp_month: number; exp_year: number; is_default: boolean;
}): SavedPaymentMethod {
  return {
    id: row.id,
    brand: row.brand,
    last4: row.last4,
    expMonth: row.exp_month,
    expYear: row.exp_year,
    isDefault: row.is_default,
  };
}

/** RLS already scopes this to the caller's own rows ("payment_methods: owner read own"). */
export async function fetchSavedPaymentMethods(): Promise<SavedPaymentMethod[]> {
  // `payment_methods` is new (migration 20260907130000) and isn't in the
  // generated Supabase types yet -- same `as any` pattern as the RPC below.
  const { data, error } = await (supabase as any)
    .from('payment_methods')
    .select('id, brand, last4, exp_month, exp_year, is_default')
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map(row => rowToSavedPaymentMethod(row as {
    id: string; brand: string; last4: string; exp_month: number; exp_year: number; is_default: boolean;
  }));
}

export type CreateSetupIntentResult =
  | { ok: true; setupIntentClientSecret: string; customerId: string; ephemeralKeySecret: string }
  | { ok: false; code: string };

export async function createSetupIntent(): Promise<CreateSetupIntentResult> {
  const { data, error } = await supabase.functions.invoke('create-setup-intent');
  if (error || !data) return { ok: false, code: await extractErrorCode(error) };
  return {
    ok: true,
    setupIntentClientSecret: data.setupIntentClientSecret,
    customerId: data.customerId,
    ephemeralKeySecret: data.ephemeralKeySecret,
  };
}

export type ConfirmPaymentMethodResult =
  | { ok: true; paymentMethod: SavedPaymentMethod }
  | { ok: false; code: string };

export async function confirmPaymentMethod(setupIntentId: string): Promise<ConfirmPaymentMethodResult> {
  const { data, error } = await supabase.functions.invoke('confirm-payment-method', {
    body: { setupIntentId },
  });
  if (error || !data) return { ok: false, code: await extractErrorCode(error) };
  return { ok: true, paymentMethod: rowToSavedPaymentMethod(data.paymentMethod) };
}

export type DeletePaymentMethodResult = { ok: true } | { ok: false; code: string };

export async function deletePaymentMethod(paymentMethodId: string): Promise<DeletePaymentMethodResult> {
  const { data, error } = await supabase.functions.invoke('delete-payment-method', {
    body: { paymentMethodId },
  });
  if (error || !data) return { ok: false, code: await extractErrorCode(error) };
  return { ok: true };
}

export async function setDefaultPaymentMethod(paymentMethodId: string): Promise<DeletePaymentMethodResult> {
  const { error } = await (supabase as any).rpc('set_default_payment_method', {
    p_payment_method_id: paymentMethodId,
  });
  if (error) return { ok: false, code: 'unknown_error' };
  return { ok: true };
}
