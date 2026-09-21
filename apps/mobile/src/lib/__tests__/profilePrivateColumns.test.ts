import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * `profiles.email` and `profiles.date_of_birth` must never be selected by the
 * client.
 *
 * profiles RLS is "public read" with qual = true — every row is readable, by
 * design, because the finder, rosters, group lists and public profiles all need
 * other people's rows. Column grants are the only narrowing. Grant either of
 * these columns and every signed-in user can read every user's address.
 *
 * ── Why this test exists rather than a code review note ─────────────────────
 *
 * On 2026-09-21 the grant was revoked after surveying the readers BY GREP, for
 * `.select('...email...')`. That missed src/lib/services/profile.ts, which
 * builds its select from a column ARRAY. Postgres denies the whole query when
 * one column is denied, so every profile fetch in the app failed at once and
 * production was down until the grant was restored.
 *
 * A reviewer cannot reliably hold "no file anywhere selects this column" in
 * their head. A test can.
 *
 * ── Getting a user's own email ──────────────────────────────────────────────
 *
 * It is on the auth session: `useSession().user.email`. That is the only
 * address the client legitimately needs.
 */

const FORBIDDEN = ['email', 'date_of_birth'] as const;

// Where the columns may legitimately appear: notification-preference flags that
// merely share the word, the auth session, and this test.
const ALLOWED_TOKENS = [
  'notif_email_enabled',
  'email_enabled',
  'user.email',
  'user?.email',
];

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '__tests__') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (/\.tsx?$/.test(full)) acc.push(full);
  }
  return acc;
}

/** Every `.select(...)` argument that follows a `.from('profiles')`. */
function profileSelects(src: string): string[] {
  const out: string[] = [];
  const re = /from\(\s*['"]profiles['"]\s*\)([\s\S]{0,400}?)\.select\(\s*([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) out.push(m[2]);
  return out;
}

describe('profiles: email and date_of_birth never reach the client', () => {
  const root = join(__dirname, '..', '..');
  const files = sourceFiles(root);

  it('scans a plausible number of source files', () => {
    // Guards the guard: a broken walk that finds nothing would pass silently.
    expect(files.length).toBeGreaterThan(100);
  });

  it('no inline select() on profiles names a forbidden column', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const cols of profileSelects(readFileSync(file, 'utf8'))) {
        for (const col of FORBIDDEN) {
          if (new RegExp(`\\b${col}\\b`).test(cols) && !ALLOWED_TOKENS.some((a) => cols.includes(a))) {
            offenders.push(`${relative(root, file)} → select(${cols.trim().slice(0, 80)})`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no column-array literal names a forbidden column', () => {
    // The case that actually caused the outage: the select was built from
    // ['id', 'full_name', 'email', ...].join(', '), so no select() string ever
    // contained the word.
    const offenders: string[] = [];
    const arrays = /\[[^[\]]{0,800}?\]/g;
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      for (const arr of src.match(arrays) ?? []) {
        // Only arrays that look like a profile column list.
        if (!arr.includes("'full_name'") && !arr.includes('"full_name"')) continue;
        for (const col of FORBIDDEN) {
          if (arr.includes(`'${col}'`) || arr.includes(`"${col}"`)) {
            offenders.push(`${relative(root, file)} → [… '${col}' …]`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
