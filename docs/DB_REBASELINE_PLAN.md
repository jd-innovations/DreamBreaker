# Database Re-Baseline Plan

> **Status as of 2026-08-17: largely EXECUTED. Historical record + still-valid recipe.**
>
> Steps 1–5 of this plan were carried out. Production's
> `supabase_migrations.schema_migrations` now starts at `20260725000000`
> (`baseline_from_prod`, 1487 statements) and contains 32 rows — the 84 pre-baseline
> legacy rows this document expected to leave in place were **not** retained.
> `supabase/migrations_legacy/` exists with 86 archived files.
>
> Two things this document assumed did **not** happen:
> - The re-baseline was never committed to git. The baseline and every
>   post-baseline migration are still **untracked worktree files**.
> - Step 7 (PAR) was never completed. PAR's tables came in via the baseline, but
>   none of its functions or triggers exist in production.
>
> New divergence has accumulated since. **For the current state of migration
> history, the repo-vs-production comparison, and the plan to reconcile it, read
> [`DB_MIGRATION_RECONCILIATION.md`](./DB_MIGRATION_RECONCILIATION.md) instead.**
> Steps 2 (branch verification) and 6 (normal incremental flow) below remain the
> correct recipe and are referenced from that document.

## Why this is needed (evidence)

The Supabase migration history in this repo **cannot recreate production**. Proven empirically
on a throwaway Pro preview branch: `supabase db push` of the local migrations to a fresh
database **fails on the first migration** (`20260612000001_initial_schema.sql`, statement 39):

- The file — and the SQL recorded in prod's `supabase_migrations.schema_migrations` — declares
  `constraint uq_conversation unique (least(participant_a, participant_b), greatest(...))`.
  Postgres does **not** allow expressions in a `UNIQUE` **constraint**, so this can never have
  executed.
- Production's live `conversations` table instead has a unique **index**
  `uq_conversation_pair on (LEAST(participant_a::text, participant_b::text), GREATEST(...))`.

So production was built from **corrected DDL that was never written back to the migrations**.
Additional drift found during reconciliation:
- 3 migrations exist in prod but were missing locally (now restored:
  `20260705173944_saved_events`, `20260705174156_drop_saved_events_...`,
  `20260720214747_wallet_phase1_revoke_anon_rpc`).
- ~44 migrations exist under **different version timestamps** locally vs. deployed.

Conclusion: incremental repair of dozens of files is riskier and less durable than a **clean
baseline captured from the live production schema**. This plan does that.

## Goal

A `supabase/migrations/` folder whose **first migration is a faithful snapshot of the current
production schema**, verified to rebuild an empty database from scratch, with all legacy
migrations archived for audit and production history left intact.

---

## Environment prerequisite

Baseline generation needs a schema dump of prod, which requires **one of**:
- **Docker Desktop** + Supabase CLI (`supabase db dump` / `supabase db pull` run pg_dump in a
  container matching Postgres 17), or
- a native **Postgres 17 `pg_dump`** client on PATH.

This workstation currently has the Supabase CLI (v2.109.1, logged in, project linked) but **no
Docker and no psql/pg_dump**. Install Docker Desktop (simplest) before step 1, or run steps 1–2
from a machine that has it. Everything else (archiving, branch verification via MCP, repair) can
run from here.

You will also need the **production DB password** (Dashboard → Project Settings → Database →
Connection string / reset password). It is not retrievable via API for the main project.

---

## Step 1 — Generate the baseline from production

Work on a dedicated git branch (e.g. `chore/db-rebaseline`). Do **not** push to prod in this step.

```bash
# 1a. Capture the full public-schema DDL from prod (roles/policies/functions/triggers included).
supabase db dump --linked --schema public -f supabase/_baseline/0001_public_schema.sql

# 1b. Capture cluster roles if any custom roles/grants exist beyond the defaults.
supabase db dump --linked --role-only -f supabase/_baseline/0000_roles.sql

# 1c. (Optional) Capture reference/seed data that the app depends on at boot
#     (e.g. facilities seed, par_algorithm_versions row). Data-only, specific tables:
supabase db dump --linked --data-only \
  -x storage.objects,auth.users \
  -f supabase/_baseline/0002_seed_data.sql
```

Gotchas to handle explicitly (the dump will NOT fully cover these):
- **Storage buckets & storage.objects policies** (created by `group_photos_bucket`,
  `avatars_bucket_enforcement`). `--schema public` excludes the `storage` schema. Recreate bucket
  rows + policies in a small companion migration (see step 3) rather than dumping the
  platform-managed `storage` schema wholesale.
- **Extensions** — confirm the dump emits `create extension` for `uuid-ossp`, `postgis`,
  `pg_cron`/`pg_net` if used. Add any missing at the top of the baseline.
- **Realtime publication** (`supabase_realtime`) membership if the app relies on realtime.
- **Edge Functions** are not schema; they live in `supabase/functions/` and deploy separately.

Assemble the reviewed output into a single first migration:
`supabase/migrations/20260725000000_baseline_from_prod.sql` (pick a timestamp AFTER every
existing deployed version). Prepend a header marking it the reproducible baseline.

## Step 2 — Verify the baseline rebuilds from scratch

Prove it before trusting it. Use a fresh Pro preview branch (no Docker needed for this part):

