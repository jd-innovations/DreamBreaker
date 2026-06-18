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

// The three round-robin formats stored in play_events.format (free text).
export type PlayFormat = "singles" | "doubles" | "rotating";

export const FORMAT_OPTIONS: { value: string; format: PlayFormat; label: string; hint: string }[] = [
  { value: "Round Robin · Singles", format: "singles", label: "Singles", hint: "1v1 — everyone plays everyone once." },
  { value: "Round Robin · Doubles", format: "doubles", label: "Doubles (fixed pairs)", hint: "Players pair into fixed teams; teams play every other team. Best with an even number of players." },
  { value: "Round Robin · Rotating Partners", format: "rotating", label: "Rotating Partners", hint: "Partners rotate each round so you play with different people. Works in foursomes — best with a multiple of 4 players." },
];

export function parseFormat(format: string | null): PlayFormat {
  const f = (format ?? "").toLowerCase();
  if (f.includes("rotat")) return "rotating";
  if (f.includes("doubles")) return "doubles";
  return "singles";
}

export function formatLabel(format: string | null): string {
  return FORMAT_OPTIONS.find((o) => o.format === parseFormat(format))?.label ?? "Singles";
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

/**
 * A generated match. a2/b2 are null for singles; set for doubles & rotating.
 */
export type GeneratedMatch = {
  round: number;
  court: number;
  a1: string;
  a2: string | null;
  b1: string;
  b2: string | null;
};

/** Singles round robin — each participant plays every other once (1v1). */
function generateSingles(ids: string[]): GeneratedMatch[] {
  return generateRoundRobin(ids).flatMap((r) =>
    r.pairs
      .filter(([a, b]) => a !== null && b !== null)
      .map(([a, b], i) => ({ round: r.round, court: i + 1, a1: a as string, a2: null, b1: b as string, b2: null })),
  );
}

/**
 * Doubles round robin with FIXED pairs. Players are paired in roster order
 * (1&2, 3&4, …); a leftover odd player is dropped as an alternate. Teams then
 * play a circle-method round robin against each other.
 */
function generateDoubles(ids: string[]): GeneratedMatch[] {
  const teams: [string, string][] = [];
  for (let i = 0; i + 1 < ids.length; i += 2) teams.push([ids[i], ids[i + 1]]);
  if (teams.length < 2) return [];
  const teamIdx = teams.map((_, i) => String(i));
  return generateRoundRobin(teamIdx).flatMap((r) =>
    r.pairs
      .filter(([a, b]) => a !== null && b !== null)
      .map(([a, b], i) => {
        const ta = teams[parseInt(a as string, 10)];
        const tb = teams[parseInt(b as string, 10)];
        return { round: r.round, court: i + 1, a1: ta[0], a2: ta[1], b1: tb[0], b2: tb[1] };
      }),
  );
}

/**
 * Rotating-partner doubles. Players are split into foursomes (roster order);
 * each foursome plays its 3 canonical pairings across 3 rounds so everyone
 * partners with — and plays against — different people. Leftover players that
 * don't complete a foursome (count not divisible by 4) sit out as alternates.
 */
function generateRotating(ids: string[]): GeneratedMatch[] {
  const groups: string[][] = [];
  for (let i = 0; i + 3 < ids.length; i += 4) groups.push(ids.slice(i, i + 4));
  if (groups.length === 0) return [];
  // The three ways to split a foursome [0,1,2,3] into two pairs.
  const pairings: [[number, number], [number, number]][] = [
    [[0, 1], [2, 3]],
    [[0, 2], [1, 3]],
    [[0, 3], [1, 2]],
  ];
  const matches: GeneratedMatch[] = [];
  pairings.forEach(([sideA, sideB], p) => {
    groups.forEach((g, gi) => {
      matches.push({ round: p + 1, court: gi + 1, a1: g[sideA[0]], a2: g[sideA[1]], b1: g[sideB[0]], b2: g[sideB[1]] });
    });
  });
  return matches;
}

/** Build a match schedule for the given format. */
export function generateSchedule(format: PlayFormat, participantIds: string[]): GeneratedMatch[] {
  if (format === "doubles") return generateDoubles(participantIds);
  if (format === "rotating") return generateRotating(participantIds);
  return generateSingles(participantIds);
}

/** How many players sit out (alternates) for a given format & count. */
export function alternatesCount(format: PlayFormat, n: number): number {
  if (format === "doubles") return n % 2;
  if (format === "rotating") return n % 4;
  return 0;
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
    if (m.winner == null) continue;
    const teamA = [m.player_a_id, m.player_a2_id].filter((x): x is string => !!x);
    const teamB = [m.player_b_id, m.player_b2_id].filter((x): x is string => !!x);
    if (teamA.length === 0 || teamB.length === 0) continue;
    const sa = m.score_a ?? 0;
    const sb = m.score_b ?? 0;
    for (const id of teamA) {
      const s = table.get(id);
      if (!s) continue;
      s.played++; s.pointsFor += sa; s.pointsAgainst += sb;
      if (m.winner === 1) s.wins++; else s.losses++;
    }
    for (const id of teamB) {
      const s = table.get(id);
      if (!s) continue;
      s.played++; s.pointsFor += sb; s.pointsAgainst += sa;
      if (m.winner === 2) s.wins++; else s.losses++;
    }
  }

  for (const s of table.values()) s.diff = s.pointsFor - s.pointsAgainst;

  return [...table.values()].sort(
    (x, y) => y.wins - x.wins || y.diff - x.diff || y.pointsFor - x.pointsFor,
  );
}
