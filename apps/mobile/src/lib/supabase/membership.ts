import { supabase } from '@/lib/supabase';

/**
 * Paid membership entitlement.
 *
 * Nothing here knows about Apple. Entitlement is read the same way whether the
 * row was written by StoreKit, by Stripe on the web, or by an admin comp — see
 * MEMBERSHIP_EXECUTION_PLAN.md. Phase 5 adds a purchase path and changes only
 * how a row gets created, never how it is read.
 *
 * `memberships` is client read-only: RLS grants select to the owner and to
 * admins, and carries no write policy for anyone. Same posture as
 * `wallet_items`.
 */

export type Membership = {
  id: string;
  tier: 'plus';
  status: 'active' | 'expired' | 'revoked';
  startedAt: string;
  /** Null means no expiry — only reachable through an admin comp. */
  expiresAt: string | null;
  source: 'iap' | 'stripe' | 'admin_grant';
};

/**
 * Whether this user is entitled RIGHT NOW.
 *
 * Expiry is evaluated here rather than trusted from `status`, exactly as
 * is_paid_member() does server-side: nothing sweeps expired rows, and trusting
 * a stored status is what let a redeemed voucher keep claiming to be active
 * (see wallet.ts's deriveDisplayStatus).
 *
 * This is a convenience for rendering. It is NOT a security boundary — every
 * benefit must be enforced server-side, where the client cannot reach. The
 * listing limit lives on profiles and coach pricing is computed inside
 * create_coach_offer_purchase for that reason.
 */
export function isMembershipActive(m: Membership | null): boolean {
  if (!m || m.status !== 'active') return false;
  if (!m.expiresAt) return true;
  return new Date(m.expiresAt).getTime() > Date.now();
}

export async function fetchMembership(userId: string): Promise<Membership | null> {
  const { data, error } = await supabase
    .from('memberships')
    .select('id,tier,status,started_at,expires_at,source')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  // Never throws. A membership that cannot be read should degrade to "not a
  // member" — the free experience — rather than breaking a screen.
  if (error) {
    if (__DEV__) console.warn('[membership] fetch failed', error.message);
    return null;
  }
  if (!data) return null;

  return {
    id: String(data.id),
    tier: data.tier as Membership['tier'],
    status: data.status as Membership['status'],
    startedAt: String(data.started_at),
    expiresAt: data.expires_at != null ? String(data.expires_at) : null,
    source: data.source as Membership['source'],
  };
}
