// Metro config — exists only so `packages/shared` can be imported.
//
// Workstream B1/B2 of WEB_MOBILE_ALIGNMENT_PLAN.md. The plan called for a root
// npm workspace so both apps could depend on one package. Web did not need one:
// a tsconfig path to ../packages/shared/src was enough, and Vercel resolved it.
// Mobile does not need one either — Metro just has to be told to WATCH a folder
// outside the project root, which is all this file does.
//
// ── Why not the workspace ────────────────────────────────────────────────────
//
// A root workspace replaces two lockfiles with one, and this repo has a
// documented trap there: local npm 11 writes lockfiles that the EAS builders'
// npm 10.8.2 rejects with `Missing: @emnapi/... from lock file`, which has
// broken iOS builds before (see the project memory, and the note in
// packages/shared/README.md). Avoiding the workspace avoids regenerating the
// lockfile at all, so the build that was just verified green stays valid.
//
// If a real workspace is ever wanted for other reasons, Expo's default config
// already discovers monorepo watch folders on its own and this file can go.
//
// ── Safe because the shared package has no runtime dependencies ──────────────
//
// packages/shared is plain TypeScript with no imports of react, react-native or
// any node module. So there is no risk of Metro resolving a second copy of React
// through the added watch folder — the usual monorepo hazard does not apply.

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, '../..');
const sharedRoot = path.resolve(repoRoot, 'packages/shared');

const config = getDefaultConfig(projectRoot);

// Metro refuses to serve files outside the project root unless they are watched.
config.watchFolders = [...(config.watchFolders ?? []), sharedRoot];

// Resolve @shared/* the same way web's tsconfig does, so the import specifier is
// identical in both apps and moving code between them needs no rewrite.
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  '@shared': path.resolve(sharedRoot, 'src'),
};

module.exports = config;
