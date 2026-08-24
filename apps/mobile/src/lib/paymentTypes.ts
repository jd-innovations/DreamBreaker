// Display-layer types for the Payments screen. The `purpose_type` column on
// `payments` is deliberately free text (see the shared payment foundation
// migration) so new paid features never need a schema change — this union
// lists the purposes that exist today, and anything unrecognized still
// renders with a generic label rather than breaking the list.

export type PurchasePurposeType =
  | 'tournament_registration_entry'
  | 'tournament_registration_hold'
  | 'tournament_registration_balance'
  | 'tournament_team_entry'
  | 'coach_offer_purchase'
  | 'reservation_payment';

export type PurchaseStatus = 'succeeded' | 'refunded' | 'partially_refunded';

export type Purchase = {
  id: string;
  purposeType: PurchasePurposeType;
  purposeId: string;
  /** Tournament / facility / offer name. Null when the target row is gone or RLS hid it. */
  subtitle: string | null;
  amountCents: number;
  refundedCents: number;
  currency: string;
  status: PurchaseStatus;
  /** Settlement time (confirmed_at), falling back to checkout start. */
  paidAt: string;
};
