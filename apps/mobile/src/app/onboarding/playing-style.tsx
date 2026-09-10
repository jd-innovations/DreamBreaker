// The "playing style" step, rebuilt on the shared play-profile vocabulary.
//
// It previously offered ten options from lib/onboarding/mockData's
// PLAYING_STYLE_OPTIONS -- Competitive, Recreational, Social, Tournament Play,
// Ladder, Round Robin, Mixed Doubles, Men's Doubles, Women's Doubles, Singles.
// Every one of those is a FORMAT or an INTENSITY. Not one is a play style, so
// profiles.play_style came back null for every user who ever onboarded, while
// the screen was titled "How do you like to play?".
//
// The cause was a half-finished migration, not a coding mistake. ceb001b
// defined the three key sets in packages/shared; 0ce5458 adopted them in
// edit-profile.tsx, players/[id].tsx and lib/onboarding/finalize.ts -- but not
// here. So finalize's splitPlayingStyle() was taught to sort selections into
// play_style / preferred_formats / play_intensity while the screen feeding it
// still offered the pre-migration list. It sorted correctly and found no
// styles, every time.
//
// Three questions, asked as three groups, because that is what the columns
// are (PLAY_STYLE_VOCABULARY.md):
//   how you play    -> play_style        text[]  multi
//   what you play   -> preferred_formats text[]  multi
//   how seriously   -> play_intensity    text    SINGLE, values are exclusive
//
// The draft still holds ONE flat string[] (draft.playingStyle) on purpose:
// splitPlayingStyle() already partitions by key set, so it keeps working
// untouched and there is no migration of in-flight drafts. The grouping is a
// property of the keys, not of the storage.
//
// Text chips rather than the old icon cards: packages/shared ships no icons by
// design (ceb001b -- Phosphor on web, Ionicons on mobile, and it must bundle
// for Hermes), 18 icon cards do not fit a phone, and edit-profile.tsx already
// renders these exact keys as text chips. Matching it means the same vocabulary
// looks the same in both places.

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { OnboardingCTA, OnboardingEntrance, OnboardingProgressBar } from '@/lib/onboarding/components';
import { useOnboarding, validators } from '@/lib/onboarding/state';
import {
  PLAY_STYLE_KEYS, PLAY_STYLE_LABELS,
  PREFERRED_FORMAT_KEYS, PREFERRED_FORMAT_LABELS,
  PLAY_INTENSITY_KEYS, PLAY_INTENSITY_LABELS,
} from '@shared/play-profile';

const L = colors;
const PAGE_BG = '#F8F5EF';

/** Per-axis, not one shared cap. A single cap of 3 across all three questions
 *  is why a user could answer "what" and "how seriously" and never be asked
 *  "how" -- observed on a real profile: preferred_formats and play_intensity
 *  set, play_style empty. */
const MAX_STYLES = 3;
const MAX_FORMATS = 3;

const INTENSITY_KEYS: readonly string[] = PLAY_INTENSITY_KEYS;

