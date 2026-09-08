// Notification preferences, read and written against profiles (TODO1.1 5.1).
//
// These columns are not new inventions. profiles has carried notif_new_match,
// notif_liked_you, notif_hold_expiry and notif_tournaments since the baseline,
// and web's match-settings panel already writes them
// (web/src/components/shared/match-settings-panel.tsx). Mobile's notifications
// screen showed a different, unrelated set of toggles that were pure component
// state and persisted nowhere. This module is what makes the two agree.
//
// ── Which of these actually do anything ─────────────────────────────────────
//
// Only `messages`. notify_new_message is the one trigger in the project that
// sends a push, and as of 20260831020000 it skips recipients whose
// notif_messages is false.
//
// The rest are STORED INTENT: saved faithfully, honoured by nothing yet,
// because the notifications they describe have no sender. That is a real state
// worth being precise about — the alternative is a switch that silently does
// nothing, which is what this screen used to be made of.

import { supabase } from '@/lib/supabase';

export type NotificationPreferences = {
  /** Honoured today by notify_new_message. */
  messages: boolean;
  /** Stored intent — no sender checks these yet. */
  tournaments: boolean;
  newMatch: boolean;
  likedYou: boolean;
  holdExpiry: boolean;
  /** Stored intent — send-transactional-email does not check it. */
  email: boolean;
};

/**
 * What a user gets before they have ever opened the screen, and what a failed
 * read falls back to.
 *
 * All true, matching the column defaults. Defaulting to false on a read error
 * would silently unsubscribe someone because the network blinked — the screen
 * would then show every switch off, and saving from that state would write the
 * lie back to the database.
 */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  messages: true,
  tournaments: true,
  newMatch: true,
  likedYou: true,
  holdExpiry: true,
  email: true,
};

const COLUMNS =
  'notif_messages, notif_tournaments, notif_new_match, notif_liked_you, notif_hold_expiry, notif_email_enabled';

export type LoadResult =
  | { ok: true; preferences: NotificationPreferences }
  | { ok: false; reason: string };

export async function loadNotificationPreferences(userId: string): Promise<LoadResult> {
  const { data, error } = await supabase
    .from('profiles')
    .select(COLUMNS)
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    return { ok: false, reason: "We couldn't load your notification settings." };
  }
  if (!data) {
    // No row is not the same as no preferences. Reporting success with
    // defaults here would let a later save create values for a profile that
    // does not exist.
    return { ok: false, reason: "We couldn't find your profile." };
  }

  const row = data as Record<string, boolean | null>;
  return {
    ok: true,
    preferences: {
      messages: row.notif_messages ?? true,
      tournaments: row.notif_tournaments ?? true,
      newMatch: row.notif_new_match ?? true,
      likedYou: row.notif_liked_you ?? true,
      holdExpiry: row.notif_hold_expiry ?? true,
      email: row.notif_email_enabled ?? true,
    },
  };
}

export type SaveResult = { ok: true } | { ok: false; reason: string };

/**
 * Writes one preference.
 *
 * Single-field rather than whole-object on purpose: two switches flipped in
 * quick succession would otherwise race, and the second write would carry the
 * first switch's stale value and undo it.
 */
export async function saveNotificationPreference(
  userId: string,
  key: keyof NotificationPreferences,
  value: boolean,
): Promise<SaveResult> {
  // An explicit switch rather than a computed key like `{ [column]: value }`.
  //
  // A computed key widens to Record<string, boolean>, which the generated
  // Update type rejects — and casting past it would throw away exactly the
  // checking that regenerating the types bought. Written out, the compiler
  // verifies every column name against the real schema, so a typo or a dropped
  // column is a build error instead of a silent no-op at runtime.
  const patch =
    key === 'messages' ? { notif_messages: value }
    : key === 'tournaments' ? { notif_tournaments: value }
    : key === 'newMatch' ? { notif_new_match: value }
    : key === 'likedYou' ? { notif_liked_you: value }
    : key === 'holdExpiry' ? { notif_hold_expiry: value }
    : { notif_email_enabled: value };

  const { error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', userId);

  if (error) {
    return { ok: false, reason: "That didn't save. Check your connection and try again." };
  }
  return { ok: true };
}
