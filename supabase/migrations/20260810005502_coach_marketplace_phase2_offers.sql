-- Coach Marketplace V1 — Phase 2: Coach Offers.
--
-- Per COACH_MARKETPLACE_V1_SPEC.md §4-7, §40 and the phased implementation
-- plan. Explicitly NOT in this migration: purchases/payments, wallet
-- vouchers, redemption, payouts, disputes, reviews, boosts. Offer CRUD has
-- no Stripe dependency beyond the publish-eligibility check
-- (is_coach_publish_ready, Phase 1), which already supports the
-- development-only test_ready fixture.

-- ── coach_offers ──────────────────────────────────────────────────────────

CREATE TYPE "public"."coach_offer_type" AS ENUM (
  'private',
  'semi_private',
  'group_clinic',
  'camp',
  'package'
);

CREATE TYPE "public"."coach_offer_status" AS ENUM (
  'draft',
  'active',
  'paused',
  'archived'
);

CREATE TABLE "public"."coach_offers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "coach_id" uuid NOT NULL REFERENCES "public"."profiles"("id"),
  "offer_type" "public"."coach_offer_type" NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "skill_level_label" text,
  "duration_minutes" integer CHECK ("duration_minutes" IS NULL OR "duration_minutes" > 0),
  "max_participants" integer CHECK ("max_participants" IS NULL OR "max_participants" > 0),
  -- Multi-lesson package only. NULL for every other offer_type — the
  -- purchase/redemption phase (Phase 4/5) treats NULL as "1 redemption."
  "lessons_included" integer CHECK ("lessons_included" IS NULL OR "lessons_included" > 0),
  "regular_price_cents" integer NOT NULL CHECK ("regular_price_cents" > 0),
  "discounted_price_cents" integer NOT NULL CHECK ("discounted_price_cents" > 0 AND "discounted_price_cents" <= "regular_price_cents"),
  -- NULL = unlimited. quantity_remaining starts equal to quantity_available
  -- (set by the service layer at insert time) and is only ever decremented
  -- at purchase time (Phase 3) — no purchase logic touches it yet.
  "quantity_available" integer CHECK ("quantity_available" IS NULL OR "quantity_available" > 0),
  "quantity_remaining" integer CHECK ("quantity_remaining" IS NULL OR "quantity_remaining" >= 0),
  "purchase_limit_per_customer" integer CHECK ("purchase_limit_per_customer" IS NULL OR "purchase_limit_per_customer" > 0),
  -- Location metadata only — spec §44/§46. Never reserves/holds/checks court
  -- availability or otherwise touches Court Booking inventory.
  "facility_id" uuid REFERENCES "public"."facilities"("id"),
  "status" "public"."coach_offer_status" NOT NULL DEFAULT 'draft',
  "premium_only" boolean NOT NULL DEFAULT false,
  "premium_price_cents" integer CHECK ("premium_price_cents" IS NULL OR "premium_price_cents" > 0),
  "terms" text,
  -- Targeting/audience metadata placeholder (Phase 9 boost targeting reads
  -- this later). Deliberately unstructured jsonb so targeting logic can
  -- evolve without a schema migration.
  "applicable_audience" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "coach_offers_package_has_lessons" CHECK (
    ("offer_type" = 'package' AND "lessons_included" IS NOT NULL) OR
    ("offer_type" != 'package')
  ),
  CONSTRAINT "coach_offers_premium_price_requires_flag" CHECK (
    "premium_price_cents" IS NULL OR "premium_only" = true OR "premium_price_cents" < "discounted_price_cents"
  )
);

CREATE INDEX "idx_coach_offers_coach" ON "public"."coach_offers" ("coach_id");
CREATE INDEX "idx_coach_offers_status" ON "public"."coach_offers" ("status");
CREATE INDEX "idx_coach_offers_facility" ON "public"."coach_offers" ("facility_id");

COMMENT ON TABLE "public"."coach_offers" IS
  'Coach Marketplace V1 Phase 2. facility_id is location metadata only — never reserves/holds Court Booking inventory (spec §44/§46).';
COMMENT ON COLUMN "public"."coach_offers"."lessons_included" IS
  'Package offers only. NULL elsewhere means "1 redemption" downstream (Phase 4/5) — do not default this to 1 here, the NULL is the signal.';

CREATE OR REPLACE TRIGGER "trg_coach_offers_updated_at"
  BEFORE UPDATE ON "public"."coach_offers"
  FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();

-- Enforce, server-side, at every write that would make an offer live:
--   1. minimum discount (platform_settings.coach_marketplace_min_discount_pct)
--   2. coach publish-readiness (is_coach_publish_ready — real 'active' coach
--      or dev-only 'test_ready' fixture, per Phase 1)
-- Drafts/paused/archived offers are exempt — a coach can draft or price an
-- idea freely; the gate is at the moment an offer would actually go live
-- (insert as 'active', or any transition INTO 'active', including resuming
-- a paused offer — so a later platform minimum-discount increase is
-- re-checked on resume, not just at original publish).
CREATE OR REPLACE FUNCTION "public"."fn_enforce_coach_offer_publish_rules"()
  RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET "search_path" TO 'public', 'pg_temp'
  AS $$
