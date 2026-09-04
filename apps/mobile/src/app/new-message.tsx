import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Image, ActivityIndicator, Alert } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '@/hooks/useSession';
import { searchPlayers, fetchFriends, type InvitablePlayer } from '@/lib/supabase/playEventInvites';
import { getOrCreateConversation } from '@/lib/conversationService';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';

function initialsFor(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?';
}

export default function NewMessageScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();

  const [query, setQuery] = useState('');
  const [friends, setFriends] = useState<InvitablePlayer[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [results, setResults] = useState<InvitablePlayer[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    fetchFriends(user.id)
      .then(setFriends)
      .finally(() => setFriendsLoading(false));
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const rows = await searchPlayers(user.id, trimmed);
        if (!cancelled) setResults(rows);
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, user?.id]);

  async function selectPlayer(player: InvitablePlayer) {
    if (!user?.id || openingId) return;
    setOpeningId(player.id);
    try {
      const convId = await getOrCreateConversation(user.id, player.id);
      router.replace(`/conversation/${convId}` as never);
    } catch (e: unknown) {
      Alert.alert('Could not open conversation', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setOpeningId(null);
    }
  }

  const isSearching = query.trim().length >= 2;
  const list = isSearching ? results : friends;
  const loading = isSearching ? searchLoading : friendsLoading;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={colors.navy} />
        </TouchableOpacity>
        <Text style={styles.title}>New Message</Text>
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

        {!isSearching && <Text style={styles.sectionLabel}>Your Connections</Text>}

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="small" color={colors.gold} />
          </View>
        ) : isSearching && list.length === 0 ? (
          <View style={styles.centered}>
            <Text style={styles.hintText}>No players found for {query.trim()}.</Text>
          </View>
        ) : !isSearching && list.length === 0 ? (
          <View style={styles.centered}>
            <Text style={styles.hintText}>No connections yet. Search above to start a chat with anyone.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {list.map((player) => (
              <TouchableOpacity
                key={player.id}
                style={styles.resultRow}
                activeOpacity={0.8}
                disabled={openingId != null}
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
                {openingId === player.id
                  ? <ActivityIndicator size="small" color={colors.gold} />
                  : <Ionicons name="chevron-forward" size={18} color={colors.textSub} />}
              </TouchableOpacity>
            ))}
          </View>
        )}
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
  body: { flex: 1, paddingHorizontal: spacing.screenH, paddingTop: spacing.md },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: shape.panel,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    color: colors.navy,
    fontSize: text.body.size, fontWeight: '500',
    paddingVertical: 12,
  },
  sectionLabel: {
    color: colors.textSub,
    fontSize: text.sectionLabel.size, fontWeight: '800',
    letterSpacing: text.sectionLabel.letterSpacing,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  centered: { paddingVertical: spacing.xxl, alignItems: 'center' },
  hintText: {
    color: colors.textSub,
    fontSize: text.caption.size, fontWeight: '500',
    textAlign: 'center',
  },
  list: { gap: spacing.sm },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: shape.card,
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
    fontWeight: '700', color: colors.gold,
    fontSize: 13,
  },
  resultName: {
    color: colors.navy,
    fontSize: text.body.size, fontWeight: '500',
    flex: 1,
  },
});
