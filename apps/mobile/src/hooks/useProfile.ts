import { useSyncExternalStore, useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { useSession } from '@/hooks/useSession';
import { fetchProfile, type UserProfile } from '@/lib/services/profile';
import { onProfileUpdated } from '@/lib/profileEvents';
// PERF-TRACE (Phase 0, temporary — see PERFORMANCE_REGRESSION_AUDIT.md)
import { traceProfileFocus, traceProfileLoad, traceProfileEmit, traceProfileRender } from '@/lib/devPerfTrace';

// Shared profile store. The always-mounted header/menu and tab screens all read
// this cache, so auth transitions must invalidate it aggressively. In
// particular, logging out and back into the same account can keep the same
// user id while the session token changes; force a fresh profile read for that.

// `profileState === null` is ambiguous on its own — it means "not loaded yet",
// "load failed", and "no row" all at once. Routing decisions must not collapse
// those, so the store also tracks an explicit status. See resolveAuthGate().
export type ProfileStatus = 'idle' | 'loading' | 'loaded' | 'error';

// F1 fix (PERFORMANCE_REGRESSION_AUDIT.md): a focus refresh within this window
// of the last successful load is skipped entirely rather than re-fetched.
// `force` no longer means "bypass in-flight dedupe" (see loadProfile) — it
// means "bypass this freshness window", used for identity/token changes and
// explicit refresh affordances (reloadProfile, onProfileUpdated).
const FRESHNESS_WINDOW_MS = 30_000;

let currentUserId: string | null = null;
let currentAccessToken: string | null = null;
let profileState: UserProfile | null = null;
let profileStatus: ProfileStatus = 'idle';
let inFlight: Promise<void> | null = null;
let latestReq = 0;
let loadingProfile = false;
let lastLoadedAt: number | null = null;
const listeners = new Set<() => void>();

function emit(reason = 'unspecified') {
  traceProfileEmit(reason, listeners.size);   // PERF-TRACE
  for (const l of listeners) l();
}

function resetProfileStore() {
  currentUserId = null;
  currentAccessToken = null;
  profileState = null;
  profileStatus = 'idle';
  inFlight = null;
  loadingProfile = false;
  lastLoadedAt = null;
  latestReq += 1;
  emit();
}

function loadProfile(userId: string, force = false): Promise<void> {
  // PERF-TRACE: report the force ARGUMENT and the store state as independent
  // facts. The first version reported `forced` only when a request was already
  // in flight, so a force=true call with an idle store logged as "cold" — which
  // would have made the F1 rule ("forced >= 2") almost never trip. Post-fix,
  // force+inFlight no longer causes a duplicate request (see below), so this
  // combination is expected to be rare/zero in the scripted focus flows, not a
  // meaningful "bypass" anymore — kept for regression verification.
  traceProfileLoad(force, inFlight !== null, profileState !== null, userId);

  // F1 fix, requirement 1: an in-flight request is ALWAYS reused, regardless of
  // `force`. Force never bypasses dedupe — that was the actual bug (two
  // navigations 1-5ms apart each forcing past the in-flight check and issuing
  // their own /profiles request).
  if (inFlight) return inFlight;

  // F1 fix, requirement 3: within the freshness window, skip a non-forced
  // refresh entirely rather than re-fetching. Identity/token changes and
  // explicit refreshes (reloadProfile, onProfileUpdated) pass force=true to
  // bypass this — that is what `force` now means.
  if (!force && profileState && lastLoadedAt !== null && Date.now() - lastLoadedAt < FRESHNESS_WINDOW_MS) {
    return Promise.resolve();
  }

  const req = ++latestReq;
  // F1 fix, requirement 4: a refresh over an already-known profile is a
  // background refresh — it must not flip the store into a blocking loading
  // state (that would re-render all subscribers into "loading" over data they
  // already have).
  const hadCachedProfile = profileState !== null;
  if (!hadCachedProfile) {
    loadingProfile = true;
    profileStatus = 'loading';
    emit('load:start');
  }

  const p = (async () => {
    const data = await fetchProfile(userId);
    if (currentUserId === userId && req === latestReq) {
      profileState = data;
      // fetchProfile() returns null on a query error as well as a genuine
      // miss, and a row always exists for an authenticated user — so treat a
      // null here as a failed read, not as an empty profile.
      profileStatus = data ? 'loaded' : 'error';
      loadingProfile = false;
      if (data) lastLoadedAt = Date.now();
      emit('load:settled');
    }
  })().catch(error => {
    if (currentUserId === userId && req === latestReq) {
      // A failed background refresh must not discard a good cached profile —
      // only clear it when there was nothing cached to fall back on.
      if (!hadCachedProfile) {
        profileState = null;
        profileStatus = 'error';
      }
      loadingProfile = false;
      emit();
    }
    console.error('[useProfile] load failed:', error);
  });

  // Pre-existing bug, surfaced by requirement 1: this closure must compare
  // against the WRAPPED promise (`thisInFlight`), not the raw settle promise
  // `p`. Comparing against `p` — the previous code — meant `inFlight === p`
  // was never true (inFlight is always assigned the .finally()-wrapped
  // promise, a different object than `p`), so `inFlight` was never actually
  // cleared back to null. That was invisible before because every focus call
  // passed force=true, which bypassed the `inFlight` check entirely (the old
  // `if (inFlight && !force)` line). Requirement 1 removes that bypass, which
  // makes inFlight's lifecycle load-bearing for every call — without this
  // fix, the store would stop fetching forever after its first load.
  let thisInFlight: Promise<void>;
  thisInFlight = p.finally(() => { if (inFlight === thisInFlight) inFlight = null; });
  inFlight = thisInFlight;
  return thisInFlight;
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

let traceInstanceSeq = 0;   // PERF-TRACE

export function useProfile() {
  // PERF-TRACE: a stable per-instance id. NOT usePathname() — that re-renders
  // on every navigation and would contaminate the render count being measured.
  const traceId = useRef<number | null>(null);
  if (traceId.current === null) traceId.current = ++traceInstanceSeq;
  traceProfileRender();   // PERF-TRACE
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
      traceProfileFocus(`instance#${traceId.current}`);   // PERF-TRACE
      // F1 fix, requirement 3: not forced — a focus within FRESHNESS_WINDOW_MS
      // of the last successful load is a no-op instead of a refetch.
      if (currentUserId) loadProfile(currentUserId, false);
    }, []),
  );

  useEffect(() => onProfileUpdated(() => {
    if (currentUserId) loadProfile(currentUserId, true);
  }), []);

  return { profile, user, status, loading: sessionLoading || loadingProfile };
}