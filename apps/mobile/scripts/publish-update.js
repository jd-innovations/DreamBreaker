#!/usr/bin/env node
/**
 * Publishes an EAS Update with the same EXPO_PUBLIC_* env the matching build
 * profile bakes in.
 *
 * Why this exists: EXPO_PUBLIC_* variables are inlined into the JS bundle at
 * export time. `eas build` reads them from eas.json's `build.<profile>.env`,
 * but `eas update` does NOT — it exports with whatever the invoking shell has.
 * Publishing from a plain terminal therefore shipped bundles with
 * EXPO_PUBLIC_APP_ENV unset, which resolveAppEnv() falls back to "production"
 * for in a release bundle. That silently flipped IS_INTERNAL_BUILD to false on
 * an internal QA build and hid every feature marked 'hidden' — Coach
 * Marketplace, Lesson Marketplace and Wallet all disappeared from an installed
 * app that had been showing them, with no error anywhere.
 *
 * The values are read from eas.json rather than duplicated here, so the update
 * env cannot drift from the build env.
 *
 * Usage:  node ./scripts/publish-update.js <profile> [--message "..."] [extra eas args]
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const profile = process.argv[2];
if (!profile) {
  console.error('Usage: node ./scripts/publish-update.js <profile> [eas update args]');
  process.exit(1);
}

const easPath = path.join(__dirname, '..', 'eas.json');
const eas = JSON.parse(fs.readFileSync(easPath, 'utf8'));
const build = eas.build?.[profile];

if (!build) {
  console.error(`No build profile "${profile}" in eas.json. Available: ${Object.keys(eas.build ?? {}).join(', ')}`);
  process.exit(1);
}

const channel = build.channel;
if (!channel) {
  // A profile with no channel cannot receive updates at all, so publishing to
  // a branch named after it would go nowhere.
  console.error(`Build profile "${profile}" has no channel; it cannot receive updates.`);
  process.exit(1);
}

// Belt to the --environment braces: harmless if EAS supplies the same values.
const env = { ...process.env, ...(build.env ?? {}) };
// spawnSync runs through a shell (npx needs one on Windows), which re-splits
// on whitespace — and npm has already stripped the caller's quotes by the time
// argv reaches us. Re-quote anything containing a space so a --message survives
// as one argument instead of arriving as three unexpected ones.
const passthrough = process.argv.slice(3).map(a => (/\s/.test(a) ? JSON.stringify(a) : a));

// --environment is the whole point. `eas update` does NOT read eas.json's
// build.<profile>.env, and it does NOT inherit EXPO_PUBLIC_* from the invoking
// shell — it loads them from the named EAS environment. Without this flag the
// bundle shipped with EXPO_PUBLIC_APP_ENV unset, resolveAppEnv() fell back to
// 'production', and every feature marked 'hidden' vanished from an internal
// build. Verify by the "Environment variables ... loaded from" line the CLI
// prints: EXPO_PUBLIC_APP_ENV must appear in it.
const environment = build.environment ?? profile;
const args = [
  'eas-cli', 'update', '--branch', channel, '--platform', 'ios',
  '--environment', environment,
  ...passthrough,
];

console.log(`Publishing to branch "${channel}" using EAS environment "${environment}".`);
console.log("Check the CLI output: EXPO_PUBLIC_APP_ENV must appear in its loaded-from line.");
console.log('Build-profile env (fallback only):');
for (const [k, v] of Object.entries(build.env ?? {})) console.log(`  ${k}=${v}`);
if (!build.env || Object.keys(build.env).length === 0) {
  console.log('  (no env in this build profile — nothing to inline)');
}

const result = spawnSync('npx', args, { stdio: 'inherit', env, shell: true });
process.exit(result.status ?? 1);