export default function PlayingStyleScreen() {
  const insets = useSafeAreaInsets();
  const { draft, update } = useOnboarding();
  const canContinue = validators.playingStyle(draft);

  const selected = draft.playingStyle;
  const countIn = (keys: readonly string[]) => selected.filter((k) => keys.includes(k)).length;

  function toggleMulti(key: string, group: readonly string[], max: number) {
    if (selected.includes(key)) {
      update('playingStyle', selected.filter((k) => k !== key));
      return;
    }
    if (countIn(group) >= max) return;
    update('playingStyle', [...selected, key]);
  }

  // Intensity is single-valued: the three are mutually exclusive, and
  // splitPlayingStyle() takes the FIRST match, so leaving two selectable would
  // silently discard one. Tapping the active chip clears it.
  function selectIntensity(key: string) {
    const withoutIntensity = selected.filter((k) => !INTENSITY_KEYS.includes(k));
    update('playingStyle', selected.includes(key) ? withoutIntensity : [...withoutIntensity, key]);
  }

  return (
    <View style={[s.root, { paddingTop: insets.top + 8 }]}>
      <View style={s.header}>
        <TouchableOpacity
          style={s.backBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={L.navy} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        <OnboardingEntrance style={s.titleBlock}>
          <Text style={s.title}>How do you like to play?</Text>
          <Text style={s.subtitle}>This helps us match you with the right players and games.</Text>
        </OnboardingEntrance>

        <Section
          title="Your style"
          hint={`Pick up to ${MAX_STYLES}`}
          keys={PLAY_STYLE_KEYS}
          labels={PLAY_STYLE_LABELS}
          selected={selected}
          atCap={countIn(PLAY_STYLE_KEYS) >= MAX_STYLES}
          onPress={(k) => toggleMulti(k, PLAY_STYLE_KEYS, MAX_STYLES)}
        />

        <Section
          title="What you play"
          hint={`Pick up to ${MAX_FORMATS}`}
          keys={PREFERRED_FORMAT_KEYS}
          labels={PREFERRED_FORMAT_LABELS}
          selected={selected}
          atCap={countIn(PREFERRED_FORMAT_KEYS) >= MAX_FORMATS}
          onPress={(k) => toggleMulti(k, PREFERRED_FORMAT_KEYS, MAX_FORMATS)}
        />

        <Section
          title="How seriously"
          hint="Pick one"
          keys={PLAY_INTENSITY_KEYS}
          labels={PLAY_INTENSITY_LABELS}
          selected={selected}
          atCap={false}
          onPress={selectIntensity}
        />
      </ScrollView>

      <View style={[s.footer, { paddingBottom: insets.bottom + 16 }]}>
        <OnboardingProgressBar progress={90} />
        <OnboardingCTA label="Continue" disabled={!canContinue} onPress={() => router.push('/onboarding/all-set')} />
      </View>
    </View>
  );
}

function Section({
  title, hint, keys, labels, selected, atCap, onPress,
}: {
  title: string;
  hint: string;
  keys: readonly string[];
  labels: Record<string, string>;
  selected: string[];
  atCap: boolean;
  onPress: (key: string) => void;
}) {
  return (
    <OnboardingEntrance style={s.section}>
      <View style={s.sectionHead}>
        <Text style={s.sectionTitle}>{title}</Text>
        <Text style={s.sectionHint}>{hint}</Text>
      </View>
      <View style={s.chipWrap}>
        {keys.map((key) => {
          const active = selected.includes(key);
          // Only greys out chips that CANNOT be added; an active chip must stay
          // pressable so a full group can still be changed rather than reset.
          const disabled = atCap && !active;
          return (
            <TouchableOpacity
              key={key}
              style={[s.chip, active && s.chipActive, disabled && s.chipDisabled]}
              activeOpacity={0.75}
              disabled={disabled}
              onPress={() => onPress(key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active, disabled }}
              accessibilityLabel={labels[key] ?? key}
            >
              <Text style={[s.chipText, active && s.chipTextActive, disabled && s.chipTextDisabled]}>
                {labels[key] ?? key}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </OnboardingEntrance>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: PAGE_BG },
  header: { height: 40, justifyContent: 'center', paddingHorizontal: spacing.lg },
  backBtn: { width: 36, height: 36, alignItems: 'flex-start', justifyContent: 'center' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  titleBlock: { alignItems: 'center', marginBottom: spacing.lg },
  title: {
    color: L.navy, fontSize: text.pageTitle.size, lineHeight: 36,
    fontWeight: '900', textAlign: 'center', maxWidth: 330, marginBottom: spacing.xs,
  },
  subtitle: {
    color: '#7F8AA3', fontSize: text.body.size, fontWeight: '500',
    lineHeight: 22, textAlign: 'center',
  },
  section: { marginBottom: spacing.lg },
  sectionHead: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    color: L.navy, fontSize: text.titleSm.size, fontWeight: '800',
  },
  sectionHint: {
    color: '#7F8AA3', fontSize: text.caption.size, fontWeight: '600',
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    borderWidth: 1, borderColor: '#E7DED0', borderRadius: shape.pill,
    backgroundColor: 'rgba(255,255,255,0.86)',
    paddingHorizontal: 14, paddingVertical: 9,
  },
  chipActive: { borderColor: L.gold, backgroundColor: 'rgba(255,255,255,0.98)' },
  chipDisabled: { opacity: 0.45 },
  chipText: {
    color: L.navy, fontSize: text.chipValue.size, fontWeight: '700',
  },
  chipTextActive: { color: L.gold },
  chipTextDisabled: { color: '#7F8AA3' },
  footer: {
    paddingHorizontal: spacing.lg, paddingTop: spacing.md,
    backgroundColor: PAGE_BG, gap: spacing.md,
  },
});
