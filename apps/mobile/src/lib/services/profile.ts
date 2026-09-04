import { supabase } from '@/lib/supabase';

export const AVAILABILITY_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type AvailabilityDay = typeof AVAILABILITY_DAYS[number];
export const AVAILABILITY_BLOCKS = ['morning', 'afternoon', 'evening'] as const;
export type AvailabilityBlock = typeof AVAILABILITY_BLOCKS[number];
export type AvailabilitySchedule = Partial<Record<AvailabilityDay, AvailabilityBlock[]>>;

export type UserProfile = {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  bio: string | null;
  cover_url: string | null;
  handle: string | null;
  location_city: string | null;
  location_state: string | null;
  location_lat: number | null;
  location_lng: number | null;
  home_court_id: string | null;
  story_radius_miles: number | null;
  dupr: number | null;
  dupr_verified: boolean | null;
  hand: string | null;
  /** Keys, not labels — see lib/playProfile.ts. Rendered via playStyleLabel(). */
  play_style: string[] | null;
  skill_level: string | null;
  availability: string | null;
  self_rating: string | null;
  is_director: boolean;
  director_status: string | null;
  is_coach: boolean;
  coach_status: string;
  stripe_connect_onboarded_at: string | null;
  role: string;
  availability_schedule: AvailabilitySchedule | null;
  created_at: string | null;
  marketplace_listing_limit: number | null;
};

const PROFILE_SELECT = [
  'id', 'full_name', 'email', 'avatar_url', 'bio', 'cover_url', 'handle',
  'location_city', 'location_state', 'location_lat', 'location_lng', 'home_court_id', 'story_radius_miles', 'dupr', 'dupr_verified', 'hand',
  'play_style', 'skill_level', 'availability', 'self_rating', 'is_director', 'director_status', 'is_coach', 'coach_status',
  'stripe_connect_onboarded_at', 'role', 'availability_schedule', 'created_at', 'marketplace_listing_limit',
].join(', ');

const CORE_PROFILE_SELECT = [
  'id', 'full_name', 'email', 'avatar_url', 'bio', 'cover_url', 'handle',
  'location_city', 'location_state', 'location_lat', 'location_lng', 'dupr', 'dupr_verified', 'hand',
  'play_style', 'skill_level', 'availability', 'self_rating', 'is_director', 'director_status', 'is_coach', 'coach_status',
  'stripe_connect_onboarded_at', 'role',
].join(', ');

type ProfileRow = Partial<UserProfile> & Pick<UserProfile, 'id' | 'full_name' | 'email'>;

function hydrateProfile(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    avatar_url: row.avatar_url ?? null,
    bio: row.bio ?? null,
    cover_url: row.cover_url ?? null,
    handle: row.handle ?? null,
    location_city: row.location_city ?? null,
    location_state: row.location_state ?? null,
    location_lat: row.location_lat ?? null,
    location_lng: row.location_lng ?? null,
    home_court_id: row.home_court_id ?? null,
    story_radius_miles: row.story_radius_miles ?? null,
    dupr: row.dupr ?? null,
    dupr_verified: row.dupr_verified ?? null,
    hand: row.hand ?? null,
    play_style: row.play_style ?? null,
    skill_level: row.skill_level ?? null,
    availability: row.availability ?? null,
    self_rating: row.self_rating ?? null,
    is_director: row.is_director ?? false,
    director_status: row.director_status ?? null,
    is_coach: row.is_coach ?? false,
    coach_status: row.coach_status ?? 'inactive',
    stripe_connect_onboarded_at: row.stripe_connect_onboarded_at ?? null,
    role: row.role ?? 'player',
    availability_schedule: row.availability_schedule ?? null,
    created_at: row.created_at ?? null,
    marketplace_listing_limit: row.marketplace_listing_limit ?? null,
  };
}

export async function fetchProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('id', userId)
    .single();

  if (!error && data) return hydrateProfile(data as unknown as ProfileRow);

  console.error('[fetchProfile] error:', error?.message, error?.code, 'userId:', userId);

  const { data: coreData, error: coreError } = await supabase
    .from('profiles')
    .select(CORE_PROFILE_SELECT)
    .eq('id', userId)
    .single();

  if (coreError || !coreData) {
    console.error('[fetchProfile] core fallback error:', coreError?.message, coreError?.code, 'userId:', userId);
    return null;
  }

  console.warn('[fetchProfile] loaded core profile fallback; optional profile columns may be missing in Supabase.');
  return hydrateProfile(coreData as unknown as ProfileRow);
}

// dupr and dupr_verified are intentionally excluded — read-only on mobile
export async function updateProfile(userId: string, updates: {
  full_name?: string;
  bio?: string;
  location_city?: string;
  location_state?: string;
  location_lat?: number | null;
  location_lng?: number | null;
  hand?: string;
  play_style?: string[];
  preferred_formats?: string[];
  play_intensity?: string;
  skill_level?: string;   // user-editable range band e.g. "3.5-4.0"
  availability?: string;
  self_rating?: string;   // user-editable numeric e.g. "4.01"
  avatar_url?: string;
  availability_schedule?: AvailabilitySchedule;
  home_court_id?: string | null;
  gender?: string | null;
  date_of_birth?: string | null;
  story_radius_miles?: number;
  onboarding_intent?: string[];
}) {
  const { error } = await supabase
    .from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw error;
}

// Self-service request onto the director approval queue. Always lands on
// 'pending' — never grants approval directly (enforced server-side by the
// apply_to_be_director() RPC, see migration 20260712000000).
export async function applyToBeDirector(): Promise<string> {
  const { data, error } = await supabase.rpc('apply_to_be_director');
  if (error) throw error;
  return data as string;
}
// Avatar upload moved to the ImagePipeline — see lib/media/imagePipeline.ts
// (replaceImage with category 'avatar'). The old fetch→blob→arrayBuffer path
// was removed in the P0 migration.
