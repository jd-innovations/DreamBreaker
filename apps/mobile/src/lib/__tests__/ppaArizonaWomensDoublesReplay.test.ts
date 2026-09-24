import { describe, expect, it } from 'vitest';
import { validateSingleGameScore, winnerSlot } from '../bracketScoring';
import { PPA_ARIZONA_WOMENS_DOUBLES } from '../replays/ppaArizonaWomensDoubles';

describe('PPA Arizona Open womens doubles replay', () => {
  it('accepts every normalized score and preserves the official winner', () => {
    for (const match of PPA_ARIZONA_WOMENS_DOUBLES.matches) {
      expect(validateSingleGameScore(match.score1, match.score2), `match ${match.number}`).toBeNull();
      const winner = winnerSlot(match.score1, match.score2) === 1
        ? match.team1Seed
        : match.team2Seed;
      expect(winner, `match ${match.number}`).toBe(match.winnerSeed);
    }
  });

  it('eliminates exactly one live team per match and produces the PPA champion', () => {
    const liveTeams = new Set(
      Array.from({ length: PPA_ARIZONA_WOMENS_DOUBLES.teamCount }, (_, index) => index + 1),
    );

    for (const match of PPA_ARIZONA_WOMENS_DOUBLES.matches) {
      expect(liveTeams.has(match.team1Seed), `team ${match.team1Seed} before match ${match.number}`).toBe(true);
      expect(liveTeams.has(match.team2Seed), `team ${match.team2Seed} before match ${match.number}`).toBe(true);

      const loser = match.winnerSeed === match.team1Seed ? match.team2Seed : match.team1Seed;
      liveTeams.delete(loser);
    }

    expect(PPA_ARIZONA_WOMENS_DOUBLES.matches).toHaveLength(
      PPA_ARIZONA_WOMENS_DOUBLES.teamCount - 1,
    );
    expect([...liveTeams]).toEqual([PPA_ARIZONA_WOMENS_DOUBLES.championSeed]);

    const final = PPA_ARIZONA_WOMENS_DOUBLES.matches.at(-1);
    expect(final?.round).toBe('Final');
    expect(final?.winnerSeed).toBe(PPA_ARIZONA_WOMENS_DOUBLES.championSeed);
    expect(
      final?.team1Seed === PPA_ARIZONA_WOMENS_DOUBLES.runnerUpSeed
      || final?.team2Seed === PPA_ARIZONA_WOMENS_DOUBLES.runnerUpSeed,
    ).toBe(true);
  });
});
