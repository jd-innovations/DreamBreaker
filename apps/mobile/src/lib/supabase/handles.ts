import { supabase } from '@/lib/supabase';

/**
 * Handles (@username).
 *
 * `profiles.handle` is NOT writable directly -- a BEFORE UPDATE trigger refuses
 * any client write to it (see 20260915150000_handle_write_guard.sql). Every
 * change goes through set_my_handle(), which is where the format, reserved-name
 * and cooldown rules live. That is deliberate: a client that could PATCH the
 * column would bypass all of them.
 *
 * Optional by design. A profile with no handle is complete -- nothing gates on
 * having one, and it is claimed after signup rather than assigned at signup
 * (a UNIQUE collision inside the signup trigger would 500 the signup itself).
 */

/** Mirrors the CHECK constraint and both SQL functions. Kept in sync by hand;
 *  the server is the authority and will refuse anything this lets through. */
export const HANDLE_PATTERN = /^[a-z0-9][a-z0-9_]{1,18}[a-z0-9]$/;
export const HANDLE_MIN = 3;
export const HANDLE_MAX = 20;

export type HandleCheck =
  | { state: 'available' }
  | { state: 'invalid' }
  | { state: 'reserved' }
  | { state: 'taken' }
  | { state: 'error' };

/** Lowercase and trim, exactly as the server does before validating. Typing
 *  "Jesus" is fine; it is stored as "jesus". */
export function normalizeHandle(raw: string): string {
  return raw.trim().toLowerCase();
}

export async function checkHandleAvailable(raw: string): Promise<HandleCheck> {
  const handle = normalizeHandle(raw);
  // Saves a round-trip on every keystroke that cannot possibly be valid.
  if (!HANDLE_PATTERN.test(handle)) return { state: 'invalid' };

  const { data, error } = await supabase.rpc('handle_available', { p_handle: handle });
  if (error) {
    if (__DEV__) console.warn('[handles] availability check failed', error.message);
    return { state: 'error' };
  }

  const result = data as { available?: boolean; reason?: string } | null;
  if (result?.available) return { state: 'available' };
  if (result?.reason === 'reserved') return { state: 'reserved' };
  if (result?.reason === 'taken') return { state: 'taken' };
  return { state: 'invalid' };
}

export type SetHandleResult =
  | { ok: true; handle: string }
  | { ok: false; message: string };

/**
 * Error codes come back as the exception message from set_my_handle(). Mapped
 * to copy here rather than shown raw -- `handle_change_too_soon` is not a
 * sentence.
 */
const MESSAGES: Record<string, string> = {
  invalid_format: `Use ${HANDLE_MIN}–${HANDLE_MAX} characters: lowercase letters, numbers and underscores, starting and ending with a letter or number.`,
  reserved_handle: 'That handle is not available.',
  handle_taken: 'That handle was just taken. Try another.',
  handle_change_too_soon: 'You can change your handle once every 30 days.',
  not_signed_in: 'Please sign in again.',
  handle_direct_write_denied: 'That handle could not be saved.',
};

export async function setMyHandle(raw: string): Promise<SetHandleResult> {
  const handle = normalizeHandle(raw);

  const { data, error } = await supabase.rpc('set_my_handle', { p_handle: handle });
  if (error) {
    const key = Object.keys(MESSAGES).find(k => error.message.includes(k));
    return { ok: false, message: key ? MESSAGES[key] : 'Could not save your handle.' };
  }

  const result = data as { ok?: boolean; handle?: string } | null;
  if (result?.ok) return { ok: true, handle: result.handle ?? handle };
  return { ok: false, message: 'Could not save your handle.' };
}
