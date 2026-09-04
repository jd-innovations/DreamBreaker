import type { Ionicons } from '@expo/vector-icons';

// The platform catalogue for profiles.social_links.
//
// The database stores keys; this file owns icons, labels and how a stored
// value becomes an openable URL. Same reasoning as the tournament amenity
// catalogue: adding or retiring a platform is a code change rather than a
// migration, and a key an older build does not recognise is dropped instead of
// rendering a broken row.

export type SocialPlatform =
  | 'instagram' | 'facebook' | 'tiktok' | 'youtube' | 'website' | 'whatsapp' | 'email';

export type SocialPlatformMeta = {
  key: SocialPlatform;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** What the coach types: a handle, a full URL, a phone number, an address. */
  placeholder: string;
  /** Turns the stored value into something Linking can open. */
  toUrl: (value: string) => string;
};

const stripAt = (v: string) => v.trim().replace(/^@/, '');
const asHttp = (v: string) => (/^https?:\/\//i.test(v.trim()) ? v.trim() : `https://${v.trim()}`);
const digits = (v: string) => v.replace(/[^\d]/g, '');

// Order is display order — the row on the profile renders in this sequence.
export const SOCIAL_PLATFORMS: SocialPlatformMeta[] = [
  { key: 'instagram', label: 'Instagram', icon: 'logo-instagram', placeholder: '@yourhandle',
    toUrl: v => (/^https?:/i.test(v) ? v : `https://instagram.com/${stripAt(v)}`) },
  { key: 'facebook', label: 'Facebook', icon: 'logo-facebook', placeholder: 'facebook.com/yourpage',
    toUrl: v => (/^https?:/i.test(v) ? v : `https://facebook.com/${stripAt(v)}`) },
  { key: 'tiktok', label: 'TikTok', icon: 'logo-tiktok', placeholder: '@yourhandle',
    toUrl: v => (/^https?:/i.test(v) ? v : `https://tiktok.com/@${stripAt(v)}`) },
  { key: 'youtube', label: 'YouTube', icon: 'logo-youtube', placeholder: 'youtube.com/@yourchannel',
    toUrl: v => (/^https?:/i.test(v) ? v : `https://youtube.com/@${stripAt(v)}`) },
  { key: 'website', label: 'Website', icon: 'globe-outline', placeholder: 'yoursite.com',
    toUrl: asHttp },
  // wa.me needs digits only — a pasted "+1 (941) 555-0100" would 404 otherwise.
  { key: 'whatsapp', label: 'WhatsApp', icon: 'logo-whatsapp', placeholder: '+1 941 555 0100',
    toUrl: v => `https://wa.me/${digits(v)}` },
  // Deliberately its own field rather than reusing profiles.email: that is the
  // account address, is not granted to anon, and publishing it would expose a
  // login identifier the coach never chose to make public.
  { key: 'email', label: 'Email', icon: 'mail-outline', placeholder: 'you@example.com',
    toUrl: v => `mailto:${v.trim()}` },
];

export type ResolvedSocialLink = SocialPlatformMeta & { value: string; url: string };

/**
 * Resolves the stored object into renderable links, dropping unknown keys and
 * blank values. Never throws on bad data — a malformed row renders fewer icons
 * rather than breaking the profile.
 */
export function resolveSocialLinks(raw: unknown): ResolvedSocialLink[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const out: ResolvedSocialLink[] = [];
  for (const meta of SOCIAL_PLATFORMS) {
    const value = (raw as Record<string, unknown>)[meta.key];
    if (typeof value !== 'string' || !value.trim()) continue;
    out.push({ ...meta, value: value.trim(), url: meta.toUrl(value) });
  }
  return out;
}
