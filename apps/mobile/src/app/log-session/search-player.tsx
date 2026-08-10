import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Image, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '@/hooks/useSession';
import { searchPlayers, type InvitablePlayer } from '@/lib/supabase/playEventInvites';
import { setRosterSlot, type RosterSlot } from '@/lib/logSessionStore';
import { colors, radius, spacing, typography } from '@/theme';

const SLOT_TITLES: Record<RosterSlot, string> = {
  partner: 'Add Partner',
  opponent1: 'Add Opponent',
  opponent2: 'Add Opponent',
};

function initialsFor(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?';
}

export default function SearchPlayerScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const params = useLocalSearchParams<{ slot?: RosterSlot }>();
  const slot: RosterSlot = params.slot ?? 'partner';

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<InvitablePlayer[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const rows = await searchPlayers(user.id, trimmed);
        if (!cancelled) setResults(rows);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, user?.id]);

  function selectPlayer(player: InvitablePlayer) {
    setRosterSlot(slot, {
      temporary: false,
      profileId: player.id,
      name: player.full_name,
      avatarUrl: player.avatar_url,
    });
    router.back();
  }

  function addTemporary() {
    router.replace({
      pathname: '/log-session/add-player',
      params: { slot, prefillName: query.trim() },
    });
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={colors.navy} />
        </TouchableOpacity>
        <Text style={styles.title}>{SLOT_TITLES[slot]}</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.body}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color={colors.textSub} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search players by name"
            placeholderTextColor={colors.textSub}
            autoFocus
            autoCapitalize="words"
            returnKeyType="search"
          />
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="small" color={colors.gold} />
          </View>
        ) : query.trim().length < 2 ? (
          <View style={styles.centered}>
            <Text style={styles.hintText}>Type at least 2 characters to search.</Text>
          </View>
        ) : results.length === 0 ? (
          <View style={styles.centered}>
            <Text style={styles.hintText}>No players found for {query.trim()}.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {results.map((player) => (
              <TouchableOpacity
                key={player.id}
                style={styles.resultRow}
                activeOpacity={0.8}
                onPress={() => selectPlayer(player)}
              >
                {player.avatar_url ? (
                  <Image source={{ uri: player.avatar_url }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Text style={styles.avatarInitials}>{initialsFor(player.full_name)}</Text>
                  </View>
                )}
                <Text style={styles.resultName} numberOfLines={1}>{player.full_name}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textSub} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        <TouchableOpacity style={styles.tempRow} activeOpacity={0.8} onPress={addTemporary}>
          <Ionicons name="person-add-outline" size={16} color={colors.navy} />
          <Text style={styles.tempRowText}>Cannot find them? Add as a temporary player</Text>
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
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    color: colors.navy,
    fontSize: 15,
    paddingVertical: 12,
  },
  centered: { paddingVertical: spacing.xxl, alignItems: 'center' },
  hintText: {
    ...typography.body,
    color: colors.textSub,
    fontSize: 13,
    textAlign: 'center',
  },
  list: { gap: spacing.sm },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: spacing.md,
  },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.goldBg,
  },
  avatarInitials: {
    ...typography.cardTitle,
    color: colors.gold,
    fontSize: 13,
  },
  resultName: {
    ...typography.cardTitle,
    color: colors.navy,
    fontSize: 15,
    flex: 1,
  },
  tempRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    marginTop: spacing.md,
  },
  tempRowText: {
    ...typography.cardTitle,
    color: colors.navy,
    fontSize: 13,
  },
});
