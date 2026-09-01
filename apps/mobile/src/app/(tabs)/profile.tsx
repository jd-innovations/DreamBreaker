import React, { useState, useCallback, useEffect } from 'react';
import { playStyleSummary } from '@shared/play-profile';
import { View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { router, useFocusEffect } from 'expo-router';
import { colors, radius, spacing, typography } from '@/theme';
import { tabBarClearance } from '@/constants/tabBar';
import { SettingsRow, ProfileCompletionRing } from '@/components';
import { useSlideMenu } from '@/components/SlideMenu';
import { fetchPlayerRegistrations } from '@/lib/supabase/registrations';
import { signOut } from '@/lib/auth';
import { useProfile } from '@/hooks/useProfile';
import type { UserProfile } from '@/lib/services/profile';
import { getProfileCompletion } from '@/lib/profileCompletion';
import { requireAuth } from '@/lib/authGuard';
import { isFeatureEnabled, type FeatureKey } from '@/lib/featureFlags';

// Actions that require a session â€” guard before navigating
type MenuItem = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sub: string;
  route?: string;
  protected?: boolean;
  comingSoon?: boolean;
  // Rows carrying a feature key only render where that feature is in this
  // build's beta scope (see BETA_SCOPE.md).
  feature?: FeatureKey;
};

function getMenuItems(directorStatus: string | null, coachStatus: string | null): MenuItem[] {
  const coachRow: MenuItem =
    coachStatus === 'active'
      ? { icon: 'school-outline', label: 'Coach Hub',   sub: 'Manage your lesson offers', route: '/coach', protected: true }
      : coachStatus === 'onboarding' || coachStatus === 'test_ready'
        ? { icon: 'time-outline',   label: 'Coach Mode', sub: 'Setup in progress',          route: '/coach', protected: true }
        : coachStatus === 'restricted'
          ? { icon: 'alert-circle-outline', label: 'Coach Mode', sub: 'Payout account needs attention', route: '/coach', protected: true }
          : { icon: 'school-outline', label: 'Become a Coach', sub: 'Sell lessons on Pickleball App', route: '/coach', protected: true };

  const directorRow: MenuItem =
    directorStatus === 'approved'
      ? { icon: 'construct-outline', label: 'Director Hub',      sub: 'Manage your tournaments',  route: '/director',        protected: true }
      : directorStatus === 'pending'
        ? { icon: 'time-outline',       label: 'Director Application', sub: 'Pending review',      route: '/apply-director', protected: true }
        : directorStatus === 'suspended'
          ? { icon: 'alert-circle-outline', label: 'Director Access', sub: 'Suspended',            route: '/apply-director', protected: true }
          : { icon: 'construct-outline', label: 'Become a Director', sub: 'Apply to run tournaments', route: '/apply-director', protected: true };

  const items: MenuItem[] = [
    { icon: 'trophy-outline',        label: 'My Tournaments',  sub: 'View registrations & holds',  route: '/my-tournaments',            protected: true  },
    { icon: 'pricetag-outline',      label: 'My Listings',     sub: 'Manage your Marketplace listings', route: '/marketplace/my-listings', protected: true },
    { icon: 'wallet-outline',        label: 'Wallet',          sub: 'Credits, memberships & offers', route: '/wallet',                  protected: true, feature: 'wallet' },
    { icon: 'school-outline',        label: 'Lesson Marketplace', sub: 'Browse coach offers',        route: '/lessons', feature: 'lessonMarketplace' },
    directorRow,
    { ...coachRow, feature: 'coachMarketplace' },
    // Routes to manage, not apply: the manage screen offers the application
    // when you run nothing yet, so one row serves both states.
    { icon: 'business-outline',      label: 'My Facility', sub: 'Manage your courts and staff', route: '/facility/manage', protected: true },
    { icon: 'people-outline',        label: 'My Connections',  sub: 'Partner Finder connections',  route: '/match/connections', protected: true },
    { icon: 'notifications-outline', label: 'Notifications',   sub: 'Manage alerts',               route: '/notifications-settings' },
    { icon: 'card-outline',          label: 'Payment History', sub: 'Holds & entries',             route: '/payments-settings',         protected: true  },
    { icon: 'settings-outline',      label: 'Settings',        sub: 'Account & preferences',       route: '/account-settings' },
  ];

  return items.filter((item) => !item.feature || isFeatureEnabled(item.feature));
}

