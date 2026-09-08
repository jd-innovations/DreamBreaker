import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';

import { buildTeamLabels } from '@/lib/logSessionPersistence';
import { useSession } from '@/hooks/useSession';

type OptionKey = 'keep' | 'rotate' | 'change';

export default function NextGameOptionsScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ gameNumber?: string }>();
  const gameNumber = Number(params.gameNumber ?? 2);
  const { user } = useSession();
  const myName = String(user?.user_metadata?.full_name ?? user?.email?.split('@')[0] ?? 'You').split(/\s+/)[0];
  const { myTeamLabel, opponentsLabel } = buildTeamLabels(myName);
  const [selected, setSelected] = useState<OptionKey>('keep');

  function choose(option: OptionKey) {
    setSelected(option);
    if (option === 'change') {
      router.push('/log-session/add-players');
      return;
    }
    if (option === 'rotate') {
      router.push({
        pathname: '/log-session/rotate-partners',
        params: { gameNumber: String(gameNumber) },
      });
      return;
    }
    router.push({
      pathname: '/log-session/game-score',
      params: { gameNumber: String(gameNumber) },
    });
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={colors.navy} />
        </TouchableOpacity>
        <Text style={styles.title}>Add Game {gameNumber}</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.body}>
        <Text style={styles.prompt}>What would you like to do?</Text>

        <TouchableOpacity
          style={[styles.option, selected === 'keep' && styles.optionActive]}
          activeOpacity={0.85}
          onPress={() => choose('keep')}
        >
          <View style={styles.optionRow}>
            <View style={[styles.optionIcon, selected === 'keep' && styles.optionIconActive]}>
              <Ionicons name="people" size={20} color={selected === 'keep' ? colors.gold : colors.textSub} />
            </View>
            <View style={styles.optionText}>
              <Text style={styles.optionLabel}>Keep same teams</Text>
              <Text style={styles.optionTeams}>{myTeamLabel}</Text>
              <Text style={styles.optionVs}>vs</Text>
              <Text style={styles.optionTeams}>{opponentsLabel}</Text>
            </View>
            {selected === 'keep' ? (
              <View style={styles.checkCircle}>
                <Ionicons name="checkmark" size={14} color={colors.white} />
              </View>
            ) : null}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.option, selected === 'rotate' && styles.optionActive]}
          activeOpacity={0.85}
          onPress={() => choose('rotate')}
        >
          <View style={styles.optionRow}>
            <View style={[styles.optionIcon, selected === 'rotate' && styles.optionIconActive]}>
              <Ionicons name="swap-vertical" size={20} color={selected === 'rotate' ? colors.gold : colors.textSub} />
            </View>
            <View style={styles.optionText}>
              <Text style={styles.optionLabel}>Rotate partners</Text>
              <Text style={styles.optionSub}>Switch partners and play again</Text>
            </View>
            {selected === 'rotate' ? (
              <View style={styles.checkCircle}>
                <Ionicons name="checkmark" size={14} color={colors.white} />
              </View>
            ) : null}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.option, selected === 'change' && styles.optionActive]}
          activeOpacity={0.85}
          onPress={() => choose('change')}
        >
          <View style={styles.optionRow}>
            <View style={[styles.optionIcon, selected === 'change' && styles.optionIconActive]}>
              <Ionicons name="people" size={20} color={selected === 'change' ? colors.gold : colors.textSub} />
            </View>
            <View style={styles.optionText}>
              <Text style={styles.optionLabel}>Change players</Text>
              <Text style={styles.optionSub}>Add or remove players</Text>
            </View>
            {selected === 'change' ? (
              <View style={styles.checkCircle}>
                <Ionicons name="checkmark" size={14} color={colors.white} />
              </View>
            ) : null}
          </View>
        </TouchableOpacity>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity style={styles.cancelButton} activeOpacity={0.8} onPress={() => router.back()}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
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
  body: { flex: 1, paddingHorizontal: spacing.screenH, paddingTop: spacing.md, gap: spacing.md },
  prompt: { fontSize: text.caption.size,
    color: colors.textSub,
    fontWeight: '500',
    marginBottom: spacing.xs,
  },
  option: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: shape.card,
    padding: spacing.md,
  },
  optionActive: {
    borderColor: colors.gold,
    backgroundColor: colors.goldLight,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.page,
  },
  optionIconActive: {
    backgroundColor: colors.goldBg,
  },
  optionText: { flex: 1 },
  optionLabel: {
    color: colors.navy,
    fontSize: text.body.size, fontWeight: '500',
  },
  optionSub: { fontSize: text.caption.size, fontWeight: '500',
    color: colors.textSub,
    marginTop: 2,
  },
  optionTeams: { fontSize: text.caption.size, fontWeight: '500',
    color: colors.textSub,
    marginTop: 2,
  },
  optionVs: {
    fontWeight: '400', color: colors.textSub,
    fontSize: 10,
    marginTop: 1,
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gold,
  },
  footer: {
    paddingHorizontal: spacing.screenH,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: shape.cta,
    paddingVertical: 15,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: colors.navy,
    fontSize: text.actionLarge.size, fontWeight: '800',
  },
});
