export function validateSingleGameScore(score1: number, score2: number): string | null {
  if (!Number.isInteger(score1) || !Number.isInteger(score2)) return 'Scores must be whole numbers.';
  if (score1 < 0 || score2 < 0) return 'Scores cannot be negative.';
  if (score1 === score2) return 'Scores cannot be tied. No ties allowed.';

  const winner = Math.max(score1, score2);
  const loser = Math.min(score1, score2);
  if (winner < 11) return 'Winning score must be at least 11.';
  if (winner - loser < 2) return 'Winner must win by at least 2 points.';
  return null;
}

export function winnerSlot(score1: number, score2: number): 1 | 2 {
  return score1 > score2 ? 1 : 2;
}
