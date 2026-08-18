-- Booking Engine V1 -- Phase 2: reservation core + player booking UX (data layer).
--
-- Per the approved Phase 2 plan, this migration adds:
--   - flash_deals: per-asset, time-windowed discount (court | ball_machine only).
--   - reservations: the core booking-slot row, with an EXCLUDE USING gist
--     constraint preventing overlapping reservations on the same asset
--     (requires btree_gist for the asset_type/asset_id equality terms).
--   - reservation_players: registered-users-only roster (no guest rows).
--   - reservation_invites: copies the play_event_invites shape, organizer-only
--     invite sending (this app's "Find Players" is explicitly organizer-driven,
--     not auto-invite).
--   - RPCs modeled directly on join_play_event() (baseline migration,
--     ~line 2165): lock, check, count, insert, named exceptions.
--
-- Explicitly NOT in this migration: Stripe/real payment capture (confirm_reservation
-- just flips status, no charge), QR check-in, push notifications, tax/service-fee
-- calculation, a facility-side "Create Flash Deal" admin screen, and any
-- server-side hold-expiry sweep (client-side countdown only this phase).

-- ── extension ────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "btree_gist" WITH SCHEMA "extensions";

-- ── flash_deals ──────────────────────────────────────────────────────────
-- Reuses facility_asset_owner_type from Phase 1 (restricted to court/ball_machine
-- via CHECK, same convention as asset_photos_owner_type_check).

CREATE TABLE "public"."flash_deals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_type" "public"."facility_asset_owner_type" NOT NULL,
  "owner_id" uuid NOT NULL,
  "discount_percent" smallint NOT NULL,
  "starts_at" timestamptz NOT NULL,
  "ends_at" timestamptz NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_by" uuid REFERENCES "public"."profiles"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "flash_deals_owner_type_check" CHECK ("owner_type" IN ('court', 'ball_machine')),
  CONSTRAINT "flash_deals_discount_range" CHECK ("discount_percent" BETWEEN 1 AND 90),
  CONSTRAINT "flash_deals_window_valid" CHECK ("ends_at" > "starts_at")
);

CREATE INDEX "idx_flash_deals_owner_window" ON "public"."flash_deals" ("owner_type", "owner_id", "starts_at", "ends_at") WHERE "is_active" = true;

CREATE OR REPLACE TRIGGER "trg_flash_deals_updated_at"
  BEFORE UPDATE ON "public"."flash_deals"
  FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();

ALTER TABLE "public"."flash_deals" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flash_deals: admin full access" ON "public"."flash_deals"
  USING ("public"."is_admin"());

CREATE POLICY "flash_deals: public read active" ON "public"."flash_deals"
  FOR SELECT USING ("is_active" = true);

CREATE POLICY "flash_deals: manager insert" ON "public"."flash_deals"
  FOR INSERT WITH CHECK (
    "public"."is_facility_role_at_least"("public"."facility_id_for_owner"("owner_type", "owner_id"), (SELECT auth.uid()), 'manager')
    AND ("created_by" IS NULL OR "created_by" = (SELECT auth.uid()))
  );

CREATE POLICY "flash_deals: manager update" ON "public"."flash_deals"
  FOR UPDATE
  USING ("public"."is_facility_role_at_least"("public"."facility_id_for_owner"("owner_type", "owner_id"), (SELECT auth.uid()), 'manager'))
  WITH CHECK ("public"."is_facility_role_at_least"("public"."facility_id_for_owner"("owner_type", "owner_id"), (SELECT auth.uid()), 'manager'));

CREATE POLICY "flash_deals: manager delete" ON "public"."flash_deals"
  FOR DELETE USING ("public"."is_facility_role_at_least"("public"."facility_id_for_owner"("owner_type", "owner_id"), (SELECT auth.uid()), 'manager'));

