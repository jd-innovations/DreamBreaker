import { supabase } from '@/lib/supabase';
import type { Tables, Database } from '@/lib/database.types';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
//
// Thin wrappers over the Phase 2 reservation-core schema and RPCs
// (create_reservation / join_reservation / cancel_reservation /
// reservation_occupancy / reservation_occupancy_for_asset). All capacity,
// overlap, and pricing logic lives server-side (see
// supabase/migrations/20260809162811_booking_engine_phase2_reservation_core.sql
// and its follow-up fix migrations) -- this file never re-derives it.
//
// confirm_reservation() is intentionally NOT wrapped here -- see
// reservationPayment.ts, kept as its own file so the payment boundary is
// visible in the file tree, not just in a comment.

export type Reservation       = Tables<'reservations'>;
export type ReservationPlayer = Tables<'reservation_players'>;
export type ReservationStatus = Database['public']['Enums']['reservation_status'];
export type ReservationGameFormat = Database['public']['Enums']['reservation_game_format'];

// Reservations only ever cover the two V1 asset types (facility itself is
// never a reservation target) -- narrower than the shared
// facility_asset_owner_type enum from Phase 1.
export type ReservableAssetType = 'court' | 'ball_machine';

export type CreateReservationInput = {
  facilityId: string;
  assetType:  ReservableAssetType;
  assetId:    string;
  startsAt:   Date | string;
  endsAt:     Date | string;
  /** Required for courts (singles|doubles). Omit for ball machines. */
  gameFormat?: ReservationGameFormat;
  /** Defaults to the server-side RPC default (10 minutes) when omitted. */
  holdMinutes?: number;
};

export type ReservationOccupancy = {
  currentPlayers: number;
  maxPlayers:     number;
  pendingInvites: number;
  status:         ReservationStatus;
};

