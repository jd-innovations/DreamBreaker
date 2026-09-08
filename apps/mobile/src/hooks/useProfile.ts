import { useSyncExternalStore, useCallback, useEffect } from 'react';
import { useFocusEffect } from 'expo-router';
import { useSession } from '@/hooks/useSession';
import { fetchProfile, type UserProfile } from '@/lib/services/profile';
import { onProfileUpdated } from '@/lib/profileEvents';

// Shared profile store. The always-mounted header/menu and tab screens all read
// this cache, so auth transitions must invalidate it aggressively. In
// particular, logging out and back into the same account can keep the same
// user id while the session token changes; force a fresh profile read for that.

// `profileState === null` is ambiguous on its own — it means "not loaded yet",
// "load failed", and "no row" all at once. Routing decisions must not collapse
// those, so the store also tracks an explicit status. See resolveAuthGate().
export type ProfileStatus = 'idle' | 'loading' | 'loaded' | 'error';

let currentUserId: string | null = null;
let currentAccessToken: string | null = null;
let profileState: UserProfile | null = null;
let profileStatus: ProfileStatus = 'idle';
let inFlight: Promise<void> | null = null;
let latestReq = 0;
let loadingProfile = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function resetProfileStore() {
  currentUserId = null;
  currentAccessToken = null;
  profileState = null;
  profileStatus = 'idle';
  inFlight = null;
  loadingProfile = false;
  latestReq += 1;
  emit();
}

function loadProfile(userId: string, force = false): Promise<void> {
  if (inFlight && !force) return inFlight;
  const req = ++latestReq;
  loadingProfile = true;
  profileStatus = 'loading';
  emit();

  const p = (async () => {
    const data = await fetchProfile(userId);
    if (currentUserId === userId && req === latestReq) {
      profileState = data;
      // fetchProfile() returns null on a query error as well as a genuine
      // miss, and a row always exists for an authenticated user — so treat a
      // null here as a failed read, not as an empty profile.
      profileStatus = data ? 'loaded' : 'error';
      loadingProfile = false;
      emit();
    }
  })().catch(error => {
    if (currentUserId === userId && req === latestReq) {
      profileState = null;
      profileStatus = 'error';
      loadingProfile = false;
      emit();
    }
    console.error('[useProfile] load failed:', error);
  });

  inFlight = p.finally(() => { if (inFlight === p) inFlight = null; });
  return inFlight;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getSnapshot() {
  return profileState;
}

// Separate snapshot so useSyncExternalStore compares a primitive — combining
// profile + status into one object would allocate a new reference per call and
// loop.
function getStatusSnapshot(): ProfileStatus {
  return profileStatus;
}

/** Force a re-read of the signed-in user's profile (used by retry affordances). */
export function reloadProfile(): void {
  if (currentUserId) loadProfile(currentUserId, true);
}

export function useProfile() {
  const { user, session, loading: sessionLoading } = useSession();
  const profile = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const status = useSyncExternalStore(subscribe, getStatusSnapshot, getStatusSnapshot);
  const accessToken = session?.access_token ?? null;

  useEffect(() => {
    if (!user?.id) {
      if (currentUserId !== null || profileState !== null || loadingProfile) resetProfileStore();
      return;
    }

    const userChanged = user.id !== currentUserId;
    const tokenChanged = accessToken !== currentAccessToken;

    if (userChanged) {
      currentUserId = user.id;
      currentAccessToken = accessToken;
      profileState = null;
      inFlight = null;
      emit();
      loadProfile(user.id, true);
      return;
    }

    if (tokenChanged) {
      currentAccessToken = accessToken;
      loadProfile(user.id, true);
      return;
    }

    if (!profileState && !loadingProfile) loadProfile(user.id);
  }, [user?.id, accessToken]);

  useFocusEffect(
    useCallback(() => {
      if (currentUserId) loadProfile(currentUserId, true);
    }, []),
  );

  useEffect(() => onProfileUpdated(() => {
    if (currentUserId) loadProfile(currentUserId, true);
  }), []);

  return { profile, user, status, loading: sessionLoading || loadingProfile };
}