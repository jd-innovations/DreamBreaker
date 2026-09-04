import { supabase } from '@/lib/supabase';

// Coach Marketplace Phase 6 (part 1) — what a coach has earned.
//
// Read-only. No payout has ever been made and no settlement machinery exists,
// so this reports what is owed, not what has moved. Saying "available to
// withdraw" would be a promise nothing can keep yet.
//
// Reads the SNAPSHOT columns on coach_offer_purchases rather than recomputing
// from platform_settings. Commission was resolved once, server-side, at
// purchase time and is immutable — recomputing would silently restate history
// the day a rate changes. (v_director_earnings does recompute, with a
// hardcoded 12/88 split; that view is unused by either app, and this
// deliberately does not follow it.)
//
// No RPC or view needed: coach_offer_purchases carries coach_id and RLS
// already grants "coach read own", so the aggregate is a plain select.

export type CoachEarnings = {
  lessonsSold: number;
  /** Buyers paid this in total. */
  grossCents: number;
  /** The platform's share, already deducted. */
  commissionCents: number;
  /** The coach's share — what is owed to them. */
  netCents: number;
  firstSaleAt: string | null;
  lastSaleAt: string | null;
};

type Row = {
  status: string;
  buyer_total_charged_cents: number | null;
  platform_commission_amount_cents: number | null;
  coach_net_proceeds_cents: number | null;
  paid_at: string | null;
};

export async function fetchCoachEarnings(coachId: string): Promise<CoachEarnings> {
  const empty: CoachEarnings = {
    lessonsSold: 0, grossCents: 0, commissionCents: 0, netCents: 0,
    firstSaleAt: null, lastSaleAt: null,
  };

  const { data, error } = await supabase
    .from('coach_offer_purchases')
    .select('status, buyer_total_charged_cents, platform_commission_amount_cents, coach_net_proceeds_cents, paid_at')
    .eq('coach_id', coachId)
    // Only money that actually settled. A payment_pending row is a checkout
    // someone may yet abandon; counting it would show earnings that can vanish.
    .eq('status', 'finalized');

  if (error || !data) return empty;

  const rows = data as Row[];
  const paidAts = rows.map(r => r.paid_at).filter((d): d is string => !!d).sort();

  return {
    lessonsSold: rows.length,
    grossCents:      rows.reduce((n, r) => n + (r.buyer_total_charged_cents ?? 0), 0),
    commissionCents: rows.reduce((n, r) => n + (r.platform_commission_amount_cents ?? 0), 0),
    netCents:        rows.reduce((n, r) => n + (r.coach_net_proceeds_cents ?? 0), 0),
    firstSaleAt: paidAts[0] ?? null,
    lastSaleAt:  paidAts[paidAts.length - 1] ?? null,
  };
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
