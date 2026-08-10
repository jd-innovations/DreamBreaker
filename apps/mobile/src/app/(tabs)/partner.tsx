import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Image, ActivityIndicator, Alert,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing } from '@/theme';
import { useSession } from '@/hooks/useSession';
import { useSlideMenu } from '@/components/SlideMenu';
import { fetchMyGroups, fetchDiscoverGroups, joinGroup, type Group } from '@/lib/groupService';

const L = {
  bg: colors.bg, page: colors.page, navy: colors.navy,
  gold: colors.gold, goldLight: colors.goldLight, goldBg: colors.goldBg,
  text: colors.text, textSub: colors.textSub, border: colors.border,
  success: colors.success, successBg: colors.successBg,
};

// ─── My Group card ─────────────────────────────────────────────────────────

function MyGroupCard({ g }: { g: Group }) {
  const FALLBACK = 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=400&h=200&fit=crop&q=80';
  return (
    <TouchableOpacity
      style={gc.card}
      activeOpacity={0.85}
      onPress={() => router.push(`/groups/${g.id}` as never)}
    >
      <Image source={{ uri: g.image_url ?? FALLBACK }} style={gc.image} resizeMode="cover" />
      <View style={gc.info}>
        <Text style={gc.name} numberOfLines={2}>{g.name}</Text>
        <View style={gc.metaRow}>
          <Ionicons name="people-outline" size={12} color={L.textSub} />
          <Text style={gc.meta}>{g.memberCount.toLocaleString()} Members</Text>
        </View>
        <View style={gc.statusChip}>
          <Ionicons name="shield-checkmark-outline" size={11} color={L.gold} />
          <Text style={gc.statusText}>
            {g.privacy === 'public' ? 'Public' : g.privacy === 'private' ? 'Private' : 'Secret'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const gc = StyleSheet.create({
  card: {
    width: 160, backgroundColor: L.bg, borderRadius: 16,
    borderWidth: 1, borderColor: L.border, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  image: { width: '100%', height: 90 },
  info: { padding: 10, gap: 5 },
  name: { color: L.navy, fontSize: 13, fontWeight: '800', lineHeight: 17 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { color: L.textSub, fontSize: 11 },
  statusChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start', borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 3, backgroundColor: L.goldLight,
  },
  statusText: { color: L.gold, fontSize: 10, fontWeight: '700' },
});

// ─── Discover card ──────────────────────────────────────────────────────────

function DiscoverCard({ g, onJoined }: { g: Group; onJoined: () => void }) {
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const { user } = useSession();

  async function handleJoin(e: { stopPropagation: () => void }) {
    e.stopPropagation();
    if (!user?.id || joined || joining) return;
    setJoining(true);
    try {
      await joinGroup(g.id, user.id);
      setJoined(true);
      onJoined();
    } catch (err: unknown) {
      Alert.alert('Could not join', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setJoining(false);
    }
  }

  return (
    <TouchableOpacity
      style={dc.card}
      activeOpacity={0.85}
      onPress={() => router.push(`/groups/${g.id}` as never)}
    >
      <Image
        source={{ uri: g.image_url ?? 'https://images.unsplash.com/photo-1526888935184-a82d2a4b7e67?w=400&h=300&fit=crop&q=80' }}
        style={dc.image}
        resizeMode="cover"
      />
      <View style={dc.body}>
        <Text style={dc.name} numberOfLines={2}>{g.name}</Text>
        <View style={dc.metaRow}>
          <Text style={dc.meta}>{g.memberCount.toLocaleString()} Members</Text>
          <View style={dc.dot} />
          <Text style={dc.meta}>{g.skill}</Text>
        </View>
        {!!g.description && <Text style={dc.desc} numberOfLines={2}>{g.description}</Text>}
        <TouchableOpacity
          style={[dc.joinBtn, joined && dc.joinBtnRequested]}
          onPress={handleJoin}
          activeOpacity={0.8}
          disabled={joining || joined}
        >
          {joining ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={[dc.joinText, joined && dc.joinTextRequested]}>{joined ? 'Joined' : 'Join'}</Text>
          )}
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const dc = StyleSheet.create({
  card: {
    flexDirection: 'column', backgroundColor: L.bg, borderRadius: 16,
    borderWidth: 1, borderColor: L.border, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  image: { width: '100%', height: 120 },
  body: { padding: 12, gap: 5 },
  name: { color: L.navy, fontSize: 15, fontWeight: '800' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { color: L.textSub, fontSize: 12 },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: L.textSub },
  desc: { color: L.textSub, fontSize: 12, lineHeight: 17, marginBottom: 4 },
  joinBtn: {
    backgroundColor: L.gold, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 10,
    alignSelf: 'stretch', alignItems: 'center',
  },
  joinBtnRequested: { backgroundColor: L.page, borderWidth: 1.5, borderColor: L.border },
  joinText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  joinTextRequested: { color: L.textSub },
});

// ─── Section header ─────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={sh.row}>
      <Text style={sh.title}>{title}</Text>
    </View>
  );
}
const sh = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { color: L.navy, fontSize: 17, fontWeight: '900' },
});

// ─── Main ───────────────────────────────────────────────────────────────────

export default function GroupsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const { setTriggerVisible } = useSlideMenu();
  const [myGroups, setMyGroups] = useState<Group[]>([]);
  const [discoverGroups, setDiscoverGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setTriggerVisible(false);
      return () => setTriggerVisible(true);
    }, [setTriggerVisible]),
  );

  const load = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    setLoading(true);
    try {
      const [mine, discover] = await Promise.all([
        fetchMyGroups(user.id),
        fetchDiscoverGroups(user.id),
      ]);
      setMyGroups(mine);
      setDiscoverGroups(discover);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={s.header}>
        <View style={s.headerText}>
          <Text style={s.pageTitle}>Groups</Text>
        </View>
        <TouchableOpacity
          style={s.createBtn}
          onPress={() => router.push('/groups/create' as never)}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={16} color={L.gold} />
          <Text style={s.createBtnText}>Create Group</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.loading}><ActivityIndicator color={L.gold} /></View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 110 }]}
        >
          <View style={s.section}>
            <SectionHeader title="My Groups" />
            {myGroups.length === 0 ? (
              <View style={s.emptyGroups}>
                <Ionicons name="people-outline" size={28} color={L.border} />
                <Text style={s.emptyGroupsTitle}>No groups yet</Text>
                <Text style={s.emptyGroupsSub}>Create a group or join one to get started.</Text>
                <TouchableOpacity
                  style={s.emptyCreateBtn}
                  onPress={() => router.push('/groups/create' as never)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="add" size={15} color={L.gold} />
                  <Text style={s.emptyCreateText}>Create Group</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.hScroll}>
                {myGroups.map((g) => <MyGroupCard key={g.id} g={g} />)}
              </ScrollView>
            )}
          </View>

          <View style={s.section}>
            <SectionHeader title="Discover Groups" />
            {discoverGroups.length === 0 ? (
              <Text style={s.emptyDiscover}>No public groups to discover yet.</Text>
            ) : (
              <View style={s.discoverList}>
                {discoverGroups.map((g) => <DiscoverCard key={g.id} g={g} onJoined={load} />)}
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },

  header: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingHorizontal: spacing.screenH, paddingVertical: 16,
    backgroundColor: L.bg, borderBottomWidth: 1, borderBottomColor: L.border,
  },
  headerText: { flex: 1, marginRight: 12 },
  pageTitle: { color: L.navy, fontSize: 28, fontWeight: '900', marginBottom: 2 },
  pageSub: { color: L.textSub, fontSize: 13 },

  createBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1.5, borderColor: L.gold, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 8, marginTop: 4, flexShrink: 0,
  },
  createBtnText: { color: L.gold, fontSize: 13, fontWeight: '700' },

  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  scroll: { paddingTop: 20, paddingHorizontal: spacing.screenH, gap: 8 },
  section: { marginBottom: 24 },

  hScroll: { gap: 12, paddingBottom: 4 },

  emptyGroups: {
    backgroundColor: L.bg, borderRadius: 16,
    borderWidth: 1, borderColor: L.border,
    padding: 24, alignItems: 'center', gap: 8,
  },
  emptyGroupsTitle: { color: L.navy, fontSize: 15, fontWeight: '800' },
  emptyGroupsSub: { color: L.textSub, fontSize: 13, textAlign: 'center', lineHeight: 18 },
  emptyCreateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1.5, borderColor: colors.goldBorder, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8, marginTop: 4,
  },
  emptyCreateText: { color: L.gold, fontSize: 13, fontWeight: '700' },

  emptyDiscover: { color: L.textSub, fontSize: 13, textAlign: 'center', paddingVertical: 16 },

  discoverList: { gap: 12 },
});
