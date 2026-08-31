import { supabase } from '@/lib/supabase';
import { isTournamentExpired, type Tournament } from '@/lib/tournamentTypes';

type DbStatus =
  | 'draft' | 'pending_approval' | 'approved' | 'published'
  | 'open' | 'filling_fast' | 'registration_closed'
  | 'in_progress' | 'completed' | 'cancelled';

// `registration_closed` means only "you cannot sign up". It arrives for two
// unrelated reasons — the draw filled, or the event is behind us — and
// collapsing both to 'full' labels a finished tournament FULL, which is wrong
// in a way that reads as a bug. The event date is the only thing that
// separates them, and it is already selected here.
//
// Added when the lifecycle sweeper (20260831030000) started closing past-dated
// tournaments; before that they stayed 'open' and this case never appeared.
function mapStatus(db: DbStatus, eventDate: string): Tournament['status'] {
  const finished = isTournamentExpired({ eventDate });
  switch (db) {
    case 'open':                  return 'open';
    case 'filling_fast':          return 'filling_fast';
    case 'registration_closed':   return finished ? 'completed' : 'full';
    case 'in_progress':           return finished ? 'completed' : 'open';
    case 'completed':             return 'completed';
    case 'published':
    case 'approved':              return 'upcoming';
    default:                      return 'upcoming';
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const VISIBLE_STATUSES: DbStatus[] = [
  'open', 'filling_fast', 'registration_closed', 'in_progress', 'completed', 'published', 'approved',
];

export async function fetchTournaments(): Promise<Tournament[]> {
  const { data, error } = await supabase
    .from('tournaments')
    .select(`
      id, name, venue_name, city, state, event_date, start_time,
      entry_fee_cents, hold_fee_cents, prize_pool_cents,
      draw_size, spots_filled, skill_min, skill_max,
      formats, format, status, featured
    `)
    .in('status', VISIBLE_STATUSES)
    .order('event_date', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id:             row.id,
    name:           row.name,
    venue:          row.venue_name ?? '',
    city:           row.city,
    state:          row.state,
    date:           formatDate(row.event_date),
    eventDate:      String(row.event_date ?? ''),
    startTime:      row.start_time != null ? String(row.start_time) : null,
    entryFeeCents:  row.entry_fee_cents,
    holdFeeCents:   row.hold_fee_cents,
    prizePoolCents: row.prize_pool_cents ?? null,
    drawSize:       row.draw_size,
    spotsFilled:    row.spots_filled,
    skillMin:       Number(row.skill_min ?? 0),
    skillMax:       Number(row.skill_max ?? 5),
    formats:        Array.isArray(row.formats) && row.formats.length > 0
                      ? row.formats
                      : row.format ? [row.format] : [],
    // This query does not embed divisions; callers needing the authoritative
    // formats should use lib/supabase/tournaments.ts fetchTournaments().
    divisionFormats: [],
    divisionSkillMin: null,
    divisionSkillMax: null,
    status:               mapStatus(row.status as DbStatus, String(row.event_date ?? '')),
    registrationOpensAt:  null,
    registrationClosesAt: null,
    featured:             Boolean(row.featured),
  }));
}
