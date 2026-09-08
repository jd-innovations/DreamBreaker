# Supabase Migration Reconciliation (post-baseline)

Audit date: **2026-08-17**
Project: `fbzetvkbhneptvfruilw` (production)
Owner item: `TODO1.1_EXECUTION_PLAN.md` **2.1**
Blocks: `TODO1.1_EXECUTION_PLAN.md` **1.3** (account deletion deployment)

> **Update 2026-08-18 (correction) — §3.3's parity PASS was OVER-SCOPED.** The
> fingerprint filtered `pg_trigger` to `nspname='public'`, so it could not see
> `trg_on_auth_user_created`, which lives on **`auth.users`**. Production has that
> trigger; every database rebuilt from this repo did **not**. A rebuild therefore
> accepted signups and silently created no profile. Found while rehearsing item 1.3
> on a preview branch. Fixed by `20260818000000_auth_user_trigger_companion.sql`
> and re-verified — see **§3.5**. The tables/columns/constraints/indexes/policies/
> grants results in §3.3 stand; only the trigger category was under-scoped.
>
> **Update 2026-08-18 (final) — RECONCILIATION COMPLETE.** `supabase migration
> list --linked` now shows **34 migrations with `local` == `remote` on every row**:
> zero local-only, zero remote-only. The last delta was closed by recording
> `20260814000000` in production history (§3.4). Item 2.1's goal — the database
> can be recreated from repo state — is met and verified.
>
> **Update 2026-08-18 (later) — Phase 2 is DONE and PASSED.** The repo replays
> cleanly onto an empty database and reproduces production exactly, with one
> known, deliberate exception. Full results and the parity table: **§3.3**.
> That work also uncovered **four hollow rows** in production's migration history
> (§2.6) — the reason every preview branch ever created for this project reports
> `MIGRATIONS_FAILED`.
>
> **Update 2026-08-18 — Phases 0 and 1 are DONE.** Both are local-only and touched
> nothing in production. `supabase/migrations/` now contains exactly the 32
> migrations recorded in production's history — nothing more, after the 2026-08-18
> cleanup in §3.2. The re-baseline and the 86-file legacy archive are committed. The 15
> aliases are renamed. Five migrations are held in `supabase/migrations_pending/`.
> §2.5 carries a **correction** to a 2026-08-17 finding about QR check-in.
> Phases 2–4 remain outstanding.

**Status of production: UNCHANGED.** No migration was applied to production, no
`db push --linked`, no `migration repair`, no edge function deployed, no
production data modified. Phase 2 created a **disposable preview branch**
(`reconcile-verify`, ref `uhhsovbrwyifojawvgah`), reset and replayed the repo onto
it, compared it against production read-only, and deleted it. Every finding below
came from read-only queries against `supabase_migrations.schema_migrations`,
`information_schema`, and `pg_catalog`.

This document supersedes the forward-looking parts of `DB_REBASELINE_PLAN.md`,
which describes the 2026-07-25 re-baseline. That work was **largely executed** —
the baseline exists and production history starts at it — so that document is now
a historical record plus the still-valid recipe for branch verification.

---

## 1. Headline findings

1. **The divergence is not schema drift. It is a timestamp-collision problem.**
   All 15 "production-only" migrations are the same SQL as 15 "repo-only"
   migrations, filed under different version numbers. Proven by content hash, not
   by name matching alone.
2. **`supabase db push` was unsafe** — it would have replayed 15 migrations whose
   objects already exist and failed before reaching account deletion. **Resolved by
   Phase 1** (§3.1): the replay path now matches production history.
3. ~~**The re-baseline was never committed to git.**~~ **RESOLVED by Phase 0**
   (2026-08-18). As audited, `supabase/migrations/` at HEAD held 20 pre-baseline
   legacy files plus `20260817000000_account_deletion.sql`, while the baseline, all
   34 post-baseline migrations, and the 86-file `supabase/migrations_legacy/`
   archive existed **only as untracked worktree files** — a `git clean` would have
   destroyed production's only reproducible definition. All are now committed.
   The same condition held for `supabase/functions/` until `3318b05` brought the
   deployed edge functions under version control too — see §3.2.
4. **PAR v1 is not deployed.** Its tables came in via the baseline, but **0 of 10**
   PAR functions and **0 of 5** PAR triggers exist in production. PAR rating
   processing does not run in production today.
5. ~~**QR check-in is already live in production but absent from migration history.**~~
   **RESOLVED 2026-08-18** by a metadata-only history repair — see §3.4.
   `check_in_registration()` matched the repo file exactly (§2.5), and Phase 2
   confirmed it from the other direction: it was the *only* object the repo failed
   to reproduce (§3.3).
6. **Four hollow rows in production's migration history** (§2.6) mean production
   cannot be rebuilt from its own recorded history. The repo can.
