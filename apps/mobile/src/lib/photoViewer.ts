import { router } from 'expo-router';

/**
 * Shared entry point to the full-screen photo viewer (src/app/photo-viewer.tsx).
 *
 * Lives here rather than in any one screen because three surfaces now open the
 * same viewer — the group feed, the group photo grid and chat — and the param
 * encoding has to agree across all of them.
 *
 * A single URL goes over bare; a gallery goes as JSON with the tapped index, so
 * the viewer's own tap-to-advance walks the whole set instead of dead-ending on
 * the photo that was tapped. The viewer accepts both forms.
 */
export function openPhotoViewer(urls: string[], index = 0, title?: string): void {
  const clean = urls.filter((u): u is string => typeof u === 'string' && u.length > 0);
  if (clean.length === 0) return;

  router.push({
    pathname: '/photo-viewer',
    params: {
      urls: clean.length === 1 ? clean[0] : JSON.stringify(clean),
      index: String(Math.max(0, Math.min(clean.length - 1, index))),
      ...(title ? { title } : {}),
    },
  } as never);
}

/**
 * Fits a photo's real aspect ratio into bounds a given surface can live with.
 *
 * Every surface that shows a user-supplied photo faces the same problem: the
 * shapes are whatever the camera roll holds, and an unbounded aspect ratio
 * means a 9:16 screenshot either eats the viewport or, if the box is fixed,
 * gets centre-cropped to nonsense. Clamping keeps the common cases honest and
 * caps the extremes, and the full frame is always one tap away in the viewer,
 * which renders `contain`.
 *
 * Bounds belong to the caller — a chat bubble and a feed card tolerate very
 * different heights — so this only does the clamping, not the deciding.
 */
export function clampAspect(aspect: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(aspect) || aspect <= 0) return fallback;
  return Math.max(min, Math.min(max, aspect));
}
