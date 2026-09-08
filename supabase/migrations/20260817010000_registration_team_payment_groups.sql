-- Per-player payment obligations for doubles/mixed team registrations.
--
-- Problem this closes: `registrations.partner_id` records WHO the partner is,
-- but carries no money state for them. Today the initiating player pays the
-- whole entry fee, one registrations row is created, and the partner is
-- implicitly "in" without ever having paid. There is no representation of
-- "I paid, my partner hasn't yet," and nothing that can hold a team back from
-- looking confirmed until everyone has paid.
--
-- Model
-- -----
--   registration_groups         — one row per team (tournament + division).
--   registration_group_members  — one row per PLAYER OBLIGATION in that team.
--
-- Each member row is an independent payment obligation with its own state
-- (invited / pending_payment / paid / declined / expired) and its own
-- amount_due_cents. The group is 'confirmed' only when every required member
-- has reached 'paid'.
--
-- Money-state rule (unchanged, inherited from 20260809140000_shared_payment_
-- foundation): a member only ever reaches 'paid' from the service role, i.e.
-- from web/src/lib/payments/finalizePayment.ts after a verified Stripe
-- webhook. Clients get no INSERT/UPDATE grant on either table; the only
-- client-callable mutation is decline_registration_group_invite(), which can
-- never move money.
--
-- Fee model: the entry fee is PER PLAYER (this is what the existing
-- create-tournament-entry-payment-intent already charges a single registrant
-- for a doubles division). Each member's amount_due_cents is therefore the
-- same server-resolved division/tournament entry fee, snapshotted onto the
-- member row at group creation so a later fee edit can't change what an
-- already-invited player owes.
--
-- Singles are untouched: no group is ever created for a division that does
-- not need a partner, and every existing singles/hold/balance path keeps
-- working unchanged.

-- ── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE "public"."registration_group_status" AS ENUM (
  'forming',          -- created; nobody has paid yet
  'pending_payment',  -- at least one member paid, not all
  'confirmed',        -- every required member paid
  'cancelled',        -- abandoned (partner declined / initiator withdrew)
  'expired'           -- an obligation lapsed before registration closed
);

CREATE TYPE "public"."registration_group_member_state" AS ENUM (
  'invited',
  'pending_payment',
  'paid',
  'declined',
  'expired'
);

CREATE TYPE "public"."registration_group_member_role" AS ENUM (
  'initiator',
  'partner'
);

-- ── registration_groups ──────────────────────────────────────────────────────

CREATE TABLE "public"."registration_groups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tournament_id" uuid NOT NULL REFERENCES "public"."tournaments"("id") ON DELETE CASCADE,
  "division_id" uuid NOT NULL REFERENCES "public"."divisions"("id") ON DELETE CASCADE,
  "created_by" uuid NOT NULL REFERENCES "public"."profiles"("id"),
  "status" "public"."registration_group_status" NOT NULL DEFAULT 'forming',
  -- How many paid members it takes to confirm. 2 for doubles/mixed today;
  -- the column exists so a future 3+/team format needs no migration here.
  "required_member_count" smallint NOT NULL DEFAULT 2 CHECK ("required_member_count" >= 2),
  -- Never past the tournament's registration close — a member who hasn't paid
  -- by then can no longer be registered at all.
  "expires_at" timestamptz,
  "confirmed_at" timestamptz,
  "cancelled_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "idx_registration_groups_tournament" ON "public"."registration_groups" ("tournament_id");
CREATE INDEX "idx_registration_groups_division" ON "public"."registration_groups" ("division_id");
CREATE INDEX "idx_registration_groups_created_by" ON "public"."registration_groups" ("created_by");

COMMENT ON TABLE "public"."registration_groups" IS
  'One doubles/mixed team. Reaches "confirmed" only when every registration_group_members row has reached "paid" — a single member paying never confirms the team.';

