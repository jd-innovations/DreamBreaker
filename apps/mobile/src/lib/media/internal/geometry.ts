// Pure crop/resize math. No native or RN imports — safe to unit-test in plain
// Node. The transform step turns these results into manipulator actions.

import type { CropMode } from '../types';

export interface Rect {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

/** width/height ratio for a crop mode, or null when the source ratio is kept. */
export function cropRatio(mode: CropMode, aspectRatio: number | null): number | null {
  switch (mode) {
    case 'square':
      return 1;
    case '16:9':
      return 16 / 9;
    case '9:16':
      return 9 / 16;
    case 'none':
    case 'configurable':
      return aspectRatio; // 'configurable' with no caller ratio ⇒ null ⇒ preserve
    default:
      return null;
  }
}

/** Largest centred rectangle of `ratio` (=width/height) that fits w×h. */
export function centredCropRect(w: number, h: number, ratio: number): Rect {
  let cw = w;
  let ch = Math.round(w / ratio);
  if (ch > h) {
    ch = h;
    cw = Math.round(h * ratio);
  }
  return {
    originX: Math.floor((w - cw) / 2),
    originY: Math.floor((h - ch) / 2),
    width: cw,
    height: ch,
  };
}

/**
 * Resize target that caps the long edge at `max` while preserving ratio.
 * Returns null when the image already fits (never upscale).
 */
export function resizeToMax(
  w: number,
  h: number,
  max: number,
): { width: number } | { height: number } | null {
  if (Math.max(w, h) <= max) return null;
  return w >= h ? { width: max } : { height: max };
}
