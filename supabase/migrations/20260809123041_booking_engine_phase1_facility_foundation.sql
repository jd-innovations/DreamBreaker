-- Booking Engine V1 — Phase 1: facility foundation only.
--
-- Per BOOKING_ENGINE_AUDIT.md, this migration is schema + RLS only:
--   - facility_members (OWNER/MANAGER/STAFF) — reuses the group_members /
--     conversation_participants "role junction table" convention already in
--     this codebase. No new global auth role is introduced; public.profiles.role
--     and is_director/director_status are untouched.
--   - courts, ball_machines — new inventory tables. court_assignments was
--     evaluated and rejected as a base (tournament-only, no time-slot/facility
--     columns) per audit §4.
--   - operating_hours — one polymorphic table (facility | court | ball_machine)
--     instead of three near-identical hours tables, replacing/augmenting the
--     free-text facilities.hours_summary gap identified in the audit.
--   - asset_photos — one polymorphic table (court | ball_machine) mirroring
--     facility_photos, instead of a photos table per asset type.
--
-- Explicitly NOT in this migration: reservations, availability/holds, booking
-- payments, Flash Deals, QR check-in, notifications. Those are later phases.

-- ── facility_members ──────────────────────────────────────────────────────

CREATE TYPE "public"."facility_member_role" AS ENUM ('owner', 'manager', 'staff');

CREATE TABLE "public"."facility_members" (
  "facility_id" uuid NOT NULL REFERENCES "public"."facilities"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "public"."profiles"("id") ON DELETE CASCADE,
  "role" "public"."facility_member_role" NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" uuid REFERENCES "public"."profiles"("id"),
  PRIMARY KEY ("facility_id", "user_id")
);

CREATE INDEX "idx_facility_members_user" ON "public"."facility_members" ("user_id");

COMMENT ON TABLE "public"."facility_members" IS
  'Facility organization membership. Mirrors the group_members / conversation_participants role-junction pattern — not a new global auth role.';

-- Role-rank helper (owner > manager > staff) so "at least manager" checks are
-- one comparison instead of an IN-list everywhere a policy needs one.
CREATE OR REPLACE FUNCTION "public"."facility_role_rank"("p_role" "public"."facility_member_role")
  RETURNS smallint
  LANGUAGE "sql" IMMUTABLE
  AS $$
  SELECT CASE p_role
    WHEN 'owner' THEN 3
    WHEN 'manager' THEN 2
    WHEN 'staff' THEN 1
  END;
$$;

CREATE OR REPLACE FUNCTION "public"."is_facility_role_at_least"(
    "p_facility_id" uuid, "p_user_id" uuid, "p_min_role" "public"."facility_member_role"
  )
  RETURNS boolean
  LANGUAGE "sql" STABLE SECURITY DEFINER
  SET "search_path" TO 'public'
  AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.facility_members fm
    WHERE fm.facility_id = p_facility_id
      AND fm.user_id = p_user_id
      AND public.facility_role_rank(fm.role) >= public.facility_role_rank(p_min_role)
  );
$$;

COMMENT ON FUNCTION "public"."is_facility_role_at_least" IS
  'SECURITY DEFINER role-gate for facility_members, mirroring the is_admin()/is_listing_owner() convention.';

ALTER TABLE "public"."facility_members" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "facility_members: admin full access" ON "public"."facility_members"
  USING ("public"."is_admin"());

CREATE POLICY "facility_members: member read own facility" ON "public"."facility_members"
  FOR SELECT USING (
    "user_id" = (SELECT auth.uid())
    OR "public"."is_facility_role_at_least"("facility_id", (SELECT auth.uid()), 'staff')
  );

