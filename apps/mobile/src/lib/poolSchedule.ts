// Pool play scheduling. The rules now live in packages/shared/src/poolSchedule.ts
// (shared with web, DIRECTOR_HUB_WEB_PARITY.md W3); this module keeps the
// mobile names and binds the rating to TournamentRegistration's DUPR fields.
import type { TournamentRegistration } from './registrationStore';
// Relative, not @shared/: this module stays usable without the app's aliases.
import { meanRating, seedByRating } from '../../../../packages/shared/src/poolSchedule';

export {
  POOL_LETTERS, DEFAULT_ADVANCE_PER_POOL, snakePools, roundRobinRounds, suggestPoolCount,
  bracketPositions, seedQualifiers, placeSeeds, cutoffTies,
  type SeedableStanding, type QualifiedSeed,
} from '../../../../packages/shared/src/poolSchedule';

type Team = TournamentRegistration;

/** Team rating for seeding: mean of the known DUPRs; null when unrated. */
export function teamRating(t: Team): number | null {
  return meanRating([t.playerDupr, t.partnerDupr]);
}

/** Highest rated first; unrated keep registration order, after the rated. */
export function seedTeams(teams: Team[]): Team[] {
  return seedByRating(teams, teamRating);
}
