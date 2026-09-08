-- Coach Marketplace V1 — Phase 1: platform config + coach activation +
-- shared Stripe Connect readiness abstraction.
--
-- Per COACH_MARKETPLACE_V1_SPEC.md and the phased implementation plan.
-- Explicitly NOT in this migration: coach offers, purchases, wallet
-- vouchers, redemption, payouts, disputes, reviews, boosts. Those are later
-- phases.
--
-- Stripe external validation is deferred (see project direction 2026-08-09):
-- this migration builds the coach activation state machine and a readiness
-- abstraction that supports a development-only 'test_ready' status, without
-- requiring real Stripe Connect onboarding to keep building on top of it.
-- coach_status = 'active' still means "real, Stripe-confirmed" — nothing
-- here fabricates that. 'test_ready' can only ever be set by the dev-only,
-- NODE_ENV-gated fixture route (web/src/app/api/dev/set-coach-test-ready),
-- which refuses to run when NODE_ENV=production — so a production database
-- can never contain a 'test_ready' row, and is_coach_publish_ready() below
-- does not need to independently detect environment.

-- ── platform_settings: Coach Marketplace business parameters ────────────────
-- Per spec §49. Values are seed defaults, all admin-editable afterward via
-- the existing platform_settings surface. ON CONFLICT DO NOTHING makes this
-- safe to re-run and safe if an admin already touched a key.

INSERT INTO "public"."platform_settings" ("key", "value", "value_type", "label", "description", "options", "unit", "sort_order")
VALUES
  ('coach_marketplace_min_discount_pct', '20', 'number', 'Coach Marketplace: Minimum Discount', 'Minimum required discount off regular price for a coach offer to publish', NULL, '%', 100),
  ('coach_marketplace_base_commission_pct', '18', 'number', 'Coach Marketplace: Base Commission', 'Default platform commission on coach offer purchases (per-coach/per-offer overrides may apply)', NULL, '%', 101),
  ('coach_marketplace_boost_commission_pct', '7', 'number', 'Coach Marketplace: Boost Commission Add-On', 'Additional commission percentage applied to boost-attributed purchases, on top of base commission', NULL, '%', 102),
  ('coach_marketplace_buyer_service_fee_mode', 'disabled', 'select', 'Coach Marketplace: Buyer Service Fee', 'Whether a buyer-facing service fee is charged at checkout', '{disabled,fixed,percentage}', NULL, 103),
  ('coach_marketplace_buyer_service_fee_amount', '0', 'number', 'Coach Marketplace: Buyer Service Fee Amount', 'Fixed-cents or percentage value, interpreted per coach_marketplace_buyer_service_fee_mode', NULL, NULL, 104),
  ('coach_marketplace_voucher_expiration_days', '180', 'number', 'Coach Marketplace: Voucher Expiration', 'Days after purchase a voucher expires, unless admin-overridden per offer', NULL, 'days', 105),
  ('coach_marketplace_min_voucher_validity_days', '180', 'number', 'Coach Marketplace: Minimum Voucher Validity', 'Floor on voucher validity — expiration policy may not be set shorter than this', NULL, 'days', 106),
  ('coach_marketplace_settlement_hold_hours', '48', 'number', 'Coach Marketplace: Settlement Hold', 'Hours a redeemed lesson''s earnings sit in settlement hold before becoming payout-eligible', NULL, 'hours', 107),
  ('coach_marketplace_payout_weekday', 'monday', 'select', 'Coach Marketplace: Payout Day', 'Weekday weekly coach payouts run', '{monday,tuesday,wednesday,thursday,friday,saturday,sunday}', NULL, 108),
  ('coach_marketplace_reminder_days', '30,15,7,3,1', 'text', 'Coach Marketplace: Expiration Reminder Days', 'Comma-separated days-before-expiration to send voucher expiration reminders', NULL, NULL, 109),
  ('coach_marketplace_no_show_penalty_pct', '0', 'number', 'Coach Marketplace: No-Show Penalty', 'Penalty percentage applied to a coach for an approved no-show/cancellation dispute', NULL, '%', 110),
  ('coach_marketplace_risk_refund_rate_threshold_pct', '20', 'number', 'Coach Marketplace: Risk Threshold — Refund Rate', 'Refund rate percentage above which a coach is flagged for internal review', NULL, '%', 111)
ON CONFLICT ("key") DO NOTHING;

-- ── Coach activation state machine ───────────────────────────────────────────

CREATE TYPE "public"."coach_status" AS ENUM (
  'inactive',
  'onboarding',
  'active',
  'restricted',
  'test_ready'
);

ALTER TABLE "public"."profiles"
  ADD COLUMN "is_coach" boolean NOT NULL DEFAULT false,
  ADD COLUMN "coach_status" "public"."coach_status" NOT NULL DEFAULT 'inactive';

COMMENT ON COLUMN "public"."profiles"."coach_status" IS
  'active = real, Stripe-Connect-confirmed payout-capable coach. test_ready = development/test fixture only, settable exclusively via the NODE_ENV-gated dev route — never producible in a production database. restricted = was active, Stripe capability since restricted.';

-- Protect coach_status from client self-escalation, mirroring
-- fn_protect_registration_payment_fields (20260809140000). A client may
-- flip is_coach true and move coach_status 'inactive' -> 'onboarding'
-- (self-service activation) — nothing else. 'active' only ever comes from a
-- confirmed Stripe Connect webhook (service role); 'test_ready' only from
-- the dev-only fixture route (service role); 'restricted' only from the
-- Connect capability-change webhook (service role).

CREATE OR REPLACE FUNCTION "public"."fn_protect_coach_status_transitions"()
  RETURNS trigger
  LANGUAGE plpgsql
  SET "search_path" TO 'public', 'pg_temp'
  AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.coach_status IS DISTINCT FROM OLD.coach_status THEN
    IF NOT (OLD.coach_status = 'inactive' AND NEW.coach_status = 'onboarding') THEN
      RAISE EXCEPTION 'coach_status may only be set to onboarding by the account owner; other transitions require Stripe Connect confirmation or an explicit dev fixture';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION "public"."fn_protect_coach_status_transitions" IS
  'Blocks client self-escalation of coach_status beyond inactive->onboarding. Coach Marketplace V1 Phase 1.';

CREATE TRIGGER "trg_protect_coach_status_transitions"
  BEFORE UPDATE ON "public"."profiles"
  FOR EACH ROW EXECUTE FUNCTION "public"."fn_protect_coach_status_transitions"();

-- ── Readiness abstraction ────────────────────────────────────────────────────
-- Single source of truth for "is this coach allowed to publish/operate,"
-- consumed by Phase 2 (offer publish eligibility) and later phases. Treats
-- 'test_ready' as sufficient — safe because, per the comment above, that
-- status is structurally unreachable in a production database.

CREATE OR REPLACE FUNCTION "public"."is_coach_publish_ready"("p_user_id" uuid)
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET "search_path" TO 'public', 'pg_temp'
  AS $$
  SELECT COALESCE(
    (SELECT coach_status IN ('active', 'test_ready') FROM public.profiles WHERE id = p_user_id),
    false
  );
$$;

COMMENT ON FUNCTION "public"."is_coach_publish_ready" IS
  'True for a real Stripe-Connect-confirmed coach (active) or a dev/test fixture coach (test_ready — unreachable in production, see coach_status column comment). Coach Marketplace readiness abstraction, Phase 1.';
