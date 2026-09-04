# Production Configuration Inventory

Every environment variable, secret, and console-side setting this app needs to
run in production — where each one lives, who owns it, and how to verify it is
actually set correctly.

**No secret values appear in this file, and none should ever be added.** Values
live in the systems named below. This document records *names, locations, and
verification steps* only.

Last inventoried: **2026-08-24**. Re-run the verification commands rather than
trusting this table — it is a map, not a source of truth.

---

## How to use this

Configuring a new deploy means working through five planes, in this order.
Each has its own section below.

| # | Plane | Holds | Verify with |
| --- | --- | --- | --- |
| 1 | **Vercel** | web runtime + build vars | Vercel dashboard (see caveat) |
| 2 | **Supabase Edge Function secrets** | server-side API keys | `npx supabase secrets list` |
| 3 | **Supabase Dashboard** | Auth providers, email, DB | `curl` + dashboard |
| 4 | **EAS** | mobile build-time vars | `npx eas env:list <env>` |
| 5 | **Third-party consoles** | Stripe, Google, Resend, Apple | each console |

Plus config committed to the repo (§6), which needs no secrets but does need
review.

### About the "Owner" column

This project currently has a single maintainer, so every owner below is a
**role**, not a person. Before anyone else is given deploy access, replace these
with named people — an unowned credential is one nobody notices expiring.

---

## 1. Vercel — web application

Consumed by the Next.js app in `web/`. `NEXT_PUBLIC_*` vars are **inlined into
the client bundle at build time**, so changing one requires a redeploy, not a
restart.

| Variable | Consumed by | Env | Secret? | Owner | Verify |
| --- | --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `web/src/lib/supabase/*` | all | no | Platform | `node scripts/check-env.js` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `web/src/lib/supabase/*` | all | no (publishable) | Platform | `node scripts/check-env.js` |
| `SUPABASE_SERVICE_ROLE_KEY` | `web/src/lib/supabase/service.ts`, Stripe webhook | all | **YES** | Platform | webhook processes an event end to end |
| `STRIPE_SECRET_KEY` | `web/src/app/api/stripe/**` | all | **YES** | Payments | a PaymentIntent is created without a 401 |
| `STRIPE_WEBHOOK_SECRET` | `web/src/app/api/stripe/webhooks/route.ts` | all | **YES** | Payments | Stripe dashboard shows 200s, not 400s |
| `NEXT_PUBLIC_APP_URL` | `web/src/lib/legal.ts`, Stripe Connect return URLs | all | no | Platform | Connect onboarding returns to the right host |
| `APPLE_TEAM_ID` | `web/src/app/.well-known/apple-app-site-association/route.ts` | prod | no | Mobile | `curl https://pickleballapp.app/.well-known/apple-app-site-association` |
| `DEV_TOOLS_SECRET` | `web/src/app/api/dev/**` | **dev only** | **YES** | Platform | see warning below |
| `NEXT_PUBLIC_SENTRY_DSN` | `instrumentation-client.ts`, `sentry.*.config.ts` | all | no (public by design) | Platform | `/api/admin/sentry-test` as an admin |
| `SENTRY_AUTH_TOKEN` | build-time source-map upload | all | **YES** | Platform | stack traces show filenames, not chunk offsets |

**`DEV_TOOLS_SECRET` must be UNSET in production.** It gates the dev-only
payment-simulation and test-fixture routes. Those routes already hard-404 when
`NODE_ENV === "production"`, so this is defence in depth — but setting it in
production removes one of the two locks on a route that can mark payments
succeeded without Stripe.

**`APPLE_TEAM_ID` vs `APPLE_DEVELOPER_TEAM_ID`:** the AASA route reads
`APPLE_TEAM_ID` first and falls back to `APPLE_DEVELOPER_TEAM_ID`. Set
**`APPLE_TEAM_ID`**; the fallback exists for an older name and should not be
relied on. If neither is set the route serves a placeholder and Universal Links
silently stop working.

> **Caveat: Vercel env vars could not be enumerated when this was written.**
> There is no `.vercel/` link in the repo and no MCP tool that lists project env
> vars, so the table above is derived from **code that reads them**, not from
> Vercel itself. Confirm the actual set in the Vercel dashboard before trusting
> it. A var the code reads but Vercel does not have will fail at request time,
> not at build time — except the two `NEXT_PUBLIC_*` Supabase vars, which
> `scripts/check-env.js` catches at build (item 2.3).

