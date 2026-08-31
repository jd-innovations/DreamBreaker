import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Image, Alert, RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, radius } from '@/theme';
import { goBack } from '@/lib/navigation';
import { StatusChip } from '@/components';
import { useSession } from '@/hooks/useSession';
import { useFacilityFinderCandidates } from '@/lib/useFacilityFinderCandidates';
import {
  fetchFriends, searchPlayers, type InvitablePlayer,
} from '@/lib/supabase/playEventInvites';
import {
  fetchInvitedProfileIds, sendReservationInvite,
} from '@/lib/supabase/reservationInvites';
import {
  fetchReservationById, fetchReservationPlayersWithProfiles,
  playersNeeded, occupancyStatusLabel, occupancyCountLabel,
  type Reservation, type ReservationPlayerWithProfile,
} from '@/lib/supabase/reservations';
import { getBookingFacility, getBookingSelection, getBookingReservationId } from '@/lib/bookingStore';

const L = {
  bg: colors.bg, page: colors.page, navy: colors.navy, gold: colors.gold,
  goldBg: colors.goldBg, text: colors.text, textSub: colors.textSub, border: colors.border,
  success: colors.success, successBg: colors.successBg, white: colors.white,
};

type Tab = 'nearby' | 'friends' | 'search';

// Normalized shape so useFacilityFinderCandidates() (FinderCandidate) and
// playEventInvites.ts (InvitablePlayer) can share one row/list renderer
// instead of two near-identical components.
type InviteRow = { id: string; name: string; avatarUrl: string | null; subtitle: string };

function fromInvitable(p: InvitablePlayer): InviteRow {
  const subtitle = p.dupr != null ? `DUPR ${p.dupr.toFixed(2)}` : p.self_rating ? `Self Rated ${p.self_rating}` : 'Not Rated';
  return { id: p.id, name: p.full_name, avatarUrl: p.avatar_url, subtitle };
}

function fromCandidate(c: { id: string; name: string; photos: string[]; dupr: number; ratingType: string; distance: number | null }): InviteRow {
  const rating = c.ratingType === 'none' ? 'Not Rated' : `DUPR ${c.dupr.toFixed(2)}`;
  const subtitle = c.distance != null ? `${rating} · ${c.distance} mi from facility` : rating;
  return { id: c.id, name: c.name, avatarUrl: c.photos[0] ?? null, subtitle };
}

