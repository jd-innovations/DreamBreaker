/**
 * Shared formatting for tournament cards.
 *
 * These lived inside (tabs)/index.tsx while only the trending card used them.
 * The tournaments list needs the same output, and two private copies is how
 * the app ended up showing "Aug 30, 2026" on one screen and
 * "Monday, September 28, 2026" on another for the same field.
 */

// "Thursday, October 16, 2026".
//
// Parses by splitting the ISO string rather than handing it to Date. Hermes
// only guarantees bare "YYYY-MM-DD" is parseable; passing an already-formatted
// string back through `new Date(...)` is implementation-defined, and is what
// produced "Invalid Date" on these cards previously.
export function formatEventDay(isoDateStr: string): string {
  const [y, m, d] = (isoDateStr ?? '').split('-').map(Number);
  if (!y || !m || !d) return isoDateStr ?? '';
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

// Shorter variant for dense list rows: "Thu, Oct 16, 2026".
export function formatEventDayShort(isoDateStr: string): string {
  const [y, m, d] = (isoDateStr ?? '').split('-').map(Number);
  if (!y || !m || !d) return isoDateStr ?? '';
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

// A Postgres `time` ("14:30:00") → "2:30 PM". Null when unset, so callers omit
// the field rather than inventing a default.
export function formatStartTime(t: string | null | undefined): string | null {
  const m = /^(\d{2}):(\d{2})/.exec(t ?? '');
  if (!m) return null;
  const d = new Date();
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// "mixed_doubles" → "Mixed Doubles".
//
// Capitalizes the first letter of each whitespace-separated word. Deliberately
// not \b\w, which treats the apostrophe in "men's" as a word boundary and
// yields "Men'S".
export function humanizeFormat(f: string): string {
  return f.replace(/_/g, ' ').replace(/(^|\s)\S/g, c => c.toUpperCase());
}

// Renders a skill band, or null when neither bound is set. A 0 rating means
// "unset", not a real 0.0 level — conflating the two is what put "0 – 0 DUPR"
// on cards whose skill only ever lived on their divisions.
export function formatSkillBand(min: number | null | undefined, max: number | null | undefined): string | null {
  const lo = min && min > 0 ? min : null;
  const hi = max && max > 0 ? max : null;
  if (lo == null && hi == null) return null;
  if (lo != null && hi != null) return lo === hi ? `${lo}` : `${lo}–${hi}`;
  return `${lo ?? hi}`;
}
