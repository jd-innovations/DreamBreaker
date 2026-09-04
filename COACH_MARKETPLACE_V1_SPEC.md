# COACH_MARKETPLACE_V1_SPEC.md

## 1. PRODUCT DEFINITION

The Coach Marketplace is the "Groupon of Pickleball."

It allows pickleball coaches to create discounted lesson offers, sell them through pickleballapp, receive payment through Stripe Connect after fulfillment, and use pickleballapp's distribution network to market their offers to relevant players.

The core transaction is:

Coach creates offer
→ pickleballapp distributes offer
→ Player purchases
→ Voucher is added to player's Wallet
→ Player schedules directly with coach
→ Coach provides lesson
→ Coach scans/redeems player's QR code
→ Redemption enters settlement hold
→ Coach earnings become payout eligible
→ Coach receives weekly payout

The Coach Marketplace is NOT a lesson scheduling platform in V1.

The Coach Marketplace is also separate from the Court Booking system.

# 2. PRODUCT BOUNDARY

Two separate marketplace products exist:

COURT BOOKING
"GolfNow of Pickleball"

Facilities sell:

* Court inventory
* Ball machine inventory
* Future facility inventory

COACH MARKETPLACE
"Groupon of Pickleball"

Coaches sell:

* Private lessons
* Semi-private lessons
* Group clinics
* Camps
* Multi-lesson packages

These systems may share platform infrastructure but must maintain separate business logic.

Shared infrastructure may include:

* User profiles
* Facilities
* Wallet
* Payments
* Stripe
* Notifications
* Image pipeline
* Analytics
* Admin tooling

IMPORTANT V1 RULE:

The Coach Marketplace SHALL NOT create, modify, reserve, hold, or otherwise interact with court inventory.

A coach may associate an offer with an existing pickleballapp facility.

This is location metadata only.

The coach remains responsible for arranging any required court.

# 3. COACH ACTIVATION

Any pickleballapp user may activate Coach functionality.

Coach Mode is activated from Profile Settings.

Coach onboarding must be completed before selling offers.

Stripe Connect onboarding is required.

Completing Coach onboarding activates the Coach badge and Coach functionality.

Manual coach certification or approval is not required for V1.

Stripe Connect onboarding plus redemption-controlled payouts provides the initial accountability layer.

Coach functionality should remain unavailable until required onboarding steps are completed.

# 4. COACH OFFER TYPES

V1 supports:

* Private lessons
* Semi-private lessons
* Group clinics
* Camps
* Multi-lesson packages

Specific scheduled events are NOT part of V1.

V1 uses a voucher-first model.

The player purchases the lesson offer and schedules the actual lesson directly with the coach.

# 5. OFFER CREATION

Coaches must be able to create offers entirely from mobile.

Offer creation should be extremely simple.

Required or configurable information may include:

* Offer title
* Description
* Coach
* Lesson type
* Skill level
* Regular price
* Discounted price
* Discount percentage
* Duration
* Number of participants
* Quantity available
* Purchase limit per customer
* Facility/location
* Images
* Terms
* Applicable audience

Coaches can:

* Create offers
* Edit offers
* Pause offers
* Duplicate offers
* Boost offers

Price changes only affect future purchases.

Existing purchased vouchers retain the price and terms that existed when the purchase occurred.

# 6. DISCOUNT MODEL

The Coach Marketplace is designed around discounted offers.

The coach controls:

* Regular price
* Discounted selling price

pickleballapp controls:

* Minimum required discount

The minimum discount is an admin-configurable parameter.

Example:

Regular price: $80
pickleballapp price: $52
Discount: 35%

The platform may eventually recommend discounts based on marketplace analytics.

Example:

"Similar offers receive 23% more purchases when discounted 30–35%."

These recommendations are advisory.

The coach controls the final price as long as the platform minimum discount requirement is satisfied.

# 7. OFFER INVENTORY

Offers may have limited inventory.

Example:

20 vouchers available
7 remaining