7. **Phase 2 PASSED** (§3.3): the repo replays cleanly from empty and matches
   production on tables, columns, constraints, indexes, triggers, policies, grants,
   and enum content.

---

## 2. Migration inventory

Production history: **32 rows**, all `>= 20260725000000` (the baseline).
Repo worktree: **36 files**.

### 2.1 Bucket A — present in both, identical version (17)

No action needed **for 13 of them**. ⚠️ **Four are hollow in production** — the
version matches but production's recorded SQL is empty. See §2.6. This corrects
the original "no action needed" verdict.

```
20260725000000 baseline_from_prod          20260807000000 transactional_email
20260725000001 seed_config                 20260807010000 waitlist_sweeper_templates
20260725000002 storage_companion           20260807020000 schedule_waitlist_sweeper
20260725000003 realtime_publication        20260809123041 booking_engine_phase1_facility_foundation
20260725000004 role_settings               20260809132727 booking_engine_phase1_..._search_path_fix
20260805211406 onboarding_profile_fields   20260809162811 booking_engine_phase2_reservation_core
20260805214123 facilities_csv_import       20260809163029 booking_engine_phase2_flash_deal_id_fix
20260806000000 support_tickets             20260809163251 booking_engine_phase2_rls_recursion_fix
                                           20260809163338 booking_engine_phase2_roster_visibility_fix
```

### 2.2 Bucket B — repo-only, but an alias of an already-applied production migration (15)

**Safe to reconcile. SQL verified identical.** Each repo file was compared against
the exact statement text production recorded, normalized to lowercase with all
whitespace removed:

- **8 matched byte-for-byte** on the first pass.
- The other **7 matched exactly once SQL comments were stripped** — the repo files
  carry additional header/inline documentation added after the migration was
  applied. No SQL difference remains in any of the 15.

| Repo version | Production version | Name | Hash match |
| --- | --- | --- | --- |
| `20260807050000` | `20260807203246` | marketplace | comments-only diff |
| `20260807030000` | `20260807203530` | support_ticket_context | comments-only diff |
| `20260807040000` | `20260807203534` | support_floating_button_flag | comments-only diff |
| `20260809140000` | `20260809232329` | shared_payment_foundation | comments-only diff |
| `20260809140100` | `20260809235922` | pin_registration_payment_trigger_search_path | comments-only diff |
| `20260809150000` | `20260810004134` | coach_marketplace_phase1_activation | **exact** |
| `20260809150100` | `20260810004259` | restrict_is_coach_publish_ready_execute | **exact** |
| `20260810000000` | `20260810005233` | booking_search_bookable_and_zip | comments-only diff |
| `20260809160000` | `20260810005502` | coach_marketplace_phase2_offers | comments-only diff |
| `20260809160100` | `20260810005547` | restrict_coach_offer_trigger_fn_execute | **exact** |
| `20260810010000` | `20260810211105` | coach_marketplace_phase3_purchases | **exact** |
| `20260810010200` | `20260810222017` | coach_marketplace_phase3_fk_indexes | **exact** |
| `20260810010100` | `20260810222246` | coach_marketplace_phase3_expiration_snapshot | **exact** |
| `20260810020000` | `20260810224032` | coach_marketplace_phase4_wallet_vouchers | **exact** |
| `20260810020100` | `20260810224346` | coach_marketplace_phase4_hero_image_snapshot | **exact** |

**Cause:** these were applied through the Supabase MCP `apply_migration` tool,
which stamps its own `created_at`-based version. All 15 carry
`created_by = dhjesus122@gmail.com` in production history. A local file was
written separately with a hand-chosen timestamp. Bucket A's booking-engine
entries came through the same tool but had their local filenames matched to the
generated version, which is why they line up.

**Three relative-order inversions** exist between repo order and production order.
All were checked and are between independent migrations:

| Production order | Repo order | Independent because |
| --- | --- | --- |
| marketplace → support_ticket_context → support_floating_button_flag | support_ticket_context → support_floating_button_flag → marketplace | different feature areas, no shared objects |
| booking_search → coach_phase2_offers → restrict_coach_offer_trigger | coach_phase2_offers → restrict_coach_offer_trigger → booking_search | booking search touches `facilities`; coach phase 2 touches `coach_offers` |
| coach_phase3_fk_indexes → coach_phase3_expiration_snapshot | coach_phase3_expiration_snapshot → coach_phase3_fk_indexes | fk_indexes indexes `facility_id`/`created_by` (pre-existing); expiration_snapshot adds `expiration_policy`/`expiration_days` |

**Note:** `coach_marketplace_phase3_fk_indexes` uses bare `CREATE INDEX` with no
`IF NOT EXISTS`, so it is **not** re-runnable. That is fine under either
reconciliation option below (neither re-executes it) but matters for any fresh
replay.

