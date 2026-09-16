/**
 * One status vocabulary for both apps.
 *
 * Workstream C2 of WEB_MOBILE_ALIGNMENT_PLAN.md, which filed this as "one
 * mapping from status to a label and a colour". The audit found something
 * deeper: the two apps did not disagree about labels, they disagreed about the
 * MODEL.
 *
 * Mobile ran every status through a collapse (lib/supabase/tournaments.ts and
 * registrations.ts) into a smaller, player-facing vocabulary. Web rendered raw
 * database values with labels invented per page. So one row meant different
 * things per platform:
 *
 *   registration_closed  ->  mobile "FULL"      web "Reg. Closed"
 *   in_progress          ->  mobile "OPEN"      web "In Progress"
 *   approved, published  ->  mobile "UPCOMING"  web  (blank -- unguarded lookup)
 *
 * Web also disagreed with ITSELF: admin/page.tsx and director/page.tsx carried
 * identical labels and different colours for half the statuses, including
 * `completed` as grey on one and green on the other.
 *
 * THE RESOLUTION (decided 2026-09-16): mobile's collapse is the reference for
 * CONSUMER surfaces, and operations surfaces keep the precise status. That is
 * not a compromise -- it is the split the plan already draws between workstream
 * D (mobile is reference) and E (web is reference). A player does not need to
 * know the difference between `registration_closed` and a full roster; a
 * director looking at their own event does.
 *
 * Renderers stay per-platform, as the plan requires. This module returns a
 * `tone`, never a colour: mobile maps tone to its palette, web maps it to a
 * Tailwind class. Returning "bg-orange-400" here would put web's styling in a
 * file mobile imports.
 */

/** Semantic intent. Each platform maps these to its own visual language. */
export type StatusTone =
  | 'neutral'    // nothing to say -- draft, unknown
  | 'info'       // in flight, no action implied
  | 'positive'   // good, open, confirmed
  | 'attention'  // time-sensitive: filling fast, a held spot about to expire
  | 'critical'   // cancelled, failed, disqualified
  | 'muted';     // over and settled -- completed, expired

export type StatusView = {
  /** Stable key for tests and analytics. Never rendered. */
  key: string;
  /** Display text. Sentence case; renderers uppercase if their design does. */
  label: string;
  tone: StatusTone;
};

// ── Tournaments ──────────────────────────────────────────────────────────────

export type TournamentDbStatus =
  | 'draft' | 'pending_approval' | 'approved' | 'published' | 'open'
  | 'filling_fast' | 'registration_closed' | 'in_progress' | 'completed'
  | 'cancelled';

/**
 * What a PLAYER sees. Mobile's existing collapse, preserved exactly.
 *
 * `finished` is the event date having passed, and it is load-bearing: without
 * it a past-dated `registration_closed` tournament reads as FULL, which invites
 * someone to wait for a spot in an event that is over. That distinction was
 * added to mobile when the lifecycle sweeper started closing past-dated
 * tournaments, and it is the one piece of real judgement in the old mapper.
 */
export function tournamentPlayerStatus(
  status: string,
  finished = false,
): StatusView {
  switch (status) {
    case 'draft':
      return { key: 'draft', label: 'Draft', tone: 'neutral' };
    case 'pending_approval':
      // Key matches mobile's app-level union exactly ('pending_approval',
      // not 'pending'). Mobile's `status` field drives LOGIC as well as
      // labels -- calendar eligibility, director groupings, discovery
      // filters -- so a key that does not line up would silently change
      // behaviour the day mobile adopts this, not just wording.
      return { key: 'pending_approval', label: 'Pending', tone: 'info' };
    case 'open':
      return { key: 'open', label: 'Open', tone: 'positive' };
    case 'filling_fast':
      return { key: 'filling_fast', label: 'Filling fast', tone: 'attention' };
    case 'registration_closed':
      return finished
        ? { key: 'completed', label: 'Completed', tone: 'muted' }
        : { key: 'full', label: 'Full', tone: 'critical' };
    case 'in_progress':
      // Kept as mobile had it, by decision 2026-09-16. Note what it means: a
      // player sees "Open" for an event already under way. Operations surfaces
      // use tournamentOpsStatus() and say "In progress", which is why that
      // function exists.
      return finished
        ? { key: 'completed', label: 'Completed', tone: 'muted' }
        : { key: 'open', label: 'Open', tone: 'positive' };
    case 'completed':
      return { key: 'completed', label: 'Completed', tone: 'muted' };
    case 'cancelled':
      return { key: 'cancelled', label: 'Cancelled', tone: 'critical' };
    default:
      // `approved` and `published` land here, as they did on mobile.
      return { key: 'upcoming', label: 'Upcoming', tone: 'info' };
  }
}