Coaches may establish a maximum number of purchases per customer.

Inventory must be protected against overselling.

Multi-participant purchases must properly decrement available inventory.

# 8. COMMISSION

Platform commission is variable.

Commission is controlled by admin.

Commission MUST NOT be hard-coded globally.

Different coaches and/or offers may have different commission rates.

Example:

Coach A: 15%
Coach B: 20%
Promotional agreement: 25%

Commission is calculated using the actual amount paid by the purchaser.

The commission rate applicable at the time of purchase must be snapshotted onto the transaction.

Future commission changes MUST NOT alter existing transactions.

# 9. STRIPE PROCESSING FEES

Stripe processing costs are charged against the coach's economics.

The transaction ledger must separately record:

* Gross purchase amount
* Discounts
* Taxes
* Platform commission
* Stripe/payment processing fees
* Coach net earnings

Financial calculations must remain auditable.

# 10. BUYER SERVICE FEE

The architecture must support an optional buyer-facing service fee.

The service fee may be:

* Fixed
* Percentage based
* Disabled

V1 default:

DISABLED / $0

Admin must be able to activate this functionality in the future without requiring checkout architecture changes.

# 11. TAXES

The platform collects and handles applicable taxes.

Tax handling must be designed as platform-level infrastructure rather than coach-controlled functionality.

Exact tax implementation must be validated against Stripe and applicable accounting/legal requirements before production launch.

# 12. WALLET PURCHASE FLOW

Every successful Coach Marketplace purchase automatically creates a Wallet asset.

The Wallet should distinguish between:

MY VOUCHERS

Offers the user has purchased and owns.

OFFERS FOR YOU

Targeted promotional offers the user has not purchased.

# 13. MY VOUCHERS

Purchased vouchers should display information such as:

* Offer
* Coach
* Purchase date
* Remaining redemptions
* Expiration
* Location
* Terms
* Redemption QR
* Manual redemption code
* Voucher status

Example:

5 Private Lessons
Coach Michael
4 remaining
Valid through February 9

SHOW QR

# 14. OFFERS FOR YOU

pickleballapp may proactively place relevant unpurchased offers into the user's Wallet.

Example:

FOR YOU

3.0–3.5 Doubles Strategy Clinic
4.3 miles away

Regular: $65
Offer: $39
40% OFF

Users may:

* Open offer
* Purchase offer
* Dismiss offer
* Mark offer as not interested

Dismissal and "not interested" behavior should become targeting/analytics signals.

# 15. PREMIUM OFFERS

The architecture must support Premium-exclusive offers and/or Premium pricing.

Example:

Regular user: $49
Premium member: $39

Premium pricing does not need to be activated immediately but must be supported by the offer architecture.

# 16. VOUCHER MODEL

Standard purchases generate one QR redemption credential per participant.

Example:

A purchase for three participants creates three participant redemption credentials.

Multi-lesson packages use a single voucher containing multiple redemptions.

Example:

5 lessons purchased

Voucher state:

5 remaining
→ 4
→ 3
→ 2
→ 1
→ REDEEMED

Every redemption must create an auditable redemption record.

# 17. QR SECURITY

QR codes must NOT directly expose:

* Personal information
* Payment information
* Sensitive transaction information

QR codes should contain or resolve through a secure opaque token.

The server determines whether the token is valid and redeemable.

QR redemption requires server validation.

Offline redemption is NOT supported in V1.

# 18. MANUAL REDEMPTION

Coaches must have a manual redemption code fallback.

If QR scanning fails, the coach may enter the redemption code manually.

Manual redemption must use the same server validation rules as QR redemption.

# 19. REDEMPTION FLOW

Coach opens Coach Mode.

Coach selects:

SCAN QR

Coach scans voucher.

Server validates:

* Voucher exists
* Voucher belongs to valid purchase
* Voucher is active
* Voucher has remaining redemptions
* Voucher has not expired
* Redemption is allowed
* Coach is authorized to redeem it

