/**
 * Which URLs the app can open, and which of those an admin broadcast may use.
 *
 * One list, three consumers that used to be able to drift apart:
 *
 *   - mobile's externalRouting.ts, which turns a push payload or universal
 *     link into a screen (behaviour unchanged by the move here);
 *   - the Phase 5 campaign composer, which may only offer routes an installed
 *     build can open (decision 6 of PUSH_BROADCAST_IMPLEMENTATION_PLAN.md);
 *   - the database, which validates a campaign's destination on write. SQL
 *     cannot import this file, so it carries a copy of BROADCAST_DESTINATION_PATTERN
 *     — and a test fails if the two stop matching.
 *
 * Pure: no router, no React, no platform API. That is why it can be tested.
 */

export const APP_LINK_DOMAIN = "pickleballapp.app";
export const APP_URL_SCHEME = "pickleballapp";

export type DeepLinkType =
  | "conversation"
  | "group"
  | "tournament"
  | "community"
  | "marketplace"
  | "booking"
  | "coach_offer"
  | "claim"
  | "review";

type RootSpec = {
  type: DeepLinkType;
  requiresAuth: boolean;
  /**
   * May an admin broadcast point here? Only routes that mean the same thing to
   * every recipient. A conversation, booking, claim or review belongs to one
   * person — broadcast it and everyone else lands on an error.
   */
  broadcastable: boolean;
};

/** URL root → what it opens. The root is the first path segment. */
export const DEEP_LINK_ROOTS: Readonly<Record<string, RootSpec>> = {
  conversation: { type: "conversation", requiresAuth: true, broadcastable: false },
  groups: { type: "group", requiresAuth: true, broadcastable: true },
  tournament: { type: "tournament", requiresAuth: false, broadcastable: true },
  community: { type: "community", requiresAuth: false, broadcastable: true },
  marketplace: { type: "marketplace", requiresAuth: false, broadcastable: true },
  booking: { type: "booking", requiresAuth: true, broadcastable: false },
  // Only /coach/offers/<id>. A bare /coach/<id> does not resolve.
  coach: { type: "coach_offer", requiresAuth: true, broadcastable: true },
  claim: { type: "claim", requiresAuth: false, broadcastable: false },
  // requiresAuth: the invitation belongs to one person, and
  // resolve_review_invitation refuses a token that is not theirs. Sending an
  // unauthenticated visitor to the form would only fail at submit.
  review: { type: "review", requiresAuth: true, broadcastable: false },
};

export type ResolvedDeepLink = {
  type: DeepLinkType;
  /** The decoded identifier: listing id, tournament id, invitation token… */
  id: string;
  requiresAuth: boolean;
};

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Accepts a path ("/tournament/1"), an https link on the app's own domain, or
 * the custom scheme in any of its three spellings: pickleballapp://tournament/1,
 * pickleballapp://app/tournament/1 and pickleballapp:///tournament/1.
 * Anything else — another host, another scheme — is null.
 */
function toPath(rawUrl: string): string | null {
  if (!rawUrl.trim()) return null;

  if (rawUrl.startsWith("/")) return rawUrl.split("?")[0];

  try {
    const url = new URL(rawUrl);

    if (url.protocol === "https:" && (url.hostname === APP_LINK_DOMAIN || url.hostname === `www.${APP_LINK_DOMAIN}`)) {
      return url.pathname;
    }

    if (url.protocol === `${APP_URL_SCHEME}:`) {
      if (url.hostname === "app") return url.pathname || "/";
      if (url.hostname) return `/${url.hostname}${url.pathname}`;
      return url.pathname || "/";
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * What screen a URL opens, or null. A root with no id is null: there is no
 * "all tournaments" destination, and landing on one would be a dead end.
 */
export function resolveDeepLink(rawUrl: string): ResolvedDeepLink | null {
  const path = toPath(rawUrl);
  if (path == null) return null;

  const raw = path.split("/").filter(Boolean);
  const root = raw[0] != null ? safeDecode(raw[0]) : null;
  const id = raw[1] != null ? safeDecode(raw[1]) : null;
  if (!root || !id) return null;

  // Own-property only: "constructor" or "toString" must not resolve.
  if (!Object.prototype.hasOwnProperty.call(DEEP_LINK_ROOTS, root)) return null;
  const spec = DEEP_LINK_ROOTS[root];

  if (root === "coach") {
    if (id !== "offers" || !raw[2]) return null;
    return { type: spec.type, id: safeDecode(raw[2]), requiresAuth: spec.requiresAuth };
  }

  return { type: spec.type, id, requiresAuth: spec.requiresAuth };
}

// ─── Broadcast destinations ──────────────────────────────────────────────────

/**
 * The exact shape a campaign destination must have. Deliberately narrower than
 * what resolveDeepLink accepts: absolute URLs only (a campaign is stored and
 * sent, not navigated relative to anything), the app's scheme or its exact
 * https origin, a broadcastable root, and an id made of URL-safe characters
 * only — so no encoding tricks, no query string, no fragment.
 *
 * MIRRORED in SQL by public.campaign_destination_type()
 * (20260921200000_campaign_api.sql). A test compares the two strings.
 */
export const BROADCAST_DESTINATION_PATTERN =
  "^(?:pickleballapp://(?:app/|/)?|https://pickleballapp\\.app/)(groups|tournament|community|marketplace|coach/offers)/([A-Za-z0-9-]{1,64})/?$";

const BROADCAST_ROOT_TO_TYPE: Readonly<Record<string, DeepLinkType>> = {
  groups: "group",
  tournament: "tournament",
  community: "community",
  marketplace: "marketplace",
  "coach/offers": "coach_offer",
};

export type BroadcastDestinationResult =
  | { ok: true; url: string; type: DeepLinkType; id: string }
  | { ok: false; reason: "empty" | "too_long" | "not_allowed" | "not_openable" };

/**
 * Validates a campaign destination for the composer. The database repeats the
 * check on write; this one exists so the admin sees the problem before saving.
 */
export function validateBroadcastDestination(rawUrl: string): BroadcastDestinationResult {
  const url = (rawUrl ?? "").trim();
  if (!url) return { ok: false, reason: "empty" };
  if (url.length > 500) return { ok: false, reason: "too_long" };

  const m = new RegExp(BROADCAST_DESTINATION_PATTERN).exec(url);
  if (!m) return { ok: false, reason: "not_allowed" };

  // Belt and braces: the pattern says the shape is right; this says an
  // installed build will actually open it.
  const resolved = resolveDeepLink(url);
  const type = BROADCAST_ROOT_TO_TYPE[m[1]];
  if (!resolved || resolved.type !== type) return { ok: false, reason: "not_openable" };

  return { ok: true, url, type, id: m[2] };
}

/** Roots the composer may offer, in display order. */
export const BROADCAST_DESTINATION_TYPES: readonly DeepLinkType[] = [
  "tournament", "community", "marketplace", "group", "coach_offer",
];