CREATE OR REPLACE TRIGGER "trg_registration_groups_updated_at"
  BEFORE UPDATE ON "public"."registration_groups"
  FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();

-- ── registration_group_members ───────────────────────────────────────────────

CREATE TABLE "public"."registration_group_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "group_id" uuid NOT NULL REFERENCES "public"."registration_groups"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "public"."profiles"("id"),
  "role" "public"."registration_group_member_role" NOT NULL,
  "payment_state" "public"."registration_group_member_state" NOT NULL DEFAULT 'invited',
  -- Snapshotted at invite time; a later division fee edit must not change what
  -- an already-invited player owes.
  "amount_due_cents" integer NOT NULL CHECK ("amount_due_cents" >= 0),
  "amount_paid_cents" integer NOT NULL DEFAULT 0 CHECK ("amount_paid_cents" >= 0),
  -- The member's own registrations row, created when THEY pay (not when
  -- their partner does).
  "registration_id" uuid REFERENCES "public"."registrations"("id") ON DELETE SET NULL,
  -- The payments row that settled this obligation.
  "payment_id" uuid REFERENCES "public"."payments"("id"),
  "expires_at" timestamptz,
  "invited_at" timestamptz NOT NULL DEFAULT now(),
  "paid_at" timestamptz,
  "declined_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "uq_registration_group_member" UNIQUE ("group_id", "user_id")
);

CREATE INDEX "idx_registration_group_members_group" ON "public"."registration_group_members" ("group_id");
CREATE INDEX "idx_registration_group_members_user" ON "public"."registration_group_members" ("user_id");
CREATE INDEX "idx_registration_group_members_registration" ON "public"."registration_group_members" ("registration_id");
CREATE INDEX "idx_registration_group_members_payment" ON "public"."registration_group_members" ("payment_id");
-- Open obligations the invite sweeper has to look at.
CREATE INDEX "idx_registration_group_members_open" ON "public"."registration_group_members" ("expires_at")
  WHERE "payment_state" IN ('invited', 'pending_payment');

COMMENT ON TABLE "public"."registration_group_members" IS
  'One player''s individual payment obligation inside a team. payment_state only ever reaches "paid" via mark_registration_group_member_paid(), which is service-role only (Stripe webhook finalization).';

CREATE OR REPLACE TRIGGER "trg_registration_group_members_updated_at"
  BEFORE UPDATE ON "public"."registration_group_members"
  FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();

-- ── registrations back-pointer ───────────────────────────────────────────────
-- Nullable and unset for every singles registration and every pre-existing
-- row, so nothing about the current flows changes.

ALTER TABLE "public"."registrations"
  ADD COLUMN "registration_group_id" uuid REFERENCES "public"."registration_groups"("id") ON DELETE SET NULL;

CREATE INDEX "idx_registrations_group" ON "public"."registrations" ("registration_group_id");

COMMENT ON COLUMN "public"."registrations"."registration_group_id" IS
  'Set only for doubles/mixed registrations created through a registration_groups team. NULL for singles and for every registration predating team payment groups.';

-- ── Access helpers ───────────────────────────────────────────────────────────
-- SECURITY DEFINER so the RLS policies below can ask "is the caller in this
-- group?" without the policy on one table re-triggering the policy on the
-- other (the recursion class of bug fixed in
-- 20260809163251_booking_engine_phase2_rls_recursion_fix).

