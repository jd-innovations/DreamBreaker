import { router } from 'expo-router';
import { resolveDeepLink, type DeepLinkType } from '@shared/deep-link';
import { appRoutes } from '@/lib/appLinks';

// Which URLs open which screen is defined once, in packages/shared, because
// the push-broadcast composer and the database's campaign validation need the
// same answer (PUSH_BROADCAST_IMPLEMENTATION_PLAN.md, Phase 2). This file only
// maps a resolved destination to an expo-router href.
export type ExternalDestinationType = DeepLinkType;

export type ExternalDestination = {
  href: string;
  type: ExternalDestinationType;
  requiresAuth: boolean;
};

const HREF: Record<DeepLinkType, (id: string) => string> = {
  conversation: appRoutes.conversation,
  group: appRoutes.group,
  tournament: appRoutes.tournament,
  community: appRoutes.communityEvent,
  marketplace: appRoutes.marketplaceListing,
  booking: appRoutes.booking,
  coach_offer: appRoutes.coachOffer,
  claim: appRoutes.claim,
  review: appRoutes.review,

  // Sections. The id is "" for all but wallet and matchmaking, which is why
  // each of these takes the argument and most ignore it.
  wallet: (id) => (id ? appRoutes.walletItem(id) : appRoutes.wallet()),
  stats: () => appRoutes.stats(),
  membership: () => appRoutes.membership(),
  profile: () => appRoutes.profileTab(),
  games: () => appRoutes.games(),
  // An unrecognised sub-screen falls back to the finder rather than failing.
  // The resolver has already accepted the URL by this point, so returning
  // nothing here would reintroduce exactly the dead tap this replaced.
  matchmaking: (id) =>
    id === 'connections' ? appRoutes.matchConnections()
      : id === 'requests' ? appRoutes.matchRequests()
        : appRoutes.matchmaking(),
};

export function resolveExternalUrl(rawUrl: string): ExternalDestination | null {
  const resolved = resolveDeepLink(rawUrl);
  if (!resolved) return null;
  return { href: HREF[resolved.type](resolved.id), type: resolved.type, requiresAuth: resolved.requiresAuth };
}

export function resolveNotificationDestination(data: Record<string, unknown> | undefined): ExternalDestination | null {
  const conversationId = data?.conversationId;
  if (typeof conversationId === 'string' && conversationId.trim()) {
    return { href: appRoutes.conversation(conversationId), type: 'conversation', requiresAuth: true };
  }

  const url = data?.url ?? data?.link;
  if (typeof url === 'string') return resolveExternalUrl(url);

  return null;
}

export function navigateToExternalDestination(destination: ExternalDestination): void {
  router.push(destination.href as never);
}

// ─── Handing a destination to the auth gate ──────────────────────────────────
//
// A tapped push used to call navigateToExternalDestination directly, which
// skips the requiresAuth check that universal links get in useExternalLinks.
// Signed out, that landed you on an authed screen showing nothing instead of
// on sign-in. Harmless while the only push links were tournaments; the section
// roots added 2026-09-23 (/wallet, /membership, /stats…) made it reachable by
// most notifications, so both entry points now share one gate.
//
// A queue rather than a direct call because ORDER IS NOT GUARANTEED: a cold
// start delivers the tap through getLastNotificationResponseAsync before
// useExternalLinks has mounted and subscribed. Dropping it there would turn a
// tap-from-terminated into a no-op, which is the commonest way to open an app
// from a notification.

let queuedDestination: ExternalDestination | null = null;
let destinationListener: ((destination: ExternalDestination) => void) | null = null;

/** Called by the push handler. Delivered now if anyone is listening, else held. */
export function enqueueExternalDestination(destination: ExternalDestination): void {
  if (destinationListener) {
    destinationListener(destination);
    return;
  }
  // Only the most recent survives: two taps before mount means the second is
  // what the person actually chose.
  queuedDestination = destination;
}

/** Subscribed by useExternalLinks, which owns the auth gate. */
export function subscribeExternalDestinations(
  listener: (destination: ExternalDestination) => void,
): () => void {
  destinationListener = listener;

  if (queuedDestination) {
    const pending = queuedDestination;
    queuedDestination = null;
    listener(pending);
  }

  return () => {
    if (destinationListener === listener) destinationListener = null;
  };
}
