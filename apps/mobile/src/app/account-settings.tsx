import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { goBack } from '@/lib/navigation';
import { StatusBar } from 'expo-status-bar';
import { colors } from '@/theme';
import { useProfile } from '@/hooks/useProfile';
import { getProfileCompletion } from '@/lib/profileCompletion';
import { signOut } from '@/lib/auth';
import { openPrivacy, openTerms } from '@/lib/legal';
import { ProfileCompletionRing } from '@/components';

// Theme-backed alias Ã¢â‚¬â€ brand values resolve from @/theme.
const L = {
  bg: colors.bg,
  page: colors.page,
  navy: colors.navy,
  navyHero: colors.navy,
  gold: colors.gold,
  goldBg: colors.goldBg,
  goldBorder: colors.goldBorder,
  text: colors.text,
  textSub: colors.textSub,
  textMuted: colors.textSub,
  border: colors.border,
  danger: colors.danger,
  white: colors.white,
};

const SETTINGS_GRID = [
  [
    { icon: 'person-outline',       label: 'Profile'       },
    { icon: 'speedometer-outline',  label: 'Rating'        },
  ],
  [
    { icon: 'location-outline',     label: 'Location'      },
    { icon: 'person-add-outline',   label: 'Contact'       },
  ],
  [
    { icon: 'refresh-outline',      label: 'My Plan'       },
    { icon: 'cash-outline',         label: 'Payments'      },
  ],
  [
    { icon: 'notifications-outline', label: 'Notifications' },
    { icon: 'lock-closed-outline',  label: 'Permissions'   },
  ],
];

const CELL_ROUTES: Record<string, string> = {
  Profile:       '/edit-profile',
  Location:      '/location-settings',
  Rating:        '/rating-settings',
  Contact:       '/communication-settings',
  Notifications: '/notifications-settings',
  'My Plan':     '/membership-settings',
  Permissions:   '/permissions-settings',
  Payments:      '/payments-settings',
};

function SettingCell({ icon, label }: { icon: string; label: string }) {
  const route = CELL_ROUTES[label];
  return (
    <TouchableOpacity
      style={cell.wrap}
      activeOpacity={0.75}
      onPress={() => { if (route) router.push(route as never); }}
    >
      <Ionicons name={icon as never} size={22} color={L.navy} />
      <Text style={cell.label}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={L.textMuted} style={{ marginLeft: 'auto' }} />
    </TouchableOpacity>
  );
}

const cell = StyleSheet.create({
  wrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: L.bg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: L.border,
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  label: { color: L.text, fontSize: 14, fontWeight: '600' },
});

