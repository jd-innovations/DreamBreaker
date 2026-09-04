import { supabase } from '@/lib/supabase';

type DbClient = typeof supabase & {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

const db = supabase as DbClient;

export type ParConfidenceBand = 'low' | 'medium' | 'high';
export type ParProcessingStatus =
  | 'pending'
  | 'pending_participant_claim'
  | 'eligible'
  | 'processing'
  | 'processed'
  | 'excluded'
  | 'reversed'
  | 'failed';

export type PlayerParProfile = {
  profile_id: string;
  current_par: number;
  confidence_score: number;
  confidence_band: ParConfidenceBand;
  eligible_games_count: number;
  initial_par: number;
  initialization_source: 'self_rating' | 'skill_level' | 'default';
  initialized_at: string;
  last_processed_game_id: string | null;
  last_rated_at: string | null;
  algorithm_version: string;
  created_at: string;
  updated_at: string;
};

export type ParRatingEvent = {
  id: string;
  profile_id: string;
  session_id: string;
  game_id: string;
  event_type: 'game_processed' | 'reversal' | 'recalculation';
  par_before: number;
  par_after: number;
  par_change: number;
  confidence_before: number;
  confidence_after: number;
  confidence_change: number;
  expected_result: number;
  actual_result: 0 | 1;
  score_margin: number;
  opponent_strength: number;
  partner_strength: number | null;
  verification_level: 'fully_verified' | 'participant_verified' | 'estimated' | 'disputed' | 'excluded';
  weight: number;
  explanation_code: string;
  explanation_data: Record<string, unknown>;
  algorithm_version: string;
  processed_at: string;
  reversed_at: string | null;
  reversal_event_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ParGameProcessing = {
  game_id: string;
  session_id: string;
  status: ParProcessingStatus;
  eligibility_reason: string | null;
  verification_level: 'fully_verified' | 'participant_verified' | 'estimated' | 'disputed' | 'excluded' | null;
  algorithm_version: string | null;
  processed_at: string | null;
  last_evaluated_at: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type MatchParImpact = {
  sessionId: string;
  status: ParProcessingStatus | 'not_started';
  reason: string | null;
  totalChange: number | null;
  latestEvent: ParRatingEvent | null;
};

export function formatPar(value: number | null | undefined, digits = 2) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'PAR pending';
  return value.toFixed(digits);
}

export function formatParChange(value: number | null | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  const rounded = value.toFixed(2);
  return value > 0 ? `+${rounded}` : rounded;
}

export function confidenceBandLabel(band: ParConfidenceBand | null | undefined) {
  if (band === 'high') return 'High confidence';
  if (band === 'medium') return 'Medium confidence';
  return 'Low confidence';
}

export function explainParEvent(event: Pick<ParRatingEvent, 'explanation_code' | 'par_change'> | null) {
  if (!event) return null;
  switch (event.explanation_code) {
    case 'upset_win':
      return 'You beat a stronger team.';
    case 'expected_win_clear':
      return 'Your team was favored and won clearly.';
    case 'expected_win':
      return event.par_change > 0 ? 'Your team won an expected match.' : 'Your team won, with limited rating movement.';
    case 'upset_loss':
      return 'You lost to a lower-rated team.';
    case 'close_loss_stronger_team':
      return 'You kept it close against a stronger team.';
    case 'loss':
      return 'Your team lost this rated game.';
    case 'reversal':
      return 'This rating event was reversed.';
    default:
      return 'PAR impact was calculated for this game.';
  }
}

export function explainParProcessing(processing: Pick<ParGameProcessing, 'status' | 'eligibility_reason' | 'error_message'> | null | undefined) {
  if (!processing) return 'PAR pending';
  if (processing.status === 'pending_participant_claim') return 'Waiting for guest players to claim this match.';
  if (processing.status === 'excluded') return 'This game does not meet PAR eligibility requirements.';
  if (processing.status === 'failed') return processing.error_message ? `PAR processing failed: ${processing.error_message}` : 'PAR processing needs retry.';
  if (processing.status === 'pending' || processing.status === 'eligible' || processing.status === 'processing') return 'PAR processing pending.';
  if (processing.status === 'reversed') return 'PAR impact was reversed for this game.';
  return 'PAR impact calculated.';
}

export async function fetchPlayerParProfile(profileId: string, options?: { initializeIfMissing?: boolean }): Promise<PlayerParProfile | null> {
  const { data, error } = await db
    .from('player_par_profiles')
    .select('*')
    .eq('profile_id', profileId)
    .maybeSingle();

  if (error) throw error;
  if (data) return data as PlayerParProfile;

  if (!options?.initializeIfMissing) return null;

  const rpc = await db.rpc('initialize_own_player_par_profile');
  if (rpc.error) throw rpc.error;
  return rpc.data as PlayerParProfile;
}

export async function fetchPlayerParHistory(profileId: string, limit = 20): Promise<ParRatingEvent[]> {
  const { data, error } = await db
    .from('par_rating_events')
    .select('*')
    .eq('profile_id', profileId)
    .is('reversed_at', null)
    .order('processed_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ParRatingEvent[];
}

export async function processPersonalSessionPar(sessionId: string): Promise<ParGameProcessing[]> {
  const { data, error } = await db.rpc('process_personal_session_par', { p_session_id: sessionId });
  if (error) throw error;
  return (data ?? []) as ParGameProcessing[];
}

export async function fetchParImpactForSessions(sessionIds: string[], profileId: string): Promise<Map<string, MatchParImpact>> {
  const impactBySession = new Map<string, MatchParImpact>();
  if (sessionIds.length === 0) return impactBySession;

  const [processingRes, eventsRes] = await Promise.all([
    db.from('par_game_processing').select('*').in('session_id', sessionIds),
    db
      .from('par_rating_events')
      .select('*')
      .eq('profile_id', profileId)
      .in('session_id', sessionIds)
      .eq('event_type', 'game_processed')
      .is('reversed_at', null)
      .order('processed_at', { ascending: false }),
  ]);

  if (processingRes.error) throw processingRes.error;
  if (eventsRes.error) throw eventsRes.error;

  const processingBySession = new Map<string, ParGameProcessing[]>();
  for (const row of (processingRes.data ?? []) as ParGameProcessing[]) {
    const list = processingBySession.get(row.session_id) ?? [];
    list.push(row);
    processingBySession.set(row.session_id, list);
  }

  const eventsBySession = new Map<string, ParRatingEvent[]>();
  for (const row of (eventsRes.data ?? []) as ParRatingEvent[]) {
    const list = eventsBySession.get(row.session_id) ?? [];
    list.push(row);
    eventsBySession.set(row.session_id, list);
  }

  for (const sessionId of sessionIds) {
    const events = eventsBySession.get(sessionId) ?? [];
    const processing = processingBySession.get(sessionId) ?? [];
    const totalChange = events.length ? events.reduce((sum, event) => sum + Number(event.par_change), 0) : null;
    const latestEvent = events[0] ?? null;
    const representativeProcessing = pickRepresentativeProcessing(processing);

    impactBySession.set(sessionId, {
      sessionId,
      status: events.length ? 'processed' : representativeProcessing?.status ?? 'not_started',
      reason: representativeProcessing?.eligibility_reason ?? null,
      totalChange,
      latestEvent,
    });
  }

  return impactBySession;
}

function pickRepresentativeProcessing(rows: ParGameProcessing[]) {
  if (rows.length === 0) return null;
  return rows.find((row) => row.status === 'pending_participant_claim')
    ?? rows.find((row) => row.status === 'failed')
    ?? rows.find((row) => row.status === 'excluded')
    ?? rows.find((row) => row.status === 'processing' || row.status === 'eligible' || row.status === 'pending')
    ?? rows[0];
}