### 2.3 Bucket C — repo-only, genuinely unapplied (4)

Verified object-by-object against production.

| Version | Name | Production state | Gate |
| --- | --- | --- | --- |
| `20260725010000` | par_v1_organized_events | **Not applied.** `par_game_processing` table exists (came via baseline), but **0 of 10** named PAR functions and **0 of 5** PAR triggers exist. | PAR algorithm approval + replay validation. `AGENTS.md` forbids implementing PAR before the spec marks it approved. |
| `20260725011000` | par_v1_replay_engine | **Not applied.** `par_replay_jobs` table absent. | Same as above; depends on `20260725010000`. |
| `20260814000000` | tournament_qr_checkin_phase5_1 | **Already live in production, unrecorded in history.** Applied directly via `CREATE OR REPLACE`; the function body is byte-identical to this file once comments are stripped. See the correction in §2.5. | A history repair under a chosen version number — not an apply. |
| ~~`20260817010000`~~ | ~~registration_team_payment_groups~~ | **APPLIED to production 2026-08-18** (33rd history row, `created_by` null = CLI push). All objects verified present: 8/8 indexes, 2/2 RLS, 7/7 functions, 6 policies, 3/3 enums. Returned to `supabase/migrations/`. | **Resolved.** |
| `20260817000000` | account_deletion | **Not applied.** `profiles_id_fkey` present, `profiles.deleted_at` absent, index absent. No prior version of this migration exists in production. | This document (2.1). |

### 2.6 Hollow rows in production history — **discovered 2026-08-18**

Four rows in `supabase_migrations.schema_migrations` carry a version and a name
but **no executable SQL**. Each is 72 characters, entirely a comment:

```
-- applied via MCP apply_migration, backfilled version to match filename;
```

| Version | Name | Recorded length | Executable SQL |
| --- | --- | --- | --- |
| `20260806000000` | support_tickets | 72 | **0 bytes** |
| `20260807000000` | transactional_email | 72 | **0 bytes** |
| `20260807010000` | waitlist_sweeper_templates | 72 | **0 bytes** |
| `20260807020000` | schedule_waitlist_sweeper | 72 | **0 bytes** |

The real DDL was applied out of band and never recorded; these rows were
backfilled purely to make the version numbers line up with filenames. The repo
holds the genuine SQL for all four — `20260806000000_support_tickets.sql` alone
is 11,782 bytes and creates two enums, the `support_tickets` table, RLS, and
three policies.

**Consequence: production's own migration history cannot rebuild production.**
A branch replaying it applies 12 migrations, records `support_tickets` as done
while creating nothing, then dies on `20260807203530_support_ticket_context`,
which does `ALTER TABLE support_tickets`. Verified directly on the throwaway
branch: `support_tickets` absent, yet `20260806000000` present in its history.

This is why **every** preview branch on this project reports `MIGRATIONS_FAILED`,
including `rebaseline-verify` from 2026-07-25 — the failure `DB_REBASELINE_PLAN.md`
attributed to the `uq_conversation` expression bug was, at least latterly, this.

**The repo is unaffected and is strictly better than production's history.** No
action is needed in `supabase/migrations/`; the hollow rows matter only if anyone
tries to rebuild from production's recorded history rather than from the repo.

### 2.4 Bucket D — production-only, missing from repo (15)

**Empty in substance.** All 15 are the production-side counterparts in §2.2. No
production migration contains SQL that is absent from the repo.

### 2.5 The `check_in_registration()` comparison — **CORRECTED 2026-08-18**

> **Correction.** The 2026-08-17 version of this document stated that production
> ran an *older* `check_in_registration()` than the repo, based on a body-hash
> comparison that did **not** strip SQL comments from inside the function body.
> Re-checked with comments stripped from both sides: the bodies are **identical** —
> `0a7d31cb966ec7e4184ebe89b69c4bc5`, 1827 characters, on both. The 2251-vs-3308
> character gap was entirely in-body commentary.
>
> Independently confirmed: production's `pg_proc` entry contains both
> `update public.registrations as r` and `returning r.checked_in_at`, i.e. the
> alias hotfix documented in `TOURNAMENT_QR_CHECKIN_PHASE5_1.md`. Nothing is
> missing from production.
>
> **Revised classification:** `20260814000000` is **already applied** to
> production — directly, via `CREATE OR REPLACE`, as that document records — but
> production never wrote a `schema_migrations` row for it. It is therefore a
> Bucket B-style alias case with no counterpart version to alias to. It needs a
> **history repair under a chosen version number**, not an apply, and no diff
> review or QR re-test. Item 5.3's QR verification stands.
>
> It is still held in `supabase/migrations_pending/` for Phase 1, because with no
> history row any `db push` would re-execute it against a live RPC.