export default function AccountSettingsScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useProfile();
  const completion = getProfileCompletion(profile);

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  const ratingLabel = profile?.dupr != null
    ? `DUPR ${Number(profile.dupr).toFixed(2)}`
    : profile?.self_rating
      ? `Self Rated ${profile.self_rating}`
      : 'Not Rated';
  function confirmLogOut() {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut();
            router.replace('/sign-in' as never);
          } catch (e: any) {
            Alert.alert('Log out failed', e.message ?? 'Please try again.');
          }
        },
      },
    ]);
  }

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ HEADER Ã¢â€â‚¬Ã¢â€â‚¬ */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => goBack()}>
          <Ionicons name="chevron-back" size={20} color={L.navy} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>ACCOUNT SETTINGS</Text>
        <TouchableOpacity style={styles.headerBtn} onPress={() => goBack()}>
          <Ionicons name="close" size={20} color={L.navy} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
      >
        {/* Ã¢â€â‚¬Ã¢â€â‚¬ PROFILE CARD Ã¢â€â‚¬Ã¢â€â‚¬ */}
        <View style={styles.profileCard}>
          {/* Avatar */}
          <ProfileCompletionRing percent={completion} size={72} strokeWidth={3}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: L.navy, alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ color: '#fff', fontSize: 24, fontWeight: '800' }}>{initials}</Text>
              </View>
            )}
          </ProfileCompletionRing>
          {/* Info */}
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{profile?.full_name ?? '—'}</Text>
            <View style={styles.ratingRow}>
              <Ionicons name="speedometer-outline" size={14} color={L.textMuted} />
              <Text style={styles.ratingText}>{ratingLabel}</Text>
            </View>
          </View>
        </View>

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ UPGRADE BANNER Ã¢â€â‚¬Ã¢â€â‚¬ */}
        <TouchableOpacity style={styles.upgradeBanner} activeOpacity={0.88}>
          {/* Ball graphic */}
          <View style={styles.upgradeBallWrap}>
            <View style={styles.upgradeBall}>
              <View style={[styles.ubH, { top: 5, left: 7 }]} />
              <View style={[styles.ubH, { top: 5, right: 7 }]} />
              <View style={[styles.ubH, { bottom: 5, left: 12 }]} />
            </View>
            <View style={[styles.ubLine, { right: -8, top: 8, width: 9 }]} />
            <View style={[styles.ubLine, { right: -6, top: 14, width: 6 }]} />
          </View>

          <View style={styles.upgradeText}>
            <Text style={styles.upgradeTitle}>
              Upgrade to Pickleball App{' '}
              <Text style={styles.upgradePlus}>PLUS</Text>
            </Text>
            <Text style={styles.upgradeSub}>Get premium features and more.</Text>
          </View>

          <View style={styles.upgradeArrow}>
            <Ionicons name="chevron-forward" size={18} color={L.white} />
          </View>
        </TouchableOpacity>

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ SETTINGS GRID Ã¢â€â‚¬Ã¢â€â‚¬ */}
        <View style={styles.grid}>
          {SETTINGS_GRID.map((row, ri) => (
            <View key={ri} style={styles.gridRow}>
              {row.map((item) => (
                <SettingCell key={item.label} icon={item.icon} label={item.label} />
              ))}
            </View>
          ))}
        </View>

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ HELP CARD Ã¢â€â‚¬Ã¢â€â‚¬ */}
        <TouchableOpacity style={styles.helpCard} activeOpacity={0.88}
          onPress={() => router.push('/help-support' as never)}>
          <View style={styles.helpIconWrap}>
            <Text style={styles.helpQ}>?</Text>
          </View>
          <View style={styles.helpText}>
            <Text style={styles.helpTitle}>Have a question? Get help!</Text>
            <Text style={styles.helpSub}>Visit our help center or contact support.</Text>
          </View>
          <View style={styles.helpArrow}>
            <Ionicons name="chevron-forward" size={18} color={L.white} />
          </View>
        </TouchableOpacity>

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ FOOTER ROW Ã¢â€â‚¬Ã¢â€â‚¬ */}
        {/* Store review requires self-service deletion to be reachable from the
            account area, not buried behind a support request. The screen itself
            carries the confirmation step. */}
        <TouchableOpacity
          style={styles.deleteRow}
          activeOpacity={0.75}
          onPress={() => router.push('/delete-account' as never)}
          accessibilityRole="button"
          accessibilityLabel="Delete account"
        >
          <Ionicons name="trash-outline" size={20} color={L.danger} />
          <View style={styles.deleteText}>
            <Text style={styles.deleteTitle}>Delete Account</Text>
            <Text style={styles.deleteSub}>Permanently delete your account and personal data.</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={L.danger} />
        </TouchableOpacity>

        <View style={styles.footerRow}>
          <TouchableOpacity style={styles.footerBtn} onPress={openPrivacy} activeOpacity={0.7}>
            <Ionicons name="shield-outline" size={16} color={L.navy} />
            <Text style={styles.footerText}>Privacy</Text>
          </TouchableOpacity>

          <View style={styles.footerDivider} />

          <TouchableOpacity style={styles.footerBtn} onPress={openTerms} activeOpacity={0.7}>
            <Ionicons name="document-text-outline" size={16} color={L.navy} />
            <Text style={styles.footerText}>Terms</Text>
          </TouchableOpacity>

          <View style={styles.footerDivider} />

          <TouchableOpacity style={styles.footerBtn} onPress={confirmLogOut} activeOpacity={0.7}>
            <Ionicons name="log-out-outline" size={16} color={L.danger} />
            <Text style={[styles.footerText, { color: L.danger }]}>Log out</Text>
          </TouchableOpacity>
        </View>

        {/* Version */}
        <Text style={styles.version}>Version 1.0.0 (Build 1)</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.bg },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: L.bg,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: L.border,
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: L.border,
    backgroundColor: L.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: L.navy,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1.5,
  },

  scrollContent: { padding: 16, gap: 14 },

  // Profile card
  profileCard: {
    backgroundColor: L.navyHero,
    borderRadius: 18,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  profileInfo: { flex: 1, gap: 6 },
  profileName: {
    color: L.white,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ratingText: { color: L.textMuted, fontSize: 13, fontWeight: '600' },

  // Upgrade banner
  upgradeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: L.bg,
    borderWidth: 1.5,
    borderColor: L.goldBorder,
    borderRadius: 16,
    padding: 16,
  },
  upgradeBallWrap: { width: 42, height: 38, position: 'relative', flexShrink: 0 },
  upgradeBall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: L.gold,
    position: 'absolute',
    left: 0,
    top: 0,
  },
  ubH: {
    position: 'absolute',
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  ubLine: {
    position: 'absolute',
    height: 2.5,
    borderRadius: 1.25,
    backgroundColor: L.gold,
    transform: [{ rotate: '-18deg' }],
  },
  upgradeText: { flex: 1 },
  upgradeTitle: { color: L.navy, fontSize: 14, fontWeight: '800', marginBottom: 2 },
  upgradePlus: { color: L.gold },
  upgradeSub: { color: L.textSub, fontSize: 12, fontWeight: '500' },
  upgradeArrow: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: L.gold,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  // Settings grid
  grid: { gap: 10 },
  gridRow: { flexDirection: 'row', gap: 10 },

  // Help card
  helpCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: L.bg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: L.border,
    padding: 16,
  },
  helpIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(201,168,76,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  helpQ: { color: L.gold, fontSize: 20, fontWeight: '900' },
  helpText: { flex: 1 },
  helpTitle: { color: L.navy, fontSize: 14, fontWeight: '800', marginBottom: 2 },
  helpSub: { color: L.textSub, fontSize: 12, fontWeight: '500' },
  helpArrow: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: L.gold,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  // Footer
  footerRow: {
    flexDirection: 'row',
    backgroundColor: L.bg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: L.border,
    overflow: 'hidden',
  },
  footerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
  },
  footerDivider: { width: 1, backgroundColor: L.border, marginVertical: 8 },

  // Delete account
  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: L.bg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: L.danger,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  deleteText: { flex: 1 },
  deleteTitle: { color: L.danger, fontSize: 14, fontWeight: '800', marginBottom: 2 },
  deleteSub: { color: L.textSub, fontSize: 12, fontWeight: '500' },

  footerText: { color: L.navy, fontSize: 13, fontWeight: '600' },

  // Version
  version: {
    color: L.textMuted,
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 4,
  },
});
