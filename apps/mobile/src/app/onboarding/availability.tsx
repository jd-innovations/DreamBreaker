import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '@/theme';
import { AppIcon, type AppIconName } from '@/components';
import { OnboardingCTA, OnboardingEntrance, OnboardingPressableCard, OnboardingProgressBar } from '@/lib/onboarding/components';
import { useOnboarding, validators } from '@/lib/onboarding/state';
import { AVAILABILITY_OPTIONS } from '@/lib/onboarding/mockData';

const L = colors;
const PAGE_BG = '#F8F5EF';

export default function AvailabilityScreen() {
  const insets = useSafeAreaInsets();
  const { draft, toggleInList } = useOnboarding();
  const canContinue = validators.availability(draft);

  return (
    <View style={[s.root, { paddingTop: insets.top + 8 }]}> 
      <View style={s.header}>
        <TouchableOpacity
          style={s.backBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={26} color={L.navy} />
        </TouchableOpacity>
      </View>

      <View style={s.content}>
        <OnboardingEntrance style={s.titleBlock}>
          <Text style={s.title}>When are you usually available to play?</Text>
          <Text style={s.subtitle}>Select all that apply.</Text>
        </OnboardingEntrance>

        <View style={s.grid}>
          {AVAILABILITY_OPTIONS.map((opt, index) => (
            <AvailabilityCard
              key={opt.key}
              delay={120 + index * 45}
              label={opt.label}
              icon={opt.icon}
              selected={draft.availability.includes(opt.key)}
              onPress={() => toggleInList('availability', opt.key)}
            />
          ))}
        </View>
      </View>

      <View style={[s.footer, { paddingBottom: insets.bottom + 16 }]}> 
        <OnboardingProgressBar progress={81} />
        <OnboardingCTA label="Continue" disabled={!canContinue} onPress={() => router.push('/onboarding/playing-style')} />
      </View>
    </View>
  );
}

function AvailabilityCard({
  label,
  icon,
  selected,
  delay,
  onPress,
}: {
  label: string;
  icon: AppIconName;
  selected: boolean;
  delay: number;
  onPress: () => void;
}) {
  return (
    <OnboardingEntrance delay={delay} style={s.cardSlot}>
      <OnboardingPressableCard style={s.card} selectedStyle={s.cardSelected} selected={selected} onPress={onPress}>
        {selected && <View style={s.selectedDot} />}
        <AppIcon name={icon} size={24} color={selected ? L.gold : L.navy} />
        <Text style={s.cardText}>{label}</Text>
      </OnboardingPressableCard>
    </OnboardingEntrance>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: PAGE_BG,
  },
  header: {
    height: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  titleBlock: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    color: L.navy,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
    textAlign: 'center',
    maxWidth: 330,
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: '#7F8AA3',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  cardSlot: { width: '47.8%' },
  card: {
    width: '100%',
    minHeight: 92,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E7DED0',
    borderRadius: radius.card,
    backgroundColor: 'rgba(255,255,255,0.86)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  cardSelected: {
    borderColor: L.gold,
    backgroundColor: 'rgba(255,255,255,0.98)',
  },
  selectedDot: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: L.gold,
  },
  cardText: {
    color: L.navy,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: PAGE_BG,
    gap: spacing.md,
  },
});
