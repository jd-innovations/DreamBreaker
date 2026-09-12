# Membership — Execution Plan

**Written 2026-09-11.** Status: **not started.**

Sequences `MONETIZATION_PLAN.md` (what the tier is and why it needs IAP) and
`WALLET_PROMOS_PLAN.md` (how promos reach a wallet) into one order of work.
Read those for the reasoning; this is the order.

An item is done iff it has a `### Completion Notes - X.Y` section.

---

## The sequencing insight

**Phase 2 grants membership by hand.** That single item lets every benefit in
Phase 3 and the voucher in Phase 4 be built and tested **before any StoreKit
work exists** — comp yourself a membership, watch the listing limit rise, buy a
coach offer at the member price, receive the voucher.

So the native work (Phase 5) is the *last* thing, not the first, and it changes
only how entitlement is acquired — never what entitlement does. That is also
the ordering that keeps build spend down: one build, at the end, when the rest
is proven.

---

## Phase 0 — Decisions. No code. This is the real blocker.

### 0.1 Who funds the $25 voucher — DECIDED 2026-09-12: PGD funds it

The owner of this app also owns Pickleball Grip Doctor, so the voucher is an
internal transfer, not a cost paid to a third party. **Price stays $25/year.**

The economics that matter, stated once so nobody re-derives them:

- The app collects $25 and nets **$17.50–$21.25** after Apple's 15–30%.
- PGD gives up $25 *at retail*, but its real outlay is COGS plus fulfillment.
- Across both businesses the year is positive only while PGD's landed cost of a
  redeemed voucher stays under roughly $17.50 — and **shipping is the line item
  that decides it**, not the grip.

**Settled 2026-09-12:** $25 to spend on product, **shipping excluded**, and
**no remaining balance carries forward**. Unredeemed codes cost nothing, an
under-$25 order simply forfeits the difference, and PGD's exposure per redeemed
voucher is capped at $25 of product cost with no shipping subsidy — which is
what keeps the landed cost inside the $17.50 envelope above.

See 4.0 for what that shape means in Shopify. It is a **discount code, not a
gift card**, and the distinction is the whole decision.

### 0.2 RevenueCat or raw StoreKit — the last open decision

**StoreKit is confirmed as the rail (2026-09-12)**, chosen over a now-permitted
Stripe link-out for what Apple absorbs and to keep membership money out of the
Connect/marketplace ledger. See MONETIZATION_PLAN.md.

What remains is how to talk to it. Note `expo-in-app-purchases` is deprecated,
so the real options are `react-native-purchases` (RevenueCat) or
`react-native-iap`.

RevenueCat absorbs receipt validation, renewals, restore, grace periods and
billing retry, and its webhook maps cleanly onto writing the `memberships` row.
Free below $2.5k/month tracked revenue, then ~1% — free at launch volume. Raw
StoreKit avoids the dependency but puts the subscription lifecycle on us, which
is where entitlement leaks live. **Blocks Phase 5 only.**

### 0.3 What "Director" is
`profiles.role`, `DirectorOnly` and `apply-director.tsx` already make it a free
role. `membership-settings.tsx` shows it as a third plan card. Decide: free role,
or paid tier. **Blocks 3.3.**

### 0.4 Where Shopify codes come from — DECIDED 2026-09-12: CSV pool

Pre-generated codes, pasted or uploaded in `/admin/wallet`. No credentials in
our stack, no HTTP call in the middle of a grant, available today. The Admin
API stays the upgrade path if volume ever justifies it.

What the pool costs, accepted knowingly: a revoked membership cannot recall a
code that is already live in Shopify, and without a webhook we cannot see that
a code was spent. Both are written into the migration's closing notes.

Built 2026-09-12 in `20260912120000_membership_voucher_pool.sql`.

---

## Phase 1 — Unblocked today, no dependency on anything above

### 1.1 Stop advertising a product that does not exist
`membership-settings.tsx` renders four benefits, three plan cards and a Billing
group, all inert: no `onPress` on Upgrade, plan cards set local state only,
Billing History / Payment Methods / Restore Purchases navigate nowhere, and no
price appears anywhere.

Add a `paidMembership` key to `featureFlags.ts` set to `deferred`, and gate the
screen's entry point plus a `/membership-settings` prefix in `featureRoutes.ts`.
Same treatment as `playerLists` and `weeklyGame`.

