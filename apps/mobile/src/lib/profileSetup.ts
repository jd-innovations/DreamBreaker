import { supabase } from '@/lib/supabase';
import type { UserProfile } from '@/lib/services/profile';

export type ProfileSetupTaskId = 'join' | 'skill' | 'photo' | 'court' | 'notifs';

export type ProfileSetupTask = {
  id: ProfileSetupTaskId;
  label: string;
  done: boolean;
  icon: string;
  desc: string | null;
  route: string | null;
};

export function getProfileSetupTasks({
  isSignedIn,
  profile,
  authAvatarUrl,
  hasPushToken,
}: {
  isSignedIn: boolean;
  profile: UserProfile | null;
  authAvatarUrl: string | null;
  hasPushToken: boolean;
}): ProfileSetupTask[] {
  const hasRating = !!profile?.dupr || !!profile?.self_rating || !!profile?.skill_level;
  const hasProfileImage = !!profile?.avatar_url || !!authAvatarUrl;

  return [
    {
      id: 'join',
      label: 'Join DreamBreaker PB',
      done: isSignedIn,
      icon: 'pickleball',
      desc: isSignedIn ? null : 'Create an account to save your player profile.',
      route: isSignedIn ? null : '/sign-in',
    },
    {
      id: 'skill',
      label: 'Add your playing level',
      done: hasRating,
      icon: 'trophy-outline',
      desc: hasRating ? null : 'Discover and organize games with players at your level.',
      route: '/edit-profile',
    },
    {
      id: 'photo',
      label: 'Add a profile image',
      done: hasProfileImage,
      icon: 'person-circle-outline',
      desc: hasProfileImage ? null : 'Help players recognize you before you meet on court.',
      route: '/edit-profile',
    },
    {
      id: 'court',
      label: 'Set your home court',
      done: !!profile?.home_court_id,
      icon: 'location-outline',
      desc: profile?.home_court_id ? null : 'Anchor recommendations around where you play most.',
      route: '/edit-profile',
    },
    {
      id: 'notifs',
      label: 'Enable push notifications',
      done: hasPushToken,
      icon: 'notifications-outline',
      desc: hasPushToken ? null : 'Get match, invite, and message alerts on this device.',
      route: '/notifications-settings',
    },
  ];
}

export async function hasRegisteredPushToken(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('push_tokens')
    .select('expo_push_token')
    .eq('user_id', userId)
    .limit(1);

  if (error) {
    console.warn('[profileSetup] push token check failed:', error.message);
    return false;
  }

  return (data?.length ?? 0) > 0;
}