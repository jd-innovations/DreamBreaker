import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useSession } from '@/hooks/useSession';
import { fetchMyStatsPlayerCard, type MyStatsPlayerCard } from '@/lib/stats/myStats';
import { getRoster, type RosterPlayer, type RosterSlot } from '@/lib/logSessionStore';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';


function firstName(fullName: string | null | undefined) {
  const trimmed = fullName?.trim();
  if (!trimmed) return 'You';
  return trimmed.split(/\s+/)[0];
}

function initialsFor(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?';
}

export default function AddPlayersScreen() {
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

  function goToSlot(slot: RosterSlot) {
    router.push({ pathname: '/log-session/search-player', params: { slot } });
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={colors.navy} />
        </TouchableOpacity>
        <Text style={styles.title}>Add Players</Text>
        <TouchableOpacity style={styles.iconBtn} activeOpacity={0.7}>
          <Ionicons name="information-circle-outline" size={22} color={colors.navy} />
        </TouchableOpacity>
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
          <RosterSlotRow
            slot="partner"
            player={roster.partner}
            placeholder="Add Partner"
            onPress={() => goToSlot('partner')}
          />
        </View>

        <Text style={styles.sectionLabel}>OPPONENTS</Text>
        <View style={styles.card}>
          <RosterSlotRow
            slot="opponent1"
            player={roster.opponent1}
            placeholder="Add Opponent"
            standalone
            onPress={() => goToSlot('opponent1')}
          />
          <RosterSlotRow
            slot="opponent2"
            player={roster.opponent2}
            placeholder="Add Opponent"
            standalone
            onPress={() => goToSlot('opponent2')}
          />
        </View>

        <View style={styles.noteRow}>
          <Ionicons name="checkmark-circle-outline" size={16} color={colors.textSub} />
          <Text style={styles.noteText}>
            All players without an account can be added as temporary players.
          </Text>
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <PrimaryButton
          label="Continue"
          style={styles.continueButton}
          textStyle={styles.continueButtonText}
          onPress={() => router.push('/log-session/review-players')}
        />
      </View>
    </View>
  );
}

function RosterSlotRow({
  player,
  placeholder,
  standalone,
  onPress,
}: {
  slot: RosterSlot;
  player: RosterPlayer | null;
  placeholder: string;
  standalone?: boolean;
  onPress: () => void;
}) {
  if (!player) {
    return (
      <TouchableOpacity
        style={[styles.addSlot, standalone && styles.addSlotStandalone]}
        activeOpacity={0.8}
        onPress={onPress}
      >
        <Ionicons name="add" size={16} color={colors.navy} />
        <Text style={styles.addSlotText}>{placeholder}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={styles.filledSlot} activeOpacity={0.8} onPress={onPress}>
      {player.avatarUrl ? (
        <Image source={{ uri: player.avatarUrl }} style={styles.slotAvatar} />
      ) : (
        <View style={styles.slotAvatarFallback}>
          <Text style={styles.slotAvatarInitials}>{initialsFor(player.name)}</Text>
        </View>
      )}
      <Text style={styles.slotName} numberOfLines={1}>
        {player.name}{player.temporary ? ' (Temporary)' : ''}
      </Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textSub} />
    </TouchableOpacity>
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
  body: { flex: 1, paddingHorizontal: spacing.screenH, paddingTop: spacing.md },
  sectionLabel: { fontSize: text.sectionLabel.size,
    color: colors.textSub,
    fontWeight: '800',
    letterSpacing: text.sectionLabel.letterSpacing,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: shape.card,
    padding: spacing.md,
    gap: spacing.sm,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
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
    fontWeight: '700', color: colors.gold,
    fontSize: 15,
  },
  playerInfo: { flex: 1 },
  playerName: {
    color: colors.navy,
    fontSize: text.body.size, fontWeight: '500',
  },
  playerPar: { fontSize: text.chipValue.size,
    color: colors.gold,
    fontWeight: '800',
    marginTop: 2,
  },
  addSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: shape.panel,
    paddingVertical: 12,
  },
  addSlotStandalone: {
    backgroundColor: colors.page,
  },
  addSlotText: {
    color: colors.navy,
    fontSize: text.rowTitle.size, fontWeight: '700',
  },
  filledSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: shape.panel,
    padding: spacing.sm,
  },
  slotAvatar: { width: 32, height: 32, borderRadius: 16 },
  slotAvatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.goldBg,
  },
  slotAvatarInitials: {
    color: colors.gold,
    fontWeight: '800',
    fontSize: 11,
  },
  slotName: {
    color: colors.navy,
    fontSize: text.rowTitle.size, fontWeight: '700',
    flex: 1,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: spacing.lg,
  },
  noteText: { fontSize: text.caption.size, fontWeight: '500',
    color: colors.textSub,
    flex: 1,
    lineHeight: 17,
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
