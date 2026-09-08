// Client-side mirror of the server's auth policy.
//
// `minimum_password_length = 8` is set in supabase/config.toml's [auth] block
// (and must match the Password Requirements setting in the Supabase Dashboard
// for hosted environments — config.toml only governs a local `supabase start`
// stack). Every client-side password check reads from here so the app rejects a
// too-short password before the network call, with a message the user can act
// on, instead of surfacing a raw GoTrue error.
//
// Keep this in sync with the server value. Raising it here alone is safe (the
// client just gets stricter); lowering it below the server value is not — the
// request will be accepted locally and rejected by GoTrue.
export const MIN_PASSWORD_LENGTH = 8;

/** Placeholder copy for password inputs, e.g. "Min. 8 characters". */
export const PASSWORD_PLACEHOLDER = `Min. ${MIN_PASSWORD_LENGTH} characters`;

/** Alert body used when a password is too short. */
export const PASSWORD_TOO_SHORT_MESSAGE = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;

/** True when `password` satisfies the minimum length. */
export function isPasswordLongEnough(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH;
}