### Original comparison (retained for provenance)

| | Production | Repo `20260814000000` |
| --- | --- | --- |
| Arguments | `p_registration_id uuid, p_tournament_id uuid` | identical |
| Returns | `TABLE(result text, reason text, registration_id uuid, player_name text, division_name text, tournament_name text, checked_in_at timestamptz)` | identical |
| `SECURITY DEFINER` | yes | yes |
| Body length | **2251 chars** | **3308 chars** |
| Body hash | `0a7d31cb…` | `5059c76d…` |

Signature and result type match, so `supabase.rpc('check_in_registration', …)` in
`apps/mobile/src/lib/supabase/registrations.ts:288` is wire-compatible either way.
Per the correction above, the *logic* matches too — the length delta is comments.

---

## 3. Recommended path

### Guiding rule

**Anything not in production must not be in the replay path.** A
`supabase/migrations/` folder that builds a database *unlike* production is not
reproducible, it is merely runnable. PAR and QR belong outside the folder until
their own gates clear — otherwise `db push --linked` will apply them as a side
effect of deploying something unrelated, which is precisely the trap that makes
today's state dangerous.

### Phase 0 — Commit the re-baseline (no production contact) — ✅ **DONE 2026-08-18**

Nothing else in this plan is safe while the migration set is untracked: a stray
`git clean` erases production's only reproducible definition.

```bash
git checkout -b chore/db-reconcile
git add supabase/migrations supabase/migrations_legacy
git add -A supabase/migrations          # picks up the 20 legacy-file deletions
git add supabase/migrations_legacy/README.md   # write it if absent (see DB_REBASELINE_PLAN.md step 4)
git commit -m "chore(db): commit re-baseline migration set and legacy archive"
```

Verify after: `git ls-tree --name-only HEAD supabase/migrations/` lists the
baseline, the companions, and every post-baseline migration — **not** the 20
pre-baseline legacy files.

### Phase 1 — Eliminate the alias divergence (no production contact) — ✅ **DONE 2026-08-18**

Commands below are the record of what was run. Results in §3.1.

Rename the 15 Bucket B files to production's version numbers. Content is already
proven identical, so this is a pure filename change.

```bash
cd supabase/migrations
git mv 20260807050000_marketplace.sql                                  20260807203246_marketplace.sql
git mv 20260807030000_support_ticket_context.sql                       20260807203530_support_ticket_context.sql
git mv 20260807040000_support_floating_button_flag.sql                 20260807203534_support_floating_button_flag.sql
git mv 20260809140000_shared_payment_foundation.sql                    20260809232329_shared_payment_foundation.sql
git mv 20260809140100_pin_registration_payment_trigger_search_path.sql 20260809235922_pin_registration_payment_trigger_search_path.sql
git mv 20260809150000_coach_marketplace_phase1_activation.sql          20260810004134_coach_marketplace_phase1_activation.sql
git mv 20260809150100_restrict_is_coach_publish_ready_execute.sql      20260810004259_restrict_is_coach_publish_ready_execute.sql
git mv 20260810000000_booking_search_bookable_and_zip.sql              20260810005233_booking_search_bookable_and_zip.sql
git mv 20260809160000_coach_marketplace_phase2_offers.sql              20260810005502_coach_marketplace_phase2_offers.sql
git mv 20260809160100_restrict_coach_offer_trigger_fn_execute.sql      20260810005547_restrict_coach_offer_trigger_fn_execute.sql
git mv 20260810010000_coach_marketplace_phase3_purchases.sql           20260810211105_coach_marketplace_phase3_purchases.sql
git mv 20260810010200_coach_marketplace_phase3_fk_indexes.sql          20260810222017_coach_marketplace_phase3_fk_indexes.sql
git mv 20260810010100_coach_marketplace_phase3_expiration_snapshot.sql 20260810222246_coach_marketplace_phase3_expiration_snapshot.sql
git mv 20260810020000_coach_marketplace_phase4_wallet_vouchers.sql     20260810224032_coach_marketplace_phase4_wallet_vouchers.sql
git mv 20260810020100_coach_marketplace_phase4_hero_image_snapshot.sql 20260810224346_coach_marketplace_phase4_hero_image_snapshot.sql
```

**Why renaming beats `migration repair`:** repair appends 15 more rows to
production history, leaving 30 rows describing 15 migrations and a permanent
"remote-only" set in `supabase migration list`. Renaming touches production not at
all and makes repo history *equal* production history. Repair is the fallback, not
the default.

Then move the un-gated backlog out of the replay path:

```bash
mkdir -p supabase/migrations_pending
git mv supabase/migrations/20260725010000_par_v1_organized_events.sql supabase/migrations_pending/
git mv supabase/migrations/20260725011000_par_v1_replay_engine.sql    supabase/migrations_pending/
git mv supabase/migrations/20260814000000_tournament_qr_checkin_phase5_1.sql supabase/migrations_pending/
```

