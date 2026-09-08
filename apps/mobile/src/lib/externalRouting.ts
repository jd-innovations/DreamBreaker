import { router } from 'expo-router';
import { APP_LINK_DOMAIN, appRoutes } from '@/lib/appLinks';

export type ExternalDestinationType =
  | 'conversation'
  | 'group'
  | 'tournament'
  | 'community'
  | 'marketplace'
  | 'booking'
  | 'coach_offer'
  | 'claim'
  | 'review';

export type ExternalDestination = {
  href: string;
  type: ExternalDestinationType;
  requiresAuth: boolean;
};

type ParsedExternalUrl = {
  pathname: string;
  search: string;
};

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseExternalUrl(rawUrl: string): ParsedExternalUrl | null {
  if (!rawUrl.trim()) return null;

  if (rawUrl.startsWith('/')) {
    const [pathname, query = ''] = rawUrl.split('?');
    return { pathname, search: query ? `?${query}` : '' };
  }

  try {
    const url = new URL(rawUrl);

    if (url.protocol === 'https:' && (url.hostname === APP_LINK_DOMAIN || url.hostname === `www.${APP_LINK_DOMAIN}`)) {
      return { pathname: url.pathname, search: url.search };
    }

    if (url.protocol === 'pickleballapp:') {
      if (url.hostname === 'app') return { pathname: url.pathname || '/', search: url.search };
      if (url.hostname) return { pathname: `/${url.hostname}${url.pathname}`, search: url.search };
      return { pathname: url.pathname || '/', search: url.search };
    }
  } catch {
    return null;
  }

  return null;
}

function firstTwoSegments(pathname: string): [string | null, string | null] {
  const parts = pathname.split('/').filter(Boolean).map(safeDecode);
  return [parts[0] ?? null, parts[1] ?? null];
}

export function resolveExternalUrl(rawUrl: string): ExternalDestination | null {
  const parsed = parseExternalUrl(rawUrl);
  if (!parsed) return null;

  const [root, id] = firstTwoSegments(parsed.pathname);
  if (!root || !id) return null;

  switch (root) {
    case 'conversation':
      return { href: appRoutes.conversation(id), type: 'conversation', requiresAuth: true };
    case 'groups':
      return { href: appRoutes.group(id), type: 'group', requiresAuth: true };
    case 'tournament':
      return { href: appRoutes.tournament(id), type: 'tournament', requiresAuth: false };
    case 'community':
      return { href: appRoutes.communityEvent(id), type: 'community', requiresAuth: false };
    case 'marketplace':
      return { href: appRoutes.marketplaceListing(id), type: 'marketplace', requiresAuth: false };
    case 'booking':
      return { href: appRoutes.booking(id), type: 'booking', requiresAuth: true };
    case 'coach':
      if (id === 'offers') {
        const offerId = parsed.pathname.split('/').filter(Boolean)[2];
        if (offerId) return { href: appRoutes.coachOffer(safeDecode(offerId)), type: 'coach_offer', requiresAuth: true };
      }
      return null;
    case 'claim':
      return { href: appRoutes.claim(id), type: 'claim', requiresAuth: false };
    // requiresAuth: the invitation belongs to one person, and
    // resolve_review_invitation refuses a token that is not theirs. Sending an
    // unauthenticated visitor to the form would only fail at submit.
    case 'review':
      return { href: appRoutes.review(id), type: 'review', requiresAuth: true };
    default:
      return null;
  }
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
