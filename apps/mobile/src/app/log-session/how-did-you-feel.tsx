import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton } from '@/components/PrimaryButton';
import { completeCurrentLogSession } from '@/lib/logSessionPersistence';
import { setSessionNotes } from '@/lib/logSessionStore';
import { colors, radius, spacing, typography } from '@/theme';

type Feeling = 'great' | 'good' | 'average' | 'tired';
type Competitiveness = 'casual' | 'competitive' | 'training' | 'tourney';

const FEELINGS: { key: Feeling; emoji: string; label: string }[] = [
  { key: 'great', emoji: 'Great', label: 'Great!' },
  { key: 'good', emoji: 'Good', label: 'Good' },
  { key: 'average', emoji: 'OK', label: 'Average' },
  { key: 'tired', emoji: 'Tired', label: 'Tired' },
];

const COMPETITIVENESS: { key: Competitiveness; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; label: string }[] = [
  { key: 'casual', icon: 'tennis', label: 'Casual' },
  { key: 'competitive', icon: 'trophy-outline', label: 'Competitive' },
  { key: 'training', icon: 'bullseye-arrow', label: 'Training' },
  { key: 'tourney', icon: 'clipboard-text-outline', label: 'Tourney Practice' },
];

export default function HowDidYouFeelScreen() {
  const insets = useSafeAreaInsets();
  const [feeling, setFeeling] = useState<Feeling>('good');
  const [competitiveness, setCompetitiveness] = useState<Competitiveness>('casual');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSaveSession() {
    setSaving(true);
    const combinedNote = [
      `Feeling: ${feeling}`,
      `Competitiveness: ${competitiveness}`,
      note.trim(),
    ].filter(Boolean).join(' | ');

    try {
      setSessionNotes(combinedNote);
      await completeCurrentLogSession({ notes: combinedNote });
      router.push('/log-session/session-saved');
    } catch (error) {
      console.error('[log-session] complete session failed:', error);
      Alert.alert('Could not save session', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={colors.navy} />
        </TouchableOpacity>
        <Text style={styles.title}>How Did You Feel?</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.body}>
        <Text style={styles.fieldLabel}>How did this session feel?</Text>
        <View style={styles.feelingRow}>
          {FEELINGS.map((option) => {
            const active = feeling === option.key;
            return (
              <TouchableOpacity
                key={option.key}
                style={[styles.feelingOption, active && styles.optionActive]}
                activeOpacity={0.85}
                onPress={() => setFeeling(option.key)}
              >
                <Text style={styles.feelingEmoji}>{option.emoji}</Text>
                <Text style={styles.feelingLabel}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.fieldLabel, { marginTop: spacing.lg }]}>How competitive was it?</Text>
        <View style={styles.competitivenessGrid}>
          {COMPETITIVENESS.map((option) => {
            const active = competitiveness === option.key;
            return (
              <TouchableOpacity
                key={option.key}
                style={[styles.competitivenessOption, active && styles.optionActive]}
                activeOpacity={0.85}
                onPress={() => setCompetitiveness(option.key)}
              >
                <MaterialCommunityIcons name={option.icon} size={22} color={active ? colors.gold : colors.textSub} />
                <Text style={styles.competitivenessLabel} numberOfLines={1}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.fieldLabel, { marginTop: spacing.lg }]}>Anything else? (optional)</Text>
        <View style={styles.noteWrap}>
          <TextInput
            style={styles.noteInput}
            value={note}
            onChangeText={setNote}
            placeholder="Add a note..."
            placeholderTextColor={colors.textSub}
            multiline
          />
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        {saving ? (
          <ActivityIndicator color={colors.gold} />
        ) : (
          <PrimaryButton
            label="Save Session"
            style={styles.saveButton}
            textStyle={styles.saveButtonText}
            onPress={handleSaveSession}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.screenH,
    paddingVertical: 12,
  },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.sectionTitle, color: colors.navy, fontSize: 17 },
  body: { flex: 1, paddingHorizontal: spacing.screenH, paddingTop: spacing.md },
  fieldLabel: {
    ...typography.metadata,
    color: colors.textSub,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  feelingRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  feelingOption: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
  },
  feelingEmoji: { fontSize: 12, fontWeight: '800', color: colors.navy },
  feelingLabel: {
    ...typography.metadata,
    color: colors.navy,
    fontSize: 11,
  },
  competitivenessGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  competitivenessOption: {
    flexBasis: '47%',
    flexGrow: 1,
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  competitivenessLabel: {
    ...typography.metadata,
    color: colors.navy,
    fontSize: 12,
    fontWeight: '600',
  },
  optionActive: {
    borderColor: colors.gold,
    backgroundColor: colors.goldLight,
  },
  noteWrap: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
  },
  noteInput: {
    ...typography.body,
    color: colors.navy,
    fontSize: 14,
  },
  footer: {
    paddingHorizontal: spacing.screenH,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  saveButton: {
    backgroundColor: colors.gold,
  },
  saveButtonText: {
    color: colors.navy,
  },
});
