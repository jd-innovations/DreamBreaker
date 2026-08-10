import { supabase } from '@/lib/supabase';
import type { DivisionData } from '@/data/divisions';
export type { DivisionData };

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
  };
}

export async function fetchDivisionsForTournament(tournamentId: string): Promise<DivisionData[]> {
  const { data, error } = await supabase
    .from('divisions')
    .select('id,tournament_id,name,format,skill_min,skill_max,draw_size,entry_fee_cents,spots_filled,created_at,gender_category')
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
  entryFeeCents: number;
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
      entry_fee_cents: input.entryFeeCents,
    })
    .select('id,tournament_id,name,format,skill_min,skill_max,draw_size,entry_fee_cents,spots_filled,created_at,gender_category')
    .single();

  if (error || !data) throw new Error(error?.message ?? 'Failed to create division');
  return dbRowToDivision(data);
}
