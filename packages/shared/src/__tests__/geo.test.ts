import { describe, it, expect } from 'vitest';
import { haversineMiles, distanceMilesOrNull, formatMiles } from '../geo';

// Real places, so a wrong Earth radius or a swapped lat/lng shows up as an
// obviously wrong number rather than a plausible one.
const BRADENTON = { lat: 27.4989, lng: -82.5748 };
const TAMPA = { lat: 27.9506, lng: -82.4572 };
const SAME_BUILDING = { lat: 27.4989, lng: -82.5748 };

describe('haversineMiles', () => {
  it('measures a known distance', () => {
    // Bradenton → Tampa is about 32 miles.
    expect(haversineMiles(BRADENTON, TAMPA)).toBeGreaterThan(28);
    expect(haversineMiles(BRADENTON, TAMPA)).toBeLessThan(36);
  });

  it('is zero for the same point', () => {
    expect(haversineMiles(BRADENTON, SAME_BUILDING)).toBe(0);
  });

  it('is symmetric', () => {
    expect(haversineMiles(BRADENTON, TAMPA)).toBeCloseTo(haversineMiles(TAMPA, BRADENTON), 6);
  });
});

describe('distanceMilesOrNull', () => {
  it('returns null when either side lacks coordinates', () => {
    // The whole point. Web's matchmaker read a missing distance as 999 miles
    // and silently emptied the deck the moment anyone picked a radius.
    expect(distanceMilesOrNull(null, TAMPA)).toBeNull();
    expect(distanceMilesOrNull(BRADENTON, null)).toBeNull();
    expect(distanceMilesOrNull({ lat: null, lng: null }, TAMPA)).toBeNull();
    expect(distanceMilesOrNull(BRADENTON, { lat: 27.9, lng: undefined })).toBeNull();
  });

  it('measures when both sides have coordinates', () => {
    const miles = distanceMilesOrNull(BRADENTON, TAMPA);
    expect(miles).not.toBeNull();
    expect(miles!).toBeGreaterThan(28);
  });

  it('treats zero as a real distance, not as missing', () => {
    expect(distanceMilesOrNull(BRADENTON, SAME_BUILDING)).toBe(0);
  });
});

describe('formatMiles', () => {
  it('rounds whole miles', () => {
    expect(formatMiles(12.4)).toBe('12 mi');
    expect(formatMiles(1)).toBe('1 mi');
  });

  it('keeps a decimal under a mile, where rounding would say "0 mi"', () => {
    expect(formatMiles(0.42)).toBe('0.4 mi');
  });

  it('formats zero rather than dropping it', () => {
    expect(formatMiles(0)).toBe('0.0 mi');
  });

  it('returns null for absent or nonsense input', () => {
    expect(formatMiles(null)).toBeNull();
    expect(formatMiles(undefined)).toBeNull();
    expect(formatMiles(Number.NaN)).toBeNull();
    expect(formatMiles(Number.POSITIVE_INFINITY)).toBeNull();
  });
});
