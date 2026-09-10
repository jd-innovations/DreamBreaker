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
//
// Added 2026-09-08 (sharing framework audit): '/coach/*' and '/facility/*'.
// Both now have real web pages (web/src/app/coach/[id], .../facility/[id])
// AND matching mobile screens (apps/mobile/src/app/coach/[id].tsx,
// .../facility/[id].tsx) — the two conditions this file's own history says to
// check first. facility/* has no exceptions: every path under it
// (apply, check-in, deals, manage, [id]) is a real screen. coach/* needs one:
// 'NOT /coach/offers/*' must stay ahead of the wildcard, because
// coach/offers/[id] (bare, no /edit) still has no matching screen — only
// create.tsx and [id]/edit.tsx exist. Apple evaluates these paths in order and
// stops at the first match, so the NOT-exclusion has to come before '/coach/*'
// or it does nothing.
// Added 2026-09-10: '/auth/confirm', the signup-confirmation link, and
// '/auth/reset', the password-recovery link.
//
// Meets both conditions this file's history says to check first -- a real web
// page (web/src/app/auth/confirm) AND a matching app screen
// (apps/mobile/src/app/auth/confirm.tsx), added in the same change.
//
// Why it has to be an HTTPS path rather than the app's own scheme: a
// `pickleballapp://` emailRedirectTo was tried and shipped a confirmation email
// with NO LINK IN IT -- mail clients will not linkify a non-http(s) scheme, so
// Gmail dropped it silently and the account could not be confirmed at all.
// A claimed HTTPS path is the only shape that works in email AND opens the app.
//
// Exact paths, not '/auth/*': not everything under /auth has an app screen.
// '/auth/callback' in particular is the web OAuth handler and MUST stay with
// the browser -- claiming it would hand a web sign-in to the app mid-flow.
const PATHS = [
  '/auth/confirm',
  '/auth/reset',
  '/conversation/*',
  '/groups/*',
  '/tournament/*',
  '/marketplace/*',
  '/claim/*',
  '/community/*',
  'NOT /coach/offers/*',
  '/coach/*',
  '/facility/*',
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
        // 300s, not 3600s. iOS never reads this origin -- it reads Apple's CDN
        // copy at https://app-site-association.cdn-apple.com/a/v1/<domain>,
        // which honours this header. At max-age=3600 a change to PATHS above
        // stayed invisible to every phone for up to an hour after the promote,
        // and a reinstall could not fix it: the reinstall faithfully re-fetched
        // the stale CDN file, so a newly claimed path kept opening in Safari.
        // That cost three test cycles and most of an hour on 2026-09-10 while
        // '/auth/reset' was being verified.
        //
        // The file is a few hundred bytes and changes only when PATHS does, so
        // the extra origin traffic is nothing next to being able to test a
        // path change in minutes. To check what phones can actually see:
        //   curl -sD- https://app-site-association.cdn-apple.com/a/v1/pickleballapp.app
        // and read the Age header -- the wait left is (max-age - Age) seconds.
        'Cache-Control': 'public, max-age=300',
      },
    },
  );
}
