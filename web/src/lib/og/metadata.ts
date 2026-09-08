import type { Metadata } from "next";
import { APP_ORIGIN, OG_CANONICAL_PATH, type OgEntityType, type OgPayload } from "./types";

const GENERIC_TITLE = "Pickleball App";
const GENERIC_DESCRIPTION =
  "Compete in elite pickleball tournaments. Find partners. Hold your spot. Earn your rank.";

const ENTITY_SUFFIX: Record<OgEntityType, string> = {
  tournament: "Tournament",
  community: "Community Play",
  marketplace: "Marketplace",
  group: "Group",
  coach: "Coach",
  facility: "Facility",
};

function fallbackImage(entityType: OgEntityType, id: string): string {
  return `${APP_ORIGIN}/api/og/${entityType}/${encodeURIComponent(id)}`;
}

/**
 * Builds the page `Metadata` for one shared entity. `payload` is whatever
 * fetchOgPayload returned — `null` means not found/private/inactive/
 * cancelled/deleted, and gets the same generic, safe metadata every route
 * uses for that case. The canonical path is still the one the visitor
 * requested either way; it never reveals whether the id resolved to a real
 * row.
 */
export function buildEntityMetadata(
  entityType: OgEntityType,
  id: string,
  payload: OgPayload | null,
): Metadata {
  const canonicalPath = OG_CANONICAL_PATH[entityType](id);
  const canonicalUrl = `${APP_ORIGIN}${canonicalPath}`;

  if (!payload) {
    const image = fallbackImage(entityType, id);
    return {
      title: `${GENERIC_TITLE} — ${ENTITY_SUFFIX[entityType]}`,
      description: GENERIC_DESCRIPTION,
      alternates: { canonical: canonicalUrl },
      openGraph: {
        title: GENERIC_TITLE,
        description: GENERIC_DESCRIPTION,
        url: canonicalUrl,
        type: "website",
        images: [{ url: image, width: 1200, height: 630 }],
      },
      twitter: {
        card: "summary_large_image",
        title: GENERIC_TITLE,
        description: GENERIC_DESCRIPTION,
        images: [image],
      },
    };
  }

  const title = `${payload.title} · ${GENERIC_TITLE}`;
  const image = payload.imageUrl ?? fallbackImage(entityType, id);

  return {
    title,
    description: payload.description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title: payload.title,
      description: payload.description,
      url: canonicalUrl,
      type: payload.ogType,
      images: [{ url: image, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: payload.title,
      description: payload.description,
      images: [image],
    },
  };
}
