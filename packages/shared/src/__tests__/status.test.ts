import { describe, it, expect } from 'vitest';
import {
  tournamentPlayerStatus, tournamentOpsStatus,
  registrationPlayerStatus, registrationOpsStatus,
  reservationStatus,
} from '../status';

describe('tournamentPlayerStatus — mobile’s collapse, preserved', () => {
  it('shows a closed registration as Full while the event is still ahead', () => {
    expect(tournamentPlayerStatus('registration_closed', false))
      .toMatchObject({ key: 'full', label: 'Full' });
  });

  // The judgement the old mobile mapper carried, and the reason `finished`
  // exists: a past-dated closed tournament read as FULL invites someone to
  // wait for a spot in an event that is over.
  it('shows a past-dated closed registration as Completed', () => {
    expect(tournamentPlayerStatus('registration_closed', true))
      .toMatchObject({ key: 'completed', label: 'Completed' });
  });

  it('keeps in_progress reading as Open for players (decision 2026-09-16)', () => {
    expect(tournamentPlayerStatus('in_progress', false)).toMatchObject({ key: 'open' });
    expect(tournamentPlayerStatus('in_progress', true)).toMatchObject({ key: 'completed' });
  });

  it('falls back to Upcoming for statuses it does not enumerate', () => {
    expect(tournamentPlayerStatus('approved')).toMatchObject({ key: 'upcoming' });
    expect(tournamentPlayerStatus('published')).toMatchObject({ key: 'upcoming' });
  });
});

describe('tournamentOpsStatus — never collapsed', () => {
  it('keeps the distinctions a director needs', () => {
    expect(tournamentOpsStatus('in_progress').label).toBe('In progress');
    expect(tournamentOpsStatus('registration_closed').label).toBe('Registration closed');
    expect(tournamentOpsStatus('approved').label).toBe('Approved');
    expect(tournamentOpsStatus('published').label).toBe('Published');
  });

  // Web's director page rendered a blank label and a missing colour class for
  // anything it had not enumerated.
  it('never returns a blank label', () => {
    for (const s of ['approved', 'published', 'something_new', '']) {
      expect(tournamentOpsStatus(s).label.length).toBeGreaterThan(0);
    }
    expect(tournamentOpsStatus('something_new').label).toBe('Something new');
  });

  it('gives every enum value exactly one label', () => {
    const all = [
      'draft', 'pending_approval', 'approved', 'published', 'open',
      'filling_fast', 'registration_closed', 'in_progress', 'completed', 'cancelled',
    ];
    const labels = all.map(s => tournamentOpsStatus(s).label);
    expect(new Set(labels).size).toBe(all.length);
  });
});

describe('registrationPlayerStatus', () => {
  it('collapses withdrawn, disqualified and expired holds to Cancelled', () => {
    for (const s of ['withdrawn', 'disqualified', 'expired_hold']) {
      expect(registrationPlayerStatus(s)).toMatchObject({ key: 'cancelled' });
    }
  });

  it('collapses both waitlist states', () => {
    expect(registrationPlayerStatus('waitlisted')).toMatchObject({ key: 'waitlisted' });
    expect(registrationPlayerStatus('waitlist_offered')).toMatchObject({ key: 'waitlisted' });
  });

  // The one correction to mobile's mapper: `held` previously fell through the
  // default and read as "Registered", which is wrong in the direction that
  // costs someone their place.
  it('does not call a held spot registered', () => {
    expect(registrationPlayerStatus('held')).toMatchObject({ key: 'held' });
    expect(registrationPlayerStatus('held').label).not.toMatch(/registered/i);
  });
});

describe('registrationOpsStatus', () => {
  it('separates withdrawn from disqualified', () => {
    expect(registrationOpsStatus('withdrawn').label).toBe('Withdrawn');
    expect(registrationOpsStatus('disqualified').label).toBe('Disqualified');
    expect(registrationOpsStatus('withdrawn').tone)
      .not.toBe(registrationOpsStatus('disqualified').tone);
  });

  it('gives every enum value exactly one label', () => {
    const all = [
      'held', 'registered', 'checked_in', 'withdrawn', 'disqualified',
      'no_show', 'substitute', 'waitlisted', 'waitlist_offered', 'expired_hold',
    ];
    const labels = all.map(s => registrationOpsStatus(s).label);
    expect(new Set(labels).size).toBe(all.length);
  });
});

describe('reservationStatus', () => {
  it('covers every enum value and degrades readably', () => {
    expect(reservationStatus('held')).toMatchObject({ key: 'held' });
    expect(reservationStatus('confirmed')).toMatchObject({ tone: 'positive' });
    expect(reservationStatus('cancelled')).toMatchObject({ tone: 'critical' });
    expect(reservationStatus('expired')).toMatchObject({ tone: 'muted' });
    expect(reservationStatus('')).toMatchObject({ label: 'Unknown' });
  });
});
