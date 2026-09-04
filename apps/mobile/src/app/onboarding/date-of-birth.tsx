import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { text } from '@shared/tokens';
import { OnboardingScreen, ScreenTitle, OnboardingCTA } from '@/lib/onboarding/components';
import { useOnboarding, validators } from '@/lib/onboarding/state';
import { DateOfBirthField } from '@/lib/onboarding/DateOfBirthField';

const L = colors;

// Screen 4 of 14 â€” Date of Birth. Required.
export default function DateOfBirthScreen() {
  const { draft, update } = useOnboarding();
  const canContinue = validators.dateOfBirth(draft);

  return (
    <OnboardingScreen
      step={3}
      footer={
        <OnboardingCTA
          label="Continue"
          disabled={!canContinue}
          onPress={() => router.push('/onboarding/enable-location')}
        />
      }
    >
      <ScreenTitle title="What's your date of birth?" sub="We use this for age-based events and play." />

      <DateOfBirthField value={draft.dateOfBirth} onChange={iso => update('dateOfBirth', iso)} />

      <View style={s.noteRow}>
        <Ionicons name="lock-closed-outline" size={14} color={L.textSub} />
        <Text style={s.noteText}>Only you can see your birthday.</Text>
      </View>
    </OnboardingScreen>
  );
}

const s = StyleSheet.create({
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.lg },
  noteText: { fontSize: text.caption.size, fontWeight: '500', color: L.textSub },
});
