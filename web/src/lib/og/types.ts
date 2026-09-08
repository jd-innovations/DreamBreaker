export const APP_ORIGIN = "https://pickleballapp.app";

export type OgEntityType =
  | "tournament"
  | "community"
  | "marketplace"
  | "group"
  | "coach"
  | "facility";

export const OG_ENTITY_TYPES: readonly OgEntityType[] = [
  "tournament",
  "community",
  "marketplace",
  "group",
  "coach",
  "facility",
];

// The canonical share path per entity — matches apps/mobile/src/lib/appLinks.ts
// exactly. Kept here (not imported from mobile) since web and mobile are
// separate deploys; the mapping is duplicated on purpose and small enough
// that drift would be caught immediately by the redirect/route tests.
export const OG_CANONICAL_PATH: Record<OgEntityType, (id: string) => string> = {
  tournament: (id) => `/tournament/${id}`,
  community: (id) => `/community/${id}`,
  marketplace: (id) => `/marketplace/${id}`,
  group: (id) => `/groups/${id}`,
  coach: (id) => `/coach/${id}`,
  facility: (id) => `/facility/${id}`,
};

// What a found, public, shareable row renders as. `imageUrl` is the entity's
// own cover photo when it has one; null means "no cover photo", not "hide the
// image" — callers fall back to the dynamic /api/og image in that case.
export interface OgPayload {
  entityType: OgEntityType;
  id: string;
  title: string;
  description: string;
  imageUrl: string | null;
  /** Short line under the title on the generated fallback image, e.g. "Sat, Oct 4 · Bradenton, FL". */
  detailLine: string | null;
  ogType: "website" | "profile";
}
