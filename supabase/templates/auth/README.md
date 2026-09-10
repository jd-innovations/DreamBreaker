# GoTrue auth email templates

The two emails Supabase Auth sends — **Confirm signup** and **Reset password** —
wrapped in the same shell as every other Pickleball App email
(`supabase/functions/_shared/email-shell.ts`).

These are **not** part of the `email_templates` table or
`send-transactional-email`. GoTrue renders them itself from templates stored in
the Supabase Dashboard, sends them over the project's SMTP as
`no-reply@pickleballapp.app`, and writes nothing to `email_log`. That separation
is why they were still unstyled long after Phase 5 wrapped the app templates.

## Applying

Dashboard → Authentication → Emails. Paste the file body into the matching
template. Subjects are set separately in that same screen and are unchanged:

| File | Template | Subject |
|---|---|---|
| `confirm-signup.html` | Confirm signup | Confirm your email address |
| `reset-password.html` | Reset password | Reset your password |

## Regenerating

Do NOT hand-edit the HTML — it is generated from the shell, so an edit here is
lost the next time anyone regenerates, and drifts from the 19 app templates in
the meantime. Edit `render.mjs` (copy/CTA/preheader) or the shell itself, then:

```
node render.mjs .
```

Requires `typescript` from `web/node_modules` to transpile the shell; see the
header of `render.mjs`.

## Decisions baked in

- **`{{ .ConfirmationURL }}`** drives the gold CTA button. It is swapped in
  after rendering because the shell's `safeUrl()` passes only `http(s)` and
  would otherwise turn the Go template token into `#`.
- **No unsubscribe link.** You cannot opt out of a password reset.
- **No postal address.** Transactional mail; the address on file is
  residential. Matches `showAddress` defaulting to false in the shell.
- **The `<h2>` that repeated the subject verbatim is gone.** Under the logo
  band it read as three near-identical stacked lines.
- **The year in the footer is frozen at render time** (`2026`). Regenerate each
  January, or move these to a Send Email Hook so they render live.
