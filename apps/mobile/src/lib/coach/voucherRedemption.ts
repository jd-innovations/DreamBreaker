import { supabase } from '@/lib/supabase';
import { buildScanTokenUrl } from '@/lib/qrPayload';

// Coach Marketplace Phase 5 — spending a voucher.
//
// Coach-side by design: the buyer presents a code and the coach, authenticated
// as the offer's owner, is the actor who consumes it. redeem_coach_voucher()
// enforces that server-side — a buyer redeeming their own voucher would make
// the remaining count meaningless — along with expiry, revocation, remaining
// balance, and a row lock so a double-tap cannot decrement twice.

export type RedemptionMethod = 'qr' | 'manual';

export type RedemptionSuccess = {
  entitlementId: string;
  offerTitle: string;
  buyerName: string;
  remainingAfter: number;
  totalRedemptions: number;
  fullyRedeemed: boolean;
};

export type RedeemResult =
  | { ok: true; result: RedemptionSuccess }
  | { ok: false; code: string };

// Every error redeem_coach_voucher() raises, phrased for a coach standing on a
// court with a player waiting. An unmapped code degrades to the generic line
// rather than surfacing a raw Postgres string.
export const REDEMPTION_ERROR_MESSAGES: Record<string, string> = {
  not_authenticated: 'Please sign in to redeem a voucher.',
  invalid_method: 'Something went wrong. Please try again.',
  voucher_not_found: "That code doesn't match any voucher. Check the characters and try again.",
  not_your_voucher: 'This voucher is for another coach’s lesson.',
  voucher_revoked: 'This voucher has been cancelled and cannot be used.',
  voucher_expired: 'This voucher has expired.',
  voucher_already_redeemed: 'This voucher has already been fully redeemed.',
  offline: "You're offline. Connect to the internet to redeem this voucher.",
};

export function redemptionErrorMessage(code: string): string {
  return REDEMPTION_ERROR_MESSAGES[code] ?? 'Could not redeem this voucher. Please try again.';
}

function errorCode(err: unknown): string {
  // Supabase surfaces a PostgrestError — a plain object with `message`, not an
  // Error instance. Reading only `err instanceof Error` here would discard the
  // very code this maps, which is exactly how the coach publish failure spent
  // an hour saying "something went wrong".
  const raw =
    err instanceof Error ? err.message
    : err && typeof err === 'object' && 'message' in err ? String((err as { message?: unknown }).message ?? '')
    : '';
  const known = Object.keys(REDEMPTION_ERROR_MESSAGES).find(k => raw.includes(k));
  return known ?? 'unknown_error';
}

/** The QR a buyer displays. Uses the /q/<token> shape qrPayload.ts reserves. */
export function voucherQrValue(redemptionCode: string): string {
  return buildScanTokenUrl(redemptionCode);
}

export async function redeemVoucher(code: string, method: RedemptionMethod): Promise<RedeemResult> {
  const { data, error } = await supabase.rpc('redeem_coach_voucher', {
    p_code: code.trim(),
    p_method: method,
  });

  if (error) return { ok: false, code: errorCode(error) };

  // returns table(...) arrives as an array; a valid redemption is exactly one row.
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { ok: false, code: 'unknown_error' };

  return {
    ok: true,
    result: {
      entitlementId:     String(row.entitlement_id),
      offerTitle:        String(row.offer_title),
      buyerName:         String(row.buyer_name),
      remainingAfter:    Number(row.remaining_after ?? 0),
      totalRedemptions:  Number(row.total_redemptions ?? 0),
      fullyRedeemed:     Boolean(row.fully_redeemed),
    },
  };
}

/** The buyer's own entitlement for a wallet item, including the code to show. */
export async function fetchVoucherRedemptionCode(walletItemId: string): Promise<{
  code: string; remaining: number; total: number; status: string;
} | null> {
  const { data, error } = await supabase
    .from('coach_voucher_entitlements')
    .select('redemption_code, remaining_redemptions, total_redemptions, status')
    .eq('wallet_item_id', walletItemId)
    .maybeSingle();

  if (error || !data) return null;
  return {
    code: String(data.redemption_code),
    remaining: Number(data.remaining_redemptions),
    total: Number(data.total_redemptions),
    status: String(data.status),
  };
}
