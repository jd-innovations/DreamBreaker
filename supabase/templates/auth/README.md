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

- **The CTA is a `token_hash` link on our own domain**, not
  `{{ .ConfirmationURL }}` — changed 2026-09-13 after device testing.

  ConfirmationURL points at `https://<ref>.supabase.co/auth/v1/verify?…&redirect_to=…`,
  so the link the user *taps* is supabase.co, which the app does not claim. iOS
  opens Safari, GoTrue verifies, and only then redirects to pickleballapp.app —
  and **iOS does not fire universal links on a redirect**, so the browser owns
  the session and the app never opens. That is what happened on device: the
  confirm link landed in the web app even though `/auth/confirm` was correctly
  listed in the AASA (verified at Apple's CDN) with a real app screen behind it.

  The links are now `…/auth/confirm?token_hash={{ .TokenHash }}&type=signup`
  and `…/auth/reset?token_hash={{ .TokenHash }}&type=recovery` — our claimed
  paths, nothing redirecting in front of them. No code change was needed:
  `completeEmailConfirmation()` / `completePasswordRecovery()` and
  `web/src/lib/auth/redeem-url.ts` all already redeemed this shape.

  Still swapped in after rendering, for the original reason: `safeUrl()` passes
  only `http(s)` and would turn a bare Go token into `#`.

  **Caveat:** an in-app browser (the Gmail app's, notably) can swallow universal
  links whatever the link shape. Test in Apple Mail before blaming the template.
- **No unsubscribe link.** You cannot opt out of a password reset.
- **No postal address.** Transactional mail; the address on file is
  residential. Matches `showAddress` defaulting to false in the shell.
- **The `<h2>` that repeated the subject verbatim is gone.** Under the logo
  band it read as three near-identical stacked lines.
- **The year in the footer is frozen at render time** (`2026`). Regenerate each
  January, or move these to a Send Email Hook so they render live.