**Deployment protection matters here.** Vercel is set to
`ssoProtection: all_except_custom_domains`, so every `*.vercel.app` URL returns
a login page. Stripe webhooks work only because they point at
`pickleballapp.app`. Repointing them at a preview or project URL breaks delivery
silently.

---

## 2. Supabase Edge Function secrets

Set with `npx supabase secrets set NAME=value`. Available to edge functions via
`Deno.env.get()`.

Verify the full set:

```bash
npx supabase secrets list
```

(That prints digests, not values — safe to run and paste.)

| Secret | Consumed by | Secret? | Owner | Verify |
| --- | --- | --- | --- | --- |
| `STRIPE_SECRET_KEY` | `_shared/payments.ts` → all 7 payment-intent functions, `cancel-registration` | **YES** | Payments | a refund or PaymentIntent succeeds |
| `RESEND_API_KEY` | `send-transactional-email` | **YES** | Comms | send a test email; check Resend logs |
| `GOOGLE_PLACES_API_KEY` | `facility-photo` | **YES** | Platform | a facility photo loads |
| `GOOGLE_WEATHER_API_KEY` | `event-weather` | **YES** | Platform | a tournament page shows weather |
| `CLAUDE_API` | `marketplace-improve-listing` | **YES** | Platform | "Improve listing" returns text |
| `PUBLIC_APP_URL` | `waitlist-sweeper` | no | Platform | waitlist emails link to the right host |

**Platform-managed, do not set by hand:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `SUPABASE_JWKS`,
`SUPABASE_PUBLISHABLE_KEYS`, `SUPABASE_SECRET_KEYS`. Supabase injects these into
every function automatically. They appear in `secrets list` and are not yours to
manage.

**Naming note:** the Anthropic key is `CLAUDE_API`, **not** `ANTHROPIC_API_KEY`.
Earlier notes called it the latter. It is set and working.

---

## 3. Supabase Dashboard

Settings with no representation in the repo. `supabase/config.toml` describes
the **local** stack only — it is not evidence about the hosted project.

| Setting | Where | Owner | Verify |
| --- | --- | --- | --- |
| Google auth provider (client ID + secret) | Auth → Providers → Google | Auth | `curl` below |
| Apple auth provider (Services ID + signed JWT) | Auth → Providers → Apple | Auth | `curl` below |
| Apple **Authorized Client IDs** (native token audience) | Auth → Providers → Apple | Auth | native Sign in with Apple succeeds on device |
| Site URL + redirect allowlist | Auth → URL Configuration | Auth | OAuth returns to the app, not an error page |
| Email confirmation requirement | Auth → Providers → Email | Auth | see gap G2 |
| SMTP / email sending | Auth → Emails | Comms | password reset arrives |

Verify which providers are live on the hosted project:

```bash
curl -s -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  https://fbzetvkbhneptvfruilw.supabase.co/auth/v1/settings
```

As of 2026-08-24 this returns `apple`, `email`, and `google` enabled. It proves
each provider is **enabled with non-empty credentials** — not that the
credentials are valid. Only a real sign-in proves that.

The **Apple Authorized Client IDs** field is dashboard-only and cannot be read
by any tool available here. It must contain the app's current bundle identifier
(§6). See gap G4.

**Project:** `dreambreaker-pb` / `fbzetvkbhneptvfruilw`.

---

## 4. EAS — mobile builds

`EXPO_PUBLIC_*` vars are **compiled into the binary**. Changing one requires a
new build; it cannot be fixed by an OTA update or a server change.

Verify per environment:

```bash
cd apps/mobile
npx eas env:list production     # also: development, preview
node ./scripts/validate-eas-env.js
```

| Variable | Consumed by | Environments | Secret? | Owner | Verify |
| --- | --- | --- | --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | `src/lib/supabase.ts` | all 3 | no | Platform | app loads any data |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `src/lib/supabase.ts` | all 3 | no (publishable) | Platform | app loads any data |
| `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` | PaymentSheet | all 3 | no (publishable) | Payments | see gap **G1** |
| `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY` | `app.config.js` → native Android config | all 3 | **YES** (restrict by package + SHA) | Platform | map renders on Android |
| `EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY` | `app.config.js` → native iOS config | all 3 | **YES** (restrict by bundle id) | Platform | map renders on iOS |
| `EXPO_PUBLIC_APP_ENV` | `src/lib/featureFlags.ts` | set in `eas.json`, not EAS env | no | Platform | `validate-eas-env.js` |
| `EXPO_PUBLIC_SENTRY_DSN` | `src/lib/observability/sentry.ts` | all 3 | no (public by design) | Platform | a test crash reaches Sentry |
| `SENTRY_AUTH_TOKEN` | Sentry Expo config plugin (source maps) | preview, production | **YES** | Platform | crash shows a filename, not `index.android.bundle:1:…` |

