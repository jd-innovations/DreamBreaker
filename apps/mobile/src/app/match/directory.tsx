import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Image, TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { goBack } from '@/lib/navigation';
import { useSession } from '@/hooks/useSession';
import { getOrCreateConversation } from '@/lib/conversationService';
import { colors } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { formatPlayerRating } from '@/lib/playerRating';
import {
  searchDirectory, mutualLabel, MIN_DIRECTORY_QUERY, type DirectoryPlayer,
} from '@/lib/supabase/playerDirectory';

const L = {
  bg: colors.bg, page: colors.page, navy: colors.navy,
  gold: colors.gold, goldBg: colors.goldBg,
  text: colors.text, textSub: colors.textSub, border: colors.border,
};

/** Long enough that a fast typist makes one request, short enough to feel live. */
const DEBOUNCE_MS = 300;

function Avatar({ uri, size }: { uri: string | null; size: number }) {
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  return (
    <View style={[av.circle, { width: size, height: size, borderRadius: size / 2 }]}>
      <Ionicons name="person" size={size * 0.46} color={L.textSub} />
    </View>
  );
}
const av = StyleSheet.create({
  circle: {
    backgroundColor: L.page, borderWidth: 1, borderColor: L.border,
    alignItems: 'center', justifyContent: 'center',
  },
});

