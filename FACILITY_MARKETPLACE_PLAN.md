# Facility Marketplace — build plan

Status: **draft for review.** Nothing built. Decisions recorded below are the
user's, made 2026-09-01.

The model is GolfNow: a business claims the venue it operates, lists discounted
inventory, takes payment through us, and gets paid out. Structurally this is the
coach marketplace with the economics layer rebuilt around a reservation instead
of a voucher.

---

## Where things actually stand

Measured against production, 2026-09-01:

| | |
| --- | ---: |
| Facilities | **194** |
| ...with `claim_status <> 'unclaimed'` | **0** |
| ...with an owner | **0** |
| `facility_members` rows | **0** |
| Facilities with courts | **1** |
| Ball machines | 1 |
| Flash deals | 1, expired 2026-08-17 |
| Confirmed reservations | 9 (all at one venue) |

**The backend is largely built and has no callers.** `flash_deals` supports
`facility | court | ball_machine` owners and has complete manager RLS
(insert/update/delete gated on `is_facility_role_at_least(..., 'manager')`).
`facility_members` has a full role system including a bootstrap owner
self-insert policy. `useFacilityRole` and `facilityMembers.ts` exist and **no
screen imports either**. Every code reference to `flash_deals` is a read.

The booking flow already *consumes* deals end to end: `reservation_best_flash_deal()`
picks the best one, and `reservations` carries `flash_deal_id`,
`flash_deal_discount_percent` and `final_price_cents`.

---

## The gap that matters most

`create-booking-payment-intent` charges `reservation.final_price_cents` and
stops. No `transfer_data`, no `application_fee`, no destination account.

Coach purchases snapshot `gross_selling_price_cents`,
`platform_commission_amount_cents` and `coach_net_proceeds_cents`, with CHECK
constraints enforcing the arithmetic. Reservations snapshot only
`base_price_cents`, `flash_deal_discount_percent`, `final_price_cents`.

**So facility booking has no economics at all.** All nine confirmed bookings'
money sits in the platform balance with no record of what the facility is owed.
This is the real scope — not deals.

---

## Decisions made

1. **A facility is a business.** Its Connect account belongs to the facility,
   not to the person who claimed it. A club's revenue must not flow through an
   individual's tax identity.
2. **The facility is paid for no-shows and for late cancellations** —
   cancellations outside the allowed window. The court was held; nobody else
   could book it.

### A correction to the framing

"Business" was described as making a facility *private* in the directory.
`public_access` (true for 185), `membership_required` and `bookable_by_public`
already exist and describe **physical** access; `facility_type` is `'Private'`
on 1 row and null on 193.

Commercial operation is independent of physical access — a municipal park may be
claimed by its parks department and sell bookings. So no new privacy flag:
`claim_status` plus Connect onboarding state is the "operating business" signal,
and the directory derives its treatment from that.

---

## What does NOT port from coaches

- **No voucher, no redemption, no QR.** Coach payout is gated on
  `redeem_coach_voucher` because redemption is the only proof the lesson
  happened. A booking already has a time slot:
  `status = 'confirmed' AND lower(time_range) <= now()` is the equivalent, and
  is already what `review_eligibility` uses. Phase 5 of the coach build simply
  does not recur.
- **No-show economics invert.** Unredeemed coach voucher → no payout.
  No-show court → facility is paid.
- **`flash_deals` is not `coach_offers`.** `coach_offers` is a product with its
  own price and inventory; `flash_deals` is a percentage off a court's
  `hourly_rate_cents` — the GolfNow shape, and already correct. Build the
  posting UI, not a new model.

## What ports nearly unchanged

Connect onboarding (`create-connect-onboarding-link`), batch claim/settle
ordering, transfer reversal with clawback shortfall withholding, ledger events,
and commission settings — `coach_marketplace_*_commission_pct` establishes the
naming a `facility_*` set follows. `platform_fee_percent` (6) already exists.

---

## Phases

Ordered so each one has a user who can exercise it. Deals come late because
they discount inventory that mostly does not exist yet.

### Phase 1 — Claiming
Nobody owns anything, so nothing downstream has an authorised actor. Calls the
existing bootstrap policy; moves `claim_status` off `unclaimed`. Needs an admin
review step — claiming a venue you do not operate is the obvious abuse.
Connects to the "Suggest an Edit" support-ticket flow already chosen.

### Phase 2 — Facility management + courts
A claimed facility with no courts is still unbookable — this is what unlocks the
other 193. Court CRUD (`hourly_rate_cents`, `is_active`, indoor/outdoor),
staff management via `facility_members`. First screens to import `useFacilityRole`.

### Phase 3 — Connect onboarding for the entity
Add `facilities.stripe_connect_account_id` + `stripe_connect_onboarded_at`,
mirroring `profiles`. Reuse `create-connect-onboarding-link` with a facility
role. A facility cannot list paid inventory until onboarded — the same gate
coaches have.

### Phase 4 — Booking economics
The core. Snapshot columns on `reservations` mirroring the coach purchase model
(gross, platform commission, facility net proceeds) with CHECK constraints, plus
`facilities.cancellation_window_hours` — following the precedent of
`tournaments.cancellation_policy` / `refund_cutoff_days`.

Payout eligibility becomes: the slot has elapsed **and** the reservation is
`confirmed`, **or** was cancelled later than the window allowed.

### Phase 5 — Deal posting UI
The RLS is already waiting. A form and a list, over `flash_deals`. Facility-,
court- and machine-level deals all already representable.

### Phase 6 — Payouts
Port the coach batch runner against elapsed reservations. Note the retry lesson:
failed batches must release their items, and settle must accept `failed`.

### Phase 7 — Refunds and cancellations
Buyer-initiated cancellation inside the window → refund, no facility payout.
Outside the window → no refund, facility paid. Admin override via the existing
support-ticket path.

---

## Open questions

1. **Commission rate for facilities.** Coaches are 18% base / 7% boost. Not
   obviously the right number for court inventory.
2. **Who verifies a claim?** Admin review, domain-matched email, or a phone
   callback. Phase 1 cannot ship without an answer.
3. **What happens to the 9 existing bookings** taken with no economics
   recorded — backfill a net-proceeds figure, or leave them as pre-marketplace.
