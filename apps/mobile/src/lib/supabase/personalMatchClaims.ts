import { supabase } from '@/lib/supabase';

type DbClient = typeof supabase & {
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

const db = supabase as DbClient;

export type ClaimValidationStatus = 'valid' | 'invalid' | 'expired' | 'already_claimed';
export type ClaimResultStatus = 'claimed' | 'invalid' | 'expired' | 'already_claimed';

export type ClaimGameSummary = {
  gameNumber: number;
  teamOneScore: number | null;
  teamTwoScore: number | null;
  winningTeam: 1 | 2 | null;
};

export type ClaimTeamParticipant = {
  gameNumber: number;
  teamNumber: 1 | 2;
  position: number;
  name: string;
};

export type PersonalMatchClaimPreview = {
  status: ClaimValidationStatus;
  reason: string | null;
  recorderName: string | null;
  facilityName: string | null;
  playedAt: string | null;
  guestName: string | null;
  sessionFormat: 'singles' | 'doubles' | null;
  games: ClaimGameSummary[];
  teams: ClaimTeamParticipant[];
};

export type PersonalMatchClaimLink = {
  claimId: string;
  guestShareId: string;
  token: string;
  claimUrl: string;
  expiresAt: string;
};

function mapPreview(row: Record<string, unknown>): PersonalMatchClaimPreview {
  return {
    status: String(row.status ?? 'invalid') as ClaimValidationStatus,
    reason: row.reason != null ? String(row.reason) : null,
    recorderName: row.recorder_name != null ? String(row.recorder_name) : null,
    facilityName: row.facility_name != null ? String(row.facility_name) : null,
    playedAt: row.played_at != null ? String(row.played_at) : null,
    guestName: row.guest_name != null ? String(row.guest_name) : null,
    sessionFormat: row.session_format != null ? String(row.session_format) as 'singles' | 'doubles' : null,
    games: Array.isArray(row.games) ? row.games as ClaimGameSummary[] : [],
    teams: Array.isArray(row.teams) ? row.teams as ClaimTeamParticipant[] : [],
  };
}

export async function createPersonalMatchClaimLink(guestShareId: string): Promise<PersonalMatchClaimLink> {
  const { data, error } = await db.rpc('create_personal_match_claim_link', {
    p_guest_share_id: guestShareId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    claimId: String(row.claim_id),
    guestShareId: String(row.guest_share_id),
    token: String(row.token),
    claimUrl: String(row.claim_url),
    expiresAt: String(row.expires_at),
  };
}

export async function validatePersonalMatchClaim(token: string): Promise<PersonalMatchClaimPreview> {
  const { data, error } = await db.rpc('validate_personal_match_claim', {
    p_token: token,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return mapPreview(row ?? {});
}

export async function claimPersonalMatch(token: string): Promise<{ status: ClaimResultStatus; reason: string | null; sessionId: string | null }> {
  const { data, error } = await db.rpc('claim_personal_match', {
    p_token: token,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    status: String(row?.status ?? 'invalid') as ClaimResultStatus,
    reason: row?.reason != null ? String(row.reason) : null,
    sessionId: row?.session_id != null ? String(row.session_id) : null,
  };
}
