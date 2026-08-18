# Pending Migrations — held out of the replay path

Created 2026-08-18 by `TODO1.1_EXECUTION_PLAN.md` item **2.1 Phase 1**.
Full rationale and evidence: [`docs/DB_MIGRATION_RECONCILIATION.md`](../../docs/DB_MIGRATION_RECONCILIATION.md).

These files are **not** part of the migration replay path. The Supabase CLI only
reads `supabase/migrations/`, so nothing here is applied by `supabase db push`,
`supabase migration up`, or a branch rebuild.

## Why this folder exists

The governing rule from the 2.1 reconciliation:

> **Anything not in production must not be in the replay path.**

A `supabase/migrations/` folder that builds a database *unlike* production is
runnable, not reproducible. Every file here is real, reviewed work that production
has **not** received. Leaving them in the replay path meant any unrelated
`supabase db push --linked` would silently apply them as a side effect — which is
precisely how the current divergence was created.

`supabase/migrations/` now contains exactly the 33 migrations recorded in
production's `supabase_migrations.schema_migrations`, and nothing else. Phase 2
verified empirically that replaying them onto an empty database reproduces
production — see `docs/DB_MIGRATION_RECONCILIATION.md` §3.3.

## Contents

> `20260817010000_registration_team_payment_groups.sql` was returned to
> `supabase/migrations/` on 2026-08-18: it was applied to production that day and
> is now genuine production history (33rd row). All its objects were verified
> present in production before the move.

| File | Why it is held | What unblocks it |
| --- | --- | --- |
| `20260725010000_par_v1_organized_events.sql` | **Not applied.** The PAR tables reached production through the baseline, but **0 of 10** PAR functions and **0 of 5** PAR triggers exist there. PAR rating processing does not run in production. | PAR algorithm approval + replay validation. `AGENTS.md` forbids implementing a PAR formula before the product spec marks it approved. Tracked under item L4. |
| `20260725011000_par_v1_replay_engine.sql` | **Not applied.** `par_replay_jobs` does not exist in production. Depends on `20260725010000`. | Same gate; must land in order after the file above. |
| `20260814000000_tournament_qr_checkin_phase5_1.sql` | **Already live in production, but absent from migration history.** `check_in_registration()` was applied directly via `CREATE OR REPLACE` (see `TOURNAMENT_QR_CHECKIN_PHASE5_1.md`), including the `r.checked_in_at` alias hotfix, which was confirmed present in `pg_proc`. The function body here is byte-identical to production's once SQL comments are stripped (`0a7d31cb…`, 1827 chars both sides). Held only because production has **no history row to alias it to**, so it would be re-executed by any `db push`. | A history-only `migration repair --status applied`, not an apply. Needs a version number chosen under 2.1, since production never recorded one. |
| `20260817000000_account_deletion.sql` | **Not applied.** Held so it cannot be deployed by accident. Unlike the others it is *ready* — forward-only, idempotent, and already validated against production inside a self-aborting transaction. | Item 1.3's deployment checklist. Move it back into `supabase/migrations/` immediately before applying, then `supabase db push --linked`. |

## Adding to or removing from this folder

**To apply one of these:** move the single file back into `supabase/migrations/`,
confirm with `supabase migration list --linked` that it is the only pending
migration, rehearse on a disposable preview branch, then push. Move nothing else
back at the same time.

**To hold a new migration here:** add a row to the table above stating what is
blocked and what unblocks it. A file in this folder without an entry is
indistinguishable from one that was forgotten.