-- ── price helpers ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION "public"."reservation_asset_hourly_rate_cents"(
    "p_asset_type" "public"."facility_asset_owner_type", "p_asset_id" uuid
  )
  RETURNS integer
  LANGUAGE "sql" STABLE SECURITY DEFINER
  SET "search_path" TO 'public'
  AS $$
  SELECT CASE p_asset_type
    WHEN 'court' THEN (SELECT hourly_rate_cents FROM public.courts WHERE id = p_asset_id)
    WHEN 'ball_machine' THEN (SELECT hourly_rate_cents FROM public.ball_machines WHERE id = p_asset_id)
  END;
$$;

CREATE OR REPLACE FUNCTION "public"."reservation_best_flash_deal_percent"(
    "p_asset_type" "public"."facility_asset_owner_type", "p_asset_id" uuid, "p_at" timestamptz
  )
  RETURNS smallint
  LANGUAGE "sql" STABLE SECURITY DEFINER
  SET "search_path" TO 'public'
  AS $$
  SELECT max(discount_percent) FROM public.flash_deals
   WHERE owner_type = p_asset_type AND owner_id = p_asset_id
     AND is_active = true AND p_at >= starts_at AND p_at < ends_at;
$$;

-- ── reservations ─────────────────────────────────────────────────────────

CREATE TYPE "public"."reservation_status" AS ENUM ('held', 'confirmed', 'cancelled', 'expired');
CREATE TYPE "public"."reservation_game_format" AS ENUM ('singles', 'doubles');

CREATE TABLE "public"."reservations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "facility_id" uuid NOT NULL REFERENCES "public"."facilities"("id") ON DELETE CASCADE,
  "asset_type" "public"."facility_asset_owner_type" NOT NULL,
  "asset_id" uuid NOT NULL,
  "organizer_id" uuid NOT NULL REFERENCES "public"."profiles"("id"),
  "game_format" "public"."reservation_game_format",
  "max_players" smallint NOT NULL,
  "time_range" tstzrange NOT NULL,
  "status" "public"."reservation_status" NOT NULL DEFAULT 'held',
  "hold_expires_at" timestamptz,
  "base_price_cents" integer NOT NULL,
  "flash_deal_discount_percent" smallint,
  "final_price_cents" integer NOT NULL,
  "flash_deal_id" uuid REFERENCES "public"."flash_deals"("id"),
  "confirmed_at" timestamptz,
  "cancelled_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "reservations_asset_type_check" CHECK ("asset_type" IN ('court', 'ball_machine')),
  CONSTRAINT "reservations_capacity_check" CHECK (
    ("asset_type" = 'ball_machine' AND "game_format" IS NULL AND "max_players" = 1)
    OR ("asset_type" = 'court' AND (
      ("game_format" = 'singles' AND "max_players" = 2)
      OR ("game_format" = 'doubles' AND "max_players" = 4)
    ))
  ),
  CONSTRAINT "reservations_duration_check" CHECK (
    upper("time_range") > lower("time_range")
    AND upper("time_range") - lower("time_range") <= interval '4 hours'
    AND upper("time_range") - lower("time_range") >= interval '15 minutes'
  ),
  CONSTRAINT "reservations_price_nonneg" CHECK ("base_price_cents" >= 0 AND "final_price_cents" >= 0),
  CONSTRAINT "reservations_hold_expiry_required" CHECK (
    "status" <> 'held' OR "hold_expires_at" IS NOT NULL
  ),
  -- Overlap prevention: one non-cancelled/non-expired reservation per asset
  -- per overlapping time window. Requires btree_gist for the asset_type/
  -- asset_id equality terms alongside the range term.
  CONSTRAINT "reservations_no_overlap" EXCLUDE USING gist (
    "asset_type" WITH =,
    "asset_id" WITH =,
    "time_range" WITH &&
  ) WHERE ("status" IN ('held', 'confirmed'))
);

