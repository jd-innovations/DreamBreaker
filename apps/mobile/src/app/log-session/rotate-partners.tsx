import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton } from '@/components/PrimaryButton';
import { getRoster, setRosterSlot, type RosterPlayer } from '@/lib/logSessionStore';
import { buildTeamLabels } from '@/lib/logSessionPersistence';
import { useSession } from '@/hooks/useSession';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';

function initialsFor(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?';
}

function firstName(fullName: string | null | undefined, email: string | null | undefined) {
  const trimmed = fullName?.trim();
  if (trimmed) return trimmed.split(/\s+/)[0];
  return email?.split('@')[0] || 'You';
}

function PlayerPill({ player }: { player: RosterPlayer | null }) {
  if (!player) return null;
  return (
    <View style={styles.playerPill}>
      {player.avatarUrl ? (
        <Image source={{ uri: player.avatarUrl }} style={styles.avatar} />
      ) : (
        <View style={styles.avatarFallback}>
          <Text style={styles.avatarInitials}>{initialsFor(player.name)}</Text>
        </View>
      )}
      <Text style={styles.playerName}>{player.name}</Text>
    </View>
  );
}

export default function RotatePartnersScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ gameNumber?: string }>();
  const gameNumber = Number(params.gameNumber ?? 2);
  const { user } = useSession();
  const myName = firstName(user?.user_metadata?.full_name as string | null | undefined, user?.email);
  const roster = getRoster();

  function rotateAndContinue() {
    if (roster.partner && roster.opponent1) {
      setRosterSlot('partner', roster.opponent1);
      setRosterSlot('opponent1', roster.partner);
    }
    const labels = buildTeamLabels(myName);
    router.push({
      pathname: '/log-session/game-score',
      params: {
        gameNumber: String(gameNumber),
        myTeamLabel: labels.myTeamLabel,
        opponentsLabel: labels.opponentsLabel,
      },
    });
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={colors.navy} />
        </TouchableOpacity>
        <Text style={styles.title}>Rotate Partners</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.body}>
        <Text style={styles.prompt}>Next game teams</Text>
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>MY TEAM</Text>
          <View style={styles.teamRow}>
            <Text style={styles.selfName}>{myName}</Text>
            <PlayerPill player={roster.opponent1 ?? roster.partner} />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>OPPONENTS</Text>
          <View style={styles.teamRow}>
            <PlayerPill player={roster.partner ?? roster.opponent1} />
            <PlayerPill player={roster.opponent2} />
          </View>
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <PrimaryButton
          label="Use These Teams"
          style={styles.continueButton}
          textStyle={styles.continueButtonText}
          onPress={rotateAndContinue}
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
  prompt: { color: colors.textSub, fontSize: text.body.size, fontWeight: '500' },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: shape.card,
    padding: spacing.md,
    gap: spacing.sm,
  },
  sectionLabel: { fontSize: text.sectionLabel.size, color: colors.textSub, fontWeight: '800', letterSpacing: text.sectionLabel.letterSpacing },
  teamRow: { gap: spacing.sm },
  selfName: { color: colors.navy, fontSize: text.body.size, fontWeight: '500' },
  playerPill: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  avatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.goldBg,
  },
  avatarInitials: { color: colors.gold, fontWeight: '800', fontSize: 11 },
  playerName: { color: colors.navy, fontSize: text.rowTitle.size, fontWeight: '700' },
  footer: {
    paddingHorizontal: spacing.screenH,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  continueButton: { backgroundColor: colors.gold },
  continueButtonText: { color: colors.navy },
});
