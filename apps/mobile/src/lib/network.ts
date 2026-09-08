// Network state (TODO1.1 item 5.4).
//
// One source of truth for "are we online", so screens and guards cannot
// disagree about it. Wraps expo-network rather than exposing it directly,
// because the raw shape has a trap in it — see below.
//
// ── isConnected is not the question anyone means ────────────────────────────
//
// expo-network reports two different things:
//
//   isConnected           the device has joined a network
//   isInternetReachable   traffic actually gets out
//
// They come apart constantly, and always at the worst moment: a captive portal
// at a tournament venue, hotel wifi before you accept the terms, a phone that
// has held onto an access point it can no longer route through. In every one of
// those, isConnected is true and nothing works.
//
// Trusting isConnected is how an app ends up letting someone tap Pay on a dead
// connection, which is exactly what 5.4 exists to prevent. So `isOnline` below
// requires both.
//
// ── Unknown is treated as online, deliberately ──────────────────────────────
//
// isInternetReachable is `null` until the first probe resolves, and can stay
// null on some platforms. Treating unknown as offline would flash an offline
// banner on every cold start and block a payment that would have worked.
// Failing open is right here: the network layer still reports real errors, and
// a request that fails gives a truthful message, whereas a wrongly-blocked
// button gives a false one.

import { useEffect, useState } from 'react';
import * as Network from 'expo-network';

export type NetworkStatus = {
  /** Both connected AND able to reach the internet. See the header. */
  isOnline: boolean;
  /** Null until the first probe resolves — do not gate anything on this alone. */
  isInternetReachable: boolean | null;
  isConnected: boolean | null;
};

function toStatus(state: Network.NetworkState): NetworkStatus {
  const isConnected = state.isConnected ?? null;
  const isInternetReachable = state.isInternetReachable ?? null;
  return {
    isConnected,
    isInternetReachable,
    // `!== false` on both, so null (unknown) reads as online.
    isOnline: isConnected !== false && isInternetReachable !== false,
  };
}

export const ONLINE_UNKNOWN: NetworkStatus = {
  isOnline: true,
  isInternetReachable: null,
  isConnected: null,
};

/**
 * Subscribes to network state for the lifetime of the component.
 *
 * Seeds from a one-shot read as well as subscribing: the listener only fires on
 * CHANGE, so a screen mounted while already offline would otherwise sit there
 * believing it was online until the connection came back.
 */
export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>(ONLINE_UNKNOWN);

  useEffect(() => {
    let cancelled = false;

    void Network.getNetworkStateAsync()
      .then((state) => { if (!cancelled) setStatus(toStatus(state)); })
      .catch(() => { /* keep the optimistic default; see the header */ });

    const subscription = Network.addNetworkStateListener((state) => {
      setStatus(toStatus(state));
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return status;
}

/**
 * A one-shot check for code that is not a component — payment and check-in
 * guards, which need the answer at the moment of the tap rather than at render.
 *
 * Never throws. A failed probe returns true for the same reason unknown does:
 * blocking a working payment is worse than letting the request fail honestly.
 */
export async function isOnlineNow(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    return toStatus(state).isOnline;
  } catch {
    return true;
  }
}
