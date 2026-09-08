import { appLinks } from '@/lib/appLinks';
import { createCommunityShareMessage } from '@/lib/communityShare';
import type { PlayEvent } from '@/lib/supabase/playEvents';
import { formatPriceCents } from '@/lib/marketplace/constants';

// Single builder for every entity that has a real public share link. Six
// screens (tournament, community/quick-game/round-robin/mini-tournament,
// marketplace, group, coach, facility) previously hand-rolled their own
// message string inline; this collects that logic in one typed place so a
// wording or URL change never needs six edits, and so every one of them stays
// in sync with web's canonical URL (apps/mobile/src/lib/appLinks.ts) and its
// Open Graph preview.
//
// Deliberately does NOT cover the text-only shares (match/session history,
// round-robin standings/schedule/roster/results, wallet items, player
// profiles) — those have no public URL and nothing for a preview card to
// show, so centralizing them here would just be indirection with no payoff.
//
// Pure and react-native-free on purpose (unlike share.ts, which wraps this
// with the actual Share.share call) — that is what lets this be unit-tested
// with a plain test runner and no RN mocking.

export type ShareEntityInput =
  | { type: 'tournament'; id: string; name: string }
  | { type: 'community'; event: PlayEvent }
  | { type: 'marketplace'; id: string; title: string; priceCents: number }
  | { type: 'group'; id: string; name: string }
  | { type: 'coach'; id: string; fullName: string }
  | { type: 'facility'; id: string; name: string };

export interface EntityShareContent {
  message: string;
  title: string;
  url: string;
}

export function buildEntityShareContent(input: ShareEntityInput): EntityShareContent {
  switch (input.type) {
    case 'tournament': {
      const url = appLinks.tournament(input.id);
      return { title: input.name, url, message: `Check out ${input.name} on Pickleball App: ${url}` };
    }
    case 'community': {
      const url = appLinks.communityEvent(input.event.id);
      return { title: input.event.name, url, message: createCommunityShareMessage(input.event) };
    }
    case 'marketplace': {
      const url = appLinks.marketplaceListing(input.id);
      return {
        title: input.title,
        url,
        message: `Check out this ${input.title} for ${formatPriceCents(input.priceCents)} on Pickleball App: ${url}`,
      };
    }
    case 'group': {
      const url = appLinks.group(input.id);
      return { title: input.name, url, message: `Join "${input.name}" on Pickleball App: ${url}` };
    }
    case 'coach': {
      const url = appLinks.coach(input.id);
      return { title: input.fullName, url, message: `${input.fullName} coaches on Pickleball App: ${url}` };
    }
    case 'facility': {
      const url = appLinks.facility(input.id);
      return { title: input.name, url, message: `Check out ${input.name} on Pickleball App: ${url}` };
    }
  }
}
