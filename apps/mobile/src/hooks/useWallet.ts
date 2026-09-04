import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@/hooks/useSession';
import { fetchWalletItems } from '@/lib/supabase/wallet';
import type { WalletItem } from '@/lib/walletTypes';

/**
 * Wallet dashboard hook. Deliberately does not auto-refetch on screen
 * focus — a status flip mid-read (e.g. processing -> available) would be
 * surprising. Updates only happen via explicit pull-to-refresh.
 */
export function useWallet() {
  const { user } = useSession();
  const [items, setItems]           = useState<WalletItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const load = useCallback(async (isRefresh: boolean) => {
    if (!user?.id) {
      setItems([]);
      setLoading(false);
      return;
    }
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const data = await fetchWalletItems(user.id);
      setItems(data);
    } catch {
      setError('Could not load your wallet. Pull down to try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => { load(false); }, [load]);

  const refresh = useCallback(() => load(true), [load]);

  return { items, loading, refreshing, error, refresh };
}
