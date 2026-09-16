// The single source of truth for which remote hosts next/image is allowed to
// optimize. next.config.ts's `images.remotePatterns` is GENERATED from this
// list, and SafeImage (components/shared/safe-image.tsx) checks a URL against
// it before ever rendering <Image>.
//
// WHY THIS EXISTS, urgently: found 2026-09-16 that every one of Phase 3's
// `<Image src={cover_img_url}>` sites (WEB_PERFORMANCE_AUDIT.md F2) rendered a
// director-controlled free-text field straight through next/image with no
// host check. next/image THROWS at render time for a host outside
// remotePatterns -- for a client component, that is a React render error, not
// a broken-image icon. Confirmed live in production data: one real tournament
// ("Test Hero", status registration_closed -- not draft) has
// cover_img_url on hartru.com, a host nowhere in remotePatterns. That
// tournament's card was one promote away from crashing the public tournaments
// list, the landing page's featured section, and its own detail page.
//
// Before this file, next.config.ts's remotePatterns and every call site's
// assumption of "this is optimizable" were two unconnected things that had to
// be kept in sync by hand -- which is exactly how this gap opened. Now there
// is one list, and a component that actually checks it instead of assuming.

export const OPTIMIZABLE_IMAGE_HOSTS = [
  "images.unsplash.com",
  "images.pexels.com",
  // Every avatar, marketplace photo, and facility photo actually lives here.
  // Exact hostname, not a `*.supabase.co` wildcard -- see lib/supabase/env.ts
  // for why this project spells out hosts exactly rather than pattern-matching
  // them.
  "fbzetvkbhneptvfruilw.supabase.co",
  // Sponsor logos on the marketing footer carousel -- always this one host,
  // only the per-sponsor path varies.
  "logo.clearbit.com",
] as const;

/**
 * Whether next/image can safely optimize this src.
 *
 * A relative path (no scheme) is always safe -- it is served from this app's
 * own origin (local assets under /public, or same-origin API routes), which
 * next/image handles regardless of remotePatterns.
 *
 * Anything that fails to parse as a URL is NOT safe. A malformed string
 * reaching next/image would throw there too, and returning false here routes
 * it to the plain-<img>-with-broken-src fallback instead, which degrades to a
 * missing image rather than a crashed page.
 */
export function isOptimizableImageUrl(src: string | null | undefined): boolean {
  if (!src) return false;
  if (src.startsWith("/")) return true;
  try {
    const { hostname } = new URL(src);
    return (OPTIMIZABLE_IMAGE_HOSTS as readonly string[]).includes(hostname);
  } catch {
    return false;
  }
}
