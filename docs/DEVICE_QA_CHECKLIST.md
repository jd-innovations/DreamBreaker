# Device QA Checklist — items 5.2 and 5.3

Phone-only. Nothing here needs a computer, a build, or a deploy.

**Build to use:** the finished iOS **preview** build from EAS (started
2026-08-24 06:06 UTC). Install it from the EAS build page on your phone.

Two things that build is **not**:

- It has **no Sentry DSN baked in**, so it will not report crashes. That is
  expected — item 4.1's mobile half is parked until the next build.
- It predates 2026-08-24's refund/cancel work, so the mobile cancel flow in it
  is the older one. Irrelevant to everything below, which tests auth and native
  features that long predate it.

Its `EXPO_PUBLIC_APP_ENV` is **`internal`**, so feature flags are in internal
mode — some surfaces hidden in production are visible here. Note it if a screen
looks unexpected.

> **Status 2026-08-25:** 5.2 complete (all 11 pass). 5.3 partial — 12, 13, 14,
> 27, 28 pass; 15-26 outstanding.

**How to record:** write the result in the Result column — `pass`, `fail`, or a
short note. Anything at all is better than nothing; a half-filled matrix is
still evidence, an empty one is not. Send it back however is easiest and I will
fold it into the plan.

---

## 5.2 — Auth matrix

The whole point is the cases a happy-path login never reaches.

| # | Case | Steps | Expected | Result |
| --- | --- | --- | --- | --- |
| 1 | Apple — cancel | Tap Sign in with Apple, then dismiss the sheet | Returns to the sign-in screen. **No error alert**, no half-created account, not routed forward | pass (2026-08-25) |
| 2 | Apple — Hide My Email | Sign in with Apple, choose **Hide My Email** | Account is created; the profile carries the `@privaterelay.appleid.com` address and the app works normally | pass (2026-08-25) |
| 3 | Apple — **second login name** | Sign out, sign in with Apple again | **Name is still there.** Apple only returns the name on the *first* authorization ever — if the app relies on it each time, the name is blank now. This is the single most likely failure in this table | pass (2026-08-25) |
| 4 | Apple — sign-out / re-login | Sign out, sign back in | Same account, same profile, no duplicate | pass (2026-08-25) |
| 5 | Apple — cold start | Force-quit, reopen | Still signed in, lands on the normal home screen (not onboarding) | pass (2026-08-25) |
| 6 | Google — regression | Sign out, sign in with Google | Works; profile name and avatar populate | pass (2026-08-25) |
| 7 | Google — cancel | Start Google sign-in, dismiss the browser sheet | Stays on the screen, no error, no forward routing | pass (2026-08-25) |
| 8 | Email — sign-up | Register with a fresh email | **Verification is required** — access refused until the email is confirmed. *(This row originally asserted the opposite, from gap G2. The test disproved it; G2 is closed. Do not "fix" it by disabling confirmation — case 10 depends on it.)* | pass (2026-08-25) |
| 9 | Email — password reset | Use forgot-password | Reset mail arrives from `notifications@pickleballapp.app`, link works, new password signs in | pass (2026-08-25) |
| 10 | Account collision | Sign up by email, then sign in with Apple/Google using **that same address** | Record exactly what happens: same account, second account, or an error. There is no linking logic — this documents reality, it is not expected to pass | pass (2026-08-25) |
| 11 | Sign-out cleanup | Sign out | Push token is removed for that device (a later push should not reach this install while signed out) | pass (2026-08-25) |

**Note for case 3:** if the name is blank on second login, that is a real bug
and worth capturing a screenshot of. It is also the reason this row exists.

---

## 5.3 — Camera, QR, calendar, deep links

### QR check-in

| # | Case | Steps | Expected | Result |
| --- | --- | --- | --- | --- |
| 12 | Permission denied | Deny camera when first asked | A clear explanation and a way to recover — **not** a blank screen or a crash | **pass** — CTA to allow camera, recoverable |
| 13 | Permission granted | Allow, then scan | Scanner opens and reads | pass (implied: 14 required a working scanner) |
| 14 | Invalid QR | Scan any unrelated QR (a website, a Wi-Fi code) | Rejected with a readable message, no crash | **pass** — "unsupported QR" |
| 15 | Wrong tournament | Scan a valid check-in QR from a *different* tournament | Refused, and says why | _not yet run_ |
| 16 | Duplicate check-in | Scan the same valid QR twice | Second scan says already checked in — **does not** double-record | _not yet run_ |

