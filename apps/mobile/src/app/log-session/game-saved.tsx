import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { PrimaryButton } from '@/components/PrimaryButton';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';

export default function GameSavedScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ gameNumber?: string; myScore?: string; opponentScore?: string }>();

  const gameNumber = Number(params.gameNumber ?? 1);
  const myScore = Number(params.myScore ?? 11);
  const opponentScore = Number(params.opponentScore ?? 8);
  const won = myScore > opponentScore;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={styles.center}>
        <View style={styles.card}>
          <View style={styles.successBadge}>
            <Ionicons name="checkmark" size={34} color={colors.navy} />
          </View>
          <Text style={styles.title}>Game {gameNumber} Saved</Text>
          <Text style={styles.result}>
            You {won ? 'won' : 'lost'} {myScore}-{opponentScore}!
          </Text>
          <Text style={styles.body}>
            This game has been saved to your personal match history.
          </Text>

          <View style={styles.divider} />

          <Text style={styles.prompt}>What would you like to do?</Text>

          <PrimaryButton
            label="Add Another Game"
            style={styles.addButton}
            textStyle={styles.addButtonText}
            onPress={() => router.push({
              pathname: '/log-session/next-game-options',
              params: { gameNumber: String(gameNumber + 1) },
            })}
          />

          <TouchableOpacity
            style={styles.finishButton}
            activeOpacity={0.7}
            onPress={() => router.push('/log-session/select-location')}
          >
            <Text style={styles.finishButtonText}>Finish Session</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.page },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.screenH,
  },
  card: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderRadius: shape.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
  },
  successBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gold,
    marginBottom: spacing.md,
  },
  title: {
    color: colors.navy,
    fontSize: text.sectionTitle.size, fontWeight: '900',
  },
  result: {
    color: colors.gold,
    fontSize: text.modalTitle.size, fontWeight: '900',
    marginTop: spacing.sm,
  },
  body: {
    color: colors.textSub,
    fontSize: text.caption.size, fontWeight: '500',
    textAlign: 'center',
    lineHeight: 19,
    marginTop: spacing.md,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    width: '100%',
    marginVertical: spacing.lg,
  },
  prompt: { fontSize: text.caption.size,
    color: colors.textSub,
    fontWeight: '500',
    marginBottom: spacing.md,
  },
  addButton: {
    width: '100%',
    backgroundColor: colors.gold,
  },
  addButtonText: {
    color: colors.navy,
  },
  finishButton: {
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    width: '100%',
    alignItems: 'center',
  },
  finishButtonText: {
    color: colors.navy,
    fontSize: text.actionLarge.size, fontWeight: '800',
  },
});
