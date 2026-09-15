import { useSyncExternalStore } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { claimGuestParticipants } from '@/lib/supabase/playEvents';
import { identifyPurchases } from '@/lib/purchases';

// ─── Shared auth store ────────────────────────────────────────────────────────
// Previously every useSession() call opened its own auth subscription, its own
// getSession() request, and fired claimGuestParticipants() on mount. With this
// hook used in ~50 places (including the always-mounted SlideMenuProvider and
// AppHeader), that meant many redundant subscriptions + DB writes. This backs
// the identical hook API with a single app-lifetime store: one subscription,
// one getSession, one claimGuestParticipants per real auth event.

type SessionState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
};

let state: SessionState = { session: null, user: null, loading: true };
const listeners = new Set<() => void>();
let initialized = false;

function setState(next: SessionState) {
  state = next;
  for (const l of listeners) l();
}

function init() {
  if (initialized) return;
  initialized = true;

  // RevenueCat identity is attached HERE rather than at each sign-in screen.
  // This store is the one place that sees every auth transition, so
  // app_user_id cannot drift from the Supabase user id -- which is the failure
  // that silently detaches a purchase from its buyer. Never awaited: identity
  // is best-effort and must not delay auth state reaching the UI.
  supabase.auth.getSession().then(({ data: { session } }) => {
    setState({ session, user: session?.user ?? null, loading: false });
    identifyPurchases(session?.user?.id ?? null);
    if (session?.user?.email) {
      claimGuestParticipants(session.user.id, session.user.email);
    }
  });

  // One app-lifetime subscription (intentionally never unsubscribed).
  supabase.auth.onAuthStateChange((event, session) => {
    setState({ session, user: session?.user ?? null, loading: false });
    // Sign-out matters as much as sign-in: without logOut() the next person to
    // sign in on this device inherits the previous user's RevenueCat identity.
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
      identifyPurchases(session?.user?.id ?? null);
    }
    if (
      (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') &&
      session?.user?.email
    ) {
      claimGuestParticipants(session.user.id, session.user.email);
    }
  });
}

function subscribe(listener: () => void) {
  init();
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getSnapshot() {
  return state;
}

export function useSession() {
  const s = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    session: s.session,
    user: s.user,
    loading: s.loading,
    isAuthenticated: !!s.session,
  };
}
