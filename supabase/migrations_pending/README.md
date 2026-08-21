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

`supabase/migrations/` now contains exactly the **39** migrations recorded in
production's `supabase_migrations.schema_migrations`, and nothing else. Phase 2
verified empirically that replaying them onto an empty database reproduces
production — see `docs/DB_MIGRATION_RECONCILIATION.md` §3.3.

Parity last re-verified **2026-08-20**: `supabase migration list --linked`
returns 39 rows with `local` == `remote` on every one. The count moved from 36
to 39 with `20260820013554_reject_deleted_user_requests.sql`,
`20260820000000_rebrand_pickleball_app.sql` and
`20260820020000_email_assets_bucket.sql`.

## Contents

> `20260817000000_account_deletion.sql` was applied to production on 2026-08-18
> and has left this folder.

> `20260814000000_tournament_qr_checkin_phase5_1.sql` was returned to
> `supabase/migrations/` on 2026-08-18 and recorded in production history with a
> metadata-only `migration repair`. Repo and production are now in exact 1:1
> alignment.
>
> `20260817010000_registration_team_payment_groups.sql` was returned to
> `supabase/migrations/` on 2026-08-18: it was applied to production that day and
> is now genuine production history (33rd row). All its objects were verified
> present in production before the move.

> `20260820000000_rebrand_pickleball_app.sql` was applied to production on
> **2026-08-20** and has left this folder. It rebranded 8 `email_templates`
> rows and the `premium-membership` `wallet_partners` row, and changed
> `create_personal_match_claim_link` to emit `pickleballapp://` instead of
> `dreambreaker://`. Applied with raw SQL and then recorded with
> `migration repair --status applied 20260820000000` — deliberately **not**
> with MCP `apply_migration`, which assigns its own version and is how this
> project's 15 alias pairs were created in the first place. Note the ordering:
> `migration repair` globs `supabase/migrations/`, so the file must be moved
> back **before** the repair, not after. Context:
> `docs/REBRAND_PICKLEBALL_APP.md` and `docs/REBRAND_RUNBOOK.md` step 8.

> `20260820020000_email_assets_bucket.sql` was applied to production on
> **2026-08-20** and has left this folder. The public `email-assets` bucket and
> its `public read email-assets` SELECT policy both exist and are verified.
> **The bucket is still empty** — uploading `supabase/email-assets/*.png` is the
> remaining half of Phase 1 and has not been done. The artwork was checked
> against the rebrand before applying: `logo-light-v1.png` is the Pickleball App
> wordmark, not the old one, which matters because the migration's own comment
> notes these URLs end up in mail that has already left the building.

| File | Why it is held | What unblocks it |
| --- | --- | --- |
| `20260725010000_par_v1_organized_events.sql` | **Not applied.** The PAR tables reached production through the baseline, but **0 of 10** PAR functions and **0 of 5** PAR triggers exist there. PAR rating processing does not run in production. | PAR algorithm approval + replay validation. `AGENTS.md` forbids implementing a PAR formula before the product spec marks it approved. Tracked under item L4. |
| `20260725011000_par_v1_replay_engine.sql` | **Not applied.** `par_replay_jobs` does not exist in production. Depends on `20260725010000`. | Same gate; must land in order after the file above. |

## Note for the parallel email-notifications work

Added 2026-08-20. The app was rebranded to **Pickleball App** while
`EMAIL_NOTIFICATIONS_EXECUTION_PLAN.md` Phase 1 was in flight. Four things
about that touch the email work directly.

**1. The rebrand already ran, and it cannot catch rows that did not exist yet.**
`20260820000000` rewrote the 8 `email_templates` rows that existed at the time
with `replace()`. Any template **inserted after 2026-08-20** is untouched by it.
New templates must be authored with the new brand from the start — nothing will
correct them later:

- Product name: **Pickleball App** (never DreamBreaker, DreamBreakerPB, or
  Compete Pickleball — all three existed in this repo and all three are gone)
- Domain: **pickleballapp.app**
- Sender: `Pickleball App <notifications@pickleballapp.app>`
- Support / privacy contact: `support@pickleballapp.app`
- Legal entity, for any footer that names one: **JD Innovations LLC**,
  11615 Gramercy Park Ave, Bradenton, FL 34211

Verify with:

```sql
select count(*) from public.email_templates
 where subject like '%DreamBreaker%' or html_body like '%DreamBreaker%';  -- expect 0
```

**2. `send-transactional-email` was deployed from the working tree on
2026-08-20 at 20:26 UTC.** `supabase functions deploy` ships the working tree,
not the committed state, so the in-flight `substitute()` hardening — the version
that returns 422 and refuses to send rather than mailing a literal
`{{tournament_name}}` — **is live in production right now, uncommitted.** That
was an accident of a rebrand step, not a decision. It needs committing, and the
trigger callers should be checked for missing variables before real traffic
reaches it. `public.email_log` was empty for that window, so nothing has been
dropped yet.

**3. Migration history parity is currently exact and worth preserving.**
`supabase migration list --linked` returns 38 rows with `local` == `remote` on
every one. Two habits keep it that way:

- **Never apply through MCP `apply_migration`.** It assigns its own version
  number, which is how this project's 15 alias pairs were created. Run the SQL
  directly, then `supabase migration repair --status applied <version>` under
  the version in the filename.
- **Move the file into `supabase/migrations/` before the repair.** `repair`
  globs that directory and fails with `LegacyMigrationFileNotFoundError` if the
  file is still held here.

**4. The bucket migration is applied and committed; the upload is not.**
`20260820020000_email_assets_bucket.sql` was applied on 2026-08-20 and moved
into `supabase/migrations/`. **`storage.objects` for `email-assets` is still
empty** — running `scripts/build-email-assets.mjs` output into the bucket is the
outstanding half of Phase 1.

`scripts/build-email-assets.mjs` and `supabase/email-assets/*.png` are also
still untracked in git and were deliberately left that way — they are the email
work's own source and belong in its commit, not a rebrand one.

## Adding to or removing from this folder

**To apply one of these:** move the single file back into `supabase/migrations/`,
confirm with `supabase migration list --linked` that it is the only pending
migration, rehearse on a disposable preview branch, then push. Move nothing else
back at the same time.

**To hold a new migration here:** add a row to the table above stating what is
blocked and what unblocks it. A file in this folder without an entry is
indistinguishable from one that was forgotten.