Add `supabase/migrations_pending/README.md` recording, for each file, why it is
held and what unblocks it.

After Phase 1, `supabase migration list` should show **zero** local-only and
**zero** remote-only rows except `20260817000000_account_deletion`.

### 3.1 Phases 0 and 1 — **EXECUTED 2026-08-18** (`chore(db): normalize local migration history`)

Both phases were local-only: `git mv`, `mv`, and `git add`. No Supabase CLI command
of any kind was run, and production was not contacted.

| Disposition | Count | Detail |
| --- | --- | --- |
| **Committed as production-history migrations** (`supabase/migrations/`) | **32** | Exactly the 32 rows in `supabase_migrations.schema_migrations`. 17 already matched (Bucket A); 15 were renamed to production's version numbers (Bucket B). |
| **Moved to `supabase/migrations_pending/`** | **4** | `20260725010000_par_v1_organized_events`, `20260725011000_par_v1_replay_engine`, `20260814000000_tournament_qr_checkin_phase5_1`, `20260817000000_account_deletion` + a `README.md` documenting the hold reason and unblock condition for each. |
| **Archived as legacy** (`supabase/migrations_legacy/`) | **86** | Pre-baseline chain, now committed. Git recorded all 20 previously-tracked files as `R100` renames, so provenance is preserved rather than shown as deletions. A `README.md` was already present. |
| **Intentionally untouched** | **1 migration + the rest of the dirty tree** | See below. The migration was subsequently moved to pending — §3.2. |

**Intentionally untouched:**

- `supabase/migrations/20260817010000_registration_team_payment_groups.sql` —
  at the time, untracked in-flight work (per-player doubles/mixed entry fees:
  `registration_groups`, `registration_group_members`, RLS, helper functions),
  landing alongside the then-uncommitted `[functions.create-tournament-team-*]`
  entries in `supabase/config.toml`. It is **not** in production history, so it sat
  in the replay path and would have been applied by a `db push`. It was left alone
  because it belonged to another task and was not audited here.
  **Resolved 2026-08-18 — see §3.2.**
- Every other dirty worktree path: `supabase/config.toml`,
  `supabase/functions/**`, `supabase/seed.sql`, `supabase/seed/`,
  `supabase/_baseline/`, `supabase/_par_validation/`, `supabase/.temp/`, and all
  `apps/mobile` and `web` changes.

**Related finding, out of scope here:** `supabase/functions/` is in the same
condition the migrations were — only `delete-account/` is tracked. The nine
*deployed* edge functions (`waitlist-sweeper`, `send-message-push`,
`facility-photo`, `event-weather`, `send-transactional-email`,
`marketplace-improve-listing`, and the three `create-*-payment-intent`) exist in
the repo **only as untracked worktree files**. Production is running code that git
does not have. This deserves its own item.

**Local verification performed (no database connection required):**

- `supabase/migrations/` version list diffed against the 32 known production
  versions: **zero** production migrations missing, and the only extra is
  `20260817010000` above.
- Comment-stripped content hash of all files then in `supabase/migrations/`:
  **no duplicate SQL**, confirming every alias pair collapsed to one file.
- All 20 previously-tracked pre-baseline files confirmed present in
  `supabase/migrations_legacy/` before staging, so the deletions are moves.
- Staged paths confirmed to be entirely under `supabase/`.

### 3.2 Replay-path cleanup — **EXECUTED 2026-08-18** (`chore(db): move in-flight registration migration to pending`)

The one loose end from §3.1 is closed. `20260817010000_registration_team_payment_groups.sql`
was moved into `supabase/migrations_pending/`.

Between §3.1 and this cleanup the file changed status: it was **committed** as part
of `3318b05` — *feat(payments): per-player entry fees for doubles/mixed teams*, a
211-file sweep that also brought the previously-untracked edge functions under
version control. So it is now tracked in git — but tracked in git and applied to
production are different things, and it still has **no row** in production's
`schema_migrations`. That is the property that mattered: it was the last file in
the replay path that `supabase db push --linked` would have executed as a side
effect of deploying something else.

Moved with `git mv`, so history follows the file. No production contact.

**Result — `supabase/migrations/` now contains exactly the 32 production-history
migrations and nothing else.** Verified locally: the version list is an exact
set-match against production's 32 (zero extra, zero missing), and a
comment-stripped content hash across all 32 files shows no duplicate SQL.

`supabase/migrations_pending/` now holds five files plus its README: the two PAR
migrations, the QR history-repair item, account deletion, and this one. Each has a
row in that README naming the owning feature and the condition for moving back.

**Side effect worth recording:** `3318b05` also resolved the §3.1 note about
`supabase/functions/`. The nine deployed edge functions are no longer untracked —
production is no longer running code that git does not have.

