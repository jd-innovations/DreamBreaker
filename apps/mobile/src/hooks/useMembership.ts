import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@/hooks/useSession';
import { fetchMembership, isMembershipActive, type Membership } from '@/lib/supabase/membership';

/**
 * The signed-in user's paid membership, and whether it is currently valid.
 *
 * Deliberately plain — no shared store, no focus refresh, no freshness window.
 * useProfile needs all of that because the header and every tab read it on
 * every render; entitlement is read by a handful of screens and changes rarely,
 * and the elaborate version of this can be built when something needs it.
 *
 * `isMember` is for RENDERING only — showing a member price, hiding an upsell.
 * Every benefit is enforced server-side, where the client cannot reach:
 * the listing limit lives on profiles.marketplace_listing_limit, and coach
 * pricing is computed inside create_coach_offer_purchase. A tampered client
 * gets a nicer-looking screen and no extra entitlement.
 */
export function useMembership() {
  const { session } = useSession();
  const userId = session?.user?.id ?? null;

  const [membership, setMembership] = useState<Membership | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!userId) {
      setMembership(null);
      return;
    }
    setLoading(true);
    try {
      setMembership(await fetchMembership(userId));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setMembership(null);
      return;
    }
    setLoading(true);
    fetchMembership(userId)
      .then((m) => { if (!cancelled) setMembership(m); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId]);

  return { membership, isMember: isMembershipActive(membership), loading, reload };
}
