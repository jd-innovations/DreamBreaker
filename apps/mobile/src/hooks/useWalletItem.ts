import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  fetchWalletItemById, fetchWalletActivity, markWalletItemSeen, fetchCoachVoucherEntitlementSummary,
} from '@/lib/supabase/wallet';
import type { WalletItem, WalletActivityEntry, CoachVoucherEntitlementSummary } from '@/lib/walletTypes';

/**
 * Wallet item detail hook. Refetches on focus (unlike useWallet) since the
 * user may return from an external redemption flow and expects fresh state.
 */
export function useWalletItem(id: string) {
  const [item, setItem]         = useState<WalletItem | null>(null);
  const [activity, setActivity] = useState<WalletActivityEntry[]>([]);
  const [entitlementSummary, setEntitlementSummary] = useState<CoachVoucherEntitlementSummary | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      async function load() {
        setLoading(true);
        setError(null);
        try {
          const [fetchedItem, fetchedActivity] = await Promise.all([
            fetchWalletItemById(id),
            fetchWalletActivity(id),
          ]);
          if (!active) return;
          setItem(fetchedItem);
          setActivity(fetchedActivity);
          if (fetchedItem && !fetchedItem.isSeen) {
            markWalletItemSeen(id);
          }
          // Redemption counts are never cached on wallet_items — always a
          // fresh read of coach_voucher_entitlements (Phase 5 will change
          // these, so this screen must never trust a stale snapshot).
          if (fetchedItem?.type === 'coach_voucher' && fetchedItem.coachVoucher?.purchaseId) {
            const summary = await fetchCoachVoucherEntitlementSummary(fetchedItem.coachVoucher.purchaseId);
            if (active) setEntitlementSummary(summary);
          } else {
            setEntitlementSummary(null);
          }
        } catch {
          if (active) setError('Could not load this item. Please try again.');
        } finally {
          if (active) setLoading(false);
        }
      }
      load();
      return () => { active = false; };
    }, [id]),
  );

  return { item, activity, entitlementSummary, loading, error };
}