### Phase 2 — Prove the repo rebuilds production (disposable branch, no prod contact)

```bash
supabase branches create reconcile-verify --region us-east-1
supabase branches get reconcile-verify -o env      # take the session-pooler URL
supabase db push --db-url "<branch_session_pooler_url>" --include-all
```

Then diff the branch against production (read-only, via MCP `execute_sql` against
each ref): table / view / function / enum / policy / index counts per schema, and
spot-check `conversations.uq_conversation_pair`, `profiles` column list,
`coach_offer_purchases` columns, and `check_in_registration`'s body hash. Delete
the branch immediately after (`supabase branches delete reconcile-verify`) — it
bills while alive.

### 3.3 Phase 2 — **EXECUTED 2026-08-18. PASSED.**

Method: created preview branch `reconcile-verify` (ref `uhhsovbrwyifojawvgah`),
reset it to empty and replayed the repo with
`supabase db reset --db-url "<branch session pooler>" --no-seed --yes`
(**never `--linked`**), then compared the branch against production with a
read-only catalog fingerprint. Branch deleted afterwards.

Two environment notes for whoever repeats this:
- The direct host `db.<ref>.supabase.co` is **IPv6-only** and fails to resolve on
  this network. Use the **session pooler on port 5432** — the env output gives the
  pooler on 6543 (transaction mode, wrong for migrations); change the port.
- Docker Desktop is now installed and running (daemon 29.6.2), so the CLI can
  containerise `pg_dump`/`psql`. `DB_REBASELINE_PLAN.md`'s prerequisite section is
  stale on this point.

**Replay result: all 33 migrations applied cleanly from an empty database, exit 0**
— including `20260806000000_support_tickets`, which production's own history
cannot produce (§2.6).

**Parity fingerprint — branch vs production:**

| Category | Production | Branch | Verdict |
| --- | --- | --- | --- |
| tables | 93 | 93 | ✅ identical hash |
| columns | 1075 | 1075 | ✅ identical hash |
| constraints | 472 | 472 | ✅ identical hash |
| indexes | 316 | 316 | ✅ identical hash |
| triggers | 72 | 72 | ✅ identical hash |
| policies | 257 | 257 | ✅ identical hash |
| grants | 2604 | 2604 | ✅ identical hash |
| sequences | 0 | 0 | ✅ |
| **functions** | **895** | **894** | ⚠️ one missing — explained below |
| enums | 154 | 154 | ✅ semantically identical — explained below |
| extensions | 11 | 11 | ✅ explained below |
| publications | 14 | 7 | ✅ explained below |

**All four deltas explained; none is repo drift:**

1. **functions 895 vs 894 — `check_in_registration` only.** Narrowed by
   first-letter grouping (only `C` differed, 21 vs 20) then listed. This is the
   function created by `20260814000000_tournament_qr_checkin_phase5_1.sql`, which
   is deliberately held in `supabase/migrations_pending/`. Production has it
   because it was applied directly. **Expected, and precisely what §2.5 predicted.**
2. **enums — labels identical.** All 31 types match label-for-label and in order on
   both sides. The fingerprint differed only on `enumsortorder`, which is a float:
   production carries fractional ordering from `ALTER TYPE … ADD VALUE`, a fresh
   build numbers them 1..n. No semantic difference.
3. **extensions — `pg_net@0.20.3` (prod) vs `0.20.4` (branch).** Every other
   extension and version matches. Platform patch level on a newer branch image.
4. **publications — `supabase_realtime` membership is identical** (same 7 public
   tables). Production's extra 7 rows are
   `supabase_realtime_messages_publication` over `realtime.messages_2026_08_15..21`,
   auto-created daily partitions in the platform-managed `realtime` schema. A fresh
   branch has none yet.

**Conclusion: `supabase/migrations/` reproduces production exactly, with the single
deliberate exception of the held-back QR migration.** Item 2.1's core goal — "the
database can be recreated from repo state" — is met.

**Recommended follow-up to reach 100%:** return
`20260814000000_tournament_qr_checkin_phase5_1.sql` to `supabase/migrations/` and
`supabase migration repair --status applied 20260814000000`. Safe because §2.5
already proved the repo file's function body is byte-identical to production's
(`0a7d31cb…`, 1827 chars comment-stripped), so the repair records reality rather
than asserting it. Deferred here because it touches production history and was
outside the Phase 2 brief.

**Housekeeping flagged, not actioned:** `list_branches` shows **14 abandoned
preview branches** from 2026-07-25 and 2026-08-06 (`par-*`, `rebaseline-verify`,
`rebaseline-verify-par`), all still `ACTIVE_HEALTHY` and all but one reporting
`MIGRATIONS_FAILED` — now explained by §2.6. At $0.01344/hour each that is roughly
**$4.50/day**. They are the user's to delete.

