-- Makes the entry-fee refund window real data instead of a hardcoded client
-- constant, and moves the default from 7 days to 15.
--
-- Before this, the only refund policy that existed was:
--
--   * `tournaments.cancellation_policy` -- free text, so nothing can evaluate
--     it, and
--   * a tier computed in the browser in web/src/app/dashboard/page.tsx:
--       daysUntil >= 7 ? "full" : daysUntil >= 3 ? "half" : "none"
--
-- The two disagreed with each other and with the intended policy, and the
-- number the user was shown was derived client-side and never recorded. A
-- refund amount decided in the browser cannot be the basis for moving money.
--
-- Policy as of 2026-08-24: a full entry fee is refundable when the player
-- cancels at least `refund_cutoff_days` before the event. Directors may set
-- their own window per tournament; 15 days is the platform default.
--
-- Hold My Spot deposits are NOT covered by this and remain non-refundable --
-- they are forfeited at hold_cutoff_days and count toward the entry fee.
-- Deliberately a separate column from hold_cutoff_days so the two policies
-- cannot drift into each other.

ALTER TABLE "public"."tournaments"
  ADD COLUMN IF NOT EXISTS "refund_cutoff_days" integer NOT NULL DEFAULT 15;

ALTER TABLE "public"."tournaments"
  ADD CONSTRAINT "tournaments_refund_cutoff_days_check"
  CHECK ("refund_cutoff_days" >= 0 AND "refund_cutoff_days" <= 365);

COMMENT ON COLUMN "public"."tournaments"."refund_cutoff_days" IS
  'Entry fee is fully refundable when a player cancels at least this many days before event_date. Director-configurable; platform default 15. Does NOT apply to Hold My Spot deposits, which are non-refundable (see hold_cutoff_days).';

-- Existing rows carry the old free-text policy describing a 7/3-day tiered
-- rule that no longer matches. Bring the stored text in line with the column
-- so the two cannot contradict each other on already-published tournaments.
-- Only rows still holding the old default are touched -- a director who wrote
-- their own policy keeps it.
UPDATE "public"."tournaments"
   SET "cancellation_policy" =
       'Full refund if cancelled 15 or more days before the event. No refund inside 15 days. Hold My Spot deposits are non-refundable and count toward your entry fee.'
 WHERE "cancellation_policy" =
       'Full refund if cancelled 7 or more days before the event. 50% refund if cancelled 3–6 days before. No refund within 72 hours of the event start.';

ALTER TABLE "public"."tournaments"
  ALTER COLUMN "cancellation_policy" SET DEFAULT
  'Full refund if cancelled 15 or more days before the event. No refund inside 15 days. Hold My Spot deposits are non-refundable and count toward your entry fee.';
