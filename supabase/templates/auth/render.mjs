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

// GoTrue substitutes {{ .ConfirmationURL }} itself. It is swapped in AFTER
// rendering because the shell's safeUrl() passes only http(s) and would
// otherwise turn the Go template token into "#".
const TOKEN = 'https://GOTRUE-CONFIRMATION-URL-PLACEHOLDER';
const swap = (html) => html.split(TOKEN).join('{{ .ConfirmationURL }}');

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
  },
  'confirm-signup.html': {
    preheader: 'Confirm your email address to finish signing up.',
    bodyHtml: `
          <p>Welcome to Pickleball App. Confirm this email address to finish setting up your account.</p>
          <p>If you didn&#39;t create an account, you can safely ignore this email.</p>`,
    ctaLabel: 'CONFIRM EMAIL',
    ctaUrl: TOKEN,
  },
};

for (const [file, opts] of Object.entries(templates)) {
  const html = swap(renderEmail({ ...common, ...opts }));
  if (!html.includes('{{ .ConfirmationURL }}')) throw new Error(`${file}: CTA token missing`);
  if (html.includes('PLACEHOLDER')) throw new Error(`${file}: placeholder leaked`);
  writeFileSync(join(here, file), html);
  console.log(`${file}  ${Buffer.byteLength(html)} bytes`);
}
