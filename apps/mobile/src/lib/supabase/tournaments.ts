import { supabase } from '@/lib/supabase';
import type { Tournament } from '@/lib/tournamentTypes';

// DB tournament_status values that are visible to players.
// Matches the tournament_status enum in the database exactly — do not add
// 'published' or 'approved' here, they are not in the DB enum.
const VISIBLE_STATUSES = [
  'open', 'filling_fast', 'registration_closed',
  'in_progress', 'completed',
] as const;

function dbStatusToAppStatus(s: string): Tournament['status'] {
  switch (s) {
    case 'draft':                return 'draft';
    case 'pending_approval':     return 'pending_approval';
    case 'open':                 return 'open';
    case 'filling_fast':         return 'filling_fast';
    case 'registration_closed':  return 'full';
    case 'in_progress':          return 'open';
    case 'completed':            return 'completed';
    case 'cancelled':            return 'cancelled';
    default:                     return 'upcoming';
  }
}

function formatDate(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function dbRowToTournament(row: Record<string, unknown>): Tournament {
  return {
    id:             String(row.id),
    name:           String(row.name ?? ''),
    venue:          String(row.venue_name ?? ''),
    city:           String(row.city ?? ''),
    state:          String(row.state ?? ''),
    date:           formatDate(String(row.event_date ?? '')),
    eventDate:      String(row.event_date ?? ''),
    entryFeeCents:  Number(row.entry_fee_cents ?? 0),
    holdFeeCents:   Number(row.hold_fee_cents ?? 0),
    prizePoolCents: row.prize_pool_cents != null ? Number(row.prize_pool_cents) : null,
    drawSize:             Number(row.draw_size ?? 0),
    spotsFilled:          Number(row.spots_filled ?? 0),
    skillMin:             Number(row.skill_min ?? 0),
    skillMax:             Number(row.skill_max ?? 0),
    formats:              Array.isArray(row.formats) ? (row.formats as string[]) : [],
    status:               dbStatusToAppStatus(String(row.status ?? '')),
    registrationOpensAt:  row.registration_opens_at != null ? String(row.registration_opens_at) : null,
    registrationClosesAt: row.registration_closes_at != null ? String(row.registration_closes_at) : null,
    featured:             Boolean(row.featured),
    facilityId:           row.facility_id != null ? String(row.facility_id) : null,
    coverImgUrl:          row.cover_img_url != null ? String(row.cover_img_url) : null,
    directorId:           row.director_id != null ? String(row.director_id) : null,
  };
}

export async function fetchTournaments(): Promise<Tournament[]> {
  const { data, error } = await supabase
    .from('tournaments')
    .select('id,name,venue_name,city,state,event_date,entry_fee_cents,hold_fee_cents,prize_pool_cents,draw_size,spots_filled,skill_min,skill_max,formats,status,registration_opens_at,registration_closes_at,featured,cover_img_url')
    .in('status', VISIBLE_STATUSES)
    .order('event_date', { ascending: true });

  if (error || !data) return [];
  return data.map(dbRowToTournament);
}

export async function fetchTournamentById(id: string): Promise<Tournament | null> {
  const { data, error } = await supabase
    .from('tournaments')
    .select('id,name,venue_name,city,state,event_date,entry_fee_cents,hold_fee_cents,prize_pool_cents,draw_size,spots_filled,skill_min,skill_max,formats,status,director_id,registration_opens_at,registration_closes_at,featured,facility_id')
    .eq('id', id)
    .single();

  if (error || !data) return null;
  return dbRowToTournament(data as Record<string, unknown>);
}

export async function fetchDirectorTournaments(directorId: string): Promise<Tournament[]> {
  const { data, error } = await supabase
    .from('tournaments')
    .select('id,name,venue_name,city,state,event_date,entry_fee_cents,hold_fee_cents,prize_pool_cents,draw_size,spots_filled,skill_min,skill_max,formats,status,director_id,registration_opens_at,registration_closes_at,featured')
    .eq('director_id', directorId)
    .order('event_date', { ascending: false });

  if (error || !data) return [];
  return data.map(dbRowToTournament);
}

const CREATED_SELECT =
  'id,name,venue_name,city,state,event_date,entry_fee_cents,hold_fee_cents,prize_pool_cents,draw_size,spots_filled,skill_min,skill_max,formats,status,director_id,registration_opens_at,registration_closes_at,facility_id';

export type CreateTournamentInput = {
  directorId: string;
  name: string;
  venue: string;
  city: string;
  state: string;
  eventDate: string;              // ISO date, e.g. 2026-08-16
  registrationOpensAt: string | null; // ISO date or null
  registrationClosesAt: string;   // ISO date
  entryFeeCents: number;
  holdFeeCents: number;
  drawSize: number;
  facilityId: string | null;
};

// Always creates in 'draft' — matches the web director flow (draft -> submit
// for approval -> admin approves -> open). Requires the RLS-enforced
// is_approved_director() (see "tournaments: director insert" policy); the
// caller must already be gated to approved directors before reaching this.
export async function createDraftTournament(input: CreateTournamentInput): Promise<Tournament | null> {
  const { data, error } = await supabase
    .from('tournaments')
    .insert({
      director_id:            input.directorId,
      name:                   input.name,
      venue_name:             input.venue,
      city:                   input.city,
      state:                  input.state,
      format:                 'doubles',
      event_date:             input.eventDate,
      registration_opens_at:  input.registrationOpensAt,
      registration_closes_at: input.registrationClosesAt,
      entry_fee_cents:        input.entryFeeCents,
      hold_fee_cents:         input.holdFeeCents,
      draw_size:              input.drawSize,
      facility_id:            input.facilityId,
      status:                 'draft',
      spots_filled:           0,
    })
    .select(CREATED_SELECT)
    .single();

  if (error || !data) {
    console.error('[createDraftTournament] error:', error?.message, error?.code);
    return null;
  }
  return dbRowToTournament(data as Record<string, unknown>);
}

export type UpdateTournamentInput = {
  name: string;
  venue: string;
  city: string;
  state: string;
  eventDate: string;
  registrationOpensAt: string | null;
  registrationClosesAt: string;
  entryFeeCents: number;
  holdFeeCents: number;
  drawSize: number;
};

// Directors can only edit while the tournament is still a draft (RLS also
// allows updates to a live tournament, but the mobile app doesn't yet mirror
// web's "editing a live tournament kicks it back to pending_approval" flow,
// so the edit screen is gated to draft-only until that's built).
export async function updateTournamentDetails(id: string, input: UpdateTournamentInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from('tournaments')
    .update({
      name:                    input.name,
      venue_name:              input.venue,
      city:                    input.city,
      state:                   input.state,
      event_date:              input.eventDate,
      registration_opens_at:   input.registrationOpensAt,
      registration_closes_at:  input.registrationClosesAt,
      entry_fee_cents:         input.entryFeeCents,
      hold_fee_cents:          input.holdFeeCents,
      draw_size:               input.drawSize,
    })
    .eq('id', id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function submitTournamentForApproval(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from('tournaments')
    .update({ status: 'pending_approval', submitted_for_approval_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
