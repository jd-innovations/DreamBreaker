# DreamBreaker Coding Instructions

## Product Context

DreamBreaker is a player-centered pickleball platform. The player, not the court or tournament, is the primary product entity.

This is not a standalone My Stats project. My Stats must be implemented inside the existing DreamBreaker app, reusing the current mobile, web, backend, Supabase, auth, profile, navigation, and design systems.

"My Stats" is the user-facing name of the personal player intelligence area.
PAR means Pickleball Activity Rating.

## Implementation Rules

- Audit existing code before modifying it.
- Reuse the current auth, profile, theme, navigation, and Supabase services.
- Read the relevant app-level `AGENTS.md` before changing code inside a subproject.
- For mobile work in `apps/mobile`, Expo version behavior matters. Read `apps/mobile/AGENTS.md` and use the project-native Expo commands.
- Do not create duplicate profile, match, stats, session, court, tournament, or facility systems.
- Use existing design tokens from `apps/mobile/src/theme`.
- Do not hard-code mock statistics in production paths.
- Do not silently fall back to fake data.
- Create forward-only Supabase migrations.
- Preserve existing working routes and functionality.
- Keep route files thin and business logic in feature modules.
- All user-owned data must enforce Row Level Security.
- Use `rg` / `rg --files` for searches.
- Do not revert user changes or broad worktree changes you did not make.

## My Stats Rules

Read these before changing My Stats:

- `docs/MY_STATS_PRODUCT_SPEC.md`
- `docs/PAR_RATING_SPEC.md`
- `docs/PLAY_SESSION_DATA_MODEL.md`
- `docs/MY_STATS_UI_SPEC.md`

Do not implement or invent a PAR formula until the product specification explicitly marks the algorithm as approved.

Treat the existing My Stats docs as planning/specification drafts unless a section explicitly says it is approved for implementation.

## Verification Expectations

- Run typecheck, lint, and relevant tests before declaring completion.
- For mobile TypeScript changes, run touched-file ESLint when possible.
- Run `npx tsc --noEmit` when changes affect shared types, data models, navigation contracts, or service boundaries.
- If repo-wide checks fail on unrelated existing issues, call that out and include the focused checks that passed.

## Delivery Requirements

For each task:

1. Report current-state findings.
2. Identify conflicts and missing dependencies.
3. Propose the implementation plan.
4. Implement only the approved phase.
5. Report changed files, migrations, tests, and unresolved risks.