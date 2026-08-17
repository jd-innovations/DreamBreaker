import type { ProfileStatus } from '@/hooks/useProfile';
import type { UserProfile } from '@/lib/services/profile';
import { isProfileCompleteForEntry } from '@/lib/profileCompletion';

// Single source of truth for "which app state does this user belong in".
// Deliberately a pure function: the decision is inspectable and testable
// without a navigator, and the route component that consumes it only has to
// render, never to sequence effects.
//
// This governs the root route `/` only. Guest browsing of the public tabs is
// intentional product behavior (see (tabs)/index.tsx, which renders for
// signed-out users, and requireAuth() in lib/authGuard.ts, which prompts at
// the point of a write). Route-level guards on authenticated-only screens stay
// exactly where they are, as defense in depth.

export type AuthGateState =
  /** Session or profile still resolving — render a neutral loading screen. */
  | { state: 'loading' }
  /** The profile could not be read. NOT the same as an incomplete profile. */
  | { state: 'error' }
  /** No session. */
  | { state: 'guest'; href: string }
  /** Signed in, but the profile is missing fields the app depends on. */
  | { state: 'incomplete'; href: string }
  /** Signed in and ready for the app. */
  | { state: 'ready'; href: string };

export type AuthGateInput = {
  sessionLoading: boolean;
  isAuthenticated: boolean;
  profileStatus: ProfileStatus;
  profile: UserProfile | null;
};

export const GUEST_HREF = '/onboarding/welcome';
export const ONBOARDING_HREF = '/onboarding/welcome';
export const APP_HREF = '/(tabs)';

export function resolveAuthGate(input: AuthGateInput): AuthGateState {
  // Session first, always. useSession starts `loading: true` and only flips
  // once SecureStore has been read — acting on `!isAuthenticated` before that
  // would bounce every returning user out of their own app on cold start.
  if (input.sessionLoading) return { state: 'loading' };

  if (!input.isAuthenticated) return { state: 'guest', href: GUEST_HREF };

  // Authenticated: the profile read decides where they go, so wait for it.
  if (input.profileStatus === 'idle' || input.profileStatus === 'loading') {
    return { state: 'loading' };
  }

  // A failed read is not evidence of an incomplete profile, and guessing wrong
  // is destructive: routing a user with a real profile into onboarding lets
  // finalizeOnboarding() overwrite fields they already set. Surface the failure
  // and let them retry instead of silently choosing either branch.
  if (input.profileStatus === 'error') return { state: 'error' };

  if (!isProfileCompleteForEntry(input.profile)) {
    return { state: 'incomplete', href: ONBOARDING_HREF };
  }

  return { state: 'ready', href: APP_HREF };
}
