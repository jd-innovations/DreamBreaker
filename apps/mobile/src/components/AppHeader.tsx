import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '@/theme';
import { useProfile } from '@/hooks/useProfile';
import { useUnreadCounts } from '@/hooks/useUnreadCounts';
import { getProfileCompletion } from '@/lib/profileCompletion';
import { ProfileCompletionRing } from './ProfileCompletionRing';

function readAuthAvatarUrl(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const record = metadata as Record<string, unknown>;
  const value = record.avatar_url ?? record.picture;
  return typeof value === 'string' && value.length > 0 ? value : null;
}
function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <View style={s.badge}>
      <Text style={s.badgeText}>{count > 9 ? '9+' : count}</Text>
    </View>
  );
}

/**
 * Height of the header below the safe-area inset: 4 top pad + 46 button + 10
 * bottom pad. Screens that render <AppHeader /> must add
 * `insets.top + APP_HEADER_HEIGHT` of top padding to their content, since the
 * header floats above it rather than taking up layout space.
 */
export const APP_HEADER_HEIGHT = 60;

/**
 * AppHeader — the single canonical app header for all major tab screens.
 *
 * One logo implementation, one title implementation. Replaces the divergent
 * `HeaderLogo` (games/partner) and per-screen `AppHeader` copies.
 */
export function AppHeader({ hideProfile = false }: { hideProfile?: boolean } = {}) {
  const insets = useSafeAreaInsets();
  const { profile, user } = useProfile();
  const completion = getProfileCompletion(profile);
  const { unreadMessages, unreadNotifications } = useUnreadCounts();
  const displayAvatarUrl = profile?.avatar_url ?? readAuthAvatarUrl(user?.user_metadata) ?? null;

  return (
    <View style={[s.wrap, { paddingTop: insets.top + 4 }]}>
      {/* Left: (hamburger reserved) + profile */}
      <View style={s.left}>
        {!hideProfile && (
          <TouchableOpacity onPress={() => router.push('/account-settings' as never)}>
            <ProfileCompletionRing percent={completion} size={38} strokeWidth={2}>
              {displayAvatarUrl ? (
                <Image source={{ uri: displayAvatarUrl }} style={s.profileImg} />
              ) : (
                <View style={s.profileCircle}>
                  <Ionicons name="person-outline" size={19} color={colors.white} />
                </View>
              )}
            </ProfileCompletionRing>
          </TouchableOpacity>
        )}
      </View>

      {/* Center: intentionally empty — icons float over the screen content */}
      <View style={s.center} />

      {/* Right: notifications + chat */}
      <View style={s.right}>
        <TouchableOpacity
          style={s.iconBtn}
          onPress={() => router.push('/invites' as never)}
        >
          <Ionicons name="notifications-outline" size={34} color={colors.navy} />
          <CountBadge count={unreadNotifications} />
        </TouchableOpacity>
        <TouchableOpacity
          style={s.iconBtn}
          onPress={() => router.push('/(tabs)/chat' as never)}
        >
          <Ionicons name="chatbubble-outline" size={32} color={colors.navy} />
          <CountBadge count={unreadMessages} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  // Absolutely positioned with no background: screen content scrolls underneath
  // the floating circular icon buttons. Screens reserve room with
  // APP_HEADER_HEIGHT + insets.top of top padding.
  wrap: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'transparent', paddingHorizontal: spacing.screenH, paddingBottom: 10,
  },
  // paddingLeft reserves space for the floating hamburger trigger (SlideMenu)
  // rendered on top of the header, so the profile avatar sits just after it.
  left:  { flexDirection: 'row', alignItems: 'center', gap: 7, width: 100, paddingLeft: 54 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8, width: 100, justifyContent: 'flex-end' },
  profileCircle: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center',
  },
  profileImg: { width: 32, height: 32, borderRadius: 16 },
  iconBtn: {
    width: 46, height: 46, borderRadius: 23,
    alignItems: 'center', justifyContent: 'center', position: 'relative',
    borderWidth: 1, borderColor: colors.goldBorder, backgroundColor: colors.white,
  },
  center: { flex: 1 },
  badge: {
    position: 'absolute', top: -3, right: -3,
    minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 3,
    backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: colors.bg,
  },
  badgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800' },
});

export default AppHeader;