CREATE INDEX "idx_reservations_facility" ON "public"."reservations" ("facility_id", "time_range");
CREATE INDEX "idx_reservations_asset" ON "public"."reservations" ("asset_type", "asset_id", "time_range");
CREATE INDEX "idx_reservations_organizer" ON "public"."reservations" ("organizer_id");
CREATE INDEX "idx_reservations_hold_expiry" ON "public"."reservations" ("hold_expires_at") WHERE "status" = 'held';

CREATE OR REPLACE TRIGGER "trg_reservations_updated_at"
  BEFORE UPDATE ON "public"."reservations"
  FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();

COMMENT ON TABLE "public"."reservations" IS
  'Core booking-slot row. base_price_cents/flash_deal_discount_percent/final_price_cents are snapshotted at creation time and never recomputed, so editing or expiring a Flash Deal later never changes a past booking price. facility_id is denormalized and set server-side by create_reservation() only -- never trust a client-supplied value.';

-- ── reservation_players ──────────────────────────────────────────────────
-- Registered-users-only roster (no guest/unclaimed-email rows like play_participants).

CREATE TABLE "public"."reservation_players" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "reservation_id" uuid NOT NULL REFERENCES "public"."reservations"("id") ON DELETE CASCADE,
  "profile_id" uuid NOT NULL REFERENCES "public"."profiles"("id"),
  "is_organizer" boolean NOT NULL DEFAULT false,
  "joined_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "reservation_players_unique" UNIQUE ("reservation_id", "profile_id")
);

CREATE INDEX "idx_reservation_players_reservation" ON "public"."reservation_players" ("reservation_id");
CREATE INDEX "idx_reservation_players_profile" ON "public"."reservation_players" ("profile_id");

-- ── reservation_invites ──────────────────────────────────────────────────
-- Shape copied from play_event_invites. Organizer-only sending (not
-- "any joined participant") -- Find Players is an explicit organizer action.

CREATE TABLE "public"."reservation_invites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "reservation_id" uuid NOT NULL REFERENCES "public"."reservations"("id") ON DELETE CASCADE,
  "inviter_id" uuid NOT NULL REFERENCES "public"."profiles"("id") ON DELETE CASCADE,
  "invitee_id" uuid NOT NULL REFERENCES "public"."profiles"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'pending',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "responded_at" timestamptz,
  CONSTRAINT "reservation_invites_no_self_invite" CHECK ("inviter_id" <> "invitee_id"),
  CONSTRAINT "reservation_invites_status_check" CHECK ("status" IN ('pending', 'accepted', 'declined', 'cancelled')),
  CONSTRAINT "reservation_invites_unique" UNIQUE ("reservation_id", "invitee_id")
);

CREATE INDEX "idx_reservation_invites_invitee" ON "public"."reservation_invites" ("invitee_id", "status");

-- ── RLS: reservations ────────────────────────────────────────────────────

ALTER TABLE "public"."reservations" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reservations: admin full access" ON "public"."reservations"
  USING ("public"."is_admin"());

-- Public occupancy support: anyone can see that a slot is held/confirmed
-- (asset_id/time_range/status), matching play_events' existing public-read
-- exposure level (organizer_id is visible here too, same as
-- play_events.organizer_id already is). Roster identity itself is NOT
-- exposed this way -- see reservation_players policies below.
CREATE POLICY "reservations: public read active" ON "public"."reservations"
  FOR SELECT USING ("status" IN ('held', 'confirmed'));

CREATE POLICY "reservations: organizer read own regardless of status" ON "public"."reservations"
  FOR SELECT USING ("organizer_id" = (SELECT auth.uid()));

CREATE POLICY "reservations: player read own bookings" ON "public"."reservations"
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.reservation_players rp WHERE rp.reservation_id = id AND rp.profile_id = (SELECT auth.uid()))
  );

CREATE POLICY "reservations: facility staff read all" ON "public"."reservations"
  FOR SELECT USING ("public"."is_facility_role_at_least"("facility_id", (SELECT auth.uid()), 'staff'));

-- No direct client INSERT policy: creation is exclusively through
-- create_reservation() (SECURITY DEFINER), so price/capacity/overlap logic
-- can never be bypassed by a malformed direct write.

