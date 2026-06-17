import type { Database } from "@/lib/supabase/database.types";

export type PlayEvent = Database["public"]["Tables"]["play_events"]["Row"];
export type PlayEventInsert = Database["public"]["Tables"]["play_events"]["Insert"];
export type PlayParticipant = Database["public"]["Tables"]["play_participants"]["Row"];
export type PlayParticipantPublic = Database["public"]["Views"]["play_participants_public"]["Row"];
export type PlayMatch = Database["public"]["Tables"]["play_matches"]["Row"];
export type PlayEventType = Database["public"]["Enums"]["play_event_type"];
export type PlayEventStatus = Database["public"]["Enums"]["play_event_status"];

export const EVENT_TYPES: { value: PlayEventType; label: string; available: boolean }[] = [
  { value: "round_robin", label: "Round Robin", available: true },
  { value: "mixer", label: "Mixer", available: false },
  { value: "ladder", label: "Ladder", available: false },
  { value: "open_play", label: "Open Play", available: false },
  { value: "kings_court", label: "King's Court", available: false },
];

export function eventTypeLabel(type: PlayEventType): string {
  return EVENT_TYPES.find((t) => t.value === type)?.label ?? "Round Robin";
}

export function statusLabel(status: PlayEventStatus): string {
  switch (status) {
    case "open": return "Open";
    case "full": return "Full";
    case "in_progress": return "Live";
    case "completed": return "Completed";
    case "cancelled": return "Cancelled";
  }
}

export function skillLabel(min: number | null, max: number | null): string {
  if (min == null && max == null) return "All levels";
  if (max == null) return `${min}+`;
  if (min == null) return `Up to ${max}`;
  return `${min} – ${max}`;
}

export function displayName(p: { first_name: string | null; last_initial: string | null }): string {
  const fn = p.first_name ?? "Player";
  return p.last_initial ? `${fn} ${p.last_initial.toUpperCase()}.` : fn;
}

export function formatEventDate(iso: string): string {
  // event_date is a date string (YYYY-MM-DD); parse as local to avoid TZ shift
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });
}

export function formatEventTime(time: string | null): string | null {
  if (!time) return null;
  const [hStr, mStr] = time.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr ?? "0", 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

/**
 * Single round robin scheduling via the circle method.
 * Returns rounds, each a list of [aId, bId] pairings. A null id means a BYE.
 */
export function generateRoundRobin(participantIds: string[]): { round: number; pairs: [string | null, string | null][] }[] {
  const ids = [...participantIds];
  if (ids.length < 2) return [];
  // Add a phantom BYE for odd counts
  if (ids.length % 2 === 1) ids.push("__BYE__");

  const n = ids.length;
  const rounds: { round: number; pairs: [string | null, string | null][] }[] = [];
  const arr = [...ids];

  for (let r = 0; r < n - 1; r++) {
    const pairs: [string | null, string | null][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      const aId = a === "__BYE__" ? null : a;
      const bId = b === "__BYE__" ? null : b;
      // Skip pure bye-vs-bye (can't happen) and keep real pairings
      if (aId !== null || bId !== null) pairs.push([aId, bId]);
    }
    rounds.push({ round: r + 1, pairs });
    // Rotate (keep first fixed)
    arr.splice(1, 0, arr.pop()!);
  }
  return rounds;
}

export type Standing = {
  participantId: string;
  wins: number;
  losses: number;
  played: number;
  pointsFor: number;
  pointsAgainst: number;
  diff: number;
};

export function computeStandings(matches: PlayMatch[], participantIds: string[]): Standing[] {
  const table = new Map<string, Standing>();
  for (const id of participantIds) {
    table.set(id, { participantId: id, wins: 0, losses: 0, played: 0, pointsFor: 0, pointsAgainst: 0, diff: 0 });
  }

  for (const m of matches) {
    if (m.winner == null || m.player_a_id == null || m.player_b_id == null) continue;
    const a = table.get(m.player_a_id);
    const b = table.get(m.player_b_id);
    if (!a || !b) continue;
    const sa = m.score_a ?? 0;
    const sb = m.score_b ?? 0;
    a.played++; b.played++;
    a.pointsFor += sa; a.pointsAgainst += sb;
    b.pointsFor += sb; b.pointsAgainst += sa;
    if (m.winner === 1) { a.wins++; b.losses++; } else { b.wins++; a.losses++; }
  }

  for (const s of table.values()) s.diff = s.pointsFor - s.pointsAgainst;

  return [...table.values()].sort(
    (x, y) => y.wins - x.wins || y.diff - x.diff || y.pointsFor - x.pointsFor,
  );
}
