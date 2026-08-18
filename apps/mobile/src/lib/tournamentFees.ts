// The single client-side statement of how a tournament entry fee is resolved.
//
// A division may override its tournament's base entry fee. Every server-side
// payment entry point resolves the amount it will actually charge as
// `division.entry_fee_cents ?? tournament.entry_fee_cents ?? 0` — see
// supabase/functions/create-tournament-entry-payment-intent/index.ts and its
// hold/balance/team siblings.
//
// Before this module existed the client resolved the fee independently, and
// only ever read the TOURNAMENT-level column. Any division with its own fee
// therefore quoted one price in the UI and charged another at the card: a
// $50 tournament with a $120 Mixed Doubles division displayed a $40 balance
// due and charged $110. Every screen that quotes a price, and every mapper
// that derives a balance, must go through these helpers so the number a
// player is shown is the number the server will charge them.

/**
 * Entry fee for a specific division, in cents. `divisionFeeCents` is the
 * division's own override (undefined/null when it doesn't set one).
 */
export function effectiveEntryFeeCents(
  divisionFeeCents: number | null | undefined,
  tournamentFeeCents: number | null | undefined,
): number {
  return divisionFeeCents ?? tournamentFeeCents ?? 0;
}

/**
 * What's still owed on a held spot once the deposit is applied. Never
 * negative — a deposit larger than the entry fee leaves nothing due, and the
 * balance edge function refuses to create a PaymentIntent in that case
 * ("no_payment_required").
 */
export function balanceDueCents(
  entryFeeCents: number,
  alreadyPaidCents: number,
): number {
  return Math.max(0, entryFeeCents - alreadyPaidCents);
}
