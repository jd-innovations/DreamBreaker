import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SecondaryButton } from '@/components/SecondaryButton';
import { useSession } from '@/hooks/useSession';
import { buildTeamLabels, saveCurrentLogSessionGame } from '@/lib/logSessionPersistence';
import { colors, spacing, typography } from '@/theme';

function firstName(fullName: string | null | undefined, email: string | null | undefined) {
  const trimmed = fullName?.trim();
  if (trimmed) return trimmed.split(/\s+/)[0];
  return email?.split('@')[0] || 'You';
}

export default function GameScoreScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const params = useLocalSearchParams<{ gameNumber?: string; myTeamLabel?: string; opponentsLabel?: string }>();
  const gameNumber = Number(params.gameNumber ?? 1);
  const myName = firstName(user?.user_metadata?.full_name as string | null | undefined, user?.email);
  const labels = buildTeamLabels(myName);
  const myTeamLabel = params.myTeamLabel ?? labels.myTeamLabel;
  const opponentsLabel = params.opponentsLabel ?? labels.opponentsLabel;
  const [myScore, setMyScore] = useState(11);
  const [opponentScore, setOpponentScore] = useState(0);
  const [swapped, setSwapped] = useState(false);
  const [saving, setSaving] = useState(false);

  const leftLabel = swapped ? opponentsLabel : myTeamLabel;
  const rightLabel = swapped ? myTeamLabel : opponentsLabel;
  const leftScore = swapped ? opponentScore : myScore;
  const rightScore = swapped ? myScore : opponentScore;
  const setLeftScore = swapped ? setOpponentScore : setMyScore;
  const setRightScore = swapped ? setMyScore : setOpponentScore;

  async function handleSave() {
    if (!user?.id) {
      Alert.alert('Sign in required', 'Please sign in to save a game.');
      return;
    }
    if (myScore === opponentScore) {
      Alert.alert('Winner required', 'Scores cannot be tied.');
      return;
    }

    setSaving(true);
    try {
      const saved = await saveCurrentLogSessionGame({
        userId: user.id,
        myName,
        gameNumber,
        myScore,
        opponentScore,
      });
      router.push({
        pathname: '/log-session/game-saved',
        params: {
          sessionId: saved.session_id,
          gameId: saved.id,
          gameNumber: String(gameNumber),
          myScore: String(myScore),
          opponentScore: String(opponentScore),
        },
      });
    } catch (error) {
      console.error('[log-session] save game failed:', error);
      Alert.alert('Could not save game', error instanceof Error ? error.message : 'Please try again.');
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
        <Text style={styles.title}>Game {gameNumber} Score</Text>
        <TouchableOpacity style={styles.iconBtn} activeOpacity={0.7}>
          <Ionicons name="information-circle-outline" size={22} color={colors.navy} />
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        <Text style={styles.subtitle}>Final Score</Text>

        <View style={styles.scoreRow}>
          <ScoreColumn
            label={swapped ? 'OPPONENTS' : 'MY TEAM'}
            names={leftLabel}
            score={leftScore}
            onIncrement={() => setLeftScore((s) => s + 1)}
            onDecrement={() => setLeftScore((s) => Math.max(0, s - 1))}
          />

          <Text style={styles.dash}>-</Text>

          <ScoreColumn
            label={swapped ? 'MY TEAM' : 'OPPONENTS'}
            names={rightLabel}
            score={rightScore}
            onIncrement={() => setRightScore((s) => s + 1)}
            onDecrement={() => setRightScore((s) => Math.max(0, s - 1))}
          />
        </View>

        <SecondaryButton
          label="Swap Teams"
          icon="swap-horizontal"
          style={styles.swapButton}
          onPress={() => setSwapped((s) => !s)}
        />
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        {saving ? (
          <ActivityIndicator color={colors.gold} />
        ) : (
          <PrimaryButton
            label={`Save Game ${gameNumber}`}
            style={styles.saveButton}
            textStyle={styles.saveButtonText}
            onPress={handleSave}
          />
        )}
        {myScore !== opponentScore ? (
          <Text style={[styles.resultText, myScore > opponentScore ? styles.resultWon : styles.resultLost]}>
            You {myScore > opponentScore ? 'won' : 'lost'} {myScore}-{opponentScore}
          </Text>
        ) : (
          <View style={styles.noteRow}>
            <Ionicons name="checkmark-circle-outline" size={14} color={colors.textSub} />
            <Text style={styles.noteText}>Winner is automatic.</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function ScoreColumn({
  label,
  names,
  score,
  onIncrement,
  onDecrement,
}: {
  label: string;
  names: string;
  score: number;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  const displayNames = names.split(' & ').join('\n');

  return (
    <View style={styles.scoreColumn}>
      <Text style={styles.scoreColumnLabel}>{label}</Text>
      <Text style={styles.scoreColumnNames} accessibilityLabel={names}>{displayNames}</Text>
      <Text style={styles.scoreValue}>{score}</Text>
      <View style={styles.stepperRow}>
        <TouchableOpacity style={styles.stepperBtn} onPress={onDecrement} activeOpacity={0.8}>
          <Ionicons name="remove" size={18} color={colors.navy} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.stepperBtn} onPress={onIncrement} activeOpacity={0.8}>
          <Ionicons name="add" size={18} color={colors.navy} />
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
  title: { ...typography.sectionTitle, color: colors.navy, fontSize: 17 },
  body: { flex: 1, paddingHorizontal: spacing.screenH, paddingTop: spacing.md },
  subtitle: {
    ...typography.metadata,
    color: colors.textSub,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  scoreColumn: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: spacing.sm,
  },
  scoreColumnLabel: {
    ...typography.metadata,
    color: colors.textSub,
    fontWeight: '800',
    letterSpacing: 0.5,
    fontSize: 11,
  },
  scoreColumnNames: {
    ...typography.cardTitle,
    color: colors.gold,
    width: '100%',
    minHeight: 42,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  scoreValue: {
    color: colors.navy,
    fontSize: 56,
    fontWeight: '900',
    marginVertical: spacing.sm,
  },
  dash: {
    color: colors.textSub,
    fontSize: 32,
    fontWeight: '700',
    marginTop: 82,
  },
  stepperRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  stepperBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.page,
  },
  swapButton: {
    marginTop: spacing.xl,
  },
  footer: {
    paddingHorizontal: spacing.screenH,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  saveButton: {
    backgroundColor: colors.gold,
  },
  saveButtonText: {
    color: colors.navy,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  noteText: {
    ...typography.metadata,
    color: colors.textSub,
  },
  resultText: {
    ...typography.cardTitle,
    fontSize: 14,
    textAlign: 'center',
  },
  resultWon: {
    color: colors.success,
  },
  resultLost: {
    color: colors.danger,
  },
});
