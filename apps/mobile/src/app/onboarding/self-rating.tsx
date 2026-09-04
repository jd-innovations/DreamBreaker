import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, gradients, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { OnboardingCTA, OnboardingProgressBar, selectWithHaptic } from '@/lib/onboarding/components';
import { useOnboarding, validators } from '@/lib/onboarding/state';
import { SELF_RATING_OPTIONS } from '@/lib/onboarding/mockData';
import { DateOfBirthField } from '@/lib/onboarding/DateOfBirthField';

const L = colors;
const SCREEN_BG = '#FFFFFF';
// Screen 2 - Profile setup defaults. These pre-selected choices keep onboarding
// lightweight while still letting players tune their matching profile up front.
export default function SelfRatingScreen() {
  const insets = useSafeAreaInsets();
  const { draft, update } = useOnboarding();
  const canContinue = validators.selfRating(draft);

  return (
    <LinearGradient colors={gradients.appLight} style={s.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scrollContent, { paddingTop: insets.top + 24, paddingBottom: 180 + insets.bottom }]}
      >
        <View style={s.titleBlock}>
          <Text style={s.title}>Lets Set Up Your Profile</Text>
          <Text style={s.subtitle}>we have pre-selected few settings to get you started</Text>
        </View>

        <Section title="Skill Level">
          <View style={s.chipGrid}>
            {SELF_RATING_OPTIONS.map(opt => (
              <SetupChip
                key={opt.key}
                label={opt.label}
                selected={draft.selfRating === opt.key}
                onPress={() => update('selfRating', opt.key)}
              />
            ))}
          </View>
        </Section>

        <Section title="Date of Birth">
          <DateOfBirthField value={draft.dateOfBirth} onChange={iso => update('dateOfBirth', iso)} />
          <View style={s.noteRow}>
            <Ionicons name="lock-closed-outline" size={14} color={L.textSub} />
            <Text style={s.noteText}>Only you can see your birthday.</Text>
          </View>
        </Section>
      </ScrollView>

      <View style={[s.footer, { paddingBottom: insets.bottom + 16 }]}>
        <OnboardingProgressBar progress={18} />
        <OnboardingCTA label="Continue" disabled={!canContinue} onPress={() => router.push('/onboarding/gender')} />
      </View>
    </LinearGradient>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function SetupChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[s.chip, selected && s.chipSelected]}
      onPress={() => selectWithHaptic(selected, onPress)}
      activeOpacity={0.75}
    >
      <Text style={[s.chipText, selected && s.chipTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: SCREEN_BG },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.xxl,
    justifyContent: 'center',
  },
  titleBlock: { marginBottom: spacing.xxxl },
  title: { color: L.navy, fontSize: text.pageTitle.size, fontWeight: '900', lineHeight: 36, textAlign: 'center' },
  subtitle: { color: '#7F8AA3', fontSize: text.body.size, fontWeight: '500', lineHeight: 22, textAlign: 'center', marginTop: spacing.sm },
  section: { marginBottom: spacing.xxxl },
  sectionTitle: { color: L.navy, fontSize: text.sectionTitle.size, fontWeight: '900', marginBottom: spacing.md },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md },
  noteText: { fontSize: text.caption.size, fontWeight: '500', color: L.textSub },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    borderWidth: 1.5,
    borderColor: '#D8DEEA',
    borderRadius: shape.pill,
    backgroundColor: L.white,
    paddingHorizontal: spacing.lg,
    paddingVertical: 11,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: L.gold, borderColor: L.gold },
  chipText: { color: L.navy, fontSize: text.rowValue.size, fontWeight: '800' },
  chipTextSelected: { color: L.navy },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.86)',
    gap: spacing.md,
  },
  progressCard: {
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderRadius: 22,
    paddingHorizontal: spacing.xxxl,
    paddingVertical: spacing.lg,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#E8E3D9',
    justifyContent: 'center',
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    width: '18%',
    height: 8,
    borderRadius: 999,
    backgroundColor: L.gold,
  },
  progressKnob: {
    position: 'absolute',
    left: '18%',
    width: 34,
    height: 34,
    marginLeft: -17,
    borderRadius: 17,
    backgroundColor: L.gold,
    borderWidth: 2,
    borderColor: '#F4E6BC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressKnobText: { color: L.white, fontSize: text.fieldLabel.size, fontWeight: '800', letterSpacing: -1 },
});