```bash
supabase branches create rebaseline-verify --region us-east-1
supabase branches get rebaseline-verify -o env      # grab POSTGRES session-pooler URL
# session pooler (IPv4): postgresql://postgres.<branch_ref>:<pw>@aws-0-us-east-1.pooler.supabase.com:5432/postgres
supabase db push --db-url "<branch_session_pooler_url>" --include-all
```

Then verify parity between the branch and production (run via MCP `execute_sql` against each
`project_ref`, or psql):
- object counts match: tables, views, functions, enums, policies, indexes per schema;
- spot-check the previously-divergent objects (e.g. `conversations` has `uq_conversation_pair`);
- `information_schema` / `pg_catalog` diffs show no unexpected deltas.

Iterate on the baseline file until `db push` to an empty branch succeeds cleanly and parity holds.
Delete the verify branch when done (`supabase branches delete rebaseline-verify`) to stop billing.

## Step 3 — Companion migrations for non-`public` objects

Add small, explicit, idempotent migrations immediately after the baseline for anything the dump
couldn't carry (storage buckets + their `storage.objects` policies, realtime publication, cron
jobs). Keep these minimal and re-runnable (`if not exists` / `on conflict do nothing`).

## Step 4 — Archive legacy migrations (preserve for audit)

Do **not** delete history. Move the pre-baseline files out of the replay path but keep them in git:

```bash
git mv supabase/migrations/<all pre-baseline *.sql> supabase/migrations_legacy/
```

Add `supabase/migrations_legacy/README.md` explaining these are the historical, **non-replayable**
migrations superseded by the baseline on 2026-07-25, retained for audit only. They remain in git
history regardless, so the full provenance is never lost.

After this, `supabase/migrations/` contains only: the baseline + companion migrations + future work.

## Step 5 — Reconcile production's migration history (metadata only)

Production already has every object; it must NOT re-run the baseline. Mark it applied there so
`db push --linked` treats it as done:

```bash
supabase migration repair --status applied 20260725000000   # baseline
supabase migration repair --status applied <companion versions>
```

Notes:
- `migration repair` writes only to `supabase_migrations.schema_migrations` (tracking metadata);
  it does **not** alter schema or data and does **not** rewrite the 84 legacy rows — they stay as
  audit. This is the only production-touching step; do it last, with explicit approval.
- The legacy remote rows will show as "remote-only" in `supabase migration list`; that is expected
  and harmless (no local file → never re-applied).

## Step 6 — Resume normal incremental migrations

From here, migrations are ordinary and reproducible:
```bash
supabase migration new <name>     # creates supabase/migrations/<new_ts>_<name>.sql
# edit, then verify on a branch:
supabase db push --db-url "<branch_url>"     # test on preview branch first
# after review + approval:
supabase db push --linked                    # apply to prod
```
Every future migration is validated against the reproducible baseline before prod.

## Step 7 — Resume & validate the PAR feature

`supabase/migrations/20260724000000_par_v1_organized_events.sql` becomes the first post-baseline
migration (re-timestamp to fall after the baseline, e.g. `20260726000000`). Then run the full PAR
validation suite (personal-PAR regression, tournament + round-robin/mini processing, authorization,
guest pending/claim, correction + chronological replay, trigger isolation, backfill, idempotency,
RLS) on a branch built from `baseline + PAR`. Only after that passes do we consider a production
apply, with explicit approval.

---

## How future migrations work (summary)
- `supabase/migrations/` = `[baseline] + [companions] + [incremental...]`, all replayable.
- Fresh environments (branches, CI, new hires) get a working DB from `db push` alone.
- Prod applies only new incremental migrations (baseline is repair-marked applied).
- Legacy history lives in `supabase/migrations_legacy/` + git history for audit.

## Effort estimate
- Baseline generation + gotcha handling (storage/extensions/realtime): **2–4 hrs** (once Docker
  or pg_dump is available).
- Branch verification + parity diffing + iteration: **2–3 hrs**.
- Archive + repair + docs: **~1 hr**.
- PAR re-timestamp + full validation: **2–4 hrs**.
- **Total: ~1 focused day.**

## Risks & mitigations
| Risk | Mitigation |
|---|---|
| Dump misses objects (storage policies, extensions, realtime, cron) | Explicit companion migrations (step 3); parity diff in step 2 gates completion |
| Baseline doesn't match prod exactly | Step 2 rebuilds a fresh branch and diffs object-by-object against prod before trusting it |
| `migration repair` perceived as rewriting prod history | It only appends tracking rows; legacy rows untouched; schema/data unchanged; done last with approval |
| Accidental `db push --linked` to prod mid-work | Only ever target `--db-url <branch>` until the baseline is verified; prod apply is a deliberate final step |
| Data loss | None: baseline is schema-only; prod data is never modified; all rebuild/verify happens on disposable branches |
| Branch cost accrues | Delete verify branches immediately after use (~$0.32/day each while alive) |

## Production safety
Nothing in steps 1–4 or 6–7(validation) touches production. The only prod interaction is the
metadata-only `migration repair` in step 5 and, eventually, a deliberate `db push --linked` of the
validated PAR migration — both gated on explicit approval. **The PAR migration must not be applied
to production until after the baseline is in place and the feature is validated against it.**
