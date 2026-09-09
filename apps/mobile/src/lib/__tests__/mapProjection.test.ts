import { describe, it, expect } from 'vitest';
import {
  projectToScreen,
  isWithinViewport,
  linearLatitudeErrorPx,
  NO_PADDING,
  type Region,
  type Viewport,
  type MapPadding,
} from '../spike/mapProjection';

// SPIKE — MARKETPLACE_MAP_AUDIT.md (v3) §5.1.
//
// These verify the projection is CORRECT. They cannot verify it is SMOOTH:
// frame pacing during a pinch is a device property and is covered by the
// on-device protocol in the spike screen, not here.

const VIEWPORT: Viewport = { width: 390, height: 844 }; // iPhone 14 pt

// Lakewood Ranch — the app's FALLBACK_LOCATION.
const REGION: Region = {
  latitude: 27.4496,
  longitude: -82.3787,
  latitudeDelta: 0.0922,
  longitudeDelta: 0.0421,
};

// The real values ExploreMap passes, with a ~34pt bottom inset.
const NEARBY_PADDING: MapPadding = { top: 16, right: 16, bottom: 34 + 110, left: 16 };

const center = { latitude: REGION.latitude, longitude: REGION.longitude };

describe('projectToScreen — anchoring', () => {
  it('puts the region centre at the centre of the view when unpadded', () => {
    const p = projectToScreen(center, REGION, VIEWPORT, NO_PADDING);
    expect(p.x).toBeCloseTo(VIEWPORT.width / 2, 6);
    expect(p.y).toBeCloseTo(VIEWPORT.height / 2, 6);
  });

  it('puts the region corners at the view corners, to sub-pixel tolerance', () => {
    // Longitude is exact. Latitude is deliberately NOT: the centre is the fixed
    // point of the projection (see projectToScreen), so the north/south edges
    // absorb Mercator's non-linearity. At city zoom that is ~0.07px — far below
    // anything visible, and the same approximation MapView itself makes when it
    // fits a region.
    const nw = {
      latitude: REGION.latitude + REGION.latitudeDelta / 2,
      longitude: REGION.longitude - REGION.longitudeDelta / 2,
    };
    const se = {
      latitude: REGION.latitude - REGION.latitudeDelta / 2,
      longitude: REGION.longitude + REGION.longitudeDelta / 2,
    };
    const a = projectToScreen(nw, REGION, VIEWPORT, NO_PADDING);
    const b = projectToScreen(se, REGION, VIEWPORT, NO_PADDING);

    expect(a.x).toBeCloseTo(0, 6);
    expect(b.x).toBeCloseTo(VIEWPORT.width, 6);
    expect(Math.abs(a.y - 0)).toBeLessThan(0.5);
    expect(Math.abs(b.y - VIEWPORT.height)).toBeLessThan(0.5);
  });

  it('moves north up and east right', () => {
    const north = { latitude: REGION.latitude + 0.01, longitude: REGION.longitude };
    const east = { latitude: REGION.latitude, longitude: REGION.longitude + 0.01 };
    const c = projectToScreen(center, REGION, VIEWPORT);

    expect(projectToScreen(north, REGION, VIEWPORT).y).toBeLessThan(c.y);
    expect(projectToScreen(east, REGION, VIEWPORT).x).toBeGreaterThan(c.x);
  });

  it('is monotonic in latitude and longitude', () => {
    let prevY = Infinity;
    for (let lat = REGION.latitude + 0.04; lat >= REGION.latitude - 0.04; lat -= 0.01) {
      const y = projectToScreen({ latitude: lat, longitude: REGION.longitude }, REGION, VIEWPORT).y;
      expect(y).toBeGreaterThan(prevY === Infinity ? -Infinity : prevY);
      prevY = y;
    }
  });
});