**Verification:** the row is absent from Account Settings in a production build
and a deep link to `/membership-settings` bounces to the root gate.
**Risk:** none. Removes a dead control ahead of TestFlight.

### 1.2 Admin wallet grant / revoke
`WALLET_PROMOS_PLAN.md` Phase 1 in full: five audit columns,
`admin_grant_wallet_item()`, `admin_revoke_wallet_item()`, and
`web/src/app/admin/wallet`. Types limited to `offer`, `reward`, `pass`, `ticket`.

Independently useful — it is how a failed grant gets fixed and how a refunded
promo gets withdrawn — and it is the surface Phase 4 leans on when a voucher
does not arrive.

**Verification:** as listed in that plan.
**Risk:** low. New surface, no existing behaviour changes.

---

## Phase 2 — Entitlement, server-side. No native work.

### 2.1 The entitlement itself
A `memberships` table — `user_id`, `tier`, `status`, `started_at`,
`expires_at`, `source` (`'iap' | 'stripe' | 'admin_grant'`),
`external_reference_id`, plus granted/revoked audit columns mirroring 1.1's.

A table rather than columns on `profiles`: renewals, lapses and comps are a
history, and `profiles` is already a 23-column insert in `fn_handle_new_user`
that breaks when reshaped (see `project-signup-trigger-coupling`).

Plus `is_paid_member(p_user_id uuid default auth.uid())`, `STABLE SECURITY
DEFINER`, mirroring `is_admin()` exactly.

**Verification:** function returns false for a fresh account; RLS lets a user
read only their own membership row.

### 2.2 Admin grant / revoke a membership
`admin_grant_membership(p_user_id, p_expires_at, p_note)` and
`admin_revoke_membership(...)`, same posture as 1.2 — `admin_only`, EXECUTE
revoked from `anon`/`authenticated`, writes an audit row. Added to the admin
page from 1.2.

**This is the item that unblocks everything downstream.** It is also the comp
mechanism you will want regardless of how purchase works.

**Verification:** comp a test account, confirm `is_paid_member()` flips, revoke,
confirm it flips back.

### 2.3 Read entitlement in the app
A hook alongside `useProfile`, plus whatever the web needs. Nothing consumes it
yet — this only makes it readable.

**Verification:** a comped account reports paid on device; a fresh one does not.

---

## Phase 3 — Benefits. Depends on Phase 2 only.

### 3.1 Listing limit
On activation write `profiles.marketplace_listing_limit`; on lapse or revoke,
revert to null so `fetchListingLimit`'s `DEFAULT_FREE_LISTING_LIMIT` applies
again. Do it in the grant/revoke functions so there is one writer.

Add an upgrade prompt to the "Listing limit reached" screen — it is the moment
a free user most wants the benefit.

**Verification:** comped account can create a third listing; after revoke, a
third is refused and the existing three are untouched.
**Risk:** revoke must never delete listings already over the new limit. Decide
explicitly what happens to a member who lapses with 5 active listings —
recommend: they stay, but no new ones.

### 3.2 Coach member pricing
Verified 2026-09-11: `create_coach_offer_purchase(p_offer_id,
p_participant_quantity)` computes price server-side from
`discounted_price_cents` and **does not read `premium_price_cents`**. The client
cannot choose a price, which is the right posture and must survive this change.

- RPC: charge `premium_price_cents` when `is_paid_member()` and the offer has
  one; otherwise `discounted_price_cents`.
- Browse/detail: show the member price to members, and show non-members what
  they would pay — that is the upsell.
- Filter `premium_only` offers out for non-members.

**Verification:** same offer purchased by a member and a non-member produces two
different `amount_cents`; a non-member cannot reach a `premium_only` offer;
price is correct even if the client is tampered with.
**Risk:** the highest in this plan — it changes money. Test refunds and the
reconciliation queue after.

### 3.3 Rewrite `membership-settings.tsx`
Replace the four placeholder benefits with the real four. Resolve 0.3's plan
cards. Ungate 1.1's flag when there is something to sell.

---

## Phase 4 — The PGD voucher. Depends on 2 and 0.4.

### 4.0 What the voucher is — decided 2026-09-12

$25 against product, shipping excluded, no carry-forward of an unused
remainder, one member per code.

