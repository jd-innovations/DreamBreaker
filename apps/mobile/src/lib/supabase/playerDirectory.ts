import { supabase } from '@/lib/supabase';
import { resolvePlayerRating, type PlayerRating } from '@/lib/playerRating';

/**
 * The user directory: find a player by name or handle.
 *
 * Everything that matters happens in the `search_players` RPC
 * (20260921160000) rather than here — see its comment for why. The short
 * version: a client can filter out people it blocked, but `blocked_users` is
 * deliberately not readable in the other direction, so it cannot filter out
 * people who blocked IT. That check has to be server-side, and once it is, so
 * is everything else.
 *
 * This module is the typed edge: it shapes rows for the UI and nothing more.
 */

export type DirectoryPlayer = {
  id: string;
  name: string;
  handle: string | null;
  avatarUrl: string | null;
  rating: PlayerRating;
  location: string | null;
  /** Already a mutual connection — the card offers Message rather than Connect. */
  isConnected: boolean;
  /** Players connected to both the viewer and this person. */
  mutualCount: number;
};

/** Below this, a query matches most of the directory and is not worth a trip. */
export const MIN_DIRECTORY_QUERY = 2;

type Row = {
  id: string;
  full_name: string | null;
  handle: string | null;
  avatar_url: string | null;
  dupr: number | null;
  self_rating: string | null;
  location_city: string | null;
  location_state: string | null;
  is_connected: boolean | null;
  mutual_count: number | null;
};

export async function searchDirectory(query: string, limit = 25): Promise<DirectoryPlayer[]> {
  const term = query.trim();
  if (term.length < MIN_DIRECTORY_QUERY) return [];

  const { data, error } = await supabase.rpc('search_players', {
    p_query: term,
    p_limit: limit,
  });

  if (error) throw error;

  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    // A profile with no name still appears — it is a real account someone may
    // be looking for — but it is labelled rather than rendered blank.
    name: r.full_name?.trim() || 'Unnamed player',
    handle: r.handle,
    avatarUrl: r.avatar_url,
    rating: resolvePlayerRating(r.dupr, r.self_rating),
    location: [r.location_city, r.location_state].filter(Boolean).join(', ') || null,
    isConnected: r.is_connected === true,
    mutualCount: r.mutual_count ?? 0,
  }));
}

/** "3 mutual connections" / "1 mutual connection" / null when there are none. */
export function mutualLabel(count: number): string | null {
  if (count <= 0) return null;
  return `${count} mutual connection${count === 1 ? '' : 's'}`;
}
