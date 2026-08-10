import { fetchProfile, type UserProfile } from '@/lib/services/profile';
import { supabase } from '@/lib/supabase';
import { fetchFacilityById } from '@/lib/supabase/facilities';
import { fetchPlayerParProfile, type PlayerParProfile } from '@/lib/supabase/par';

// The personal_* tables aren't in the generated database.types yet, so they need
// the same untyped escape hatch used in lib/supabase/personalSessions.ts.
type DbClient = typeof supabase & {
  from: (table: string) => any;
};

const db = supabase as DbClient;

export type CurrentRating = {
  label: 'Verified DUPR' | 'DUPR' | 'Self Rating' | 'Skill Level';
  value: string;
  verified: boolean;
  source: 'profiles.dupr' | 'profiles.self_rating' | 'profiles.skill_level';
};

export type LoggedGamesSummary = {
  total: number | null;
  tournament: number | null;
  community: number | null;
  personal: number | null;
};

export type MyStatsPlayerCard = {
  profile: UserProfile;
  parProfile: PlayerParProfile | null;
  initials: string;
  locationLabel: string | null;
  homeCourtId: string | null;
  homeCourtName: string | null;
  currentRating: CurrentRating | null;
  loggedGames: LoggedGamesSummary;
};

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function cleanText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function formatSkillLabel(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getProfileInitials(profile: Pick<UserProfile, 'full_name' | 'email'>) {
  const name = cleanText(profile.full_name);
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'DB';
  }

  const email = cleanText(profile.email);
  return email?.[0]?.toUpperCase() ?? 'DB';
}

function getLocationLabel(profile: UserProfile) {
  const city = cleanText(profile.location_city);
  const state = cleanText(profile.location_state);
  if (city && state) return `${city}, ${state}`;
  return city ?? state;
}

function getCurrentRating(profile: UserProfile): CurrentRating | null {
  if (typeof profile.dupr === 'number') {
    const verified = Boolean(profile.dupr_verified);
    return {
      label: verified ? 'Verified DUPR' : 'DUPR',
      value: formatNumber(profile.dupr),
      verified,
      source: 'profiles.dupr',
    };
  }

  const selfRating = cleanText(profile.self_rating);
  if (selfRating) {
    return {
      label: 'Self Rating',
      value: selfRating,
      verified: false,
      source: 'profiles.self_rating',
    };
  }

  const skillLevel = cleanText(profile.skill_level);
  if (skillLevel) {
    return {
      label: 'Skill Level',
      value: formatSkillLabel(skillLevel),
      verified: false,
      source: 'profiles.skill_level',
    };
  }

  return null;
}

async function countCompletedTournamentMatches(userId: string): Promise<number | null> {
  const { count, error } = await supabase
    .from('bracket_matches')
    .select('id', { count: 'exact', head: true })
    .not('completed_at', 'is', null)
    .not('winner', 'is', null)
    .or(`team1_player_a.eq.${userId},team1_player_b.eq.${userId},team2_player_a.eq.${userId},team2_player_b.eq.${userId}`);

  if (error) {
    console.warn('[myStats] tournament match count unavailable:', error.message);
    return null;
  }

  return count ?? 0;
}

async function countCompletedCommunityMatches(userId: string): Promise<number | null> {
  const { data: participants, error: participantError } = await supabase
    .from('play_participants')
    .select('id')
    .eq('claimed_by', userId);

  if (participantError) {
    console.warn('[myStats] community participant lookup unavailable:', participantError.message);
    return null;
  }

  const participantIds = (participants ?? [])
    .map((participant) => participant.id)
    .filter((id): id is string => Boolean(id));

  if (!participantIds.length) return 0;

  const participantList = participantIds.join(',');
  const { count, error } = await supabase
    .from('play_matches')
    .select('id', { count: 'exact', head: true })
    .not('winner', 'is', null)
    .or(`player_a_id.in.(${participantList}),player_b_id.in.(${participantList}),player_a2_id.in.(${participantList}),player_b2_id.in.(${participantList})`);

  if (error) {
    console.warn('[myStats] community match count unavailable:', error.message);
    return null;
  }

  return count ?? 0;
}

// Games the user logged themselves via the "Log a session" flow. These live in
// personal_games (not bracket_matches / play_matches), so they were previously
// missing from the Games Logged total entirely.
async function countCompletedPersonalGames(userId: string): Promise<number | null> {
  const { data: participants, error: participantError } = await db
    .from('personal_session_participants')
    .select('id')
    .eq('profile_id', userId);

  if (participantError) {
    console.warn('[myStats] personal participant lookup unavailable:', participantError.message);
    return null;
  }

  const participantIds = ((participants ?? []) as { id: string }[])
    .map((participant) => participant.id)
    .filter((id): id is string => Boolean(id));

  if (!participantIds.length) return 0;

  const { data: gameLinks, error: linkError } = await db
    .from('personal_game_participants')
    .select('game_id')
    .in('session_participant_id', participantIds);

  if (linkError) {
    console.warn('[myStats] personal game link lookup unavailable:', linkError.message);
    return null;
  }

  const gameIds = Array.from(
    new Set(((gameLinks ?? []) as { game_id: string }[])
      .map((link) => link.game_id)
      .filter((id): id is string => Boolean(id))),
  );

  if (!gameIds.length) return 0;

  const { count, error } = await db
    .from('personal_games')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'completed')
    .in('id', gameIds);

  if (error) {
    console.warn('[myStats] personal game count unavailable:', error.message);
    return null;
  }

  return count ?? 0;
}

// null means "at least one source failed" — surface nothing rather than an
// undercount that reads like a real number.
function combineLoggedGames(counts: (number | null)[]): number | null {
  if (counts.some((count) => count === null)) return null;
  return counts.reduce<number>((sum, count) => sum + (count ?? 0), 0);
}

export async function fetchMyStatsPlayerCard(userId: string): Promise<MyStatsPlayerCard> {
  const profile = await fetchProfile(userId);
  if (!profile) {
    throw new Error('Unable to load your player profile.');
  }

  // Home court and PAR are supplementary — a failure in either should degrade
  // that one section, not take down the whole player card (the match counters
  // already behave this way).
  const [homeCourt, tournament, community, personal, parProfile] = await Promise.all([
    profile.home_court_id
      ? fetchFacilityById(profile.home_court_id).catch((err) => {
          console.warn('[myStats] home court unavailable:', err?.message ?? err);
          return null;
        })
      : Promise.resolve(null),
    countCompletedTournamentMatches(userId),
    countCompletedCommunityMatches(userId),
    countCompletedPersonalGames(userId),
    fetchPlayerParProfile(userId, { initializeIfMissing: true }).catch((err) => {
      console.warn('[myStats] PAR profile unavailable:', err?.message ?? err);
      return null;
    }),
  ]);

  return {
    profile,
    parProfile,
    initials: getProfileInitials(profile),
    locationLabel: getLocationLabel(profile),
    homeCourtId: homeCourt?.id ?? null,
    homeCourtName: homeCourt?.name ?? null,
    currentRating: getCurrentRating(profile),
    loggedGames: {
      tournament,
      community,
      personal,
      total: combineLoggedGames([tournament, community, personal]),
    },
  };
}
