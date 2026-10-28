# Store Submission Package

TODO 1.1 item 7.1. Everything App Store Connect and Google Play Console ask for
that requires an engineering answer, decided here so the forms become a
copy-paste exercise rather than a research project.

**Status 2026-10-28 — App Store v1.0 submission.** Decisions made:

- **Submit TestFlight build 14 (v1.0.0) as-is.** Nothing native has changed
  since it was built (397de57); JS fixes reach it over the `production` OTA
  channel. No rebuild.
- **No membership in v1.0.** `paidMembership` stays `internal-only`. It ships in
  1.0.1, which IS a second review: the first subscription must be submitted
  with an app version, and the RevenueCat `appl_` key lives in `eas.json` (a
  fingerprint input), so it needs build 15 anyway.
- **DUPR:** no "coming soon" in metadata (Guideline 2.3 — describe only what
  ships) and no `dupr` keyword (2.3.7, third-party brand). The description may
  say players can add their DUPR rating to their profile, which is true today.
- **Push:** one device = one account (migration 20261028120000), so a shared or
  handed-down phone no longer shows another account's notifications.

Remaining blanks are under [What only you can supply](#8-what-only-you-can-supply).

Companion documents: `PRODUCTION_CONFIG.md` (env inventory),
`BETA_SCOPE.md` (what is switched on), `docs/DEVICE_QA_CHECKLIST.md`.

---

## 1. Identity

| Field | Value |
| --- | --- |
| App name | Pickleball App |
| Bundle ID / package | `app.pickleballapp` |
| Expo slug | `dreambreaker` |
| EAS project | `04fcdd30-fb9e-47e2-9371-8e4e8b521c17` |
| Legal entity | JD Innovations LLC |
| Mailing address | 11615 Gramercy Park Ave, Bradenton, FL 34211 |
| Support email | support@pickleballapp.app |
| Support URL | https://pickleballapp.app/help |
| Privacy URL | https://pickleballapp.app/legal/privacy |
| Terms URL | https://pickleballapp.app/legal/terms |
| Account deletion URL | https://pickleballapp.app/legal/delete-account |
| Governing law | State of Florida, United States |

The deletion URL matters on its own: **Apple requires an account-deletion path
reachable from outside the app** for any app that supports account creation.
This one is a public web page, so a reviewer can reach it without signing in.

---

## 2. Store listing copy

Drafts. Change the words freely — nothing below depends on the exact wording.

**Subtitle (iOS, 30 char max):**
`Play, compete, find partners`

**Promotional text (iOS, 170 max):**
`Find open play near you, register for tournaments, and get matched with
partners at your level.`

**Description:**

```
Pickleball App is where players find courts, partners and tournaments.

FIND A GAME
Browse open play near you, see who is coming, and reserve a spot.

PLAY TOURNAMENTS
Register for local tournaments, hold your spot, and check in with a QR code
at the desk.

FIND PARTNERS
Get matched with players at your level. Message them in the app, and join
groups for your club or regular crew.

TAKE LESSONS
Find coaches near you, or ones who travel to you, and book a lesson.

BUY AND SELL GEAR
List paddles and gear in the marketplace and connect with local players.

TRACK YOUR GAME
Log sessions and scores, see your stats over time, and add your DUPR rating
to your profile.

FOR ORGANIZERS
Run brackets, round robins and mini tournaments, manage registrations, and
check players in from your phone.
```

**Keywords (iOS, 100 char, comma-separated, no spaces):**
`pickleball,tournament,court,partner,open play,paddle,league,bracket,lessons,coach,round robin`

No third-party brand names here (Guideline 2.3.7) — that is why `dupr` was
removed.

**Category:** Sports (primary), Health & Fitness (secondary)

---

## 3. Permissions — the exact strings that ship

Taken from `apps/mobile/app.config.js`. If a reviewer asks why a permission is
requested, this is the answer, and it must match what the app actually does.

| Permission | String shown to the user | Why |
| --- | --- | --- |
| Camera | *Allow Pickleball App to use your camera to take and send photos in chat, and to scan QR codes for check-in and redemption.* | Chat photos; QR check-in |
| Photos | *Allow Pickleball App to access your photos so you can send images in chat.* | Chat attachments, avatar |
| Location (when in use) | *Pickleball App uses your location to show nearby courts, games, and tournaments.* | Nearby search |
| Notifications | System default | Messages, reminders |

**Three things deliberately NOT requested**, each worth stating because a
reviewer may ask why an installed library does not appear:

- **Microphone.** `expo-camera` requests it by default; it is explicitly
  disabled (`microphonePermission: false`). QR scanning needs no audio.
- **Calendar.** `expo-calendar` is installed, but its config plugin is
  deliberately not registered. The app only calls
  `createEventInCalendarAsync()`, which opens the OS event editor and needs no
  permission. Registering the plugin would request calendar access the app
  never uses.
- **Background location.** Only "when in use" is requested. There is no
  background location feature.

---

## 4. Data Safety / Privacy Nutrition Labels

The section engineers usually guess at. These answers are derived from the
code, and each cites where to verify it.

### Collected and linked to the user

| Data | Purpose | Where |
| --- | --- | --- |
| Name | App functionality | `profiles.full_name` |
| Email address | App functionality, account management | `profiles.email`, Supabase Auth |
| Date of birth | App functionality (age-appropriate divisions) | `profiles.date_of_birth` |
| Gender | App functionality (tournament divisions) | `profiles.gender` |
| Photos | App functionality (avatar, chat) | Supabase Storage |
| Precise location | App functionality (nearby courts and games) | `profiles.location_lat/lng` |
| Coarse location | App functionality | `profiles.location_city/state` |
| User ID | Analytics, app functionality | uuid, everywhere |
| Purchase history | App functionality | `registrations`, `payments` |
| Messages | App functionality | `messages` |
| Crash data | Diagnostics | Sentry |
| Product interaction | Analytics | PostHog |

### NOT collected

- **Payment card details.** Stripe's PaymentSheet handles them; the app never
  sees or stores a card number. Verify: `apps/mobile/src/lib/payments/`.
- **Contacts, calendar, health, browsing history, audio.**
- **Advertising identifiers.** No ad SDK, no tracking, nothing to declare on
  App Tracking Transparency.

### Tracking: NO

Nothing is shared with data brokers or used to track users across apps or
websites owned by other companies. **No ATT prompt is required.**

### What analytics actually receives — and why the answer is precise

Every event passes through an **allowlist** in
`packages/shared/src/analytics.ts`. A property is dropped unless its key is
listed, so the set below is exhaustive rather than a best guess:

- ids (user uuid, tournament, event, reservation, conversation, ticket)
- enum values (auth method, result, error codes, check-in method)
- money (amount in cents, currency, Stripe payment-intent id)
- context (platform, app environment, app version)

**Explicitly rejected**, in code, with the value dropped even when nested or
hidden inside another field: names, email addresses, phone numbers, message and
support-ticket bodies, exact coordinates, card data.

Crash reports are scrubbed the same way
(`apps/mobile/src/lib/observability/sentry.ts`,
`web/src/lib/observability/scrub.ts`): user context is reduced to a uuid, URLs
lose their query strings, and sensitive keys are redacted.

### Sub-processors to declare

| Processor | Receives |
| --- | --- |
| Supabase | All application data (database, auth, storage) |
| Stripe | Payment processing; name and email for receipts |
| PostHog (US) | Pseudonymous product analytics per the allowlist above |
| Sentry | Scrubbed crash reports |
| Expo (EAS) | Push tokens for delivery |
| Google Maps | Map rendering; coordinates of displayed courts |
| Resend | Transactional email delivery |
| Anthropic | Marketplace listing text, only when the seller taps the AI rewrite (`marketplace-improve-listing`) |

RevenueCat joins this list in 1.0.1, with membership — not in v1.0.

### Deletion

Account deletion is implemented and reachable **in-app and on the web**. It
removes personal data and leaves an anonymized tombstone row so historical
tournament results stay consistent — see `docs/` and the account-deletion
policy. Apple and Google both require deletion to be genuinely available, not a
support request.

---

## 5. Sign in with Apple

Required, because the app offers Google sign-in. It is implemented natively
(`expo-apple-authentication`, `signInWithApple` in `apps/mobile/src/lib/auth.ts`)
and handles **Hide My Email**: the relay address is stored like any other email
and nothing depends on it being reachable by a human.

Apple returns the user's name only on the **first** authorization ever for an
Apple ID and app pair. The app writes it only when present, so a re-install
never blanks an existing profile name.

---

## 6. Payments — read this before submitting

**Stripe is LIVE** (cutover 2026-10-07; build 14 carries `pk_live`). Card
only, manual payouts. Paid court booking stays hidden (`paidBooking`);
tournament entry and lessons take real cards.

The demo account must reach a **free** event so the reviewer can finish a
registration without paying — Futures Classic (free, closes Dec 24). If review
slips past that date, pick another free event and update the notes.

Everything paid is a real-world service — tournament entry and in-person
lessons — not digital content, so **StoreKit does not apply** (Guideline
3.1.3(d)/3.1.5). Marketplace sales happen between players, off-platform; no
money moves in the app. Say this in the review notes; it is a common rejection
reason for apps that take cards outside IAP.

Membership is the one thing that WOULD need IAP, which is exactly why it is
not in v1.0 — see the status block at the top.

---

## 7. Review notes (paste into App Store Connect)

```
DEMO ACCOUNT
Email:    dhjesus122+tyler@gmail.com
Password: <supply>

To try a full registration without paying, open Tournaments and register for
"Futures Classic", which is free.

PAYMENTS
Payments are for real-world services: tournament entry fees and in-person
lessons with coaches. They are not digital content or in-app purchases, so
StoreKit is not used. Stripe processes cards; the app never handles card
details. Marketplace listings connect players who arrange sales themselves;
no payment happens in the app.

ACCOUNT DELETION
In-app: Account Settings > Delete Account.
On the web, without signing in: https://pickleballapp.app/legal/delete-account

LOCATION
Requested "when in use" only, to show nearby courts and games. The app works
without it; location can be declined and set manually by city.

CAMERA
Used for two things: sending photos in chat, and scanning a QR code at
tournament check-in.

SIGN IN WITH APPLE
Offered alongside Google. Hide My Email is supported.

USER-GENERATED CONTENT
The app has direct messages, group posts and profiles. Users can report a
person from a message thread or a profile, and can block them in the same
step. Blocked users cannot message or invite. Reports reach an admin queue.
```

That last paragraph answers **Guideline 1.2**, which requires a report and
block mechanism for user-generated content. It is worth stating rather than
leaving the reviewer to find it.

---

## 8. What only you can supply

Not engineering questions — these are the remaining blanks:

- **Demo password** — Tyler's (the Beta App Review login). Confirm it still
  signs in on build 14 before submitting.
- **Screenshots** — 6.9" (or 6.5") iPhone. No iPad: `supportsTablet` is false.
  Suggested flow: open play list, tournament detail, registration, partner
  finder, chat, profile. Take them on the demo accounts, not real users.
- **Apply migration 20261028120000** (push: one account per device) before
  submitting.
- **Check Sentry** for crashes on build 14 before submitting.
- **In App Store Connect:** App Store tab → version 1.0 → attach build 14 →
  paste §2 and §7 → privacy answers from §4 → age rating → release
  **manually** → Submit for Review.
- **App icon** — already present, but see 7.3: `icon.png` is 1.4 MB and should
  be roughly a tenth of that.
- **Legal review.** The Terms and Privacy Policy are written and complete
  (entity, address, Florida governing law, 30-day response commitment) but have
  not been reviewed by a lawyer.
- **Confirm support@pickleballapp.app is monitored.** The privacy policy
  commits to a 30-day response, and the address is published to stores.
- **Content rating questionnaires** — Apple's age rating and Google's IARC.
  Both are answered from the facts in §4; no engineering input needed.
