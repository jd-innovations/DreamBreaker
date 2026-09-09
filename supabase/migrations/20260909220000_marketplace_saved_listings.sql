-- The heart on the listing detail screen was useState(false) -- local only.
-- Tapping it did nothing that survived leaving the screen. This gives it
-- somewhere to live.
--
-- Shaped after play_event_bookmarks / tournament_bookmarks, which already solve
-- exactly this for the other two entity types: composite PK, owner-only RLS,
-- no updated_at (a save has no mutable state -- you either have it or you do
-- not, and un-saving is a delete).

CREATE TABLE IF NOT EXISTS "public"."marketplace_saved_listings" (
  "user_id"    uuid NOT NULL REFERENCES "public"."profiles"("id") ON DELETE CASCADE,
  "listing_id" uuid NOT NULL REFERENCES "public"."marketplace_listings"("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "listing_id")
);

-- The PK covers (user_id, listing_id) lookups. This one serves the reverse:
-- "how many people saved this listing", and cascade deletes by listing.
CREATE INDEX IF NOT EXISTS "idx_marketplace_saved_listings_listing"
  ON "public"."marketplace_saved_listings" ("listing_id");

ALTER TABLE "public"."marketplace_saved_listings" ENABLE ROW LEVEL SECURITY;

-- Owner-only in every direction. A save is private: a seller must not be able
-- to see who saved their listing, and no one may save on someone else's behalf.
CREATE POLICY "marketplace_saved_listings: owner read"
  ON "public"."marketplace_saved_listings"
  FOR SELECT USING ("user_id" = (SELECT auth.uid()));

CREATE POLICY "marketplace_saved_listings: owner insert"
  ON "public"."marketplace_saved_listings"
  FOR INSERT WITH CHECK ("user_id" = (SELECT auth.uid()));

CREATE POLICY "marketplace_saved_listings: owner delete"
  ON "public"."marketplace_saved_listings"
  FOR DELETE USING ("user_id" = (SELECT auth.uid()));

-- Column grants, following 20260908120000: anon gets nothing here at all. There
-- is no anonymous surface for saves, and the default table grant would
-- otherwise hand one out.
REVOKE ALL ON TABLE "public"."marketplace_saved_listings" FROM "anon";