-- Bootstrap: the single-owner claim on facilities.owner_user_id (existing
-- claim flow, untouched by this migration) is the only way to become a
-- facility's first owner row. Reconciling claim_status with facility_members
-- long-term is flagged in BOOKING_ENGINE_AUDIT.md as a product decision;
-- this policy only lets an already-recognized owner seed their own row.
CREATE POLICY "facility_members: bootstrap owner self insert" ON "public"."facility_members"
  FOR INSERT WITH CHECK (
    "role" = 'owner'
    AND "user_id" = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.facilities f
      WHERE f.id = "facility_id" AND f.owner_user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "facility_members: owner manage members" ON "public"."facility_members"
  FOR ALL
  USING ("public"."is_facility_role_at_least"("facility_id", (SELECT auth.uid()), 'owner'))
  WITH CHECK ("public"."is_facility_role_at_least"("facility_id", (SELECT auth.uid()), 'owner'));

CREATE POLICY "facility_members: manager add or remove staff" ON "public"."facility_members"
  FOR ALL
  USING ("role" = 'staff' AND "public"."is_facility_role_at_least"("facility_id", (SELECT auth.uid()), 'manager'))
  WITH CHECK ("role" = 'staff' AND "public"."is_facility_role_at_least"("facility_id", (SELECT auth.uid()), 'manager'));

CREATE POLICY "facility_members: self leave" ON "public"."facility_members"
  FOR DELETE USING ("user_id" = (SELECT auth.uid()));

-- ── courts ───────────────────────────────────────────────────────────────

CREATE TABLE "public"."courts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "facility_id" uuid NOT NULL REFERENCES "public"."facilities"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "indoor_outdoor" text NOT NULL,
  "hourly_rate_cents" integer,
  "amenities" text[] NOT NULL DEFAULT '{}',
  "is_active" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_by" uuid REFERENCES "public"."profiles"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "courts_indoor_outdoor_check" CHECK ("indoor_outdoor" = ANY (ARRAY['indoor'::text, 'outdoor'::text])),
  CONSTRAINT "courts_hourly_rate_nonneg" CHECK ("hourly_rate_cents" IS NULL OR "hourly_rate_cents" >= 0),
  CONSTRAINT "courts_name_len" CHECK (char_length("name") BETWEEN 1 AND 80)
);

CREATE INDEX "idx_courts_facility" ON "public"."courts" ("facility_id", "sort_order");

CREATE OR REPLACE TRIGGER "trg_courts_updated_at"
  BEFORE UPDATE ON "public"."courts"
  FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();

-- ── ball_machines ────────────────────────────────────────────────────────

CREATE TABLE "public"."ball_machines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "facility_id" uuid NOT NULL REFERENCES "public"."facilities"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "hourly_rate_cents" integer,
  "description" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_by" uuid REFERENCES "public"."profiles"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ball_machines_hourly_rate_nonneg" CHECK ("hourly_rate_cents" IS NULL OR "hourly_rate_cents" >= 0),
  CONSTRAINT "ball_machines_name_len" CHECK (char_length("name") BETWEEN 1 AND 80),
  CONSTRAINT "ball_machines_description_len" CHECK ("description" IS NULL OR char_length("description") <= 500)
);

CREATE INDEX "idx_ball_machines_facility" ON "public"."ball_machines" ("facility_id", "sort_order");

CREATE OR REPLACE TRIGGER "trg_ball_machines_updated_at"
  BEFORE UPDATE ON "public"."ball_machines"
  FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();

-- ── shared owner-resolution helper (courts / ball_machines / facility) ─────
-- Used by operating_hours and asset_photos RLS so a facility manager's
-- permission check always resolves back to one facility_id, regardless of
-- which asset type the row belongs to. Future asset types extend the CASE.

CREATE TYPE "public"."facility_asset_owner_type" AS ENUM ('facility', 'court', 'ball_machine');

CREATE OR REPLACE FUNCTION "public"."facility_id_for_owner"(
    "p_owner_type" "public"."facility_asset_owner_type", "p_owner_id" uuid
  )
  RETURNS uuid
  LANGUAGE "sql" STABLE SECURITY DEFINER
  SET "search_path" TO 'public'
  AS $$
  SELECT CASE p_owner_type
    WHEN 'facility' THEN p_owner_id
    WHEN 'court' THEN (SELECT facility_id FROM public.courts WHERE id = p_owner_id)
    WHEN 'ball_machine' THEN (SELECT facility_id FROM public.ball_machines WHERE id = p_owner_id)
  END;
$$;

-- ── operating_hours ──────────────────────────────────────────────────────
-- Structured replacement for facilities.hours_summary (free text). One row
-- per (owner, day_of_week); is_closed=true means the owner does not open
-- that day. Attaches to a facility, a specific court, or a specific ball
-- machine via owner_type/owner_id, so per-asset hours can override the
-- facility default without a second table.

