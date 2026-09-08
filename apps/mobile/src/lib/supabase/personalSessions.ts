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


