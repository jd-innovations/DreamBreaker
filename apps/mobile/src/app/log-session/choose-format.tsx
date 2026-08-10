import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from '@/components/AppIcon';
import { PrimaryButton } from '@/components/PrimaryButton';
import { clearLogSession, setSessionFormat, type SessionFormat } from '@/lib/logSessionStore';
import { colors, radius, spacing, typography } from '@/theme';

type Format = SessionFormat;

const FORMATS: { key: Format; icon: 'people'; label: string; sub: string }[] = [
  { key: 'doubles', icon: 'people', label: 'Doubles', sub: 'Two vs Two' },
  { key: 'singles', icon: 'people', label: 'Singles', sub: 'One vs One' },
];

export default function ChooseFormatScreen() {
  const insets = useSafeAreaInsets();
  const [format, setFormat] = useState<Format>('doubles');

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={colors.navy} />
        </TouchableOpacity>
        <Text style={styles.title}>Choose Format</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.body}>
        <Text style={styles.question}>What type of game are you playing?</Text>

        <View style={styles.options}>
          {FORMATS.map((option) => {
            const active = format === option.key;
            return (
              <TouchableOpacity
                key={option.key}
                style={[styles.option, active && styles.optionActive]}
                onPress={() => setFormat(option.key)}
                activeOpacity={0.85}
              >
                <View style={[styles.optionIcon, active && styles.optionIconActive]}>
                  <AppIcon name={option.icon} size={22} color={active ? colors.gold : colors.textSub} />
                </View>
                <View style={styles.optionText}>
                  <Text style={styles.optionLabel}>{option.label}</Text>
                  <Text style={styles.optionSub}>{option.sub}</Text>
                </View>
                {active ? (
                  <View style={styles.checkCircle}>
                    <Ionicons name="checkmark" size={14} color={colors.white} />
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.noteRow}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textSub} />
          <Text style={styles.noteText}>You can change this later if needed.</Text>
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <PrimaryButton
          label="Next"
          style={styles.nextButton}
          textStyle={styles.nextButtonText}
          onPress={() => {
            clearLogSession();
            setSessionFormat(format);
            router.push('/log-session/add-players');
          }}
        />
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
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.sectionTitle, color: colors.navy, fontSize: 17 },
  body: { flex: 1, paddingHorizontal: spacing.screenH, paddingTop: spacing.md },
  question: {
    ...typography.body,
    color: colors.textSub,
    fontSize: 15,
    marginBottom: spacing.lg,
  },
  options: { gap: spacing.md },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: spacing.md,
    backgroundColor: colors.bg,
  },
  optionActive: {
    borderColor: colors.gold,
    backgroundColor: colors.goldLight,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.page,
  },
  optionIconActive: {
    backgroundColor: colors.goldBg,
  },
  optionText: { flex: 1 },
  optionLabel: {
    ...typography.cardTitle,
    color: colors.navy,
    fontSize: 16,
  },
  optionSub: {
    ...typography.metadata,
    color: colors.textSub,
    marginTop: 2,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gold,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.lg,
  },
  noteText: {
    ...typography.metadata,
    color: colors.textSub,
  },
  footer: {
    paddingHorizontal: spacing.screenH,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  nextButton: {
    backgroundColor: colors.gold,
  },
  nextButtonText: {
    color: colors.navy,
  },
});