In Shopify that is a **fixed-amount discount code**, and it must not be a
**gift card**. Gift cards are the trap here: Shopify tracks a balance on them
and carries the remainder forward across orders, which is precisely the
behaviour this decision rules out. A fixed-amount discount code already does
the right things by default — it applies to the order subtotal and not to
shipping, and anything unspent is simply gone when the order closes.

The rest is configuration, all of it store-side rather than in our code:

- **Amount:** $25 fixed (not a percentage).
- **Applies to:** entire order / all products. Shipping is untouched by a
  product discount, so no extra setting is needed to exclude it — just do not
  add a free-shipping discount alongside it.
- **Usage limit:** 1 total, and one code per member. Unique codes rather than a
  shared one, or the first member to post it on Facebook spends the programme.
- **No minimum purchase.** A member who buys a $12 grip forfeits $13, which is
  the stated intent.

Expiry is set at grant time from the wallet item, as with every other wallet
promo — not from a Shopify-side expiry we cannot see.

### 4.1 Code supply — BUILT 2026-09-12

`wallet_promo_codes` + `admin_upload_promo_codes()` + `admin_promo_code_stock()`,
with the pool panel at the top of `/admin/wallet` and the available count going
red at zero.

RLS is on with **no policies at all, not even for admins**. Every other admin
surface this week got a `for select` policy; a promo code is a bearer
instrument worth $25 to whoever holds it, so counts are exposed through an RPC
and the codes themselves are read only by the function that assigns them.

### 4.2 Grant on activation
Issue from the membership grant path, exactly as
`web/src/lib/payments/finalizePayment.ts` issues a coach voucher after a
payment finalizes. `type = 'offer'`, `partner_id` = the `pickleball-grip-doctor`
row in `wallet_partners`, `external_system = 'shopify'`, `action_type =
'external_url'`, `action_url = https://<store>/discount/<CODE>`.

**Built 2026-09-12** as `issue_membership_voucher()`, called from
`admin_grant_membership` before both of its returns — including the extend
path, so a membership first granted against an empty pool picks up its voucher
when the pool is topped up and the membership is next extended.

Issuance **never raises**. A dry pool returns `no_codes_available` and the
membership still succeeds; a membership must not fail because a promo ran out.
The admin page calls the same idempotent RPC after granting to report what
actually happened, and shows an "Issue voucher" retry.

**Verified 2026-09-12** against a scratch database with stubs, all seven cases:
grant on an empty pool still creates the membership and issues nothing; upload
skips blanks and rejects duplicates; issuance assigns exactly one code; a second
issuance is a no-op; extending issues no second voucher; a non-member gets
`no_active_membership`.
**Known limitation:** without a Shopify webhook we cannot observe redemption, so
the item stays `available` until expiry. Do not display a status we cannot back
up.

---

## Phase 5 — Purchase. Needs a build. Last, deliberately.

### 5.1 SDK and products
Per 0.2. Add the dependency, configure the product in App Store Connect,
regenerate the lockfile with **npm 10**, not local npm 11
(`project-eas-npm-lockfile`). Fingerprint changes, so this is a new build.

### 5.2 Receipt validation
An edge function verifies with Apple and writes the `memberships` row. The
client is never the authority. Handle renewal, expiry, refund and restore.

### 5.3 Paywall and restore
Wire the Upgrade row. "Restore Purchases" must actually restore.

### 5.4 Web purchase
Stripe on web writing the same entitlement, reconciled to one answer.
**Never link to it from inside the iOS app** — that is its own guideline
violation.

---

## Phase 6 — Deferred

- **No ads** — nothing to build until an ad system exists.
- **Tournament director coupons** — director tooling, geo/tournament targeting,
  redemption at registration. A feature, not a membership switch.
- **Shopify redemption webhook** — would let 4.2 mark a voucher redeemed.

---

## Dependencies

```
0.1 funding ─┬─> 0.2 SDK ──────────────────> Phase 5 (build)
             └─> price in ASC

Phase 1 (1.1 flag, 1.2 admin wallet)  [no dependencies — start here]
        │
        v
Phase 2 (2.1 table, 2.2 admin grant, 2.3 read)
        │
        ├─> Phase 3 (3.1 limit, 3.2 coach pricing, 3.3 screen)
        └─> Phase 4 (voucher)  <── 0.4 code source
```

## What only Nate can do

- Every item in Phase 0.
- App Store Connect: create the subscription product (5.1).
- Apply migrations — production writes via MCP are refused.
- Confirm PGD will supply codes, and in what quantity.
