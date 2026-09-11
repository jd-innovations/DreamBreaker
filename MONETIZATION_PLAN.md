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

## The product, as defined 2026-09-11

**$25/year.** One paid tier. Benefits:

| # | Benefit | State of the ground |
| --- | --- | --- |
| 1 | **$25 Pickleball Grip Doctor voucher** | One-time use, no balance, redeemed at Shopify. See `WALLET_PROMOS_PLAN.md`. Small once entitlement exists. |
| 2 | **No ads** | Nothing exists. Deferred, and it constrains nothing. |
| 3 | **Member-only coach marketplace pricing** | **Schema already built for it** — see below. |
| 4 | **More than 2 marketplace listings** | **Nearly free** — see below. |
| — | ~~Tournament director coupons~~ | **Dropped from v1.** See below. |

Deliberately excluded: anything touching games, matches or ratings. Those stay
free for everyone.

### 4 is nearly free — the column already exists

`profiles.marketplace_listing_limit` is already there (nullable; the client
falls back to `DEFAULT_FREE_LISTING_LIMIT` via `fetchListingLimit`). Membership
activation writes a higher number; lapse reverts it. **No new schema and no new
UI** — and the "Listing limit reached" screen is already the upsell surface,
which makes it the natural place for an upgrade prompt once one exists.

### 3 was anticipated and left one step short

`coach_offers` carries **three** price columns:

```
regular_price_cents
discounted_price_cents
premium_price_cents      <- the member price
premium_only  boolean
CONSTRAINT coach_offers_premium_price_requires_flag
  CHECK (premium_price_cents IS NULL OR premium_only = true
         OR premium_price_cents < discounted_price_cents)
```

`createCoachOffer()` already accepts `premiumOnly` and `premiumPriceCents`, and
the create-offer screen already collects them. **What is missing is only the
consumer**: nothing checks membership to decide which price a buyer is charged,
and nothing filters `premium_only` offers by entitlement. Someone designed this
exact benefit and stopped before there was an entitlement to read.

So benefit 3 is a price-selection change in `lib/coach/offers.ts` plus a
server-side check at purchase — not a new feature.

### Why director coupons are out of v1

Localized tournament coupons need director-side tooling to issue them, geo or
per-tournament targeting, and redemption at registration. That is a feature in
its own right, not a switch on a membership. Revisit after v1 ships.

---

## The blocker is commercial, not technical

**$25/year that includes a $25 voucher nets less than zero.** Apple takes
15-30%, so $25 collected becomes roughly $17.50-$21.25, against a $25 voucher
cost. Every member loses money.

Two ways it resolves, neither of them an engineering question:

- **PGD funds the voucher** — consistent with them wanting to reward signups.
  The membership is then profitable from day one and the voucher is a genuine
  acquisition hook.
- **We fund it** — then either the price rises, the voucher shrinks, or it is a
  deliberate loss-leader with a stated payback (benefit 3's coach margin, or
  listing volume).

**Nothing else in this plan depends on the answer. The price does.** Settle it
before App Store Connect products are created: changing a price tier after
launch is a migration for existing subscribers rather than an edit.

### IAP is no longer in doubt

Benefit 4 raises a limit on in-app functionality in exchange for a recurring
fee. That is guideline 3.1.1 squarely, so the iOS purchase must go through
StoreKit. The reasoning about court time and entry fees staying outside IAP
still holds — those are real-world services and are unaffected.

---

## Open product decisions — none of these are engineering questions

1. ~~**Price, and period.**~~ **Decided: $25/year, one tier.** What is NOT
   decided is who funds the voucher — see above.
2. ~~**What is actually in Plus?**~~ **Decided** — the four benefits above. Note
   they replace the four on `membership-settings.tsx` (priority alerts, listing
   boosts, advanced matching, early access), which are copy rather than
   features. **That screen needs rewriting to match**, or it advertises a
   different product than the one being sold.
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
In rough order of cost:

- **Listing limit** (4) — write `profiles.marketplace_listing_limit` on
  activation, revert on lapse. The smallest possible piece of work.
- **Coach member pricing** (3) — select `premium_price_cents` when the buyer is
  entitled, filter `premium_only` offers for everyone else, and enforce it
  server-side at purchase so the price cannot be chosen by the client.
- **Rewrite `membership-settings.tsx`** to advertise these benefits.
- **No ads** (2) — nothing to do until an ad system exists.

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