// â”€â”€â”€ Rating box â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type RatingInfo = { value: string; label: string; sublabel: string | null };

function getRatingInfo(profile: UserProfile | null): RatingInfo {
  if (!profile) return { value: 'NR', label: 'NOT RATED', sublabel: null };
  if (profile.dupr != null) {
    return {
      value:    Number(profile.dupr).toFixed(2),
      label:    'DUPR',
      sublabel: profile.dupr_verified ? 'Verified' : null,
    };
  }
  if (profile.self_rating) {
    return { value: profile.self_rating, label: 'SELF RATED', sublabel: null };
  }
  if (profile.skill_level) {
    return { value: profile.skill_level, label: 'SKILL LEVEL', sublabel: null };
  }
  return { value: 'NR', label: 'NOT RATED', sublabel: null };
}

// â”€â”€â”€ Detail row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function DetailRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[dr.row, last && dr.rowLast]}>
      <Text style={dr.label}>{label}</Text>
      <Text style={dr.value} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const dr = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 14, paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  rowLast: { borderBottomWidth: 0 },
  label: { color: colors.textSub, fontSize: 12, fontWeight: '600', width: 110, paddingTop: 1 },
  value: { color: colors.text, fontSize: 13, fontWeight: '600', flex: 1 },
});

// â”€â”€â”€ Guest state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function GuestView({ insets }: { insets: { bottom: number } }) {
  return (
    <View style={[g.root, { paddingBottom: insets.bottom + 32 }]}>
      <View style={g.iconCircle}>
        <Ionicons name="person-outline" size={36} color={colors.gold} />
      </View>
      <Text style={g.title}>Welcome to Pickleball App</Text>
      <Text style={g.sub}>
        Log in to manage tournaments, registrations, partner connections, and profile settings.
      </Text>
      <TouchableOpacity style={g.primaryBtn} activeOpacity={0.85} onPress={() => router.push('/sign-in' as never)}>
        <Text style={g.primaryBtnText}>Log In / Sign Up</Text>
      </TouchableOpacity>
      <TouchableOpacity style={g.secondaryBtn} activeOpacity={0.7} onPress={() => router.push('/(tabs)/tournaments' as never)}>
        <Text style={g.secondaryBtnText}>Explore Tournaments</Text>
      </TouchableOpacity>
    </View>
  );
}

const g = StyleSheet.create({
  root: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32, gap: 0,
  },
  iconCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder,
    alignItems: 'center', justifyContent: 'center', marginBottom: 24,
  },
  title:  { color: colors.navy, fontSize: 22, fontWeight: '900', textAlign: 'center', marginBottom: 12 },
  sub:    { color: colors.textSub, fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  primaryBtn: {
    width: '100%', backgroundColor: colors.navy,
    borderRadius: radius.button, paddingVertical: 15,
    alignItems: 'center', marginBottom: 12,
  },
  primaryBtnText:   { color: colors.white, fontSize: 16, fontWeight: '800' },
  secondaryBtn:     { paddingVertical: 10 },
  secondaryBtnText: { color: colors.gold, fontSize: 15, fontWeight: '700' },
});

