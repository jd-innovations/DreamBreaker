import type { Ionicons } from '@expo/vector-icons';

// The catalog behind the tournament detail strip and the director's picker.
//
// Keys are what the database stores (tournaments.amenities). Labels and icons
// live here so rewording "Player Gifts" or swapping an icon is a code change,
// not a data migration — and so an unknown key written by a newer client
// simply disappears on an older one instead of rendering blank furniture.
//
// Order is the order the picker offers them in. Roughly most- to
// least-commonly-true, so a director usually finds their three near the top.

export type AmenityKey =
  | 'sanctioned' | 'parking_free' | 'player_gifts' | 'food_onsite'
  | 'spectators_free' | 'restrooms' | 'hydration' | 'awards'
  | 'pro_shop' | 'indoor' | 'live_scoring' | 'shade';

export type Amenity = {
  key: AmenityKey;
  icon: keyof typeof Ionicons.glyphMap;
  /** Top line in the strip. Kept short — it is one of three equal columns. */
  title: string;
  /** Second line. The qualifier that makes the chip worth showing. */
  sub: string;
};

export const AMENITY_CATALOG: Amenity[] = [
  { key: 'sanctioned',      icon: 'trophy-outline',          title: 'Sanctioned',   sub: 'USAP'        },
  { key: 'parking_free',    icon: 'car-outline',             title: 'Parking',      sub: 'Free'        },
  { key: 'player_gifts',    icon: 'gift-outline',            title: 'Player Gifts', sub: 'Included'    },
  { key: 'food_onsite',     icon: 'restaurant-outline',      title: 'Food & Drinks',sub: 'On Site'     },
  { key: 'spectators_free', icon: 'people-outline',          title: 'Spectators',   sub: 'Free'        },
  { key: 'restrooms',       icon: 'business-outline',        title: 'Restrooms',    sub: 'On Site'     },
  { key: 'hydration',       icon: 'water-outline',           title: 'Hydration',    sub: 'Provided'    },
  { key: 'awards',          icon: 'medal-outline',           title: 'Awards',       sub: 'Medals'      },
  { key: 'pro_shop',        icon: 'pricetags-outline',       title: 'Pro Shop',     sub: 'On Site'     },
  { key: 'indoor',          icon: 'home-outline',            title: 'Indoor',       sub: 'Climate Ctrl'},
  { key: 'live_scoring',    icon: 'phone-portrait-outline',  title: 'Live Scoring', sub: 'Real Time'   },
  { key: 'shade',           icon: 'umbrella-outline',        title: 'Shade',        sub: 'Available'   },
];

/** Three equal flex columns; a fourth wraps the labels on narrow devices. */
export const MAX_AMENITIES = 3;

const BY_KEY = new Map(AMENITY_CATALOG.map(a => [a.key, a]));

/**
 * Resolve stored keys to renderable chips, dropping anything this build does
 * not know and capping at MAX_AMENITIES. Never throws on bad data: the detail
 * screen renders whatever survives, and nothing when that is empty.
 */
export function resolveAmenities(keys: string[] | null | undefined): Amenity[] {
  if (!Array.isArray(keys)) return [];
  const seen = new Set<string>();
  const out: Amenity[] = [];
  for (const k of keys) {
    if (seen.has(k)) continue;
    seen.add(k);
    const a = BY_KEY.get(k as AmenityKey);
    if (a) out.push(a);
    if (out.length === MAX_AMENITIES) break;
  }
  return out;
}
