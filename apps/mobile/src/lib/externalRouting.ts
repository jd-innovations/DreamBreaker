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