### Calendar

| # | Case | Steps | Expected | Result |
| --- | --- | --- | --- | --- |
| 17 | Add to calendar (iOS) | From a tournament, add to calendar | Permission prompt, then the event appears in Apple Calendar with the right date/time | _not yet run_ |
| 18 | Permission denied | Deny calendar access, retry | Explains, does not crash | _not yet run_ |

*(Android calendar is blocked on hardware — open item D4.)*

### Deep links

Test **from a cold start** (force-quit first) — that is the path that breaks.
Send yourself each link and tap it.

Universal links (`https://pickleballapp.app/...`):

| # | Link | Expected | Result |
| --- | --- | --- | --- |
| 19 | `/tournament/<id>` | Opens the tournament | _not yet run_ |
| 20 | `/conversation/<id>` | Opens that conversation | _not yet run_ |
| 21 | `/groups/<id>` | Opens the group | _not yet run_ |
| 22 | `/community/<id>` | Opens the community | _not yet run_ |
| 23 | `/marketplace/<id>` | Opens the listing | _not yet run_ |
| 24 | `/claim/<token>` | Opens the claim flow | _not yet run_ |
| 25 | **`/booking/<id>`** | ⚠️ **Expected to fail** — see below | _not yet run_ |
| 26 | **`/coach/offers/<id>`** | ⚠️ **Expected to fail** — see below | _not yet run_ |

Custom scheme (`pickleballapp://`), same routes, cold start:

| # | Link | Expected | Result |
| --- | --- | --- | --- |
| 27 | `pickleballapp://tournament/<id>` | Opens the tournament | **pass** — correct screen |
| 28 | `pickleballapp://groups/<id>` | Opens the group | **pass** — correct screen |
---

## Two deep links that are already known to be broken

Found by comparing the production AASA file against the app's actual routes —
no device needed, so you are only confirming the failure *mode* here, not
discovering it.

The AASA served at `https://pickleballapp.app/.well-known/apple-app-site-association`
claims these paths:

```
/conversation/*  /groups/*  /tournament/*  /booking/*
/marketplace/*   /coach/offers/*  /claim/*  /community/*
```

Every one of those has a matching mobile route **except**:

| Advertised | Mobile routes that exist | Gap |
| --- | --- | --- |
| `/booking/*` | `booking/index`, `choose-time`, `confirmation`, `my-bookings`, `players`, `results`, `review`, `game-status` | **No `booking/[id]`.** A link to a specific booking opens the app and lands nowhere. This is the "mismatched booking detail route" item 5.3 already names |
| `/coach/offers/*` | `coach/offers/index`, `coach/offers/create`, `coach/offers/[id]/edit` | **No `coach/offers/[id]`.** `/edit` and `/create` resolve; the plain detail link does not |

Both exist as pages on the **web** app, which is why the AASA advertises them —
the file was written from the web routes, not the app's.

What to record for cases 25 and 26: **does it fail safely?** A not-found screen
you can navigate away from is acceptable for now. A crash, a blank screen, or
being stranded with no way back is not, and changes how urgent the fix is.

5.3 says to "fix or remove unsupported links". Two options once you are back at
a desktop — add the missing routes, or narrow the AASA paths so iOS never claims
them and the link opens the website instead. The second is smaller and is
probably right for beta.

---

## While you are in a browser anyway

Small dashboard chores, no desktop needed:

- **Rename the Sentry projects.** They are `react-native` and `javascript-nextjs`
  — Sentry's auto-generated platform names. `pickleballapp-mobile` /
  `pickleballapp-web` will read better once there is more than one of each.
  *Changing the slug changes the source-map upload config*, so tell me if you do
  and I will update `next.config.ts` and `app.config.js`.
- **Refund the 6 duplicate test charges** in the Stripe dashboard, if you want
  the reconciliation queue clean. Test mode, nobody is out of pocket.
- **Decide gap G1** (`PRODUCTION_CONFIG.md`): Stripe stays in test mode through
  beta, or goes live. Just needs writing down — the switch itself needs both
  Vercel and a new mobile build in the same window.
- **Check gap G4**: case 2 above passing *is* the check. Native Sign in with
  Apple only works if the Supabase Apple provider's Authorized Client IDs
  contains the current bundle id `app.pickleballapp`, so a successful Apple
  login proves it.
