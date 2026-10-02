// "Send a new confirmation link" — the rules both apps follow (owner, 2026-10-02).
//
// Supabase's auth.resend({ type: 'signup' }) re-sends the Confirm signup email.
// Two rules shape how the result is shown:
//
//   - Neutral wording. Resend reports success for an address with no account
//     (and for one already confirmed), and the screen must not turn that into
//     "no such account": that would let anyone probe which emails are
//     registered. Success is always "if that account still needs confirming,
//     a new link is on its way".
//   - Cooldown. GoTrue allows one email per address per minute and answers
//     faster requests with over_email_send_rate_limit. The button waits out the
//     same minute rather than surfacing a server error.

export const RESEND_COOLDOWN_SECONDS = 60;

export const RESEND_SENT_MESSAGE =
  'If that account still needs confirming, a new link is on its way. Check your inbox, and open the newest email.';

/** A person-readable result for a resend attempt, from GoTrue's error code. */
export function resendErrorMessage(error: { code?: string; status?: number } | null | undefined): string | null {
  if (!error) return null;
  if (error.code === 'over_email_send_rate_limit' || error.status === 429) {
    return 'A link was sent a moment ago. Wait a minute, then try again.';
  }
  if (error.code === 'validation_failed' || error.code === 'email_address_invalid') {
    return 'Enter a valid email address.';
  }
  return "Couldn't send a new link right now. Try again in a minute.";
}

/** Light shape check before calling the server; GoTrue validates for real. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