CREATE POLICY "reservations: organizer cancel own" ON "public"."reservations"
  FOR UPDATE USING ("organizer_id" = (SELECT auth.uid()))
  WITH CHECK ("organizer_id" = (SELECT auth.uid()) AND "status" = 'cancelled');

CREATE POLICY "reservations: facility manager manage" ON "public"."reservations"
  FOR UPDATE
  USING ("public"."is_facility_role_at_least"("facility_id", (SELECT auth.uid()), 'manager'))
  WITH CHECK ("public"."is_facility_role_at_least"("facility_id", (SELECT auth.uid()), 'manager'));

-- ── RLS: reservation_players ─────────────────────────────────────────────

ALTER TABLE "public"."reservation_players" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reservation_players: admin full access" ON "public"."reservation_players"
  USING ("public"."is_admin"());

-- No public SELECT policy on this table -- occupancy counts are read via
-- reservation_occupancy()/reservation_occupancy_for_asset() (SECURITY
-- DEFINER, count-only) so browsing availability never reveals who
-- specifically is on a roster.
CREATE POLICY "reservation_players: organizer read" ON "public"."reservation_players"
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.reservations r WHERE r.id = reservation_id AND r.organizer_id = (SELECT auth.uid()))
  );

CREATE POLICY "reservation_players: self read own rows" ON "public"."reservation_players"
  FOR SELECT USING ("profile_id" = (SELECT auth.uid()));

CREATE POLICY "reservation_players: facility staff read" ON "public"."reservation_players"
  FOR SELECT USING (
    "public"."is_facility_role_at_least"(
      (SELECT facility_id FROM public.reservations WHERE id = reservation_id), (SELECT auth.uid()), 'staff'
    )
  );

-- No direct INSERT policy -- rows are seated only via create_reservation()
-- (organizer's own first row) and accept_reservation_invite() (invitee).

CREATE POLICY "reservation_players: organizer remove player" ON "public"."reservation_players"
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.reservations r WHERE r.id = reservation_id AND r.organizer_id = (SELECT auth.uid()))
  );

CREATE POLICY "reservation_players: self leave" ON "public"."reservation_players"
  FOR DELETE USING ("profile_id" = (SELECT auth.uid()));

-- ── RLS: reservation_invites ─────────────────────────────────────────────

ALTER TABLE "public"."reservation_invites" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reservation_invites: admin full access" ON "public"."reservation_invites"
  USING ("public"."is_admin"());

CREATE POLICY "reservation_invites: invitee_can_respond" ON "public"."reservation_invites"
  FOR UPDATE USING ((SELECT auth.uid()) IN ("invitee_id", "inviter_id"))
  WITH CHECK ((SELECT auth.uid()) IN ("invitee_id", "inviter_id"));