**`EXPO_PUBLIC_APP_ENV` is declared in `eas.json` per build profile, not in the
EAS environment store.** It drives every feature flag and beta-scope decision.
`resolveAppEnv()` fails closed — an unrecognised value silently becomes
`production`. That exact bug shipped internal QA builds as production once; hence
`validate-eas-env.js`, which runs against `eas.json` and must stay green.

Profile → env mapping: `development` → `development`, `preview` → `internal`,
`production` → `production`.

**Push credentials (APNs key, FCM):** EAS-managed, not in this repo and not in
any env var. Inspect with `npx eas credentials`. There is no
`google-services.json` or `GoogleService-Info.plist` committed — Android FCM
setup is unverified (gap G6).

**App identity** (`04fcdd30-fb9e-47e2-9371-8e4e8b521c17`) is in `app.json` under
`extra.eas.projectId` and is also the OTA update URL host.

---

## 5. Third-party consoles

| Service | What lives there | Owner | Verify |
| --- | --- | --- | --- |
| **Stripe** | secret + publishable keys, webhook endpoint & signing secret, Connect settings | Payments | Developers → Webhooks shows 200s from `pickleballapp.app` |
| **Google Cloud** | Maps SDK (iOS + Android), Places, Weather API keys and their restrictions | Platform | each feature renders; check quota/restriction errors |
| **Resend** | API key, verified sending domain | Comms | `notifications@pickleballapp.app` sends and does not land in spam |
| **Apple Developer** | Team ID, bundle id, Sign in with Apple capability, APNs key, associated domains | Mobile | Universal Links open the app from a cold start |
| **Google Play** | package name, signing, service account | Mobile | not yet verified — no Android hardware (gap G6) |
| **Anthropic** | API key behind `CLAUDE_API` | Platform | "Improve listing" returns text |
| **Sentry** | org `jd-innovations`; projects `react-native` (mobile) and `javascript-nextjs` (web); org auth token (`org:ci`) | Platform | events appear with correct release + environment tags |

**Sending identity:** `Pickleball App <notifications@pickleballapp.app>`,
hardcoded in `supabase/functions/send-transactional-email/index.ts`. Changing the
sending domain means editing that file, not a config value.

---

## 6. Committed configuration (no secrets, still needs review)

| File | Holds | Why it matters |
| --- | --- | --- |
| `apps/mobile/app.json` | name, slug `dreambreaker`, scheme `pickleballapp`, bundle id / package **`app.pickleballapp`**, version, EAS project id | bundle id must match Apple provider allowlist + Google Cloud key restrictions |
| `apps/mobile/app.config.js` | associated domains (`applinks:pickleballapp.app`), Maps keys injection, permission strings | Universal Links and native perms |
| `apps/mobile/eas.json` | build profiles, channels, `EXPO_PUBLIC_APP_ENV` | feature-flag correctness |
| `supabase/config.toml` | **local dev stack only** | not evidence about the hosted project |
| `web/.env.local.example` | local dev template | keep in step with §1 |

---

## Gaps and unverified items

Tracked here rather than fixed silently. Each has an owner and a decision to
make.

### G1 — Stripe stays in test mode until App Store launch **(decided 2026-08-25)**

`EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` is a `pk_test_` key in all three EAS
environments including `production`, and web uses `sk_test_`. **This is
deliberate.** Beta runs entirely in test mode; the switch to live happens as
part of going live on the App Store, not before.

That means payments and refunds described as "live money" elsewhere in the plan
(items 3.1-3.3) were test-mode transactions. The engineering conclusions stand —
test mode exercises the identical webhook, refund and reconciliation paths — but
the wording overstates what was proven.

#### The switch is not a key swap — read this before doing it

Stripe keeps test and live as **separate worlds**. Nothing carries over.

| What changes | Consequence |
| --- | --- |
| Secret + publishable keys | New `sk_live_` / `pk_live_` in Vercel and EAS |
| **Webhook endpoint** | Live mode needs its **own** endpoint registered against `pickleballapp.app`, with a **different signing secret**. The current `STRIPE_WEBHOOK_SECRET` will silently reject every live event |
| **Connect accounts** | Test-mode connected accounts **do not exist in live mode**. Every director must re-onboard Stripe Connect from scratch, or payouts fail |
| Customers, products, payments | None of the existing rows exist in live mode. The `payments`, `refunds` and `stripe_webhook_events` tables will hold test-mode ids forever — they are history, not something to migrate |

