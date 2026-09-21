import { supabase } from '@/lib/supabase';
import { resolvePlayerRating } from '@/lib/playerRating';
import type { SavedPlayer } from '@/lib/connectionStore';

/**
 * My Contacts — the player shortlist.
 *
 * Stored as `partner_likes` rows with `kind = 'save'`, which is what the
 * "Saved Players" screen has always used. It is deliberately NOT a connection:
 * one-sided, private to the owner, and it grants the other person nothing and
 * tells them nothing. A connection (`partner_matches`) needs both people.
 *
 * Extracted from app/match/saved.tsx when the same list gained a tab inside My
 * Connections. Two copies of "what counts as a contact" would drift, and the
 * answer is a magic string in a shared table.
 */

/** Rows the UI renders. Same shape the connections screen already speaks. */
export type Contact = SavedPlayer;

export async function fetchContacts(userId: string): Promise<Contact[]> {
  const { data: likes } = await supabase
    .from('partner_likes')
    .select('to_user_id, created_at')
    .eq('from_user_id', userId)
    .eq('kind', 'save')
    .order('created_at', { ascending: false });

  if (!likes || likes.length === 0) return [];

  const ids = likes.map((l) => l.to_user_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, dupr, self_rating, location_city, location_state, looking_status')
    .in('id', ids);

  const byId = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]));

  // Ordered by the LIKE rows, not the profile rows: `.in()` does not preserve
  // order, and the list is meant to read newest-saved first.
  return likes
    .map((l) => {
      const p = byId[l.to_user_id];
      if (!p) return null;
      const rating = resolvePlayerRating(p.dupr, p.self_rating);
      return {
        player: {
          id: p.id,
          name: p.full_name,
          dupr: rating.value,
          ratingSource: rating.source,
          location: [p.location_city, p.location_state].filter(Boolean).join(', ') || 'Unknown',
          distance: 0,
          lookingFor: p.looking_status || 'Partner',
          photoUri: p.avatar_url ?? undefined,
        },
        savedAt: l.created_at,
      } as Contact;
    })
    .filter((c): c is Contact => c !== null);
}

export async function addContact(userId: string, playerId: string): Promise<void> {
  const { error } = await supabase
    .from('partner_likes')
    .upsert({ from_user_id: userId, to_user_id: playerId, kind: 'save' });
  if (error) throw error;
}

export async function removeContact(userId: string, playerId: string): Promise<void> {
  const { error } = await supabase
    .from('partner_likes')
    .delete()
    .eq('from_user_id', userId)
    .eq('to_user_id', playerId)
    .eq('kind', 'save');
  if (error) throw error;
}

export async function isContact(userId: string, playerId: string): Promise<boolean> {
  const { data } = await supabase
    .from('partner_likes')
    .select('to_user_id')
    .eq('from_user_id', userId)
    .eq('to_user_id', playerId)
    .eq('kind', 'save')
    .maybeSingle();
  return !!data;
}
