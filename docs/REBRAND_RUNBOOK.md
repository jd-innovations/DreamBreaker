# Rebrand runbook — Pickleball App

Ordered steps to finish the rebrand.

**Progress: Steps 1–9, 13, 16 and 19 are done as of 2026-08-20; Step 14 is done
except Apple sign-in.** One open blocker: **Step 20**, which must be fixed
before App Store submission.

Superseded status line: **Steps 1–9 and 16 are done as of 2026-08-20.** The legal/support
pages are live on `pickleballapp.app`, the web app serves the new brand and
bundle id, both edge functions are redeployed, and the production data is
rebranded with migration history in parity. **Step 10 (Stripe) is next.**

What remains is Stripe's business name, the optional EAS rename, icon assets,
and a mobile build — nothing blocking, and nothing that touches the web app.

**Ownership:** 🧑 = you, in a console I cannot reach. 🤖 = me, on request.

**The ordering is not cosmetic.** Step 3 must precede any mobile build, and
Step 5 must precede Step 6. The rest can slip without harm.

---

## Phase A — get the code out of the working tree

### 1. ✅ DONE — reviewed and committed

81 changed paths across two apps plus Supabase. Worth reading the diff before it
becomes history:

```bash
git diff --stat
git diff apps/mobile/app.json apps/mobile/app.config.js
```

Then a commit per concern, not one giant one:

- `feat(legal): add terms, privacy, deletion and support pages` — item 1.4
- `feat: rebrand to Pickleball App` — identity, domain constants, copy sweep
- `feat(db): rebrand production email templates and claim scheme` — the pending
  migration
- `docs: record the rebrand plan and runbook`

### 2. ✅ DONE — pushed (no PR needed; see Step 5)

```bash
git push -u origin feature/expo-mobile-foundation
```

Do **not** merge yet — Step 3 has to land first, or the deploy in Step 5 ships a
web app whose AASA advertises a bundle id no build uses yet. That is harmless but
confusing; landing them in order avoids explaining it later.

---

## Phase B — the blocking console change

### 3. ✅ DONE — new scheme added to the Auth redirect allow-list

**This blocks every mobile build from here on.** The repo now emits
`pickleballapp://`; a build made before this lands fails OAuth sign-in and
password reset with a redirect mismatch.

Supabase dashboard → Authentication → URL Configuration → Redirect URLs. The
full expected set is documented in `supabase/config.toml:38-42`:

```
https://pickleballapp.app/auth/callback
pickleballapp://
pickleballapp://reset-password
https://pickleballapp.app/**
exp://**                          (only if you use Expo Go / dev client)
```

**Leave the old `dreambreaker://` entries in place for now.** They cost nothing,
and they keep any existing dev build on your phone working until you install the
new one. Remove them at Step 15.

---

## Phase C — web and backend

### 4. ✅ DONE — environment variables set

Both currently fall back to a hardcoded value in code. The fallbacks are now
correct, but relying on them is what item 2.3 exists to prevent.

- **Vercel** → project → Settings → Environment Variables:
  `NEXT_PUBLIC_APP_URL = https://pickleballapp.app` (all environments)
- **Supabase** → Edge Functions → Secrets:
  `PUBLIC_APP_URL = https://pickleballapp.app`

### 5. ✅ DONE — promoted to production

**Correction to the original plan: this project does not deploy from `main`.**
Every deployment in its history is built from `feature/expo-mobile-foundation`,
and production releases are *manual promotions* of preview builds. There is no
merge step, and `main` deploys nothing.

Vercel -> *JD's projects* -> **dream-breaker-fv6x** -> Deployments -> find the
build -> the ... menu -> **Promote to Production**.

Promoted `9036d65` on 2026-08-20 (`dpl_DmibGFHCHkyfg7ZhoP8LC4ZibcmR`, 36s).
Production had been serving `756ebbac` from 08-18, which predates item 1.4
entirely — that is why the four routes had never resolved.

