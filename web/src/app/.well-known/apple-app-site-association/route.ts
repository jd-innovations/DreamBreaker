const BUNDLE_IDENTIFIER = 'com.dreambreakerpb.app';
const TEAM_ID = process.env.APPLE_TEAM_ID ?? process.env.APPLE_DEVELOPER_TEAM_ID;

const PATHS = [
  '/conversation/*',
  '/groups/*',
  '/tournament/*',
  '/booking/*',
  '/marketplace/*',
  '/coach/offers/*',
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
