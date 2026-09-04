import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { goBack } from '@/lib/navigation';
import { colors } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { useSession } from '@/hooks/useSession';
import { useTournamentBookmarks } from '@/hooks/useTournamentBookmarks';
import { usePlayEventBookmarks } from '@/hooks/usePlayEventBookmarks';
import { fetchBookmarkedTournaments, type BookmarkedTournament } from '@/lib/supabase/tournamentBookmarks';
import { fetchBookmarkedPlayEvents, type BookmarkedPlayEvent } from '@/lib/supabase/playEventBookmarks';

const L = {
  bg: colors.bg, page: colors.page, navy: colors.navy, gold: colors.gold,
  goldBg: colors.goldBg, text: colors.text, textSub: colors.textSub,
  border: colors.border, danger: colors.danger, dangerBg: colors.dangerBg,
};

function SavedCard({
  icon, title, subtitle, onView, onUnsave,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string | null;
  onView: () => void;
  onUnsave: () => void;
}) {
  return (
    <View style={c.card}>
      <View style={c.logoBox}>
        <Ionicons name={icon} size={20} color={L.gold} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={c.title} numberOfLines={2}>{title}</Text>
        {!!subtitle && <Text style={c.subtitle} numberOfLines={2}>{subtitle}</Text>}
      </View>
      <TouchableOpacity style={c.viewBtn} activeOpacity={0.75} onPress={onView}>
        <Ionicons name="eye-outline" size={15} color={L.navy} />
      </TouchableOpacity>
      <TouchableOpacity style={c.unsaveBtn} activeOpacity={0.75} onPress={onUnsave}>
        <Ionicons name="heart" size={15} color={L.danger} />
      </TouchableOpacity>
    </View>
  );
}

const c = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: L.bg, borderRadius: shape.card,
    borderWidth: 1, borderColor: L.border,
    padding: 12, marginBottom: 10,
  },
  logoBox: {
    width: 40, height: 40, borderRadius: shape.panel,
    backgroundColor: L.goldBg, alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  title: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800', textTransform: 'uppercase', lineHeight: 21 },
  subtitle: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', marginTop: 2 },
  viewBtn: {
    width: 34, height: 34, borderRadius: shape.cta,
    borderWidth: 1.5, borderColor: L.border,
    alignItems: 'center', justifyContent: 'center',
  },
  unsaveBtn: {
    width: 34, height: 34, borderRadius: shape.cta,
    borderWidth: 1.5, borderColor: L.dangerBg,
    alignItems: 'center', justifyContent: 'center',
  },
});

export default function SavedEventsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const { toggleBookmark: toggleTournament } = useTournamentBookmarks();
  const { toggleBookmark: togglePlayEvent } = usePlayEventBookmarks();

  const [tournaments, setTournaments] = useState<BookmarkedTournament[]>([]);
  const [playEvents, setPlayEvents]   = useState<BookmarkedPlayEvent[]>([]);
  const [loading, setLoading]         = useState(true);

  const refresh = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    setLoading(true);
    const [t, p] = await Promise.all([
      fetchBookmarkedTournaments(user.id),
      fetchBookmarkedPlayEvents(user.id),
    ]);
    setTournaments(t);
    setPlayEvents(p);
    setLoading(false);
  }, [user?.id]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const isEmpty = tournaments.length === 0 && playEvents.length === 0;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={L.navy} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Saved Events</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.gold} />
        </View>
      ) : isEmpty ? (
        <View style={s.empty}>
          <Ionicons name="heart-outline" size={52} color={L.textSub} />
          <Text style={s.emptyTitle}>Nothing saved yet</Text>
          <Text style={s.emptySub}>
            Tap the heart icon on any tournament or Community Play event to save it here.
          </Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 24 }]}
        >
          {tournaments.length > 0 && (
            <>
              <Text style={s.sectionLabel}>TOURNAMENTS  •  {tournaments.length}</Text>
              {tournaments.map(t => (
                <SavedCard
                  key={t.id}
                  icon="trophy-outline"
                  title={t.name}
                  subtitle={[t.venue_name, t.city].filter(Boolean).join(', ') || null}
                  onView={() => router.push(`/tournament/${t.id}` as never)}
                  onUnsave={() => { toggleTournament(t.id); setTournaments(prev => prev.filter(x => x.id !== t.id)); }}
                />
              ))}
            </>
          )}

          {playEvents.length > 0 && (
            <>
              <Text style={[s.sectionLabel, tournaments.length > 0 && { marginTop: 8 }]}>
                COMMUNITY PLAY  •  {playEvents.length}
              </Text>
              {playEvents.map(e => (
                <SavedCard
                  key={e.id}
                  icon="people-circle-outline"
                  title={e.name}
                  subtitle={e.venue_name ?? e.location ?? ([e.city, e.state].filter(Boolean).join(', ') || null)}
                  onView={() => router.push(`/community/${e.id}` as never)}
                  onUnsave={() => { togglePlayEvent(e.id); setPlayEvents(prev => prev.filter(x => x.id !== e.id)); }}
                />
              ))}
            </>
          )}
        </ScrollView>
      )}
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

  list: { paddingHorizontal: 16, paddingTop: 16 },
  sectionLabel: { color: L.textSub, fontSize: text.cardLabel.size, fontWeight: '800', letterSpacing: text.cardLabel.letterSpacing, marginBottom: 12 },

  empty: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 40, gap: 12,
  },
  emptyTitle: { color: L.navy, fontSize: text.modalTitle.size, fontWeight: '900' },
  emptySub: { color: L.textSub, fontSize: text.body.size, fontWeight: '500', textAlign: 'center', lineHeight: 22 },
});
