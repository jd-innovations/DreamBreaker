import { useSyncExternalStore, useCallback, useEffect } from 'react';
import { useFocusEffect } from 'expo-router';
import { useSession } from '@/hooks/useSession';
import { fetchProfile, type UserProfile } from '@/lib/services/profile';
import { onProfileUpdated } from '@/lib/profileEvents';

// Shared profile store. The always-mounted header/menu and tab screens all read
// this cache, so auth transitions must invalidate it aggressively. In
// particular, logging out and back into the same account can keep the same
// user id while the session token changes; force a fresh profile read for that.

let currentUserId: string | null = null;
let currentAccessToken: string | null = null;
let profileState: UserProfile | null = null;
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
  inFlight = null;
  loadingProfile = false;
  latestReq += 1;
  emit();
}

function loadProfile(userId: string, force = false): Promise<void> {
  if (inFlight && !force) return inFlight;
  const req = ++latestReq;
  loadingProfile = true;
  emit();

  const p = (async () => {
    const data = await fetchProfile(userId);
    if (currentUserId === userId && req === latestReq) {
      profileState = data;
      loadingProfile = false;
      emit();
    }
  })().catch(error => {
    if (currentUserId === userId && req === latestReq) {
      profileState = null;
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

export function useProfile() {
  const { user, session, loading: sessionLoading } = useSession();
  const profile = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
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

  return { profile, user, loading: sessionLoading || loadingProfile };
}