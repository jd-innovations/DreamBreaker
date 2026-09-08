import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';

// Phase 2 diagnostics collector (SUPPORT_EXPERIENCE_ARCHITECTURE.md §15).
// Deliberately zero-new-dependency and ephemeral: an in-memory breadcrumb
// trail and a single "last error" slot, cleared on relaunch, never persisted
// except as part of an explicit ticket submission the user has seen a
// disclosure for (§12). No network-state field -- @react-native-community/netinfo
// isn't a dependency; see TODO1.1.md Task L4 for the open call on adding it.

export type DiagnosticsSnapshot = {
  appVersion?: string;
  buildNumber?: string;
  platform: string;
  osVersion?: string;
  deviceModel?: string;
  routeHistory: string[];
  lastError?: { code: string; message?: string; at: string };
};

const MAX_ROUTE_HISTORY = 10;
let routeHistory: string[] = [];
let lastError: DiagnosticsSnapshot['lastError'];

/**
 * Records a route transition for the breadcrumb trail. Called on every
 * pathname change (see FloatingSupportButton) regardless of whether the
 * launcher is visible on that screen, so the trail reflects where the user
 * actually was, not just where the button happened to show.
 */
export function recordRouteVisit(routeName: string): void {
  if (routeHistory[routeHistory.length - 1] === routeName) return;
  routeHistory.push(routeName);
  if (routeHistory.length > MAX_ROUTE_HISTORY) routeHistory.shift();
}

/**
 * Call when a tracked API call fails, so a support ticket can reference it.
 * Never pass request/response bodies here -- diagnostics must not become a
 * backdoor around the "no auto-attached message/API content" rule (§12).
 */
export function reportSupportError(code: string, message?: string): void {
  lastError = { code, message, at: new Date().toISOString() };
}

export function buildDiagnosticsSnapshot(): DiagnosticsSnapshot {
  return {
    appVersion: Constants.expoConfig?.version,
    buildNumber:
      Platform.OS === 'ios'
        ? Constants.expoConfig?.ios?.buildNumber ?? undefined
        : Constants.expoConfig?.android?.versionCode !== undefined
          ? String(Constants.expoConfig.android.versionCode)
          : undefined,
    platform: Platform.OS,
    osVersion: Platform.Version !== undefined ? String(Platform.Version) : undefined,
    deviceModel: Device.modelName ?? undefined,
    routeHistory: [...routeHistory],
    lastError,
  };
}
