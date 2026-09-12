# Phase 5 — Purchase via StoreKit (RevenueCat)

Written 2026-09-12. Expands Phase 5 of `MEMBERSHIP_EXECUTION_PLAN.md`, which is
now the only unbuilt phase.

Decisions this rests on, all settled:

- **$25/year, one tier** (MONETIZATION_PLAN.md).
- **StoreKit, not a Stripe link-out** — chosen, not forced. A US-storefront app
  may now link out; StoreKit was picked for what Apple absorbs and to keep
  first-party membership revenue out of a Stripe ledger that otherwise means
  Connect money with a third-party payee.
- **RevenueCat**, not raw StoreKit (decision 0.2, settled 2026-09-12).
- **A renewal earns a second $25 PGD voucher** (settled 2026-09-12). This is the
  only decision that changes existing schema, and §2 is mostly about doing it
  without accidentally minting money.

---

## 0. What already exists

Phases 1–4 are live in production. Everything except *acquiring* entitlement is
built and tested:

| Piece | State |
| --- | --- |
| `memberships` table, `is_paid_member()` | live |
| `admin_grant_membership` / `admin_revoke_membership` | live |
| Listing limit benefit | enforced server-side |
| Coach member pricing | live in `create_coach_offer_purchase` |
| PGD voucher + code pool | live, issued on grant |
| `membership-settings.tsx` | a mockup, gated behind `paidMembership: 'deferred'` |

So Phase 5 changes **how entitlement is acquired and expires** and nothing else.
That was the point of sequencing it last.

---

## 1. Accounts and products — blocked on the user, do first

None of this is code, and all of it blocks testing.

1. **App Store Connect**: an auto-renewable subscription in a new subscription
   group. One product, e.g. `com.pickleballapp.plus.yearly`, 1 year.
   - **Price: $24.99** (settled 2026-09-12). Chosen over $25.00 because $24.99
     is a standard Apple price point with nothing to verify or request, and
     over $24.97 because a custom price point is setup friction buying nothing
     — `.97` does not read as a discount outside US retail, and nobody sees the
     cents twice on an annual subscription.
   - Note the voucher now **exceeds** the fee: $24.99 in, $25 of product out.
     That is deliberate and worth saying on the paywall — the PGD benefit alone
     more than covers the membership.
   - Localizations, review screenshot, and the subscription's terms text are all
     required before it can be submitted.
2. **Paid Applications Agreement** must be active, with banking and tax forms
   complete. Subscriptions cannot be tested in sandbox until it is.
3. **Small Business Program** — enrol if not already. 15% vs 30% below $1M/year.
   Worth $3.75 per member per year.
4. **RevenueCat**: project, iOS app with the App Store shared secret and an
   App Store Connect API key, one entitlement (`plus`) mapped to the product.
5. **Sandbox tester accounts** in App Store Connect.

---

## 2. The term model — the one schema change

### The decision

A renewal earns a second $25 voucher. Today it would earn nothing:
`issue_membership_voucher()` keys `source_id` to the membership **row**, so the
idempotency index refuses a second issue forever.

### The hazard, stated first

Two ways to get this wrong cost real money:

1. **Changing the `source_id` format without backfilling** re-issues a voucher to
   every existing member, because the new key finds no match. Every current
   member gets a second $25.
2. **Treating any expiry change as a renewal.** An admin correcting a typo in an
   expiry date would mint $25. Extending and renewing must be different verbs.

### The design

Add to `memberships`:

```sql
alter table public.memberships
  add column term_seq integer not null default 1,
  add column current_term_started_at timestamptz not null default now();
```

`source_id` for the voucher becomes `<membership_id>:<term_seq>`.

**Backfill in the same migration, before anything can issue:**

```sql
update public.wallet_items
   set source_id = source_id || ':1'
 where source_type = 'membership_benefit'
   and source_id not like '%:%';
```

Then, deliberately:

- `admin_grant_membership` (the **extend** path) does **not** increment
  `term_seq`. Correcting or stretching the current term issues nothing. This
  preserves exactly today's behaviour, which is the safe default.
- A **renewal** increments `term_seq`, sets `current_term_started_at` and the new
  `expires_at`, then calls `issue_membership_voucher()` — which now sees a new
  `source_id` and issues. Renewal arrives from the RevenueCat webhook (§4), and
  a separate admin "Renew (new term)" button covers comps.

So minting a second voucher is always an explicit act, never a side effect.

Voucher `expires_at` continues to follow the term's `expires_at`, so year two's
voucher expires with year two.

### Pool consequence

Renewals consume codes at the same rate as signups. From year two the pool
drains twice as fast as new members alone would suggest. `/admin/wallet` shows
the count and reddens at zero; consider a low-stock threshold warning before the
first renewal cohort lands.

---

## 3. Client

### 3.1 Dependency and build

`react-native-purchases`. Native, so:

- **Fingerprint changes → a new build.** Not an OTA. See
  `project_ota_fingerprint_inputs`.
- Regenerate the lockfile with **npm 10**, not local npm 11
  (`project_eas_npm_lockfile`).
- The RevenueCat public SDK key is an `EXPO_PUBLIC_*` variable, so it must be in
  `eas.json`'s `build.<profile>.env` — and OTAs must be published through
  `node ./scripts/publish-update.js <profile>` or the value is lost
  (`project_eas_update_app_env`).

