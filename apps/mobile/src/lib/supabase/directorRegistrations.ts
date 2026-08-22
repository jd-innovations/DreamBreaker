import { supabase } from '@/lib/supabase';
import type { Tables } from '@/lib/database.types';

// Director manual registration — the client half of
// director_add_tournament_registration() (migration 20260821030000).
//
// Deliberately self-contained rather than folded into registrations.ts: both
// call sites there hardcode `director_added: false` because they are the
// player's own self-service path, and the RLS policy that once allowed a direct
// director INSERT has been dropped. The RPC is now the only way a director-added
// registration can be created, and this module is its only caller.
//
// Free divisions only, this phase. Paid manual registration, cash accounting,
// and comped entries are out of scope; the RPC refuses a priced division rather
// than registering someone at $0.

export type Registration = Tables<'registrations'>;

/** A person with no app account. Becomes a personal_guest_players row, never an auth user. */
export type GuestInput = {
  displayName: string;
  phone?: string;
  email?: string;
  estimatedSkill?: string;
  gender?: string;
  ageGroup?: string;
};

/** One side of a registration: either an existing profile, or a guest. */
export type Participant =
  | { kind: 'profile'; profileId: string; displayName: string }
  | { kind: 'guest'; guest: GuestInput };

export type DirectorAddInput = {
  tournamentId: string;
  divisionId: string;
  player: Participant;
  /** Required for doubles/mixed divisions, rejected for singles. */
  partner?: Participant;
};

export type DirectorAddResult =
  | { ok: true; registration: Registration }
  | { ok: false; code: string; message: string };

// The RPC raises these as bare codes. Trigger-level failures (registration
// window, duplicate player) arrive as full sentences instead, so anything
// unmatched falls through to the server's own text rather than being flattened
// into a useless "something went wrong".
const ERROR_MESSAGES: Record<string, string> = {
  not_authenticated:         'Please sign in again.',
  not_tournament_director:   'Only this tournament’s director can add registrations.',
  director_not_approved:     'Your director account is not approved yet.',
  division_not_in_tournament:'That division does not belong to this tournament.',
  division_requires_payment: 'This division charges an entry fee. Manual registration is only available for free divisions.',
  invalid_participant:       'Choose either an existing player or enter a guest — not both.',
  invalid_partner:           'Choose either an existing partner or enter a guest partner — not both.',
  partner_required:          'This is a doubles division. Add a partner to complete the team.',
  partner_not_allowed:       'This is a singles division. Remove the partner.',
  division_full:             'This division is full.',
  duplicate_participant:     'A player cannot partner with themselves.',
};

function guestPayload(g: GuestInput) {
  return {
    display_name:    g.displayName.trim(),
    phone:           g.phone?.trim() || null,
    email:           g.email?.trim() || null,
    estimated_skill: g.estimatedSkill?.trim() || null,
    gender:          g.gender?.trim() || null,
    age_group:       g.ageGroup?.trim() || null,
  };
}

export async function directorAddRegistration(input: DirectorAddInput): Promise<DirectorAddResult> {
  const { player, partner } = input;

  const { data, error } = await supabase.rpc('director_add_tournament_registration', {
    p_tournament_id: input.tournamentId,
    p_division_id:   input.divisionId,
    // The generated types declare the uuid params as optional, so omit them with
    // `undefined` rather than passing null -- the RPC's own DEFAULT NULL applies.
    p_player_id:     player.kind === 'profile' ? player.profileId : undefined,
    p_guest:         player.kind === 'guest'   ? guestPayload(player.guest) : undefined,
    p_partner_id:    partner?.kind === 'profile' ? partner.profileId : undefined,
    p_partner_guest: partner?.kind === 'guest'   ? guestPayload(partner.guest) : undefined,
  });

  if (error) {
    const raw = error.message ?? 'unknown_error';
    // Postgres prefixes RAISE messages in some transports; match on containment
    // so a bare code is still found.
    const code = Object.keys(ERROR_MESSAGES).find(k => raw.includes(k)) ?? 'unknown_error';
    return { ok: false, code, message: ERROR_MESSAGES[code] ?? raw };
  }

  // The RPC returns a single registrations row; supabase-js gives it back
  // directly for a scalar-returning function.
  return { ok: true, registration: data as Registration };
}

// ─── Lookups the add-registration screen needs ───────────────────────────────

export type DirectorDivision = {
  id: string;
  name: string;
  format: string;
  entryFeeCents: number;
  drawSize: number;
  spotsFilled: number;
  /** False when the division charges — manual registration is refused server-side. */
  manualEligible: boolean;
  requiresPartner: boolean;
};

export async function fetchDirectorDivisions(tournamentId: string): Promise<DirectorDivision[]> {
  const { data, error } = await supabase
    .from('divisions')
    .select('id, name, format, entry_fee_cents, draw_size, spots_filled')
    .eq('tournament_id', tournamentId)
    .order('name');

  if (error || !data) return [];

  return data.map(d => ({
    id:            d.id,
    name:          d.name,
    format:        d.format,
    entryFeeCents: d.entry_fee_cents ?? 0,
    drawSize:      d.draw_size,
    spotsFilled:   d.spots_filled,
    manualEligible: (d.entry_fee_cents ?? 0) === 0,
    // Mirrors the RPC's own rule, which reads format rather than the name.
    requiresPartner: d.format === 'doubles' || d.format === 'mixed_doubles',
  }));
}

export type RegistrableProfile = {
  id: string;
  fullName: string;
  avatarUrl: string | null;
};

/**
 * Unlike searchPlayers() in playEventInvites.ts, this does NOT exclude the
 * caller — a director may legitimately enter their own tournament.
 */
export async function searchRegistrableProfiles(query: string): Promise<RegistrableProfile[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url')
    .ilike('full_name', `%${trimmed}%`)
    .limit(20);

  return (data ?? []).map(p => ({
    id: p.id,
    fullName: p.full_name ?? 'Unnamed player',
    avatarUrl: p.avatar_url,
  }));
}

// ─── Roster (so the director can see what they've added) ─────────────────────

export type RosterEntry = {
  registrationId: string;
  status: string;
  directorAdded: boolean;
  playerName: string;
  partnerName: string | null;
  isGuest: boolean;
};

export async function fetchDivisionRoster(divisionId: string): Promise<RosterEntry[]> {
  const { data, error } = await supabase
    .from('registrations')
    .select(`
      id, status, director_added,
      player:profiles!registrations_player_id_fkey ( full_name ),
      partner:profiles!registrations_partner_id_fkey ( full_name ),
      guest:personal_guest_players!registrations_guest_player_id_fkey ( display_name ),
      guest_partner:personal_guest_players!registrations_guest_partner_id_fkey ( display_name )
    `)
    .eq('division_id', divisionId)
    .in('status', ['held', 'registered', 'checked_in', 'substitute'])
    .order('created_at');

  if (error || !data) return [];

  type RosterRow = {
    id: string; status: string; director_added: boolean;
    player: { full_name: string } | null;
    partner: { full_name: string } | null;
    guest: { display_name: string } | null;
    guest_partner: { display_name: string } | null;
  };

  return (data as unknown as RosterRow[]).map((row) => {
    return {
      registrationId: row.id,
      status:         row.status,
      directorAdded:  row.director_added,
      playerName:     row.player?.full_name ?? row.guest?.display_name ?? 'Unknown',
      partnerName:    row.partner?.full_name ?? row.guest_partner?.display_name ?? null,
      isGuest:        row.player == null,
    };
  });
}
