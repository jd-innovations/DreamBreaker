import { supabase } from './supabase';
import { deleteCurrentDevicePushToken } from './pushNotifications';

// Client half of the account deletion flow (TODO1.1_EXECUTION_PLAN.md item 1.3).
//
// Nothing is deleted here. The client cannot delete an auth user, cannot delete
// another user's rows, and must not be able to fake a successful deletion — all
// of the work happens in the `delete-account` edge function under the service
// role, which derives the target account from the verified JWT rather than from
// anything this file sends.

export type DeleteAccountFailure =
  /** No valid session. The user must sign in before deleting. */
  | 'unauthorized'
  /** Blocked: the user still directs a tournament other players are registered for. */
  | 'active_tournaments'
  /** Network, timeout, or an unexpected server error. Safe to retry. */
  | 'internal_error';

export class AccountDeletionError extends Error {
  readonly reason: DeleteAccountFailure;
  constructor(reason: DeleteAccountFailure, message: string) {
    super(message);
    this.name = 'AccountDeletionError';
    this.reason = reason;
  }
}

export const DELETE_ACCOUNT_MESSAGES: Record<DeleteAccountFailure, string> = {
  unauthorized: 'Your session has expired. Please sign in again and retry.',
  active_tournaments:
    'You are still listed as the director of a tournament that players have registered for. Cancel or complete it, or contact support, before deleting your account.',
  internal_error: 'We could not delete your account. Nothing has been changed. Please try again.',
};

function reasonFrom(value: unknown): DeleteAccountFailure {
  return value === 'unauthorized' || value === 'active_tournaments' ? value : 'internal_error';
}

/**
 * Permanently deletes the signed-in user's account.
 *
 * Resolves only when the backend confirms the auth user is gone. Callers may
 * sign out and route to a public screen at that point, and MUST NOT do so on
 * rejection — a thrown error means the account is intact and still signed in.
 */
export async function deleteAccount(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new AccountDeletionError('unauthorized', DELETE_ACCOUNT_MESSAGES.unauthorized);
  }

  // Best-effort removal of THIS device's token first, so the device stops being
  // a push target as early as possible. The edge function deletes every token
  // for the user regardless, which is what actually guarantees the cleanup —
  // this call failing (no network, no native push support, simulator) must not
  // block the deletion.
  try {
    await deleteCurrentDevicePushToken(user.id);
  } catch (err) {
    if (__DEV__) console.warn('[account] device push token cleanup failed before deletion', err);
  }

  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>(
    'delete-account',
    { body: {} },
  );

  if (error) {
    // supabase-js surfaces non-2xx as FunctionsHttpError with the body on
    // `context`. Recover the specific reason where we can so the user sees why
    // they were blocked rather than a generic failure.
    let reason: DeleteAccountFailure = 'internal_error';
    const context = (error as { context?: Response }).context;
    if (context && typeof context.json === 'function') {
      try {
        const body = await context.json();
        reason = reasonFrom(body?.error);
      } catch {
        // Non-JSON error body — keep the generic reason.
      }
    }
    throw new AccountDeletionError(reason, DELETE_ACCOUNT_MESSAGES[reason]);
  }

  if (!data?.ok) {
    const reason = reasonFrom(data?.error);
    throw new AccountDeletionError(reason, DELETE_ACCOUNT_MESSAGES[reason]);
  }
}
