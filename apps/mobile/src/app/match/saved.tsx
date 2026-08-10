import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Image, TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing } from '@/theme';
import { supabase } from '@/lib/supabase';
import { useSupportContext } from '@/lib/support/supportContext';
import type { SavedPlayer } from '@/lib/connectionStore';

const L = {
  bg: colors.bg, page: colors.page, navy: colors.navy,
  gold: colors.gold, goldLight: colors.goldLight,
  text: colors.text, textSub: colors.textSub, border: colors.border,
  danger: colors.danger,
};

type Filter = 'All' | 'Recent';
const FILTERS: Filter[] = ['All', 'Recent'];
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function Avatar({ uri, size }: { uri?: string; size: number }) {
  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return (
    <View style={[av.circle, { width: size, height: size, borderRadius: size / 2 }]}>
      <Ionicons name="person" size={size * 0.46} color={L.textSub} />
    </View>
  );
}
const av = StyleSheet.create({
  circle: { backgroundColor: L.page, borderWidth: 1, borderColor: L.border, alignItems: 'center', justifyContent: 'center' },
});

function PlayerCard({ sp, onRemove }: { sp: SavedPlayer; onRemove: () => void }) {
  const p = sp.player;
  return (
    <View style={pc.card}>
      <View style={pc.topRow}>
        <Avatar uri={p.photoUri} size={60} />
        <View style={pc.info}>
          <View style={pc.nameRow}>
            <Text style={pc.name}>{p.name}</Text>
            <View style={pc.duprBadge}>
              <Ionicons name="star" size={11} color={L.gold} />
              <Text style={pc.duprText}>{p.dupr.toFixed(1)} DUPR</Text>
            </View>
          </View>
          <View style={pc.metaRow}>
            <Ionicons name="location-outline" size={12} color={L.textSub} />
            <Text style={pc.meta}>{p.location} · {p.distance} mi</Text>
          </View>
          <Text style={pc.detail}>Looking for: <Text style={pc.detailVal}>{p.lookingFor}</Text></Text>
        </View>
      </View>

      <View style={pc.actions}>
        <TouchableOpacity
          style={pc.actionBtn}
          onPress={() => router.push(`/match/profile/${p.id}` as never)}
        >
          <Ionicons name="person-outline" size={16} color={L.navy} />
          <Text style={pc.actionText}>Profile</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[pc.actionBtn, pc.actionBtnGold]}
          onPress={() => router.push(`/players/${p.id}/invite` as never)}
        >
          <Ionicons name="paper-plane-outline" size={16} color="#FFFFFF" />
          <Text style={[pc.actionText, { color: '#FFFFFF' }]}>Invite</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={pc.removeBtn}
          onPress={() => Alert.alert(
            'Remove Player',
            `Remove ${p.name} from your saved players?`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Remove', style: 'destructive', onPress: onRemove },
            ],
          )}
        >
          <Ionicons name="trash-outline" size={18} color={L.danger} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const pc = StyleSheet.create({
  card: {
    backgroundColor: L.bg, borderRadius: 16,
    borderWidth: 1, borderColor: L.border,
    padding: 14, gap: 12,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  topRow:    { flexDirection: 'row', gap: 12 },
  info:      { flex: 1, gap: 3 },
  nameRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  name:      { color: L.navy, fontSize: 15, fontWeight: '800' },
  duprBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  duprText:  { color: L.gold, fontSize: 12, fontWeight: '700' },
  metaRow:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta:      { color: L.textSub, fontSize: 12 },
  detail:    { color: L.textSub, fontSize: 12 },
  detailVal: { color: L.text, fontWeight: '600' },
  actions:   { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderColor: L.border, borderRadius: 12, paddingVertical: 9,
  },
  actionBtnGold: { backgroundColor: L.gold, borderColor: L.gold },
  actionText:    { color: L.navy, fontSize: 13, fontWeight: '700' },
  removeBtn: {
    width: 42, borderWidth: 1.5, borderColor: colors.dangerBg,
    borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.dangerBg,
  },
});

async function fetchSaved(): Promise<SavedPlayer[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: likes } = await supabase
    .from('partner_likes')
    .select('to_user_id, created_at')
    .eq('from_user_id', user.id)
    .eq('kind', 'save')
    .order('created_at', { ascending: false });

  if (!likes || likes.length === 0) return [];

  const ids = likes.map(l => l.to_user_id);

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, dupr, self_rating, location_city, location_state, looking_status')
    .in('id', ids);

  const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]));

  return likes
    .map(l => {
      const p = profileMap[l.to_user_id];
      if (!p) return null;
      const dupr = p.dupr ?? (p.self_rating ? parseFloat(p.self_rating) : 0);
      const location = [p.location_city, p.location_state].filter(Boolean).join(', ') || 'Unknown';
      return {
        player: {
          id: p.id,
          name: p.full_name,
          dupr,
          location,
          distance: 0,
          lookingFor: p.looking_status || 'Partner',
          photoUri: p.avatar_url ?? undefined,
        },
        savedAt: l.created_at,
      } as SavedPlayer;
    })
    .filter((s): s is SavedPlayer => s !== null);
}

