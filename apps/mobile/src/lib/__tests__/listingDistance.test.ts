import { describe, it, expect } from 'vitest';
import {
  filterListingsByRadius,
  haversineMiles,
  type ListingCoordinates,
} from '../marketplace/listingDistance';

// Phase 0 of MARKETPLACE_MAP_AUDIT.md §4.2. The defect these cover: a listing
// with null coordinates was excluded once a radius was picked, and since NO
// listing in production has coordinates, every radius emptied the grid.

type Row = ListingCoordinates & { id: string };

function listing(id: string, lat: number | null, lng: number | null): Row {
  return { id, location_lat: lat, location_lng: lng };
}

// Lakewood Ranch — the app's FALLBACK_LOCATION (src/lib/location.ts).
const ORIGIN = { lat: 27.4496, lng: -82.3787 };

describe('haversineMiles', () => {
  it('is zero for a point against itself', () => {
    expect(haversineMiles(ORIGIN.lat, ORIGIN.lng, ORIGIN.lat, ORIGIN.lng)).toBe(0);
  });

  it('is symmetric', () => {
    const a = haversineMiles(27.4496, -82.3787, 27.3364, -82.5307);
    const b = haversineMiles(27.3364, -82.5307, 27.4496, -82.3787);
    expect(a).toBeCloseTo(b, 10);
  });

  it('matches a known distance: Lakewood Ranch to Sarasota, ~11 mi', () => {
    // Straight-line, so this is deliberately loose — it is a sanity check on
    // the formula and the earth radius constant, not a geodesy assertion.
    const miles = haversineMiles(27.4496, -82.3787, 27.3364, -82.5307);
    expect(miles).toBeGreaterThan(9);
    expect(miles).toBeLessThan(13);
  });

  it('handles crossing the equator and the prime meridian', () => {
    expect(haversineMiles(1, 1, -1, -1)).toBeGreaterThan(0);
  });
});

describe('filterListingsByRadius — the §4.2 regression', () => {
  it('KEEPS listings with null coordinates instead of dropping them', () => {
    const rows = [listing('no-coords', null, null)];
    expect(filterListingsByRadius(rows, ORIGIN, 5).map((r) => r.id)).toEqual(['no-coords']);
  });

  it('reproduces the production shape: every listing un-located, radius picked', () => {
    // Production on 2026-09-08: 2 listings, 1 active, 0 with coordinates.
    // Under the old rule this returned []. The grid must not empty itself.
    const rows = [listing('a', null, null), listing('b', null, null)];
    for (const radius of [5, 10, 25, 50]) {
      expect(filterListingsByRadius(rows, ORIGIN, radius)).toHaveLength(2);
    }
  });

  it('treats a half-populated coordinate pair as un-located, not as 0,0', () => {
    // Guards against a null lng being coerced to 0, which would place the
    // listing in the Gulf of Guinea and exclude it from every sane radius.
    const rows = [listing('lat-only', 27.4496, null), listing('lng-only', null, -82.3787)];
    expect(filterListingsByRadius(rows, ORIGIN, 5)).toHaveLength(2);
  });
});

describe('filterListingsByRadius — distance filtering still works', () => {
  const near = listing('near', 27.4496, -82.3787); // 0 mi
  const mid = listing('mid', 27.3364, -82.5307); // ~11 mi
  const far = listing('far', 25.7617, -80.1918); // Miami, ~180 mi
  const rows = [near, mid, far];

  it('excludes located listings beyond the radius', () => {
    expect(filterListingsByRadius(rows, ORIGIN, 5).map((r) => r.id)).toEqual(['near']);
  });

  it('widens as the radius grows', () => {
    expect(filterListingsByRadius(rows, ORIGIN, 25).map((r) => r.id)).toEqual(['near', 'mid']);
    expect(filterListingsByRadius(rows, ORIGIN, 500).map((r) => r.id)).toEqual([
      'near',
      'mid',
      'far',
    ]);
  });

  it('keeps un-located listings alongside located ones', () => {
    const mixed = [...rows, listing('unknown', null, null)];
    expect(filterListingsByRadius(mixed, ORIGIN, 5).map((r) => r.id)).toEqual(['near', 'unknown']);
  });

  it('preserves input order', () => {
    const mixed = [far, listing('unknown', null, null), near];
    expect(filterListingsByRadius(mixed, ORIGIN, 500).map((r) => r.id)).toEqual([
      'far',
      'unknown',
      'near',
    ]);
  });
});

describe('filterListingsByRadius — pass-through cases', () => {
  const rows = [listing('a', 25.7617, -80.1918), listing('b', null, null)];

  it('returns the same array reference when no radius is chosen', () => {
    expect(filterListingsByRadius(rows, ORIGIN, null)).toBe(rows);
  });

  it('returns the same array reference when the origin is unknown', () => {
    // Location permission denied and no fallback resolved yet.
    expect(filterListingsByRadius(rows, null, 5)).toBe(rows);
  });

  it('handles an empty list', () => {
    expect(filterListingsByRadius([], ORIGIN, 5)).toEqual([]);
  });
});
