import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { spacing, useTheme, useThemedStyles, type ThemeRoles } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { divisionLeaderboard, type LeaderboardEntry, type LeaderboardMatch } from '@shared/leaderboard';
import { useSession } from '@/hooks/useSession';
import { useTournamentLive } from '@/hooks/useTournamentLive';
import { fetchTournamentById } from '@/lib/supabase/tournaments';
import { fetchDivisionsForTournament, type DivisionData } from '@/lib/supabase/divisions';
import { fetchLeaderboardMatches } from '@/lib/supabase/leaderboard';
import { courtLabel } from '@/lib/tournamentCourts';

// Live leaderboard by division: who's still in (and where), final placings
// (Champion, 2nd, 3rd, 4th, T5 ...) and every team's record. Rules in
// packages/shared/src/leaderboard.ts, shared with web.

export default function TournamentLeaderboardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const s = useThemedStyles(styles);
  const { roles: t, statusBarStyle } = useTheme();
  const { user } = useSession();

  const [tournamentName, setTournamentName] = useState('');
  const [divisions, setDivisions] = useState<DivisionData[]>([]);
  const [matches, setMatches] = useState<Map<string, LeaderboardMatch[]>>(new Map());
  const [divisionId, setDivisionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [tournament, divs, byDivision] = await Promise.all([
        fetchTournamentById(id), fetchDivisionsForTournament(id), fetchLeaderboardMatches(id),
      ]);
      setTournamentName(tournament?.name ?? '');
      const withMatches = divs.filter(d => byDivision.has(d.id));
      setDivisions(withMatches);
      setMatches(byDivision);
      setDivisionId(prev => (prev && byDivision.has(prev) ? prev : withMatches[0]?.id ?? null));
      setError(null);
    } catch {
      setError('Could not load the leaderboard.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useTournamentLive(id, () => { void load(); });

  const rows = useMemo(
    () => (divisionId ? divisionLeaderboard(matches.get(divisionId) ?? []) : []),
    [divisionId, matches],
  );
  const still = rows.filter(r => r.status === 'in');
  const placed = rows.filter(r => r.status === 'placed');
  const pool = rows.filter(r => r.status === 'pool');

  function renderRow(r: LeaderboardEntry) {
    const mine = !!user && r.members.includes(user.id);
    const medal = r.place === 1 ? t.accent : r.place === 2 ? t.textSecondary : r.place === 3 ? '#B7792F' : null;
    const record = `${r.wins}-${r.losses}${r.wins + r.losses > 0 ? ` · ${r.pointDiff > 0 ? '+' : ''}${r.pointDiff}` : ''}`;
    return (
      <View key={r.key} style={[s.row, mine && s.rowMine]}>
        <View style={[s.place, medal ? { borderColor: medal } : null]}>
          {r.place === 1
            ? <Ionicons name="trophy" size={16} color={t.accent} />
            : <Text style={[s.placeText, medal ? { color: medal } : null]} numberOfLines={1}>
                {r.status === 'in' ? '•' : r.status === 'pool' ? '–' : (r.placeLabel ?? '').replace('Champion', '1st')}
              </Text>}
        </View>
        <View style={s.rowMain}>
          <Text style={s.name} numberOfLines={1}>
            {r.name}{mine ? '  ' : ''}
            {mine && <Text style={s.you}>YOU</Text>}
          </Text>
          <Text style={s.sub} numberOfLines={1}>
            {r.status === 'in'
              ? [r.currentRound, r.onCourt ? `on ${courtLabel(r.onCourt)}` : null].filter(Boolean).join(' · ')
              : r.status === 'pool'
                ? 'Out in pools'
                : r.placeLabel === 'Champion' ? 'Champion' : `Placed ${r.placeLabel}`}
          </Text>
        </View>
        <Text style={s.record}>{record}</Text>
      </View>
    );
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style={statusBarStyle} />
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={t.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Leaderboard</Text>
          {!!tournamentName && <Text style={s.headerSub} numberOfLines={1}>{tournamentName}</Text>}
        </View>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={t.accent} /></View>
      ) : error ? (
        <View style={s.center}>
          <Text style={s.empty}>{error}</Text>
          <TouchableOpacity onPress={() => { setLoading(true); void load(); }} style={s.retry}>
            <Text style={s.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : divisions.length === 0 ? (
        <View style={s.center}><Text style={s.empty}>The leaderboard appears once brackets or pools are built.</Text></View>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabsWrap} contentContainerStyle={s.tabs}>
            {divisions.map(d => {
              const active = d.id === divisionId;
              return (
                <TouchableOpacity key={d.id} onPress={() => setDivisionId(d.id)} style={[s.tab, active && s.tabActive]}>
                  <Text style={[s.tabText, active && s.tabTextActive]}>{d.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + spacing.xxl }]}>
            {still.length > 0 && (
              <>
                <Text style={s.section}>STILL IN · {still.length}</Text>
                {still.map(renderRow)}
              </>
            )}
            {placed.length > 0 && (
              <>
                <Text style={s.section}>PLACINGS</Text>
                {placed.map(renderRow)}
              </>
            )}
            {pool.length > 0 && (
              <>
                <Text style={s.section}>OUT IN POOLS</Text>
                {pool.map(renderRow)}
              </>
            )}
            <Text style={s.foot}>Record is wins-losses and point difference. Updates live as scores come in.</Text>
          </ScrollView>
        </>
      )}
    </View>
  );
}

const styles = (t: ThemeRoles) => StyleSheet.create({
  root: { flex: 1, backgroundColor: t.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.screenH, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: t.borderSubtle,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  title: { color: t.textPrimary, fontSize: text.rowTitle.size, fontWeight: '800' },
  headerSub: { color: t.textSecondary, fontSize: text.caption.size },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  empty: { color: t.textSecondary, fontSize: text.body.size, textAlign: 'center' },
  retry: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: shape.cta, borderWidth: 1, borderColor: t.border },
  retryText: { color: t.textPrimary, fontSize: text.action.size, fontWeight: '700' },
  // Same fix as the other pill rows (6edc08c, a2a6cf4): flexShrink: 0 so the
  // parent column can't squeeze the row shorter than its pills (that clipped
  // the bottom of the labels), alignItems: 'center' so pills don't stretch
  // into tall capsules, and no fixed height anywhere, so larger text sizes fit.
  tabsWrap: { flexGrow: 0, flexShrink: 0, borderBottomWidth: 1, borderBottomColor: t.borderSubtle },
  tabs: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.screenH, paddingVertical: spacing.sm, gap: spacing.xs },
  tab: { paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: shape.pill, borderWidth: 1, borderColor: t.border, flexShrink: 0 },
  tabActive: { backgroundColor: t.primary, borderColor: t.primary },
  // Secondary text on white is under WCAG's 4.5:1; labels meant to be read use the main text colour.
  tabText: { color: t.textPrimary, fontSize: text.caption.size, fontWeight: '700' },
  tabTextActive: { color: t.onPrimary },
  content: { paddingHorizontal: spacing.screenH, paddingTop: spacing.md },
  section: { color: t.textMuted, fontSize: text.caption.size, fontWeight: '800', letterSpacing: 0.8, marginTop: spacing.md, marginBottom: spacing.sm },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderWidth: 1, borderColor: t.border, borderRadius: shape.card, backgroundColor: t.surface,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.xs,
  },
  rowMine: { borderColor: t.accent, backgroundColor: t.accentBg },
  place: {
    width: 40, height: 32, borderRadius: shape.badge, borderWidth: 1, borderColor: t.border,
    alignItems: 'center', justifyContent: 'center',
  },
  placeText: { color: t.textSecondary, fontSize: text.caption.size, fontWeight: '800' },
  rowMain: { flex: 1, minWidth: 0 },
  name: { color: t.textPrimary, fontSize: text.body.size, fontWeight: '700' },
  you: { color: t.accent, fontSize: text.caption.size, fontWeight: '800' },
  sub: { color: t.textSecondary, fontSize: text.caption.size, marginTop: 1 },
  record: { color: t.textPrimary, fontSize: text.caption.size, fontWeight: '700' },
  foot: { color: t.textMuted, fontSize: text.caption.size, textAlign: 'center', marginTop: spacing.lg },
});