Coach confirms redemption.

Server records redemption.

Player receives immediate confirmation.

Example:

Lesson Redeemed

Coach Michael
August 14
1 lesson used

Package remaining: 3

# 20. DOUBLE REDEMPTION PROTECTION

A redemption credential cannot be redeemed more times than authorized.

All redemption operations must be transactional and server validated.

Concurrent redemption attempts must not create duplicate redemptions.

# 21. PAYMENT LIFECYCLE

Purchase does NOT make coach earnings immediately payable.

Primary lifecycle:

PURCHASED
→ ACTIVE
→ REDEEMED
→ SETTLEMENT_HOLD
→ PAYOUT_ELIGIBLE
→ PAID

Additional possible states include:

EXPIRED
CANCELLED
REFUNDED
DISPUTED
REVERSED
NO_SHOW_PENDING
NO_SHOW_APPROVED

# 22. PAYOUT ELIGIBILITY

REDEEMED = potential coach earnings.

After redemption, the transaction enters a settlement hold.

Default settlement hold:

48 hours

Settlement hold duration must be admin configurable.

After the hold expires without an unresolved issue:

PAYOUT_ELIGIBLE

# 23. COACH PAYOUTS

Coach payouts are processed weekly.

Default payout day:

MONDAY

Stripe Connect is required to receive payouts.

The coach dashboard should display:

* Pending earnings
* Settlement hold earnings
* Payout-eligible earnings
* Next payout
* Previous payouts

Example:

Pending Earnings: $485.20

Available for Next Payout: $327.40

Next Payout: Monday

8 redeemed lessons

# 24. EXPIRATION

Voucher expiration is controlled by pickleballapp.

Coaches do NOT establish their own expiration rules.

V1 expiration model:

X days after purchase

Default minimum validity:

6 MONTHS

Expiration parameters must be admin configurable.

Admin must have the ability to override the default expiration policy when required.

# 25. EXPIRATION REMINDERS

Users receive expiration reminders.

Default reminder schedule:

30 days
15 days
7 days
3 days
1 day

All reminder intervals must be admin configurable.

Notifications may use appropriate available channels.

# 26. EXPIRED UNUSED VOUCHERS

Current business rule:

When an unused voucher expires, the platform retains the funds.

This rule MUST be configurable and MUST receive legal/accounting review before production launch.

Applicable gift certificate, voucher, consumer protection, unclaimed property, and state-specific laws must be reviewed before enforcing expiration-related forfeiture.

# 27. STANDARD CUSTOMER REFUNDS

Standard unused purchases are non-refundable.

The customer cannot normally cancel a purchased voucher for a refund.

Exceptions are handled through platform-defined dispute/refund processes.

# 28. COACH CANCELLATION

If the coach cancels or cannot fulfill the purchased offer:

The buyer is entitled to a refund.

The coach may receive a platform penalty.

Coach penalty rules must be admin configurable.

# 29. COACH NO-SHOW

If the coach fails to appear:

The customer may submit a refund request.

If approved:

* Customer receives refund
* Coach may receive a penalty

Repeated coach no-shows should contribute to coach risk signals.

# 30. PLAYER NO-SHOW

A coach cannot automatically convert a disputed player no-show into a completed redemption.

Coach submits:

NO_SHOW_REDEMPTION_REQUEST

Admin reviews.

Admin may:

APPROVE
or
REJECT

Approved no-show redemption may make the associated coach earnings eligible for the normal settlement process.

# 31. ADMIN REVERSALS

Admin must be able to reverse a redemption when necessary.

Possible reasons include:

* Fraud
* Incorrect redemption
* Customer dispute
* Coach mistake
* Support resolution

All reversals must create an immutable audit trail.

Never silently modify historical redemption records.

# 32. BOOST SYSTEM

Coaches may boost offers.

V1 boost economics are commission based.

Rather than requiring a fixed advertising payment, a coach agrees to an additional platform commission percentage for boosted purchases.

Example:

Standard commission: 18%

Boost commission: +7%

Total applicable commission: 25%

Boost commission parameters must be admin configurable.

# 33. BOOST ATTRIBUTION

The system must distinguish between:

* Organic purchase
* Boost-attributed purchase

The applicable commission must be snapshotted at purchase.

Boost attribution rules must be deterministic and auditable.

Changing or stopping a boost must not alter previous purchases.

# 34. BOOST TARGETING

pickleballapp proposes a recommended target audience using platform data.

Coach may edit allowed targeting parameters.

Potential targeting signals include:

* Location
* Distance
* Skill level
* PAR
* Playing interests
* Singles/doubles preference
* Home facility
* Age group where appropriate
* Gender where appropriate
* User activity
* Marketplace engagement

Targeting architecture should support future analytics improvements.

# 35. BOOST DISTRIBUTION

Boosted offers may become eligible for distribution through:

* Lesson Marketplace
* Wallet Offers
* Email marketing
* Push notifications
* Public Groups
* Public Facility Pages

Boosting creates DISTRIBUTION ELIGIBILITY.

Boosting does NOT guarantee:

* Push notification
* Email
* Impression count
* Purchase count
* Placement position

The platform recommendation/distribution engine retains control.

# 36. PROMOTED OFFER DISCLOSURE

Paid/promoted distribution must be visibly distinguishable from normal organic recommendations when appropriate.

Examples:

FEATURED
SPONSORED
PROMOTED

Final terminology may be determined during UX implementation.

# 37. TARGETING ANALYTICS

The system should eventually support the marketplace funnel:

IMPRESSION
→ OFFER_VIEW
→ PURCHASE
→ REDEMPTION
→ REVIEW

This allows pickleballapp to optimize for completed lessons rather than clicks alone.

# 38. COACH DASHBOARD

The Coach Dashboard must remain simple.

Primary metrics:

* Sales
* Redemptions
* Pending earnings
* Next payout

Recommended additional analytics:

* Views
* Offer clicks
* Conversion rate
* Revenue
* Offer performance
* Boost performance
* Repeat customers

# 39. COACH NAVIGATION

V1 Coach functionality should provide easy access to:

DASHBOARD

OFFERS

REDEEM

PAYOUTS

REDEEM / SCAN QR should be one of the most prominent operational actions.

# 40. OFFER MANAGEMENT

Coaches may:

* Create
* Edit
* Pause
* Resume
* Duplicate
* Boost

Coaches may change pricing for future purchases.

Existing purchases MUST retain their original:

* Price
* Discount
* Commission
* Expiration terms
* Redemption rights
* Applicable conditions

# 41. AI OFFER CREATION

AI may assist coaches in creating offers.

Example coach input:

Third shot drop clinic
Intermediate
3.0–3.5
90 minutes
Regular price $75
Sell for $49
Maximum 6 players

AI may suggest:

* Offer title
* Description
* Formatting
* Category
* Target audience
* Promotional language
* Suggested discount
* Relevant marketplace metadata

AI MUST NOT invent material lesson terms.

Coach reviews and approves the listing before publishing.

# 42. REVIEWS

Only customers with a successful redemption may review a coach.

Reviews support:

* 1–5 star rating
* Written review
* Coach public response

Primary marketplace rating belongs to the coach.

Offer-level review data may still be stored for analytics.

# 43. REVIEW TRUST

Reviews must be tied to verified redeemed transactions.

Repeated complaints, poor reviews, refund patterns, coach cancellations, or other risk indicators may trigger:

* Internal warning
* Offer review
* Offer suspension
* Coach account review

Automatic enforcement thresholds should be admin configurable.

# 44. FACILITY ASSOCIATION

Coach offers may reference an existing pickleballapp facility.

Example:

Coach Sarah

Third Shot Drop Clinic

Location:
Lakewood Ranch Pickleball

This association is informational only.

It does NOT:

* Reserve a court
* Hold a court
* Check court availability
* Modify facility inventory
* Create a Court Booking transaction