Ordering, because two of these cannot be hotfixed:

1. Register the live webhook endpoint and get its signing secret **first** —
   otherwise the first live payment succeeds at Stripe and is never finalized.
2. Set Vercel's `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` and promote.
3. Set EAS `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` and **cut a new build** —
   mobile bakes this in, so it cannot be changed by an OTA update.
4. Have every director re-onboard Connect before taking real entry fees.

Steps 2 and 3 must land in the same window. A live secret key with a
`pk_test_` app means every mobile payment fails at once.

**Owner: Payments.**

### G2 — ~~Email signup requires no confirmation~~ **RESOLVED — the gap was never real**

Closed 2026-08-25 by device testing (item 5.2, case 8): a real sign-up on the
iOS preview build **did** demand email verification and refused access until it
was done. Confirmation is enforced.

The gap was an artefact of how it was measured. `/auth/v1/settings` reports
`mailer_autoconfirm: true` — and still does, today, while the flow plainly
requires confirmation. That field reflects a GoTrue environment variable that
does **not** track the hosted dashboard's "Confirm email" setting, so it is not
evidence about signup behaviour either way.

**Do not re-derive this gap from that endpoint.** The endpoint is fine for
"which providers are enabled" (it lists `apple`, `email`, `google`, and that
matches reality); it is not fine for confirmation policy. The only reliable
check is signing up with a fresh address.

Carried, uncorrected, from 2026-08-19 to 2026-08-25 — six days of a security
gap on the books that did not exist.

### G3 — Vercel environment variables are unverified

Not enumerable from the repo (no `.vercel/` link, no MCP tool that lists them).
§1 is derived from code that reads them. **Action:** confirm against the Vercel
dashboard and record the date here. **Owner: Platform.**

### G4 — Apple provider allowlist vs. the post-rebrand bundle id

Native Sign in with Apple (`signInWithIdToken`) requires the app's bundle
identifier in the Apple provider's **Authorized Client IDs** field. The current
bundle id is **`app.pickleballapp`**; `APPLE_SIGNIN_PHASE7.md` documents it as
`com.dreambreakerpb.app`, from before the rebrand. Supabase rejects the token
outright if the allowlist is wrong, so a successful native sign-in on a current
build is the proof — the field itself cannot be read from tooling.
**Action:** sign in with Apple on a current build. **Owner: Auth.**

### G5 — No product analytics *(crash reporting resolved 2026-08-25)*

Crash reporting is now wired: `@sentry/nextjs` on web, `@sentry/react-native`
on mobile, with scrubbing, release and environment tags — see the entries above.
**Analytics (4.2) is still unaddressed:** no PostHog, Amplitude or Segment.
Sentry is an error sink, not an analytics one, and using it as such would burn
the error quota. **Owner: Platform.**

Note the two DSNs are marked public deliberately. A DSN only permits *sending*
events to its project, never reading them, and both are inlined into client
bundles at build time — marking them secret would hide them from your own
dashboards while still shipping them to every user.

### G6 — Android push and Play Console unverified

No `google-services.json` committed; APNs/FCM credentials are EAS-managed and
unaudited. Blocked on Android hardware (open item D4). **Owner: Mobile.**

### G7 — `web/.env.local.example` was incomplete

It listed four variables; the app reads eight. Updated alongside this document.
**Action:** when adding a var to §1, add it to the example file in the same
change. **Owner: Platform.**

---

## Full verification pass

Run in order. Every command here was exercised on 2026-08-24.

```bash
# 1. Web build-time Supabase config (fails the build if wrong)
cd web && node scripts/check-env.js

# 2. Edge function secrets present
npx supabase secrets list

# 3. Auth providers live on the hosted project
curl -s -H "apikey: <anon key>" \
  https://fbzetvkbhneptvfruilw.supabase.co/auth/v1/settings

# 4. Mobile env, per environment
cd apps/mobile
npx eas env:list production
node ./scripts/validate-eas-env.js

# 5. Database migrations in sync
npx supabase migration list --linked
```

Then, in the consoles: Stripe webhook deliveries returning 200; Resend domain
verified; Google Cloud keys unexpired and restricted to the right bundle
id/package.
