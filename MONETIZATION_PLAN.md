# Monetization Plan — Paid Membership

**Written 2026-09-11.** Status: **nothing built.** This document exists because
a downstream feature (the Pickleball Grip Doctor voucher in
`WALLET_PROMOS_PLAN.md`) is gated on a paid tier that does not exist in any
form.

---

## Status: none of it exists

Verified against the repo and production on 2026-09-11:

- **No tables.** Nothing for memberships, subscriptions, plans or tiers. The
  only `*member*` tables are `facility_members`, `group_members`,
  `registration_group_members`, all unrelated.
- **No column** on `profiles` marking anyone as paid.
- **No subscription infrastructure.** Every payment path in the app is a
  one-off Stripe `PaymentIntent`. There is no recurring billing anywhere.
- **`membership-settings.tsx` is a complete mockup.** It renders "Why Upgrade"
  with four benefits, three plan cards (Free / Plus / Director) and a Billing
  group — and **none of it is wired**. The "Upgrade to Plus" row has no
  `onPress`. The plan cards only set local state. Billing History, Payment
  Methods and Restore Purchases navigate nowhere. **No price appears anywhere
  in the file.**
- **Stripe is in TEST mode by decision** (`PRODUCTION_CONFIG.md` G1) until App
  Store launch.

So "only a paid member gets the voucher" currently resolves to nobody.

---

## The decision that shapes everything: this needs Apple IAP

`STORE_SUBMISSION.md` §6 already reasons about StoreKit and reaches the right
conclusion **for the payments that exist today**:

> Payments are for real-world services — court time and tournament entry — not
> digital content, so **StoreKit / Play Billing does not apply**.

That is correct, and it should stay. A court reservation is a real-world
service; Apple does not take a cut and does not require IAP.

**A membership is the opposite case.** Every benefit currently advertised on
the upgrade screen is digital and consumed inside the app:

- Priority tournament alerts
- Marketplace listing boosts
- Advanced partner matching
- Early access to new features

Unlocking in-app functionality for a recurring fee is exactly what App Store
Review Guideline 3.1.1 reserves for In-App Purchase. Selling it through Stripe
would be a rejection, and it would also make the review note in
`STORE_SUBMISSION.md` §6 **false** — it currently tells Apple this app takes no
payments for digital content.

Confirm against the current guidelines before building; this is the single
assumption most worth re-checking, because everything below follows from it.

### What that implies

1. **A native dependency** — StoreKit via `expo-in-app-purchases`, or
   RevenueCat. Either forces a **new build**; neither ships over OTA. See
   `MOBILE_BUILD_CHECKLIST.md` on fingerprint inputs.
2. **Products defined in App Store Connect**, not in our database. Price tiers
   are Apple's, per storefront, and change through ASC rather than a deploy.
3. **Server-side receipt validation.** The client cannot be the authority on
   who is paid. An edge function verifies the receipt with Apple and writes the
   entitlement; the app reads it like any other server state.
4. **Apple takes 15–30%.** That belongs in the pricing decision, not discovered
   afterwards.
5. **Web is a separate question.** A membership sold on the web can use Stripe.
   Two purchase paths for one entitlement means reconciling them into one
   `is_paid` answer, and being careful never to link to the web purchase flow
   from inside the iOS app — that is its own guideline violation.
6. **Android** needs Play Billing on the same reasoning, and there is still no
   Android device for QA (`TODO 1.1` D4).

**RevenueCat vs raw StoreKit:** RevenueCat handles receipt validation, renewals,
cross-platform entitlements and restore, which is most of the work above, at a
revenue share. Raw StoreKit avoids the fee and the dependency but puts renewal
and validation on us. Worth a deliberate decision; I lean RevenueCat for a first
paid product, because subscription edge cases (grace periods, billing retry,
refunds, family sharing) are where hand-rolled implementations leak entitlements.

---

## Open product decisions — none of these are engineering questions

1. **Price, and period.** Nothing exists anywhere in the repo. Monthly, annual,
   or both? Apple's tiers constrain the options.
2. **What is actually in Plus?** The four benefits on the screen are copy, not
   features. Of them, only "marketplace listing boosts" has any existing
   surface to attach to. Priority alerts, advanced matching and early access
   would each need building. **A tier whose benefits do not exist yet is the
   same problem as the seeded $25 credit**, one level up.
3. **"Director" is already a role, not a tier.** `profiles.role`, the
   `DirectorOnly` component and `apply-director.tsx` all exist and are free.
   The plan card implies it is a paid plan. Decide which it is before anyone
   buys one.
4. **Does the $25 PGD voucher justify the price on its own?** If the tier is
   $X/year and the voucher is $25, the economics need stating. It may be the
   main reason to subscribe, which makes it a benefit to design around rather
   than a bonus.
5. **Free trial or introductory pricing?** Apple supports both; they change the
   entitlement logic.

---

## Phases

### Phase 1 — Decide
Price, period, benefit list, Director's status, RevenueCat vs StoreKit. No code.
This phase is the actual blocker.

### Phase 2 — Entitlement, server-side
A `memberships` table (or `profiles.membership_tier` + `membership_expires_at`),
an edge function that validates receipts and writes entitlement, and an
`is_paid_member()` SQL helper mirroring `is_admin()`. Web can read it
immediately; mobile does not need the native work to exist yet.

### Phase 3 — Purchase on iOS
Native dependency, ASC products, the paywall, restore purchases, and wiring the
dead "Upgrade to Plus" row. **Needs a build.** Expect the fingerprint to change.

### Phase 4 — Benefits
Whatever Phase 1 decided Plus contains. Each is its own piece of work.

### Phase 5 — The PGD voucher
Grant on membership activation, reusing the pattern in
`web/src/lib/payments/finalizePayment.ts` that already issues coach vouchers.
Small, once Phase 2 exists. See `WALLET_PROMOS_PLAN.md`.

---

## Immediate finding, independent of all of the above

**`membership-settings.tsx` promises a product that does not exist**, on a
screen any TestFlight tester will open. The "Upgrade to Plus" row is tappable
and does nothing; three plan cards with no prices imply a purchase that cannot
happen.

This is the dead-control class that `TODO 1.1` item 6.2 closed and its Rule 7
forbids: *hide or feature-flag an incomplete feature rather than half-finishing
it.* The same treatment as `playerLists` and `weeklyGame` applies — a
`paidMembership` feature key set to `deferred` would remove it from production
builds while keeping the design intent recorded.

Worth doing before TestFlight regardless of when monetization lands.

---

## Dependencies

```
MONETIZATION Phase 1 (decide)
      |
      v
MONETIZATION Phase 2 (entitlement)  ---> WALLET_PROMOS Phase 1 (admin grant)
      |                                   [independent, buildable today]
      v
MONETIZATION Phase 3 (iOS purchase, needs a build)
      |
      v
MONETIZATION Phase 5 == WALLET_PROMOS "PGD voucher on membership activation"
```

The admin grant/revoke surface in `WALLET_PROMOS_PLAN.md` is **not** blocked by
any of this and can be built whenever. Everything else about the voucher is.
