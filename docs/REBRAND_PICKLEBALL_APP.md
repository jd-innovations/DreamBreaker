# Rebrand: everything becomes "Pickleball App"

Recorded 2026-08-19. **Nothing in this note has been applied.** It supersedes
the narrower "1.4 cleanup" note — the rename is not confined to the legal pages,
so scoping it that way would have been wrong.

Read `docs/LEGAL_AND_SUPPORT_SURFACES.md` for what item 1.4 built; this note
covers the rename across the whole codebase.

## Target identity

| Field | Value |
| --- | --- |
| App name | **Pickleball App** |
| Domain | **pickleballapp.app** |
| Legal entity | **JD Innovations LLC** |
| Address | **11615 Gramercy Park Ave, Bradenton, Florida 34211** |
| Support email | **support@pickleballapp.app** |

### What is being replaced

There are **three** brand names in the tree right now, not one:

| Current string | Occurrences (code only) | Where |
| --- | --- | --- |
| `DreamBreaker` / `DreamBreakerPB` / `DreamBreaker PB` | 171 lines, 88 files | mobile 63, web 40, supabase 68 |
| `Compete Pickleball` | 8 lines | web only — site title, footer copyright, share text, admin copy |
| `dreambreakerpb.com` | 5 lines | mobile ×2, web ×2, supabase edge function ×1 |

Counts exclude `supabase/migrations_legacy/`, build output, logs, and the ~40
occurrences in root-level markdown reports.

### One thing is already right

`supabase/functions/send-transactional-email/index.ts:11` already sends from
`notifications@pickleballapp.app`. Only the display name (`DreamBreakerPB`) is
stale. Outbound email is the one surface where the new domain is live today.

## Store state — verified 2026-08-20, nothing is locked

- `eas build:list` returns **20 builds, all iOS, zero Android**. Google Play has
  never seen this app, so `com.dreambreakerpb.app` as a package name is
  completely free.
- One `production` / `STORE` iOS build finished 2026-08-19, but
  `eas submit:list` returns **empty** — nothing was submitted through EAS, and
  confirmed with the owner that **nothing has been uploaded to App Store Connect**.

**Every identity decision below is still reversible, and this is the cheapest
moment it will ever be.** Once the app is publicly released, the bundle
identifier and package name are permanent and the rebrand collapses to
display-name-only.

## Decisions

**Settled 2026-08-20:**

| Decision | Value |
| --- | --- |
| Bundle identifier / package name | **`app.pickleballapp`** (was `com.dreambreakerpb.app`) |
| URL scheme | **`pickleballapp://`** (was `dreambreaker://`) |

`app.pickleballapp` is the reverse-DNS of the domain with the duplicate `.app`
segment dropped. It is valid on both platforms — Android requires at least two
segments, each beginning with a letter. It also appears in
`web/src/app/.well-known/apple-app-site-association/route.ts:1`, which must be
redeployed in the same change or universal links break.

The scheme change is coordinated across five places: `app.json`,
`apps/mobile/src/lib/externalRouting.ts:48`, the `supabase/config.toml:39-40`
docs, the **Supabase Auth redirect allow-list** (dashboard action), and a
forward migration for the claim-link DB function at
`20260725000000_baseline_from_prod.sql:818`, which builds
`'dreambreaker://claim/' || v_token`. Doing it now is free; once real users have
claim links in their inboxes it is not.

### Still open

1. **Privacy contact.** The privacy policy promises a `privacy@` address and a
   30-day response. Either create `privacy@pickleballapp.app` or collapse it to
   `support@pickleballapp.app`.
2. **Governing law**, Terms §16 — still `[GOVERNING LAW JURISDICTION]`. Florida
   is the obvious answer given the entity, but leave it for legal review.
3. **The logo lockup.** `apps/mobile/src/app/(tabs)/landing.tsx:219` renders
   `DREAMBREAKER` with a separately-styled `PB` suffix (`styles.logoPB`), and
   line 311 does the same for `Join DreamBreakerPB!`. That is a two-part layout,
   not a string — it needs a design decision, not a substitution.

## Tier 1 — identity and config

- `apps/mobile/app.json` — `name`, `slug`, `scheme`, `ios.bundleIdentifier`,
  `android.package`. **Changing `slug` can break the EAS project link**
  (`extra.eas.projectId` = `04fcdd30-…`); verify with `eas project:info` before
  and after, and expect to re-run `eas env:push`.
