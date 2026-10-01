// How a tournament team's names are displayed, shared by web and mobile
// (owner, 2026-10-01). Two formats:
//
//   teamLines   one full name per row: bracket cards, score dialogs, the
//               champion card — anywhere with room for two rows.
//   short       "A. Waters / A. Bright": single-line places such as the live
//               queue, pool standings and the leaderboard.
//
// Shortening guesses the surname, so it is conservative:
//   - the last word is the surname ("Anna Leigh Waters" -> "A. Waters"), and a
//     trailing suffix stays with it ("John Smith Jr." -> "J. Smith Jr.");
//   - a single-word name is left alone;
//   - a guest name (typed by the director, so it can be anything) is shortened
//     only when it looks like a first and last name: two or more words, each
//     starting with a capital, and a last word longer than an initial.
//     "Andrei Daescu" -> "A. Daescu"; "Mike T", "coach dee" stay as typed
//     (owner, 2026-10-01);
//   - two different players who would shorten to the same text in one field
//     keep their full names (makeTeamShortener).
// Wherever a name is shortened, the full names belong in the title / label.

export type TeamPerson = { name: string; guest?: boolean };

const SUFFIXES = new Set(['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv', 'v']);

/** "Anna Leigh Waters" -> "A. Waters"; "John Smith Jr." -> "J. Smith Jr."; "Cher" -> "Cher". */
export function shortName(full: string): string {
  const words = full.trim().split(/\s+/).filter(Boolean);
  let suffix = '';
  if (words.length > 2 && SUFFIXES.has(words[words.length - 1].toLowerCase())) {
    suffix = ` ${words.pop()}`;
  }
  if (words.length < 2) return full.trim();
  return `${words[0].charAt(0).toUpperCase()}. ${words[words.length - 1]}${suffix}`;
}

const display = (p: TeamPerson) => p.name.trim() || 'Player';

/** A guest name safe to shorten: "Andrei Daescu" yes; "Mike T", "coach dee", "Cher" no. */
export function looksLikeFullName(name: string): boolean {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length > 2 && SUFFIXES.has(words[words.length - 1].toLowerCase())) words.pop();
  if (words.length < 2) return false;
  const last = words[words.length - 1].replace(/\.$/, '');
  // A capital is a cased letter equal to its upper case (no regex Unicode
  // classes, so it behaves the same on Hermes).
  const capital = (w: string) => { const c = w.charAt(0); return c !== c.toLowerCase() && c === c.toUpperCase(); };
  return last.length > 1 && words.every(capital);
}

const shortenable = (p: TeamPerson) => !p.guest || looksLikeFullName(p.name);

/** One full name per row, in team order. */
export function teamLines(people: TeamPerson[]): string[] {
  return people.map(display);
}

/** Full names on one line, for titles and screen-reader labels. */
export function teamFull(people: TeamPerson[]): string {
  return teamLines(people).join(' / ');
}

/**
 * A shortener for one field (a division): every team that may appear together
 * goes in, so two players who would shorten to the same text keep full names.
 */
export function makeTeamShortener(field: TeamPerson[][]): (people: TeamPerson[]) => string {
  const fullsByShort = new Map<string, Set<string>>();
  for (const team of field) {
    for (const p of team) {
      if (!shortenable(p)) continue;
      const full = display(p);
      const s = shortName(full);
      if (!fullsByShort.has(s)) fullsByShort.set(s, new Set());
      fullsByShort.get(s)!.add(full);
    }
  }
  const one = (p: TeamPerson) => {
    const full = display(p);
    if (!shortenable(p)) return full;
    const s = shortName(full);
    return (fullsByShort.get(s)?.size ?? 1) > 1 ? full : s;
  };
  return (people) => people.map(one).join(' / ');
}
