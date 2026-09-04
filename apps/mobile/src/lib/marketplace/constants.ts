// Controlled vocabularies + formatting rules for Marketplace V1.
// Brand and condition are never free text (spec: "Brand is never entered
// manually" / "No custom condition text") — everything else derives from
// these lists so the UI and the DB enum stay in lockstep.

import type { Database } from '@shared/database.types';

export type MarketplaceCondition = Database['public']['Enums']['marketplace_condition'];
export type MarketplaceListingStatus = Database['public']['Enums']['marketplace_listing_status'];

export const MARKETPLACE_BRANDS = [
  'JOOLA',
  'Selkirk',
  'CRBN',
  'Gearbox',
  'Six Zero',
  'Paddletek',
  'Engage',
  'Diadem',
  'Proton',
  'Volair',
  'Franklin',
  'Vatic Pro',
  'Honolulu Pickleball',
  'Gamma',
  'HEAD',
  'Onix',
  'Wilson',
  'Electrum',
  'Bread & Butter',
  'Other',
] as const;

export type MarketplaceBrand = (typeof MARKETPLACE_BRANDS)[number];

export const CONDITION_OPTIONS: { value: MarketplaceCondition; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'like_new', label: 'Like New' },
  { value: 'excellent', label: 'Excellent' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
];

export function conditionLabel(condition: MarketplaceCondition): string {
  return CONDITION_OPTIONS.find((c) => c.value === condition)?.label ?? condition;
}

export const DESCRIPTION_MAX_LENGTH = 300;
export const MIN_LISTING_PHOTOS = 3;
export const MAX_LISTING_PHOTOS = 8;
export const DEFAULT_FREE_LISTING_LIMIT = 2;

export const DESCRIPTION_PROMPTS = [
  'Why are you selling it?',
  'How long was it used?',
  'Any cosmetic wear?',
  'Any modifications?',
];

// ── Model normalization ──────────────────────────────────────────────────────
// "perseus   3s   16mm" → "Perseus 3S 16mm"
//
// Rules: trim, collapse whitespace, then title-case each token except:
//   - tokens that are a number immediately followed by a unit (16mm, 13mm)
//     keep the number as-is and lowercase the unit suffix
//   - tokens that are all-caps and 4 chars or fewer with no vowels-only run
//     (e.g. "CFS", "3S") are preserved upper-case rather than title-cased,
//     since paddle naming conventions use these as acronyms/size codes
const UNIT_SUFFIX = /^(\d+(?:\.\d+)?)(mm|cm|in|oz)$/i;
const ACRONYM_LIKE = /^[a-z0-9]{1,4}$/i;

export function normalizeModelName(raw: string): string {
  const collapsed = raw.trim().replace(/\s+/g, ' ');
  if (!collapsed) return '';

  return collapsed
    .split(' ')
    .map((token) => {
      const unitMatch = token.match(UNIT_SUFFIX);
      if (unitMatch) return `${unitMatch[1]}${unitMatch[2].toLowerCase()}`;

      // Short alphanumeric tokens with at least one letter and one digit, or
      // that are already fully uppercase (e.g. "CFS"), read as model codes —
      // preserve them uppercase rather than title-casing to "Cfs" / "3s".
      const hasLetter = /[a-z]/i.test(token);
      const hasDigit = /\d/.test(token);
      if (ACRONYM_LIKE.test(token) && ((hasLetter && hasDigit) || token === token.toUpperCase())) {
        return token.toUpperCase();
      }

      return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
    })
    .join(' ');
}

export function generateListingTitle(brand: string, model: string): string {
  return `${brand} ${normalizeModelName(model)}`.trim();
}

export function formatPriceCents(cents: number): string {
  return `$${Math.round(cents / 100)}`;
}

export function listingAgeLabel(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days < 1) return 'Today';
  if (days === 1) return '1d';
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
}