Promotion rebuilt rather than aliasing, so it picked up the Step 4 environment
variables. The `npm warn allow-scripts` lines for `sharp` and `unrs-resolver`
are benign: both ship prebuilt platform binaries as optional dependencies, so
neither needs its install script.

### 6. ✅ DONE — web deploy verified

**Check content, not status codes.** A protected Vercel preview returns `200`
with a login page, which reads as a pass and is not one.

```bash
for p in /legal/terms /legal/privacy /legal/delete-account /help; do
  printf "%-26s " "$p"
  curl -s -L "https://pickleballapp.app$p"     | grep -o -m1 -E "TERMS OF SERVICE|PRIVACY POLICY|DELETE YOUR ACCOUNT|SUPPORT"
done
curl -s https://pickleballapp.app/.well-known/apple-app-site-association
```

Result 2026-08-20: four `200`s with the right headings; AASA reads
`ZSH27U747N.app.pickleballapp`; homepage title and footer show Pickleball App;
zero old-brand strings served.

### 7. ✅ DONE — edge functions redeployed

`send-transactional-email` v8 and `waitlist-sweeper` v13, both ACTIVE as of
2026-08-20. Neither redeploys with the web app.

```bash
supabase functions deploy send-transactional-email
supabase functions deploy waitlist-sweeper
```

---

## Phase D — production data

### 8. ✅ DONE — rebrand migration applied

Applied 2026-08-20 to `fbzetvkbhneptvfruilw`.

**Applied with `execute_sql`, not `apply_migration`.** The MCP
`apply_migration` tool assigns its own version number — that is exactly how
2.1's 15 alias pairs were created. Running the SQL directly and then recording
it under the chosen version keeps repo and production history identical.

Order matters: `migration repair` globs `supabase/migrations/`, so the file has
to be moved out of `migrations_pending/` *before* the repair, not after.

```bash
git mv supabase/migrations_pending/20260820000000_rebrand_pickleball_app.sql        supabase/migrations/
supabase migration repair --status applied 20260820000000
```

`supabase migration list --linked` now shows **38 migrations, local == remote on
every row.** Item 2.1's parity is intact.

### 9. ✅ DONE — migration verified

| Check | Result |
| --- | --- |
| `email_templates` still carrying the old brand | **0** |
| `email_templates` now branded Pickleball App | 6 |
| `wallet_partners` premium-membership name | **Pickleball App** |
| Claim function emits `pickleballapp://` | **true** |
| Claim function still emits `dreambreaker://` | **false** |

### 10. 🧑 Update Stripe

Dashboard → Settings → Business:

- **Business name** and **public business name** → Pickleball App
- **Statement descriptor** → so a player's card statement matches the app that
  charged them. This is a common chargeback cause when it does not.

The in-app `merchantDisplayName` for the Apple Pay / Google Pay sheet is already
updated in the repo.

### 11. 🧑 Rename the Supabase project (cosmetic)

`dreambreaker-pb` → `pickleball-app`, dashboard only. Nothing references it.

---

## Phase E — the mobile app

### 12. 🧑 Rename the EAS project and slug (optional, do it alone)

Still `dreambreaker`. Invisible to users — it appears in expo.dev URLs and OTA
update paths. The slug in `app.json` must match the EAS project name, so this is
a coordinated change and a mismatch breaks builds.

```bash
eas project:info                      # note the current name
# rename the project on expo.dev, then:
# 🤖 update "slug" in app.json to match
eas project:info                      # confirm the link still resolves
```

Skip this entirely if you would rather not risk it — nothing else depends on it.

### 13. 🧑 New icon and splash assets

Only if the mark itself changes. `apps/mobile/assets/images/` — `icon.png`,
`logo-splash.png`, `android-icon-foreground.png`, `android-icon-background.png`.

### 14. ⚠️ MOSTLY DONE — device verification, one failure

Preview build `app.pickleballapp` installed and tested 2026-08-20.