// â”€â”€â”€ Screen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, loading, profile, status: profileStatus } = useProfile();

  useEffect(() => {
    if (!loading && !user) router.replace('/onboarding/welcome' as never);
  }, [user, loading]);

  const [tournamentCount, setTournamentCount] = useState(0);
  const { setTriggerVisible } = useSlideMenu();

  // Hide the floating hamburger trigger while this screen is focused â€” the
  // Profile tab is itself a primary destination, no menu access needed here.
  // Restored on blur.
  useFocusEffect(
    useCallback(() => {
      setTriggerVisible(false);
      return () => setTriggerVisible(true);
    }, [setTriggerVisible]),
  );

  useEffect(() => {
    let active = true;

    if (!user?.id) {
      setTournamentCount(0);
      return () => {
        active = false;
      };
    }

    fetchPlayerRegistrations(user.id)
      .then((regs) => {
        if (active) setTournamentCount(regs.length);
      })
      .catch((error) => {
        if (active) setTournamentCount(0);
        console.error('[ProfileScreen] registrations load failed:', error);
      });

    return () => {
      active = false;
    };
  }, [user?.id]);

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';
  const locationLine = [profile?.location_city, profile?.location_state].filter(Boolean).join(', ');
  const rating = getRatingInfo(profile);
  const displayAvatarUrl = profile?.avatar_url ?? null;
  const completion = getProfileCompletion(profile);
  const profileError = profileStatus === 'error' && user?.id
    ? `userId: ${user.id} - profile could not be loaded`
    : null;
  const menuItems = getMenuItems(
    profile?.is_director ? (profile.director_status ?? null) : null,
    profile?.is_coach ? (profile.coach_status ?? null) : null,
  );

  const detailRows: { label: string; value: string }[] = [
    profile?.skill_level  ? { label: 'Skill Level',   value: profile.skill_level }  : null,
    profile?.self_rating  ? { label: 'Self Rating',   value: profile.self_rating }  : null,
    playStyleSummary(profile?.play_style) ? { label: 'Playing Style', value: playStyleSummary(profile?.play_style)! } : null,
    profile?.hand         ? { label: 'Hand',           value: profile.hand.charAt(0).toUpperCase() + profile.hand.slice(1) } : null,
    profile?.availability ? { label: 'Availability',  value: profile.availability } : null,
  ].filter((r): r is { label: string; value: string } => r !== null);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>Profile</Text>
        </View>
      </View>

      {/* â”€â”€ Guest state â”€â”€ */}
      {!user ? (
        <GuestView insets={insets} />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: tabBarClearance(insets.bottom) }}
        >
          {!!profileError && (
            <View style={{ backgroundColor: '#fee', borderRadius: 8, padding: 12, marginBottom: 12 }}>
              <Text style={{ color: '#c00', fontSize: 12, fontFamily: 'monospace' }}>{profileError}</Text>
            </View>
          )}
          {/* â”€â”€ Avatar card â”€â”€ */}
          <View style={styles.profileCard}>
            <View>
              <ProfileCompletionRing percent={completion} size={64} strokeWidth={3}>
                {displayAvatarUrl ? (
                  <Image source={{ uri: displayAvatarUrl }} style={styles.avatarImg} />
                ) : (
                  <View style={styles.avatar}>
                    <Text style={styles.avatarInitials}>{initials}</Text>
                  </View>
                )}
              </ProfileCompletionRing>
              <View style={styles.completionBadge}>
                <Text style={styles.completionBadgeText}>{completion}%</Text>
              </View>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.playerName} numberOfLines={2}>{(profile?.full_name ?? '—').toUpperCase()}</Text>
              {!!profile?.handle && (
                <Text style={styles.playerHandle} numberOfLines={1}>@{profile.handle}</Text>
              )}
              {!!locationLine && (
                <Text style={styles.playerSub} numberOfLines={1}>{locationLine}</Text>
              )}
            </View>
            <View style={{ alignItems: 'center' }}>
              <View style={styles.ratingBox}>
                <Text style={styles.ratingLabel}>{rating.label}</Text>
                <Text style={styles.ratingValue}>{rating.value}</Text>
                {!!rating.sublabel && <Text style={styles.ratingVerified}>{rating.sublabel}</Text>}
              </View>
              {(profile?.director_status === 'approved' || profile?.is_director) && (
                <View style={[styles.directorBadge, { marginTop: 6 }]}>
                  <Ionicons name="shield-checkmark" size={10} color={colors.gold} />
                  <Text style={styles.directorBadgeText}>Director</Text>
                </View>
              )}
            </View>
          </View>

          {/* â”€â”€ Stats row â”€â”€ */}
          <View style={styles.statsRow}>
            {[
              { label: 'EVENTS',      value: String(tournamentCount) },
              { label: 'WIN RATE',    value: '58%' },
              { label: 'PARTNERS',    value: '4' },
            ].map((s) => (
              <View key={s.label} style={styles.statBox}>
                <Text style={styles.statValue}>{s.value}</Text>
                <Text
                  style={styles.statLabel}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  {s.label}
                </Text>
              </View>
            ))}
          </View>

          {/* â”€â”€ Bio â”€â”€ */}
          {!!profile?.bio && (
            <View style={styles.infoCard}>
              <Text style={styles.infoCardTitle}>Bio</Text>
              <View style={styles.infoCardDivider} />
              <Text style={styles.bioText}>{profile.bio}</Text>
            </View>
          )}

          {/* â”€â”€ Player details â”€â”€ */}
          {detailRows.length > 0 && (
            <View style={styles.infoCard}>
              <Text style={styles.infoCardTitle}>Player Details</Text>
              <View style={styles.infoCardDivider} />
              {detailRows.map((row, i) => (
                <DetailRow key={row.label} label={row.label} value={row.value} last={i === detailRows.length - 1} />
              ))}
            </View>
          )}

          {/* â”€â”€ Menu â”€â”€ */}
          <View style={styles.menu}>
            {menuItems.map((item, i) => (
              <SettingsRow
                key={item.label}
                icon={item.icon}
                label={item.label}
                sub={item.sub}
                last={i === menuItems.length - 1}
                onPress={
                  item.comingSoon
                    ? () => Alert.alert('Coming Soon', 'Match history will be available in a future update.')
                    : item.route
                      ? () => requireAuth(user?.id, () => router.push(item.route as never))
                      : undefined
                }
              />
            ))}
          </View>

          {/* â”€â”€ Sign out â”€â”€ */}
          <TouchableOpacity
            style={styles.signOutBtn}
            onPress={() =>
              Alert.alert('Sign out', 'Are you sure you want to sign out?', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Sign out', style: 'destructive',
                  onPress: async () => {
                    try {
                      await signOut();
                      router.replace('/sign-in' as never);
                    } catch (e: any) {
                      Alert.alert('Sign out failed', e.message ?? 'Please try again.');
                    }
                  },
                },
              ])
            }
            activeOpacity={0.7}
          >
            <Ionicons name="log-out-outline" size={16} color={colors.danger} />
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },

  // Mirrors the Explore (Nearby) header: large title + subtitle, hamburger-cleared.
  header: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingHorizontal: spacing.screenH, paddingTop: 10, paddingBottom: 14,
  },
  headerLeft: { flex: 1 },
  title: { color: colors.navy, fontSize: 28, fontWeight: '900', lineHeight: 32 },

  profileCard: {
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.card, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14,
    marginBottom: 12,
  },
  avatar: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: colors.navy,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarImg: { width: 52, height: 52, borderRadius: 26 },
  completionBadge: {
    position: 'absolute', bottom: -4, alignSelf: 'center',
    backgroundColor: colors.navy, borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1,
    borderWidth: 1.5, borderColor: colors.bg,
  },
  completionBadgeText: { color: colors.white, fontSize: 9, fontWeight: '800' },
  avatarInitials:  { color: colors.white, fontSize: 18, fontWeight: '800' },
  playerName:      { color: colors.text, fontSize: 16, fontWeight: '800', marginBottom: 2, letterSpacing: 0.3, lineHeight: 19 },
  playerHandle:    { color: colors.textSub, fontSize: 12, fontWeight: '500', marginBottom: 2 },
  playerSub:       { color: colors.textSub, fontSize: 12, fontWeight: '500' },
  directorBadge:     { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, borderWidth: 1, borderColor: colors.goldBorder, backgroundColor: colors.goldBg },
  directorBadgeText: { color: colors.gold, fontSize: 9, fontWeight: '700', letterSpacing: 0.3 },

  ratingBox: {
    alignItems: 'center', backgroundColor: colors.goldBg,
    borderWidth: 1, borderColor: colors.goldBorder, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 6, minWidth: 64,
  },
  ratingLabel:    { color: colors.gold, fontSize: 7, fontWeight: '800', letterSpacing: 0.8 },
  ratingValue:    { color: colors.gold, fontSize: 18, fontWeight: '900' },
  ratingVerified: { color: colors.gold, fontSize: 7, fontWeight: '700', letterSpacing: 0.5, marginTop: 2 },

  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statBox: {
    flex: 1, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.card, paddingVertical: 12, paddingHorizontal: 4, alignItems: 'center',
  },
  statValue: { color: colors.text, fontSize: 20, fontWeight: '900', marginBottom: 3 },
  statLabel: { color: colors.textSub, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },

  infoCard: {
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.card, overflow: 'hidden', marginBottom: 12,
  },
  infoCardTitle: {
    color: colors.navy, ...typography.cardTitle,
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8,
  },
  infoCardDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  bioText: {
    color: colors.text, fontSize: 13, lineHeight: 20,
    paddingHorizontal: 14, paddingVertical: 12,
  },

  menu: {
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.card, overflow: 'hidden', marginBottom: 16,
  },

  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14,
  },
  signOutText: { color: colors.danger, fontSize: 15, fontWeight: '600' },
});
