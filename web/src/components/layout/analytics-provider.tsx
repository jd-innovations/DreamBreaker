"use client";

import { useEffect } from "react";
import { initAnalytics } from "@/lib/analytics";

/**
 * Starts analytics once, in the browser (TODO1.1_EXECUTION_PLAN.md 4.2).
 *
 * Renders nothing. It exists as a component only because initialisation has to
 * happen client-side and after hydration — `posthog-js` touches window and
 * localStorage, so importing it into the server render would break the build.
 *
 * Mounted in the root layout rather than in PageShell: /dashboard and /admin
 * roll their own shells, and an analytics provider that covers only part of the
 * app produces funnels with holes in them that look like user drop-off.
 *
 * With no key configured, `initAnalytics` returns without starting the SDK and
 * every later `track` is a no-op — the correct behaviour locally and in any
 * environment where analytics is deliberately off.
 */
export function AnalyticsProvider() {
  useEffect(() => {
    initAnalytics();
  }, []);

  return null;
}
