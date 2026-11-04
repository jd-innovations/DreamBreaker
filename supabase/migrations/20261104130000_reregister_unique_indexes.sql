-- =============================================================================
-- Re-registering after withdrawal, part 2: the unique indexes
-- =============================================================================
-- 20261104120000 stopped fn_enforce_single_division counting released rows, but
-- re-registering in the SAME division still failed: uq_registration_per_division
-- (tournament, player, division) and uq_registration_legacy (tournament, player,
-- for rows with no division) cover every row, withdrawn and expired_hold too.
--
-- Both now cover only rows that hold a place. Nothing upserts against them
-- (no ON CONFLICT on registrations anywhere), so narrowing them changes no
-- write path. Duplicates among active rows stay impossible: the trigger blocks
-- them on insert and on a released -> active update, and these indexes back
-- that up.
-- =============================================================================

DROP INDEX IF EXISTS "public"."uq_registration_per_division";
CREATE UNIQUE INDEX "uq_registration_per_division"
  ON "public"."registrations" USING "btree" ("tournament_id", "player_id", "division_id")
  WHERE "division_id" IS NOT NULL
    AND "status" NOT IN ('withdrawn'::"public"."registration_status", 'expired_hold'::"public"."registration_status");

DROP INDEX IF EXISTS "public"."uq_registration_legacy";
CREATE UNIQUE INDEX "uq_registration_legacy"
  ON "public"."registrations" USING "btree" ("tournament_id", "player_id")
  WHERE "division_id" IS NULL
    AND "status" NOT IN ('withdrawn'::"public"."registration_status", 'expired_hold'::"public"."registration_status");
