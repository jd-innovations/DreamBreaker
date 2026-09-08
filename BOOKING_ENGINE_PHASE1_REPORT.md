# BOOKING_ENGINE_PHASE1_REPORT.md

> Status: Phase 1 complete — **applied and verified** in the production Supabase project
> Source of truth: [BOOKING_ENGINE_V1_SPEC.md](TODO1.1.md), [BOOKING_ENGINE_AUDIT.md](BOOKING_ENGINE_AUDIT.md)
> Scope confirmed with user before implementation: **data layer only** — migrations, RLS, and reusable services/types/hooks. No Facility Admin UI screens were built in this phase (that is Phase 2 in the audit's recommended order).
> Applied to: Supabase project `fbzetvkbhneptvfruilw` ("dreambreaker-pb") — confirmed as the intended environment because its existing migration history matches this repo's local migrations exactly.

---

## Summary

Built the facility-organization foundation the rest of the Booking Engine depends on:

- **`facility_members`** — a role-junction table (`owner` / `manager` / `staff`) making facilities organizations with multi-user membership, without introducing any new global authentication role.
- **`courts`** and **`ball_machines`** — new inventory tables for the two V1 reservable asset types, deliberately not built on the tournament-only `court_assignments` table (rejected in the audit).
- **`operating_hours`** — one polymorphic structured-hours table (facility, court, or ball machine), replacing the free-text `facilities.hours_summary` gap identified in the audit, without three near-duplicate hours tables.
- **`asset_photos`** — the court/ball-machine equivalent of the existing `facility_photos` table.
- **RLS** on all four new tables plus a new `facility-assets` storage bucket, gated by a reusable `is_facility_role_at_least()` SECURITY DEFINER helper.
- **Mobile service/type/hook layer** (`facilityMembers.ts`, `courts.ts`, `ballMachines.ts`, `operatingHours.ts`, `assetPhotos.ts`, `useFacilityRole.ts`) that Phase 2's Facility Admin screens can call directly.
- **ImagePipeline** extended (not duplicated) with a `facilityAsset` category wired to the new bucket.

Reservations, availability, payments, Flash Deals, QR check-in, search, notifications, and the player flow were **not** touched, per the explicit scope of this phase.

**Update:** the migration has since been applied to the live production Supabase project and verified end-to-end (schema, RLS enforcement, and a full owner-bootstrap-to-inventory-write smoke test), closing the two gaps flagged when this report was first written. See Tests Performed and Known Limitations below for what changed.

---

## Files Created

**Database**
- [supabase/migrations/20260809123041_booking_engine_phase1_facility_foundation.sql](supabase/migrations/20260809123041_booking_engine_phase1_facility_foundation.sql) — renamed from the original `20260809000000_...` filename to match the version timestamp Supabase assigned when the migration was applied (`apply_migration` stamps its own version; keeping the local filename in sync avoids replay drift).
- [supabase/migrations/20260809132727_booking_engine_phase1_facility_role_rank_search_path_fix.sql](supabase/migrations/20260809132727_booking_engine_phase1_facility_role_rank_search_path_fix.sql) — follow-up migration, see Tests Performed.

**Mobile service layer** (`apps/mobile/src/lib/supabase/`)
- [facilityMembers.ts](apps/mobile/src/lib/supabase/facilityMembers.ts) — membership CRUD, role-rank helpers, bootstrap-owner flow
- [courts.ts](apps/mobile/src/lib/supabase/courts.ts) — court inventory CRUD
- [ballMachines.ts](apps/mobile/src/lib/supabase/ballMachines.ts) — ball machine inventory CRUD
- [operatingHours.ts](apps/mobile/src/lib/supabase/operatingHours.ts) — structured hours fetch/upsert
- [assetPhotos.ts](apps/mobile/src/lib/supabase/assetPhotos.ts) — court/ball-machine photo row CRUD (pairs with `ImagePipeline` for the actual upload)

**Mobile hook**
- [apps/mobile/src/hooks/useFacilityRole.ts](apps/mobile/src/hooks/useFacilityRole.ts) — current user's role at a facility, for gating future admin UI

**This report**
- BOOKING_ENGINE_PHASE1_REPORT.md

## Files Modified

- [apps/mobile/src/lib/database.types.ts](apps/mobile/src/lib/database.types.ts) — hand-added `Row`/`Insert`/`Update`/`Relationships` entries for `facility_members`, `courts`, `ball_machines`, `operating_hours`, `asset_photos`; the two new enums (`facility_member_role`, `facility_asset_owner_type`) in both the `Enums` type and the `Constants` value export; and three new function signatures (`facility_id_for_owner`, `facility_role_rank`, `is_facility_role_at_least`) in the `Functions` block. **Verified against the live database** — see Tests Performed. No changes were needed; the hand-written entries matched the real `generate_typescript_types` output field-for-field.
- [apps/mobile/src/lib/media/types.ts](apps/mobile/src/lib/media/types.ts) — added `'facilityAsset'` to `IMAGE_CATEGORIES`.
- [apps/mobile/src/lib/media/imageStandards.ts](apps/mobile/src/lib/media/imageStandards.ts) — added the `facilityAsset` category standard (`implemented: true`, bucket `facility-assets`, folder path `{facility_id}/{asset_id}`).

No other files were touched.

---

## Database Changes

All in `20260809123041_booking_engine_phase1_facility_foundation.sql` (plus the one-line `20260809132727_..._search_path_fix.sql` follow-up):

| Object | Kind | Notes |
|---|---|---|
| `facility_member_role` | enum | `owner`, `manager`, `staff` |
| `facility_members` | table | PK `(facility_id, user_id)`, indexed on `user_id` |
| `facility_role_rank()` | function | IMMUTABLE SQL, owner=3/manager=2/staff=1 |
| `is_facility_role_at_least()` | function | STABLE SECURITY DEFINER — the RLS gate, mirrors `is_admin()`/`is_listing_owner()` |
| `courts` | table | facility inventory: name, indoor/outdoor, hourly rate, amenities, active flag, sort order |
| `ball_machines` | table | facility inventory: name, hourly rate, description, active flag, sort order |
| `facility_asset_owner_type` | enum | `facility`, `court`, `ball_machine` |
| `facility_id_for_owner()` | function | STABLE SECURITY DEFINER — resolves any owner_type/owner_id back to one `facility_id` |
| `operating_hours` | table | one row per `(owner_type, owner_id, day_of_week)`; `is_closed` + `open_time`/`close_time` |
| `asset_photos` | table | court/ball-machine photos; `owner_type` CHECK excludes `'facility'` |
| RLS policies | 24 policies | across `facility_members`, `courts`, `ball_machines`, `operating_hours`, `asset_photos` |
| `facility-assets` | storage bucket | public read; write/delete gated by `is_facility_role_at_least(folder[1]::uuid, ..., 'manager')` |

`public.profiles.role`, `is_director`/`director_status`, and every existing table (`facilities`, `facility_photos`, `court_assignments`, `play_events`, etc.) are **untouched**.

---

## Reused Architecture

Per the audit's explicit "do not duplicate" findings, everything below was copied in *pattern*, not reinvented:

- **Role-junction table shape** — `facility_members` mirrors `group_members` / `conversation_participants` (`role` column, per-resource scoping). No new global auth role was added; `profiles.role` is untouched, satisfying the spec's "No new authentication role shall be introduced."
- **SECURITY DEFINER role-gate convention** — `is_facility_role_at_least()` and `facility_id_for_owner()` follow the exact shape of `is_admin()` and `is_listing_owner()` (STABLE SQL, `SET search_path`, `SELECT EXISTS(...)`).
- **`fn_set_updated_at()` trigger** — reused as-is on `courts`, `ball_machines`, `operating_hours` (not reimplemented).
- **Marketplace's folder-per-owner storage RLS pattern** (`20260807050000_marketplace.sql`) — copied for the `facility-assets` bucket, with `folder[1]` checked against facility membership instead of uploader identity, since a photo can be managed by any manager+, not just whoever uploaded it.
- **`facility_photos` pattern, not the table itself** — `asset_photos` mirrors its columns and public-read/uploader-delete RLS shape but is a separate table, since `facility_photos` is facility-scoped only and untouched by this phase.
- **`Tables<>`/`TablesUpdate<>` typed-service convention** (`facilities.ts`, `marketplace/listingService.ts`) — every new service file follows the same shape: hand-typed input objects, `supabase.from(...).select()/.insert()/.update()`, `if (error) throw error`.
- **ImagePipeline** — extended with one new category entry; `imagePipeline.ts` and the upload/transform/validate steps were not modified, confirming the pipeline's own "single source of truth is `imageStandards.ts`" design worked as intended.
- **`court_assignments` was deliberately NOT reused** — confirmed in the audit as tournament-only with no time-slot/facility columns; building on it would have been the exact anti-pattern the audit warned against.

---

## Tests Performed

**Static analysis (before applying):**
- **`npx tsc --noEmit -p tsconfig.json`** across the entire `apps/mobile` project after all changes: **0 errors.** (Caught and fixed two real type errors during development — untyped `Record<string, unknown>` update objects in `courts.ts`/`ballMachines.ts` — before this final pass.)
- **`npx eslint`** on all seven new/modified TypeScript files: **0 issues.**
- **Isolated syntax check** of `database.types.ts` via `tsc --noEmit --skipLibCheck` immediately after the hand-edits, before running the full project check, to catch bracket/syntax mistakes early.
- **Manual line-by-line review** of the migration SQL against three working precedents in this repo (`20260807050000_marketplace.sql`, the `facilities`/`facility_photos` RLS block in the baseline, and `is_admin()`) to check policy logic, constraint syntax, and trigger wiring by comparison.

**Applied to production** (project `fbzetvkbhneptvfruilw`, via the Supabase MCP `apply_migration` tool) and verified live:
- **`list_migrations`** confirms the migration registered as version `20260809123041`.
- **Security advisor** (`get_advisors`, type `security`) run immediately after applying: found **4 pre-existing ERRORs, none related to this migration** (two `security_definer_view` warnings on `play_participants_public`/`play_participants_authenticated`, one on `v_mutual_matches`, one `rls_disabled_in_public` on the PostGIS system table `spatial_ref_sys` — all predate this phase). Found **5 WARNs on the new objects**: `facility_role_rank()` had a mutable search_path (a real, fixable gap — 18 *other*, pre-existing functions in this codebase have the identical warning, but this one was mine to fix, so I fixed it with a follow-up migration, `20260809132727_..._search_path_fix.sql`, re-verified by direct `pg_proc` query afterward: all three new SQL functions now show `proconfig: ["search_path=public"]`). The other 4 warnings (`facility_id_for_owner`/`is_facility_role_at_least` being anon/authenticated-executable RPCs) are structurally identical to the pre-existing `is_admin()`, `is_listing_owner()`, `is_conversation_participant()`, `is_group_admin()` warnings already accepted in this codebase — confirmed by re-running the same advisor query filtered to those names — so left as-is, consistent with existing risk tolerance.
- **Schema verification via direct SQL**: confirmed all 5 tables exist with `relrowsecurity = true` and the expected policy counts (`facility_members`: 6, `courts`: 5, `ball_machines`: 5, `operating_hours`: 5, `asset_photos`: 4); confirmed the three `updated_at` triggers exist and point at `fn_set_updated_at`; confirmed the `facility-assets` storage bucket exists with the correct `public`/size-limit/MIME-type config.
- **Constraint smoke tests** (real inserts against a real seeded facility, cleaned up afterward — see below): a court with an invalid `indoor_outdoor` value was correctly **rejected** (`courts_indoor_outdoor_check`); an `operating_hours` row with `is_closed=false` and null times was correctly **rejected** (`operating_hours_time_range_check`); valid rows for `courts`, `ball_machines`, `operating_hours`, and `asset_photos` were correctly **accepted**, and `facility_id_for_owner()` correctly resolved the facility ID from all three owner types (`facility`, `court`, `ball_machine`) back to the same value.
- **RLS enforcement tests, simulating a real `authenticated` non-member user** (via `SET LOCAL ROLE authenticated` + `SET LOCAL request.jwt.claims`, inside transactions rolled back or cleaned up — not run as the service role, which bypasses RLS entirely):
  - A non-member could **read** the one active test court (public-read-active policy working).
  - A non-member was correctly **blocked** (`42501: new row violates row-level security policy`) from inserting a court.
  - A non-member was correctly **blocked** from self-inserting into `facility_members` as `'owner'` for a facility they don't own.
  - After marking that same user as the facility's `owner_user_id` (simulating an approved claim), the **bootstrap self-insert policy correctly succeeded**, and that user — now an `owner` row in `facility_members` — **correctly succeeded** inserting a court, proving the full claim → bootstrap → manage-inventory path works end to end.
- **Type-generation cross-check**: ran `generate_typescript_types` against the live post-migration schema and diffed it against the hand-written entries added to `database.types.ts`. Result: **exact match** on every `Row`/`Insert`/`Update`/function signature/enum — the only differences were foreign-key array *ordering* within `Relationships` (cosmetic, no type-checking effect). No changes to `database.types.ts` were needed.
- **Cleanup verified**: every row inserted during smoke testing was explicitly deleted (or was inside a rolled-back transaction) and re-queried afterward to confirm zero residue — `courts`, `ball_machines`, `operating_hours`, and `asset_photos` counts for the test facility are back to 0, `facility_members` total is 0, and the test facility's `owner_user_id` is confirmed still `null`. **Production data was not permanently altered by testing.**

---

## Known Limitations

1. ~~Migration is unverified against a live database~~ **Resolved.** Applied to production and verified — see Tests Performed.
2. ~~`database.types.ts` was hand-edited, not regenerated~~ **Resolved.** Cross-checked against a live `generate_typescript_types` call — exact match, no changes needed.
3. **`facility_members` bootstrap depends on the existing single-owner claim column** (`facilities.owner_user_id`). Only a facility's already-recognized owner can seed their own `owner` row. Reconciling `claim_status`/`owner_user_id` with `facility_members` long-term is an open product decision (flagged in the audit, item 5) — this phase makes the two coexist but does not resolve which is authoritative going forward.
4. **`deleteCourt()`/`deleteBallMachine()` are hard deletes.** Safe today — nothing references `courts.id`/`ball_machines.id` yet — but once Phase 4+ reservations exist, hard-deleting an asset with reservation history would be wrong. `deactivateCourt()`/`deactivateBallMachine()` (soft delete via `is_active`) already exist and are flagged in code comments as the preferred path once that's true.
5. **`operating_hours` doesn't model overnight windows** (e.g., open 10pm–2am) — the CHECK constraint requires `open_time < close_time` on the same calendar day. Not expected to matter for pickleball facility hours, but worth knowing if a 24-hour facility needs it later.
6. **`setPrimaryAssetPhoto()` is two sequential, non-atomic updates**, not a single transaction (no RPC was built for this narrow case). Fine for low-contention admin use (one manager editing their own facility's photos); flagged in the code comment if concurrent-write behavior ever needs to be revisited.
7. **No UI exists yet.** All of the above is reachable only through direct service calls — there is no Facility Admin screen to create a court, set hours, or upload a photo. That is intentionally out of scope for this phase per the scoping question answered before implementation began.
8. **The `facility-assets` storage bucket has no client code exercising it yet** — its RLS policies are written and structurally consistent with the marketplace bucket's, but the first real upload through it will happen in Phase 2.

---

## Phase 2 Readiness

Phase 2 (Facility Admin screens: Court Management, Ball Machine Management, and the hours/photos UI) can be built directly against the service layer shipped here with **no further data-layer work required**:

- `fetchCourts` / `createCourt` / `updateCourt` / `deactivateCourt` / `reactivateCourt` / `deleteCourt` — [courts.ts](apps/mobile/src/lib/supabase/courts.ts)
- `fetchBallMachines` / `createBallMachine` / `updateBallMachine` / `deactivateBallMachine` / `reactivateBallMachine` / `deleteBallMachine` — [ballMachines.ts](apps/mobile/src/lib/supabase/ballMachines.ts)
- `fetchOperatingHours` / `upsertOperatingHours` / `clearOperatingHours` — [operatingHours.ts](apps/mobile/src/lib/supabase/operatingHours.ts)
- `fetchAssetPhotos` / `addAssetPhoto` / `deleteAssetPhoto` / `setPrimaryAssetPhoto` — [assetPhotos.ts](apps/mobile/src/lib/supabase/assetPhotos.ts), paired with `uploadImage({ category: 'facilityAsset', ownerId: facilityId, entityId: courtOrMachineId })` from the existing `ImagePipeline`
- `useFacilityRole(facilityId)` — [useFacilityRole.ts](apps/mobile/src/hooks/useFacilityRole.ts), for gating the admin UI (`isManagerOrAbove` for inventory edits, `isOwner` for member management)
- `fetchMyFacilityMemberships` / `addFacilityMember` / `updateFacilityMemberRole` / `removeFacilityMember` / `leaveFacility` — [facilityMembers.ts](apps/mobile/src/lib/supabase/facilityMembers.ts), for a future "Manage Staff" screen

Limitations #1 and #2 (the two items that would have blocked Phase 2) are now resolved — the schema, RLS, and generated types are all confirmed against the live production database. Phase 2 can start directly against this service layer.
