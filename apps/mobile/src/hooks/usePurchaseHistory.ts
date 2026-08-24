import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@/hooks/useSession';
import { fetchPurchaseHistory } from '@/lib/supabase/payments';
import type { Purchase } from '@/lib/paymentTypes';

/**
 * Settled purchases for the signed-in user. Like useWallet, this does not
 * refetch on focus — purchase history is immutable once settled, so there is
 * nothing to catch up on mid-read.
 */
export function usePurchaseHistory(limit?: number) {
  const { user } = useSession();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const load = useCallback(async (isRefresh: boolean) => {
    if (!user?.id) {
      setPurchases([]);
      setLoading(false);
      return;
    }
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      setPurchases(await fetchPurchaseHistory(user.id, limit));
    } catch {
      setError('Could not load your purchases. Pull down to try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, limit]);

  useEffect(() => { load(false); }, [load]);

  const refresh = useCallback(() => load(true), [load]);

  return { purchases, loading, refreshing, error, refresh };
}