### 3.2 Identity — the integration's most common failure

Call `Purchases.logIn(session.user.id)` so RevenueCat's `app_user_id` **is** the
Supabase user id. Without it, purchases attach to an anonymous RevenueCat id and
the webhook has no way to name the buyer. Call it on sign-in and `logOut()` on
sign-out, or one device's purchase follows the next person who signs in.

### 3.3 Paywall

`membership-settings.tsx` is a mockup and its four advertised benefits (priority
alerts, listing boosts, advanced matching, early access) are **copy, not
features**. Rewrite to the real four — PGD voucher, member coach pricing, more
than 2 listings, no ads (mark as coming) — then remove the `paidMembership`
deferred gate.

Required by App Review: price, period, auto-renewing nature, and links to Terms
and Privacy on the purchase screen itself.

### 3.4 Restore

`Purchases.restorePurchases()` wired to a visible control. Guideline 3.1.1 asks
for a restore mechanism, and reviewers check it. The existing "Restore
Purchases" row is currently dead.

### 3.5 Entitlement is still read from our database

`useMembership()` keeps reading `memberships`. Do **not** switch the app to read
RevenueCat's customer info as the source of truth — every benefit is enforced
server-side against our table, and two sources would drift. RevenueCat's client
state is useful only for reacting immediately after a purchase; the webhook is
what makes it true.

---

## 4. Server

### 4.1 Webhook

`web/src/app/api/revenuecat/webhook/route.ts`, following the shape of
`api/stripe/webhooks/route.ts` (service client, no body parsing).

RevenueCat does **not** sign with an HMAC the way Stripe does — it sends a
configurable `Authorization` header. So: a long random secret in
`REVENUECAT_WEBHOOK_SECRET`, compared with a constant-time equality check, and a
hard reject on mismatch. This endpoint grants paid entitlement; it is the one
place where "it worked in testing" is not enough.

### 4.2 Events → membership

| RevenueCat event | Effect |
| --- | --- |
| `INITIAL_PURCHASE` | create membership, `source = 'app_store'`, `external_reference_id` = original transaction id, `term_seq = 1`, issue voucher |
| `RENEWAL` | increment `term_seq`, set new `expires_at`, **issue a second voucher** |
| `CANCELLATION` | record intent not to renew; entitlement continues to `expires_at` |
| `UNCANCELLATION` | clear that |
| `EXPIRATION` | membership lapses |
| `BILLING_ISSUE` | leave active through the grace period; Apple retries |
| `REFUND` | revoke membership, and revoke the wallet item (see §6) |
| `TRANSFER` | move entitlement between users |

All of it through one `SECURITY DEFINER` function, service-role only — the same
discipline as `create_coach_voucher_from_finalized_purchase`, which is
service-role-only precisely because a webhook has no caller to authenticate.

**Idempotency is mandatory.** RevenueCat retries, and a replayed `RENEWAL` must
not issue a third voucher. Key on the store transaction id.

### 4.3 Expiry sweep

`is_paid_member()` already checks `expires_at`, so a lapsed membership stops
conferring benefits with no job running. A sweep to set `status = 'expired'` is
cosmetic — worth having for admin display, not load-bearing. There is precedent
in `waitlist-sweeper`.

---

## 5. Testing

Sandbox accelerates renewals dramatically — a 1-year subscription renews in
about an hour of wall time, and renews a limited number of times.

**This means the renewal-voucher path is genuinely testable**, which it would not
be in production for a year. Do it deliberately:

1. Purchase in sandbox → membership created, voucher #1 in wallet, one code
   consumed.
2. Wait for the sandbox renewal → `term_seq` becomes 2, voucher #2 appears, a
   second code consumed, year-two expiry on both.
3. Replay the same webhook payload → nothing changes (idempotency).
4. Refund through App Store Connect → membership revoked, wallet item revoked.
5. Delete and reinstall → Restore Purchases returns entitlement.
6. Sign out, sign in as someone else → no entitlement leaks across accounts.

Load the pool with test codes first, or step 1 silently issues nothing.

---

## 6. Known gaps, carried forward

- **A refund cannot recall the Shopify code.** Membership and wallet item can be
  revoked; a code already opened keeps working. Inherent to the CSV pool
  (decision 0.4) and the strongest future argument for the Admin API.
- **Redemption stays invisible** without a Shopify webhook, so the voucher shows
  `available` until expiry. Do not display a status we cannot back up.
- **Apple decides refunds**, not us. Accepted when StoreKit was chosen.
- **Non-US storefronts** are unaffected by the Epic injunction. Not a problem
  while the app is US-only; revisit before international launch.

---

## 7. Order

```
1. Accounts and products  ── blocked on the user, blocks everything
2. Term model migration   ── pure DB, SHIPPABLE TODAY, independent of the build
3. Server webhook         ── testable against RevenueCat's test events
4. Client SDK + paywall   ── needs a build
5. Sandbox testing        ── needs 1 and 4
```

§2 is the piece worth shipping ahead of the rest: it is pure SQL, it has no
dependency on RevenueCat, and it carries the backfill that must land before any
renewal can occur.