function PlayerRow({ player, onMessage, messaging }: {
  player: DirectoryPlayer;
  onMessage: () => void;
  messaging: boolean;
}) {
  const mutuals = mutualLabel(player.mutualCount);
  return (
    <TouchableOpacity
      style={r.card}
      activeOpacity={0.85}
      onPress={() => router.push(`/match/profile/${player.id}` as never)}
      accessibilityRole="button"
      accessibilityLabel={`${player.name}${mutuals ? `, ${mutuals}` : ''}`}
    >
      <Avatar uri={player.avatarUrl} size={48} />

      <View style={{ flex: 1 }}>
        <View style={r.nameRow}>
          <Text style={r.name} numberOfLines={1}>{player.name}</Text>
          {player.isConnected && (
            <View style={r.connectedPill}>
              <Ionicons name="checkmark" size={10} color={L.gold} />
              <Text style={r.connectedText}>CONNECTED</Text>
            </View>
          )}
        </View>

        {!!player.handle && <Text style={r.handle} numberOfLines={1}>@{player.handle}</Text>}

        <View style={r.metaRow}>
          <Ionicons name="speedometer-outline" size={12} color={L.gold} />
          <Text style={r.meta}>{formatPlayerRating(player.rating)}</Text>
          {!!player.location && (
            <>
              <View style={r.dot} />
              <Text style={r.meta} numberOfLines={1}>{player.location}</Text>
            </>
          )}
        </View>

        {/* The trust signal. A rating tells you whether a stranger is worth
            playing; a shared connection tells you whether they are worth
            tapping — which is the decision actually being made on this row. */}
        {!!mutuals && (
          <View style={r.mutualRow}>
            <Ionicons name="people-outline" size={12} color={L.textSub} />
            <Text style={r.mutual}>{mutuals}</Text>
          </View>
        )}
      </View>

      {/* Straight to a thread. No relationship needed since 20260921170000 —
          the recipient's control is block and report, not a locked door. */}
      <TouchableOpacity
        style={r.msgBtn}
        onPress={onMessage}
        disabled={messaging}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`Message ${player.name}`}
      >
        {messaging
          ? <ActivityIndicator size="small" color={L.navy} />
          : <Ionicons name="chatbubble-outline" size={17} color={L.navy} />}
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

export default function PlayerDirectoryScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DirectoryPlayer[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState(false);

  // Tracks the most recent request so a slow early response cannot overwrite a
  // fast later one — the classic search race, and very reachable here because
  // shorter queries match more rows and take longer.
  const requestId = useRef(0);
  const { user } = useSession();
  const [messagingId, setMessagingId] = useState<string | null>(null);

  async function handleMessage(playerId: string) {
    if (!user?.id || messagingId) return;
    setMessagingId(playerId);
    try {
      const convId = await getOrCreateConversation(user.id, playerId);
      router.push(`/conversation/${convId}` as never);
    } catch {
      Alert.alert('Could not open the conversation', 'Please try again.');
    } finally {
      setMessagingId(null);
    }
  }

  const runSearch = useCallback(async (term: string) => {
    const mine = ++requestId.current;
    const trimmed = term.trim();

    if (trimmed.length < MIN_DIRECTORY_QUERY) {
      setResults([]);
      setSearched(false);
      setSearching(false);
      setError(false);
      return;
    }

    setSearching(true);
    setError(false);
    try {
      const rows = await searchDirectory(trimmed);
      if (mine !== requestId.current) return;
      setResults(rows);
      setSearched(true);
    } catch {
      if (mine !== requestId.current) return;
      setError(true);
      setResults([]);
    } finally {
      if (mine === requestId.current) setSearching(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { void runSearch(query); }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  const tooShort = query.trim().length > 0 && query.trim().length < MIN_DIRECTORY_QUERY;

  return (
    <View style={s.root}>
      <StatusBar style="dark" />

      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={L.navy} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Find Players</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <View style={s.searchWrap}>
        <View style={s.searchBar}>
          <Ionicons name="search-outline" size={18} color={L.textSub} />
          <TextInput
            style={s.searchInput}
            placeholder="Search by name or @handle"
            placeholderTextColor={L.textSub}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Search players"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={18} color={L.textSub} />
            </TouchableOpacity>
          )}
        </View>
        {/* Says why nothing is happening yet, rather than looking broken. */}
        {tooShort && <Text style={s.hint}>Keep typing — {MIN_DIRECTORY_QUERY} characters minimum.</Text>}
      </View>

      <ScrollView
        contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {searching && results.length === 0 ? (
          <View style={s.state}><ActivityIndicator color={L.gold} /></View>
        ) : error ? (
          <View style={s.state}>
            <Ionicons name="warning-outline" size={40} color={L.textSub} />
            <Text style={s.stateTitle}>Couldn&apos;t search</Text>
            <Text style={s.stateSub}>Check your connection and try again.</Text>
            <TouchableOpacity style={s.retryBtn} onPress={() => { void runSearch(query); }} activeOpacity={0.8}>
              <Text style={s.retryLabel}>RETRY</Text>
            </TouchableOpacity>
          </View>
        ) : results.length > 0 ? (
          results.map((p) => (
            <PlayerRow
              key={p.id}
              player={p}
              onMessage={() => { void handleMessage(p.id); }}
              messaging={messagingId === p.id}
            />
          ))
        ) : searched ? (
          <View style={s.state}>
            <Ionicons name="search-outline" size={40} color={L.textSub} />
            <Text style={s.stateTitle}>No players found</Text>
            {/* Naming the discoverability rule matters: without it "no results"
                reads as "this person is not on the app", which may be false. */}
            <Text style={s.stateSub}>
              Try a different spelling. Players who have turned off discovery in
              their privacy settings will not appear here.
            </Text>
          </View>
        ) : (
          <View style={s.state}>
            <Ionicons name="people-outline" size={40} color={L.textSub} />
            <Text style={s.stateTitle}>Find players</Text>
            <Text style={s.stateSub}>Search by name or @handle to see their profile and connect.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 12, backgroundColor: L.bg,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800', textAlign: 'center' },

  searchWrap: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, backgroundColor: L.bg },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: L.page, borderWidth: 1, borderColor: L.border,
    borderRadius: shape.cta, paddingHorizontal: 12, height: 44,
  },
  searchInput: { flex: 1, color: L.text, fontSize: text.body.size, fontWeight: '500' },
  hint: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', marginTop: 8, marginLeft: 4 },

  list: { paddingHorizontal: 16, paddingTop: 12 },

  state: { alignItems: 'center', justifyContent: 'center', paddingTop: 72, paddingHorizontal: 32, gap: 10 },
  stateTitle: { color: L.navy, fontSize: text.modalTitle.size, fontWeight: '800' },
  stateSub: { color: L.textSub, fontSize: text.body.size, fontWeight: '500', textAlign: 'center', lineHeight: 21 },
  retryBtn: {
    marginTop: 8, paddingHorizontal: 22, height: 40, borderRadius: 999,
    borderWidth: 1.5, borderColor: L.gold, alignItems: 'center', justifyContent: 'center',
  },
  retryLabel: { color: L.gold, fontSize: text.caption.size, fontWeight: '800', letterSpacing: 1 },
});

const r = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: L.bg, borderRadius: shape.card,
    borderWidth: 1, borderColor: L.border,
    padding: 12, marginBottom: 10,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { color: L.navy, fontSize: text.rowTitle.size, fontWeight: '700', flexShrink: 1 },
  connectedPill: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: L.goldBg, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2,
  },
  connectedText: { color: L.gold, fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  handle: { color: L.textSub, fontSize: text.caption.size, fontWeight: '600', marginTop: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  meta: { color: L.textSub, fontSize: text.caption.size, fontWeight: '600', flexShrink: 1 },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: L.border },
  mutualRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  mutual: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500' },
  msgBtn: {
    width: 38, height: 38, borderRadius: 19,
    borderWidth: 1.5, borderColor: L.border, backgroundColor: L.page,
    alignItems: 'center', justifyContent: 'center',
  },
});