/** What an ADMIN or DIRECTOR sees: the real status, never collapsed. */
export function tournamentOpsStatus(status: string): StatusView {
  switch (status) {
    case 'draft':
      return { key: 'draft', label: 'Draft', tone: 'neutral' };
    case 'pending_approval':
      return { key: 'pending_approval', label: 'Pending review', tone: 'info' };
    case 'approved':
      return { key: 'approved', label: 'Approved', tone: 'info' };
    case 'published':
      return { key: 'published', label: 'Published', tone: 'info' };
    case 'open':
      return { key: 'open', label: 'Open', tone: 'positive' };
    case 'filling_fast':
      return { key: 'filling_fast', label: 'Filling fast', tone: 'attention' };
    case 'registration_closed':
      return { key: 'registration_closed', label: 'Registration closed', tone: 'info' };
    case 'in_progress':
      return { key: 'in_progress', label: 'In progress', tone: 'positive' };
    case 'completed':
      return { key: 'completed', label: 'Completed', tone: 'muted' };
    case 'cancelled':
      return { key: 'cancelled', label: 'Cancelled', tone: 'critical' };
    default:
      // Never blank. Web's director page rendered an empty label and a missing
      // colour class for anything it had not enumerated.
      return { key: 'unknown', label: humanize(status), tone: 'neutral' };
  }
}

// ── Registrations ────────────────────────────────────────────────────────────

export type RegistrationDbStatus =
  | 'held' | 'registered' | 'checked_in' | 'withdrawn' | 'disqualified'
  | 'no_show' | 'substitute' | 'waitlisted' | 'waitlist_offered'
  | 'expired_hold';

/**
 * What a PLAYER sees. Mobile's collapse, preserved by decision 2026-09-16 --
 * withdrawn, disqualified and expired_hold all read as "Cancelled".
 *
 * One correction to mobile's version: `held` no longer falls through to
 * "Registered". A held spot is a temporary reservation that expires, and
 * calling it registered is wrong in the direction that costs someone their
 * place. Everything else is unchanged.
 */
export function registrationPlayerStatus(status: string): StatusView {
  switch (status) {
    case 'held':
      return { key: 'held', label: 'Spot held', tone: 'attention' };
    case 'checked_in':
      return { key: 'checked_in', label: 'Checked in', tone: 'positive' };
    case 'waitlisted':
    case 'waitlist_offered':
      return { key: 'waitlisted', label: 'Waitlisted', tone: 'info' };
    case 'withdrawn':
    case 'disqualified':
    case 'expired_hold':
      return { key: 'cancelled', label: 'Cancelled', tone: 'critical' };
    case 'no_show':
      return { key: 'no_show', label: 'No show', tone: 'critical' };
    default:
      return { key: 'registered', label: 'Registered', tone: 'positive' };
  }
}

/** What an ADMIN or DIRECTOR sees. Withdrawn and disqualified are different
 *  events with different consequences, and a director needs to tell them apart. */
export function registrationOpsStatus(status: string): StatusView {
  switch (status) {
    case 'held':
      return { key: 'held', label: 'Spot held', tone: 'attention' };
    case 'registered':
      return { key: 'registered', label: 'Registered', tone: 'positive' };
    case 'checked_in':
      return { key: 'checked_in', label: 'Checked in', tone: 'positive' };
    case 'withdrawn':
      return { key: 'withdrawn', label: 'Withdrawn', tone: 'muted' };
    case 'disqualified':
      return { key: 'disqualified', label: 'Disqualified', tone: 'critical' };
    case 'no_show':
      return { key: 'no_show', label: 'No show', tone: 'critical' };
    case 'substitute':
      return { key: 'substitute', label: 'Substitute', tone: 'info' };
    case 'waitlisted':
      return { key: 'waitlisted', label: 'Waitlisted', tone: 'info' };
    case 'waitlist_offered':
      return { key: 'waitlist_offered', label: 'Offered a spot', tone: 'attention' };
    case 'expired_hold':
      return { key: 'expired_hold', label: 'Hold expired', tone: 'muted' };
    default:
      return { key: 'unknown', label: humanize(status), tone: 'neutral' };
  }
}

// ── Reservations ─────────────────────────────────────────────────────────────

export type ReservationDbStatus = 'held' | 'confirmed' | 'cancelled' | 'expired';

/** Court bookings. Same on both platforms -- there is no player/ops split here,
 *  because a facility manager and a player mean the same thing by "confirmed". */
export function reservationStatus(status: string): StatusView {
  switch (status) {
    case 'held':
      return { key: 'held', label: 'Hold', tone: 'attention' };
    case 'confirmed':
      return { key: 'confirmed', label: 'Confirmed', tone: 'positive' };
    case 'cancelled':
      return { key: 'cancelled', label: 'Cancelled', tone: 'critical' };
    case 'expired':
      return { key: 'expired', label: 'Expired', tone: 'muted' };
    default:
      return { key: 'unknown', label: humanize(status), tone: 'neutral' };
  }
}

/** `registration_closed` -> `Registration closed`. For statuses we have not
 *  enumerated, so an unknown value degrades to something readable rather than
 *  to a blank or a raw snake_case token. */
function humanize(status: string): string {
  if (!status) return 'Unknown';
  const spaced = status.replace(/_/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
