// Typing the emailed code instead of tapping the link (owner, 2026-10-04).
//
// The Confirm signup and Reset password emails carry {{ .Token }} beside the
// link: the same one-time pass in two forms, so using either uses both and a
// resend cancels both. The code screen is an ADDITION to the link flow.
//
// Length: Supabase lets the project set 6–10 digits (default 6) and the setting
// is not readable from the apps, so input accepts that whole range rather than
// assuming six.
//
// Errors: a wrong code and an expired code get the same message. Saying which
// tells someone guessing that they have the right email and should keep going.

export const CODE_MIN_LENGTH = 6;
export const CODE_MAX_LENGTH = 10;

export type CodePurpose = 'signup' | 'recovery';

/** Digits only, capped at the longest code Supabase can send. Handles pasted "482 913". */
export function normalizeCode(input: string): string {
  return input.replace(/\D/g, '').slice(0, CODE_MAX_LENGTH);
}

export function isCompleteCode(code: string): boolean {
  return code.length >= CODE_MIN_LENGTH && code.length <= CODE_MAX_LENGTH;
}

/** What to show when verifyOtp fails. Never distinguishes wrong from expired. */
export function codeErrorMessage(error: { code?: string; status?: number } | null | undefined): string | null {
  if (!error) return null;
  if (error.status === 429 || error.code === 'over_request_rate_limit') {
    return 'Too many tries. Wait a few minutes, then try again or get a new code.';
  }
  return "That code didn't work. Check the newest email from us, or get a new code.";
}
