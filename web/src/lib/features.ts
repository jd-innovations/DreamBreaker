// Feature visibility — the web half.
//
// The map and the decision rule live in `@dreambreaker/shared` so web and
// mobile cannot drift on what is shipped. Only the environment question is
// answered here, because the two platforms answer it from different inputs:
// mobile reads `EXPO_PUBLIC_APP_ENV` and `__DEV__`, web reads
// `NEXT_PUBLIC_APP_ENV` and `NODE_ENV`.
//
// Deliberately opt-in, matching mobile: an unset value resolves to
// `production`, so forgetting to set it can only ever make the app *more*
// restrictive, never less. Note this means Vercel preview deployments are
// treated as production unless `NEXT_PUBLIC_APP_ENV=internal` is set for the
// preview environment — that is the safe default, not an oversight.

import { resolveFeature, type FeatureKey } from "@shared/features";

export const APP_ENV_VALUES = ["development", "internal", "production"] as const;
export type AppEnv = (typeof APP_ENV_VALUES)[number];

function isAppEnv(value: string | undefined): value is AppEnv {
  return (APP_ENV_VALUES as readonly string[]).includes(value ?? "");
}

function resolveAppEnv(): AppEnv {
  // Must be read as a full static expression, not destructured or computed —
  // Next inlines `process.env.NEXT_PUBLIC_*` at build time by literal match.
  const raw = process.env.NEXT_PUBLIC_APP_ENV;
  if (isAppEnv(raw)) return raw;
  return process.env.NODE_ENV === "production" ? "production" : "development";
}

export const APP_ENV: AppEnv = resolveAppEnv();

/** True for public production builds. Nothing unfinished may be reachable here. */
export const IS_PRODUCTION_BUILD = APP_ENV === "production";

/** True for local dev and internal QA builds — developer access is preserved. */
export const IS_INTERNAL_BUILD = !IS_PRODUCTION_BUILD;

export function isFeatureEnabled(key: FeatureKey): boolean {
  return resolveFeature(key, IS_INTERNAL_BUILD);
}

export type { FeatureKey };
