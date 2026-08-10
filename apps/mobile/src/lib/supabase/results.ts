import { fetchAllBrackets, isTournamentCompleted } from '@/lib/supabase/brackets';
import type { DirectorBracket } from '@/lib/directorBracketStore';

// ─── Results queries ──────────────────────────────────────────────────────────

// Returns completed brackets for a tournament (results that can be published/viewed)
export async function fetchTournamentResults(
  tournamentId: string,
  divisionNames: Record<string, string> = {},
): Promise<DirectorBracket[]> {
  const all = await fetchAllBrackets(tournamentId, divisionNames);
  return all.filter(b => b.status === 'completed');
}

// Returns all brackets regardless of completion status
export { fetchAllBrackets, isTournamentCompleted };
