/**
 * One way to turn cents into a string, for both apps.
 *
 * Workstream C1 of WEB_MOBILE_ALIGNMENT_PLAN.md. Before this there were twelve
 * formatters across the two trees and five distinct behaviours, so the same
 * price rendered differently depending on which screen you were looking at:
 *
 *   2499  ->  "$24.99"  (toFixed(2), 6 mobile sites)
 *   2499  ->  "$24.99"  (Intl, payments history and receipt)
 *   2499  ->  "$25"     (toFixed(0), coach offers)
 *   2499  ->  "$25"     (Math.round, marketplace and booking results)
 *   2499  ->  "$24.99"  (toLocaleString, web admin)
 *
 * The middle two are not a rounding preference. They display a price that is
 * not the price, on the two surfaces where someone is deciding whether to buy.
 * Latent rather than visible today only because every price in production is
 * currently a whole number of dollars -- it fires the first time a seller types
 * 249.99.
 *
 * THE DESIGN DECISION: `omitZeroCents` keeps the compact look those surfaces
 * wanted without ever lying. "$25" for 2500 is a formatting choice; "$25" for
 * 2499 is a wrong answer. So the option drops ".00" only when the cents really
 * are zero, and a price with cents always shows them.
 *
 * Intl.NumberFormat rather than string building, because currency symbol
 * placement, grouping and negative-sign position are locale rules we should not
 * be reimplementing -- and two of the twelve already hard-coded "$" onto
 * whatever currency the row carried.
 */

export type MoneyOptions = {
  /** ISO 4217, case-insensitive. Defaults to USD. Null and empty mean USD. */
  currency?: string | null;
  /**
   * Render 2500 as "$25" instead of "$25.00". NEVER hides real cents: 2499
   * still renders "$24.99". For dense surfaces -- cards, chips, list rows.
   */
  omitZeroCents?: boolean;
  /** Rendered for null, undefined and non-finite input. Defaults to an em dash. */
  fallback?: string;
};

const DEFAULT_FALLBACK = '—';

/**
 * Cents to a display string.
 *
 * Null is a real case, not an error: a facility with no published rate and a
 * listing with no asking price both reach this. Callers that want their own
 * wording pass `fallback` rather than branching before the call.
 */
export function formatCents(
  cents: number | null | undefined,
  options: MoneyOptions = {},
): string {
  const { currency, omitZeroCents = false, fallback = DEFAULT_FALLBACK } = options;

  // Number.isFinite also catches NaN, which is what a bad parse upstream
  // produces and what previously rendered as "$NaN".
  if (cents == null || !Number.isFinite(cents)) return fallback;

  const code = currency && currency.trim() !== '' ? currency.trim().toUpperCase() : 'USD';
  // Whole dollars are decided on the CENTS, not the divided value, so floating
  // point never gets a vote: 2500 % 100 is exact, (2500/100) % 1 is not.
  const whole = omitZeroCents && cents % 100 === 0;

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    }).format(cents / 100);
  } catch {
    // An unknown currency code throws. Degrading to a plain rendering beats
    // taking down a screen over a bad row -- and the code is kept visible so
    // the number is never silently mislabelled as dollars.
    const amount = (cents / 100).toFixed(whole ? 0 : 2);
    return `${amount} ${code}`;
  }
}

/**
 * The dollars part alone, for places that style the currency separately -- a
 * large price with a small symbol, for instance. Rounds toward zero rather
 * than nearest, so it can never read higher than the real price.
 */
export function dollarsFromCents(cents: number): number {
  return Math.trunc(cents / 100);
}
