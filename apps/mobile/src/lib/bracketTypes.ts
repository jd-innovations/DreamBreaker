export type MatchStatus = 'pending' | 'in_progress' | 'completed';

export type BPlayer = {
  type?: 'player';
  id: string;
  name: string;
  seed: number;
  dupr: string;
  city: string;
  avatarInitials: string;
  isBye?: boolean;
};

export type BTeamPlayer = {
  id: string;
  name: string;
  dupr: number;
  gender: 'M' | 'F';
  avatarInitials: string;
};

export type BTeam = {
  type: 'team';
  id: string;
  seed: number;
  name: string;
  avgDupr: number;
  players: [BTeamPlayer, BTeamPlayer];
  isBye?: boolean;
};

export type BParticipant = BPlayer | BTeam;

export function isTeam(p: BParticipant): p is BTeam {
  return (p as BTeam).type === 'team';
}

export type BMatch = {
  id: string;
  roundIdx: number;
  matchIdx: number;
  player1: BParticipant | null;
  player2: BParticipant | null;
  court?: string;
  time?: string;
  status: MatchStatus;
  winnerId?: string;
  score1?: number;
  score2?: number;
};
