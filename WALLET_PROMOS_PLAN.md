# Wallet Promos — Admin Granting Plan

**Written 2026-09-11.** Status: **not started.** Everything below is verified
against production as it stands today; nothing has been built.

---

## Why this exists

`wallet_items` supports seven types. **Exactly one of them can be created.**

| type | how it gets created today |
| --- | --- |
| `coach_voucher` | `create_coach_voucher_from_finalized_purchase()`, called from `web/src/lib/payments/finalizePayment.ts` after a Stripe payment finalizes |
| `credit`, `membership`, `offer`, `pass`, `ticket`, `reward` | **nothing** |

Six demo rows covering the other six types sat in production from 2026-07-20
until 2026-09-11, inserted by hand with `source_type = 'seed'`. They rendered
identically to real benefits — including a `$25 Annual Credit` with a live
`action_url` to a partner with no agreement — because nothing in the client
distinguishes a seed from an earned item. They were deleted on 2026-09-11.

This plan replaces "insert rows by hand" with an audited admin surface.

## What already exists (verified 2026-09-11)

Confirmed in production, so none of it needs building:

- **`is_admin()`** — `STABLE SECURITY DEFINER`, checks `profiles.role = 'admin'`.
  Already used by the admin RPCs, which raise `admin_only`, and by the client
  guard in `web/src/app/admin/reviews`.
- **Idempotency index** —
  `CREATE UNIQUE INDEX idx_wallet_items_idempotent_source ON wallet_items
  (user_id, source_type, source_id, type) WHERE source_id IS NOT NULL`.
  A grant that supplies `source_id` **cannot** double-issue. This was the
  biggest risk on the list and the schema already answers it.
- **`status` includes `'revoked'`** — so withdrawing a promo is a state change,
  not a delete. The row and its history survive.
- **`wallet_activity`** — `(wallet_item_id, user_id, event_type, title,
  description, amount, currency_code, external_reference_id, metadata)`. The
  audit trail table already exists and cascades on item delete.
- **RLS posture** — `wallet_items` has one policy, `user select own [r]`. No
  insert/update/delete for anyone. Writes only ever happen through a
  `SECURITY DEFINER` function whose EXECUTE is revoked from `anon` and
  `authenticated`. **Preserve this.** It is what makes the table trustworthy.

## What does NOT exist

- Any admin surface for the wallet. `web/src/app/admin/` holds `email-preview`,
  `facility-applications`, `facility-import`, `reviews` — nothing else. Zero
  files in `web/src` reference `wallet_items` outside `finalizePayment.ts`.
- Audit columns: no `granted_by`, `revoked_by`, `revoked_at`, or reason.
- Any way to **spend** a `credit`. `original_value_amount` and
  `remaining_value_amount` exist, but nothing decrements them — redemption
  exists only for coach vouchers (`coach_voucher_entitlements` +
  `WalletRedeemSheet`).

---

## Phase 1 — Grant and revoke, single user

### 1.1 Migration: audit columns

Add to `wallet_items`:

```
granted_by   uuid  references profiles(id)
granted_note text
revoked_by   uuid  references profiles(id)
revoked_at   timestamptz
revoke_reason text
```

Real columns rather than `metadata` jsonb: "who gave this person money, and
who took it back" is the first question anyone will ask of this table, and it
should be answerable with a join rather than a JSON path.

### 1.2 Migration: `admin_grant_wallet_item()`

`SECURITY DEFINER`, `search_path = public`, and EXECUTE revoked from `PUBLIC`,
`anon`, `authenticated` — the same posture as
`create_coach_voucher_from_finalized_purchase`.

Arguments: `p_user_id`, `p_type`, `p_title`, `p_subtitle`, `p_description`,
`p_value_label`, `p_action_type`, `p_action_url`, `p_partner_id`, `p_starts_at`,
`p_expires_at`, `p_source_id`, `p_note`.

Must:
- `if not is_admin() then raise exception 'admin_only'`
- reject a `p_type` outside the Phase 1 allowlist (see 1.5)
- require `p_source_id`, so the idempotency index applies. Re-granting the same
  `source_id` returns the existing row rather than raising.
