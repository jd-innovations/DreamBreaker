import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SecondaryButton } from '@/components/SecondaryButton';
import { getSavedGames } from '@/lib/logSessionStore';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';

export default function SessionGamesScreen() {
  const insets = useSafeAreaInsets();
  const games = getSavedGames();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={colors.navy} />
        </TouchableOpacity>
        <Text style={styles.title}>Session Games</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.body}>
        {games.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No games saved yet.</Text>
          </View>
        ) : games.map((game) => {
          const won = game.myScore > game.opponentScore;
          return (
            <View key={game.id} style={styles.card}>
              <Text style={styles.gameLabel}>Game {game.gameNumber}</Text>

              <View style={styles.matchupBlock}>
                <View style={styles.teamBlock}>
                  <Text style={styles.teamSideLabel}>My Team</Text>
                  <Text style={styles.teamName}>{game.myTeamLabel}</Text>
                </View>
                <Text style={styles.vsText}>vs</Text>
                <View style={styles.teamBlock}>
                  <Text style={styles.teamSideLabel}>Opponents</Text>
                  <Text style={styles.teamName}>{game.opponentsLabel}</Text>
                </View>
              </View>

              <View style={styles.scoreRow}>
                <Text style={styles.scoreValue}>{game.myScore}</Text>
                <Text style={styles.scoreDash}>-</Text>
                <Text style={styles.scoreValue}>{game.opponentScore}</Text>
              </View>

              <Text style={[styles.result, won ? styles.resultWon : styles.resultLost]}>
                You {won ? 'won' : 'lost'}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <SecondaryButton
          label="Edit Scores"
          style={styles.editButton}
          onPress={() => {}}
        />
        <PrimaryButton
          label="Continue"
          style={styles.continueButton}
          textStyle={styles.continueButtonText}
          onPress={() => router.push('/log-session/how-did-you-feel')}
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
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.navy, fontSize: text.sectionTitle.size, fontWeight: '900' },
  body: { flex: 1, paddingHorizontal: spacing.screenH, paddingTop: spacing.md, gap: spacing.md },
  emptyCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: shape.card,
    padding: spacing.lg,
    alignItems: 'center',
  },
  emptyTitle: { color: colors.textSub, fontSize: text.rowTitle.size, fontWeight: '700' },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: shape.card,
    padding: spacing.md,
  },
  gameLabel: {
    color: colors.navy,
    fontSize: text.rowTitle.size, fontWeight: '700',
    marginBottom: spacing.sm,
  },
  matchupBlock: {
    gap: spacing.xs,
  },
  teamBlock: {
    gap: 2,
  },
  teamSideLabel: {
    color: colors.textSub,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  teamName: {
    color: colors.textSub,
    fontSize: text.caption.size, fontWeight: '500',
    lineHeight: 18,
  },
  vsText: {
    color: colors.textSub,
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    marginTop: spacing.sm,
  },
  scoreValue: {
    color: colors.navy,
    fontSize: 30,
    fontWeight: '900',
    minWidth: 52,
    textAlign: 'center',
  },
  scoreDash: {
    color: colors.textSub,
    fontSize: 18,
    fontWeight: '800',
  },
  result: {
    fontSize: text.caption.size, fontWeight: '500',
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  resultWon: {
    color: colors.success,
  },
  resultLost: {
    color: colors.danger,
  },
  footer: {
    paddingHorizontal: spacing.screenH,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  editButton: {},
  continueButton: {
    backgroundColor: colors.gold,
  },
  continueButtonText: {
    color: colors.navy,
  },
});
