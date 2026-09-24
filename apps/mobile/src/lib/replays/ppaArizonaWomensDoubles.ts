export type ReplayMatch = {
  round: string;
  number: number;
  team1Seed: number;
  team2Seed: number;
  score1: number;
  score2: number;
  winnerSeed: number;
};

import type { DirectorBracket } from '@/lib/directorBracketStore';
import type { Tournament } from '@/lib/tournamentTypes';

export const PPA_ARIZONA_PREVIEW_ID = 'preview-ppa-arizona-womens-doubles';

const TEAM_NAMES: Record<number, string> = {
  1: 'Rachel Rohrabacher / Parris Todd',
  2: 'Tyra Hurricane Black / Meghan Dizon',
  3: 'Lacy Schneemann / Tina Pisnik',
  4: 'Sofia Sewing / Catherine Parenteau',
  5: 'Kate Fahey / Ting Chieh Wei',
  6: 'Chao Yi Wang / Milan Rane',
  7: 'Brooke Buckner / Kaitlyn Christian',
  8: 'Etta Tuionetoa / Jessie Irvine',
  9: 'Mari Humberg / Judit Castillo',
  10: 'Liz Truluck / Cailyn Campbell',
  11: 'Angie Walker / Alex Walker',
  12: 'Genie Erokhina / Emma Nelson',
  13: 'Xiao Yi Wang-Beckvall / Zoeya Khan',
  14: 'Hannah Blatt / Jalina Ingram',
  15: 'Victoria Dimuzio / Layne Sleeth',
  16: 'Christa Gecheva / Elsie Hendershot',
  17: 'Lauren Stratman / Lindsey Newman',
  18: 'Nicole Conard / Marcela Aguila Ampon',
  19: 'Isabella Dunlap / Alexa Schull',
  20: 'Daria Walczak / Kiora Kunimoto',
  21: 'Mary Brascia / Maggie Brascia',
  22: 'Olivia McMillan / Chloe Igleski',
  23: 'Kelly Goodnow / Naomi Nguyen',
  24: 'Luana Stanciu / Camila Zilveti',
  25: 'Ava Cavataio / Estee Widdershoven',
  26: 'Audrey Adele Brown / Rachel Rettger',
  27: 'Ella Cosma / Polina Libo',
  28: 'Gina Li / Eileen Wang',
  29: 'Carlota Trevino / Cc Eleven Sacca',
  30: 'Naomi Tran / Janet Liu',
};

// Static, anonymized snapshot of the public PPA Arizona Open Women's Doubles
// results. No runtime fetch occurs. Each score is one game won by the official
// match winner; match 14 was a walkover and is represented as 11-0.
export const PPA_ARIZONA_WOMENS_DOUBLES = {
  sourceEventId: '62c01642-1bb2-4f9a-9998-599f8fdefe5c',
  sourceDivisionId: 'a39542a3-b201-4cae-8461-9a9607f8c63a',
  teamCount: 30,
  championSeed: 1,
  runnerUpSeed: 2,
  matches: [
    { round: 'Round of 64', number: 1, team1Seed: 24, team2Seed: 29, score1: 5, score2: 11, winnerSeed: 29 },
    { round: 'Round of 64', number: 2, team1Seed: 27, team2Seed: 30, score1: 5, score2: 11, winnerSeed: 30 },
    { round: 'Round of 32', number: 3, team1Seed: 12, team2Seed: 20, score1: 2, score2: 11, winnerSeed: 20 },
    { round: 'Round of 32', number: 4, team1Seed: 7, team2Seed: 26, score1: 11, score2: 2, winnerSeed: 7 },
    { round: 'Round of 32', number: 5, team1Seed: 9, team2Seed: 21, score1: 11, score2: 7, winnerSeed: 9 },
    { round: 'Round of 32', number: 6, team1Seed: 4, team2Seed: 29, score1: 11, score2: 6, winnerSeed: 4 },
    { round: 'Round of 32', number: 7, team1Seed: 17, team2Seed: 19, score1: 11, score2: 3, winnerSeed: 17 },
    { round: 'Round of 32', number: 8, team1Seed: 10, team2Seed: 23, score1: 11, score2: 7, winnerSeed: 10 },
    { round: 'Round of 32', number: 9, team1Seed: 14, team2Seed: 18, score1: 11, score2: 5, winnerSeed: 14 },
    { round: 'Round of 32', number: 10, team1Seed: 8, team2Seed: 28, score1: 11, score2: 5, winnerSeed: 8 },
    { round: 'Round of 32', number: 11, team1Seed: 11, team2Seed: 15, score1: 10, score2: 12, winnerSeed: 15 },
    { round: 'Round of 32', number: 12, team1Seed: 16, team2Seed: 25, score1: 9, score2: 11, winnerSeed: 25 },
    { round: 'Round of 32', number: 13, team1Seed: 6, team2Seed: 30, score1: 11, score2: 9, winnerSeed: 6 },
    { round: 'Round of 32', number: 14, team1Seed: 13, team2Seed: 22, score1: 0, score2: 11, winnerSeed: 22 },
    { round: 'Round of 16', number: 15, team1Seed: 1, team2Seed: 20, score1: 11, score2: 5, winnerSeed: 1 },
    { round: 'Round of 16', number: 16, team1Seed: 7, team2Seed: 9, score1: 9, score2: 11, winnerSeed: 9 },
    { round: 'Round of 16', number: 17, team1Seed: 4, team2Seed: 17, score1: 11, score2: 2, winnerSeed: 4 },
    { round: 'Round of 16', number: 18, team1Seed: 5, team2Seed: 10, score1: 11, score2: 8, winnerSeed: 5 },
    { round: 'Round of 16', number: 19, team1Seed: 2, team2Seed: 14, score1: 11, score2: 2, winnerSeed: 2 },
    { round: 'Round of 16', number: 20, team1Seed: 8, team2Seed: 15, score1: 11, score2: 4, winnerSeed: 8 },
    { round: 'Round of 16', number: 21, team1Seed: 3, team2Seed: 25, score1: 11, score2: 5, winnerSeed: 3 },
    { round: 'Round of 16', number: 22, team1Seed: 6, team2Seed: 22, score1: 11, score2: 1, winnerSeed: 6 },
    { round: 'Quarterfinals', number: 23, team1Seed: 1, team2Seed: 9, score1: 11, score2: 8, winnerSeed: 1 },
    { round: 'Quarterfinals', number: 24, team1Seed: 4, team2Seed: 5, score1: 11, score2: 6, winnerSeed: 4 },
    { round: 'Quarterfinals', number: 25, team1Seed: 2, team2Seed: 8, score1: 11, score2: 5, winnerSeed: 2 },
    { round: 'Quarterfinals', number: 26, team1Seed: 3, team2Seed: 6, score1: 11, score2: 6, winnerSeed: 3 },
    { round: 'Semifinals', number: 27, team1Seed: 1, team2Seed: 4, score1: 11, score2: 5, winnerSeed: 1 },
    { round: 'Semifinals', number: 28, team1Seed: 2, team2Seed: 3, score1: 11, score2: 8, winnerSeed: 2 },
    { round: 'Final', number: 30, team1Seed: 1, team2Seed: 2, score1: 11, score2: 4, winnerSeed: 1 },
  ] satisfies ReplayMatch[],
} as const;