- set `source_type = 'admin_grant'` — distinguishable from `'seed'`,
  `'coach_offer_purchase'` and anything later.
- validate `p_action_url`: `https://` only when `action_type = 'external_url'`.
  The deleted seeds pointed at real partner sites; an admin form that writes an
  arbitrary URL into someone's wallet is an open redirect with a brand attached.
- write a `wallet_activity` row (`event_type = 'granted'`).
- stamp `granted_by = auth.uid()`.

### 1.3 Migration: `admin_revoke_wallet_item()`

Arguments: `p_item_id`, `p_reason`.

Must: assert `admin_only`; set `status = 'revoked'`, `revoked_by`, `revoked_at`,
`revoke_reason`; write a `wallet_activity` row (`event_type = 'revoked'`).
**Never deletes.** A hard delete is what made the seeds untraceable.

Refuses to revoke a `coach_voucher` — those represent money that moved through
Stripe, and unwinding one is a refund, not an admin toggle.

### 1.4 Admin page: `web/src/app/admin/wallet`

Follows `admin/reviews`: client guard on `profile.role !== 'admin'` plus the
server-side `admin_only` raise, so the gate is enforced where it matters and the
UI merely reflects it.

- Find a user (email or name search).
- List their wallet items with type, status, value, source, granted-by.
- **Grant** form — type picker, the fields from 1.2, a required note.
- **Revoke** action with a required reason and a confirm step.

Calls the RPCs from a **server action** with the service role. The browser must
never hold a service key or touch `wallet_items` directly.

### 1.5 Scope: which types Phase 1 may grant

**Allowed: `offer`, `reward`, `pass`, `ticket`.** These are informational or
link-out. What the user sees is the whole of what they get, so granting one is
honest on its own.

**Deferred: `credit`, `membership`.** Nothing in the app can spend a credit —
`remaining_value_amount` is decremented by no code — and no membership confers
anything. Granting either produces a card that looks like value and does
nothing. That is precisely the seeded `$25 Annual Credit` we just deleted, with
a nicer form in front of it.

`coach_voucher` is never grantable: it is issued by the purchase path.

## Phase 2 — Redemption, which unlocks `credit`

Only worth starting once someone asks for credits. Needs: a decrementing
redemption RPC, a surface to spend against (marketplace? booking?), and
`partially_redeemed` handling in the wallet UI (the status exists; nothing sets
it).

## Phase 3 — Bulk grants

"Every user gets $25" is a different blast radius from one grant. Wants a dry
run showing the recipient count, a confirmation naming that count, a single
`source_id` prefix per campaign so the whole batch can be revoked together, and
a rate limit. Do not fold this into Phase 1.

---

## Verification

- Grant an `offer` to a test account; confirm it appears in that account's
  wallet and in **no other** account's.
- Re-run the identical grant; confirm one row, not two (idempotency index).
- Revoke it; confirm `status = 'revoked'`, the row still present, and a
  `wallet_activity` row for each of grant and revoke.
- Call both RPCs as a non-admin; confirm `admin_only`.
- Confirm `anon` and `authenticated` cannot execute either function.
- Attempt `action_url = 'javascript:alert(1)'` and `http://…`; both rejected.

## Open questions for Nate

1. **Partners.** `wallet_items.partner_id` exists — is there a partners table to
   pick from, or is a partner just free text on the promo for now?
2. **Expiry.** Should a promo without `expires_at` be allowed, or is an expiry
   mandatory? The deleted seeds ran to 2027.
3. ~~**Visibility of revoked items.**~~ **Answered by the existing code, not an
   open question.** `fetchWalletItems` applies no status filter, and
   `walletItemStatus.ts` already maps `revoked` to a red "Revoked" badge while
   `getWalletDashboardSection()` moves it to the `history` section. So a revoked
   promo stays visible to the user, clearly marked, out of the active sections.
   That is the right behaviour and needs no work — worth knowing before someone
   "fixes" it by filtering revoked items out.