DECLARE
  v_min_discount_pct numeric;
  v_actual_discount_pct numeric;
BEGIN
  IF NEW.status != 'active' THEN
    RETURN NEW;
  END IF;

  IF NOT public.is_coach_publish_ready(NEW.coach_id) THEN
    RAISE EXCEPTION 'Coach is not publish-ready — requires a real (active) or development-fixture (test_ready) coach_status';
  END IF;

  SELECT "value"::numeric INTO v_min_discount_pct
  FROM public.platform_settings WHERE "key" = 'coach_marketplace_min_discount_pct';
  v_min_discount_pct := COALESCE(v_min_discount_pct, 0);

  v_actual_discount_pct := ROUND(
    (1 - (NEW.discounted_price_cents::numeric / NULLIF(NEW.regular_price_cents, 0))) * 100,
    2
  );

  IF v_actual_discount_pct < v_min_discount_pct THEN
    RAISE EXCEPTION 'Offer discount percent (%) is below the platform minimum (%)', v_actual_discount_pct, v_min_discount_pct;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION "public"."fn_enforce_coach_offer_publish_rules" IS
  'Server-side minimum-discount + publish-readiness gate, re-checked on every transition into status=active (including resume). Coach Marketplace V1 Phase 2.';

CREATE TRIGGER "trg_enforce_coach_offer_publish_rules"
  BEFORE INSERT OR UPDATE ON "public"."coach_offers"
  FOR EACH ROW EXECUTE FUNCTION "public"."fn_enforce_coach_offer_publish_rules"();

ALTER TABLE "public"."coach_offers" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coach_offers: public read active" ON "public"."coach_offers"
  FOR SELECT USING ("status" = 'active');

CREATE POLICY "coach_offers: owner read own" ON "public"."coach_offers"
  FOR SELECT USING ("coach_id" = (SELECT auth.uid()));

CREATE POLICY "coach_offers: admin full access" ON "public"."coach_offers"
  USING ("public"."is_admin"());

CREATE POLICY "coach_offers: owner insert" ON "public"."coach_offers"
  FOR INSERT WITH CHECK (
    "coach_id" = (SELECT auth.uid())
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.is_coach = true)
  );

CREATE POLICY "coach_offers: owner update own" ON "public"."coach_offers"
  FOR UPDATE USING ("coach_id" = (SELECT auth.uid())) WITH CHECK ("coach_id" = (SELECT auth.uid()));

-- No DELETE policy — offers are archived (status='archived'), never deleted,
-- so historical purchases (Phase 3+) always have a row to reference.

-- ── coach_offer_images ────────────────────────────────────────────────────

CREATE TABLE "public"."coach_offer_images" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "coach_offer_id" uuid NOT NULL REFERENCES "public"."coach_offers"("id") ON DELETE CASCADE,
  "url" text NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "idx_coach_offer_images_offer" ON "public"."coach_offer_images" ("coach_offer_id");

ALTER TABLE "public"."coach_offer_images" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coach_offer_images: public read for active offers" ON "public"."coach_offer_images"
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.coach_offers o WHERE o.id = "coach_offer_id" AND o.status = 'active')
  );

CREATE POLICY "coach_offer_images: owner read own" ON "public"."coach_offer_images"
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.coach_offers o WHERE o.id = "coach_offer_id" AND o.coach_id = (SELECT auth.uid()))
  );

CREATE POLICY "coach_offer_images: owner write own" ON "public"."coach_offer_images"
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.coach_offers o WHERE o.id = "coach_offer_id" AND o.coach_id = (SELECT auth.uid()))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.coach_offers o WHERE o.id = "coach_offer_id" AND o.coach_id = (SELECT auth.uid()))
  );

CREATE POLICY "coach_offer_images: admin full access" ON "public"."coach_offer_images"
  USING ("public"."is_admin"());

-- ── Storage: coach-offers bucket ─────────────────────────────────────────────
-- Mirrors the marketplace bucket pattern exactly (20260807050000_marketplace.sql).

INSERT INTO "storage"."buckets" ("id", "name", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types")
VALUES ('coach-offers', 'coach-offers', true, false, 26214400, '{image/jpeg,image/png,image/heic,image/webp}')
ON CONFLICT ("id") DO UPDATE SET
  "public" = EXCLUDED."public",
  "file_size_limit" = EXCLUDED."file_size_limit",
  "allowed_mime_types" = EXCLUDED."allowed_mime_types";

CREATE POLICY "public read coach-offers" ON "storage"."objects"
  FOR SELECT USING (("bucket_id" = 'coach-offers'::text));

CREATE POLICY "owners upload coach-offers" ON "storage"."objects"
  FOR INSERT WITH CHECK (
    ("bucket_id" = 'coach-offers'::text)
    AND ((auth.uid())::text = (storage.foldername("name"))[1])
  );

CREATE POLICY "owners delete coach-offers" ON "storage"."objects"
  FOR DELETE USING (
    ("bucket_id" = 'coach-offers'::text)
    AND ((auth.uid())::text = (storage.foldername("name"))[1])
  );