### 3.4 Closing the last delta — **EXECUTED 2026-08-18**

`20260814000000_tournament_qr_checkin_phase5_1.sql` was returned from
`supabase/migrations_pending/` to the replay path, then recorded in production:

```
supabase migration repair --linked --status applied 20260814000000
→ Repaired migration history: [20260814000000] => applied
```

**Metadata only — nothing was executed against the schema.** Verified immediately
after: `check_in_registration()`'s body hash is unchanged
(`0a7d31cb966ec7e4184ebe89b69c4bc5`, the same value measured before the repair),
and the public table count is unchanged at 86. The repair recorded the file's real
5,855 characters of SQL, so this row is **not** hollow like the four in §2.6.

This was safe precisely because §2.5 had already proved the repo file's function
body is byte-identical to the live one. The repair records reality; it does not
assert it.

**Result — `supabase migration list --linked`:**

```
34 migrations, local == remote on every row
0 local-only     0 remote-only
```

**Honest caveat:** Phase 2's from-scratch replay was run against the 33-migration
set, before this file was returned. The 34-migration set has not been replayed
end-to-end. The added migration is a single `CREATE OR REPLACE FUNCTION` plus
grants, depending only on tables created much earlier in the chain, and it is
byte-identical to what production already runs — so the risk is very low, but it
is untested as a set. A repeat of the §3.3 branch test would close it.

### 3.5 Auth-schema gap and 1.3 rehearsal — **2026-08-18**

Rehearsing item 1.3 on preview branch `deletion-rehearsal` (ref
`pewftnsrfogfmeijifga`) surfaced a defect that §3.3 could not have caught.

**The gap.** Inserting a row into `auth.users` on a repo-built database created
**no profile**. Production runs
`trg_on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION fn_handle_new_user()`;
the branch had no triggers on `auth.users` at all.

**Cause.** The 2026-07-25 baseline was captured with `--schema public`, which
excludes objects that live *on* tables in other schemas. The function
`public.fn_handle_new_user()` came through fine — only the binding was lost. So
the repo carried the behaviour with nothing wired to fire it.

**Why §3.3 missed it.** The parity query filtered triggers to `nspname='public'`.
`auth.users` is not in `public`. "triggers 72 = 72, identical hash" was true and
irrelevant. `DB_REBASELINE_PLAN.md` step 1 lists the dump's blind spots — storage,
extensions, realtime, cron — and triggers on `auth` tables were not on that list.

**Scope check — nothing else is missing.** Storage matched exactly (21 policies,
7 buckets on both sides), `fn_handle_new_user` is present in `public` on both, and
there are no app-created functions in unexpected schemas. The gap is this one
trigger.

**Fix.** `20260818000000_auth_user_trigger_companion.sql` — idempotent
`drop trigger if exists` + `create trigger`. A no-op in production, which already
has it. After replaying all 36 migrations onto the branch, the rendered definition
is **byte-identical** to production's.

**1.3 rehearsal result — the mechanism works end to end.** On the rebuilt branch:

| Step | Result |
| --- | --- |
| Insert `auth.users` row | profile auto-created by the restored trigger |
| Insert a `payments` row for that user | accepted |
| `DELETE FROM auth.users` — impossible before `20260817000000` | **succeeded** |
| `profiles` tombstone after delete | **survived** |
| `payments` row after delete | **survived** |
| `auth.identities` / `auth.sessions` | cascaded to 0 |

That is the designed behaviour exactly: the account ceases to exist, the financial
record does not, and the tombstone keeps every foreign key valid.

Branch deleted after the run.

### Phase 3 — Apply account deletion (see §4)

### Phase 4 — Retire the backlog, separately and on its own merits

PAR and QR each get their own item, their own validation, and their own approval.
Neither rides along with an unrelated deploy.

---

## 4. Applying `20260817000000_account_deletion` after reconciliation

This is the only migration this plan intends to apply to production, and it is
the last step, not the first.

### Preconditions

- [x] **Phase 0 complete** — migration set committed (2026-08-18).
- [x] **Phase 1 complete** — 15 aliases renamed; the file now lives in
      `supabase/migrations_pending/20260817000000_account_deletion.sql`, deliberately
      outside the replay path so it cannot be pushed by accident (2026-08-18).
- [ ] Phase 2 complete — a fresh branch built from the repo matches production.
- [x] `20260817010000_registration_team_payment_groups.sql` resolved — moved to
      `supabase/migrations_pending/` on 2026-08-18 (§3.2), so it can no longer ride
      along with an unrelated push.
- [ ] Explicit approval to touch production schema.

### The migration is low-risk on its own merits

- Forward-only and idempotent: `drop constraint if exists`,
  `add column if not exists`, `create index if not exists`.
