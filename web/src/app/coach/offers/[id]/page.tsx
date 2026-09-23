import { permanentRedirect } from "next/navigation";

/**
 * /coach/offers/<id> is the deep-link root the app registers (see
 * DEEP_LINK_ROOTS in packages/shared/src/deep-link.ts — "Only
 * /coach/offers/<id>"), so links already in the wild use this spelling.
 *
 * The lesson page itself lives at /lessons/<id>, matching the app's own route
 * and the discovery surface. Rather than maintain two pages that drift, this
 * one permanently redirects: the old links keep working, crawlers consolidate
 * on the canonical URL, and there is one place to change a lesson's layout.
 *
 * This replaced a "open in the app" stub — the offer is now a real web page.
 */
export default async function CoachOfferRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  permanentRedirect(`/lessons/${encodeURIComponent(id)}`);
}
