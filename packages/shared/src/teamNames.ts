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
//   - guest names are never shortened: a director typed them and they can be
//     anything ("Coach Dee", "Mike T");
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
      if (p.guest) continue;
      const full = display(p);
      const s = shortName(full);
      if (!fullsByShort.has(s)) fullsByShort.set(s, new Set());
      fullsByShort.get(s)!.add(full);
    }
  }
  const one = (p: TeamPerson) => {
    const full = display(p);
    if (p.guest) return full;
    const s = shortName(full);
    return (fullsByShort.get(s)?.size ?? 1) > 1 ? full : s;
  };
  return (people) => people.map(one).join(' / ');
}
