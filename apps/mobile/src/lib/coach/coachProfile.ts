import { supabase } from '@/lib/supabase';
import { fetchCoachOffers } from './offers';
import type { CoachOfferWithImages } from './offers';
import { resolveSocialLinks, type ResolvedSocialLink } from './socialLinks';

// The public coach profile.
//
// Reads only fields that exist and are true. Notably absent, because no data
// backs them: rating/review counts (no reviews table exists anywhere), players
// coached and repeat rate (no coach purchase has ever completed), social links
// and certifications (no columns). Adding them as zeros or placeholders would
// repeat the invented director stats deleted from the tournament screen.

export type CoachProfile = {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  bio: string | null;
  locationCity: string | null;
  locationState: string | null;
  /**
   * True only once Stripe's own account.updated webhook has confirmed the
   * connected account can take charges. Never self-set: is_coach is a client
   * -writable boolean and coach_status can be 'test_ready', a development
   * fixture 13 of 14 coaches currently sit in, so neither is safe to badge on.
   */
  identityVerified: boolean;
  /** Self-declared, unverified — see the badge tooltip. */
  certification: string | null;
  socialLinks: ResolvedSocialLink[];
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  bio: string | null;
  location_city: string | null;
  location_state: string | null;
  is_coach: boolean | null;
  stripe_connect_onboarded_at: string | null;
  coach_certification: string | null;
  social_links: unknown;
};

export async function fetchCoachProfile(coachId: string): Promise<CoachProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, cover_url, bio, location_city, location_state, is_coach, stripe_connect_onboarded_at, coach_certification, social_links')
    .eq('id', coachId)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as ProfileRow;
  // Not a coach at all -> no profile to show, rather than an empty one.
  if (!row.is_coach) return null;

  return {
    id: row.id,
    fullName: row.full_name ?? 'Coach',
    avatarUrl: row.avatar_url,
    coverUrl: row.cover_url,
    bio: row.bio,
    locationCity: row.location_city,
    locationState: row.location_state,
    identityVerified: row.stripe_connect_onboarded_at != null,
    certification: row.coach_certification,
    socialLinks: resolveSocialLinks(row.social_links),
  };
}

/**
 * The coach's bookable offers. fetchCoachOffers returns every status, so this
 * narrows to active — a paused or draft offer must not appear on a public
 * profile, and RLS would hide it from a non-owner anyway.
 */
export async function fetchCoachPublicOffers(coachId: string): Promise<CoachOfferWithImages[]> {
  const offers = await fetchCoachOffers(coachId).catch(() => []);
  return offers.filter(o => o.status === 'active');
}