CREATE TABLE "public"."operating_hours" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_type" "public"."facility_asset_owner_type" NOT NULL,
  "owner_id" uuid NOT NULL,
  "day_of_week" smallint NOT NULL,
  "is_closed" boolean NOT NULL DEFAULT false,
  "open_time" time,
  "close_time" time,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "operating_hours_day_of_week_check" CHECK ("day_of_week" BETWEEN 0 AND 6),
  CONSTRAINT "operating_hours_time_range_check" CHECK (
    "is_closed" = true OR ("open_time" IS NOT NULL AND "close_time" IS NOT NULL AND "open_time" < "close_time")
  ),
  CONSTRAINT "operating_hours_owner_day_unique" UNIQUE ("owner_type", "owner_id", "day_of_week")
);

CREATE INDEX "idx_operating_hours_owner" ON "public"."operating_hours" ("owner_type", "owner_id");

CREATE OR REPLACE TRIGGER "trg_operating_hours_updated_at"
  BEFORE UPDATE ON "public"."operating_hours"
  FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();

-- ── asset_photos ─────────────────────────────────────────────────────────
-- Court/ball-machine equivalent of facility_photos. Deliberately excludes
-- 'facility' — facility_photos already exists and is untouched by this phase.

CREATE TABLE "public"."asset_photos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_type" "public"."facility_asset_owner_type" NOT NULL,
  "owner_id" uuid NOT NULL,
  "url" text NOT NULL,
  "is_primary" boolean NOT NULL DEFAULT false,
  "uploaded_by" uuid REFERENCES "public"."profiles"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "asset_photos_owner_type_check" CHECK ("owner_type" IN ('court', 'ball_machine'))
);

CREATE INDEX "idx_asset_photos_owner" ON "public"."asset_photos" ("owner_type", "owner_id");

-- ── RLS: courts ──────────────────────────────────────────────────────────

ALTER TABLE "public"."courts" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "courts: admin full access" ON "public"."courts"
  USING ("public"."is_admin"());

CREATE POLICY "courts: public read active" ON "public"."courts"
  FOR SELECT USING (
    "is_active" = true
    OR "public"."is_facility_role_at_least"("facility_id", (SELECT auth.uid()), 'staff')
  );

CREATE POLICY "courts: manager insert" ON "public"."courts"
  FOR INSERT WITH CHECK (
    "public"."is_facility_role_at_least"("facility_id", (SELECT auth.uid()), 'manager')
    AND ("created_by" IS NULL OR "created_by" = (SELECT auth.uid()))
  );

CREATE POLICY "courts: manager update" ON "public"."courts"
  FOR UPDATE
  USING ("public"."is_facility_role_at_least"("facility_id", (SELECT auth.uid()), 'manager'))
  WITH CHECK ("public"."is_facility_role_at_least"("facility_id", (SELECT auth.uid()), 'manager'));

CREATE POLICY "courts: manager delete" ON "public"."courts"
  FOR DELETE USING ("public"."is_facility_role_at_least"("facility_id", (SELECT auth.uid()), 'manager'));

-- ── RLS: ball_machines ───────────────────────────────────────────────────

ALTER TABLE "public"."ball_machines" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ball_machines: admin full access" ON "public"."ball_machines"
  USING ("public"."is_admin"());

CREATE POLICY "ball_machines: public read active" ON "public"."ball_machines"
  FOR SELECT USING (
    "is_active" = true
    OR "public"."is_facility_role_at_least"("facility_id", (SELECT auth.uid()), 'staff')
  );

CREATE POLICY "ball_machines: manager insert" ON "public"."ball_machines"
  FOR INSERT WITH CHECK (
    "public"."is_facility_role_at_least"("facility_id", (SELECT auth.uid()), 'manager')
    AND ("created_by" IS NULL OR "created_by" = (SELECT auth.uid()))
  );

CREATE POLICY "ball_machines: manager update" ON "public"."ball_machines"
  FOR UPDATE
  USING ("public"."is_facility_role_at_least"("facility_id", (SELECT auth.uid()), 'manager'))
  WITH CHECK ("public"."is_facility_role_at_least"("facility_id", (SELECT auth.uid()), 'manager'));