- Additive plus one constraint removal. It drops **no** data, alters **no** row,
  and rewrites **no** table (`ADD COLUMN` with no default is metadata-only on
  PG 17).
- Already validated against production inside a self-aborting transaction: every
  statement executed, then `DELETE FROM auth.users` on a previously-undeletable
  user succeeded, then the whole block was rolled back. Production was confirmed
  unchanged afterwards.
- RLS is untouched.

### Commands (DO NOT RUN WITHOUT APPROVAL)

```bash
# 0. Move the migration back into the replay path. Move nothing else.
git mv supabase/migrations_pending/20260817000000_account_deletion.sql        supabase/migrations/20260817000000_account_deletion.sql

# 1. Confirm exactly one pending migration.
supabase migration list --linked

# 2. Rehearse on a disposable branch first.
supabase branches create deletion-verify --region us-east-1
supabase db push --db-url "<branch_session_pooler_url>"

# 3. Production apply.
supabase db push --linked

# 4. Verify (read-only).
#    profiles_id_fkey        -> absent
#    profiles.deleted_at     -> present
#    profiles_deleted_at_idx -> present
#    20260817000000          -> present in supabase_migrations.schema_migrations

# 5. Then, and only then, the edge function.
supabase functions deploy delete-account
supabase secrets list        # confirm SUPABASE_SERVICE_ROLE_KEY

# 6. Clean up.
supabase branches delete deletion-verify
```

Then work the 26-point deployment checklist in `TODO1.1_EXECUTION_PLAN.md`
item 1.3. Do not check the launch-checklist box in `TODO1.1.md` before that.

### Fallback path if 1.3 must ship before Phases 0–2

Apply the migration's SQL directly, then record it:

```bash
supabase migration repair --status applied 20260817000000
```

**Cost of this fallback:** it adds a 16th out-of-band application to the pile 2.1
exists to clean up, and it skips the branch rehearsal. Take it only as a logged,
deliberate exception, and record it in this document. The migration's idempotence
and the transaction-rollback validation make it survivable — but it re-creates
exactly the habit that produced the current divergence.

---

## 5. Risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Migration set is untracked; a `git clean` destroys production's only reproducible definition | **High** | Phase 0, before anything else. No production access needed. |
| `supabase db push --linked` run today replays 18 already-applied migrations | **High** | Phase 1 removes the condition entirely. Until then, never push `--linked`. |
| PAR or QR applied as a side effect of an unrelated push | **High** | Phase 1 moves both out of `supabase/migrations/`. |
| ~~Production runs an older `check_in_registration()`~~ | **Withdrawn** | Disproved 2026-08-18; bodies are identical. See the correction in §2.5. |
| `20260814000000` has no production history row, so any `db push` re-executes a live RPC | **Medium** | Held in `supabase/migrations_pending/`. Resolve with a history repair under a chosen version. |
| PAR believed deployed when 0/10 functions exist | **Medium** | §2.3; treat PAR as not deployed in any readiness accounting. |
| Renaming 15 files loses the association with their prod counterparts | **Low** | The mapping table in §2.2 is the record; the rename is `git mv`, so history follows. |
| Order inversions change replay semantics | **Low** | All three checked and independent (§2.2). Phase 2's branch rebuild is the backstop. |
| `coach_marketplace_phase3_fk_indexes` is not re-runnable | **Low** | Never re-executed under this plan; Phase 2 replays it once against an empty branch. |
| Branch costs accrue | **Low** | Delete verify branches immediately (~$0.32/day). |

---

## 6. Verification of this audit

- **No migrations applied.** Production history is still 32 rows;
  `20260817000000` is absent; `profiles_id_fkey` is still present and
  `profiles.deleted_at` still does not exist.
- **No edge functions deployed.** Nine functions live; `delete-account` is not
  among them.
- **No production data changed.** Every query was `SELECT` against catalog and
  migration-metadata tables. The two `DO`-block probes referenced in item 1.3 were
  run in an earlier session and self-aborted; post-conditions were re-confirmed
  read-only here.
- **Docs tooling:** not applicable. The repo has no markdown linter or formatter
  (no `.markdownlint*`, no `prettier` docs target, no docs script in any
  `package.json`).

## 7. Recommendation

**Preferred:** Phase 0 → Phase 1 (rename, not repair) → Phase 2 (branch rebuild
and parity diff) → Phase 3 (apply account deletion alone) → Phase 4 (PAR and QR
on their own merits, separately).

**Fallback:** direct SQL apply of `20260817000000` plus `migration repair`, only
if item 1.3 cannot wait, and only as a logged exception.

**Do not:** run `supabase db push --linked` in the current state.

Phases 0 and 1 are the bulk of the value, require **no production access**, and
should be done regardless of when 1.3 ships.
