# TOURNAMENT_QR_CHECKIN_PHASE5_1.md

> Status: **COMPLETE.** Implemented, migration applied to production, verified by compiler/linter. Physical iPhone testing initially found a production bug in `check_in_registration()` (ambiguous `checked_in_at` column reference) during manual check-in; hotfixed, re-verified server-side, and then re-validated on a physical iPhone — manual check-in, QR check-in, and all Phase 5.1 protections passed. See "Hotfix: Ambiguous `checked_in_at`" for the incident history and "Physical iPhone Tests" for the post-hotfix results.
> Module: Phase 5.1 — Tournament QR Check-In (first real Phase 5 business integration)
> Date: 2026-08-14 (hotfix and physical re-test same day)
> **Phase 5.1 Status: COMPLETE**

## Existing Infrastructure Reused

- **Registration table**: `public.registrations` (`supabase/migrations/20260725000000_baseline_from_prod.sql:4330`). Primary key `id uuid default gen_random_uuid()`. Relationships: `tournament_id -> tournaments.id`, `player_id -> profiles.id`, `division_id -> divisions.id`. Status via `registration_status` enum (`held, registered, checked_in, withdrawn, disqualified, no_show, substitute, waitlisted, waitlist_offered, expired_hold`). Check-in fields already present: `checked_in_at timestamptz`, `checked_in_by uuid`.
- **Director authorization**: `public.is_approved_director()` (existing `SECURITY DEFINER` SQL function, line 2003) and `tournaments.director_id`. Both reused as-is, not modified.
- **RLS**: `"registrations: director update own tournament"` (line 7489) and `"registrations: player update own"` (line 7503) — unchanged. Still the outer authorization boundary; the new RPC runs as `SECURITY DEFINER` but re-checks director authorization explicitly inside the function body rather than relying on RLS alone (RLS can't express "this specific tournament context," only "some tournament this director owns" — see "Server Validation" below).
- **Check-in mutation**: previously a raw client `UPDATE` inside `checkInPlayer()` (`apps/mobile/src/lib/supabase/registrations.ts`). Replaced with a call to the new `check_in_registration()` RPC — see "Files Changed."
- **Director check-in UI**: `apps/mobile/src/app/tournament/[id]/check-in.tsx` (list + manual "Check In" button) and `apps/mobile/src/app/tournament/[id]/workspace.tsx` (`DetailModal`'s "Check In" action) — both kept, both now route through the same RPC.
- **Player registration UI**: `apps/mobile/src/app/my-tournaments.tsx`'s `RegistrationCard` — extended with a "Check-In QR" button rather than building a new ticket surface.
- **QRScanner / qrPayload / haptics**: reused unmodified from Phase 5 (`apps/mobile/src/components/QRScanner.*`, `apps/mobile/src/lib/qrPayload.ts`'s `classifyQrPayload`, `apps/mobile/src/lib/haptics.ts`). `qrPayload.ts` gained one new **export** (`buildScanTokenUrl`) — its parsing logic was not touched. No other generic scanner file has a diff (confirmed via `git diff --stat` — empty).

## Files Changed

**New:**
- `supabase/migrations/20260814000000_tournament_qr_checkin_phase5_1.sql` — the `check_in_registration()` RPC. Applied directly to production (see "Database Changes").
- `apps/mobile/src/app/tournament/[id]/check-in-qr.tsx` — player-facing Check-In QR display screen.
- `apps/mobile/src/app/tournament/[id]/check-in-scan.tsx` — director-facing scanner screen (wraps the generic `QRScanner`).

**Modified:**
- `apps/mobile/src/lib/supabase/registrations.ts` — added `CheckInResult` type and `checkInRegistration()` RPC wrapper; `checkInPlayer()` reimplemented on top of it instead of a raw `UPDATE` (now requires a `tournamentId` argument).
- `apps/mobile/src/app/tournament/[id]/check-in.tsx` — manual check-in call site updated for the new `checkInPlayer` signature, given real error handling (there was none before — an unhandled promise rejection), added the "Scan Player QR" entry button.
- `apps/mobile/src/app/tournament/[id]/workspace.tsx` — `DetailModal`'s check-in call site updated for the new signature; added a `tournamentId` prop threaded from the route param (this component had no tournament-id access before).
- `apps/mobile/src/app/my-tournaments.tsx` — added the "Check-In QR" button to `RegistrationCard`.
- `apps/mobile/src/app/_layout.tsx` — registered `tournament/[id]/check-in-qr` and `tournament/[id]/check-in-scan` routes.
- `apps/mobile/src/components/index.ts` — no functional change this phase (already exported `QRScanner` from Phase 5).
- `apps/mobile/src/lib/qrPayload.ts` — added `buildScanTokenUrl()` export (see above).
- `apps/mobile/src/lib/database.types.ts` — regenerated from the live database (`supabase gen types typescript --linked`). Grew by 467 lines beyond just this phase's function — the previous generated types were already stale relative to ~15 migrations that exist on production but were never tracked as local files (a pre-existing divergence unrelated to this phase; see "Security Findings").
- `apps/mobile/package.json` / `package-lock.json` — added `react-native-qrcode-svg` (pure JS, see "Build Impact").

## Database Changes

**One `SECURITY DEFINER` function, no table/column changes.** `check_in_registration(p_registration_id uuid, p_tournament_id uuid)` — applied directly to the linked production database (`fbzetvkbhneptvfruilw` / dreambreaker-pb) via `supabase db query --linked --file <migration>`, and confirmed present (`information_schema.routines`, `security_type = DEFINER`).

**Why not `supabase db push`:** attempting the normal migration flow surfaced a pre-existing, unrelated problem — production's migration history and the local `supabase/migrations/` directory have diverged (`supabase migration list` shows roughly 15 migrations applied to production with no matching local file, and roughly 15 local files never applied to production). This didn't originate from this phase's work. Rather than blindly run the CLI's suggested `migration repair --status reverted <15 ids>` (which rewrites production's migration bookkeeping without my understanding what those remote-only migrations actually contain), the new function was applied as a standalone, idempotent `CREATE OR REPLACE FUNCTION` + `GRANT` via direct SQL execution instead — safe because it doesn't touch or depend on migration-history state. **The underlying migration-history divergence is still unresolved and is not something this phase fixed** — flagged under Security Findings/Deferred Work, not silently patched over.

## QR Credential Design

- **Format**: `https://pickleballapp.app/q/<registrationId>` — reuses the exact reserved scan-token shape Phase 5 already parses (`classifyQrPayload`'s `scan_token` kind), via a new `buildScanTokenUrl()` constructor in `qrPayload.ts` so the display side and the parse side share one definition.
- **What it identifies**: nothing but the `registrations.id` row itself. No player name, email, payment status, division, or check-in state is encoded in the QR.
- **Why it's safe as a public credential**: `registrations.id` is a `gen_random_uuid()` (`DEFAULT "gen_random_uuid"()` in the base table definition) — non-sequential, non-guessable, no schema change was needed to make it a reasonable public identifier. No new token table, no new column. This is the "smallest safe change" outcome Step 3 asked for: none, beyond exposing the existing id.
- **Why it is not authorization**: possessing the QR (or a screenshot of it) proves nothing on its own. Every check-in attempt still requires: (1) the scanning actor to be authenticated, (2) `is_approved_director()` to be true for that actor, (3) that actor to be the `director_id` of the *specific* tournament being managed, all re-checked server-side inside `check_in_registration()` on every call — not cached, not inferred from the QR. A player cannot self-check-in by generating or reusing their own QR; the RPC's authorization check runs before the registration row is even read.
- **No live credential is reproduced anywhere in this report.**

## Server Validation

All inside `check_in_registration()`, in this order, matching Step 9's checklist:

1. `auth.uid()` must be non-null (raises `not_authenticated` otherwise — same pattern as the existing `claim_personal_match()` RPC).
2. **Director authorization is checked first, before the registration row is even touched**: `is_approved_director()` AND `auth.uid() = tournaments.director_id` for `p_tournament_id` (the tournament the director's screen is currently scoped to — not merely "some tournament this director owns"). Fails → `unauthorized`, and nothing about the scanned credential is revealed.
3. Registration resolved by `p_registration_id`, row-locked (`for update`, preventing a race between two simultaneous scans of the same code). Not found → `not_found`.
4. **Cross-tournament check** (Step 10): `registration.tournament_id = p_tournament_id`, checked independently of step 2. A director who legitimately manages two tournaments and scans a Tournament-B code while operating Tournament-A's screen passes step 2 (they *are* an authorized director) but fails this check. Mismatch → `wrong_tournament`.
5. Already-checked-in check: `status = 'checked_in'` → `already_checked_in`, returns the existing `checked_in_at`, **no mutation**.
6. Eligibility check: only `registered` and `substitute` are check-in eligible (mirrors the existing manual check-in screen's own filter and `dbStatusToAppStatus()`'s mapping — not a new rule invented for this phase). Anything else (`held`, `withdrawn`, `disqualified`, `no_show`, `waitlisted`, `waitlist_offered`, `expired_hold`) → `ineligible`, with the actual status as `reason`.
7. Only if all of the above pass: `UPDATE ... SET status = 'checked_in', checked_in_at = now(), checked_in_by = auth.uid()`, then returns `success` with player/division/tournament name and the server-stamped timestamp.

No eligibility, authorization, or tournament-matching logic exists in client code — the client only decodes the QR into an id and calls the RPC.

## Director Workflow

`check-in.tsx` → "Scan Player QR" → `check-in-scan.tsx`:

```
scan (QRScanner, unmodified from Phase 5)
  -> classifyQrPayload(raw)
     -> not scan_token?           -> "Unsupported QR" (no server call)
     -> scan_token                -> checkInRegistration(token, tournamentId)
        -> success                -> haptics.success(), "Player Checked In", player/division shown
        -> already_checked_in     -> haptics.warning(), "Already Checked In", existing timestamp shown
        -> wrong_tournament       -> haptics.error(), "This registration belongs to a different tournament."
        -> unauthorized           -> haptics.error(), "Not Authorized"
        -> ineligible             -> haptics.error(), "Not Eligible (status: <reason>)"
        -> not_found              -> haptics.error(), "Registration Not Found"
        -> network/RPC exception  -> haptics.error(), "Network Error"
-> "Scan Next Player" -> scannerRef.resume(), state reset, scan lock re-armed
```

Success haptic fires only after the RPC resolves with `result: 'success'` — never on decode alone (Step 11). Navigating back to `check-in.tsx` re-triggers its existing `useFocusEffect(() => refresh())` — no separate QR-specific list state was created; the registrations list is refetched from the same source both flows write to (Step 16).

## Player Workflow

`my-tournaments.tsx` → `RegistrationCard` (status `registered` or `checked_in`) → "Check-In QR" button → `check-in-qr.tsx`, which fetches the registration fresh via the new `fetchRegistrationById()` (RLS-scoped to the caller's own rows) and renders tournament name, division, player name, an "Already Checked In" pill when applicable, and the QR itself with the instruction "Show this QR code to the tournament director at check-in."

## Security Tests

Verified by code inspection and by reading the applied function back from production (not yet exercised on a physical device — see below):

| Scenario | Enforcement point | Result |
| -------- | ------------------ | ------ |
| Unauthorized director (not `is_approved_director()`, or not this tournament's director) | `check_in_registration()` step 2, before reading the registration | `unauthorized`, no mutation, no data revealed |
| Wrong tournament (valid registration, different tournament than the one being managed) | `check_in_registration()` step 4 | `wrong_tournament`, no mutation |
| Duplicate check-in (same QR scanned twice) | `check_in_registration()` step 5, under `for update` row lock | `already_checked_in`, no second mutation, existing timestamp authoritative |
| Invalid registration (cancelled/withdrawn/no_show/held/waitlisted) | `check_in_registration()` step 6 | `ineligible`, no mutation |
| Malformed/unsupported QR | `check-in-scan.tsx`'s classification gate, before any RPC call | "Unsupported QR", zero server calls, zero mutation |

## Regression Tests

- **Manual check-in**: `check-in.tsx`'s "Check In" button and `workspace.tsx`'s `DetailModal` "Check In" action both still work, both now calling `checkInPlayer()` → `checkInRegistration()` → the same RPC the QR flow uses. `check-in.tsx`'s call site gained actual error handling it didn't have before (previously an unhandled promise rejection with no user feedback on failure). **PASS** on physical iPhone post-hotfix (see "Physical iPhone Tests").
- **Generic scanner**: `git diff --stat` on every `QRScanner.*` file is empty — zero changes. Scan lock, torch, permission states, and Phase 5's `dev-qr-scan.tsx` test screen are all untouched and still function exactly as documented in `QR_CAMERA_PHASE5.md`. **PASS** on physical iPhone post-hotfix (see "Physical iPhone Tests").
- **Tournament registration architecture**: no changes to `registrations`, `tournaments`, `divisions`, or any existing RLS policy. `fetchTournamentRegistrations()`, `fetchPlayerRegistrations()`, and every other existing query in `registrations.ts` is untouched.
- Confirmed via `npx tsc --noEmit` (clean, both `apps/mobile` and `web`) and `npx eslint` on every changed file (0 errors introduced; 1 pre-existing warning in `registrations.ts` and 2 pre-existing warnings in `check-in.tsx`, confirmed via `git diff` to predate this phase and left untouched per scope).

## Build Impact

**No new EAS build required**, as expected. `react-native-qrcode-svg` was the only new dependency, and it has zero native code — verified no `.podspec`/`android` directory exists in the package, and it draws QR modules using `react-native-svg`, which is already compiled into the current dev build (confirmed in active use by `PickleballIcon.tsx`, `ParGauge.tsx`, and others before this phase). The current EAS development build from Phase 5 (with `expo-camera`) is sufficient.

## Physical iPhone Tests

**Post-hotfix physical iPhone testing: PASS.** An initial physical pass (manual check-in) failed with the `checked_in_at` ambiguous-column error documented under "Hotfix" below. After the server-side hotfix was applied to production, physical iPhone testing was re-run for both manual and QR check-in and passed — reported below as user-confirmed device results, not code inspection.

| Test | Status |
| ---- | ------ |
| Test 1 — Player QR renders with correct tournament/player context | PASS |
| Test 2 — Director authorization gates Scan Player QR access | PASS |
| Test 3 — Successful check-in (scan → server validates → checked in → confirmation → success haptic → list updates) | PASS |
| Test 4 — Duplicate scan (no second mutation, Already Checked In state) | PASS |
| Test 5 — Wrong tournament (server rejects, no mutation) | PASS |
| Test 6 — Unauthorized user (server rejects, client cannot bypass) | PASS |
| Test 7 — Invalid QR (safe error, no mutation, Scan Again works) | PASS |
| Test 8 — Invalid/cancelled/ineligible registration | PASS |
| Test 9 — Network failure (no check-in assumed, clear error, retry possible) | PASS |
| Test 10 — Manual check-in regression | **PASS** (post-hotfix). Initial physical test **FAILED** with `column reference "checked_in_at" is ambiguous` on manual check-in — see "Hotfix" below for root cause, fix, and production deployment. Re-tested after the hotfix and passed. |
| Test 11 — Generic scanner regression (scan lock, unsupported QR, Scan Again, torch, permissions) | PASS |

## Hotfix: Ambiguous `checked_in_at` (2026-08-14, same day)

**Manual physical test result: FAIL.** First physical iPhone pass (manual check-in button) surfaced a real production error: `column reference "checked_in_at" is ambiguous`.

**Root cause:** `check_in_registration()` is declared `RETURNS TABLE(..., checked_in_at timestamptz)`. PL/pgSQL implicitly creates a variable for every `RETURNS TABLE` output column, scoped to the whole function body. The function's final mutation:

```sql
update public.registrations
   set status = 'checked_in', checked_in_at = now(), checked_in_by = auth.uid(), updated_at = now()
 where id = v_reg.id
returning checked_in_at into v_reg.checked_in_at;
```

used a bare `RETURNING checked_in_at`, which Postgres could resolve to either the `registrations.checked_in_at` table column or the same-named `checked_in_at` output variable — hence "ambiguous." This only fires on the actual mutation path (a fresh check-in), which is why it wasn't caught by the `already_checked_in`/`ineligible`/`unauthorized` branches (those never hit this `UPDATE ... RETURNING`), and why it reproduced identically on manual check-in even though the reported symptom first appeared there — the RPC is shared between manual and QR, so QR check-in would hit the exact same error on a fresh check-in.

**Exact fix** (`supabase/migrations/20260814000000_tournament_qr_checkin_phase5_1.sql`): added an explicit alias to the `UPDATE` target and qualified the `RETURNING` column with it:

```sql
update public.registrations as r
   set status = 'checked_in', checked_in_at = now(), checked_in_by = auth.uid(), updated_at = now()
 where r.id = v_reg.id
returning r.checked_in_at into v_reg.checked_in_at;
```

**Audit for the same ambiguity class:** checked every other bare reference to `checked_in_at` and to all other `RETURNS TABLE` output names (`result`, `reason`, `registration_id`, `player_name`, `division_name`, `tournament_name`) throughout the function. No other instance found — every other read of these fields goes through the qualified `v_reg.*` record variable or an explicitly aliased query (`t.name`, `p.full_name`, `d.name`), and the `SET status = ..., checked_in_at = now()` assignment targets are unambiguous by SQL grammar (an `UPDATE`'s `SET` left-hand side is always the target table's column, never a PL/pgSQL variable).

**Production deployment:** applied directly via `CREATE OR REPLACE FUNCTION` + `GRANT` against `fbzetvkbhneptvfruilw` (dreambreaker-pb), the same idempotent direct-SQL approach used for the original Phase 5.1 deploy (see "Database Changes" — migration-history divergence still unresolved and untouched by this hotfix). Live definition re-read from `pg_proc` after deployment and confirmed to contain the qualified `r.checked_in_at` alias.

**Server-side tests** (run inside a single transaction against production data, `ROLLBACK`ed at the end — no data mutated):

| Scenario | Result |
| -------- | ------ |
| Valid check-in (director, own tournament, eligible registration) | `success`, `checked_in_at` populated |
| Already checked in (same registration, second call) | `already_checked_in`, original `checked_in_at` preserved, no re-mutation |
| Wrong tournament (valid registration, mismatched `p_tournament_id`) | `wrong_tournament` |
| Unauthorized caller (authenticated, not an approved director) | `unauthorized` |
| Invalid registration (nonexistent id) | `not_found` |

All five returned the expected `result`/`reason` with no ambiguous-column error. Post-test read of the test registration confirmed `status = 'registered'`, `checked_in_at = null` — the transaction rollback left production data untouched.

**Physical iPhone re-test: PASS.** Both manual and QR check-in were re-tested on a physical iPhone after this hotfix (see "Physical iPhone Tests" above) — no ambiguous-column error or other regression observed. Phase 5.1 is COMPLETE.

### Re-test steps

1. On a physical iPhone with the current dev build, open a tournament as its director and go to the check-in list (`tournament/[id]/check-in.tsx`).
2. Tap "Check In" on a `registered` player (manual path) → expect success, list updates, no error toast/console error.
3. Tap "Check In" again on the same player → expect an "already checked in" state, not a second mutation or error.
4. Use "Scan Player QR" → `check-in-scan.tsx` on a different `registered` player's QR (from `check-in-qr.tsx` on a second device/account) → expect success haptic and confirmation screen.
5. Re-scan the same QR → expect "Already Checked In" haptic/state.
6. If a second tournament directed by the same account is available, scan a QR belonging to that other tournament while the check-in screen is scoped to the first → expect "This registration belongs to a different tournament," no mutation.
7. Confirm no `column reference "checked_in_at" is ambiguous` (or any other ambiguous-column) error appears in any of the above.

## Deferred QR Domains

Unchanged from `QR_CAMERA_PHASE5.md`, not touched this phase:

- **Booking check-in — NOT READY.** No schema change was made toward this.
- **Coach voucher redemption — PARTIAL.** No redemption RPC was built toward this.

## Other Deferred / Flagged Items

- **The pre-existing migration-history divergence between local files and production is still unresolved.** This phase deliberately worked around it rather than fixing it (see "Database Changes"), because reconciling it safely requires understanding what each of the ~15 untracked remote migrations actually contains — not something to guess at while implementing an unrelated feature. Recommend a dedicated pass: `supabase db pull` to see what production actually has, compare against the ~15 "local only" files to check whether their intended changes are already present under different migration IDs, and only then decide whether `migration repair` is safe.
- `apps/mobile/src/lib/database.types.ts` is now more current than it was before this phase (467 lines of drift from those same untracked migrations resolved as a side effect of regenerating types for this feature) — worth knowing if a future diff of that file looks larger than expected for unrelated reasons.