CREATE POLICY "ball_machines: manager delete" ON "public"."ball_machines"
  FOR DELETE USING ("public"."is_facility_role_at_least"("facility_id", (SELECT auth.uid()), 'manager'));

-- ── RLS: operating_hours ─────────────────────────────────────────────────

ALTER TABLE "public"."operating_hours" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "operating_hours: admin full access" ON "public"."operating_hours"
  USING ("public"."is_admin"());

CREATE POLICY "operating_hours: public read" ON "public"."operating_hours"
  FOR SELECT USING (true);

CREATE POLICY "operating_hours: manager insert" ON "public"."operating_hours"
  FOR INSERT WITH CHECK (
    "public"."is_facility_role_at_least"(
      "public"."facility_id_for_owner"("owner_type", "owner_id"), (SELECT auth.uid()), 'manager'
    )
  );

CREATE POLICY "operating_hours: manager update" ON "public"."operating_hours"
  FOR UPDATE
  USING (
    "public"."is_facility_role_at_least"(
      "public"."facility_id_for_owner"("owner_type", "owner_id"), (SELECT auth.uid()), 'manager'
    )
  )
  WITH CHECK (
    "public"."is_facility_role_at_least"(
      "public"."facility_id_for_owner"("owner_type", "owner_id"), (SELECT auth.uid()), 'manager'
    )
  );

CREATE POLICY "operating_hours: manager delete" ON "public"."operating_hours"
  FOR DELETE USING (
    "public"."is_facility_role_at_least"(
      "public"."facility_id_for_owner"("owner_type", "owner_id"), (SELECT auth.uid()), 'manager'
    )
  );

-- ── RLS: asset_photos ────────────────────────────────────────────────────

ALTER TABLE "public"."asset_photos" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "asset_photos: admin full access" ON "public"."asset_photos"
  USING ("public"."is_admin"());

CREATE POLICY "asset_photos: public read" ON "public"."asset_photos"
  FOR SELECT USING (true);

CREATE POLICY "asset_photos: manager or uploader insert" ON "public"."asset_photos"
  FOR INSERT WITH CHECK (
    "uploaded_by" = (SELECT auth.uid())
    AND "public"."is_facility_role_at_least"(
      "public"."facility_id_for_owner"("owner_type", "owner_id"), (SELECT auth.uid()), 'manager'
    )
  );

CREATE POLICY "asset_photos: manager or uploader delete" ON "public"."asset_photos"
  FOR DELETE USING (
    "uploaded_by" = (SELECT auth.uid())
    OR "public"."is_facility_role_at_least"(
      "public"."facility_id_for_owner"("owner_type", "owner_id"), (SELECT auth.uid()), 'manager'
    )
  );

-- ── Storage: facility-assets bucket (court / ball machine photos) ─────────
-- Mirrors the marketplace bucket's folder-per-owner convention from
-- 20260807050000_marketplace.sql, but folder[1] is the facility_id (not the
-- uploading user), gated through is_facility_role_at_least so any manager+
-- on that facility can upload/delete, not just the original uploader.

INSERT INTO "storage"."buckets" ("id", "name", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types")
VALUES ('facility-assets', 'facility-assets', true, false, 26214400, '{image/jpeg,image/png,image/heic,image/webp}')
ON CONFLICT ("id") DO UPDATE SET
  "public" = EXCLUDED."public",
  "file_size_limit" = EXCLUDED."file_size_limit",
  "allowed_mime_types" = EXCLUDED."allowed_mime_types";

CREATE POLICY "public read facility-assets" ON "storage"."objects"
  FOR SELECT USING (("bucket_id" = 'facility-assets'::text));

CREATE POLICY "facility managers upload facility-assets" ON "storage"."objects"
  FOR INSERT WITH CHECK (
    ("bucket_id" = 'facility-assets'::text)
    AND "public"."is_facility_role_at_least"(
      (((storage.foldername("name"))[1]))::uuid, (SELECT auth.uid()), 'manager'
    )
  );

CREATE POLICY "facility managers delete facility-assets" ON "storage"."objects"
  FOR DELETE USING (
    ("bucket_id" = 'facility-assets'::text)
    AND "public"."is_facility_role_at_least"(
      (((storage.foldername("name"))[1]))::uuid, (SELECT auth.uid()), 'manager'
    )
  );