export type AssetAvailabilitySlot = {
  reservationId:   string;
  startsAt:        string;
  endsAt:          string;
  currentPlayers:  number;
  maxPlayers:      number;
  status:          ReservationStatus;
  finalPriceCents: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// RANGE PARSING
// ─────────────────────────────────────────────────────────────────────────────
// Postgres returns tstzrange as a literal like '["2026-08-11 09:00:00+00","2026-08-11 10:00:00+00")'.
// PostgREST/supabase-js does not parse this into a JS type -- do it once here.

// Exported -- My Bookings needs to sort/bucket by start/end time from the
// same raw reservations.time_range shape fetchMyReservations() already
// returns, rather than re-deriving a second parser.
// Postgres's own rendering is not valid ISO 8601: it separates date and time
// with a space and writes the offset as `+00`, giving "2026-08-22 11:00:00+00".
// V8 tolerates that, Hermes does not — `new Date(...)` on it returns Invalid
// Date, which is what rendered "Invalid Date · Invalid Date – Invalid Date"
// across My Bookings and Game Status. Normalizing here rather than at each call
// site means every consumer gets a string `new Date()` can actually parse.
function toIsoTimestamp(pg: string): string {
  return pg
    .trim()
    .replace(' ', 'T')
    .replace(/([+-]\d{2})$/, '$1:00')          // +00   -> +00:00
    .replace(/([+-]\d{2})(\d{2})$/, '$1:$2');  // +0000 -> +00:00
}

export function parseTstzrange(raw: string): { startsAt: string; endsAt: string } {
  const inner = raw.slice(1, -1); // drop the leading [/( and trailing )/]
  const [startsAt, endsAt] = inner.split(',').map(s => s.replace(/^"|"$/g, ''));
  return { startsAt: toIsoTimestamp(startsAt), endsAt: toIsoTimestamp(endsAt) };
}

// ─────────────────────────────────────────────────────────────────────────────
// CREATE / JOIN / CANCEL (RPC wrappers)
// ─────────────────────────────────────────────────────────────────────────────

export async function createReservation(input: CreateReservationInput): Promise<Reservation> {
  const { data, error } = await supabase.rpc('create_reservation', {
    p_facility_id:  input.facilityId,
    p_asset_type:   input.assetType,
    p_asset_id:     input.assetId,
    p_starts_at:    new Date(input.startsAt).toISOString(),
    p_ends_at:      new Date(input.endsAt).toISOString(),
    ...(input.gameFormat != null ? { p_game_format: input.gameFormat } : {}),
    ...(input.holdMinutes != null ? { p_hold_minutes: input.holdMinutes } : {}),
  });

  if (error) throw error;
  return data as Reservation;
}

export async function joinReservation(reservationId: string): Promise<ReservationPlayer> {
  const { data, error } = await supabase.rpc('join_reservation', { p_reservation_id: reservationId });
  if (error) throw error;
  return data as ReservationPlayer;
}

export async function cancelReservation(reservationId: string): Promise<Reservation> {
  const { data, error } = await supabase.rpc('cancel_reservation', { p_reservation_id: reservationId });
  if (error) throw error;
  return data as Reservation;
}

// Self-serve leave -- no capacity math needed, so this is a direct delete
// under the "reservation_players: self leave" RLS policy rather than an RPC.
export async function leaveReservation(reservationId: string, profileId: string): Promise<void> {
  const { error } = await supabase
    .from('reservation_players')
    .delete()
    .eq('reservation_id', reservationId)
    .eq('profile_id', profileId);
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────────────────────────
// FETCH
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchReservationById(id: string): Promise<Reservation | null> {
  const { data, error } = await supabase.from('reservations').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchReservationPlayers(reservationId: string): Promise<ReservationPlayer[]> {
  const { data, error } = await supabase
    .from('reservation_players')
    .select('*')
    .eq('reservation_id', reservationId)
    .order('joined_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export type ReservationPlayerWithProfile = {
  id:          string;
  profileId:   string;
  isOrganizer: boolean;
  joinedAt:    string;
  fullName:    string;
  avatarUrl:   string | null;
};

// Roster with display names, for the Find Players / Invite Players screen --
// fetchReservationPlayers() stays profile-id-only for callers that don't need
// names (matches fetchInvitedProfileIds()'s id-only shape in
// reservationInvites.ts), this is the joined variant.
export async function fetchReservationPlayersWithProfiles(reservationId: string): Promise<ReservationPlayerWithProfile[]> {
  const { data, error } = await supabase
    .from('reservation_players')
    .select('id, profile_id, is_organizer, joined_at, profile:profiles!profile_id(full_name, avatar_url)')
    .eq('reservation_id', reservationId)
    .order('joined_at', { ascending: true });
  if (error) throw error;

  return ((data ?? []) as unknown as {
    id: string; profile_id: string; is_organizer: boolean; joined_at: string;
    profile: { full_name: string; avatar_url: string | null } | null;
  }[]).map(row => ({
    id:          row.id,
    profileId:   row.profile_id,
    isOrganizer: row.is_organizer,
    joinedAt:    row.joined_at,
    fullName:    row.profile?.full_name ?? 'Player',
    avatarUrl:   row.profile?.avatar_url ?? null,
  }));
}

// My Bookings needs both "reservations I organized" and "reservations I
// joined" -- RLS scopes each query independently (organizer policy vs.
// player policy), so this is two queries merged client-side rather than one
// .or() across a join, matching how fetchFacilities() keeps its proximity
// and plain-select paths as two separate query shapes rather than forcing
// one query to cover both.
export async function fetchMyReservations(
  userId: string,
  opts: { upcomingOnly?: boolean } = {},
): Promise<Reservation[]> {
  const nowIso = new Date().toISOString();

  let organizedQuery = supabase.from('reservations').select('*').eq('organizer_id', userId);
  if (opts.upcomingOnly) organizedQuery = organizedQuery.gte('time_range', nowIso);

  const [{ data: organized, error: organizedError }, { data: joinedRows, error: joinedError }] = await Promise.all([
    organizedQuery,
    supabase.from('reservation_players').select('reservation_id').eq('profile_id', userId),
  ]);
  if (organizedError) throw organizedError;
  if (joinedError) throw joinedError;

  const joinedIds = (joinedRows ?? []).map(r => r.reservation_id).filter(id => !(organized ?? []).some(o => o.id === id));

  let joined: Reservation[] = [];
  if (joinedIds.length > 0) {
    const { data, error } = await supabase.from('reservations').select('*').in('id', joinedIds);
    if (error) throw error;
    joined = data ?? [];
  }

  return [...(organized ?? []), ...joined].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

export async function fetchAssetAvailability(
  assetType: ReservableAssetType,
  assetId: string,
  date: Date | string,
): Promise<AssetAvailabilitySlot[]> {
  const dateStr = typeof date === 'string' ? date : date.toISOString().slice(0, 10);

  const { data, error } = await supabase.rpc('reservation_occupancy_for_asset', {
    p_asset_type: assetType,
    p_asset_id:   assetId,
    p_date:       dateStr,
  });
  if (error) throw error;

  return (data ?? []).map(row => {
    const { startsAt, endsAt } = parseTstzrange(row.time_range as string);
    return {
      reservationId:   row.reservation_id,
      startsAt,
      endsAt,
      currentPlayers:  row.current_players,
      maxPlayers:      row.max_players,
      status:          row.status,
      finalPriceCents: row.final_price_cents,
    };
  });
}

export async function fetchReservationOccupancy(reservationId: string): Promise<ReservationOccupancy | null> {
  const { data, error } = await supabase
    .rpc('reservation_occupancy', { p_reservation_id: reservationId })
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return {
    currentPlayers: data.current_players,
    maxPlayers:     data.max_players,
    pendingInvites: data.pending_invites,
    status:         data.status,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// OCCUPANCY DISPLAY HELPERS
// ─────────────────────────────────────────────────────────────────────────────
// Pure functions, no I/O -- the spec's "Current / Incoming / Projected /
// Completion Status" occupancy model (BOOKING_ENGINE_V1_SPEC.md). Screens
// call these against a ReservationOccupancy (or raw counts) rather than
// re-deriving the arithmetic per screen.

export type OccupancyCompletionState = 'complete' | 'needs_players';

/** How many more players are needed to fill the reservation. Never negative. */
export function playersNeeded(currentPlayers: number, maxPlayers: number): number {
  return Math.max(maxPlayers - currentPlayers, 0);
}

/**
 * Projected occupancy after an "incoming" group (players the organizer is
 * about to add, or invites about to be accepted) joins. Not capped to
 * maxPlayers -- callers combine this with playersNeeded()/completion state
 * for capacity-aware UI rather than having this function silently clip.
 */
export function projectedOccupancy(currentPlayers: number, incomingCount: number): number {
  return currentPlayers + incomingCount;
}

export function occupancyCompletionState(currentPlayers: number, maxPlayers: number): OccupancyCompletionState {
  return currentPlayers >= maxPlayers ? 'complete' : 'needs_players';
}

/**
 * Spec-worded label for the current gap: "Game Complete" / "Need One
 * Player" / "Need N More Players". Mirrors the spec's occupancy examples
 * verbatim rather than a generic "X/Y" string.
 */
export function occupancyStatusLabel(currentPlayers: number, maxPlayers: number): string {
  const needed = playersNeeded(currentPlayers, maxPlayers);
  if (needed === 0) return 'Game Complete';
  if (needed === 1) return 'Need One Player';
  return `Need ${needed} More Players`;
}

/** "2 / 4 Players" style short label for list/card contexts. */
export function occupancyCountLabel(currentPlayers: number, maxPlayers: number): string {
  return `${currentPlayers} / ${maxPlayers} Players`;
}
