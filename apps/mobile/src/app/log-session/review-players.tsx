import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SecondaryButton } from '@/components/SecondaryButton';
import { useSession } from '@/hooks/useSession';
import { fetchMyStatsPlayerCard, type MyStatsPlayerCard } from '@/lib/stats/myStats';
import { getRoster, type RosterPlayer } from '@/lib/logSessionStore';
import { colors, radius, spacing, typography } from '@/theme';


function firstName(fullName: string | null | undefined) {
  const trimmed = fullName?.trim();
  if (!trimmed) return 'You';
  return trimmed.split(/\s+/)[0];
}

function initialsFor(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?';
}

function comparisonLabel(player: RosterPlayer) {
  if (!player.temporary || !player.comparison) return null;
  if (player.comparison === 'weaker') return 'Weaker than you';
  if (player.comparison === 'stronger') return 'Stronger than you';
  return 'Similar to you';
}

export default function ReviewPlayersScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const [card, setCard] = useState<MyStatsPlayerCard | null>(null);
  const [roster, setRoster] = useState(getRoster());

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    fetchMyStatsPlayerCard(user.id).then((data) => {
      if (!cancelled) setCard(data);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useFocusEffect(useCallback(() => {
    setRoster(getRoster());
  }, []));

  const name = firstName(card?.profile.full_name);
  const avatarUrl = card?.profile.avatar_url ?? null;
  const initials = card?.initials ?? '';
  const ratingLabel = card?.currentRating ? card.currentRating.label + ' ' + card.currentRating.value : 'Rating pending';
  const opponents = [roster.opponent1, roster.opponent2].filter((p): p is RosterPlayer => p != null);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={colors.navy} />
        </TouchableOpacity>
        <Text style={styles.title}>Review Players</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.body}>
        <Text style={styles.sectionLabel}>MY TEAM</Text>
        <View style={styles.card}>
          <View style={styles.playerRow}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitials}>{initials}</Text>
              </View>
            )}
            <View style={styles.playerInfo}>
              <Text style={styles.playerName}>You ({name})</Text>
              <Text style={styles.playerPar}>{ratingLabel}</Text>
            </View>
          </View>

          {roster.partner ? (
            <TouchableOpacity style={styles.playerRowBordered} activeOpacity={0.7}>
              {roster.partner.avatarUrl ? (
                <Image source={{ uri: roster.partner.avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarInitials}>{initialsFor(roster.partner.name)}</Text>
                </View>
              )}
              <View style={styles.playerInfo}>
                <Text style={styles.playerName}>
                  {roster.partner.name}{roster.partner.temporary ? ' (Temporary)' : ''}
                </Text>
                {comparisonLabel(roster.partner) ? (
                  <Text style={styles.playerComparison}>{comparisonLabel(roster.partner)}</Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSub} />
            </TouchableOpacity>
          ) : null}
        </View>

        <Text style={styles.sectionLabel}>OPPONENTS</Text>
        <View style={styles.card}>
          {opponents.map((player, index) => (
            <TouchableOpacity
              key={`${player.name}-${index}`}
              style={[styles.playerRowBordered, index === 0 && styles.playerRowFirst]}
              activeOpacity={0.7}
            >
              {player.avatarUrl ? (
                <Image source={{ uri: player.avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarInitials}>{initialsFor(player.name)}</Text>
                </View>
              )}
              <View style={styles.playerInfo}>
                <Text style={styles.playerName}>{player.name}{player.temporary ? ' (Temporary)' : ''}</Text>
                {comparisonLabel(player) ? (
                  <Text style={styles.playerComparison}>{comparisonLabel(player)}</Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSub} />
            </TouchableOpacity>
          ))}
        </View>

        <SecondaryButton
          label="Edit Players"
          style={styles.editButton}
          onPress={() => router.push('/log-session/add-players')}
        />
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <PrimaryButton
          label="Continue"
          style={styles.continueButton}
          textStyle={styles.continueButtonText}
          onPress={() => router.push('/log-session/game-score')}
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
  title: { ...typography.sectionTitle, color: colors.navy, fontSize: 17 },
  body: { flex: 1, paddingHorizontal: spacing.screenH, paddingTop: spacing.md },
  sectionLabel: {
    ...typography.metadata,
    color: colors.textSub,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    overflow: 'hidden',
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  playerRowBordered: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  playerRowFirst: {
    borderTopWidth: 0,
  },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.goldBg,
  },
  avatarInitials: {
    ...typography.cardTitle,
    color: colors.gold,
    fontSize: 15,
  },
  playerInfo: { flex: 1 },
  playerName: {
    ...typography.cardTitle,
    color: colors.navy,
    fontSize: 15,
  },
  playerPar: {
    ...typography.metadata,
    color: colors.gold,
    fontWeight: '800',
    marginTop: 2,
  },
  playerComparison: {
    ...typography.metadata,
    color: colors.textSub,
    marginTop: 2,
  },
  editButton: {
    marginTop: spacing.lg,
  },
  footer: {
    paddingHorizontal: spacing.screenH,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  continueButton: {
    backgroundColor: colors.gold,
  },
  continueButtonText: {
    color: colors.navy,
  },
});
