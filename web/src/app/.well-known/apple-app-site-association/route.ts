const BUNDLE_IDENTIFIER = 'app.pickleballapp';
const TEAM_ID = process.env.APPLE_TEAM_ID ?? process.env.APPLE_DEVELOPER_TEAM_ID;

// Only paths the MOBILE APP can actually render. This list was originally
// written from the web app's routes, which is how two of them came to advertise
// destinations the app has no screen for.
//
// Removed 2026-08-25 after device testing (item 5.3, cases 25 and 26):
//
//   '/booking/*'       -- no booking/[id] route in the app
//   '/coach/offers/*'  -- no coach/offers/[id] route (only create and [id]/edit)
//
// Those did not fail safely. iOS claimed the link, opened the app, found no
// matching route, and left the user on a blank branded screen **with no way
// back** — a force-quit was the only exit. Both have working pages on the web
// app, so dropping them from this list turns a dead end into the page the
// person wanted.
//
// Adding a path here without a matching app route recreates that trap. Check
// apps/mobile/src/app/ before extending this list.
//
// Deliberately still absent: '/q/*', the check-in QR payload. Scanning one with
// a phone camera currently 404s rather than opening the app. Adding it here
// would route a check-in token through the deep-link handler, which is a
// bigger decision than a path list — see item 5.3's completion notes.
const PATHS = [
  '/conversation/*',
  '/groups/*',
  '/tournament/*',
  '/marketplace/*',
  '/claim/*',
  '/community/*',
];

export const dynamic = 'force-dynamic';

export function GET() {
  if (!TEAM_ID) {
    return Response.json(
      {
        error: 'NEEDS_APPLE_ACCOUNT_VERIFICATION',
        message: 'Set APPLE_TEAM_ID to enable the production AASA file.',
        bundleIdentifier: BUNDLE_IDENTIFIER,
        paths: PATHS,
      },
      {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }

  return Response.json(
    {
      applinks: {
        apps: [],
        details: [
          {
            appID: `${TEAM_ID}.${BUNDLE_IDENTIFIER}`,
            paths: PATHS,
          },
        ],
      },
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
      },
    },
  );
}
