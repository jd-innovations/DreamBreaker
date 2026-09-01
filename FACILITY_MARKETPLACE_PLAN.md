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
3. **Commission is adjustable, defaulting to 20%.** Three tiers, reusing the
   coach pattern exactly: a `platform_settings` default, a per-facility
   override, and a per-deal override, with `commission_pct` and
   `commission_source` snapshotted onto the reservation so the winning tier is
   recoverable later.
4. **Facilities scan a check-in code, like coaches.** See the note below on why
   it cannot gate payment.
5. **The 9 existing bookings are test data.** No backfill; they are
   pre-marketplace and not real.

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

- **The scan happens, but it must not gate payment.** Facilities get a
  check-in scanner (decision 4), and it is genuinely useful: a front desk
  confirming an arrival holds a valid booking is real operational work.

  But for coaches the scan IS the payout trigger — no redemption, no money.
  Copying that here contradicts decision 2: a no-show never scans, so it would
  never pay out. It would also hand every facility a way to withhold its own
  revenue by simply not scanning.

  So the two are decoupled. The scan records **attendance and access control**;
  the payout triggers on the slot elapsing
  (`status = 'confirmed' AND lower(time_range) <= now()`, already what
  `review_eligibility` uses). Same scanner UX, different meaning.
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

### Phase 1 — "Become a Facility Manager"
Nobody owns anything, so nothing downstream has an authorised actor.

Modelled on the shipped director flow rather than a new mechanism:
`profiles.director_status` (null -> pending -> approved) with
`director_approved_at` / `director_approved_by`, an `apply_to_be_director()`
RPC, an `is_approved_director()` gate and `fn_notify_director_status` to tell
the applicant. `coach_status` is the same shape. All of it copies.

**The one dimension director does not have.** `director_status` is a property of
the person — an approved director creates their own tournaments, so there is
nothing to bind them to. A facility manager must be bound to ONE of 194
existing venues; a global flag would grant authority over every one of them.

So the application carries a facility:

    (user, facility, evidence) -> admin approves -> facility_members row, role 'owner'

`facility_member_role` is already `owner | manager | staff`, so approval lands
in a structure that exists, and the new owner adds their own staff without
coming back to an admin. Admin vets the FIRST relationship per venue; the owner
handles everyone after.

`facilities.claim_status` becomes derived — it flips when a venue's first owner
is approved. Nothing user-facing says "claim".

**On that word.** It is already spent twice: `/claim/[token]` is a personal
MATCH claim, and the facility card's old "Claim this facility" CTA is now
"Suggest an Edit", a support ticket open to any user. Suggesting an edit and
taking over a venue's revenue must never collapse into one flow — same surface,
completely different trust requirement.

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

### Phase 5 — Check-in scanner
Ports the coach redeem screen's UX over reservations. Writes an attendance
record; deliberately touches no money. Gives no-show reporting something real
to count, and feeds review eligibility.

### Phase 6 — Deal posting UI
The RLS is already waiting. A form and a list, over `flash_deals`. Facility-,
court- and machine-level deals all already representable.

### Phase 7 — Payouts
Port the coach batch runner against elapsed reservations. Note the retry lesson:
failed batches must release their items, and settle must accept `failed`.

### Phase 8 — Refunds and cancellations
Buyer-initiated cancellation inside the window → refund, no facility payout.
Outside the window → no refund, facility paid. Admin override via the existing
support-ticket path.

---

## Open question

**What evidence does an application carry?** The director flow asks for none —
an admin simply approves a person. Taking over a venue's revenue is a higher
bar, so the form probably needs something: a work email on the facility's
domain, a phone match against `facilities.phone`, or a free-text case an admin
reads. Not blocking Phase 1's shape, but it decides what the form contains.
