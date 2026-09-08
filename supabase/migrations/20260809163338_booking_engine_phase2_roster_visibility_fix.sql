-- Follow-up to booking_engine_phase2_reservation_core: reservation_players
-- only granted a joined (non-organizer) player visibility into their OWN
-- row, not the rest of the roster -- so Game Status could not show a joined
-- player who else is in their own game, only the organizer could see
-- everyone. Add a policy granting any player already on a reservation's
-- roster read access to the whole roster for that reservation, using the
-- same is_reservation_player() SECURITY DEFINER helper added in the
-- recursion fix (safe: it bypasses RLS internally, so this does not
-- reintroduce the earlier recursion).

CREATE POLICY "reservation_players: fellow player read roster" ON "public"."reservation_players"
  FOR SELECT USING ("public"."is_reservation_player"("reservation_id", (SELECT auth.uid())));