export function buildPpaArizonaPreview(): {
  tournament: Tournament;
  brackets: DirectorBracket[];
  matchCounts: { total: number; completed: number; remaining: number; completionPct: number };
} | null {
  if (!__DEV__) return null;

  const completedAt = '2026-09-20T20:00:00.000Z';
  const participants = Object.entries(TEAM_NAMES).map(([seed, name]) => ({
    id: `ppa-arizona-seed-${seed}`,
    name,
    divisionId: PPA_ARIZONA_WOMENS_DOUBLES.sourceDivisionId,
    seed: Number(seed),
  }));
  const participantBySeed = new Map(participants.map(participant => [participant.seed, participant]));
  const roundNames = [...new Set(PPA_ARIZONA_WOMENS_DOUBLES.matches.map(match => match.round))];

  const bracket: DirectorBracket = {
    id: 'ppa-arizona-womens-doubles-replay',
    tournamentId: PPA_ARIZONA_PREVIEW_ID,
    divisionId: PPA_ARIZONA_WOMENS_DOUBLES.sourceDivisionId,
    divisionName: "Women's Doubles",
    bracketSize: PPA_ARIZONA_WOMENS_DOUBLES.teamCount,
    participants,
    rounds: roundNames.map((roundName, roundIndex) => ({
      id: `ppa-arizona-round-${roundIndex}`,
      roundIndex,
      roundName,
      matches: PPA_ARIZONA_WOMENS_DOUBLES.matches
        .filter(match => match.round === roundName)
        .map((match, matchIndex) => ({
          id: `ppa-arizona-match-${match.number}`,
          tournamentId: PPA_ARIZONA_PREVIEW_ID,
          divisionId: PPA_ARIZONA_WOMENS_DOUBLES.sourceDivisionId,
          roundIndex,
          roundName,
          matchNumber: matchIndex,
          participant1: participantBySeed.get(match.team1Seed) ?? null,
          participant2: participantBySeed.get(match.team2Seed) ?? null,
          winnerId: participantBySeed.get(match.winnerSeed)?.id,
          score1: match.score1,
          score2: match.score2,
          status: 'completed' as const,
          completedAt,
        })),
    })),
    status: 'completed',
    createdAt: completedAt,
    completedAt,
    publishedAt: completedAt,
    championId: participantBySeed.get(PPA_ARIZONA_WOMENS_DOUBLES.championSeed)?.id,
    championName: TEAM_NAMES[PPA_ARIZONA_WOMENS_DOUBLES.championSeed],
    runnerUpId: participantBySeed.get(PPA_ARIZONA_WOMENS_DOUBLES.runnerUpSeed)?.id,
    runnerUpName: TEAM_NAMES[PPA_ARIZONA_WOMENS_DOUBLES.runnerUpSeed],
  };

  const tournament: Tournament = {
    id: PPA_ARIZONA_PREVIEW_ID,
    name: 'Veolia Arizona Open',
    description: 'Development-only replay of published PPA results.',
    venue: 'Mesa, Arizona',
    city: 'Mesa',
    state: 'AZ',
    date: 'Sep 20, 2026',
    eventDate: '2026-09-20',
    startTime: null,
    entryFeeCents: 0,
    holdFeeCents: 0,
    prizePoolCents: null,
    drawSize: 30,
    spotsFilled: 30,
    skillMin: 5,
    skillMax: 6,
    formats: ['doubles'],
    divisionFormats: ['doubles'],
    divisionSkillMin: 5,
    divisionSkillMax: 6,
    status: 'completed',
    rawStatus: 'completed',
    registrationOpensAt: null,
    registrationClosesAt: null,
    featured: false,
  };

  return {
    tournament,
    brackets: [bracket],
    matchCounts: { total: 29, completed: 29, remaining: 0, completionPct: 100 },
  };
}
