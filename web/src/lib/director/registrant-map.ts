// Director registrant map — "where is my field from". Owner-approved 2026-10-01.
//
// Data: tournament_registrant_pins / tournament_registrant_pin_players
// (20261001120000). Both refuse anyone but the tournament's director (42501).
// Placement is the players map's: home court, else city, never a personal
// location. Written to be reused by mobile unchanged.

import { createClient } from "@/lib/supabase/client";
import { toPlayer, type DirectoryPlayer } from "@/lib/players/directory";

export type StatusGroup = "active" | "waitlist" | "all";

export const STATUS_GROUPS: { id: StatusGroup; label: string }[] = [
  { id: "active", label: "Registered" },
  { id: "waitlist", label: "Waitlist" },
  { id: "all", label: "All" },
];

export type RegistrantPin = {
  kind: "court" | "city";
  key: string;
  label: string;
  sublabel: string;
  lat: number;
  lng: number;
  playerCount: number;
};

export type Venue = { name: string; lat: number; lng: number };

export type RegistrantMapData = {
  venue: Venue | null;
  pins: RegistrantPin[];
  /** Accounts with no home court and no matchable city. */
  unplaced: number;
  /** Registrants with no app account; they have no location at all. */
  guests: number;
};

export type RegistrantPlayer = DirectoryPlayer & { divisions: string | null; statuses: string | null };

type Result<T> = { ok: true; data: T } | { ok: false; message: string };
const FAIL = "Couldn't load the registrant map. Check your connection and try again.";
const DENIED = "Only this tournament's director can see the registrant map.";

function failure(error: { code?: string }): { ok: false; message: string } {
  return { ok: false, message: error.code === "42501" ? DENIED : FAIL };
}

// ─── Pure helpers (tested) ──────────────────────────────────────────────────

export const RING_MILES = [25, 50, 100] as const;
const METRES_PER_MILE = 1609.344;
export const milesToMetres = (mi: number) => mi * METRES_PER_MILE;

export function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

type PinRow = { kind: string; key: string; label: string; sublabel: string; lat: number | null; lng: number | null; player_count: number };

export function toMapData(rows: PinRow[]): RegistrantMapData {
  const out: RegistrantMapData = { venue: null, pins: [], unplaced: 0, guests: 0 };
  for (const r of rows) {
    if (r.kind === "venue" && r.lat != null && r.lng != null) out.venue = { name: r.label, lat: r.lat, lng: r.lng };
    else if (r.kind === "unplaced") out.unplaced = r.player_count;
    else if (r.kind === "guest") out.guests = r.player_count;
    else if ((r.kind === "court" || r.kind === "city") && r.lat != null && r.lng != null && r.player_count > 0) {
      out.pins.push({
        kind: r.kind, key: r.key, label: r.label, sublabel: r.sublabel,
        lat: r.lat, lng: r.lng, playerCount: r.player_count,
      });
    }
  }
  out.pins.sort((a, b) => b.playerCount - a.playerCount || a.label.localeCompare(b.label));
  return out;
}

export type FieldSummary = {
  total: number;
  placed: number;
  /** Placed registrants within the first ring of the venue; null with no venue. */
  local: number | null;
  /** City name -> registrants, most first, at most five. */
  topCities: { city: string; count: number }[];
};

/** A court pin's city is its sublabel; a city pin's is its label. */
const cityOf = (p: RegistrantPin) => (p.kind === "court" ? p.sublabel : p.label) || p.label;

export function summarize(d: RegistrantMapData): FieldSummary {
  const placed = d.pins.reduce((n, p) => n + p.playerCount, 0);
  const local = d.venue
    ? d.pins.filter((p) => milesBetween(p, d.venue!) <= RING_MILES[0]).reduce((n, p) => n + p.playerCount, 0)
    : null;
  const byCity = new Map<string, number>();
  for (const p of d.pins) byCity.set(cityOf(p), (byCity.get(cityOf(p)) ?? 0) + p.playerCount);
  const topCities = [...byCity]
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city))
    .slice(0, 5);
  return { total: placed + d.unplaced + d.guests, placed, local, topCities };
}

// ─── Data ───────────────────────────────────────────────────────────────────

export async function fetchRegistrantPins(
  tournamentId: string, divisionId: string | null, statusGroup: StatusGroup,
): Promise<Result<RegistrantMapData>> {
  const { data, error } = await createClient().rpc("tournament_registrant_pins", {
    p_tournament_id: tournamentId,
    p_division_id: divisionId ?? undefined,
    p_status_group: statusGroup,
  });
  if (error) return failure(error);
  return { ok: true, data: toMapData(data ?? []) };
}

export async function fetchRegistrantPinPlayers(
  tournamentId: string, pin: Pick<RegistrantPin, "kind" | "key"> | { kind: "unplaced"; key: "unplaced" },
  divisionId: string | null, statusGroup: StatusGroup,
): Promise<Result<RegistrantPlayer[]>> {
  const { data, error } = await createClient().rpc("tournament_registrant_pin_players", {
    p_tournament_id: tournamentId,
    p_kind: pin.kind,
    p_key: pin.key,
    p_division_id: divisionId ?? undefined,
    p_status_group: statusGroup,
  });
  if (error) return failure(error);
  return {
    ok: true,
    data: (data ?? []).map((r) => ({ ...toPlayer(r), divisions: r.divisions ?? null, statuses: r.statuses ?? null })),
  };
}
