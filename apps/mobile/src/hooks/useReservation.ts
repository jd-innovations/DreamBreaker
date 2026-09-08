import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
  fetchReservationById,
  fetchReservationOccupancy,
  type Reservation,
  type ReservationOccupancy,
} from '@/lib/supabase/reservations';

// Live reservation + occupancy for the Game Status screen (one route,
// state-driven -- current players / Find Players / Game Full all read off
// this hook's `occupancy`, not separate routes). Realtime channel pattern
// mirrors useUnreadCounts.ts: a uniquely-suffixed channel per mount,
// postgres_changes subscriptions, removeChannel on cleanup. reservations
// and reservation_players are both in the supabase_realtime publication
// (added in the Phase 2 migration).
export function useReservation(reservationId: string | null | undefined) {
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [occupancy, setOccupancy] = useState<ReservationOccupancy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!reservationId) {
      setReservation(null);
      setOccupancy(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [res, occ] = await Promise.all([
        fetchReservationById(reservationId),
        fetchReservationOccupancy(reservationId),
      ]);
      setReservation(res);
      setOccupancy(occ);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this reservation.');
    } finally {
      setLoading(false);
    }
  }, [reservationId]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!reservationId) return;

    const channelId = Math.random().toString(36).slice(2);
    const channel = supabase
      .channel(`reservation:${reservationId}:${channelId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'reservations', filter: `id=eq.${reservationId}` },
        () => refresh(),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'reservation_players', filter: `reservation_id=eq.${reservationId}` },
        () => refresh(),
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'reservation_players', filter: `reservation_id=eq.${reservationId}` },
        () => refresh(),
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [reservationId, refresh]);

  return { reservation, occupancy, loading, error, refresh };
}