describe('projectToScreen — mapPadding (the ExploreMap case)', () => {
  it('centres the region on the PADDED rect, not the raw view', () => {
    const p = projectToScreen(center, REGION, VIEWPORT, NEARBY_PADDING);
    const expectedX =
      NEARBY_PADDING.left + (VIEWPORT.width - NEARBY_PADDING.left - NEARBY_PADDING.right) / 2;
    const expectedY =
      NEARBY_PADDING.top + (VIEWPORT.height - NEARBY_PADDING.top - NEARBY_PADDING.bottom) / 2;

    expect(p.x).toBeCloseTo(expectedX, 6);
    expect(p.y).toBeCloseTo(expectedY, 6);
  });

  it('ignoring padding would misplace the badge by a visible margin', () => {
    // This is the concrete cost of the mistake the audit called out.
    const withPad = projectToScreen(center, REGION, VIEWPORT, NEARBY_PADDING);
    const withoutPad = projectToScreen(center, REGION, VIEWPORT, NO_PADDING);
    const verticalError = Math.abs(withPad.y - withoutPad.y);

    // (top - bottom) / 2 = (16 - 144) / 2 = -64
    expect(verticalError).toBeCloseTo(64, 6);
    expect(verticalError).toBeGreaterThan(40); // unmistakable on screen
  });

  it('degrades safely when padding exceeds the viewport', () => {
    const huge: MapPadding = { top: 500, right: 300, bottom: 500, left: 300 };
    const p = projectToScreen(center, REGION, { width: 390, height: 844 }, huge);
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
  });
});

describe('projectToScreen — Mercator correctness', () => {
  it('is NOT linear in latitude: equal deltas map to unequal pixel offsets', () => {
    // The whole reason for Mercator interpolation. A linear projection would
    // make these two offsets identical.
    const up = projectToScreen(
      { latitude: REGION.latitude + 0.04, longitude: REGION.longitude },
      REGION,
      VIEWPORT,
    );
    const down = projectToScreen(
      { latitude: REGION.latitude - 0.04, longitude: REGION.longitude },
      REGION,
      VIEWPORT,
    );
    const c = projectToScreen(center, REGION, VIEWPORT);

    expect(Math.abs(c.y - up.y)).not.toBeCloseTo(Math.abs(down.y - c.y), 6);
  });

  it('the linear-vs-Mercator error is sub-pixel at city zoom', () => {
    // Reassuring, and the reason a naive implementation "looks fine" nearby.
    const near = { latitude: REGION.latitude + 0.03, longitude: REGION.longitude };
    expect(linearLatitudeErrorPx(near, REGION, VIEWPORT, NEARBY_PADDING)).toBeLessThan(1);
  });

  it('the error becomes visible when zoomed out', () => {
    // Metro/state scale — tier 3 in the marker hierarchy.
    const wide: Region = { ...REGION, latitudeDelta: 40, longitudeDelta: 40 };
    const far = { latitude: REGION.latitude + 15, longitude: REGION.longitude };
    expect(linearLatitudeErrorPx(far, wide, VIEWPORT, NEARBY_PADDING)).toBeGreaterThan(10);
  });

  it('clamps near the poles instead of returning Infinity', () => {
    const polar: Region = { latitude: 89, longitude: 0, latitudeDelta: 4, longitudeDelta: 4 };
    const p = projectToScreen({ latitude: 89.9, longitude: 0 }, polar, VIEWPORT);
    expect(Number.isFinite(p.y)).toBe(true);
  });
});

describe('isWithinViewport', () => {
  it('accepts on-screen points and rejects far-off ones', () => {
    expect(isWithinViewport({ x: 195, y: 400 }, VIEWPORT)).toBe(true);
    expect(isWithinViewport({ x: -400, y: 400 }, VIEWPORT)).toBe(false);
    expect(isWithinViewport({ x: 195, y: 3000 }, VIEWPORT)).toBe(false);
  });

  it('keeps partly-off-screen badges via slack, so they do not pop', () => {
    expect(isWithinViewport({ x: -20, y: 400 }, VIEWPORT)).toBe(true);
    expect(isWithinViewport({ x: VIEWPORT.width + 20, y: 400 }, VIEWPORT)).toBe(true);
  });
});
