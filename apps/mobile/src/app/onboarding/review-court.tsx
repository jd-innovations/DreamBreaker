import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { OnboardingScreen, ScreenTitle, OnboardingCTA, OnboardingSkipLink } from '@/lib/onboarding/components';
import { useOnboarding } from '@/lib/onboarding/state';

const L = colors;
const FALLBACK_PHOTO = 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800&h=500&fit=crop&q=80';

// Screen 8 of 14 â€” Review Your Court. Confirms the court picked on screen 7.
export default function ReviewCourtScreen() {
  const { draft } = useOnboarding();
  const court = draft.homeCourt;

  return (
    <OnboardingScreen
      step={7}
      footer={
        <>
          <OnboardingCTA label="Looks good" icon="checkmark" onPress={() => router.push('/onboarding/playing-style')} />
          <OnboardingSkipLink label="Suggest an edit" onPress={() => router.back()} />
        </>
      }
    >
      <ScreenTitle title="Is this your home court?" sub="Help keep our directory accurate for everyone." />

      {court ? (
        <View style={s.card}>
          <Image source={{ uri: court.primaryPhotoUrl ?? FALLBACK_PHOTO }} style={s.photo} resizeMode="cover" />
          <View style={s.body}>
            <View style={s.rowTop}>
              <Text style={s.name} numberOfLines={1}>{court.name}</Text>
              <View style={s.editBadge}>
                <Ionicons name="pencil" size={11} color={L.gold} />
                <Text style={s.editBadgeText}>Edit</Text>
              </View>
            </View>
            <Text style={s.address}>
              {[court.address, [court.city, court.state, court.postal_code].filter(Boolean).join(', ')]
                .filter(Boolean).join('\n')}
            </Text>

            <View style={s.statsRow}>
              <View style={s.statChip}>
                <Text style={s.statChipText}>{court.court_count ?? 0} Courts</Text>
              </View>
              <View style={s.statChip}>
                <Text style={s.statChipText}>{court.public_access ? 'Open Play' : 'Members Only'}</Text>
              </View>
              <View style={s.statChip}>
                <Text style={s.statChipText}>{court.lighting ? 'Lights' : 'No Lights'}</Text>
              </View>
            </View>
          </View>
        </View>
      ) : (
        <View style={s.emptyCard}>
          <Ionicons name="alert-circle-outline" size={28} color={L.textSub} />
          <Text style={s.emptyText}>No court selected â€” go back and choose one.</Text>
        </View>
      )}
    </OnboardingScreen>
  );
}

const s = StyleSheet.create({
  card: {
    borderWidth: 1, borderColor: L.border, borderRadius: shape.card,
    overflow: 'hidden', backgroundColor: L.bg,
  },
  photo: { width: '100%', height: 160, backgroundColor: L.page },
  body: { padding: spacing.lg },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  name: { fontSize: text.titleSm.size, fontWeight: '800', color: L.text, flex: 1, marginRight: spacing.sm },
  editBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: L.goldLight, borderRadius: shape.pill, paddingHorizontal: 8, paddingVertical: 3,
  },
  editBadgeText: { fontSize: 10, fontWeight: '800', color: L.gold },
  address: { fontSize: text.caption.size, fontWeight: '500', color: L.textSub, lineHeight: 19, marginBottom: spacing.md },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statChip: {
    borderWidth: 1, borderColor: L.border, borderRadius: shape.pill,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
  },
  statChipText: { fontSize: text.chipValue.size, fontWeight: '800', color: L.textSub },
  emptyCard: {
    alignItems: 'center', gap: spacing.sm, padding: spacing.xxxl,
    borderWidth: 1, borderColor: L.border, borderRadius: shape.card,
  },
  emptyText: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', textAlign: 'center' },
});
