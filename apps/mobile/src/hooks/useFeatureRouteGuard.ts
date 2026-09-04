import { useEffect } from 'react';
import { router, usePathname } from 'expo-router';
import { blockedFeatureForPath } from '@/lib/featureRoutes';

/**
 * Mounted once at the root layout. Whenever navigation lands on a route that
 * belongs to a feature outside this build's beta scope — by deep link, push
 * payload, or a stale in-app link — it is replaced with the root gate.
 *
 * Redirecting to `/` rather than straight to `/(tabs)` keeps the two guards
 * from racing: the gate re-evaluates session and profile state and picks the
 * correct destination, so a signed-out user who deep-links into a hidden module
 * lands on onboarding rather than inside the app.
 *
 * `replace` (not `push`) so the blocked route never sits in the back stack.
 */
export function useFeatureRouteGuard() {
  const pathname = usePathname();

  useEffect(() => {
    if (blockedFeatureForPath(pathname)) {
      router.replace('/' as never);
    }
  }, [pathname]);
}