export default function SavedPlayersScreen() {
  const insets  = useSafeAreaInsets();
  const [search, setSearch]   = useState('');
  const [filter, setFilter]   = useState<Filter>('All');
  const [saved, setSaved]     = useState<SavedPlayer[]>([]);
  const [loading, setLoading] = useState(true);

  useSupportContext({ feature: 'match' });

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    setLoading(true);
    fetchSaved().then(data => {
      if (!cancelled) { setSaved(data); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, []));

  async function handleRemove(sp: SavedPlayer) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('partner_likes')
        .delete()
        .eq('from_user_id', user.id)
        .eq('to_user_id', sp.player.id)
        .eq('kind', 'save');
    }
    setSaved(prev => prev.filter(s => s.player.id !== sp.player.id));
  }

  const shown = saved.filter(sp => {
    const matchesSearch = sp.player.name.toLowerCase().includes(search.toLowerCase());
    if (filter === 'Recent') return matchesSearch && Date.now() - new Date(sp.savedAt).getTime() < WEEK_MS;
    return matchesSearch;
  });

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={L.navy} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.title}>Saved Players</Text>
          <Text style={s.subtitle}>Players you've bookmarked for future events.</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <View style={s.statsRow}>
        {([
          { val: saved.length,                                                                             label: 'Saved'     },
          { val: saved.filter(sp => sp.player.distance < 20).length,                                      label: 'Nearby'    },
          { val: saved.filter(sp => Date.now() - new Date(sp.savedAt).getTime() < WEEK_MS).length,        label: 'This Week' },
        ] as { val: number; label: string }[]).map((stat, i) => (
          <View key={i} style={[s.statCell, i < 2 && s.statCellBorder]}>
            <Text style={s.statVal}>{stat.val}</Text>
            <Text style={s.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 110 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.searchBar}>
          <Ionicons name="search-outline" size={18} color={L.textSub} />
          <TextInput
            style={s.searchInput}
            placeholder="Search players..."
            placeholderTextColor={L.textSub}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
          {FILTERS.map((f) => (
            <TouchableOpacity
              key={f}
              style={[s.filterChip, filter === f && s.filterChipActive]}
              onPress={() => setFilter(f)}
            >
              <Text style={[s.filterText, filter === f && s.filterTextActive]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {loading ? (
          <View style={s.empty}>
            <ActivityIndicator size="large" color={L.navy} />
          </View>
        ) : shown.length > 0 ? (
          <View style={s.list}>
            {shown.map(sp => (
              <TouchableOpacity
                key={sp.player.id}
                activeOpacity={0.97}
                onPress={() => router.push(`/match/profile/${sp.player.id}` as never)}
              >
                <PlayerCard sp={sp} onRemove={() => handleRemove(sp)} />
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={s.empty}>
            <Ionicons name="bookmark-outline" size={52} color={L.textSub} />
            <Text style={s.emptyTitle}>No saved players yet</Text>
            <Text style={s.emptySub}>Save players from Partner Finder to see them here.</Text>
            <TouchableOpacity style={s.emptyBtn} onPress={() => router.back()} activeOpacity={0.85}>
              <Text style={s.emptyBtnText}>Find Players</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <View style={[s.footerBar, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity style={s.findMoreBtn} onPress={() => router.back()} activeOpacity={0.85}>
          <Ionicons name="add" size={18} color="#FFFFFF" />
          <Text style={s.findMoreText}>Find More Players</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: L.page },
  header: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 4,
    paddingHorizontal: spacing.screenH, paddingVertical: 12,
    backgroundColor: L.bg, borderBottomWidth: 1, borderBottomColor: L.border,
  },
  backBtn:      { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  headerCenter: { flex: 1 },
  title:        { color: L.navy, fontSize: 22, fontWeight: '900' },
  subtitle:     { color: L.textSub, fontSize: 13, marginTop: 2 },
  statsRow: {
    flexDirection: 'row', backgroundColor: L.bg,
    borderBottomWidth: 1, borderBottomColor: L.border,
  },
  statCell:       { flex: 1, alignItems: 'center', paddingVertical: 12 },
  statCellBorder: { borderRightWidth: 1, borderRightColor: L.border },
  statVal:        { color: L.navy, fontSize: 22, fontWeight: '900' },
  statLabel:      { color: L.textSub, fontSize: 12, marginTop: 2 },
  scroll:   { paddingHorizontal: spacing.screenH, paddingTop: 16, gap: 4 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: L.bg, borderRadius: 14, borderWidth: 1.5, borderColor: L.border,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12,
  },
  searchInput: { flex: 1, color: L.text, fontSize: 15, padding: 0 },
  filterRow:   { gap: 8, paddingBottom: 16 },
  filterChip:       { borderRadius: 20, borderWidth: 1.5, borderColor: L.border, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: L.bg },
  filterChipActive: { backgroundColor: L.navy, borderColor: L.navy },
  filterText:       { color: L.textSub, fontSize: 13, fontWeight: '600' },
  filterTextActive: { color: '#FFFFFF' },
  list:   { gap: 12 },
  empty:      { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle: { color: L.navy, fontSize: 18, fontWeight: '800' },
  emptySub:   { color: L.textSub, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  emptyBtn:   { backgroundColor: L.gold, borderRadius: 14, paddingHorizontal: 28, paddingVertical: 13, marginTop: 8 },
  emptyBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  footerBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: L.bg, borderTopWidth: 1, borderTopColor: L.border,
    paddingHorizontal: spacing.screenH, paddingTop: 12,
  },
  findMoreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: L.navy, borderRadius: 14, paddingVertical: 15,
  },
  findMoreText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
