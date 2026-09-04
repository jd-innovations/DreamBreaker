import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { goBack } from '@/lib/navigation';
import { colors } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { useSession } from '@/hooks/useSession';
import {
  fetchFriends, searchPlayers, fetchInvitedUserIds, sendPlayEventInvite,
  type InvitablePlayer,
} from '@/lib/supabase/playEventInvites';

const L = {
  bg: colors.bg, page: colors.page, navy: colors.navy, gold: colors.gold,
  goldBg: colors.goldBg, text: colors.text, textSub: colors.textSub, border: colors.border,
  success: colors.success, successBg: colors.successBg,
};

type Tab = 'friends' | 'search';

function ratingLabel(p: InvitablePlayer): string {
  if (p.dupr != null) return `DUPR ${p.dupr.toFixed(2)}`;
  if (p.self_rating) return `Self Rated ${p.self_rating}`;
  return 'Not Rated';
}

function PlayerRow({
  player, invited, onInvite,
}: {
  player: InvitablePlayer;
  invited: boolean;
  onInvite: () => void;
}) {
  return (
    <View style={r.row}>
      {player.avatar_url ? (
        <Image source={{ uri: player.avatar_url }} style={r.avatarImg} />
      ) : (
        <View style={r.avatar}>
          <Text style={r.avatarText}>{player.full_name.slice(0, 2).toUpperCase()}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={r.name} numberOfLines={1}>{player.full_name}</Text>
        <Text style={r.rating}>{ratingLabel(player)}</Text>
      </View>
      <TouchableOpacity
        style={[r.inviteBtn, invited && r.invitedBtn]}
        activeOpacity={0.8}
        disabled={invited}
        onPress={onInvite}
      >
        {invited && <Ionicons name="checkmark" size={13} color={L.success} />}
        <Text style={[r.inviteBtnText, invited && r.invitedBtnText]}>
          {invited ? 'Invited' : 'Invite'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const r = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: L.bg, borderRadius: shape.panel, borderWidth: 1, borderColor: L.border,
    padding: 12, marginBottom: 8,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: L.navy, alignItems: 'center', justifyContent: 'center',
  },
  avatarImg: { width: 40, height: 40, borderRadius: 20 },
  avatarText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  name: { color: L.navy, fontSize: text.rowValue.size, fontWeight: '800' },
  rating: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', marginTop: 2 },
  inviteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: shape.cta, paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: L.navy,
  },
  invitedBtn: { backgroundColor: L.successBg },
  inviteBtnText: { color: '#FFFFFF', fontSize: text.chipValue.size, fontWeight: '800' },
  invitedBtnText: { color: L.success },
});

export default function InvitePlayersScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();

  const [tab, setTab] = useState<Tab>('friends');
  const [friends, setFriends] = useState<InvitablePlayer[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<InvitablePlayer[]>([]);
  const [searching, setSearching] = useState(false);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user?.id) return;
    fetchInvitedUserIds(id).then(setInvitedIds);
  }, [id, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    setFriendsLoading(true);
    fetchFriends(user.id).then(setFriends).finally(() => setFriendsLoading(false));
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || tab !== 'search') return;
    let cancelled = false;
    setSearching(true);
    const handle = setTimeout(() => {
      searchPlayers(user.id, query).then(res => { if (!cancelled) setSearchResults(res); }).finally(() => { if (!cancelled) setSearching(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [query, tab, user?.id]);

  const handleInvite = useCallback(async (playerId: string) => {
    if (!user?.id) return;
    setInvitedIds(prev => new Set(prev).add(playerId));
    try {
      await sendPlayEventInvite(id, user.id, playerId);
    } catch {
      setInvitedIds(prev => {
        const next = new Set(prev);
        next.delete(playerId);
        return next;
      });
    }
  }, [id, user?.id]);

  const list = tab === 'friends' ? friends : searchResults;
  const loading = tab === 'friends' ? friendsLoading : searching;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={L.navy} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Invite Players</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={s.tabs}>
        <TouchableOpacity
          style={[s.tab, tab === 'friends' && s.tabActive]}
          onPress={() => setTab('friends')}
        >
          <Text style={[s.tabText, tab === 'friends' && s.tabTextActive]}>Friends</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tab, tab === 'search' && s.tabActive]}
          onPress={() => setTab('search')}
        >
          <Text style={[s.tabText, tab === 'search' && s.tabTextActive]}>Search</Text>
        </TouchableOpacity>
      </View>

      {tab === 'search' && (
        <View style={s.searchBar}>
          <Ionicons name="search-outline" size={16} color={L.textSub} />
          <TextInput
            style={s.searchInput}
            placeholder="Search players by name"
            placeholderTextColor={L.textSub}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
          />
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 24 }]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.gold} style={{ marginTop: 24 }} />
        ) : list.length === 0 ? (
          <Text style={s.emptyText}>
            {tab === 'friends'
              ? "You don't have any connections yet. Find players in Partner Finder."
              : query.trim().length < 2
                ? 'Type at least 2 characters to search.'
                : 'No players found.'}
          </Text>
        ) : (
          list.map(player => (
            <PlayerRow
              key={player.id}
              player={player}
              invited={invitedIds.has(player.id)}
              onInvite={() => handleInvite(player.id)}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: L.bg,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800' },

  tabs: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6,
    backgroundColor: L.bg,
  },
  tab: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: shape.pill,
    backgroundColor: L.page,
  },
  tabActive: { backgroundColor: L.goldBg },
  tabText: { color: L.textSub, fontSize: text.controlLabel.size, fontWeight: '700' },
  tabTextActive: { color: L.gold },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 10, marginBottom: 4,
    backgroundColor: L.bg, borderWidth: 1, borderColor: L.border, borderRadius: shape.panel,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  searchInput: { flex: 1, color: L.text, fontSize: text.body.size, fontWeight: '500' },

  list: { paddingHorizontal: 16, paddingTop: 16 },
  emptyText: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', textAlign: 'center', marginTop: 32, lineHeight: 20 },
});
