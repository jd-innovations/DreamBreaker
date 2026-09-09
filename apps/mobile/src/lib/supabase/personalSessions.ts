import { supabase } from '@/lib/supabase';
import { fetchParImpactForSessions, type MatchParImpact } from '@/lib/supabase/par';

export type PersonalSessionFormat = 'singles' | 'doubles';
export type PersonalSessionStatus = 'draft' | 'active' | 'completed' | 'cancelled';
export type PersonalGameStatus = 'draft' | 'completed' | 'cancelled';
export type IndoorOutdoor = 'indoor' | 'outdoor' | 'mixed' | 'unknown';

export type PersonalSession = {
  id: string;
  created_by: string;
  facility_id: string | null;
  played_at: string;
  format: PersonalSessionFormat;
  status: PersonalSessionStatus;
  indoor_outdoor: IndoorOutdoor | null;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PersonalSessionParticipant = {
  id: string;
  session_id: string;
  profile_id: string | null;
  guest_player_id: string | null;
  display_name_snapshot: string;
  estimated_skill: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type PersonalGame = {
  id: string;
  session_id: string;
  game_number: number;
  team_one_score: number | null;
  team_two_score: number | null;
  winning_team: 1 | 2 | null;
  status: PersonalGameStatus;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PersonalGameParticipant = {
  id: string;
  game_id: string;
  session_participant_id: string;
  team_number: 1 | 2;
  position: number;
  created_at: string;
  updated_at: string;
};

export type PersonalSessionDetails = {
  session: PersonalSession;
  participants: PersonalSessionParticipant[];
  games: PersonalGame[];
  gameParticipants: PersonalGameParticipant[];
};

export type PersonalParticipantDeliveryStatus =
  | 'recorded_by_you'
  | 'in_app_shared'
  | 'not_shared'
  | 'share_initiated'
  | 'claimed'
  | 'expired';

export type PersonalParticipantDelivery = {
  session_participant_id: string;
  profile_id: string | null;
  guest_player_id: string | null;
  display_name: string;
  phone: string | null;
  participant_kind: 'registered' | 'guest';
  delivery_status: PersonalParticipantDeliveryStatus;
  guest_share_id: string | null;
  claim_status?: 'pending' | 'claimed' | 'expired' | 'revoked' | null;
};

export type PersonalGuestShare = {
  id: string;
  session_id: string;
  session_participant_id: string;
  guest_player_id: string;
  created_by: string;
  share_status: 'not_shared' | 'share_initiated' | 'claimed' | 'expired';
  share_channel: 'sms';
  share_initiated_at: string | null;
  created_at: string;
  updated_at: string;
};

type DbClient = typeof supabase & {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

const db = supabase as DbClient;

export async function createPersonalSession(input: {
  format: PersonalSessionFormat;
  facilityId?: string | null;
  playedAt?: string;
  indoorOutdoor?: IndoorOutdoor | null;
  notes?: string | null;
}): Promise<PersonalSession> {
  const { data, error } = await db.rpc('create_personal_session', {
    p_format: input.format,
    p_facility_id: input.facilityId ?? null,
    p_played_at: input.playedAt ?? null,
    p_indoor_outdoor: input.indoorOutdoor ?? null,
    p_notes: input.notes ?? null,
  });

  if (error) throw error;
  return data as PersonalSession;
}

export async function addRegisteredParticipant(
  sessionId: string,
  profileId: string,
): Promise<PersonalSessionParticipant> {
  const { data, error } = await db.rpc('add_personal_session_registered_participant', {
    p_session_id: sessionId,
    p_profile_id: profileId,
  });
  if (error) throw error;
  return data as PersonalSessionParticipant;
}

export async function addGuestParticipant(input: {
  sessionId: string;
  displayName: string;
  estimatedSkill?: string | null;
  phone?: string | null;
  email?: string | null;
}): Promise<PersonalSessionParticipant> {
  const { data, error } = await db.rpc('add_personal_session_guest_participant', {
    p_session_id: input.sessionId,
    p_display_name: input.displayName,
    p_estimated_skill: input.estimatedSkill ?? null,
    p_phone: input.phone ?? null,
    p_email: input.email ?? null,
  });
  if (error) throw error;
  return data as PersonalSessionParticipant;
}

export async function createPersonalGame(
  sessionId: string,
  gameNumber: number,
): Promise<PersonalGame> {
  const { data, error } = await db
    .from('personal_games')
    .insert({ session_id: sessionId, game_number: gameNumber })
    .select()
    .single();

  if (error) throw error;
  return data as PersonalGame;
}

export async function assignGameParticipants(
  gameId: string,
  assignments: {
    sessionParticipantId: string;
    teamNumber: 1 | 2;
    position: number;
  }[],
): Promise<PersonalGameParticipant[]> {
  const rows = assignments.map((assignment) => ({
    game_id: gameId,
    session_participant_id: assignment.sessionParticipantId,
    team_number: assignment.teamNumber,
    position: assignment.position,
  }));

  const { data, error } = await db
    .from('personal_game_participants')
    .insert(rows)
    .select();

  if (error) throw error;
  return (data ?? []) as PersonalGameParticipant[];
}

export async function savePersonalGameScore(
  gameId: string,
  teamOneScore: number,
  teamTwoScore: number,
): Promise<PersonalGame> {
  const { data, error } = await db.rpc('save_personal_game_score', {
    p_game_id: gameId,
    p_team_one_score: teamOneScore,
    p_team_two_score: teamTwoScore,
  });
  if (error) throw error;
  return data as PersonalGame;
}

export async function completePersonalSession(input: {
  sessionId: string;
  facilityId?: string | null;
  notes?: string | null;
  indoorOutdoor?: IndoorOutdoor | null;
}): Promise<PersonalSession> {
  const { data, error } = await db.rpc('complete_personal_session', {
    p_session_id: input.sessionId,
    p_facility_id: input.facilityId ?? null,
    p_notes: input.notes ?? null,
    p_indoor_outdoor: input.indoorOutdoor ?? null,
  });
  if (error) throw error;
  return data as PersonalSession;
}

export async function completePersonalSessionWithDistribution(input: {
  sessionId: string;
  facilityId?: string | null;
  notes?: string | null;
  indoorOutdoor?: IndoorOutdoor | null;
}): Promise<PersonalParticipantDelivery[]> {
  const { data, error } = await db.rpc('complete_personal_session_with_distribution', {
    p_session_id: input.sessionId,
    p_facility_id: input.facilityId ?? null,
    p_notes: input.notes ?? null,
    p_indoor_outdoor: input.indoorOutdoor ?? null,
  });
  if (error) throw error;
  return (data ?? []) as PersonalParticipantDelivery[];
}

export async function markPersonalGuestShareInitiated(guestShareId: string): Promise<PersonalGuestShare> {
  const { data, error } = await db.rpc('mark_personal_guest_share_initiated', {
    p_guest_share_id: guestShareId,
  });
  if (error) throw error;
  return data as PersonalGuestShare;
}

export async function fetchPersonalSessionWithGames(
  sessionId: string,
): Promise<PersonalSessionDetails | null> {
  const sessionRes = await db
    .from('personal_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();
  if (sessionRes.error) throw sessionRes.error;
  if (!sessionRes.data) return null;

  const [participantsRes, gamesRes] = await Promise.all([
    db
      .from('personal_session_participants')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true }),
    db
      .from('personal_games')
      .select('*')
      .eq('session_id', sessionId)
      .order('game_number', { ascending: true }),
  ]);

  if (participantsRes.error) throw participantsRes.error;
  if (gamesRes.error) throw gamesRes.error;

  const gameIds = ((gamesRes.data ?? []) as PersonalGame[]).map((game) => game.id);
  const gameParticipantsRes = gameIds.length
    ? await db
        .from('personal_game_participants')
        .select('*')
        .in('game_id', gameIds)
        .order('team_number', { ascending: true })
        .order('position', { ascending: true })
    : { data: [], error: null };

  if (gameParticipantsRes.error) throw gameParticipantsRes.error;

  return {
    session: sessionRes.data as PersonalSession,
    participants: (participantsRes.data ?? []) as PersonalSessionParticipant[],
    games: (gamesRes.data ?? []) as PersonalGame[],
    gameParticipants: (gameParticipantsRes.data ?? []) as PersonalGameParticipant[],
  };
}

export async function fetchPersonalMatchHistoryForPlayer(
  profileId: string,
): Promise<PersonalSession[]> {
  const participantRes = await db
    .from('personal_session_participants')
    .select('session_id')
    .eq('profile_id', profileId);

  if (participantRes.error) throw participantRes.error;

  const participantSessionIds = (participantRes.data ?? [])
    .map((row: { session_id: string }) => row.session_id)
    .filter(Boolean);

  const { data, error } = await db
    .from('personal_sessions')
    .select('*')
    .or(`created_by.eq.${profileId}${participantSessionIds.length ? `,id.in.(${participantSessionIds.join(',')})` : ''}`)
    .order('played_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as PersonalSession[];
}

export type PersonalMatchHistoryItem = {
  session: PersonalSession;
  facilityName: string | null;
  gameCount: number;
  completedGameCount: number;
  record: { wins: number; losses: number } | null;
  parImpact: MatchParImpact | null;
};

// Enriches each session with the facility name, game counts, and the
// viewing player's own win/loss record (null when they recorded the session
// for others without playing in it themselves).
export async function fetchMyMatchHistory(profileId: string): Promise<PersonalMatchHistoryItem[]> {
  const sessions = await fetchPersonalMatchHistoryForPlayer(profileId);
  if (sessions.length === 0) return [];

  const sessionIds = sessions.map((session) => session.id);
  const facilityIds = Array.from(
    new Set(sessions.map((session) => session.facility_id).filter((id): id is string => Boolean(id))),
  );

  const [gamesRes, myParticipantsRes, facilitiesRes, parImpactRes] = await Promise.all([
    db.from('personal_games').select('*').in('session_id', sessionIds),
    db.from('personal_session_participants').select('id, session_id').eq('profile_id', profileId).in('session_id', sessionIds),
    facilityIds.length
      ? db.from('facilities').select('id, name').in('id', facilityIds)
      : Promise.resolve({ data: [], error: null }),
    fetchParImpactForSessions(sessionIds, profileId).then((data) => ({ data, error: null })).catch((error) => ({ data: new Map<string, MatchParImpact>(), error })),
  ]);

  if (gamesRes.error) throw gamesRes.error;
  if (myParticipantsRes.error) throw myParticipantsRes.error;
  if (facilitiesRes.error) throw facilitiesRes.error;
  if (parImpactRes.error) console.warn('[personalSessions] PAR impact unavailable:', parImpactRes.error.message ?? parImpactRes.error);

  const games = (gamesRes.data ?? []) as PersonalGame[];
  const myParticipantIdBySession = new Map<string, string>();
  for (const row of (myParticipantsRes.data ?? []) as { id: string; session_id: string }[]) {
    myParticipantIdBySession.set(row.session_id, row.id);
  }
  const facilityNameById = new Map<string, string>();
  for (const row of (facilitiesRes.data ?? []) as { id: string; name: string }[]) {
    facilityNameById.set(row.id, row.name);
  }

  const gameIds = games.map((game) => game.id);
  const gameParticipantsRes = gameIds.length
    ? await db.from('personal_game_participants').select('*').in('game_id', gameIds)
    : { data: [], error: null };
  if (gameParticipantsRes.error) throw gameParticipantsRes.error;
  const gameParticipants = (gameParticipantsRes.data ?? []) as PersonalGameParticipant[];

  const gamesBySession = new Map<string, PersonalGame[]>();
  for (const game of games) {
    const list = gamesBySession.get(game.session_id) ?? [];
    list.push(game);
    gamesBySession.set(game.session_id, list);
  }

  return sessions.map((session) => {
    const sessionGames = gamesBySession.get(session.id) ?? [];
    const completedGames = sessionGames.filter((game) => game.status === 'completed');
    const myParticipantId = myParticipantIdBySession.get(session.id);

    let record: { wins: number; losses: number } | null = null;
    if (myParticipantId) {
      let wins = 0;
      let losses = 0;
      for (const game of completedGames) {
        const myGameParticipant = gameParticipants.find(
          (gp) => gp.game_id === game.id && gp.session_participant_id === myParticipantId,
        );
        if (!myGameParticipant || !game.winning_team) continue;
        if (myGameParticipant.team_number === game.winning_team) wins += 1;
        else losses += 1;
      }
      record = { wins, losses };
    }

    return {
      session,
      facilityName: session.facility_id ? facilityNameById.get(session.facility_id) ?? null : null,
      gameCount: sessionGames.length,
      completedGameCount: completedGames.length,
      record,
      parImpact: parImpactRes.data.get(session.id) ?? null,
    };
  });
}



// ─── Career totals (Profile tab stats row) ──────────────────────────────────
//
// The Profile screen's WIN RATE and PARTNERS tiles were hardcoded to '58%' and
// '4'. These are the real numbers behind them, aggregated across every logged
// session the player actually played in — not the per-session record
// fetchMyMatchHistory() already returns, which is scoped to one session.
//
// "Partners" is distinct teammates: anyone who shared a team_number with the
// player in the same game. Guests count (they're real people the player
// played with, just without an account), keyed by guest_player_id so a guest
// never collides with a registered profile. In singles there is no teammate,
// so those games contribute games/wins but no partners — which is correct.
//
// Deliberately client-side over four `.in()` queries rather than an RPC: the
// RLS policies on all three tables key off is_personal_session_visible(), so a
// player can already read every participant row of a session they played in,
// and this file's existing helpers join in JS the same way.

export type PlayerCareerStats = {
  gamesPlayed: number;
  wins: number;
  /** Whole-percent win rate; 0 when no completed games (never NaN). */
  winRatePct: number;
  /** Distinct teammates across all logged games, registered players + guests. */
  partners: number;
};

const EMPTY_CAREER_STATS: PlayerCareerStats = { gamesPlayed: 0, wins: 0, winRatePct: 0, partners: 0 };

export async function fetchPlayerCareerStats(profileId: string): Promise<PlayerCareerStats> {
  // Sessions the player actually played in — not ones they merely recorded for
  // others (fetchPersonalMatchHistoryForPlayer's `created_by` arm), which would
  // credit them with games they never took part in.
  const { data: myParticipantRows, error: myErr } = await db
    .from('personal_session_participants')
    .select('id, session_id')
    .eq('profile_id', profileId);
  if (myErr) throw myErr;

  const mine = (myParticipantRows ?? []) as { id: string; session_id: string }[];
  if (mine.length === 0) return EMPTY_CAREER_STATS;

  const myParticipantIds = new Set(mine.map((row) => row.id));
  const sessionIds = Array.from(new Set(mine.map((row) => row.session_id)));

  const { data: gameRows, error: gamesErr } = await db
    .from('personal_games')
    .select('id, winning_team')
    .in('session_id', sessionIds);
  if (gamesErr) throw gamesErr;

  // Only decided games count — an abandoned or in-progress game has no winner
  // and must not drag the win rate down.
  const decided = ((gameRows ?? []) as { id: string; winning_team: number | null }[])
    .filter((game) => game.winning_team != null);
  if (decided.length === 0) return EMPTY_CAREER_STATS;

  const winningTeamByGame = new Map(decided.map((game) => [game.id, game.winning_team as number]));
  const gameIds = decided.map((game) => game.id);

  const [participantsRes, identitiesRes] = await Promise.all([
    db.from('personal_game_participants').select('game_id, team_number, session_participant_id').in('game_id', gameIds),
    db.from('personal_session_participants').select('id, profile_id, guest_player_id').in('session_id', sessionIds),
  ]);
  if (participantsRes.error) throw participantsRes.error;
  if (identitiesRes.error) throw identitiesRes.error;

  const gameParticipants = (participantsRes.data ?? []) as {
    game_id: string; team_number: number; session_participant_id: string;
  }[];

  // A guest and a registered player can never produce the same key, so counting
  // distinct keys never conflates two different people.
  const identityByParticipantId = new Map<string, string>();
  for (const row of (identitiesRes.data ?? []) as {
    id: string; profile_id: string | null; guest_player_id: string | null;
  }[]) {
    const identity = row.profile_id ?? (row.guest_player_id ? `guest:${row.guest_player_id}` : null);
    if (identity) identityByParticipantId.set(row.id, identity);
  }

  // My own team per game — the games I actually appeared in.
  const myTeamByGame = new Map<string, number>();
  for (const gp of gameParticipants) {
    if (myParticipantIds.has(gp.session_participant_id)) myTeamByGame.set(gp.game_id, gp.team_number);
  }

  let gamesPlayed = 0;
  let wins = 0;
  for (const [gameId, myTeam] of myTeamByGame) {
    gamesPlayed += 1;
    if (winningTeamByGame.get(gameId) === myTeam) wins += 1;
  }

  const partners = new Set<string>();
  for (const gp of gameParticipants) {
    const myTeam = myTeamByGame.get(gp.game_id);
    if (myTeam == null || gp.team_number !== myTeam) continue;
    if (myParticipantIds.has(gp.session_participant_id)) continue; // that's me
    const identity = identityByParticipantId.get(gp.session_participant_id);
    if (identity && identity !== profileId) partners.add(identity);
  }

  return {
    gamesPlayed,
    wins,
    winRatePct: gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : 0,
    partners: partners.size,
  };
}