- `apps/mobile/app.config.js` — also carries brand values; reconcile with
  `app.json` rather than editing one of the two.
- App icon, splash, and adaptive icon assets under `apps/mobile/assets/images/`.
- **`apps/mobile/app.config.js:9,51,58` — the three native permission strings**
  (camera, location, photo library). These are the iOS system dialogs a user
  reads before granting access, and Apple reviews them. They name
  "DreamBreaker". `app.config.js` spreads and overrides `app.json`, so these are
  the live values — edit them there, not in `app.json`.
- `supabase/config.toml:1,39-40` — comments only, but they are the documentation
  for the Auth redirect allow-list.

## Tier 2 — the domain is not a cutover, the repo is just stale

**Verified live 2026-08-20:**

| Check | Result |
| --- | --- |
| `https://pickleballapp.app/` | **200** — the Next app is already served here |
| `https://pickleballapp.app/.well-known/apple-app-site-association` | **200**, `ZSH27U747N.com.dreambreakerpb.app`, 8 path patterns |
| `https://dreambreakerpb.com/…` | **DNS failure — the domain does not resolve at all** |

The infrastructure move already happened. There is nothing to cut over and
nothing to keep redirecting: `dreambreakerpb.com` is simply dead.

**Consequence: every `dreambreakerpb.com` string in the repo is a dead link
today**, including the four legal/support URLs item 1.4 shipped and the
help-centre link that predates it. `pickleballapp.app/legal/terms` and the
other three currently return **404** only because 1.4's work is not yet
committed or deployed. Fixing the two constants and deploying makes all of it
resolve at once.

This is the highest-value, lowest-risk change in this document and it does not
depend on any of the open decisions.

`dreambreakerpb.com` → `pickleballapp.app`:

- `web/src/lib/legal.ts` — `SITE_URL`, `SUPPORT_EMAIL`, `PRIVACY_EMAIL`, plus
  `LEGAL_ENTITY` and `LEGAL_ADDRESS` (currently the bracketed placeholders).
- `apps/mobile/src/lib/legal.ts` — `LEGAL_BASE_URL`, `SUPPORT_EMAIL`.
- `apps/mobile/src/components/support/SupportSheet.tsx:15` — a **duplicate**
  private `HELP_CENTER_URL`. Fold it into `lib/legal.ts` instead of editing it.
- `web/src/app/api/stripe/connect/start/route.ts:87` — hardcoded fallback origin
  for Stripe Connect onboarding returns. A stale value strands sellers on a dead
  page mid-onboarding.
- `supabase/functions/waitlist-sweeper/index.ts:8` — `APP_URL` fallback. The
  comment on line 12 records that this function has **already shipped the wrong
  brand once**; it is the highest-risk single line in this list.
- **Already correct:** `apps/mobile/app.config.js:17` sets
  `associatedDomains: ['applinks:pickleballapp.app']`, and that domain is in fact
  serving a valid AASA. Universal links are consistent today.
- Infrastructure: confirm `NEXT_PUBLIC_APP_URL` and `PUBLIC_APP_URL` are set to
  `https://pickleballapp.app` in Vercel and in Supabase edge-function secrets, so
  the hardcoded fallbacks above are never the value that gets used.

## Tier 3 — production state that repo edits do not reach

**This is the tier that gets missed.** Editing the migration files changes what
a fresh database would contain; it does not change the rows production already
has. Each of these needs a deliberate action against the live project, and item
2.1's reconciliation rules apply — no `db push --linked` in the current state.

- **`email_templates` rows.** Seven templates in
  `supabase/migrations/20260807000000_transactional_email.sql` and three in
  `…_waitlist_sweeper_templates.sql` carry `DreamBreakerPB` in the visible email
  footer and body. Production sends from those rows. Needs an `UPDATE`
  migration, not a re-seed.
- `supabase/migrations/20260725000001_seed_config.sql:38,47,178` — two email
  subjects and the `premium-membership` wallet item name/description, all live
  rows.
- The `claim` deep-link function at `…baseline_from_prod.sql:818` — see decision 2.
- Supabase Auth redirect allow-list, if the scheme changes.
- Supabase project display name is `dreambreaker-pb` — cosmetic, dashboard only.
- Stripe: `merchantDisplayName` is `'DreamBreaker PB'` in
  `apps/mobile/src/lib/payments/useReservationPayment.ts:38` and
  `useTournamentEntryPayment.ts:141` — this is what appears in the Apple Pay /
  Google Pay sheet. The Stripe account's own business name and statement
  descriptor also need updating in the Stripe dashboard so the charge on a
  player's card statement matches the app they paid in.

