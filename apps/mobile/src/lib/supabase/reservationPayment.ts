import { supabase } from '@/lib/supabase';
import type { Reservation } from './reservations';

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENT BOUNDARY
// ─────────────────────────────────────────────────────────────────────────────
//
// Kept in its own file, separate from reservations.ts, so "payment is a
// separate layer" is visible in the file tree, not just a comment. This is
// the ONE function the Review & Pay screen calls for its pay action.
//
// Today: no Stripe, no charge. confirm_reservation() (server-side RPC) just
// flips a held reservation to confirmed for its organizer. When real Stripe
// capture lands, this function's internals change (create/confirm a
// PaymentIntent first, then call the RPC -- or an edge function wraps both),
// but its signature and every call site in the UI stay the same. Do not
// inline `supabase.rpc('confirm_reservation', ...)` directly in a screen --
// always go through this function so the swap point stays singular.

export async function confirmReservation(reservationId: string): Promise<Reservation> {
  const { data, error } = await supabase.rpc('confirm_reservation', { p_reservation_id: reservationId });
  if (error) throw error;
  return data as Reservation;
}
