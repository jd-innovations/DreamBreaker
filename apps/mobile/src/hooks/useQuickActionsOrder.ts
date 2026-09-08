import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@/hooks/useSession';
import { getPref, setPref } from '@/lib/localPrefs';

// Persists the user's preferred Quick Actions order locally (per-device,
// per-account). Falls back to the default order until a saved one loads,
// and gracefully appends any new action ids that weren't in a saved order.
export function useQuickActionsOrder<T extends { id: string }>(defaultItems: T[]) {
  const { user } = useSession();
  const [items, setItems] = useState<T[]>(defaultItems);
  const storageKey = `quick_actions_order_${user?.id ?? 'guest'}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const raw = await getPref(storageKey);
      if (cancelled || !raw) return;
      try {
        const order: string[] = JSON.parse(raw);
        const byId = new Map(defaultItems.map(i => [i.id, i]));
        const reordered = order.map(id => byId.get(id)).filter((i): i is T => !!i);
        const missing = defaultItems.filter(i => !order.includes(i.id));
        if (!cancelled) setItems([...reordered, ...missing]);
      } catch {
        // Corrupt/old saved value — ignore and keep default order.
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const reorder = useCallback((next: T[]) => {
    setItems(next);
    setPref(storageKey, JSON.stringify(next.map(i => i.id))).catch(() => {});
  }, [storageKey]);

  return { items, reorder };
}