## Tier 4 — user-visible copy

Straightforward substitution, but do it by review rather than by blind
`sed` — see "Do not rename" below.

- **Mobile**, 46 files. Highest-traffic: `(tabs)/landing.tsx` (logo lockup),
  `(tabs)/profile.tsx`, `sign-up.tsx`, `account-settings.tsx`,
  `help-support.tsx`, `permissions-settings.tsx`, `rating-settings.tsx`,
  `apply-director.tsx`, `coach/index.tsx`, `QRScanner.native.tsx` (camera
  permission text), `communityShare.ts` and the various share strings, and
  `profileSetup.ts:32`.
- **Web**, 19 files. `layout.tsx:36` (the site `<title>`),
  `footer.tsx:69` (copyright), the six `mobile-link-fallback` descriptions
  (`booking`, `claim`, `coach/offers`, `conversation`, `groups`, `marketplace`),
  `mobile-link-fallback.tsx:13`, `dashboard/profile-settings.tsx:174`,
  `settings/page.tsx:72`, `admin/page.tsx:1393,1453`, `tournaments/page.tsx:200`,
  `tournaments/[id]/page.tsx:707,1044`.
- **The legal documents.** The app name is written out in prose, not read from a
  constant: `metadata.title` and `metadata.description` on all four pages
  (`legal/terms`, `legal/privacy`, `legal/delete-account`, `help`), the intro
  paragraph of Terms and Privacy, "Open the DreamBreaker app" in the deletion
  page's step 1, and the two `&ldquo;DreamBreaker&rdquo;` short-name definitions
  in Terms §1 and §13. Bump `LEGAL_LAST_UPDATED` in `web/src/lib/legal.ts` —
  it is the visible "last updated" line on all three documents.
- `web/src/components/shared/dreambreaker-insights.tsx` — component name, file
  name, and `data-testid`. Its visible label already says "Compete Insights", a
  fourth name, so decide what the feature is called before renaming the file.

## Tier 5 — internal, no deadline

- `DreamBreakerPB Design System v1` header comments in `apps/mobile/src/theme/*`
  and `src/components/index.ts`; `design-lab.tsx` sample copy.
- `supabase/seed/coach_marketplace_dev_seed.sql` — `@coach.dreambreaker.test`
  seed emails. Dev-only fixtures.
- Root-level markdown reports (~40 occurrences). These are **historical
  records** of work done under the old name. Renaming them rewrites history for
  no benefit; leave them and let this note explain the discontinuity.

## Do not rename

- **`web/src/app/director/page.tsx:151`** — `"Team-based, Dreambreaker end"`.
  A *dreambreaker* is the MLP tiebreaker format. This is a pickleball term that
  happens to collide with the old brand, and a blind find/replace corrupts it.
  Check any other match in a tournament-format context for the same reason.
- **`supabase/migrations_pending/20260725011000_par_v1_replay_engine.sql:138`** —
  `pg_advisory_xact_lock(hashtext('dreambreaker.par_replay_all'))`. An internal
  lock key. Changing it during a rolling deploy would let two replays run
  concurrently.
- `supabase/migrations_legacy/` — an archive; item 2.1 depends on it matching
  what was actually applied.
