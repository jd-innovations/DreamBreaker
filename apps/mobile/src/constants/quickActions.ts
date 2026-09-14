import type { AppIconName } from '@/components/AppIcon';
import { isFeatureEnabled, type FeatureKey } from '@/lib/featureFlags';
import type { QuickActionTint } from '@/theme';

// Single source of truth for the Home screen's "Quick Actions" row —
// also used by the SlideMenu shortcuts row so both stay in sync.
export type QuickAction = {
  id: string;
  label: string;
  icon: AppIconName;
  /**
   * Identity colour. Replaced a boolean `active` flag on 2026-09-14, which had
   * rotted into meaning nothing: `find`, `groups`, `marketplace`, `wallet` and
   * `stats` were all false while routing to working screens, and the slide
   * menu rendered them greyed as though switched off. Whether something is in
   * scope is `feature`'s job, checked against BETA_SCOPE.md.
   */
  tint: QuickActionTint;
  route: string | null;
  // When set, the tile only renders in builds where the feature is in scope
  // (see BETA_SCOPE.md). Actions without a key are always in scope.
  feature?: FeatureKey;
};

// Full catalogue, including out-of-scope tiles. Kept intact so nothing is lost
// when a feature is promoted back into beta — filter through QUICK_ACTIONS.
export const ALL_QUICK_ACTIONS: QuickAction[] = [
  { id: 'book',        label: 'Book a\nCourt',  icon: 'calendar-outline',      tint: 'gold',  route: '/booking'            },
  { id: 'my-bookings', label: 'My\nBookings',   icon: 'receipt-outline',       tint: 'amber',  route: '/booking/my-bookings' },
  { id: 'create',      label: 'Create\nGame',   icon: 'add-circle-outline',    tint: 'gold',  route: '/play-pickleball'    },
  { id: 'partner',     label: 'Partner\nFinder', icon: 'person-add-outline',   tint: 'sky', route: '/(tabs)/finder'      },
  { id: 'find',        label: 'Find\nGames',    icon: 'search-outline',        tint: 'mint', route: '/(tabs)/nearby'      },
  // /lessons, not /coach: LessonMarketplaceScreen is the player-facing browse
  // of coach offers, while /coach is the Coach Mode activation hub -- the
  // opposite audience. This tile was `route: null`, and the handler is
  // `qa.route && router.push(...)`, so it rendered exactly like the working
  // tiles and a tap did nothing at all -- no navigation, no feedback.
  // featureRoutes.ts already gates /lessons on the same lessonMarketplace flag
  // this tile carries, so the tile and the deep-link guard cannot disagree.
  { id: 'lesson',      label: 'Take\nLesson',   icon: 'school-outline',        tint: 'peach', route: '/lessons',           feature: 'lessonMarketplace' },
  { id: 'learn',       label: 'Learn to\nPlay', icon: 'body-outline',          tint: 'lavender',  route: '/create-clinic'      },
  { id: 'groups',      label: 'My\nGroups',     icon: 'people-circle-outline', tint: 'rose', route: '/(tabs)/partner'     },
  { id: 'stats',       label: 'My\nStats',      icon: 'bar-chart-outline',     tint: 'teal', route: '/(tabs)/stats',      feature: 'myStats' },
  { id: 'saved',       label: 'Saved\nEvents',  icon: 'bookmark-outline',      tint: 'amber', route: '/saved-events'       },
  { id: 'marketplace', label: 'Paddle\nMarket', icon: 'storefront-outline',    tint: 'indigo', route: '/(tabs)/marketplace' },
  { id: 'wallet',      label: 'Wallet',         icon: 'wallet-outline',        tint: 'lime', route: '/wallet',            feature: 'wallet' },
];

export const QUICK_ACTIONS: QuickAction[] = ALL_QUICK_ACTIONS.filter(
  (action) => !action.feature || isFeatureEnabled(action.feature)
);
