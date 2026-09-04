-- Marketplace V1 — paddle listings, photos, storage bucket, report/limit wiring.
--
-- Chat is deliberately NOT touched: a marketplace offer/message is a plain
-- 1:1 direct conversation between buyer and seller (public.get_or_create_direct_conversation
-- already covers this — see conversationService.ts), so conversation_type and
-- its RLS/CHECK constraints stay as-is. "Report Listing" reuses the existing
-- public.user_reports table (reported_id = seller) rather than a new table,
-- with a nullable related_listing_id added for traceability.

-- ── Marketplace-specific report reasons ─────────────────────────────────────
-- Existing report_reason enum only covers generic user-conduct reasons
-- (spam_or_inappropriate, harassment, hate_speech, impersonation, other).
-- Add the listing-specific ones from the product spec's report flow.
ALTER TYPE "public"."report_reason" ADD VALUE IF NOT EXISTS 'counterfeit';
ALTER TYPE "public"."report_reason" ADD VALUE IF NOT EXISTS 'mislabeled';
ALTER TYPE "public"."report_reason" ADD VALUE IF NOT EXISTS 'price_gouging';

-- ── marketplace_listings ─────────────────────────────────────────────────────

CREATE TYPE "public"."marketplace_condition" AS ENUM (
  'new', 'like_new', 'excellent', 'good', 'fair'
);

CREATE TYPE "public"."marketplace_listing_status" AS ENUM (
  'active', 'pending', 'sold', 'deleted'
);

CREATE TABLE "public"."marketplace_listings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "seller_id" uuid NOT NULL REFERENCES "public"."profiles"("id") ON DELETE CASCADE,
  "brand" text NOT NULL,
  "model" text NOT NULL,
  "title" text NOT NULL,
  "condition" "public"."marketplace_condition" NOT NULL,
  "asking_price_cents" integer NOT NULL,
  "min_offer_cents" integer NOT NULL,
  "description" text,
  "status" "public"."marketplace_listing_status" NOT NULL DEFAULT 'active',
  "location_city" text,
  "location_state" text,
  "location_lat" double precision,
  "location_lng" double precision,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "marketplace_listings_asking_price_positive" CHECK ("asking_price_cents" > 0),
  CONSTRAINT "marketplace_listings_min_offer_positive" CHECK ("min_offer_cents" > 0),
  CONSTRAINT "marketplace_listings_min_offer_le_asking" CHECK ("min_offer_cents" <= "asking_price_cents"),
  CONSTRAINT "marketplace_listings_description_len" CHECK (char_length("description") <= 300)
);

CREATE INDEX "idx_marketplace_listings_status_created" ON "public"."marketplace_listings" ("status", "created_at" DESC);
CREATE INDEX "idx_marketplace_listings_seller" ON "public"."marketplace_listings" ("seller_id");
CREATE INDEX "idx_marketplace_listings_brand" ON "public"."marketplace_listings" ("brand");

CREATE OR REPLACE TRIGGER "trg_marketplace_listings_updated_at"
  BEFORE UPDATE ON "public"."marketplace_listings"
  FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();

-- ── marketplace_listing_photos ───────────────────────────────────────────────

CREATE TABLE "public"."marketplace_listing_photos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "listing_id" uuid NOT NULL REFERENCES "public"."marketplace_listings"("id") ON DELETE CASCADE,
  "url" text NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "idx_marketplace_listing_photos_listing" ON "public"."marketplace_listing_photos" ("listing_id", "sort_order");

-- ── profiles: free-tier listing limit ────────────────────────────────────────
-- Narrow bolt-on, not a general entitlement system — the app has no
-- premium/subscription infra today. Null means "use the app-wide default (2)".

ALTER TABLE "public"."profiles"
  ADD COLUMN "marketplace_listing_limit" integer;

-- ── user_reports: traceable listing reports ──────────────────────────────────
-- Reuses the existing report pipeline; reported_id continues to be the
-- reported *user* (the seller), this column just adds "which listing".

ALTER TABLE "public"."user_reports"
  ADD COLUMN "related_listing_id" uuid REFERENCES "public"."marketplace_listings"("id") ON DELETE SET NULL;

-- ── is_listing_owner helper (mirrors is_conversation_participant convention) ──

CREATE OR REPLACE FUNCTION "public"."is_listing_owner"("p_listing_id" uuid, "p_user_id" uuid)
  RETURNS boolean
  LANGUAGE "sql" STABLE SECURITY DEFINER
  SET "search_path" TO 'public'
  AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.marketplace_listings l
    WHERE l.id = p_listing_id AND l.seller_id = p_user_id
  );
$$;

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE "public"."marketplace_listings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."marketplace_listing_photos" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "marketplace_listings: public read active" ON "public"."marketplace_listings"
  FOR SELECT USING (
    "status" = 'active'
    OR "seller_id" = (SELECT auth.uid())
  );

CREATE POLICY "marketplace_listings: owner insert" ON "public"."marketplace_listings"
  FOR INSERT WITH CHECK ("seller_id" = (SELECT auth.uid()));

CREATE POLICY "marketplace_listings: owner update" ON "public"."marketplace_listings"
  FOR UPDATE USING ("seller_id" = (SELECT auth.uid()))
  WITH CHECK ("seller_id" = (SELECT auth.uid()));

CREATE POLICY "marketplace_listings: owner delete" ON "public"."marketplace_listings"
  FOR DELETE USING ("seller_id" = (SELECT auth.uid()));

CREATE POLICY "marketplace_listing_photos: public read" ON "public"."marketplace_listing_photos"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.marketplace_listings l
      WHERE l.id = "listing_id" AND (l.status = 'active' OR l.seller_id = (SELECT auth.uid()))
    )
  );

CREATE POLICY "marketplace_listing_photos: owner insert" ON "public"."marketplace_listing_photos"
  FOR INSERT WITH CHECK (public.is_listing_owner("listing_id", (SELECT auth.uid())));

CREATE POLICY "marketplace_listing_photos: owner delete" ON "public"."marketplace_listing_photos"
  FOR DELETE USING (public.is_listing_owner("listing_id", (SELECT auth.uid())));

-- ── Storage: marketplace bucket ──────────────────────────────────────────────

INSERT INTO "storage"."buckets" ("id", "name", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types")
VALUES ('marketplace', 'marketplace', true, false, 26214400, '{image/jpeg,image/png,image/heic,image/webp}')
ON CONFLICT ("id") DO UPDATE SET
  "public" = EXCLUDED."public",
  "file_size_limit" = EXCLUDED."file_size_limit",
  "allowed_mime_types" = EXCLUDED."allowed_mime_types";

CREATE POLICY "public read marketplace" ON "storage"."objects"
  FOR SELECT USING (("bucket_id" = 'marketplace'::text));

CREATE POLICY "owners upload marketplace" ON "storage"."objects"
  FOR INSERT WITH CHECK (
    ("bucket_id" = 'marketplace'::text)
    AND ((auth.uid())::text = (storage.foldername("name"))[1])
  );

CREATE POLICY "owners delete marketplace" ON "storage"."objects"
  FOR DELETE USING (
    ("bucket_id" = 'marketplace'::text)
    AND ((auth.uid())::text = (storage.foldername("name"))[1])
  );
