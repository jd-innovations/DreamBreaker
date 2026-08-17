import { isFeatureEnabled, type FeatureKey } from '@/lib/featureFlags';

// Route-prefix → feature map. This is the deep-link / direct-route half of the
// beta scope gate: hiding a menu entry stops a tap, but a universal link, a
// push notification payload, or a typed URL bypasses the UI entirely. Every
// out-of-scope module needs an entry here, not just a hidden button.
const GATED_ROUTE_PREFIXES: { prefix: string; feature: FeatureKey }[] = [
  { prefix: '/design-lab', feature: 'devTools' },
  { prefix: '/dev-qr-scan', feature: 'devTools' },
  { prefix: '/onboarding-preview', feature: 'devTools' },
  { prefix: '/coach', feature: 'coachMarketplace' },
  { prefix: '/lessons', feature: 'lessonMarketplace' },
  { prefix: '/wallet', feature: 'wallet' },
  { prefix: '/stats', feature: 'myStats' },
];

// Segment-aware so `/wallet` and `/wallet/abc` match but `/wallet-help`
// would not.
function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Returns the disabled feature that owns `pathname`, or `null` when the route
 * is in scope for this build. `pathname` is an expo-router pathname, so route
 * groups such as `(tabs)` are already stripped.
 */
export function blockedFeatureForPath(pathname: string): FeatureKey | null {
  const match = GATED_ROUTE_PREFIXES.find((entry) => matchesPrefix(pathname, entry.prefix));
  if (!match) return null;
  return isFeatureEnabled(match.feature) ? null : match.feature;
}
