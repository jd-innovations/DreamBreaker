-- Advisor-flagged missing covering indexes on Phase 3 foreign keys.
CREATE INDEX "idx_coach_offer_purchases_facility" ON "public"."coach_offer_purchases" ("facility_id");
CREATE INDEX "idx_coach_offer_purchase_ledger_events_created_by" ON "public"."coach_offer_purchase_ledger_events" ("created_by");
