import { describe, it, expect } from 'vitest';
import {
  buildPublicProfile, PUBLIC_PROFILE_COLUMNS,
  type PublicProfileRow, type ProfileViewer, type BuildPublicProfileInput,
} from '../public-profile';

const ROW: PublicProfileRow = {
  id: 'p1',
  full_name: 'Bryce Harper',
  handle: 'bryce',
  avatar_url: null,
  bio: '  Baseball player  ',
  dupr: null,
  dupr_verified: false,
  self_rating: '3.3',
  skill_level: '3.0-3.5',
  play_style: ['soft_game'],
  preferred_formats: ['mixed_doubles', 'round_robin'],
  play_intensity: 'recreational',
  availability: 'Sat',
  availability_schedule: { sat: ['morning'] },
  location_city: 'Palmetto',
  location_state: 'FL',
  location_lat: 27.5214,
  location_lng: -82.5726,
  looking_status: 'actively_looking',
  gender: 'male',
  hand: 'right',
  home_court_id: 'f1',
  facilities: { name: 'Esplanade GCC', city: 'Lakewood Ranch', state: 'FL' },
};

const VIEWER: ProfileViewer = {
  id: 'me',
  dupr: 3.5,
  availability_schedule: { sat: ['morning'], wed: ['evening'] },
  location_lat: 27.4989,
  location_lng: -82.5748,
};

function build(over: Partial<BuildPublicProfileInput> = {}) {
  return buildPublicProfile({
    row: ROW,
    viewer: VIEWER,
    relationship: 'none',
    age: 34,
    connectionCount: 3,
    eventsPlayed: 18,
    partnersPlayed: 1,
    activity: [],
    groups: [],
    listings: [],
    ...over,
  });
}

describe('PUBLIC_PROFILE_COLUMNS', () => {
  it('never asks for the two columns the client cannot read', () => {
    // profiles RLS allows every row, so these are not in the client grant at
    // all (20260921150000). Selecting one fails the WHOLE query.
    expect(PUBLIC_PROFILE_COLUMNS).not.toMatch(/\bemail\b/);
    expect(PUBLIC_PROFILE_COLUMNS).not.toMatch(/\bdate_of_birth\b/);
  });
});

describe('buildPublicProfile', () => {
  it('labels every enum, never leaking a raw column value', () => {
    const p = build();
    expect(p.lookingFor).toBe('Actively looking');   // not "actively_looking"
    expect(p.hand).toBe('Right-handed');             // not "right Hand"
    expect(p.gender).toBe('Male');
    expect(p.intensity).toBe('Recreational');
    expect(p.formats).toEqual(['Mixed doubles', 'Round robin']);
  });

  it('resolves a self-rating as self, not as DUPR', () => {
    const p = build();
    expect(p.ratingSource).toBe('self');
    expect(p.ratingValue).toBeCloseTo(3.3);
  });

  it('measures real distance from the viewer', () => {
    const p = build();
    expect(p.distanceMi).not.toBeNull();
    expect(p.distanceMi!).toBeGreaterThan(0);
    expect(p.distanceMi!).toBeLessThan(5);
  });

  it('reports no distance rather than zero when the viewer has no location', () => {
    // The bug this replaces hardcoded 0, so every profile claimed to be in the
    // same place as the viewer.
    const p = build({ viewer: { ...VIEWER!, location_lat: null, location_lng: null } });
    expect(p.distanceMi).toBeNull();
  });

  it('prefers shared availability over the player’s own', () => {
    const p = build();
    expect(p.availabilityIsShared).toBe(true);
    expect(p.availabilityLabel).toMatch(/Saturday/i);
  });

  it('falls back to their own availability when the viewer has none', () => {
    const p = build({ viewer: { ...VIEWER!, availability_schedule: {} } });
    expect(p.availabilityIsShared).toBe(false);
    expect(p.availabilityLabel).toBeTruthy();
  });

  it('trims a padded bio and nulls an empty one', () => {
    expect(build().bio).toBe('Baseball player');
    expect(build({ row: { ...ROW, bio: '   ' } }).bio).toBeNull();
  });

  it('names an unnamed player rather than rendering blank', () => {
    expect(build({ row: { ...ROW, full_name: null } }).name).toBe('Unnamed player');
  });

  describe('match percentage', () => {
    it('is computed against another player', () => {
      expect(build().matchPct).not.toBeNull();
    });

    it('is absent on your own profile', () => {
      expect(build({ relationship: 'self' }).matchPct).toBeNull();
    });

    it('is absent when signed out', () => {
      expect(build({ viewer: null }).matchPct).toBeNull();
    });
  });

  describe('stats', () => {
    it('leads with the two counts that always exist', () => {
      const keys = build().stats.map((s) => s.key);
      expect(keys.slice(0, 2)).toEqual(['events', 'partners']);
    });

    it('shows connections instead of match when there is no viewer', () => {
      const keys = build({ viewer: null }).stats.map((s) => s.key);
      expect(keys).toContain('connections');
      expect(keys).not.toContain('match');
    });

    it('never contains a medals cell', () => {
      // Dropped 2026-09-21: it was hardcoded "—" and no medal data exists.
      expect(build().stats.map((s) => s.key)).not.toContain('medals');
    });

    describe('reviews are gated, and the gate is deliberate', () => {
      const reviews = { displayEnabled: true, minCount: 3, averageRating: 4.8, reviewCount: 12 };

      it('shows when display is on and the count clears the minimum', () => {
        const cell = build({ reviews }).stats.find((s) => s.key === 'reviews');
        expect(cell).toBeDefined();
        expect(cell!.value).toBe('4.8');
        expect(cell!.label).toBe('Reviews (12)');
      });

      it('hides when the platform switch is off — the state today', () => {
        const p = build({ reviews: { ...reviews, displayEnabled: false } });
        expect(p.stats.find((s) => s.key === 'reviews')).toBeUndefined();
      });

      it('hides below the minimum count — one opinion is not an average', () => {
        const p = build({ reviews: { ...reviews, reviewCount: 2 } });
        expect(p.stats.find((s) => s.key === 'reviews')).toBeUndefined();
      });

      it('hides rather than showing a dash when there are none at all', () => {
        const p = build({ reviews: { ...reviews, reviewCount: 0, averageRating: null } });
        expect(p.stats.find((s) => s.key === 'reviews')).toBeUndefined();
      });
    });
  });

  it('sorts activity newest first and caps it', () => {
    const activity = Array.from({ length: 8 }, (_, i) => ({
      name: `Event ${i}`,
      date: `2026-0${(i % 9) + 1}-01`,
      kind: 'community' as const,
    }));
    const p = build({ activity });
    expect(p.activity).toHaveLength(5);
    expect(p.activity[0].date >= p.activity[1].date).toBe(true);
  });
});
