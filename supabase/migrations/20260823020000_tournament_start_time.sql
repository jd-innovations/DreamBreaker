-- ─────────────────────────────────────────────────────────────────────────────
-- Give tournaments a start time.
--
-- tournaments.event_date is a bare `date`, and no other column carried a start
-- time — the only timestamps were the registration and check-in windows, and
-- checkin_opens_at was populated on 1 of 9 rows, so it was never a usable
-- stand-in. Community play events have a real datetime, which is why their
-- cards can show "6:30 PM" and tournament cards could not.
--
-- `time` rather than a second timestamptz: the day already lives in event_date,
-- and a full timestamp duplicates it, leaving two columns that can disagree
-- about which day the tournament is on. Clients combine event_date + start_time
-- at render.
--
-- Nullable, with no backfill. Existing tournaments genuinely have no recorded
-- start time; inventing one (08:00) would put a specific, wrong promise in
-- front of players on real published events. Cards render no time row when it
-- is null, exactly as they do today.
--
-- Note for multi-day tournaments: one start time is a simplification. Per-day
-- and per-division times belong to the session model the Phase 0 audit lists
-- as MISSING; this column is the single-day answer, not that.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "public"."tournaments"
  ADD COLUMN IF NOT EXISTS "start_time" time;

COMMENT ON COLUMN "public"."tournaments"."start_time" IS
  'Local start time on event_date. Null when the director did not set one. Not timezone-aware: the venue''s local wall-clock time is what directors and players mean here.';