| # | Check | Result |
| --- | --- | --- |
| 1 | Icon + splash | ✅ |
| 2 | Google sign-in | ✅ — confirms the Step 3 allow-list entry |
| 3 | **Apple sign-in** | ❌ **fails — see Step 20** |
| 4 | Password reset (`pickleballapp://reset-password`) | ✅ |
| 5 | Maps | ✅ — the Google Cloud key restrictions did **not** need updating |
| 6 | Universal links | ✅ |
| 7 | Guest claim link (`pickleballapp://claim/…`) | not yet checked |

Two of the three risks flagged before the build did not materialise: Google
OAuth needed nothing (its redirect URI is Supabase's callback, never the app
scheme), and the Maps API keys were not bundle-id restricted.

### 15. 🧑 Remove the old redirect entries

Once a build with the new scheme is installed and verified, delete the
`dreambreaker://` entries from the Supabase Auth allow-list.

---

## Phase F — still open, not blocking

### 16. ✅ DONE — governing-law jurisdiction

Terms §16 now reads **the State of Florida, United States**, matching the
entity's home state. No placeholders remain in the documents. Still subject to
the legal review in Step 18.

### 17. 🧑 Decide on a privacy mailbox

`PRIVACY_EMAIL` in `web/src/lib/legal.ts` currently aliases `SUPPORT_EMAIL`,
deliberately: the privacy policy promises a 30-day response, and naming a
mailbox nobody reads is worse than sharing one that works. If you create
`privacy@pickleballapp.app`, flipping it back is one constant.

Either way, **`support@pickleballapp.app` must exist and be monitored** before
store submission.

### 18. 🧑 Have a lawyer review the Terms and Privacy Policy

They are drafted to describe this system accurately — which is not the same as
being legally sufficient.

### 19. 🧑 Confirm the logo lockup

`landing.tsx` renders `PICKLEBALL` + a gold `APP`, preserving the two-part
structure the old mark used. That was my substitution, not a design decision.

---

## What this runbook does not cover

The rebrand does not close any item in `TODO1.1_EXECUTION_PLAN.md` by itself.
Item **1.4** is complete once Step 5 deploys and Step 6 verifies. Item **7.1**
(store metadata) is where the name, icon, screenshots and store listing
converge, and it is still ahead of you.

---

### 20. 🧑 OPEN BLOCKER — enable Sign in with Apple on the new App ID

**Found 2026-08-20 on the first `app.pickleballapp` build. Needs a rebuild, so
it was deferred rather than fixed on the spot.**

**This blocks App Store submission, not just the feature.** Apple requires Sign
in with Apple wherever a third-party sign-in is offered, and this app offers
Google. Review will reject the binary while it is broken.

#### What is wrong

Nothing in Supabase, and nothing in the repo. `expo-apple-authentication` is in
the `app.config.js` plugins array, so the build carries the
`com.apple.developer.applesignin` entitlement, and the Supabase Apple provider's
Client IDs field correctly reads `app.pickleballapp`.

The App ID itself is missing the capability. EAS registered `app.pickleballapp`
during the build but does not enable Sign in with Apple on it.

#### Evidence it is client-side, not the provider

The Supabase auth logs for the test window show Google's `/authorize` and
`/callback`, the password reset's `/recover` and `/verify`, and **zero errors**.
A rejected Apple identity token would appear as a failed `/token` call. There is
no Apple request at all — so `signInAsync` threw on the device before any
network call. Re-checking the Supabase provider config is wasted effort.

It presents as a silent failure because `signInWithApple()` in
`apps/mobile/src/lib/auth.ts` returns `null` rather than throwing when Apple is
unavailable or the user cancels.

#### Fix

1. Apple Developer → Certificates, Identifiers & Profiles → **Identifiers** →
   `app.pickleballapp` → tick **Sign in with Apple** → Save.
2. Regenerate the provisioning profile so it carries the entitlement:
   `eas credentials -p ios` → `preview` → Provisioning Profile → regenerate.
3. Rebuild, then re-run checks 3 and 7 from Step 14.

Fold this into whichever build comes next rather than spending one on it alone.
Item 7.1 will need a fresh build regardless.
