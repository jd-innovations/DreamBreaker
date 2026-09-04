import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Image, Alert, ActivityIndicator,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { supabase } from '@/lib/supabase';
import { useSupportContext } from '@/lib/support/supportContext';
import type { Connection } from '@/lib/connectionStore';

const L = {
  bg: colors.bg, page: colors.page, navy: colors.navy,
  gold: colors.gold, goldBg: colors.goldBg,
  text: colors.text, textSub: colors.textSub, border: colors.border,
  success: colors.success, successBg: colors.successBg,
  danger: colors.danger,
};

type Tab = 'All' | 'Recent';
const TABS: Tab[] = ['All', 'Recent'];

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 7)  return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 4)  return `${w}w ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

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

function ConnectionCard({ conn, onRemove }: { conn: Connection; onRemove: () => void }) {
  return (
    <View style={cc.card}>
      <Avatar uri={conn.player.photoUri} size={52} />

      <View style={cc.info}>
        <Text style={cc.name} numberOfLines={2}>{conn.player.name}</Text>
        <View style={cc.duprBadge}>
          <Ionicons name="star" size={10} color={L.gold} />
          <Text style={cc.duprText}>{conn.player.dupr.toFixed(1)}</Text>
        </View>
        <Text style={cc.meta} numberOfLines={1}>{conn.player.location} - {conn.player.distance} mi</Text>
        <Text style={cc.meta}>Connected {relativeDate(conn.connectedAt)}</Text>
      </View>

      <View style={cc.actions}>
        <TouchableOpacity
          style={cc.actionBtn}
          onPress={() => router.push(`/players/${conn.player.id}/invite` as never)}
        >
          <Ionicons name="paper-plane-outline" size={16} color={L.gold} />
        </TouchableOpacity>
        <TouchableOpacity
          style={cc.actionBtn}
          onPress={() => router.push(`/match/profile/${conn.player.id}` as never)}
        >
          <Ionicons name="person-outline" size={16} color={L.navy} />
        </TouchableOpacity>
        <TouchableOpacity
          style={cc.actionBtn}
          onPress={() => Alert.alert(
            'Remove Connection',
            `Remove ${conn.player.name} from your connections?`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Remove', style: 'destructive', onPress: onRemove },
            ],
          )}
        >
          <Ionicons name="person-remove-outline" size={16} color={L.danger} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const cc = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: L.bg, borderRadius: shape.panel,
    borderWidth: 1, borderColor: L.border,
    paddingVertical: 12, paddingHorizontal: 12,
  },
  info: { flex: 1, minWidth: 0, gap: 3 },
  name: { color: L.navy, fontSize: text.body.size, lineHeight: 18, fontWeight: '500' },
  duprBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' },
  duprText: { color: L.gold, fontSize: 11, fontWeight: '700' },
  meta: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500' },
  actions: { flexDirection: 'row', gap: 5, alignItems: 'center', flexShrink: 0 },
  actionBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: L.page, borderWidth: 1.5, borderColor: L.border,
    alignItems: 'center', justifyContent: 'center',
  },
});

async function fetchMatches(): Promise<Connection[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: matches } = await supabase
    .from('partner_matches')
    .select('id, user_a, user_b, matched_at')
    .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
    .order('matched_at', { ascending: false });

  if (!matches || matches.length === 0) return [];

  const otherIds = matches.map(m => m.user_a === user.id ? m.user_b : m.user_a);

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, dupr, self_rating, location_city, location_state, looking_status')
    .in('id', otherIds);

  const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]));

  return matches
    .map(m => {
      const otherId = m.user_a === user.id ? m.user_b : m.user_a;
      const p = profileMap[otherId];
      if (!p) return null;
      const dupr = p.dupr ?? (p.self_rating ? parseFloat(p.self_rating) : 0);
      const location = [p.location_city, p.location_state].filter(Boolean).join(', ') || 'Unknown';
      return {
        id: m.id,
        player: {
          id: p.id,
          name: p.full_name,
          dupr,
          location,
          distance: 0,
          lookingFor: p.looking_status || 'Partner',
          photoUri: p.avatar_url ?? undefined,
        },
        connectedAt: m.matched_at,
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null) as Connection[];
}

export default function MyConnectionsScreen() {
  const insets = useSafeAreaInsets();
  const [tab, setTab]           = useState<Tab>('All');
  const [connections, setConns] = useState<Connection[]>([]);
  const [loading, setLoading]   = useState(true);

  useSupportContext({ feature: 'match' });

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    setLoading(true);
    fetchMatches().then(data => {
      if (!cancelled) { setConns(data); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, []));

  const shown = tab === 'Recent'
    ? connections.filter(c => Date.now() - new Date(c.connectedAt).getTime() < WEEK_MS)
    : connections;

  async function handleRemove(conn: Connection) {
    await supabase.from('partner_matches').delete().eq('id', conn.id);
    setConns(prev => prev.filter(c => c.id !== conn.id));
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={L.navy} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.title}>My Connections</Text>
          <Text style={s.subtitle}>{connections.length} player{connections.length !== 1 ? 's' : ''} connected</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.tabStrip}
        style={s.tabBar}
      >
        {TABS.map((t) => (
          <TouchableOpacity
            key={t}
            style={[s.tabChip, tab === t && s.tabChipActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[s.tabText, tab === t && s.tabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
      >
        {loading ? (
          <View style={s.empty}>
            <ActivityIndicator size="large" color={L.navy} />
          </View>
        ) : shown.length > 0 ? (
          <View style={s.list}>
            {shown.map(c => (
              <ConnectionCard key={c.id} conn={c} onRemove={() => handleRemove(c)} />
            ))}
          </View>
        ) : (
          <View style={s.empty}>
            <Ionicons name="people-outline" size={52} color={L.textSub} />
            <Text style={s.emptyTitle}>
              {tab === 'Recent' ? 'No recent connections' : 'No connections yet'}
            </Text>
            <Text style={s.emptySub}>
              {tab === 'Recent'
                ? 'No new connections in the last 7 days.'
                : 'Connect with players in the Partner Finder to see them here.'}
            </Text>
            {tab === 'All' && (
              <TouchableOpacity style={s.emptyBtn} onPress={() => router.back()} activeOpacity={0.85}>
                <Text style={s.emptyBtnText}>Find Players</Text>
              </TouchableOpacity>
            )}
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
    paddingHorizontal: spacing.screenH, paddingVertical: 12,
    backgroundColor: L.bg, borderBottomWidth: 1, borderBottomColor: L.border,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  title: { color: L.navy, fontSize: text.modalTitle.size, fontWeight: '900' },
  subtitle: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500' },
  tabBar: { backgroundColor: L.bg, borderBottomWidth: 1, borderBottomColor: L.border, maxHeight: 50, flexGrow: 0 },
  tabStrip: { paddingHorizontal: spacing.screenH, paddingVertical: 8, gap: 8 },
  tabChip: { borderRadius: shape.pill, borderWidth: 1.5, borderColor: L.border, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: L.bg },
  tabChipActive: { backgroundColor: L.navy, borderColor: L.navy },
  tabText: { color: L.textSub, fontSize: text.controlLabel.size, fontWeight: '700' },
  tabTextActive: { color: '#FFFFFF' },
  scroll: { paddingHorizontal: spacing.screenH, paddingTop: 16 },
  list: { gap: 10 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800' },
  emptySub: { color: L.textSub, fontSize: text.body.size, fontWeight: '500', textAlign: 'center', lineHeight: 20, maxWidth: 280 },
  emptyBtn: { backgroundColor: L.gold, borderRadius: shape.cta, paddingHorizontal: 28, paddingVertical: 13, marginTop: 8 },
  emptyBtnText: { color: '#FFFFFF', fontSize: text.actionLarge.size, fontWeight: '800' },
});