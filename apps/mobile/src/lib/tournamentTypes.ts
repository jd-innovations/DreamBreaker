/**
 * True once the event day has passed. Compared as YYYY-MM-DD strings against the
 * device's local date, so a tournament still shows on the day it's played and
 * drops off the next morning — no timezone shifting from Date parsing.
 */
export function isTournamentExpired(tournament: Pick<Tournament, 'eventDate'>): boolean {
  if (!tournament.eventDate) return false;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return tournament.eventDate.slice(0, 10) < today;
}

export interface Tournament {
  id: string;
  name: string;
  venue: string;
  city: string;
  state: string;
  venueAddress?: string | null;
  zipCode?: string | null;
  date: string;       // display-formatted, e.g. "Jul 16, 2026"
  eventDate: string;  // raw ISO date (YYYY-MM-DD), for date comparisons
  startTime: string | null;  // raw "HH:MM:SS" local wall-clock, null when unset
  entryFeeCents: number;
  holdFeeCents: number;
  prizePoolCents: number | null;
  drawSize: number;
  spotsFilled: number;
  skillMin: number;
  skillMax: number;
  formats: string[];
  // Distinct divisions.format values. The authoritative answer to "what is
  // played here"; `formats` above is a tournaments column that division
  // creation never updates. Empty when the query did not embed divisions.
  divisionFormats: string[];
  // Skill range across the divisions — min of mins, max of maxes. Same story as
  // divisionFormats: skill_min/skill_max on tournaments is set on 2 of 10 rows
  // while 11 divisions carry real values. Null when no division declares one,
  // or when the query did not embed divisions.
  divisionSkillMin: number | null;
  divisionSkillMax: number | null;
  status: 'draft' | 'pending_approval' | 'open' | 'filling_fast' | 'full' | 'upcoming' | 'completed' | 'cancelled';
  registrationOpensAt:  string | null;
  registrationClosesAt: string | null;
  featured:             boolean;
  facilityId?: string | null;
  coverImgUrl?: string | null;
  directorId?: string | null;
}
