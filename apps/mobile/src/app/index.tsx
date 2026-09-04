import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Redirect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSession } from '@/hooks/useSession';
import { useProfile, reloadProfile } from '@/hooks/useProfile';
import { resolveAuthGate } from '@/lib/authGate';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';

// The app's entry gate. Replaces the previous unconditional
// `<Redirect href="/(tabs)" />`, which dropped fresh installs straight into the
// authenticated app chrome without ever showing onboarding.
//
// Rendering `<Redirect>` rather than calling router.replace() in an effect is
// deliberate: the decision is applied during render, so there is no frame where
// an authenticated-only screen is mounted for a signed-out user, and no effect
// ordering race against useFeatureRouteGuard or useExternalLinks.
export default function Index() {
  const { loading: sessionLoading, isAuthenticated } = useSession();
  const { profile, status } = useProfile();

  const gate = resolveAuthGate({
    sessionLoading,
    isAuthenticated,
    profileStatus: status,
    profile,
  });

  if (gate.state === 'loading') {
    return (
      <View style={s.center}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color={colors.gold} />
      </View>
    );
  }

  if (gate.state === 'error') {
    return (
      <View style={s.center}>
        <StatusBar style="light" />
        <Text style={s.errorTitle}>Couldn&apos;t load your profile</Text>
        <Text style={s.errorBody}>
          You&apos;re signed in, but we couldn&apos;t reach your profile. Check your connection and try again.
        </Text>
        <TouchableOpacity style={s.retryBtn} activeOpacity={0.85} onPress={reloadProfile}>
          <Text style={s.retryText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return <Redirect href={gate.href as never} />;
}

const s = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.xl,
  },
  errorTitle: {
    color: colors.white,
    fontSize: text.titleSm.size,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  errorBody: {
    color: colors.textSub,
    fontSize: text.body.size, fontWeight: '500',
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  retryBtn: {
    borderRadius: shape.cta,
    borderWidth: 1,
    borderColor: colors.gold,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  retryText: { color: colors.gold, fontSize: text.body.size, fontWeight: '500' },
});
