// Regenerates the two GoTrue auth email templates in this directory:
//
//   node supabase/templates/auth/render.mjs
//
// Imports the REAL shell (supabase/functions/_shared/email-shell.ts) rather
// than a copy, so these templates cannot drift from the 19 app templates that
// send through send-transactional-email. The shell is Deno TypeScript, so it
// is transpiled on the fly with the `typescript` package from web/node_modules
// and its one Deno API (Deno.env.get, for the asset base) is stubbed.
//
// See README.md in this directory for what gets applied where, and why the
// unsubscribe link, postal address and repeated <h2> are all absent.

import { writeFileSync, mkdtempSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const shellTs = join(repoRoot, 'supabase', 'functions', '_shared', 'email-shell.ts');

const require = createRequire(pathToFileURL(join(repoRoot, 'web', 'package.json')));
const ts = require('typescript');

const js = ts.transpileModule(readFileSync(shellTs, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;

const tmp = join(mkdtempSync(join(tmpdir(), 'email-shell-')), 'shell.mjs');
writeFileSync(tmp, js);

// The shell reads SUPABASE_URL to build the hosted-asset base. Undefined here
// makes it fall back to the production project URL, which is what these
// templates must point at.
globalThis.Deno = { env: { get: () => undefined } };
const { renderEmail } = await import(pathToFileURL(tmp).href);

// The CTA is swapped in AFTER rendering because the shell's safeUrl() passes
// only http(s) and would otherwise turn a Go template token into "#".
const TOKEN = 'https://GOTRUE-CONFIRMATION-URL-PLACEHOLDER';
const swap = (html, href) => html.split(TOKEN).join(href);

// Why these are token_hash links on OUR domain, and not {{ .ConfirmationURL }}.
//
// ConfirmationURL points at the Supabase project host:
//
//   https://<ref>.supabase.co/auth/v1/verify?token=...&redirect_to=https://pickleballapp.app/auth/confirm
//
// So the link the user TAPS is supabase.co -- a domain the app does not claim.
// iOS opens Safari, GoTrue verifies, and only then 302s to pickleballapp.app.
// **iOS does not fire universal links on a redirect**, so by the time our
// claimed domain is reached the browser already owns the session and the app
// never opens. Confirmed on device 2026-09-13: tapping "CONFIRM EMAIL" landed
// in the web app with /auth/confirm correctly listed in the AASA (checked at
// Apple's CDN, not just our origin) and a real app screen waiting at that path.
//
// A token_hash link is our own claimed URL with no redirect in front of it, so
// iOS matches it against the AASA and opens the app. Both redeemers already
// accept this shape, which is why this is a template change and not a code one:
// completeEmailConfirmation()/completePasswordRecovery() in the app, and
// web/src/lib/auth/redeem-url.ts for anyone without it installed.
//
// `&amp;` rather than a bare `&`: this is an HTML attribute, and the mail
// client decodes the entity before following the link.
const CTA = {
  reset: 'https://pickleballapp.app/auth/reset?token_hash={{ .TokenHash }}&amp;type=recovery',
  confirm: 'https://pickleballapp.app/auth/confirm?token_hash={{ .TokenHash }}&amp;type=signup',
};

const common = {
  preferencesUrl: 'https://pickleballapp.app/settings/notifications',
  // No unsubscribeUrl: you cannot opt out of a password reset.
  // No showAddress: transactional mail, and the address on file is residential.
};

const templates = {
  'reset-password.html': {
    preheader: 'Choose a new password for your Pickleball App account.',
    bodyHtml: `
          <p>We received a request to reset your password. Use the button below to choose a new one.</p>
          <p>This link can only be used once, and it expires after a short while. If you didn&#39;t request this, you can safely ignore this email &mdash; your password will stay as it is.</p>`,
    ctaLabel: 'RESET PASSWORD',
    ctaUrl: TOKEN,
    href: CTA.reset,
  },
  'confirm-signup.html': {
    preheader: 'Confirm your email address to finish signing up.',
    bodyHtml: `
          <p>Welcome to Pickleball App. Confirm this email address to finish setting up your account.</p>
          <p>If you didn&#39;t create an account, you can safely ignore this email.</p>`,
    ctaLabel: 'CONFIRM EMAIL',
    ctaUrl: TOKEN,
    href: CTA.confirm,
  },
};

for (const [file, { href, ...opts }] of Object.entries(templates)) {
  const html = swap(renderEmail({ ...common, ...opts }), href);
  if (!html.includes('{{ .TokenHash }}')) throw new Error(`${file}: CTA token missing`);
  if (html.includes('PLACEHOLDER')) throw new Error(`${file}: placeholder leaked`);
  // The whole point of the change: the tapped link must be a path the AASA
  // claims, with nothing redirecting in front of it.
  if (!html.includes('https://pickleballapp.app/auth/')) throw new Error(`${file}: CTA is not on the claimed domain`);
  if (html.includes('supabase.co/auth/v1/verify')) throw new Error(`${file}: CTA still goes through GoTrue's redirect`);
  writeFileSync(join(here, file), html);
  console.log(`${file}  ${Buffer.byteLength(html)} bytes`);
}