- Anything in `supabase/migrations/` that has already been applied to
  production, except via a new forward migration (2.1's rule).

## Execution plan — status 2026-08-20

> **To actually run this, follow `docs/REBRAND_RUNBOOK.md`** — 19 numbered
> steps in dependency order. This section records what is already done and why.

Ownership: **[me]** = repo change, **[you]** = external console action.

### Step 1 — revive the dead links ✅ DONE (repo)

- ✅ `web/src/lib/legal.ts` — entity `JD Innovations LLC`, address, domain,
  `SUPPORT_EMAIL`. `PRIVACY_EMAIL` deliberately **aliases `SUPPORT_EMAIL`**
  rather than naming a mailbox that does not exist; the policy promises a
  30-day response there.
- ✅ `apps/mobile/src/lib/legal.ts` — `LEGAL_BASE_URL`, `SUPPORT_EMAIL`.
- ✅ `SupportSheet.tsx` — duplicate `HELP_CENTER_URL` folded into `@/lib/legal`.
- ✅ `web/…/stripe/connect/start/route.ts` and
  `supabase/functions/waitlist-sweeper/index.ts` — both fallbacks.
- ✅ `supabase/functions/send-transactional-email/index.ts` — sender display name.
- **[you]** confirm `NEXT_PUBLIC_APP_URL` (Vercel) and `PUBLIC_APP_URL`
  (Supabase function secrets) are `https://pickleballapp.app`.
- **[you]** deploy web — the four 1.4 routes 404 until then.
- **[you]** redeploy the `waitlist-sweeper` and `send-transactional-email`
  edge functions.

### Step 2 — identity ✅ DONE (repo), one blocking action yours

- ✅ `app.json` — `name: "Pickleball App"`, `bundleIdentifier` / `package`
  `app.pickleballapp`, `scheme: "pickleballapp"`.
- ✅ `app.config.js` — all three native permission strings.
- ✅ `web/…/apple-app-site-association/route.ts` — new bundle id.
- ✅ `externalRouting.ts` protocol match; `config.toml` scheme docs.
- ⚠️ **[you] BLOCKING — add `pickleballapp://` and `pickleballapp://reset-password`
  to the Supabase Auth redirect allow-list BEFORE the next build.** The repo now
  emits the new scheme; a build made before the allow-list is updated will fail
  OAuth and password reset. `config.toml:38-42` lists the full expected set.
- ❌ **[you] NOT DONE — `slug` is still `dreambreaker`** and the EAS project is
  still named `dreambreaker`. Deliberately left alone: the slug must match the
  EAS project, so renaming is a coordinated expo.dev rename plus a config
  change, and getting it wrong breaks builds. Invisible to users. Do it as its
  own step with `eas project:info` checked either side.
- **[you]** new icon and splash assets if the mark changes.
- **[you]** one `preview` build to verify OAuth, password reset and universal
  links on device. Expect an Apple sign-in prompt — the new bundle id needs new
  credentials.

### Step 3 — user-facing copy ✅ DONE (repo)

- ✅ 42 mobile files, 19 web files, all three brand names converged on
  "Pickleball App". `Compete Pickleball` and `Compete Insights` are gone.
- ✅ Logo lockup: `landing.tsx` kept its two-part navy+gold structure —
  `PICKLEBALL` + gold `APP`, and `Join Pickleball` + gold `App!`. **My call, not
  a design decision** — change it if the real mark differs.
- ✅ `DreamBreakerInsights` → `PickleballAppInsights`, file renamed to
  `pickleball-app-insights.tsx`, `data-testid` updated.
- ✅ The MLP *dreambreaker* format term in `director/page.tsx:151` was guarded
  through the sweep and is intact.
- ✅ Legal document prose, titles and meta descriptions.

### Step 4 — production data ✅ MIGRATION WRITTEN, not applied

`supabase/migrations_pending/20260820000000_rebrand_pickleball_app.sql`, held
out of the replay path per item 2.1.

Verified read-only against production before writing it:

- 8 `email_templates` rows carry the old brand (subject / html_body / name).
- 1 `wallet_partners` row (`premium-membership`).
- The `create_personal_match_claim_link` body in the migration is
  **byte-identical to production's** — md5 `7e10f0d70b3a92267dcdb229f517b337`,
  1732 chars — once the scheme literal is restored. It changes the scheme and
  nothing else. The body is extracted verbatim rather than hand-written; it
  carries `#variable_conflict`, a revoke-then-regenerate loop, and error codes
  the app depends on.

- **[you]** apply it, then
  `supabase migration repair --status applied 20260820000000`.
- **[you]** Stripe dashboard: business name and statement descriptor.
- **[you]** Supabase project display name (`dreambreaker-pb`), cosmetic.

### Step 5 — cosmetics ✅ DONE (repo)

Theme header comments, `design-lab` samples, component barrel. Dev seed emails
(`@coach.dreambreaker.test`) left alone — fixtures, and changing them would
churn seeded test data for no benefit.

## Verification

- `cd web && npx tsc --noEmit && npm run build` — the four legal/support routes
  must still prerender static.
- `cd apps/mobile && npx tsc --noEmit && npm run lint` — lint must stay at the
  0.2 baseline of 0 errors / 64 warnings.
- `grep -rniI "dreambreaker\|compete pickleball" apps/mobile/src web/src` — the
  only survivors should be the two "do not rename" entries.
- Load all four legal/support URLs on the new domain.
- Send one transactional email of each type and read the footer.
- Run an Apple Pay or Google Pay sheet and check the merchant name.
- Open a universal link on a device with the app installed, and with it removed.
