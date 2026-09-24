export const APP_LINK_DOMAIN = 'pickleballapp.app';
export const APP_LINK_ORIGIN = `https://${APP_LINK_DOMAIN}`;

/**
 * Where "get the app" points.
 *
 * The web app for now, because there is no App Store listing yet: no
 * apps.apple.com URL exists anywhere in this repo, and a QR promising a
 * download would land someone on a web page instead.
 *
 * ONE line to change when the listing exists — swap this to the
 * apps.apple.com URL and update the label in ShareAppSheet, which is the only
 * place that words it.
 */
export const APP_DOWNLOAD_URL = APP_LINK_ORIGIN;

function segment(value: string): string {
  return encodeURIComponent(value);
}

function absolute(path: string): string {
  return `${APP_LINK_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
}

export const appRoutes = {
  conversation: (id: string) => `/conversation/${segment(id)}`,
  group: (id: string) => `/groups/${segment(id)}`,
  tournament: (id: string) => `/tournament/${segment(id)}`,
  communityEvent: (id: string) => `/community/${segment(id)}`,
  marketplaceListing: (id: string) => `/marketplace/${segment(id)}`,
  booking: (id: string) => `/booking/${segment(id)}`,
  coachOffer: (id: string) => `/coach/offers/${segment(id)}`,
  coach: (id: string) => `/coach/${segment(id)}`,
  claim: (token: string) => `/claim/${segment(token)}`,
  review: (token: string) => `/review/${segment(token)}`,
  facility: (id: string) => `/facility/${segment(id)}`,

  // ── Sections ───────────────────────────────────────────────────────────────
  // Where a section deep link lands on THIS platform. The names on the left are
  // the shared vocabulary; the paths on the right are expo-router's, and the
  // two deliberately differ where the app's own route is spelled differently:
  // /membership is the link, membership-settings.tsx is the screen.
  wallet: () => '/wallet',
  walletItem: (id: string) => `/wallet/${segment(id)}`,
  stats: () => '/stats',
  membership: () => '/membership-settings',
  profileTab: () => '/profile',
  games: () => '/games',
  // The partner finder is the tab; connections and requests are the two
  // screens a notification actually wants.
  matchmaking: () => '/finder',
  matchConnections: () => '/match/connections',
  matchRequests: () => '/match/requests',
};

export const appLinks = {
  conversation: (id: string) => absolute(appRoutes.conversation(id)),
  group: (id: string) => absolute(appRoutes.group(id)),
  tournament: (id: string) => absolute(appRoutes.tournament(id)),
  communityEvent: (id: string) => absolute(appRoutes.communityEvent(id)),
  marketplaceListing: (id: string) => absolute(appRoutes.marketplaceListing(id)),
  booking: (id: string) => absolute(appRoutes.booking(id)),
  coachOffer: (id: string) => absolute(appRoutes.coachOffer(id)),
  coach: (id: string) => absolute(appRoutes.coach(id)),
  review: (token: string) => absolute(appRoutes.review(token)),
  claim: (token: string) => absolute(appRoutes.claim(token)),
  facility: (id: string) => absolute(appRoutes.facility(id)),
};
