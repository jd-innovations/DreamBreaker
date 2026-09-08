#!/usr/bin/env node
/*
  Proves every trigger-fired email template can actually render with the
  variables its caller really sends.

  Why this exists: on 2026-08-21 four templates were silently dropping mail in
  production. Two failure modes, and only this check catches both.

    1. A body references a token not in its `variables` array
       ({{sponsor_logos}}, which nothing server-side ever supplied). A SQL
       query over email_templates finds these.
    2. A body references a token that IS declared, but the TRIGGER never passes
       it. The SQL query returns clean for these - the mismatch only exists
       between the template and its caller, so nothing in the table reveals it.

  The map below is the source of truth for mode 2 and must mirror the actual
  callers: the fn_notify_* triggers in
  supabase/migrations/20260807000000_transactional_email.sql, plus
  supabase/functions/waitlist-sweeper/index.ts. When a trigger's payload or a
  template's body changes, update this map in the same commit.

  Runs against DEPLOYED code via dryRun, so it reflects production, not the
  working tree. Read-only: no email is ever sent.

  Usage from repo root (reads web/.env.local):
    node scripts/check-email-templates.mjs

  Exits non-zero if any template would drop mail.
*/

import fs from 'node:fs';
import path from 'node:path';

// key -> exactly what its caller passes today.
const TRIGGER_PAYLOADS = {
  // fn_notify_registration
  registration_confirmed: { tournament_name: 'Sample Tournament' },
  // fn_notify_tournament_status
  tournament_approved: { tournament_name: 'Sample Tournament' },
  tournament_rejected: { tournament_name: 'Sample Tournament', reason: 'Sample reason.' },
  // fn_notify_director_status
  director_approved: { full_name: 'Sample Name' },
  director_suspended: { full_name: 'Sample Name' },
  // fn_notify_support_ticket_new / _reply
  support_ticket_new: { subject: 'Sample subject', reporter_name: 'Sample Name' },
  support_ticket_reply: { subject: 'Sample subject', message_preview: 'Sample reply.' },
  // waitlist-sweeper
  waitlist_spot_offered: { full_name: 'Sample Name', tournament_name: 'Sample Tournament', link_url: 'https://pickleballapp.app/t/sample' },
  hold_expired: { full_name: 'Sample Name', tournament_name: 'Sample Tournament', link_url: 'https://pickleballapp.app/t/sample' },
  waitlist_offer_expired: { full_name: 'Sample Name', tournament_name: 'Sample Tournament' },
};

function readEnv() {
  const p = path.join(process.cwd(), 'web', '.env.local');
  if (!fs.existsSync(p)) {
    console.error(`Missing ${p} — run from the repo root.`);
    process.exit(2);
  }
  const env = Object.fromEntries(
    fs.readFileSync(p, 'utf8').split('\n')
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
  );
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('web/.env.local needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(2);
  }
  return env;
}

async function main() {
  const env = readEnv();
  const url = `${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-transactional-email`;
  const headers = { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' };

  // Mode 1: any token in a body or subject that is not declared.
  const rest = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/email_templates?select=key,subject,variables,html_body&order=key`,
    { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } },
  );
  const templates = await rest.json();
  if (!Array.isArray(templates)) { console.error('Could not read email_templates:', templates); process.exit(2); }

  const undeclared = [];
  for (const t of templates) {
    const tokens = [...new Set([...`${t.html_body} ${t.subject}`.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))];
    const bad = tokens.filter((k) => !(t.variables ?? []).includes(k));
    if (bad.length) undeclared.push(`${t.key} -> ${bad.join(', ')}`);
  }

  // Mode 2: render each trigger-fired template with its caller's real payload.
  const drops = [];
  for (const [key, variables] of Object.entries(TRIGGER_PAYLOADS)) {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ templateKey: key, variables, dryRun: true }) });
    const body = await res.json().catch(() => ({}));
    if (res.ok) console.log(`  ok     ${key}`);
    else { console.log(`  DROPS  ${key.padEnd(24)} missing: ${(body.missing ?? []).join(', ') || res.status}`); drops.push(key); }
  }

  const untested = templates.map((t) => t.key).filter((k) => !(k in TRIGGER_PAYLOADS));

  console.log(`\n${templates.length} templates | ${Object.keys(TRIGGER_PAYLOADS).length} trigger-fired checked`);
  console.log(`undeclared tokens : ${undeclared.length ? undeclared.join(' | ') : 'none'}`);
  console.log(`dropping mail     : ${drops.length ? drops.join(', ') : 'none'}`);
  if (untested.length) {
    console.log(`\nnot trigger-fired, so not render-checked (${untested.length}):\n  ${untested.join(', ')}`);
    console.log('  If any of these gains a caller, add it to TRIGGER_PAYLOADS.');
  }

  const failed = undeclared.length + drops.length;
  if (failed) { console.error(`\nFAIL — ${failed} problem(s).`); process.exit(1); }
  console.log('\nAll trigger-fired templates render with their real payloads.');
}

main().catch((e) => { console.error(e); process.exit(2); });
