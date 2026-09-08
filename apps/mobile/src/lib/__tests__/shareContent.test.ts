import { describe, it, expect } from 'vitest';
import { buildEntityShareContent } from '../shareContent';
import { APP_LINK_ORIGIN } from '../appLinks';
import type { PlayEvent } from '../supabase/playEvents';

function fakePlayEvent(overrides: Partial<PlayEvent> = {}): PlayEvent {
  return {
    id: 'evt-1',
    name: 'Saturday Open Play',
    event_type: 'open_play',
    event_date: '2026-10-04',
    start_time: '09:00:00',
    venue_name: 'Lakewood Ranch Courts',
    location: 'Lakewood Ranch Courts',
    city: 'Bradenton',
    state: 'FL',
    cover_url: null,
    organizer_id: 'org-1',
    max_players: 4,
    status: 'open',
    ...overrides,
  } as PlayEvent;
}

describe('buildEntityShareContent', () => {
  it('tournament: uses the canonical /tournament/{id} URL and includes the name', () => {
    const { message, title, url } = buildEntityShareContent({
      type: 'tournament',
      id: 'abc-123',
      name: 'Sarasota Slam',
    });
    expect(url).toBe(`${APP_LINK_ORIGIN}/tournament/abc-123`);
    expect(title).toBe('Sarasota Slam');
    expect(message).toContain('Sarasota Slam');
    expect(message).toContain(url);
  });

  it('community: delegates to createCommunityShareMessage and uses /community/{id}', () => {
    const event = fakePlayEvent();
    const { message, title, url } = buildEntityShareContent({ type: 'community', event });
    expect(url).toBe(`${APP_LINK_ORIGIN}/community/evt-1`);
    expect(title).toBe('Saturday Open Play');
    expect(message).toContain('Quick Game');
    expect(message).toContain('Saturday Open Play');
    expect(message).toContain(url);
  });

  it('community: labels each event_type correctly', () => {
    const rr = buildEntityShareContent({ type: 'community', event: fakePlayEvent({ event_type: 'round_robin' }) });
    expect(rr.message).toContain('Round Robin');

    const mt = buildEntityShareContent({ type: 'community', event: fakePlayEvent({ event_type: 'mini_tournament' }) });
    expect(mt.message).toContain('Mini Tournament');
  });

  it('marketplace: formats whole-dollar price and uses /marketplace/{id}', () => {
    const { message, url } = buildEntityShareContent({
      type: 'marketplace',
      id: 'listing-1',
      title: 'JOOLA Paddle',
      priceCents: 4599,
    });
    expect(url).toBe(`${APP_LINK_ORIGIN}/marketplace/listing-1`);
    expect(message).toContain('$46'); // Math.round(4599/100) = 46
    expect(message).toContain('JOOLA Paddle');
  });

  it('group: uses /groups/{id} (plural path) and quotes the name', () => {
    const { message, url } = buildEntityShareContent({ type: 'group', id: 'grp-1', name: 'Sunday Ballers' });
    expect(url).toBe(`${APP_LINK_ORIGIN}/groups/grp-1`);
    expect(message).toContain('"Sunday Ballers"');
  });

  it('coach: uses /coach/{id}', () => {
    const { message, url } = buildEntityShareContent({ type: 'coach', id: 'coach-1', fullName: 'Jamie Rivera' });
    expect(url).toBe(`${APP_LINK_ORIGIN}/coach/coach-1`);
    expect(message).toContain('Jamie Rivera');
  });

  it('facility: uses /facility/{id}', () => {
    const { message, url } = buildEntityShareContent({ type: 'facility', id: 'fac-1', name: 'Riverside Courts' });
    expect(url).toBe(`${APP_LINK_ORIGIN}/facility/fac-1`);
    expect(message).toContain('Riverside Courts');
  });

  it('every entity URL is a Universal-Link-shaped https URL, never a bare path', () => {
    const cases = [
      buildEntityShareContent({ type: 'tournament', id: 'x', name: 'n' }),
      buildEntityShareContent({ type: 'marketplace', id: 'x', title: 't', priceCents: 100 }),
      buildEntityShareContent({ type: 'group', id: 'x', name: 'n' }),
      buildEntityShareContent({ type: 'coach', id: 'x', fullName: 'n' }),
      buildEntityShareContent({ type: 'facility', id: 'x', name: 'n' }),
    ];
    for (const c of cases) {
      expect(c.url.startsWith(`${APP_LINK_ORIGIN}/`)).toBe(true);
    }
  });
});