CREATE POLICY "reservation_invites: inviter_can_send" ON "public"."reservation_invites"
  FOR INSERT WITH CHECK (
    "inviter_id" = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.reservations r WHERE r.id = reservation_id AND r.organizer_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "reservation_invites: participants read" ON "public"."reservation_invites"
  FOR SELECT USING ((SELECT auth.uid()) IN ("invitee_id", "inviter_id"));

-- ── RPC: create_reservation ──────────────────────────────────────────────
-- Modeled on join_play_event() (baseline migration ~line 2165): lock, check,
-- insert, named exceptions. Uses an advisory lock on the asset (rather than
-- locking a row that doesn't exist yet) so concurrent create attempts on the
-- same asset serialize into a clean named exception instead of a raw
-- exclusion-constraint error reaching the client.

CREATE OR REPLACE FUNCTION "public"."create_reservation"(
    "p_facility_id" uuid,
    "p_asset_type" "public"."facility_asset_owner_type",
    "p_asset_id" uuid,
    "p_starts_at" timestamptz,
    "p_ends_at" timestamptz,
    "p_game_format" "public"."reservation_game_format" DEFAULT NULL,
    "p_hold_minutes" integer DEFAULT 10
  ) RETURNS "public"."reservations"
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" TO 'public'
  AS $$
declare
  v_organizer uuid := auth.uid();
  v_resolved_facility uuid;
  v_max_players smallint;
  v_base_rate integer;
  v_discount smallint;
  v_row public.reservations;
begin
  if v_organizer is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  if p_asset_type not in ('court', 'ball_machine') then
    raise exception 'invalid_asset_type' using errcode = 'P0002';
  end if;

  v_resolved_facility := public.facility_id_for_owner(p_asset_type, p_asset_id);
  if v_resolved_facility is null or v_resolved_facility <> p_facility_id then
    raise exception 'asset_not_found' using errcode = 'P0003', hint = 'Asset does not belong to the given facility.';
  end if;

  if p_asset_type = 'ball_machine' then
    if p_game_format is not null then
      raise exception 'invalid_game_format_for_ball_machine' using errcode = 'P0005';
    end if;
    v_max_players := 1;
  else
    if p_game_format is null then
      raise exception 'game_format_required' using errcode = 'P0006';
    end if;
    v_max_players := case p_game_format when 'singles' then 2 when 'doubles' then 4 end;
  end if;

  -- Serialize concurrent attempts on the same asset before hitting the
  -- exclusion constraint, so overlap conflicts surface as a clean named
  -- exception rather than a raw constraint-violation error.
  perform pg_advisory_xact_lock(hashtextextended(p_asset_type::text || ':' || p_asset_id::text, 0));

  v_base_rate := coalesce(public.reservation_asset_hourly_rate_cents(p_asset_type, p_asset_id), 0);
  v_discount := public.reservation_best_flash_deal_percent(p_asset_type, p_asset_id, p_starts_at);

  begin
    insert into reservations (
      facility_id, asset_type, asset_id, organizer_id, game_format, max_players,
      time_range, status, hold_expires_at, base_price_cents,
      flash_deal_discount_percent, final_price_cents
    ) values (
      p_facility_id, p_asset_type, p_asset_id, v_organizer, p_game_format, v_max_players,
      tstzrange(p_starts_at, p_ends_at, '[)'), 'held', now() + make_interval(mins => p_hold_minutes),
      v_base_rate, v_discount,
      round(v_base_rate * (100 - coalesce(v_discount, 0)) / 100.0)
    )
    returning * into v_row;
  exception when exclusion_violation then
    raise exception 'slot_unavailable' using errcode = 'P0004', hint = 'This asset is already booked for an overlapping time.';
  end;

  insert into reservation_players (reservation_id, profile_id, is_organizer)
  values (v_row.id, v_organizer, true);

  return v_row;
end;
$$;

COMMENT ON FUNCTION "public"."create_reservation" IS
  'Transaction-safe reservation creation. Advisory-locks the asset, resolves price incl. active flash deal, inserts a held reservation (reservations_no_overlap EXCLUDE constraint is the final overlap guard), and seats the organizer as the first reservation_players row. Raises named exceptions: not_authenticated, invalid_asset_type, asset_not_found, invalid_game_format_for_ball_machine, game_format_required, slot_unavailable.';

-- ── RPC: reservation_has_capacity (shared helper) ────────────────────────

CREATE OR REPLACE FUNCTION "public"."reservation_has_capacity"("p_reservation_id" uuid)
  RETURNS boolean
  LANGUAGE "sql" STABLE
  SET "search_path" TO 'public'
  AS $$
  SELECT (SELECT count(*) FROM reservation_players WHERE reservation_id = p_reservation_id)
       < (SELECT max_players FROM reservations WHERE id = p_reservation_id);
$$;

-- ── RPC: join_reservation ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION "public"."join_reservation"("p_reservation_id" uuid)
  RETURNS "public"."reservation_players"
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" TO 'public'
  AS $$
declare
  v_res reservations;
  v_count integer;
  v_row reservation_players;
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select * into v_res from reservations where id = p_reservation_id for update;

  if not found then
    raise exception 'reservation_not_found' using errcode = 'P0002';
  end if;

  if v_res.status not in ('held', 'confirmed') then
    raise exception 'reservation_not_joinable' using errcode = 'P0003';
  end if;

  if v_res.status = 'held' and v_res.hold_expires_at < now() then
    raise exception 'hold_expired' using errcode = 'P0004';
  end if;

  select count(*) into v_count from reservation_players where reservation_id = p_reservation_id;

  if v_count >= v_res.max_players then
    raise exception 'reservation_full' using errcode = 'P0005';
  end if;

  if exists (select 1 from reservation_players where reservation_id = p_reservation_id and profile_id = v_user) then
    raise exception 'already_joined' using errcode = 'P0006';
  end if;

  insert into reservation_players (reservation_id, profile_id, is_organizer)
  values (p_reservation_id, v_user, false)
  returning * into v_row;

  return v_row;
end;
$$;

COMMENT ON FUNCTION "public"."join_reservation" IS
  'Transaction-safe join, mirrors join_play_event(). Locks the reservation row, checks status/hold-expiry/capacity/duplicate, then inserts. Named exceptions: not_authenticated, reservation_not_found, reservation_not_joinable, hold_expired, reservation_full, already_joined.';

-- ── RPC: accept_reservation_invite ───────────────────────────────────────

CREATE OR REPLACE FUNCTION "public"."accept_reservation_invite"("p_invite_id" uuid)
  RETURNS "public"."reservation_players"
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" TO 'public'
  AS $$
declare
  v_invite reservation_invites;
  v_user uuid := auth.uid();
  v_row reservation_players;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select * into v_invite from reservation_invites where id = p_invite_id for update;

  if not found then
    raise exception 'invite_not_found' using errcode = 'P0002';
  end if;

  if v_invite.invitee_id <> v_user then
    raise exception 'not_your_invite' using errcode = 'P0003';
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'invite_not_pending' using errcode = 'P0004';
  end if;

  update reservation_invites set status = 'accepted', responded_at = now() where id = p_invite_id;

  -- join_reservation() re-checks status/hold-expiry/capacity/duplicate under
  -- its own row lock, so accepting an invite can't bypass any of those checks.
  select * into v_row from public.join_reservation(v_invite.reservation_id);

  return v_row;
end;
$$;

COMMENT ON FUNCTION "public"."accept_reservation_invite" IS
  'Locks the invite, verifies the caller is the invitee and it is still pending, flips it to accepted, then calls join_reservation() to seat the player under the same capacity/hold-expiry guards. Named exceptions: not_authenticated, invite_not_found, not_your_invite, invite_not_pending (plus anything join_reservation raises).';

-- ── RPC: cancel_reservation ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION "public"."cancel_reservation"("p_reservation_id" uuid)
  RETURNS "public"."reservations"
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" TO 'public'
  AS $$
declare
  v_res reservations;
  v_user uuid := auth.uid();
  v_row reservations;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select * into v_res from reservations where id = p_reservation_id for update;

  if not found then
    raise exception 'reservation_not_found' using errcode = 'P0002';
  end if;

  if v_res.organizer_id <> v_user and not public.is_facility_role_at_least(v_res.facility_id, v_user, 'manager') then
    raise exception 'not_authorized' using errcode = 'P0003';
  end if;

  if v_res.status in ('cancelled', 'expired') then
    raise exception 'already_terminal' using errcode = 'P0004';
  end if;

  update reservations set status = 'cancelled', cancelled_at = now()
  where id = p_reservation_id
  returning * into v_row;

  return v_row;
end;
$$;

COMMENT ON FUNCTION "public"."cancel_reservation" IS
  'Organizer or facility manager+ only. No refund logic -- nothing is really charged yet this phase. Named exceptions: not_authenticated, reservation_not_found, not_authorized, already_terminal.';

-- ── RPC: confirm_reservation (the payment boundary) ──────────────────────

CREATE OR REPLACE FUNCTION "public"."confirm_reservation"("p_reservation_id" uuid)
  RETURNS "public"."reservations"
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" TO 'public'
  AS $$
declare
  v_res reservations;
  v_user uuid := auth.uid();
  v_row reservations;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select * into v_res from reservations where id = p_reservation_id for update;

  if not found then
    raise exception 'reservation_not_found' using errcode = 'P0002';
  end if;

  if v_res.organizer_id <> v_user then
    raise exception 'not_authorized' using errcode = 'P0003';
  end if;

  if v_res.status <> 'held' then
    raise exception 'reservation_not_held' using errcode = 'P0004';
  end if;

  if v_res.hold_expires_at < now() then
    raise exception 'hold_expired' using errcode = 'P0005';
  end if;

  update reservations set status = 'confirmed', confirmed_at = now(), hold_expires_at = null
  where id = p_reservation_id
  returning * into v_row;

  return v_row;
end;
$$;

COMMENT ON FUNCTION "public"."confirm_reservation" IS
  'The payment boundary. Today this has no Stripe call and no charge -- it just flips held to confirmed for the organizer. When real payment lands, this signature gains a payment-intent parameter and is gated on a successful charge; the mobile reservationPayment.ts wrapper is the intended swap point, not this function''s callers. Named exceptions: not_authenticated, reservation_not_found, not_authorized, reservation_not_held, hold_expired.';

-- ── RPC: occupancy reads ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION "public"."reservation_occupancy"("p_reservation_id" uuid)
  RETURNS TABLE("current_players" integer, "max_players" integer, "pending_invites" integer, "status" "public"."reservation_status")
  LANGUAGE "sql" STABLE SECURITY DEFINER
  SET "search_path" TO 'public'
  AS $$
  SELECT
    (SELECT count(*)::int FROM reservation_players WHERE reservation_id = p_reservation_id),
    r.max_players,
    (SELECT count(*)::int FROM reservation_invites WHERE reservation_id = p_reservation_id AND status = 'pending'),
    r.status
  FROM reservations r WHERE r.id = p_reservation_id;
$$;

CREATE OR REPLACE FUNCTION "public"."reservation_occupancy_for_asset"(
    "p_asset_type" "public"."facility_asset_owner_type", "p_asset_id" uuid, "p_date" date
  )
  RETURNS TABLE(
    "reservation_id" uuid, "time_range" tstzrange, "current_players" integer,
    "max_players" integer, "status" "public"."reservation_status", "final_price_cents" integer
  )
  LANGUAGE "sql" STABLE SECURITY DEFINER
  SET "search_path" TO 'public'
  AS $$
  SELECT
    r.id,
    r.time_range,
    (SELECT count(*)::int FROM reservation_players WHERE reservation_id = r.id),
    r.max_players,
    r.status,
    r.final_price_cents
  FROM reservations r
  WHERE r.asset_type = p_asset_type
    AND r.asset_id = p_asset_id
    AND r.status IN ('held', 'confirmed')
    AND r.time_range && tstzrange(p_date::timestamptz, (p_date + 1)::timestamptz, '[)')
  ORDER BY lower(r.time_range) ASC;
$$;

COMMENT ON FUNCTION "public"."reservation_occupancy" IS
  'Read-only, count-only occupancy for one reservation -- backs the public/organizer occupancy display without exposing individual reservation_players rows.';
COMMENT ON FUNCTION "public"."reservation_occupancy_for_asset" IS
  'Read-only occupancy for every held/confirmed reservation on one asset on one calendar date -- backs the Choose Time & Court availability grid.';

-- ── realtime ─────────────────────────────────────────────────────────────

DO $$
DECLARE
  table_name text;
  tables text[] := ARRAY['reservations', 'reservation_players'];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  FOREACH table_name IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = table_name
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.%I', table_name);
    END IF;
  END LOOP;
END $$;
