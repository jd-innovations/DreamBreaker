import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton } from '@/components/PrimaryButton';
import { setRosterSlot, type RosterSlot } from '@/lib/logSessionStore';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';

type Comparison = 'weaker' | 'similar' | 'stronger';
type Amount = 'slightly' | 'much';

const COMPARISONS: { key: Comparison; icon: keyof typeof Ionicons.glyphMap; label: string | null; color: string }[] = [
  { key: 'weaker', icon: 'arrow-down', label: null, color: colors.danger },
  { key: 'similar', icon: 'swap-horizontal', label: 'Similar', color: colors.navy },
  { key: 'stronger', icon: 'arrow-up', label: null, color: colors.success },
];

function initialsFor(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return '';
  return trimmed.slice(0, 2).toUpperCase();
}

export default function AddPlayerScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ slot?: RosterSlot; prefillName?: string }>();
  const slot: RosterSlot = params.slot ?? 'partner';
  const [firstName, setFirstName] = useState(params.prefillName ?? '');
  const [comparison, setComparison] = useState<Comparison>('similar');
  const [amount, setAmount] = useState<Amount | null>(null);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={colors.navy} />
        </TouchableOpacity>
        <Text style={styles.title}>Add Player</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.body}>
        <View style={styles.avatarWrap}>
          <View style={styles.avatar}>
            <Text style={styles.avatarInitials}>{initialsFor(firstName)}</Text>
          </View>
          <TouchableOpacity style={styles.cameraBadge} activeOpacity={0.8}>
            <Ionicons name="camera" size={13} color={colors.white} />
          </TouchableOpacity>
        </View>

        <Text style={styles.fieldLabel}>First name</Text>
        <View style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            value={firstName}
            onChangeText={setFirstName}
            placeholder="e.g. Mike"
            placeholderTextColor={colors.textSub}
            returnKeyType="done"
          />
        </View>

        <Text style={styles.fieldLabel}>How does this player compare with you today?</Text>
        <View style={styles.comparisonRow}>
          {COMPARISONS.map((option) => {
            const active = comparison === option.key;
            return (
              <TouchableOpacity
                key={option.key}
                style={[styles.comparisonOption, active && styles.comparisonOptionActive]}
                onPress={() => setComparison(option.key)}
                activeOpacity={0.85}
              >
                <Ionicons name={option.icon} size={18} color={option.color} />
                {option.label ? (
                  <Text style={[styles.comparisonLabel, { color: option.color }]}>{option.label}</Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.fieldLabel}>How much? (optional)</Text>
        <View style={styles.amountRow}>
          {(['slightly', 'much'] as Amount[]).map((option) => {
            const active = amount === option;
            return (
              <TouchableOpacity
                key={option}
                style={[styles.amountOption, active && styles.amountOptionActive]}
                onPress={() => setAmount(active ? null : option)}
                activeOpacity={0.85}
              >
                <Text style={[styles.amountLabel, active && styles.amountLabelActive]}>
                  {option === 'slightly' ? 'Slightly' : 'Much'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <PrimaryButton
          label="Add Player"
          style={styles.addButton}
          textStyle={styles.addButtonText}
          disabled={!firstName.trim()}
          onPress={() => {
            setRosterSlot(slot, {
              temporary: true,
              name: firstName.trim(),
              avatarUrl: null,
              comparison,
              amount,
            });
            router.back();
          }}
        />
        <View style={styles.noteRow}>
          <Ionicons name="information-circle-outline" size={14} color={colors.textSub} />
          <Text style={styles.noteText}>You can edit this later.</Text>
        </View>
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
  title: { color: colors.navy, fontSize: text.sectionTitle.size, fontWeight: '900' },
  body: { flex: 1, paddingHorizontal: spacing.screenH, paddingTop: spacing.sm },
  avatarWrap: {
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.page,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarInitials: {
    fontWeight: '900', color: colors.textSub,
    fontSize: 28,
  },
  cameraBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navy,
    borderWidth: 2,
    borderColor: colors.bg,
  },
  fieldLabel: { fontSize: text.fieldLabel.size,
    color: colors.textSub,
    fontWeight: '800',
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  inputWrap: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: shape.panel,
    paddingHorizontal: spacing.md,
  },
  input: {
    color: colors.navy,
    fontSize: text.body.size, fontWeight: '500',
    paddingVertical: 12,
  },
  comparisonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  comparisonOption: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: shape.panel,
    paddingVertical: spacing.md,
  },
  comparisonOptionActive: {
    borderColor: colors.gold,
    backgroundColor: colors.goldLight,
  },
  comparisonLabel: {
    fontWeight: '800',
    fontSize: text.chipValue.size,
  },
  amountRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  amountOption: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: shape.panel,
    paddingVertical: spacing.md,
  },
  amountOptionActive: {
    borderColor: colors.gold,
    backgroundColor: colors.goldLight,
  },
  amountLabel: {
    color: colors.textSub,
    fontSize: text.rowTitle.size, fontWeight: '700',
  },
  amountLabelActive: {
    color: colors.navy,
  },
  footer: {
    paddingHorizontal: spacing.screenH,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  addButton: {
    backgroundColor: colors.gold,
  },
  addButtonText: {
    color: colors.navy,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  noteText: { fontSize: text.caption.size, fontWeight: '500',
    color: colors.textSub,
  },
});
