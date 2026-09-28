import { supabase } from '@/lib/supabase';
import type { DivisionData, DivisionPlayStatus } from '@/data/divisions';
export type { DivisionData, DivisionPlayStatus };

function dbRowToDivision(row: Record<string, unknown>): DivisionData {
  const skillMin = row.skill_min != null ? Number(row.skill_min) : null;
  const skillMax = row.skill_max != null ? Number(row.skill_max) : null;
  const capacity = Number(row.draw_size ?? 0);
  const filled   = Number(row.spots_filled ?? 0);

  let status: DivisionData['status'] = 'open';
  if (filled >= capacity) status = 'full';
  else if (filled / capacity >= 0.85) status = 'waitlist';

  const level = skillMin != null && skillMax != null
    ? `${skillMin}-${skillMax}`
    : skillMin != null
      ? String(skillMin)
      : '—';

  const format = String(row.format ?? '');
  const gender = String(row.gender_category ?? '');

  return {
    id:                  String(row.id),
    tournamentId:        String(row.tournament_id),
    name:                String(row.name ?? ''),
    level,
    levelNavy:           true,
    type:                format,
    dates:               '',
    capacity,
    registered:          filled,
    status,
    gender,
    eventType:           format,
    skillMin:            skillMin ?? undefined,
    skillMax:            skillMax ?? undefined,
    entryFeeCents:       row.entry_fee_cents != null ? Number(row.entry_fee_cents) : undefined,
    createdAt:           String(row.created_at ?? ''),
    playStatus:          (row.play_status === 'live' || row.play_status === 'paused' ? row.play_status : 'not_started') as DivisionPlayStatus,
  };
}

/**
 * Starts, pauses or resumes a division (20260928180000). Going live fills free
 * courts and puts the division's waiting matches at the back of the line; the
 * database trigger does that. Pausing never takes anyone off a court.
 */
export async function setDivisionPlayStatus(
  divisionId: string,
  status: DivisionPlayStatus,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('divisions')
    .update({ play_status: status })
    .eq('id', divisionId)
    .select('id');
  if (error) return { ok: false, error: 'Could not change the division status. Please try again.' };
  if (!data || data.length === 0) return { ok: false, error: 'You are not able to change this division.' };
  return { ok: true };
}

export async function fetchDivisionsForTournament(tournamentId: string): Promise<DivisionData[]> {
  const { data, error } = await supabase
    .from('divisions')
    .select('id,tournament_id,name,format,skill_min,skill_max,draw_size,entry_fee_cents,spots_filled,created_at,gender_category,play_status')
    .eq('tournament_id', tournamentId)
    .order('created_at', { ascending: true });

  if (error || !data) return [];
  return data.map(dbRowToDivision);
}

// divisions.format enum: singles | doubles | mixed_doubles | juniors.
// divisions.gender_category values in use: mens | womens | mixed | open.
// There's no per-division deposit/hold-amount column — the real hold amount
// is always tournament-wide (tournaments.hold_fee_cents).
export async function createDivision(input: {
  tournamentId: string;
  name: string;
  eventType: string;
  gender: string;
  skillMin: number;
  skillMax: number;
  capacity: number;
  /**
   * Omit to store null, which means "inherit the tournament's entry fee" --
   * the semantics create-tournament-entry-payment-intent charges on
   * (division.entry_fee_cents ?? tournament.entry_fee_cents ?? 0). Pass 0 to
   * make the division explicitly free regardless of the tournament's fee.
   */
  entryFeeCents?: number;
}): Promise<DivisionData> {
  const format = input.eventType === 'Singles' ? 'singles'
    : input.eventType === 'Mixed Doubles' ? 'mixed_doubles' : 'doubles';
  const genderCategory = input.gender === "Men's" ? 'mens'
    : input.gender === "Women's" ? 'womens'
    : input.gender === 'Mixed' ? 'mixed' : 'open';

  const { data, error } = await supabase
    .from('divisions')
    .insert({
      tournament_id: input.tournamentId,
      name: input.name,
      format,
      gender_category: genderCategory,
      skill_min: input.skillMin,
      skill_max: input.skillMax,
      draw_size: input.capacity,
      entry_fee_cents: input.entryFeeCents ?? null,
    })
    .select('id,tournament_id,name,format,skill_min,skill_max,draw_size,entry_fee_cents,spots_filled,created_at,gender_category,play_status')
    .single();

  if (error || !data) throw new Error(error?.message ?? 'Failed to create division');
  return dbRowToDivision(data);
}
