# `@dreambreaker/shared`

Contracts shared by `web/` and `apps/mobile/`. Workstream B1 of
`WEB_MOBILE_ALIGNMENT_PLAN.md`.

## What belongs here

Plain TypeScript with **no runtime dependencies and no platform APIs**. This
package is consumed by a Next.js server bundle, a Next.js client bundle, and a
React Native/Hermes bundle — anything that assumes one of those environments
breaks the other two.

Concretely, that rules out: `window`, `document`, `process.env` reads,
`__DEV__`, `AsyncStorage`, `localStorage`, `next/*`, `react-native`, and
anything importing them transitively.

The pattern for anything environment-dependent is a **pure function here, and
the environment read at the call site**. `features.ts` is the worked example:
the visibility map and `resolveFeature()` live here; deciding whether this is an
internal build is left to each app, because the two platforms answer it from
completely different inputs (`EXPO_PUBLIC_APP_ENV` vs `NEXT_PUBLIC_APP_ENV`).

## What belongs here eventually

From the alignment plan, in order:

- **B2** — one generated `database.types.ts` instead of the 267 KB copy in each app
- **C1** — money formatting
- **C2** — status vocabulary
- The onboarding CHECK-constraint translation currently duplicated between
  `web/src/lib/onboarding/transform.ts` and
  `apps/mobile/src/lib/onboarding/finalize.ts`

## Current consumers

**Web only.** Mobile has not been wired in yet, and that is deliberate.

Bringing mobile in means a root workspace and a single root lockfile, and this
repo has a known trap there: local npm is 11.x while the EAS builders run
10.8.2, and that mismatch has broken iOS builds before. It cannot be validated
until the EAS quota resets on **2026-09-01**, so B1 was split — web now, mobile
immediately after a green build, never immediately before one.

Until then this package is duplicated-by-copy on the mobile side rather than
imported, which is the status quo, not a regression.
