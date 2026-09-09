// SPIKE — MARKETPLACE_MAP_AUDIT.md (v3) §5.1. Throwaway; delete with the branch.
//
// Projects a geographic coordinate to a screen point over a react-native-maps
// MapView, so a price badge can be an absolutely-positioned RN View instead of
// a <Marker> child. Marker children are what crashed under Fabric
// (react-native-maps#5378, fixed 2026-09-07 in ExploreMap.native.tsx), so the
// overlay must never put anything inside a <Marker>.
//
// Pure and dependency-free on purpose: this is the part of the spike that can
// be verified without a device. Frame-rate smoothness cannot be — see the
// spike screen and the run protocol.
//
// TWO THINGS NAIVE IMPLEMENTATIONS GET WRONG, both handled here:
//
//  1. Latitude is not linear on screen. Web Mercator stretches toward the
//     poles, so interpolating linearly across `latitudeDelta` puts the badge
//     progressively off its pin the further the coordinate sits from the
//     region centre. The error is small at city zoom and obvious when zoomed
//     out — exactly the "drift" the gate is watching for.
//
//  2. mapPadding shrinks the drawing area. ExploreMap sets
//     `mapPadding={{ top: 16, right: 16, bottom: barClearance + 110, left: 16 }}`,
//     and MapView centres `region` on the PADDED rect, not the raw view. Ignore
//     that and every badge sits off by half the padding difference — a
//     ~60pt vertical error with Nearby's current values.

export type LatLng = { latitude: number; longitude: number };

export type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export type Viewport = { width: number; height: number };

export type MapPadding = { top: number; right: number; bottom: number; left: number };

export const NO_PADDING: MapPadding = { top: 0, right: 0, bottom: 0, left: 0 };

export type ScreenPoint = { x: number; y: number };

/** Web Mercator y, in radians-ish units. Undefined at the poles; clamped below. */
function mercatorY(latitude: number): number {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, latitude));
  const rad = (clamped * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + rad / 2));
}

/**
 * Project `coord` to a point in the MapView's own coordinate space.
 *
 * Origin is the top-left of the MapView itself (not the padded rect), so the
 * result can be used directly as {left, top} on an absolutely-positioned child
 * of the same parent that holds the MapView.
 *
 * Returns a point even when it falls outside the viewport; callers decide what
 * to cull. `isWithinViewport` is provided for that.
 */
export function projectToScreen(
  coord: LatLng,
  region: Region,
  viewport: Viewport,
  padding: MapPadding = NO_PADDING,
): ScreenPoint {
  // The region is centred on the padded rect, so that rect is the drawing area.
  const usableWidth = viewport.width - padding.left - padding.right;
  const usableHeight = viewport.height - padding.top - padding.bottom;

  // Degenerate viewport or padding larger than the view: nothing sensible to
  // project onto. Return the padded-rect origin rather than NaN/Infinity.
  if (usableWidth <= 0 || usableHeight <= 0) {
    return { x: padding.left, y: padding.top };
  }

  // ANCHOR ON THE CENTRE, NOT THE EDGES.
  //
  // Tempting alternative: map the north edge to y=0 and the south edge to
  // y=height, then interpolate. That is wrong, and the unit tests caught it —
  // because Mercator is non-linear, mercatorY(centre) is not the midpoint of
  // mercatorY(north) and mercatorY(south), so region.latitude would land ~0.07px
  // off the centre of the padded rect at city zoom, growing with latitudeDelta.
  //
  // MapView centres the camera exactly on region.latitude/longitude and treats
  // the deltas as the approximate span. So the centre is the fixed point and the
  // edges absorb the approximation, not the other way round.
  const centerX = padding.left + usableWidth / 2;
  const centerY = padding.top + usableHeight / 2;

  // Longitude IS linear in Mercator.
  const pxPerLng = region.longitudeDelta === 0 ? 0 : usableWidth / region.longitudeDelta;
  const x = centerX + (coord.longitude - region.longitude) * pxPerLng;

  // Latitude is not — scale in Mercator space.
  const mercSpan =
    mercatorY(region.latitude + region.latitudeDelta / 2) -
    mercatorY(region.latitude - region.latitudeDelta / 2);
  const pxPerMerc = mercSpan === 0 ? 0 : usableHeight / mercSpan;
  const y = centerY - (mercatorY(coord.latitude) - mercatorY(region.latitude)) * pxPerMerc;

  return { x, y };
}

/**
 * True when the point is inside the viewport, with `slack` px of tolerance so a
 * badge that is only partly off-screen still renders instead of popping.
 */
export function isWithinViewport(point: ScreenPoint, viewport: Viewport, slack = 96): boolean {
  return (
    point.x >= -slack &&
    point.y >= -slack &&
    point.x <= viewport.width + slack &&
    point.y <= viewport.height + slack
  );
}

/**
 * How far off a linear-latitude projection would be, in pixels, for this
 * coordinate. Not used by the overlay — it exists so the spike can SHOW the
 * Mercator correction is doing something rather than assert it.
 */
export function linearLatitudeErrorPx(
  coord: LatLng,
  region: Region,
  viewport: Viewport,
  padding: MapPadding = NO_PADDING,
): number {
  const usableHeight = viewport.height - padding.top - padding.bottom;
  if (usableHeight <= 0) return 0;

  const north = region.latitude + region.latitudeDelta / 2;
  const south = region.latitude - region.latitudeDelta / 2;

  const linearFraction =
    region.latitudeDelta === 0 ? 0.5 : (north - coord.latitude) / (north - south);
  const linearY = padding.top + linearFraction * usableHeight;

  return Math.abs(projectToScreen(coord, region, viewport, padding).y - linearY);
}
