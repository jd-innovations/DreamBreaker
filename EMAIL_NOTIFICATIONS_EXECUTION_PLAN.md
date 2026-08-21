# Email Notification Shell — Execution Plan

**Design:** Header A (anchored navy band) + Footer B (navy bookend) — [canvas](https://claude.ai/code/artifact/e4725723-afc2-4521-b007-946c221e62e0)

**Status** (2026-08-20):

| Phase | State |
|---|---|
| 0 — unresolved-variable fix | ✅ **done and deployed** (`send-transactional-email` v8). Still uncommitted in git. |
| 1 — asset pipeline | ✅ **done.** Bucket applied; all 5 PNGs uploaded and serving, byte-identical to `supabase/email-assets/`. |
| 2 — shell module | ✅ **built, not yet wired.** `supabase/functions/_shared/email-shell.ts`. Sample output at `email-shell.preview.html` — open in a browser. |
| 3–8 | not started |

**Added to scope since drafting:**

- **Write to `public.email_log`.** The table exists in the baseline with the right shape (`status`, `error`, `provider_id`, `template_key`, `to_email`) and **nothing writes to it**. Because `fn_send_transactional_email` is fire-and-forget via `pg_net`, every failure — including Phase 0's new 422 — is currently invisible outside edge-function logs. One insert per outcome fixes that and gives Phase 8 something to verify against. Fits naturally in Phase 4.
- **Escaping of variable values is unresolved.** `substitute()` injects values raw into HTML, so a director-chosen tournament name containing `<a href="…">` becomes live markup in the email. Mail clients don't execute script, so this is a phishing surface rather than XSS. Escaping needs care: `link_url` is substituted inside an `href`, so a blanket escape would break it. **Open decision.**

---

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Header / footer | **Header A + Footer B** | Both navy in every theme. No client can invert them, so light/dark/system needs no per-client defence. |
| Where the shell lives | **Code** — `supabase/functions/_shared/email-shell.ts` | Brand chrome is not prod-editable content. Template *copy* stays in Postgres where the admin UI edits it. |
| Where templates live | **Postgres, unchanged** | Resend templates cap string variables at 2,000 chars, which kills the one-shell-with-`{{{BODY}}}` design; the alternative duplicates the shell 10×. Resend stays a dumb pipe. |
| How the shell is applied | **Wrapped at send time**, gated on a new `layout` column | Lets templates migrate one at a time with zero-downtime and per-row rollback. |

**Consequence of picking Footer B:** the footer is navy, so both header and footer use the white/gold wordmark. `logo-navy.png` is not needed — one logo asset total.

**Social set:** Facebook, Instagram, YouTube, TikTok — drawn from **Ionicons**, matching the app's icon set. (X/Twitter is dropped from the earlier mockup.) Profile URLs are placeholders until Phase 5.

---

## Phase 0 — Fix the unresolved-variable fallback *(independent, ship first)*

Live bug, unrelated to the shell but in the code we're about to touch.

[`send-transactional-email/index.ts:23-25`](supabase/functions/send-transactional-email/index.ts#L23-L25):

```ts
return text.replace(/\{\{(\w+)\}\}/g, (match, key) => variables[key] ?? match);
```

A caller that omits a variable ships the literal token to a real recipient — *"You're registered for {{tournament_name}}"*.

**Do:** collect unresolved keys; if any remain, log them with the template key and return 422 rather than sending. Callers pass fixed variable sets, so a miss is a bug, never a valid state.

**Acceptance:** a send missing a declared variable returns 422 and sends nothing; the error names the template key and the missing variables.

---

## Phase 1 — Asset pipeline

Email clients strip inline SVG (Gmail, Outlook, Yahoo). Every glyph becomes a hosted PNG.

**Create** a public Supabase Storage bucket `email-assets` (public read, service-role write). Precedent: `tournament-covers` already exists.

**Upload**, all at 2× display size with **version-stamped, immutable filenames** so CDN caching is never a fight:

| File | Source | Display | Asset |
|---|---|---|---|
| `logo-light-v1.png` | `apps/mobile/assets/images/pickleballapp-logo-light.png` (920×172, already ≥2×) | 380px header / 168px footer | 920×172 |
| `social-facebook-v1.png` | Ionicons `logo-facebook` | 32px | 64×64 |
| `social-instagram-v1.png` | Ionicons `logo-instagram` | 32px | 64×64 |
| `social-youtube-v1.png` | Ionicons `logo-youtube` | 32px | 64×64 |
| `social-tiktok-v1.png` | Ionicons `logo-tiktok` | 32px | 64×64 |

Only the **white/gold wordmark** is needed — Footer B is navy, so the navy lockup never appears. That is a direct saving from the Header A + Footer B choice.

### Social icons

Source is **Ionicons**, the app's existing icon set (see `DESIGN_TOKENS.md`). All four glyphs ship in the bundled font already — verified present in `apps/mobile/node_modules/@expo/vector-icons/.../Ionicons.json`:

| Glyph | Codepoint |
|---|---|
| `logo-facebook` | U+F3ED |
| `logo-instagram` | U+F3F9 |
| `logo-youtube` | U+F42C |
| `logo-tiktok` | U+F418 |

**Generating the PNGs.** The bundled asset is a TTF, not SVG. Take the SVG source from the `ionicons` npm package (`node_modules/ionicons/dist/svg/logo-*.svg`, viewBox `0 0 512 512`), recolour the path to `#FFFFFF`, composite it inside the gold ring (`1px rgba(201,168,76,0.35)`, 32px circle), and rasterise to 64×64 with a transparent background.

The ring must be **baked into the PNG** — a CSS-bordered circle is not reliably renderable across email clients.

Note: this machine has no ImageMagick or Pillow, so the rasterising step needs a tool installed (`sharp` or `resvg-js` both handle SVG→PNG) or a design-tool export.

**Social URLs are placeholders** — the canvas uses `href="#"`. Real profile URLs are needed before Phase 5 ships, but they do not block Phases 1–4.

**Acceptance:** all five URLs load publicly over HTTPS without auth; filenames are never reused for different artwork; the four icons are optically consistent in weight at 32px.

---

## Phase 2 — Build the shell module

**New:** `supabase/functions/_shared/email-shell.ts` (create `_shared/` if absent).

```ts
renderEmail(opts: {
  preheader: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  preferencesUrl: string;
  unsubscribeUrl?: string;
}): string

renderText(opts: { preheader: string; bodyText: string; ... }): string
```

Build rules, all non-negotiable for client compatibility:

- **Table-based layout throughout.** Outlook on Windows renders via Word: no flex, no grid, no `gap`. The canvas mockups are flex and do not transfer directly.
- **`<meta name="color-scheme">` + `supported-color-schemes`**, plus a `prefers-color-scheme` block as *progressive enhancement only*. Apple Mail honours it; Gmail force-inverts regardless. Header A and Footer B survive both because they are navy either way — that is the whole point of the pairing.
- **Styled alt text on every image.** A blocked white logo on a navy band is an empty navy rectangle; alt text set white and bold keeps "Pickleball App" readable when images are off.
- **Hosted image URLs, never base64.** Gmail clips messages over ~102 KB and hides the rest behind "View entire message"; embedded images blow that instantly.
- `border-radius` and `box-shadow` degrade to square in Outlook. Accepted.
- Body content is injected as a trusted HTML string — the shell does not escape it. Template bodies are authored by staff, not users.

**Acceptance:** a fixture body renders to valid HTML; the file has no flex/grid properties; every `<img>` has `width`, `height`, and styled `alt`.

---

## Phase 3 — Preview before anything ships

Deploying email blind is the failure mode this phase exists to prevent.

**Add** `dryRun?: boolean` to the edge function's request body. When set, it resolves the template, wraps it, and returns `{ subject, html, text }` **without calling Resend**.

This deliberately avoids a cross-runtime problem: the shell is a Deno module and the web app is Next.js, so the preview page cannot import it directly. Rendering through the function keeps exactly one implementation.

**Add** `web/src/app/admin/email-preview/page.tsx` — template-key dropdown, editable sample variables, iframe of the returned HTML, light/dark toggle.

**Acceptance:** every one of the 10 template keys renders in the preview without sending; `dryRun` never reaches `api.resend.com`.

---

## Phase 4 — Wire the wrap (no-op deploy)

**Migration:** add `layout text` to `email_templates`, nullable, default `NULL`.

**Function:** wrap only when `template.layout IS NOT NULL`. Since no row has a layout yet, this deploy changes nothing that goes out — it is safe to ship and sit on.

The column also buys the transactional-vs-marketing split cheaply later, rather than being a schema change under pressure.

**Acceptance:** deployed to prod with all 10 templates sending byte-identical output to today.

---

## Phase 5 — Migrate templates, one at a time

For each of the 10 keys: strip `html_body` to its inner content (drop the wrapper `<div>`, the `<h1>`, and the sign-off line — the shell supplies all three), then set `layout = 'transactional'`.

> **Template bodies must not set their own text colour.** The shell owns colour so dark mode works: in dark the card becomes `#101A34`, and a body carrying `color:#0A1228` renders navy-on-navy and disappears. The current rows hardcode `color:#0A1228` 16 times and `color:#8A9DC0` 7 times — **stripping those is part of this phase, not optional polish.** Bodies should carry structure only (`<p>`, `<strong>`, `<h2>`) and inherit colour from the shell's `.dbp-body` wrapper.

Current keys and variables:

| Key | Variables |
|---|---|
| `registration_confirmed` | `tournament_name` |
| `tournament_approved` | `tournament_name` |
| `tournament_rejected` | `tournament_name`, `reason` |
| `director_approved` | `full_name` |
| `director_suspended` | `full_name` |
| `support_ticket_new` | `subject`, `reporter_name` |
| `support_ticket_reply` | `subject`, `message_preview` |
| `waitlist_spot_offered` | `full_name`, `tournament_name`, `link_url` |
| `hold_expired` | `full_name`, `tournament_name`, `link_url` |
| `waitlist_offer_expired` | `full_name`, `tournament_name` |

The three carrying `link_url` map straight onto the shell's CTA button.

Verify each in the preview **before** setting `layout`. Rollback for any single template is `UPDATE ... SET layout = NULL` plus restoring its old body — reversible per row, no redeploy.

**Acceptance:** all 10 render correctly in preview; a spot-check send of each lands correctly in the Phase 8 client matrix.

---

## Phase 6 — The things none of the templates have

- **Preheader text.** The inbox preview line after the subject. No template has one today, so recipients see whatever the first body words are. Add a `preheader` column and a hidden preheader div in the shell. Highest-value item in this plan for open rates.
- **Plain-text alternative.** You send HTML-only, which is spam-scored. Resend accepts `text` alongside `html`; `renderText()` supplies it.
- **Real preferences and unsubscribe URLs.** Currently `#`. Needs a signed per-recipient token so the link works from an email client with no session.
  - *Transactional* mail (all 10 current templates) links to **notification preferences**, not unsubscribe — you should not offer to unsubscribe someone from their own booking confirmation.
  - *Broadcast* mail gets a true unsubscribe plus `List-Unsubscribe` and `List-Unsubscribe-Post` headers for one-click.
- **Deep-linked CTAs.** Universal links falling back to `https://pickleballapp.app`, so the button opens the app when installed.

**Open dependency:** whether a notification-preferences surface already exists. If not, a minimal one is in scope here — the footer link must not 404.

---

## Phase 7 — Bring the broadcast composer onto the shell

[`admin/page.tsx:641`](web/src/app/admin/page.tsx#L641) currently sends:

```ts
html: `<div style="font-family:sans-serif;white-space:pre-wrap">${composeBody.replace(/</g, "&lt;")}</div>`
```

No logo, no footer, no unsubscribe — every broadcast you have ever sent went out unbranded. Wrapping the ad-hoc `html` path (default on, `wrap: false` escape hatch) fixes that for free.

Broadcasts are marketing, not transactional: they need the true unsubscribe, the `List-Unsubscribe` headers, and a postal address. This is where a second `layout` value (`'marketing'`, using the Footer C treatment from the canvas) earns its place.

**Blocked on:** a postal address for the footer. CAN-SPAM requires one and nothing in the repo has it.

---

## Phase 8 — Client test matrix

Render checks against real clients — there is no substitute:

| Client | Checking for |
|---|---|
| Gmail web + Android + iOS | forced dark-mode inversion, 102 KB clipping |
| Apple Mail (macOS + iOS) | `prefers-color-scheme` path |
| Outlook Windows | table layout, squared corners, no flex fallback |
| Outlook.com web | colour rewriting |

Use `delivered@resend.dev` for pipeline checks; never fake addresses at real providers — they bounce and cost you sender reputation.

**Acceptance:** header and footer render correctly with images on *and* blocked, in light and dark, in every row.

---

## Risks

| Risk | Mitigation |
|---|---|
| Double-wrapped HTML mid-migration | The `layout` gate — an unmigrated row is never wrapped |
| Blocked images leave an empty navy band | Styled alt text (Phase 2) |
| Gmail 102 KB clipping | Hosted assets, never base64 |
| Outlook drops the layout | Table-based build, verified in Phase 8 |
| Preview and production drift | Preview renders through the function, not a copy |

---

## Out of scope

- Rewriting the body copy of the 10 templates — a content pass, separate from the shell.
- Push-notification parity with email.
- **Pre-existing inconsistency, flagged not fixed:** the deep-link scheme is `dreambreaker` while the brand is Pickleball App (see `docs/REBRAND_PICKLEBALL_APP.md`). Phase 6 CTAs will use the existing scheme; renaming it is its own migration.
