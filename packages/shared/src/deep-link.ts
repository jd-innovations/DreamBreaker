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
  // Entity destinations — one specific thing, addressed by id.
  | "conversation"
  | "group"
  | "tournament"
  | "community"
  | "marketplace"
  | "booking"
  | "coach_offer"
  | "claim"
  | "review"
  // Section destinations — a screen that is the same screen for everyone who
  // opens it. See `idMode` below for why these exist.
  | "wallet"
  | "stats"
  | "membership"
  | "profile"
  | "matchmaking"
  | "games";

type RootSpec = {
  type: DeepLinkType;
  requiresAuth: boolean;
  /**
   * May an admin broadcast point here? Only routes that mean the same thing to
   * every recipient. A conversation, booking, claim or review belongs to one
   * person — broadcast it and everyone else lands on an error.
   */
  broadcastable: boolean;
  /**
   * Whether this root takes an id.
   *
   *   "required"  the original rule: /tournament with no id is nothing.
   *   "none"      a SECTION — /stats, /profile. The screen IS the destination.
   *   "optional"  both spellings mean something: /wallet is the wallet,
   *               /wallet/<id> is one item in it.
   *
   * Sections were added 2026-09-23. The rule used to be "a root with no id is
   * null: there is no 'all tournaments' destination, and landing on one would
   * be a dead end" — correct for entities, wrong for screens. 17 of 35 enabled
   * notification automations pointed at /wallet, /stats, /membership-settings,
   * /profile or /matchmaking, and every one of those taps did NOTHING: the
   * resolver returned null and the handler logged "no supported route". The
   * reasoning behind the old rule still holds for entity roots, which is why
   * this is per-root rather than a blanket relaxation.
   */
  idMode: "required" | "none" | "optional";
};

/** URL root → what it opens. The root is the first path segment. */
export const DEEP_LINK_ROOTS: Readonly<Record<string, RootSpec>> = {
  conversation: { type: "conversation", requiresAuth: true, broadcastable: false, idMode: "required" },
  groups: { type: "group", requiresAuth: true, broadcastable: true, idMode: "required" },
  tournament: { type: "tournament", requiresAuth: false, broadcastable: true, idMode: "required" },
  community: { type: "community", requiresAuth: false, broadcastable: true, idMode: "required" },
  marketplace: { type: "marketplace", requiresAuth: false, broadcastable: true, idMode: "required" },
  booking: { type: "booking", requiresAuth: true, broadcastable: false, idMode: "required" },
  // Only /coach/offers/<id>. A bare /coach/<id> does not resolve.
  coach: { type: "coach_offer", requiresAuth: true, broadcastable: true, idMode: "required" },
  claim: { type: "claim", requiresAuth: false, broadcastable: false, idMode: "required" },
  // requiresAuth: the invitation belongs to one person, and
  // resolve_review_invitation refuses a token that is not theirs. Sending an
  // unauthenticated visitor to the form would only fail at submit.
  review: { type: "review", requiresAuth: true, broadcastable: false, idMode: "required" },

  // ── Sections ───────────────────────────────────────────────────────────────
  // Every one requires auth: these are a signed-in person's own screens, and
  // there is nothing meaningful to show a stranger. None is broadcastable —
  // not because a broadcast to "your wallet" is nonsense, but because
  // BROADCAST_DESTINATION_PATTERN (mirrored in SQL) accepts entity roots only,
  // and claiming otherwise here would be a lie the composer cannot honour.
  wallet: { type: "wallet", requiresAuth: true, broadcastable: false, idMode: "optional" },
  stats: { type: "stats", requiresAuth: true, broadcastable: false, idMode: "none" },
  membership: { type: "membership", requiresAuth: true, broadcastable: false, idMode: "none" },
  profile: { type: "profile", requiresAuth: true, broadcastable: false, idMode: "none" },
  // /matchmaking, plus /matchmaking/connections and /matchmaking/requests —
  // "you matched" and "someone liked you" are different screens. An unknown
  // id falls back to the main screen rather than failing (see the mobile HREF
  // map); the alternative is a dead tap, which is what this change is fixing.
  matchmaking: { type: "matchmaking", requiresAuth: true, broadcastable: false, idMode: "optional" },
  games: { type: "games", requiresAuth: true, broadcastable: false, idMode: "none" },
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
  if (!root) return null;

  // Own-property only: "constructor" or "toString" must not resolve.
  if (!Object.prototype.hasOwnProperty.call(DEEP_LINK_ROOTS, root)) return null;
  const spec = DEEP_LINK_ROOTS[root];

  if (root === "coach") {
    if (id !== "offers" || !raw[2]) return null;
    return { type: spec.type, id: safeDecode(raw[2]), requiresAuth: spec.requiresAuth };
  }

  // A section takes no id, and a URL that supplies one is NOT that section —
  // "/stats/whatever" is somebody's guess, not a route, and resolving it to
  // /stats would silently swallow the difference.
  if (spec.idMode === "none") {
    if (id) return null;
    return { type: spec.type, id: "", requiresAuth: spec.requiresAuth };
  }

  if (spec.idMode === "optional") {
    // Anything past the second segment means the URL is not one this app
    // knows, so it is refused rather than truncated to something it isn't.
    if (raw.length > 2) return null;
    return { type: spec.type, id: id ?? "", requiresAuth: spec.requiresAuth };
  }

  if (!id) return null;
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
