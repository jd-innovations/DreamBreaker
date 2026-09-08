#!/usr/bin/env node
/**
 * Validates that every EAS build profile declares a recognized
 * EXPO_PUBLIC_APP_ENV.
 *
 * Why this exists: feature visibility (see src/lib/featureFlags.ts and
 * BETA_SCOPE.md) is driven entirely by EXPO_PUBLIC_APP_ENV. resolveAppEnv()
 * fails closed — an unrecognized value falls back to `production` — which is
 * the safe direction but silent. The `preview` profile shipped
 * EXPO_PUBLIC_APP_ENV="preview" and therefore ran internal QA builds as
 * production until 90505d8, with nothing to flag it.
 *
 * The runtime warning added in c2a105e only fires when __DEV__ is true, so it
 * could not have caught that bug: it happened in a release-mode preview build.
 * At runtime, "misconfigured preview build" and "correct production build" are
 * indistinguishable. This check closes that gap where the information actually
 * exists — in the repo, before the build runs.
 *
 * Usage:
 *   node ./scripts/validate-eas-env.js
 *   node ./scripts/validate-eas-env.js --self-test
 */

// The shared flat ESLint config targets the app's React Native source and does
// not declare Node globals; this file is a plain CommonJS script. Paths resolve
// from __dirname rather than process.cwd() so the check works when invoked from
// the repo root (e.g. in CI) as well as from apps/mobile.
/* global __dirname */

const fs = require('fs');
const path = require('path');

// Must match APP_ENV_VALUES in src/lib/featureFlags.ts. Duplicated because
// that file is TypeScript and references __DEV__/process.env, so it cannot be
// required from a plain Node script. checkForDrift() below guards the copy.
const VALID_APP_ENVS = ['development', 'internal', 'production'];

// Build profiles allowed to omit EXPO_PUBLIC_APP_ENV entirely. Empty on
// purpose: omission is silently equivalent to `production` in a release build,
// so every profile should state its intent. Adding a name here is a deliberate,
// reviewable exemption and must be justified in a comment.
const PROFILES_ALLOWED_TO_OMIT = [];

const EAS_JSON_PATH = path.join(__dirname, '..', 'eas.json');
const FEATURE_FLAGS_PATH = path.join(__dirname, '..', 'src', 'lib', 'featureFlags.ts');

/**
 * Pure validator so it can be exercised against in-memory fixtures.
 * @param {Record<string, {env?: Record<string, string>}>} build
 * @returns {string[]} one message per problem; empty means valid
 */
function validateBuildProfiles(build) {
  const errors = [];

  if (!build || typeof build !== 'object') {
    return ['eas.json has no "build" object.'];
  }

  const names = Object.keys(build);
  if (names.length === 0) {
    return ['eas.json "build" contains no profiles.'];
  }

  for (const name of names) {
    const profile = build[name];
    const value = profile && profile.env ? profile.env.EXPO_PUBLIC_APP_ENV : undefined;

    if (value === undefined) {
      if (PROFILES_ALLOWED_TO_OMIT.includes(name)) continue;
      errors.push(
        `profile "${name}": EXPO_PUBLIC_APP_ENV is not set. ` +
          `A release build with no value silently resolves to "production". ` +
          `Set one of: ${VALID_APP_ENVS.join(', ')}.`
      );
      continue;
    }

    if (!VALID_APP_ENVS.includes(value)) {
      errors.push(
        `profile "${name}": EXPO_PUBLIC_APP_ENV is "${value}", which is not recognized. ` +
          `resolveAppEnv() will fall back to "production" and hide internal-only ` +
          `modules. Expected one of: ${VALID_APP_ENVS.join(', ')}.`
      );
    }
  }

  return errors;
}

/**
 * Non-fatal guard against VALID_APP_ENVS drifting from featureFlags.ts.
 * Warns rather than fails: a parse miss here is not itself a config error.
 * @returns {string|null} warning message, or null when in sync
 */