CREATE OR REPLACE FUNCTION "public"."is_registration_group_member"("p_group_id" uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET "search_path" TO 'public', 'pg_temp'
  AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.registration_group_members m
     WHERE m.group_id = p_group_id
       AND m.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION "public"."is_registration_group_director"("p_group_id" uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET "search_path" TO 'public', 'pg_temp'
  AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.registration_groups g
      JOIN public.tournaments t ON t.id = g.tournament_id
     WHERE g.id = p_group_id
       AND t.director_id = auth.uid()
  );
$$;

REVOKE EXECUTE ON FUNCTION "public"."is_registration_group_member"(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "public"."is_registration_group_director"(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."is_registration_group_member"(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION "public"."is_registration_group_director"(uuid) TO authenticated;

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Read-only for clients. Every write goes through the service role (webhook
-- finalization) or the one SECURITY DEFINER decline RPC below.

ALTER TABLE "public"."registration_groups" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "registration_groups: member read" ON "public"."registration_groups"
  FOR SELECT USING ("public"."is_registration_group_member"("id"));

CREATE POLICY "registration_groups: director read own tournament" ON "public"."registration_groups"
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM "public"."tournaments" t
     WHERE t."id" = "registration_groups"."tournament_id"
       AND t."director_id" = (SELECT auth.uid())
  ));

CREATE POLICY "registration_groups: admin full access" ON "public"."registration_groups"
  USING ("public"."is_admin"());

ALTER TABLE "public"."registration_group_members" ENABLE ROW LEVEL SECURITY;

-- A member sees their own obligation AND their teammates' — showing "partner
-- payment pending" is the entire point of this feature.
CREATE POLICY "registration_group_members: teammate read" ON "public"."registration_group_members"
  FOR SELECT USING ("public"."is_registration_group_member"("group_id"));

CREATE POLICY "registration_group_members: director read own tournament" ON "public"."registration_group_members"
  FOR SELECT USING ("public"."is_registration_group_director"("group_id"));

CREATE POLICY "registration_group_members: admin full access" ON "public"."registration_group_members"
  USING ("public"."is_admin"());

-- Deliberately no INSERT/UPDATE/DELETE policy for "authenticated" on either
-- table — same rule as public.payments.

-- ── Group status derivation ──────────────────────────────────────────────────
-- The group's status is never set by hand from a payment path; it is derived
-- from its members every time a member row changes. That makes "team is
-- confirmed" a single, non-forgeable consequence of "every member paid".

CREATE OR REPLACE FUNCTION "public"."fn_sync_registration_group_status"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET "search_path" TO 'public', 'pg_temp'
  AS $$
DECLARE
  v_group_id uuid := COALESCE(NEW.group_id, OLD.group_id);
  v_required smallint;
  v_current  public.registration_group_status;
  v_paid     integer;
  v_dead     integer;
  v_next     public.registration_group_status;
BEGIN
  SELECT g.required_member_count, g.status INTO v_required, v_current
    FROM public.registration_groups g WHERE g.id = v_group_id
    FOR UPDATE;

  IF v_required IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- A group explicitly cancelled stays cancelled; member rows can't revive it.
  IF v_current = 'cancelled' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT
    count(*) FILTER (WHERE m.payment_state = 'paid'),
    count(*) FILTER (WHERE m.payment_state IN ('declined', 'expired'))
    INTO v_paid, v_dead
    FROM public.registration_group_members m
   WHERE m.group_id = v_group_id;

  IF v_paid >= v_required THEN
    v_next := 'confirmed';
  ELSIF v_dead > 0 THEN
    -- Someone dropped out. The team cannot confirm as-is; it is not
    -- 'cancelled' because the initiator may still have paid and may pick a
    -- replacement partner.
    v_next := 'expired';
  ELSIF v_paid > 0 THEN
    v_next := 'pending_payment';
  ELSE
    v_next := 'forming';
  END IF;

  UPDATE public.registration_groups
     SET status       = v_next,
         confirmed_at = CASE WHEN v_next = 'confirmed' THEN COALESCE(confirmed_at, now()) ELSE NULL END,
         updated_at   = now()
   WHERE id = v_group_id
     AND status IS DISTINCT FROM v_next;

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION "public"."fn_sync_registration_group_status" IS
  'Derives registration_groups.status from its member obligations. "confirmed" is reachable only when required_member_count members are "paid".';

CREATE TRIGGER "trg_sync_registration_group_status"
  AFTER INSERT OR UPDATE OR DELETE ON "public"."registration_group_members"
  FOR EACH ROW EXECUTE FUNCTION "public"."fn_sync_registration_group_status"();

-- ── ensure_registration_group() ──────────────────────────────────────────────
-- Called by the entry-point edge function (service role) BEFORE any money
-- moves: it creates, or returns, the team and its two obligations. Idempotent
-- on (tournament, division, initiator) so a retried checkout reuses the same
-- group instead of stacking duplicates.

CREATE OR REPLACE FUNCTION "public"."ensure_registration_group"(
  "p_tournament_id" uuid,
  "p_division_id" uuid,
  "p_initiator_id" uuid,
  "p_partner_id" uuid,
  "p_amount_due_cents" integer,
  "p_expires_at" timestamptz DEFAULT NULL
) RETURNS TABLE (
  "group_id" uuid,
  "initiator_member_id" uuid,
  "partner_member_id" uuid
)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET "search_path" TO 'public', 'pg_temp'
  AS $$
DECLARE
  v_group_id uuid;
  v_initiator_member_id uuid;
  v_partner_member_id uuid;
BEGIN
  IF p_initiator_id = p_partner_id THEN
    RAISE EXCEPTION 'a player cannot be their own partner';
  END IF;

  -- Reuse an existing, still-live group for this initiator + division rather
  -- than creating a second one on a retried or resumed checkout.
  SELECT g.id INTO v_group_id
    FROM public.registration_groups g
    JOIN public.registration_group_members m
      ON m.group_id = g.id AND m.user_id = p_initiator_id AND m.role = 'initiator'
   WHERE g.tournament_id = p_tournament_id
     AND g.division_id = p_division_id
     AND g.status IN ('forming', 'pending_payment', 'confirmed')
   ORDER BY g.created_at DESC
   LIMIT 1;

  IF v_group_id IS NULL THEN
    INSERT INTO public.registration_groups (tournament_id, division_id, created_by, expires_at)
    VALUES (p_tournament_id, p_division_id, p_initiator_id, p_expires_at)
    RETURNING id INTO v_group_id;
  END IF;

  INSERT INTO public.registration_group_members (group_id, user_id, role, payment_state, amount_due_cents, expires_at)
  VALUES (v_group_id, p_initiator_id, 'initiator', 'pending_payment', p_amount_due_cents, p_expires_at)
  ON CONFLICT ("group_id", "user_id") DO UPDATE
    -- Never downgrade an already-settled obligation.
    SET payment_state = CASE WHEN registration_group_members.payment_state = 'paid'
                             THEN registration_group_members.payment_state
                             ELSE 'pending_payment'::public.registration_group_member_state END
  RETURNING id INTO v_initiator_member_id;

  INSERT INTO public.registration_group_members (group_id, user_id, role, payment_state, amount_due_cents, expires_at)
  VALUES (v_group_id, p_partner_id, 'partner', 'invited', p_amount_due_cents, p_expires_at)
  ON CONFLICT ("group_id", "user_id") DO UPDATE
    SET payment_state = CASE WHEN registration_group_members.payment_state IN ('paid', 'pending_payment')
                             THEN registration_group_members.payment_state
                             ELSE 'invited'::public.registration_group_member_state END,
        declined_at = NULL
  RETURNING id INTO v_partner_member_id;

  -- Let the partner know they owe an entry fee. Mirrors fn_notify_registration,
  -- deduped on the notifications idempotency key so a retried checkout doesn't
  -- notify twice.
  INSERT INTO public.notifications (user_id, type, title, body, link, idempotency_key)
  SELECT p_partner_id, 'registration_partner_invite', 'Partner entry fee due',
         'You''ve been added as a partner for "' || t.name || '". Your entry fee is still due.',
         '/my-tournaments',
         'partner_invite:' || v_group_id::text || ':' || p_partner_id::text
    FROM public.tournaments t
   WHERE t.id = p_tournament_id
  -- uq_notifications_idempotency_key is partial, so its predicate has to be
  -- restated here for index inference to match it.
  ON CONFLICT ("idempotency_key") WHERE "idempotency_key" IS NOT NULL DO NOTHING;

  RETURN QUERY SELECT v_group_id, v_initiator_member_id, v_partner_member_id;
END;
$$;

COMMENT ON FUNCTION "public"."ensure_registration_group" IS
  'Service-role only. Creates/returns a doubles team and its per-player obligations. Creates no payment and never marks anyone paid.';

REVOKE EXECUTE ON FUNCTION "public"."ensure_registration_group"(uuid, uuid, uuid, uuid, integer, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "public"."ensure_registration_group"(uuid, uuid, uuid, uuid, integer, timestamptz) FROM authenticated;
REVOKE EXECUTE ON FUNCTION "public"."ensure_registration_group"(uuid, uuid, uuid, uuid, integer, timestamptz) FROM anon;

-- ── mark_registration_group_member_paid() ────────────────────────────────────
-- The ONLY path to payment_state = 'paid'. Called from
-- web/src/lib/payments/finalizePayment.ts with the service client, after a
-- verified Stripe webhook. Fully idempotent: a redelivered event for an
-- already-paid member returns the same registration id and changes nothing.

CREATE OR REPLACE FUNCTION "public"."mark_registration_group_member_paid"(
  "p_member_id" uuid,
  "p_payment_id" uuid,
  "p_amount_cents" integer,
  "p_stripe_intent_id" text DEFAULT NULL
) RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET "search_path" TO 'public', 'pg_temp'
  AS $$
DECLARE
  v_member public.registration_group_members%ROWTYPE;
  v_group  public.registration_groups%ROWTYPE;
  v_partner_user_id uuid;
  v_registration_id uuid;
BEGIN
  SELECT * INTO v_member FROM public.registration_group_members WHERE id = p_member_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'registration_group_members row % not found', p_member_id;
  END IF;

  -- Idempotency: already settled, nothing to do.
  IF v_member.payment_state = 'paid' THEN
    RETURN v_member.registration_id;
  END IF;

  SELECT * INTO v_group FROM public.registration_groups WHERE id = v_member.group_id FOR UPDATE;

  SELECT m.user_id INTO v_partner_user_id
    FROM public.registration_group_members m
   WHERE m.group_id = v_member.group_id
     AND m.id <> v_member.id
   ORDER BY m.role
   LIMIT 1;

  -- The payer's OWN registrations row. Their teammate's row is created by
  -- their own payment, separately — one payment never registers two players.
  -- Looked up by (tournament, player) rather than including the division
  -- because fn_enforce_single_division allows a player only one registration
  -- per tournament regardless of division.
  SELECT r.id INTO v_registration_id
    FROM public.registrations r
   WHERE r.tournament_id = v_group.tournament_id
     AND r.player_id = v_member.user_id
   LIMIT 1;

  IF v_registration_id IS NULL THEN
    -- The insert can still be refused by fn_enforce_registration_close (the
    -- tournament closed or was cancelled while PaymentSheet was open). The
    -- payment is real either way, so the obligation below is still recorded
    -- as paid with a NULL registration_id — visible for manual review/refund
    -- — rather than aborting the webhook and losing the record entirely.
    -- Refund automation is out of scope, same as finalizeReservationPayment.
    BEGIN
      INSERT INTO public.registrations (
        tournament_id, division_id, player_id, partner_id, status,
        hold_fee_paid_cents, entry_fee_paid_cents, stripe_entry_intent_id,
        needs_partner, director_added, registration_group_id
      ) VALUES (
        v_group.tournament_id, v_group.division_id, v_member.user_id, v_partner_user_id, 'registered',
        0, p_amount_cents, p_stripe_intent_id,
        true, false, v_group.id
      )
      RETURNING id INTO v_registration_id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'mark_registration_group_member_paid: could not create registration for member % (group %): %',
        p_member_id, v_group.id, SQLERRM;
      v_registration_id := NULL;
    END;
  ELSE
    -- Pre-existing row (e.g. this member converted a paid hold): keep its
    -- money columns, just attach it to the team.
    UPDATE public.registrations
       SET registration_group_id = v_group.id,
           partner_id = COALESCE(partner_id, v_partner_user_id),
           needs_partner = true,
           updated_at = now()
     WHERE id = v_registration_id;
  END IF;

  UPDATE public.registration_group_members
     SET payment_state = 'paid',
         amount_paid_cents = p_amount_cents,
         payment_id = p_payment_id,
         registration_id = v_registration_id,
         paid_at = now(),
         updated_at = now()
   WHERE id = p_member_id;

  RETURN v_registration_id;
END;
$$;

COMMENT ON FUNCTION "public"."mark_registration_group_member_paid" IS
  'Service-role only, idempotent. Settles ONE player''s obligation and creates that player''s own registrations row. Team confirmation is derived by trg_sync_registration_group_status, never asserted here.';

REVOKE EXECUTE ON FUNCTION "public"."mark_registration_group_member_paid"(uuid, uuid, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "public"."mark_registration_group_member_paid"(uuid, uuid, integer, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION "public"."mark_registration_group_member_paid"(uuid, uuid, integer, text) FROM anon;

-- ── decline_registration_group_invite() ──────────────────────────────────────
-- The one client-callable mutation. Can only ever move the CALLER's own
-- unpaid obligation to 'declined' — it cannot touch money, another player's
-- row, or an already-paid obligation.

CREATE OR REPLACE FUNCTION "public"."decline_registration_group_invite"("p_group_id" uuid)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET "search_path" TO 'public', 'pg_temp'
  AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.registration_group_members
     SET payment_state = 'declined',
         declined_at = now(),
         updated_at = now()
   WHERE group_id = p_group_id
     AND user_id = auth.uid()
     AND payment_state IN ('invited', 'pending_payment');

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

COMMENT ON FUNCTION "public"."decline_registration_group_invite" IS
  'Caller declines their own unpaid team invite. Never touches a paid obligation or another player''s row.';

REVOKE EXECUTE ON FUNCTION "public"."decline_registration_group_invite"(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."decline_registration_group_invite"(uuid) TO authenticated;

-- ── expire_registration_group_invites() ──────────────────────────────────────
-- Sweeper. An obligation past its expiry (which is capped at the tournament's
-- registration close by the edge function that sets it) can no longer be
-- paid, so it is marked 'expired' and the group falls out of 'confirmed'
-- eligibility. Paid obligations are never touched — refunds are out of scope.

CREATE OR REPLACE FUNCTION "public"."expire_registration_group_invites"()
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET "search_path" TO 'public', 'pg_temp'
  AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.registration_group_members
     SET payment_state = 'expired',
         updated_at = now()
   WHERE payment_state IN ('invited', 'pending_payment')
     AND expires_at IS NOT NULL
     AND expires_at < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION "public"."expire_registration_group_invites"() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "public"."expire_registration_group_invites"() FROM authenticated;
REVOKE EXECUTE ON FUNCTION "public"."expire_registration_group_invites"() FROM anon;

-- Scheduled the same way as the waitlist sweeper
-- (20260807020000_schedule_waitlist_sweeper), but as plain SQL rather than an
-- HTTP call since the whole job is one statement. Guarded so the migration
-- still applies on an environment without pg_cron.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('expire-registration-group-invites');
    EXCEPTION WHEN OTHERS THEN
      NULL; -- not scheduled yet
    END;
    PERFORM cron.schedule(
      'expire-registration-group-invites',
      '*/15 * * * *',
      $cron$ SELECT public.expire_registration_group_invites(); $cron$
    );
  END IF;
END;
$$;
