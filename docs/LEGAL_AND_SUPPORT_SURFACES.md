# Legal and Support Surfaces

Reference for item **1.4** of `TODO1.1_EXECUTION_PLAN.md`. Everything the app
stores, the website, and the app itself point at lives here.

## Canonical URLs

The documents are pages in the Next app (`web/`). The mobile app links out to
them; it does not carry its own copy, so there is one text to keep current.

| Surface | URL | Source |
| --- | --- | --- |
| Terms of Service | `https://pickleballapp.app/legal/terms` | `web/src/app/legal/terms/page.tsx` |
| Privacy Policy | `https://pickleballapp.app/legal/privacy` | `web/src/app/legal/privacy/page.tsx` |
| Account deletion instructions | `https://pickleballapp.app/legal/delete-account` | `web/src/app/legal/delete-account/page.tsx` |
| Support / help centre | `https://pickleballapp.app/help` | `web/src/app/help/page.tsx` |
| Support email | `support@pickleballapp.app` | — |
| Privacy / data-rights email | `support@pickleballapp.app` (shared with support for now) | — |

Two small modules hold the route constants, and they must stay in sync:

- `web/src/lib/legal.ts`
- `apps/mobile/src/lib/legal.ts`

## Where they are linked from

**Mobile**

- `src/app/onboarding/create-account.tsx` — Terms and Privacy in the sign-up legal line.
- `src/app/sign-up.tsx` — same line on the email sign-up screen.
- `src/app/account-settings.tsx` — Privacy and Terms buttons in the footer row.
- `src/app/help-support.tsx` — support email, help centre, and a Policies card
  linking Terms, Privacy, and the deletion page.

Links open in the in-app browser (`expo-web-browser`, page-sheet presentation),
not by kicking the user out to Safari or Chrome.

**Web**

- `src/components/layout/footer.tsx` — Support, Terms, Privacy, Delete Account.
- `src/app/auth/page.tsx` — the sign-in/sign-up legal line (was `href="#"`).
- `src/app/settings/page.tsx` — Legal & Support block, and the Danger Zone now
  links to the deletion instructions instead of showing a "contact support"
  toast, which stopped being true when item 1.3 shipped self-service deletion.

## Launch checklist

**Applied 2026-08-20** (see `docs/REBRAND_PICKLEBALL_APP.md`): the entity,
address, domain and support address are now real values, not placeholders. The
app name in the document prose is "Pickleball App".

Still outstanding before submission:

1. ~~Governing law~~ — set 2026-08-20 to **the State of Florida, United
   States**, matching the entity's home state. Still subject to the legal
   review below. **No placeholders remain in the documents.**
2. **`privacy@pickleballapp.app` does not exist.** `PRIVACY_EMAIL` in
   `web/src/lib/legal.ts` deliberately aliases `SUPPORT_EMAIL` so the policy
   does not promise a 30-day response at an unmonitored address. Flip it back
   to a dedicated mailbox — one constant — if one is created.
3. `support@pickleballapp.app` must exist and be monitored.
4. ~~Deploy the web app~~ — **DONE 2026-08-20.** All four routes are live and
   verified on `pickleballapp.app`, and the AASA serves the new bundle id
   `ZSH27U747N.app.pickleballapp`.
5. **Have a lawyer review both documents.** They are drafted to be accurate
   about what this system does, not to be a substitute for legal advice.

## Accuracy notes

The privacy policy was written against the real data model, not a template:

- **Location** — `expo-location` foreground only, no background permission
  requested. Coordinates are evaluated on the device (`src/lib/location.ts`);
  what persists server-side is the user's city and the radius preferences in
  `location_settings`.
- **Push tokens** — `push_tokens` stores the Expo token and platform, deleted on
  sign-out and on account deletion.
- **Payments** — Stripe; no card data reaches our servers.
- **Messages** — `messages`, `conversations`, group posts and comments.
- **Support diagnostics** — `support_tickets` plus app/build/device/OS details.
- **Images** — Supabase Storage via the pipeline in `apps/mobile/src/lib/media`.
- **Retention on deletion** — matches what the `delete-account` edge function
  actually does (anonymized profile tombstone; payments, results, and sent
  messages retained).

**Analytics and crash reporting are described in the policy but are not yet
implemented** — those are items 4.1 and 4.2. Describing processing you have not
started is over-inclusive rather than inaccurate, and it avoids a policy update
between now and launch, but the sections should be re-read once those items ship
so the named providers are right.

## Known gap, deliberately out of scope

`web/src/components/layout/footer.tsx` still has `href="#"` on the four social
icons. Item 1.4's verification is about legal links; the social handles are a
marketing decision, not a legal surface.