# 45. COACH RESPONSIBILITY FOR COURTS

The coach is responsible for arranging any court required to fulfill their lesson.

The Coach Marketplace does not guarantee court availability.

This must be communicated where appropriate in Coach onboarding and offer creation.

# 46. COURT BOOKING SEPARATION

The Court Booking system and Coach Marketplace must remain independent in V1.

COURT BOOKING:

Facility inventory marketplace.

COACH MARKETPLACE:

Lesson voucher marketplace.

V1 should NOT create automatic cross-selling between the two systems.

Future versions may introduce:

Lesson → Book a Court

Court Booking → Find a Coach

This functionality is explicitly outside V1.

# 47. CUSTOMER PROMISE

The V1 customer promise is:

"Buy this lesson through pickleballapp. pickleballapp guarantees the voucher and transaction."

The platform is NOT promising to automatically schedule the lesson.

The coach and customer coordinate scheduling directly.

# 48. PLATFORM ARCHITECTURE PRINCIPLE

Do NOT build duplicate infrastructure specifically for Coaches when an existing reusable platform service can support the requirement.

Before implementation, audit existing:

* Wallet
* Stripe/payment infrastructure
* User profiles
* Facilities
* Notifications
* Image compression/upload pipeline
* Analytics
* Admin functionality
* Premium membership infrastructure

Reuse and extend existing systems whenever appropriate.

However, Coach Marketplace business logic must remain isolated from Court Booking business logic.

# 49. ADMIN CONFIGURATION

Avoid hard-coding business parameters.

Admin-configurable parameters should include at minimum:

* Minimum required offer discount
* Base commission
* Coach-specific commission
* Offer-specific commission
* Boost commission
* Settlement hold duration
* Payout schedule
* Voucher expiration
* Minimum voucher validity
* Expiration reminder intervals
* Buyer service fee
* Coach penalties
* Risk thresholds
* Refund exceptions
* Boost targeting parameters
* Distribution eligibility rules

Historical transactions must always preserve the rules that applied when the transaction occurred.

# 50. AUDITABILITY

Financial and redemption systems must be auditable.

Important events should be append-only or otherwise preserve historical records.

Audit events should include:

* Purchase
* Voucher creation
* Redemption
* Redemption reversal
* Refund
* No-show submission
* No-show decision
* Commission calculation
* Boost attribution
* Payout eligibility
* Payout
* Admin adjustment

Admin actions should identify:

* Action
* Timestamp
* Reason
* Previous state
* New state
* Acting admin where applicable

# 51. V1 NON-GOALS

Do NOT build the following as part of Coach Marketplace V1:

* Full coach scheduling/calendar system
* Automatic lesson scheduling
* Court reservation through Coach Marketplace
* Court inventory management
* Automatic Court Booking integration
* Scheduled coach events marketplace
* Complex coach certification system
* Offline QR redemption
* Advertising auction
* Guaranteed boost impressions
* Guaranteed push/email distribution
* Full coach CRM
* Complex business-management software

Keep V1 focused on:

CREATE OFFER
→ DISCOVER
→ PURCHASE
→ WALLET
→ SCHEDULE WITH COACH
→ REDEEM
→ PAY COACH
→ REVIEW

# 52. IMPLEMENTATION PRINCIPLE

Before writing implementation code:

1. Audit the existing codebase.
2. Identify functionality already implemented.
3. Identify reusable platform infrastructure.
4. Identify schema that can safely be extended.
5. Identify conflicts with Wallet, Stripe, Premium, Facilities, Notifications, Profiles, Marketplace, and Court Booking.
6. Document findings.
7. Produce an implementation plan.
8. Only then begin development.

Do NOT create unnecessary duplicate services, tables, payment logic, Wallet systems, notification systems, image pipelines, facility models, or profile functionality.

The goal is to add the Coach Marketplace as a native pickleballapp commerce module while preserving clean boundaries between marketplace domains.