function checkForDrift() {
  let source;
  try {
    source = fs.readFileSync(FEATURE_FLAGS_PATH, 'utf8');
  } catch {
    return `could not read ${path.relative(process.cwd(), FEATURE_FLAGS_PATH)} to cross-check the accepted values.`;
  }

  const match = source.match(/APP_ENV_VALUES\s*=\s*\[([^\]]*)\]/);
  if (!match) return 'could not locate APP_ENV_VALUES in featureFlags.ts to cross-check.';

  const fromSource = match[1]
    .split(',')
    .map((part) => part.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);

  const same =
    fromSource.length === VALID_APP_ENVS.length &&
    fromSource.every((v, i) => v === VALID_APP_ENVS[i]);

  return same
    ? null
    : `VALID_APP_ENVS in this script (${VALID_APP_ENVS.join(', ')}) no longer matches ` +
        `APP_ENV_VALUES in featureFlags.ts (${fromSource.join(', ')}). Update this script.`;
}

/** Proves the validator rejects the exact shapes that caused past bugs. */
function selfTest() {
  const cases = [
    { name: 'valid config', build: { production: { env: { EXPO_PUBLIC_APP_ENV: 'production' } } }, shouldFail: false },
    { name: 'the 90505d8 bug ("preview")', build: { preview: { env: { EXPO_PUBLIC_APP_ENV: 'preview' } } }, shouldFail: true },
    { name: 'missing env block', build: { production: {} }, shouldFail: true },
    { name: 'empty string', build: { preview: { env: { EXPO_PUBLIC_APP_ENV: '' } } }, shouldFail: true },
    { name: 'wrong case', build: { preview: { env: { EXPO_PUBLIC_APP_ENV: 'Internal' } } }, shouldFail: true },
    { name: 'no build object', build: undefined, shouldFail: true },
  ];

  let failures = 0;
  for (const testCase of cases) {
    const failed = validateBuildProfiles(testCase.build).length > 0;
    const ok = failed === testCase.shouldFail;
    if (!ok) failures += 1;
    console.log(
      `  ${ok ? 'PASS' : 'FAIL'}  ${testCase.name} — expected ${testCase.shouldFail ? 'reject' : 'accept'}, got ${failed ? 'reject' : 'accept'}`
    );
  }

  if (failures > 0) {
    console.error(`\nSelf-test: ${failures} case(s) behaved unexpectedly.`);
    process.exit(1);
  }
  console.log('\nSelf-test: all cases behaved as expected.');
}

function main() {
  if (process.argv.includes('--self-test')) {
    console.log('Running validator self-test against in-memory fixtures:\n');
    selfTest();
    return;
  }

  let raw;
  try {
    raw = fs.readFileSync(EAS_JSON_PATH, 'utf8');
  } catch (err) {
    console.error(`Could not read eas.json at ${EAS_JSON_PATH}: ${err.message}`);
    process.exit(1);
  }

  let config;
  try {
    config = JSON.parse(raw);
  } catch (err) {
    console.error(`eas.json is not valid JSON: ${err.message}`);
    process.exit(1);
  }

  const errors = validateBuildProfiles(config.build);

  if (errors.length > 0) {
    console.error('EAS app-env validation FAILED:\n');
    for (const message of errors) console.error(`  - ${message}`);
    console.error('\nSee BETA_SCOPE.md for what each environment exposes.');
    process.exit(1);
  }

  const profiles = Object.keys(config.build);
  console.log(`EAS app-env validation passed (${profiles.length} profile${profiles.length === 1 ? '' : 's'}):`);
  for (const name of profiles) {
    console.log(`  ${name.padEnd(14)} -> ${config.build[name].env.EXPO_PUBLIC_APP_ENV}`);
  }

  const drift = checkForDrift();
  if (drift) console.warn(`\nWarning: ${drift}`);
}

main();

module.exports = { validateBuildProfiles, VALID_APP_ENVS };
