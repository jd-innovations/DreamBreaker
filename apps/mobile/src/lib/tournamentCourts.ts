// Tournament courts: the director's real court list (tournaments.courts,
// migration 20260928140000). Courts are identified by NAME, not position: a
// venue's reserved courts are often 7-12 or "Stadium", never assumed 1..N.
// bracket_matches.court stores the same name.

export const MAX_COURTS = 64;
export const MAX_COURT_NAME = 24;

/**
 * Parses what a director types into court names, in order:
 *   "7-12"            -> 7, 8, 9, 10, 11, 12
 *   "7, 9, 14"        -> 7, 9, 14
 *   "Stadium, A-C"    -> Stadium, A-C   (only numeric ranges expand)
 *   "Court 7"         -> 7              (the "Court" prefix is added on display)
 * Blank entries are dropped and duplicates removed, ignoring case. The first
 * one is kept. The result is capped at MAX_COURTS.
 */
export function parseCourts(input: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const name = raw.replace(/^court\s+/i, '').trim().slice(0, MAX_COURT_NAME);
    const key = name.toLowerCase();
    if (!name || seen.has(key) || out.length >= MAX_COURTS) return;
    seen.add(key);
    out.push(name);
  };

  for (const token of input.split(/[,\n;]+/)) {
    const t = token.replace(/^court\s+/i, '').trim();
    const range = t.match(/^(\d{1,3})\s*[-–—]\s*(\d{1,3})$/);
    if (range) {
      const a = parseInt(range[1], 10);
      const b = parseInt(range[2], 10);
      const step = a <= b ? 1 : -1;
      for (let n = a; step > 0 ? n <= b : n >= b; n += step) push(String(n));
    } else {
      push(t);
    }
  }
  return out;
}

/** Adds parsed names to an existing list, keeping order and uniqueness. */
export function mergeCourts(current: string[], input: string): string[] {
  return parseCourts([...current, ...parseCourts(input)].join(','));
}

/** "7" -> "Court 7"; "Stadium" stays "Stadium". */
export function courtLabel(name: string): string {
  return /^\d+$/.test(name) ? `Court ${name}` : name;
}

/** Suggested list for a venue with a known count: 1..n. */
export function defaultCourts(count: number | null | undefined): string[] {
  if (!count || count <= 0) return [];
  return Array.from({ length: Math.min(count, MAX_COURTS) }, (_, i) => String(i + 1));
}

export function courtCountLabel(courts: string[] | null | undefined): string | null {
  const n = courts?.length ?? 0;
  if (n === 0) return null;
  return `${n} ${n === 1 ? 'court' : 'courts'}`;
}
