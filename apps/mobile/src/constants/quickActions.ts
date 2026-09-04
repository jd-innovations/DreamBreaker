import type { AppIconName } from '@/components/AppIcon';
import { isFeatureEnabled, type FeatureKey } from '@/lib/featureFlags';

// Single source of truth for the Home screen's "Quick Actions" row —
// also used by the SlideMenu shortcuts row so both stay in sync.
export type QuickAction = {
  id: string;
  label: string;
  icon: AppIconName;
  active: boolean;
  route: string | null;
  // When set, the tile only renders in builds where the feature is in scope
  // (see BETA_SCOPE.md). Actions without a key are always in scope.
  feature?: FeatureKey;
};

// Full catalogue, including out-of-scope tiles. Kept intact so nothing is lost
// when a feature is promoted back into beta — filter through QUICK_ACTIONS.
export const ALL_QUICK_ACTIONS: QuickAction[] = [
  { id: 'book',        label: 'Book a\nCourt',  icon: 'calendar-outline',      active: true,  route: '/booking'            },
  { id: 'my-bookings', label: 'My\nBookings',   icon: 'receipt-outline',       active: true,  route: '/booking/my-bookings' },
  { id: 'create',      label: 'Create\nGame',   icon: 'add-circle-outline',    active: true,  route: '/play-pickleball'    },
  { id: 'partner',     label: 'Partner\nFinder', icon: 'person-add-outline',   active: false, route: '/(tabs)/finder'      },
  { id: 'find',        label: 'Find\nGames',    icon: 'search-outline',        active: false, route: '/(tabs)/nearby'      },
  { id: 'lesson',      label: 'Take\nLesson',   icon: 'school-outline',        active: false, route: null,                 feature: 'lessonMarketplace' },
  { id: 'learn',       label: 'Learn to\nPlay', icon: 'body-outline',          active: true,  route: '/create-clinic'      },
  { id: 'groups',      label: 'My\nGroups',     icon: 'people-circle-outline', active: false, route: '/(tabs)/partner'     },
  { id: 'stats',       label: 'My\nStats',      icon: 'bar-chart-outline',     active: false, route: '/(tabs)/stats',      feature: 'myStats' },
  { id: 'saved',       label: 'Saved\nEvents',  icon: 'bookmark-outline',      active: false, route: '/saved-events'       },
  { id: 'marketplace', label: 'Paddle\nMarket', icon: 'storefront-outline',    active: false, route: '/(tabs)/marketplace' },
  { id: 'wallet',      label: 'Wallet',         icon: 'wallet-outline',        active: false, route: '/wallet',            feature: 'wallet' },
];

export const QUICK_ACTIONS: QuickAction[] = ALL_QUICK_ACTIONS.filter(
  (action) => !action.feature || isFeatureEnabled(action.feature)
);
