import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// The buyer-facing convenience fee on a lesson purchase.
//
// The authority is create_coach_offer_purchase(), which resolves these same two
// settings server-side and snapshots the result onto the purchase row. This is
// a PREVIEW so the checkout screen can state the real total, and nothing is
// charged from it — a client that lied here would be corrected by the server
// within a second, which is the property that makes reading settings directly
// safe.
//
// Deliberately per PURCHASE in fixed mode, unlike the court convenience fee
// which is per slot: a lesson is one transaction whatever the headcount.
// Percentage mode scales with quantity because it applies to the gross.
//
// platform_settings has a public-read RLS policy and is already read this way
// by useSupportFloatingButtonEnabled.

const MODE_KEY = 'coach_marketplace_buyer_service_fee_mode';
const AMOUNT_KEY = 'coach_marketplace_buyer_service_fee_amount';

export type CoachServiceFee = {
  /** Fee in cents for a purchase of `quantity` at `unitPriceCents`. */
  feeFor: (unitPriceCents: number, quantity: number) => number;
  /** False while loading, or when the fee is switched off. */
  enabled: boolean;
};

export function useCoachServiceFee(): CoachServiceFee {
  const [mode, setMode] = useState<string>('disabled');
  const [amount, setAmount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('platform_settings')
      .select('key, value')
      .in('key', [MODE_KEY, AMOUNT_KEY])
      .then(({ data }) => {
        if (cancelled || !data) return;
        const rows = data as { key: string; value: string }[];
        setMode(rows.find(r => r.key === MODE_KEY)?.value ?? 'disabled');
        setAmount(Number(rows.find(r => r.key === AMOUNT_KEY)?.value ?? 0) || 0);
      });
    return () => { cancelled = true; };
  }, []);

  function feeFor(unitPriceCents: number, quantity: number): number {
    if (mode === 'fixed') return Math.round(amount);
    if (mode === 'percentage') return Math.round((unitPriceCents * quantity * amount) / 100);
    return 0;
  }

  return { feeFor, enabled: mode !== 'disabled' && amount > 0 };
}
