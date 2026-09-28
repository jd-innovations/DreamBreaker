import { Alert } from 'react-native';

// Tournament structure: tournaments.tournament_format (text, default
// 'single_elim') and tournaments.pool_count (default 4). Keys, short labels
// and long labels mirror web exactly: TOURNAMENT_STRUCTURES in
// web/src/app/director/page.tsx and STRUCTURE_LABELS in
// web/src/app/director/tournaments/[id]/page.tsx. Keep all three in sync.

export type TournamentFormatKey = 'single_elim' | 'double_elim' | 'round_robin' | 'pool_bracket' | 'mlp';

export const TOURNAMENT_FORMATS: { key: TournamentFormatKey; label: string; desc: string }[] = [
  { key: 'single_elim',  label: 'Single Elim',    desc: 'Lose once, eliminated' },
  { key: 'double_elim',  label: 'Double Elim',    desc: 'Two losses to eliminate' },
  { key: 'round_robin',  label: 'Round Robin',    desc: 'Everyone plays everyone' },
  { key: 'pool_bracket', label: 'Pool → Bracket', desc: 'Pool play seeds into bracket' },
  { key: 'mlp',          label: 'MLP Format',     desc: 'Team-based, Dreambreaker end' },
];

export const TOURNAMENT_FORMAT_LABELS: Record<TournamentFormatKey, string> = {
  single_elim:  'Single Elimination',
  double_elim:  'Double Elimination',
  round_robin:  'Round Robin',
  pool_bracket: 'Pool Play → Bracket',
  mlp:          'MLP Format',
};

export const DEFAULT_POOL_COUNT = 4;
export const MIN_POOLS = 2;
export const MAX_POOLS = 8;

export function normalizeFormat(v: string | null | undefined): TournamentFormatKey {
  return (TOURNAMENT_FORMATS.some(f => f.key === v) ? v : 'single_elim') as TournamentFormatKey;
}

export function formatLabel(v: string | null | undefined): string {
  return TOURNAMENT_FORMAT_LABELS[normalizeFormat(v)];
}

/**
 * Whether the bracket engine (lib/supabase/brackets.ts createBracket) can run
 * this format. Today it only builds single elimination; every other format
 * needs an explicit confirmation before generating, never a silent fallback.
 */
export function engineSupportsFormat(v: string | null | undefined): boolean {
  return normalizeFormat(v) === 'single_elim';
}

/**
 * Runs `proceed` straight away for single elimination. For any other format it
 * first says plainly that the bracket will be generated as single elimination
 * and asks the director to confirm. No silent fallback.
 */
export function confirmBracketFormat(format: string | null | undefined, proceed: () => void): void {
  if (engineSupportsFormat(format)) {
    proceed();
    return;
  }
  const label = formatLabel(format);
  Alert.alert(
    `${label} isn't supported yet`,
    `This tournament is set to ${label}, but brackets can only be generated as Single Elimination for now. Generate a Single Elimination bracket for this division?`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Generate Single Elimination', onPress: proceed },
    ],
  );
}
