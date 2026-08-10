import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { colors, spacing, radius } from '@/theme';
import { OnboardingScreen, OnboardingCTA, OnboardingSkipLink, ScreenTitle } from '@/lib/onboarding/components';
import { useOnboarding } from '@/lib/onboarding/state';
import { useCurrentLocation } from '@/lib/location';

const L = colors;

// Screen 6 of 14 â€” Enable Location. Skippable. Reuses the existing
// useCurrentLocation() hook (apps/mobile/src/lib/location.ts) for the real
// permission flow â€” note that hook already requests permission on mount, so
// the OS prompt may appear as soon as this screen renders.
export default function EnableLocationScreen() {
  const { update } = useOnboarding();
  const { permissionStatus, loading, isFallback, refresh } = useCurrentLocation();

  // Reflect the hook's outcome into onboarding state once resolved.
  useEffect(() => {
    if (!loading) update('locationEnabled', !isFallback);
  }, [loading, isFallback, update]);

  function continueNext() {
    router.push('/onboarding/playing-style');
  }

  return (
    <OnboardingScreen
      step={5}
      footer={
        <>
          <OnboardingCTA
            label={loading ? 'Requestingâ€¦' : permissionStatus === 'granted' ? 'Continue' : 'Enable Location'}
            onPress={async () => {
              if (permissionStatus === 'granted') { continueNext(); return; }
              await refresh();
            }}
            disabled={loading}
          />
          <OnboardingSkipLink label="Maybe Later" onPress={continueNext} />
        </>
      }
    >
      <View style={s.iconWrap}>
        <Ionicons name="location" size={40} color={L.gold} />
      </View>
      <ScreenTitle title="Find players and games near you" sub="Help keep our directory accurate for everyone." />

      <View style={s.benefit}>
        <Ionicons name="people-outline" size={18} color={L.gold} />
        <Text style={s.benefitText}>See nearby courts and players</Text>
      </View>
      <View style={s.benefit}>
        <Ionicons name="search-outline" size={18} color={L.gold} />
        <Text style={s.benefitText}>Discover open games near you</Text>
      </View>
      <View style={s.benefit}>
        <Ionicons name="navigate-outline" size={18} color={L.gold} />
        <Text style={s.benefitText}>Get directions with one tap</Text>
      </View>
    </OnboardingScreen>
  );
}

const s = StyleSheet.create({
  iconWrap: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: L.goldLight,
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: spacing.xl,
  },
  benefit: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    borderWidth: 1, borderColor: L.border, borderRadius: radius.card,
    padding: spacing.lg, marginBottom: spacing.sm, backgroundColor: L.bg,
  },
  benefitText: { fontSize: 14, fontWeight: '600', color: L.text, flex: 1 },
});
