# Email Notification Shell — Execution Plan

**Design:** Header A (anchored navy band) + Footer B (navy bookend) — [canvas](https://claude.ai/code/artifact/e4725723-afc2-4521-b007-946c221e62e0)

**Status** (audited against production 2026-09-07 — see note below):

| Phase | State |
|---|---|
| 0 — unresolved-variable fix | ✅ **done, deployed, committed.** `check-email-templates.mjs` run against prod 2026-09-07: 0 templates dropping mail. |
| 1 — asset pipeline | ✅ **done.** All 5 PNGs serving from `email-assets`. |
| 2 — shell module | ✅ **done.** `supabase/functions/_shared/email-shell.ts`, table-based, dark-mode aware. |
| 3 — preview | ✅ **done and live.** `/admin/email-preview`, `dryRun`/`withShell` on `send-transactional-email`. |
| 4 — wrap gate + email_log | ✅ **done and applied.** `layout`/`preheader` columns live in prod; `email_log` is being written. |
| **5 — migrate templates** | ✅ **13/13 done, 2026-09-07.** All wired templates carry `layout='transactional'`; the 11 orphans are untouched, `layout=NULL`, as scoped. Every row verified: shell render, `check-email-templates.mjs` (0 drops), a real send to `delivered@resend.dev`, and a real send to the owner's inbox. See per-row detail below. |
| 5.5 — preference enforcement | 🟡 **half done.** Persistence is real (`profiles.notif_email_enabled`, via `apps/mobile/src/lib/notificationPreferences.ts`, shipped as "Phase 5.1") — the doc's original plan for a separate `notification_preferences` table was superseded by this simpler column-based approach. But `send-transactional-email` **still does not read the flag** — confirmed in code and in the lib file's own comment. `layout='notification'` is still unsafe to use. |
| 6 — preheader/signed links/deep-links | 🟡 **preheader mechanism done** (column + substitution wired); signed per-recipient preference/unsubscribe URLs and deep-linked CTAs **not started** — still hardcoded to the same URL for everyone (`TODO(phase-6)` in both the function and the shell module). |
| 7 — broadcast composer on shell | ❌ **not started.** `web/src/app/admin/page.tsx:674` still sends unbranded `font-family:sans-serif` HTML with no logo/footer/unsubscribe. Blocked on a postal address (CAN-SPAM) — still absent from the repo. |
| 8 — client test matrix | ⚪ **unknown** — manual QA, no repo evidence either way. |

**Template count, corrected (2026-09-07):** production has **24** templates, not
21. Of those, **13 have a real caller** and are healthy (verified via
`check-email-templates.mjs` + tracing every `fn_send_transactional_email` /
`send-transactional-email` call site): the original 10, plus
`facility_manager_approved`, `facility_manager_rejected` (added
2026-09-01), and `review_invite` (fired manually from `/admin/reviews`). These
13 are Phase 5's actual scope — the table below replaces the old 10-row one.

**The other 11 are still orphaned, confirmed still true today, not just a
stale memory:** `checkin_open`, `event_reminder`, `new_match`,
`payment_receipt`, `refund_processed`, `results_ready`, `tournament_cancelled`,
`tournament_pending`, `tournament_published`, `waitlist_added`,
`waitlist_promoted`. Traced every trigger that touches these features
(tournament status changes, payments, refunds, results, matches) — none of
them call the email function. Notably `fn_notify_tournament_status` writes
`tournament_cancelled`/`tournament_pending` to the in-app `notifications` table
but never emails them, while its sibling cases (`tournament_approved`,
`tournament_rejected`) do both. These 11 are out of scope for Phase 5 (no
caller to render-check against) and belong to a separate "wire the orphans"
task.

## Open items (updated 2026-08-21)

### ✅ CLOSED — the mail-dropping incident

Four trigger-fired templates were returning 422 and sending nothing. All 10 now
render with their callers' real payloads; verified against production.

Two distinct failure modes, which is why it took two rounds to find them all:

1. **Undeclared token.** `{{sponsor_logos}}` appeared in 10 templates and nothing
   server-side ever supplied it — the only implementation is an admin *preview*
   helper emitting `display:flex`, and `email_sponsors` has 0 rows. Stripped.
   A SQL query over `email_templates` finds this mode.
2. **Declared, but never passed.** `tournament_rejected` and `director_suspended`
   declared `first_name`/`link` correctly, but their triggers pass only
   `tournament_name`+`reason` and `full_name`. **The SQL query returns clean for
   this mode** — the mismatch exists only between template and caller. Bodies
   rewritten to match what the triggers send.

**`scripts/check-email-templates.mjs` now catches both** and exits non-zero.
Run it after any change to a template body or a trigger's payload.

**Root cause of the whole episode:** template state was repeatedly reasoned about
from migration *files* rather than production *rows*. They diverged months ago —
production carries older seed versions from `20260725000001_seed_config.sql`,
not the cleaner bodies `20260807000000_transactional_email.sql` intended. Query
production before trusting any statement about templates.

### ✅ CLOSED — escaping

All substituted values run through `escapeHtml`. Correct in both text and `href`
positions. (An earlier note here claimed `link_url` could not take a blanket
escape; that was wrong.)

### ✅ CLOSED — shell responsiveness

Fixed and verified by a real send to a phone. See Phase 2 notes.

### Still open

- **The notification preferences screen now persists** (`profiles.notif_email_enabled`
  et al., shipped as "Phase 5.1"), **but `send-transactional-email` never reads it.**
  See **Phase 5.5**. `layout = 'notification'` is still unsafe to use until the
  send path checks the flag.
- **24 templates, 13 wired, 11 orphaned** — see the corrected count above.
- **The wrap gate (Phase 4) is live, but zero templates use it.** All 24 have
  `layout = NULL`, confirmed against prod 2026-09-07. Every email sent today is
  unbranded. This is Phase 5's job — see the implementation plan below.

---

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

**Implementation plan drafted 2026-09-07, against real production bodies** (pulled
via SQL, not assumed from a migration file — see root-cause note above about
why that distinction matters). Scope is the **13 templates with a real
caller**; the 11 orphans have no trigger to render-check against and are a
separate task (see "Wire the orphans" at the end of this phase).

### What changes on every row

1. Strip the wrapper `<div style="font-family:sans-serif;max-width:480px;...">` — the shell's own card supplies the container.
2. Strip every hardcoded `color:#0A1228` / `color:#8A9DC0` / `color:#6B7280` — the shell's `.dbp-body` sets colour per-theme; a body that sets its own renders invisible in dark mode.
3. **Keep the per-template headline as `<h2>`, not drop it.** The original plan text said to delete the `<h1>` entirely; that's wrong on inspection — the four templates repaired during the 2026-08-21 incident (`registration_confirmed`, `tournament_rejected`, `director_approved`, `director_suspended`) already ship a plain `<h2>` headline with no ill effect, and the shell's dark-mode override already targets `.dbp-body h2` generically. Deleting the headline on the other 9 would make them the odd ones out for no gain. **Fix:** normalize `<h1 style="color:...">` → plain `<h2>`, don't remove it.
4. Drop the trailing `<p style="color:#8A9DC0...">Pickleball App</p>` sign-off — the shell's footer already brands every send; keeping it doubles the branding.
5. Add a `preheader` to the 10 rows that don't have one yet (cheap to do while the row is already open; pulls a piece of Phase 6 forward for free).
6. Set `layout = 'transactional'` on all 13. None of these are candidates for `layout = 'notification'` — they're all confirmations/status-changes/receipts tied to something the user did, and Phase 5.5's enforcement isn't wired yet regardless.

### CTA decision — keep inline anchors, don't extend the shell (for now)

The shell has a separate, more robust CTA mechanism (`ctaLabel`/`ctaUrl` →
renders a `<table><td bgcolor>` button, which survives Outlook's Word engine
better than an inline-styled `<a>`), but **`send-transactional-email` never
populates it** for real sends, and `email_templates` has no `cta_label`/`cta_url`
columns to source it from. Wiring that up is a schema change plus a function
change — bigger than "strip colors and set a flag." **Recommendation: leave
the four CTA-bearing templates' inline-styled anchor-as-button as-is.** It already
works today; the risk is cosmetic (Outlook desktop may not render the pill
background, degrading to a plain link) and matches the shell's own accepted
philosophy for `border-radius`/`box-shadow` (see Phase 2). Flag the
table-based-button upgrade as a Phase 6 candidate if the cosmetic gap turns out
to matter in the Phase 8 client matrix.

### Pre-existing bug found while pulling real bodies (fix during this phase, not separately)

`facility_manager_approved` and `review_invite` both have `<a ... class="btn">`
— the shell's `<style>` block **never defines `.btn`**. Today, both buttons
render as a bare unstyled link, independent of the `layout` gate. Since this
phase is already rewriting these two rows, fix it in the same edit: replace
`class="btn"` with the same inline-styled anchor pattern the other CTA
templates already use (`background:#C9A84C;color:#0A1228;padding:12px 24px;
border-radius:999px;text-decoration:none;font-weight:700;display:inline-block;`).

### Per-template new `html_body` (rollback = restore the "before" shown here + `layout = NULL`)

| # | Key | Before → After | Notes |
|---|---|---|---|
| 1 | `director_approved` | Already clean (`<h2>You're an approved director</h2><p>...`) — **no body change.** | ✅ **Done 2026-09-07** — `supabase/migrations/20260907190000_email_phase5_director_approved.sql`. Preview verified (shell renders clean, no leftover color/wrapper), migration applied to prod, real send to `delivered@resend.dev` succeeded (`email_log` shows `status=sent`), `check-email-templates.mjs` still passes 0 drops across all 24 templates. |
| 2 | `director_suspended` | Already clean — **no body change.** | ✅ **Done 2026-09-07** — `supabase/migrations/20260907192000_email_phase5_director_suspended.sql`. Same process as row 1: preview verified, real send to `delivered@resend.dev` succeeded, `check-email-templates.mjs` still 0 drops. |
| 3 | `tournament_rejected` | Already clean — **no body change.** | ✅ **Done** — `20260907193000_email_phase5_tournament_rejected.sql`. |
| 4 | `registration_confirmed` | Already clean — **no body change.** | ✅ **Done** — `20260907194000_email_phase5_registration_confirmed.sql`. |
| 5 | `tournament_approved` | `<h2>Tournament approved</h2><p><strong>{{tournament_name}}</strong> is now live and open for registration.</p>` | ✅ **Done** — `20260907191000_email_phase5_tournament_approved.sql`. First row to exercise the strip-and-rewrite. |
| 6 | `waitlist_offer_expired` | `<h2>Waitlist offer expired</h2><p>Hi {{full_name}}, your 24-hour window to register for <strong>{{tournament_name}}</strong> has passed. Your spot has been offered to the next player on the waitlist.</p>` | ✅ **Done** — `20260907195000_email_phase5_waitlist_offer_expired.sql`. |
| 7 | `support_ticket_new` | `<h2>New support ticket</h2><p><strong>{{reporter_name}}</strong> opened a ticket: <strong>{{subject}}</strong></p>` | ✅ **Done** — `20260907200000_email_phase5_support_ticket_new.sql`. Admin-facing. |
| 8 | `support_ticket_reply` | `<h2>You have a reply</h2><p>A Pickleball App team member replied to <strong>{{subject}}</strong>:</p><p style="border-left:3px solid #C9A84C;padding-left:12px;">{{message_preview}}</p>` | ✅ **Done** — `20260907201000_email_phase5_support_ticket_reply.sql`. Old filled `background:#F3F6FC` quote box would show white-on-light-blue in dark mode — switched to a border-left accent. |
| 9 | `facility_manager_rejected` | Already clean, no CTA — **no body change.** | ✅ **Done** — `20260907202000_email_phase5_facility_manager_rejected.sql`. |
| 10 | `hold_expired` | `<h2>Your hold has expired</h2><p>Hi {{full_name}}, your <strong>Hold My Spot</strong> reservation for <strong>{{tournament_name}}</strong> has expired because registration wasn't completed before the cutoff date.</p><p>Your hold fee has been forfeited per our policy. Your spot has been offered to the next player on the waitlist.</p><p>If you'd still like to attend, you can <a href="{{link_url}}">join the waitlist</a>.</p>` | ✅ **Done** — `20260907203000_email_phase5_hold_expired.sql`. Dropped hardcoded `color:#C9A84C` on the plain text link. |
| 11 | `waitlist_spot_offered` | `<h2>A spot just opened up!</h2><p>Hi {{full_name}}, a spot has opened in <strong>{{tournament_name}}</strong> and you're next on the waitlist.</p><p><strong>You have 24 hours to complete your registration.</strong> After that, the spot moves to the next player.</p><p><a href="{{link_url}}" style="background:#C9A84C;color:#0A1228;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:700;display:inline-block;">Complete Registration</a></p>` | ✅ **Done** — `20260907204000_email_phase5_waitlist_spot_offered.sql`. |
| 12 | `facility_manager_approved` | `<p>Hi {{full_name}},</p><p>You are now the manager of <strong>{{facility_name}}</strong> on Pickleball App. The corrections you submitted have been applied to the listing.</p><p>Next: add your courts and their hourly rates so players can book them.</p><p><a href="https://pickleballapp.app/facility/manage" style="background:#C9A84C;color:#0A1228;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:700;display:inline-block;">Set up your facility</a></p>` | ✅ **Done** — `20260907205000_email_phase5_facility_manager_approved.sql`. Fixed the dead `class="btn"` bug. |
| 13 | `review_invite` | `<p>Hi {{first_name}},</p><p>Thanks for using Pickleball App. How was <strong>{{subject_label}}</strong>?</p><p>It takes about ten seconds, and it helps the next player know what to expect.</p><p><a href="{{review_url}}" style="background:#C9A84C;color:#0A1228;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:700;display:inline-block;">Leave a rating</a></p><p style="font-size:13px;">This link is just for you and expires in 60 days.</p>` | ✅ **Done** — `20260907210000_email_phase5_review_invite.sql`. Fixed the dead `class="btn"` bug; dropped `color:#6B7280` on the fine print. |

**Verification performed on every row above:** shell render (via `dryRun`), a real send to `delivered@resend.dev` (pipeline/log check), a real send to the site owner's inbox (visual check), and a full `check-email-templates.mjs` run after each batch — 0 drops throughout, confirmed again after all 13 landed.

### Rollout order

1. **Batch 1 — no CTA, no bug (rows 1–4):** migrate, verify in `/admin/email-preview` (light + dark + mobile width), set `layout='transactional'`, confirm `check-email-templates.mjs` still passes.
2. **Batch 2 — no CTA, body rewrite (rows 5–9):** same process.
3. **Batch 3 — CTA-bearing + bug fix (rows 10–13):** same process, plus a real test send to `delivered@resend.dev` per row since these carry the highest-risk element (the button).
4. After all 13: re-run `check-email-templates.mjs`, then do one real spot-check send of a low-volume row (`director_suspended` is admin-triggered — safest to fire for real once) end-to-end.

**Acceptance:** all 13 render correctly in preview (light/dark/mobile); `check-email-templates.mjs` exits 0; a spot-check send of each lands correctly per the Phase 8 client matrix; rollback of any single row is `UPDATE email_templates SET layout = NULL, html_body = '<before>' WHERE key = '<key>'` — reversible with no redeploy.

### Wire the orphans (separate task, not part of this phase)

Started 2026-09-08. Status:

| Key | State |
|---|---|
| `tournament_cancelled` | ✅ **Wired.** `20260908001000_email_wire_tournament_cancelled_pending.sql` extends `fn_notify_tournament_status()` (already inserted an in-app notification on this branch, just never emailed) to email the director plus every registrant with `status in ('registered','checked_in','substitute')`. Body rewritten from the dead `{{first_name}}` (profiles has no such column) to `full_name`, migrated straight to `layout='transactional'`. |
| `tournament_pending` | ✅ **Wired.** Same migration/trigger, emails every admin (`profiles.role='admin'`) with a link to `/admin`. |
| `new_match` | ✅ **Wired.** `20260908002000_email_wire_new_match_waitlist_added.sql` extends `create_partner_match_on_mutual_like()` (already fires on a mutual like, already writes the `partner_matches` row) to email both users. Respects `notif_new_match` — the first sender that column has ever had; per `notificationPreferences.ts` it was stored intent only until now. |
| `waitlist_added` | ✅ **Wired.** New trigger `trg_notify_waitlist_added` on `registrations` (`AFTER UPDATE OF status`). Real hook found by tracing the code: there is **no self-service join-waitlist path** — `createRegistration()` always inserts `'registered'`. The only way a row becomes `'waitlisted'` is a director's manual "Waitlist" button in the roster (`moveToWaitlist()` in `apps/mobile/src/lib/supabase/registrations.ts`). `waitlist_position` is confirmed **never populated** (0 of 0 rows, checked against prod) so `{{position}}` is computed at send time from arrival order among other waitlisted rows, not read from that column. |
| `waitlist_promoted` | ⚠️ **Not wired as its own template — fixed a real bug instead.** `promote_next_waitlisted()`'s own doc comment says the *caller* sends the email. `waitlist-sweeper` already does (using `waitlist_spot_offered`, not `waitlist_promoted`). `cancel-registration/index.ts` calls the same RPC on every cancellation but **discarded the returned row and never emailed** — a spot freed by a cancellation notified nobody. Fixed by adding the same `sendTemplateEmail`/`waitlist_spot_offered` call cancel-registration was missing. `waitlist_promoted` itself looks like the same kind of duplicate template name as `tournament_published` — left as an orphan, not deleted. **Not yet deployed** — see below. |
| `refund_processed` | ✅ **Wired.** Hooked into `web/src/app/api/stripe/webhooks/route.ts`'s `charge.refunded` handler — the point a refund is *confirmed* complete (settles the `refunds` row to `succeeded`), not `cancel-registration`'s `submitRefund()` which only marks `submitted`. Scoped to tournament-purpose payments only (`tournament_registration_entry/hold/balance`, `tournament_team_entry`); a reservation or coach-offer refund has no matching copy today and is deliberately left alone. Body rewritten `first_name`→`full_name`. **Code change is in the web app (not a Supabase edge function) — deploys via the normal Vercel flow, not blocked by anything this session.** |
| `tournament_published` | ⛔ **Not a gap — skipped deliberately.** The same `status='open'` transition already emails under the `tournament_approved` key two branches up in the same trigger. Duplicate template name for an already-covered event. |
| `payment_receipt` | 🟡 **Investigated, not wired — genuine product decision needed.** Traced the real payment-success path: `web/src/lib/payments/finalizePayment.ts`'s `finalizeTournamentRegistrationEntry()` inserts the `registrations` row directly, which **already** fires `registration_confirmed` via the existing `fn_notify_registration` trigger. So a paid entry is not silently un-emailed — it gets a confirmation, just not one framed as a receipt with a dollar amount. Sending `payment_receipt` too means **two emails per paid registration**. Decide: (a) fire `payment_receipt` as a second email alongside `registration_confirmed` for paid entries, or (b) fold the amount into `registration_confirmed`'s variables and drop `payment_receipt`. |
| `results_ready` | 🔴 **Investigated, harder than the others.** Real hook exists — `handlePublish()` → `publishAllBrackets(tournamentId)` in `apps/mobile/src/app/tournament/[id]/results.tsx`, a clean director-initiated action. Blocked on content, not on finding a trigger: the template's `{{placement}}` is per-player ("You finished 3rd") and nothing traced so far computes a player's final standing from the bracket/division data. Needs a look at the bracket/standings model before this can be written correctly. |
| `event_reminder` | 🔴 **Not started — needs new infrastructure.** No "N hours/days before the event" check exists anywhere in the codebase. Needs a new scheduled job (same shape as `waitlist-sweeper`'s cron sweeps) querying `tournaments` by `event_date`/`start_time`, plus a decision on send timing (24h before? morning-of?). |
| `checkin_open` | 🔴 **Blocked, not just unwired.** `checkin_opens_at` was already documented elsewhere in the codebase as populated on only 1 of 9 rows ("never a usable stand-in" — `20260823020000_tournament_start_time.sql`), and no manual "open check-in" director action exists to hook instead (the only check-in-adjacent code found is the unrelated facility/court reservation check-in feature). Wiring this means either fixing the underlying data reliability or adding a net-new manual toggle — a product decision, not a wiring task. |

**Verification limitation on every DB-trigger row above** (`tournament_cancelled`, `tournament_pending`, `new_match`, `waitlist_added`): confirmed the full pipeline (trigger function → `fn_send_transactional_email` → edge function → Resend → `email_log`) by calling `fn_send_transactional_email` directly with the exact payload shape the trigger produces — not by actually firing the real event (cancelling a tournament, two real users mutually liking each other, a director moving a real player to the waitlist), which would mutate production data. Every trigger *function* was verified to apply and compile; its *firing condition* has not been exercised end-to-end by a real event. Worth testing each on a throwaway tournament/account before fully trusting it in production.

**Two code changes are written but NOT deployed, blocked by the same permission classifier that blocked the residential-address change earlier this session:**
- `supabase/functions/cancel-registration/index.ts` (the `waitlist_promoted`/`waitlist_spot_offered` fix)
- `supabase/functions/send-transactional-email/index.ts` + `_shared/email-shell.ts` (the residential-address `showAddress` toggle, from earlier)

Both need `supabase functions deploy <name>` run by the owner, or approval of the `deploy_edge_function` tool call.

---

## Phase 5.5 — Make the notification preferences screen real

**BLOCKS any template being set to `layout = 'notification'`.**

`apps/mobile/src/app/notifications-settings.tsx` already ships a Notifications
screen with Email, SMS, Quiet Hours and badge toggles. It is **374 lines of
local React state with no persistence** — the email toggle is literally
`value={emailNotifs} onChange={setEmailNotifs}`. No Supabase call, no
AsyncStorage, no SecureStore anywhere in the file. Every toggle resets to its
hardcoded default on the next mount.

Push is the exception: `handlePushToggle` really does register a device token.
Email and SMS sit beside it looking identical and do nothing.

This is worse than the surface not existing. A user turns off Email
Notifications, watches the toggle move, believes it saved, and keeps receiving
email. That is a trust problem on its own, and a compliance one for anything
that is not strictly transactional.

**Why it gates Phase 5:** `layout = 'notification'` promises the send respects
the user's settings. There is no stored value to read, so flipping any template
to `notification` before this ships means mailing people who have explicitly
opted out.

**Scope** — smaller than "build a preferences UI", because the UI exists:

1. A `notification_preferences` table keyed by `user_id`, with per-channel
   columns (email / sms / push) and per-category rows or columns matching the
   screen's existing categories. RLS: a user reads and writes only their own.
2. Read on mount, write on toggle, in the existing screen. No new UI.
3. `send-transactional-email` consults it when `layout = 'notification'`, and
   skips with an `email_log` row of `status = 'skipped_preference'` rather than
   silently not sending — the same visibility rule Phase 4 established.
4. Quiet Hours and the badge toggles can persist in the same change or be left
   for later; they are not on the email path.

**Note:** transactional mail must ignore this entirely. You cannot opt out of a
receipt for something you paid for, which is exactly why `layout` distinguishes
the two.

**Acceptance:** toggle email off, reload the app, it is still off; a template
with `layout = 'notification'` sent to that user writes `skipped_preference`
and delivers nothing; a `transactional` template still delivers.

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

**First real-inbox check, 2026-09-08 (`refund_processed`, iPhone):** dark-mode card/text/footer all correct, content substitution correct, no unsubscribe link (right for transactional). **Gmail dark mode shows a static/dithering artifact on the logo PNG** in both header and footer; **Apple Mail dark mode renders the identical asset perfectly crisp.** Confirms the asset and the HTML/CSS are fine — this is Gmail's own dark-mode image-recoloring engine doing something to the transparent PNG, which senders cannot reliably escape with CSS alone.

**Open — needs a fix, deferred, not accepted.** Gmail is the dominant mail client; a dithered logo on every dark-mode Gmail open is not a degradation to shrug off the way Outlook's square corners are. Likely fix: re-export `logo-light-v1.png` (and the footer copy) with an **opaque navy background baked in** rather than transparency — Gmail's dark-mode heuristics specifically target images with transparent/anti-aliased edges, so a fully opaque asset (matching the header/footer's own navy) commonly sidesteps the filter entirely. Needs producing the new PNG (this machine has no image-editing tool available, same constraint noted in Phase 1) and re-uploading to the `email-assets` bucket under a new version-stamped filename (`logo-light-v2.png`, per Phase 1's immutable-filename rule), then updating `email-shell.ts`'s two `<img src>` references.

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
