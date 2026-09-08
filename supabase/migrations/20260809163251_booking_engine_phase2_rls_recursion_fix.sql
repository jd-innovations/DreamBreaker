-- Follow-up to booking_engine_phase2_reservation_core: reservations' and
-- reservation_players' RLS policies referenced each other's table directly
-- (reservations: player read own bookings -> queries reservation_players;
-- reservation_players: organizer read / facility staff read -> query
-- reservations), causing "infinite recursion detected in policy" whenever
-- either table was queried by a non-admin, non-organizer, non-owner role.
--
-- Fix: route the cross-table checks through SECURITY DEFINER helper
-- functions (owned by postgres, which bypasses RLS on tables it queries),
-- exactly the same pattern already used by is_facility_role_at_least() /
-- facility_id_for_owner() from Phase 1 -- these never re-trigger the other
-- table's policy evaluation, breaking the cycle.

CREATE OR REPLACE FUNCTION "public"."is_reservation_organizer"("p_reservation_id" uuid, "p_user_id" uuid)
  RETURNS boolean
  LANGUAGE "sql" STABLE SECURITY DEFINER
  SET "search_path" TO 'public'
  AS $$
  SELECT EXISTS (SELECT 1 FROM public.reservations WHERE id = p_reservation_id AND organizer_id = p_user_id);
$$;

CREATE OR REPLACE FUNCTION "public"."is_reservation_player"("p_reservation_id" uuid, "p_user_id" uuid)
  RETURNS boolean
  LANGUAGE "sql" STABLE SECURITY DEFINER
  SET "search_path" TO 'public'
  AS $$
  SELECT EXISTS (SELECT 1 FROM public.reservation_players WHERE reservation_id = p_reservation_id AND profile_id = p_user_id);
$$;

CREATE OR REPLACE FUNCTION "public"."reservation_facility_id"("p_reservation_id" uuid)
  RETURNS uuid
  LANGUAGE "sql" STABLE SECURITY DEFINER
  SET "search_path" TO 'public'
  AS $$
  SELECT facility_id FROM public.reservations WHERE id = p_reservation_id;
$$;

DROP POLICY "reservations: player read own bookings" ON "public"."reservations";
CREATE POLICY "reservations: player read own bookings" ON "public"."reservations"
  FOR SELECT USING ("public"."is_reservation_player"("id", (SELECT auth.uid())));

DROP POLICY "reservation_players: organizer read" ON "public"."reservation_players";
CREATE POLICY "reservation_players: organizer read" ON "public"."reservation_players"
  FOR SELECT USING ("public"."is_reservation_organizer"("reservation_id", (SELECT auth.uid())));

DROP POLICY "reservation_players: facility staff read" ON "public"."reservation_players";
CREATE POLICY "reservation_players: facility staff read" ON "public"."reservation_players"
  FOR SELECT USING (
    "public"."is_facility_role_at_least"("public"."reservation_facility_id"("reservation_id"), (SELECT auth.uid()), 'staff')
  );

DROP POLICY "reservation_players: organizer remove player" ON "public"."reservation_players";
CREATE POLICY "reservation_players: organizer remove player" ON "public"."reservation_players"
  FOR DELETE USING ("public"."is_reservation_organizer"("reservation_id", (SELECT auth.uid())));
