export const APP_LINK_DOMAIN = 'pickleballapp.app';
export const APP_LINK_ORIGIN = `https://${APP_LINK_DOMAIN}`;

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