function PlayerRow({ row, invited, onInvite }: { row: InviteRow; invited: boolean; onInvite: () => void }) {
  return (
    <View style={r.row}>
      {row.avatarUrl ? (
        <Image source={{ uri: row.avatarUrl }} style={r.avatarImg} />
      ) : (
        <View style={r.avatar}><Text style={r.avatarText}>{row.name.slice(0, 2).toUpperCase()}</Text></View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={r.name} numberOfLines={1}>{row.name}</Text>
        <Text style={r.subtitle} numberOfLines={1}>{row.subtitle}</Text>
      </View>
      <TouchableOpacity style={[r.inviteBtn, invited && r.invitedBtn]} activeOpacity={0.8} disabled={invited} onPress={onInvite}>
        {invited && <Ionicons name="checkmark" size={13} color={L.success} />}
        <Text style={[r.inviteBtnText, invited && r.invitedBtnText]}>{invited ? 'Invited' : 'Invite'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const r = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: L.bg, borderRadius: 14, borderWidth: 1, borderColor: L.border,
    padding: 12, marginBottom: 8,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: L.navy, alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: 40, height: 40, borderRadius: 20 },
  avatarText: { color: L.white, fontSize: 13, fontWeight: '800' },
  name: { color: L.navy, fontSize: 14, fontWeight: '800' },
  subtitle: { color: L.textSub, fontSize: 12, marginTop: 2 },
  inviteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: L.navy },
  invitedBtn: { backgroundColor: L.successBg },
  inviteBtnText: { color: L.white, fontSize: 12, fontWeight: '700' },
  invitedBtnText: { color: L.success },
});

export default function FindPlayersScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const facility = getBookingFacility();
  const selection = getBookingSelection();
  const reservationId = getBookingReservationId();

  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [players, setPlayers] = useState<ReservationPlayerWithProfile[]>([]);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>('nearby');
  const [query, setQuery] = useState('');
  const [friends, setFriends] = useState<InvitablePlayer[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<InvitablePlayer[]>([]);
  const [searching, setSearching] = useState(false);

  const nearby = useFacilityFinderCandidates(facility.facilityId);

  const load = useCallback(async (isRefresh = false) => {
    if (!reservationId) { setError('No active reservation. Go back and choose a time.'); setLoading(false); return; }
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const [res, roster, invited] = await Promise.all([
        fetchReservationById(reservationId),
        fetchReservationPlayersWithProfiles(reservationId),
        fetchInvitedProfileIds(reservationId),
      ]);
      if (!res) { setError('This reservation no longer exists.'); return; }
      setReservation(res);
      setPlayers(roster);
      setInvitedIds(invited);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load your reservation.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [reservationId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!user?.id || tab !== 'friends' || friends.length > 0 || friendsLoading) return;
    setFriendsLoading(true);
    fetchFriends(user.id).then(setFriends).finally(() => setFriendsLoading(false));
  }, [tab, user?.id, friends.length, friendsLoading]);

  useEffect(() => {
    if (!user?.id || tab !== 'search') return;
    let cancelled = false;
    setSearching(true);
    const handle = setTimeout(() => {
      searchPlayers(user.id, query).then(res => { if (!cancelled) setSearchResults(res); }).finally(() => { if (!cancelled) setSearching(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [query, tab, user?.id]);

  const handleInvite = useCallback(async (inviteeId: string) => {
    if (!user?.id || !reservationId) return;
    setInvitedIds(prev => new Set(prev).add(inviteeId));
    try {
      await sendReservationInvite(reservationId, user.id, inviteeId);
    } catch (e) {
      setInvitedIds(prev => { const next = new Set(prev); next.delete(inviteeId); return next; });
      const code = e instanceof Error ? e.message : 'unknown_error';
      Alert.alert('Could Not Invite', code === 'already_joined' ? 'That player is already in your game.' : 'Something went wrong. Please try again.');
    }
  }, [reservationId, user?.id]);

  function handleContinue() {
    router.push('/booking/review' as never);
  }

  if (loading) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color={L.navy} />
      </View>
    );
  }

  if (error || !reservation) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <Ionicons name="alert-circle-outline" size={36} color={L.border} />
        <Text style={s.errorText}>{error ?? 'Something went wrong.'}</Text>
        <TouchableOpacity onPress={() => goBack()} style={s.errorBackBtn}>
          <Text style={s.errorBackText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isOrganizer = user?.id === reservation.organizer_id;
  const current = players.length;
  const max = reservation.max_players;
  const needed = playersNeeded(current, max);
  const isBallMachine = reservation.asset_type === 'ball_machine';
  const showFindPlayers = isOrganizer && !isBallMachine && needed > 0;

  const list: InviteRow[] = tab === 'nearby'
    ? nearby.candidates.map(fromCandidate)
    : tab === 'friends'
      ? friends.map(fromInvitable)
      : searchResults.map(fromInvitable);
  const listLoading = tab === 'nearby' ? nearby.loading : tab === 'friends' ? friendsLoading : searching;
  const alreadyOnReservation = new Set(players.map(p => p.profileId));

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={s.header}>
        <TouchableOpacity style={s.iconBtn} onPress={() => goBack()} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={20} color={L.navy} />
        </TouchableOpacity>
        <Text style={s.title}>{isBallMachine ? 'Confirm Booking' : 'Find Players'}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.screenH, paddingBottom: insets.bottom + 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={L.gold} />}
      >
        <View style={s.summaryCard}>
          <Text style={s.summaryAsset}>{selection.assetName ?? 'Your Reservation'}</Text>
          <Text style={s.summarySub}>{facility.facilityName ?? ''}</Text>
          {!isBallMachine && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <StatusChip
                label={occupancyStatusLabel(current, max)}
                variant={needed === 0 ? 'green' : 'gold'}
                icon={needed === 0 ? 'checkmark-circle' : 'people-outline'}
              />
              <Text style={s.occupancyText}>{occupancyCountLabel(current, max)}</Text>
            </View>
          )}
        </View>

        <Text style={s.sectionTitle}>Your Group</Text>
        {players.map(p => (
          <View key={p.id} style={s.rosterRow}>
            {p.avatarUrl ? (
              <Image source={{ uri: p.avatarUrl }} style={r.avatarImg} />
            ) : (
              <View style={r.avatar}><Text style={r.avatarText}>{p.fullName.slice(0, 2).toUpperCase()}</Text></View>
            )}
            <Text style={s.rosterName}>{p.fullName}</Text>
            {p.isOrganizer && <StatusChip label="Organizer" variant="navy" />}
          </View>
        ))}

        {!isOrganizer && (
          <Text style={s.hintText}>Only the organizer can invite more players.</Text>
        )}

        {showFindPlayers && (
          <>
            <View style={s.tabRow}>
              <TouchableOpacity style={[s.tab, tab === 'nearby' && s.tabActive]} activeOpacity={0.85} onPress={() => setTab('nearby')}>
                <Text style={[s.tabText, tab === 'nearby' && s.tabTextActive]}>Nearby</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.tab, tab === 'friends' && s.tabActive]} activeOpacity={0.85} onPress={() => setTab('friends')}>
                <Text style={[s.tabText, tab === 'friends' && s.tabTextActive]}>Friends</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.tab, tab === 'search' && s.tabActive]} activeOpacity={0.85} onPress={() => setTab('search')}>
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

            {listLoading ? (
              <ActivityIndicator size="small" color={L.gold} style={{ marginTop: 16 }} />
            ) : list.length === 0 ? (
              <Text style={s.emptyText}>
                {tab === 'nearby'
                  ? 'No eligible players found near this facility right now.'
                  : tab === 'friends'
                    ? "You don't have any connections yet. Find players in Partner Finder."
                    : query.trim().length < 2 ? 'Type at least 2 characters to search.' : 'No players found.'}
              </Text>
            ) : (
              list
                .filter(row => !alreadyOnReservation.has(row.id))
                .map(row => (
                  <PlayerRow key={row.id} row={row} invited={invitedIds.has(row.id)} onInvite={() => handleInvite(row.id)} />
                ))
            )}
          </>
        )}

        <TouchableOpacity style={s.primaryBtn} activeOpacity={0.88} onPress={handleContinue}>
          <Text style={s.primaryBtnText}>Continue</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: L.bg, paddingHorizontal: 32 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.screenH, paddingVertical: spacing.screenV, backgroundColor: L.bg,
  },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title:   { color: L.navy, fontSize: 17, fontWeight: '900' },

  summaryCard: {
    backgroundColor: L.bg, borderRadius: radius.card, borderWidth: 1, borderColor: L.border,
    padding: spacing.lg, marginTop: spacing.sm,
  },
  summaryAsset: { color: L.navy, fontSize: 16, fontWeight: '800' },
  summarySub: { color: L.textSub, fontSize: 12, fontWeight: '600', marginTop: 2 },
  occupancyText: { color: L.textSub, fontSize: 12, fontWeight: '600' },

  sectionTitle: { color: L.navy, fontSize: 13, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: spacing.xl, marginBottom: spacing.sm },
  rosterRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  rosterName: { flex: 1, color: L.text, fontSize: 14, fontWeight: '700' },
  hintText: { color: L.textSub, fontSize: 12, fontWeight: '500', marginTop: 12, textAlign: 'center' },

  tabRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl, marginBottom: spacing.sm },
  tab: { flex: 1, alignItems: 'center', borderWidth: 1.5, borderColor: L.border, borderRadius: radius.button, paddingVertical: 10 },
  tabActive: { borderColor: L.gold, backgroundColor: L.goldBg },
  tabText: { color: L.textSub, fontSize: 13, fontWeight: '700' },
  tabTextActive: { color: L.navy },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: L.bg, borderWidth: 1, borderColor: L.border, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: spacing.sm,
  },
  searchInput: { flex: 1, color: L.text, fontSize: 14 },
  emptyText: { color: L.textSub, fontSize: 13, textAlign: 'center', marginTop: 24, lineHeight: 20 },

  primaryBtn: { backgroundColor: L.navy, borderRadius: radius.button, paddingVertical: 16, alignItems: 'center', marginTop: spacing.xxl },
  primaryBtnText: { color: L.white, fontSize: 16, fontWeight: '800' },

  errorText: { color: L.textSub, fontSize: 14, fontWeight: '500', textAlign: 'center' },
  errorBackBtn: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: radius.button, backgroundColor: L.navy },
  errorBackText: { color: L.white, fontSize: 14, fontWeight: '700' },
});
