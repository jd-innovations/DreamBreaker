import * as Sentry from '@sentry/react-native';

// For a failure the screen deliberately does not show (2026-10-05 pre-launch
// triage). These used to be `.catch(() => {})`: the request failed, the screen
// showed its empty state, and nothing anywhere said so — the "reports nothing
// when it meant something went wrong" pattern this codebase keeps re-finding.
//
// Use it where silence is the right UX but invisibility is not: a secondary
// fetch, a best-effort background write. A screen's MAIN data should show
// ErrorState instead (components/states/ScreenState.tsx).
//
//   fetchThing(id).then(set).catch(reportSilentFailure('games:joined'));
//
// `where` is a short, stable label ("screen:what") so Sentry groups by it. The
// Sentry scrubber (lib/observability/sentry.ts) strips personal data as for
// every other event.

export function reportSilentFailure(where: string) {
  return (err: unknown): void => {
    if (__DEV__) console.warn(`[silent failure] ${where}`, err);
    Sentry.withScope((scope) => {
      scope.setTag('silent_failure', where);
      Sentry.captureException(err instanceof Error ? err : new Error(`${where}: ${String((err as { message?: string })?.message ?? err)}`));
    });
  };
}
