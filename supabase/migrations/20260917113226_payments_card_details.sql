-- Receipt redesign (Payment Receipt feasibility, 2026-09-17): capture the
-- card brand + last four digits Stripe already returns on a successful
-- PaymentIntent's payment method, so a receipt can show "Visa •••• 8180"
-- instead of nothing.
--
-- This was deliberately never stored before — see the pre-existing comment
-- in apps/mobile/src/lib/supabase/payments.ts explaining that a receipt
-- showing card info would otherwise be "a guess." This migration is what
-- turns that guess into a fact: captured directly from Stripe's own
-- PaymentMethod object in the webhook handler at the moment a payment
-- succeeds, not inferred or duplicated from anywhere else.
--
-- Nullable and populated going forward only — a payment that succeeded
-- before this shipped has no card info and none is backfilled. Card details
-- are informational display only; nothing in the payment/refund/reconciliation
-- logic reads these columns.

alter table public.payments
  add column if not exists card_brand text,
  add column if not exists card_last4 text;

comment on column public.payments.card_brand is
  'Stripe PaymentMethod card brand (e.g. visa, mastercard), captured at payment_intent.succeeded. Null for payments that succeeded before this column existed, and for non-card payment methods.';
comment on column public.payments.card_last4 is
  'Last four digits of the card used, captured at payment_intent.succeeded. Display only.';
