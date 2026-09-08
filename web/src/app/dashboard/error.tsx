"use client";

import { RouteError } from "@/components/shared/route-error";

// Was the only route boundary in the app, and diverged from global-error.tsx in
// three ways that mattered (item 6.3):
//
//   * it used `reset`, which re-renders without re-fetching. The dashboard's
//     realistic failure is a failed data load, so "TRY AGAIN" re-rendered the
//     same failure. `unstable_retry` actually re-fetches.
//   * it printed `error.message` into a <pre>. In production a Server Component
//     error is replaced with a generic string, so that block showed the user
//     nothing useful — and for Client Component errors it showed them the raw
//     message.
//   * it only console.error'd, so nothing reached Sentry.
export default function DashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <RouteError
      error={error}
      onRetry={unstable_retry}
      title="Couldn't load your dashboard"
      message="The error has been reported. Try again, and if it keeps happening please contact support."
    />
  );
}
