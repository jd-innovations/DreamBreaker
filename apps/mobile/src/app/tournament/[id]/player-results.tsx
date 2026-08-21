import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Share, Alert, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors, radius } from '@/theme';
import { StatusChip, PickleballIcon } from '@/components';
import type { Tournament } from '@/lib/tournamentTypes';
import { fetchTournamentById } from '@/lib/supabase/tournaments';
import { fetchDivisionsForTournament } from '@/lib/supabase/divisions';
import {
  fetchAllBrackets,
  getBracketMatchCounts,
  type DirectorBracket,
} from '@/lib/supabase/brackets';
import {
  getTournamentStatus,
  getTournamentStatusInfo,
  type TournamentStatusKey,
} from '@/lib/tournamentStatus';
import { useSession } from '@/hooks/useSession';

// ─── Player identity ──────────────────────────────────────────────────────────

// Updated per render from useSession
let _currentPlayerName = '';

function isMe(name: string | undefined): boolean {
  return !!name && !!_currentPlayerName &&
    name.trim().toLowerCase() === _currentPlayerName.trim().toLowerCase();
}

// ─── Theme ────────────────────────────────────────────────────────────────────

const L = {
  bg:         colors.bg,
  page:       colors.page,
  navy:       colors.navy,
  gold:       colors.gold,
  goldBg:     colors.goldBg,
  goldLight:  colors.goldLight,
  goldBorder: colors.goldBorder,
  text:       colors.text,
  textSub:    colors.textSub,
  border:     colors.border,
  success:    colors.success,
  successBg:  colors.successBg,
  danger:     colors.danger,
};

// ─── YOU badge ────────────────────────────────────────────────────────────────

function YouBadge() {
  return (
    <View style={yb.badge}>
      <Text style={yb.text}>YOU</Text>
    </View>
  );
}

const yb = StyleSheet.create({
  badge: {
    backgroundColor: L.gold, borderRadius: 5,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  text: { color: L.bg, fontSize: 9, fontWeight: '900', letterSpacing: 0.4 },
});

// ─── Summary card grid ────────────────────────────────────────────────────────

function SummaryCard({
  label, value, accent, success: successProp,
}: {
  label: string;
  value: string;
  accent?: boolean;
  success?: boolean;
}) {
  const bg    = accent ? L.goldBg  : successProp ? L.successBg : L.bg;
  const bdr   = accent ? L.goldBorder : successProp ? 'rgba(34,197,94,0.30)' : L.border;
  const color = accent ? L.gold   : successProp ? L.success   : L.navy;
  return (
    <View style={[sc.card, { backgroundColor: bg, borderColor: bdr }]}>
      <Text style={[sc.value, { color }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={sc.label}>{label}</Text>
    </View>
  );
}

const sc = StyleSheet.create({
  card: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderRadius: radius.card,
    paddingVertical: 14, paddingHorizontal: 4, gap: 4, minHeight: 76,
  },
  value: { fontSize: 22, fontWeight: '900' },
  label: { color: L.textSub, fontSize: 9, fontWeight: '700', letterSpacing: 0.5, textAlign: 'center' },
});

// ─── Podium row ───────────────────────────────────────────────────────────────

function PodiumRow({
  rank, name, isHighlighted,
}: { rank: 1 | 2; name: string | undefined; isHighlighted: boolean }) {
  const isChamp = rank === 1;
  const icon    = isChamp ? 'trophy'        : 'medal-outline';
  const badgeBg = isChamp ? L.goldBg        : L.page;
  const badgeBd = isChamp ? L.goldBorder    : L.border;
  const iconCol = isChamp ? L.gold          : L.textSub;
  const rankLbl = isChamp ? 'Champion'      : 'Runner-Up';

  if (!name) return null;

  return (
    <View style={[
      pod.row,
      isHighlighted && pod.rowHighlight,
      isChamp && pod.rowChamp,
    ]}>
      <View style={[pod.badge, { backgroundColor: badgeBg, borderColor: badgeBd }]}>
        <Ionicons name={icon as never} size={16} color={iconCol} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={pod.rankLabel}>{rankLbl}</Text>
        <Text style={pod.name} numberOfLines={1}>{name}</Text>
      </View>
      {isHighlighted && <YouBadge />}
    </View>
  );
}

const pod = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  rowChamp: { backgroundColor: L.goldBg },
  rowHighlight: {
    borderWidth: 1.5, borderColor: L.gold, borderRadius: 10,
    marginHorizontal: 10, marginVertical: 4,
    shadowColor: L.gold, shadowOpacity: 0.30, shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 }, elevation: 4,
  },
  badge: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    borderWidth: 1,
  },
  rankLabel: { color: L.textSub, fontSize: 10, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 2 },
  name:      { color: L.navy, fontSize: 15, fontWeight: '800' },
});

// ─── Division result card ─────────────────────────────────────────────────────

function DivisionResultCard({
  bracket,
}: { bracket: DirectorBracket }) {
  const [expanded, setExpanded] = useState(false);

  const allMatches = bracket.rounds.flatMap(r => r.matches).filter(
    m => m.participant1 !== null || m.participant2 !== null,
  );
  const completedMatches = allMatches.filter(m => m.status === 'completed');
  const finalMatch = completedMatches.length > 0
    ? completedMatches[completedMatches.length - 1]
    : null;

  const meIsChamp    = isMe(bracket.championName);
  const meIsRunnerUp = isMe(bracket.runnerUpName);
  const meInvolved   = meIsChamp || meIsRunnerUp;

  return (
    <View style={[dc.card, meInvolved && dc.cardMe]}>
      {/* ── Card header ── */}
      <TouchableOpacity
        style={dc.header}
        activeOpacity={0.8}
        onPress={() => setExpanded(v => !v)}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={dc.divName} numberOfLines={1}>{bracket.divisionName}</Text>
          <Text style={dc.matchStat}>
            {completedMatches.length} match{completedMatches.length !== 1 ? 'es' : ''} played
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {bracket.publishedAt && (
            <View style={dc.publishedBadge}>
              <Ionicons name="checkmark-circle" size={12} color={L.success} />
              <Text style={dc.publishedText}>Published</Text>
            </View>
          )}
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={L.textSub}
          />
        </View>
      </TouchableOpacity>

      {/* ── Podium ── */}
      <PodiumRow rank={1} name={bracket.championName} isHighlighted={meIsChamp} />
      <PodiumRow rank={2} name={bracket.runnerUpName} isHighlighted={meIsRunnerUp} />

      {/* ── Expanded detail (Phase 6) ── */}
      {expanded && (
        <View style={dc.expandSection}>
          {/* Final match score */}
          {finalMatch && finalMatch.score1 !== undefined && finalMatch.score2 !== undefined && (
            <View style={dc.expandRow}>
              <PickleballIcon size={13} color={L.textSub} />
              <Text style={dc.expandLabel}>Final Score</Text>
              <Text style={dc.expandValue}>
                {finalMatch.score1} – {finalMatch.score2}
              </Text>
            </View>
          )}

          {/* Bracket size */}
          <View style={dc.expandRow}>
            <Ionicons name="git-branch-outline" size={13} color={L.textSub} />
            <Text style={dc.expandLabel}>Bracket Size</Text>
            <Text style={dc.expandValue}>{bracket.bracketSize} players</Text>
          </View>

          {/* Participants count */}
          <View style={dc.expandRow}>
            <Ionicons name="people-outline" size={13} color={L.textSub} />
            <Text style={dc.expandLabel}>Participants</Text>
            <Text style={dc.expandValue}>{bracket.participants.length} registered</Text>
          </View>

          {/* Rounds played */}
          <View style={dc.expandRow}>
            <Ionicons name="list-outline" size={13} color={L.textSub} />
            <Text style={dc.expandLabel}>Rounds</Text>
            <Text style={dc.expandValue}>{bracket.rounds.length} rounds</Text>
          </View>

          {/* Round-by-round summary */}
          {bracket.rounds.map(round => {
            const roundMatches = round.matches.filter(
              m => m.participant1 !== null || m.participant2 !== null,
            );
            const done = roundMatches.filter(m => m.status === 'completed').length;
            return (
              <View key={round.id} style={dc.roundRow}>
                <Text style={dc.roundName}>{round.roundName}</Text>
                <Text style={dc.roundStat}>{done}/{roundMatches.length} completed</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const dc = StyleSheet.create({
  card: {
    backgroundColor: L.bg, borderWidth: 1, borderColor: L.border,
    borderRadius: radius.card, overflow: 'hidden', marginBottom: 12,
  },
  cardMe: {
    borderColor: L.gold, borderWidth: 1.5,
    shadowColor: L.gold, shadowOpacity: 0.20, shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 }, elevation: 4,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  divName:   { color: L.navy, fontSize: 15, fontWeight: '800', marginBottom: 2 },
  matchStat: { color: L.textSub, fontSize: 12 },
  publishedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  publishedText:  { color: L.success, fontSize: 11, fontWeight: '700' },

  expandSection: {
    backgroundColor: L.page, paddingHorizontal: 14, paddingVertical: 12, gap: 0,
  },
  expandRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  expandLabel: { color: L.textSub, fontSize: 13, fontWeight: '600', flex: 1 },
  expandValue: { color: L.navy,    fontSize: 13, fontWeight: '800' },

  roundRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  roundName: { color: L.navy,    fontSize: 12, fontWeight: '700' },
  roundStat: { color: L.textSub, fontSize: 12 },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function PlayerResultsScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();

  const [tournament, setTournament]             = useState<Tournament | null>(null);
  const [brackets, setBrackets]                 = useState<DirectorBracket[]>([]);
  const [divCount, setDivCount]                 = useState(0);
  const [matchCounts, setMatchCounts]           = useState({ total: 0, completed: 0, remaining: 0, completionPct: 0 });
  const [tournamentStatusKey, setTournamentStatusKey] = useState<TournamentStatusKey>('open');
  const [loading, setLoading]                   = useState(true);

  const refresh = useCallback(async () => {
    const [t, divs] = await Promise.all([fetchTournamentById(id), fetchDivisionsForTournament(id)]);
    const divNameMap: Record<string, string> = {};
    for (const d of divs ?? []) divNameMap[d.id] = d.name;
    const [bkts, counts] = await Promise.all([
      fetchAllBrackets(id, divNameMap),
      getBracketMatchCounts(id),
    ]);
    setTournament(t);
    setBrackets(bkts);
    setDivCount((divs ?? []).length);
    setMatchCounts(counts);
    if (t) setTournamentStatusKey(getTournamentStatus(t));
    setLoading(false);
  }, [id]);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    refresh().then(() => { if (!active) return; }).catch(() => setLoading(false));
    return () => { active = false; };
  }, [refresh]));

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.page }}>
        <ActivityIndicator color={colors.gold} size="large" />
      </View>
    );
  }

  _currentPlayerName = (user as { user_metadata?: { full_name?: string } } | null)?.user_metadata?.full_name ?? '';

  const completed = tournamentStatusKey === 'completed';

  // ── Not completed — empty state ──────────────────────────────────────────

  if (!completed) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={24} color={L.navy} />
          </TouchableOpacity>
          <Text style={s.title}>Results</Text>
        </View>
        <View style={s.emptyRoot}>
          <View style={s.emptyIconWrap}>
            <Ionicons name="hourglass-outline" size={44} color={L.textSub} />
          </View>
          <Text style={s.emptyTitle}>Results not available yet</Text>
          <Text style={s.emptySub}>
            Tournament results will appear here once the director completes all brackets and publishes the final standings.
          </Text>
          <TouchableOpacity
            style={s.emptyBtn}
            activeOpacity={0.85}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={16} color={L.bg} />
            <Text style={s.emptyBtnText}>Back to Tournament</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Derived values ───────────────────────────────────────────────────────

  const sorted = [...brackets].sort((a, b) =>
    a.divisionName.localeCompare(b.divisionName),
  );
  const completedBrackets  = brackets.filter(b => b.status === 'completed');
  const championsCount     = completedBrackets.filter(b => b.championName).length;

  // Completed date — latest bracket.completedAt
  const completedDate = (() => {
    const dates = brackets.map(b => b.completedAt).filter(Boolean) as string[];
    if (!dates.length) return tournament?.date ?? '';
    return new Date(dates.sort().at(-1)!).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  })();

  // Share content
  async function handleShare() {
    const lines = [
      `🏆 ${tournament?.name ?? ''} — Final Results`,
      `📅 ${completedDate}  📍 ${tournament?.venue ?? ''}, ${tournament?.city ?? ''} ${tournament?.state ?? ''}`,
      '',
      ...sorted
        .filter(b => b.championName)
        .map(b => `${b.divisionName}: 🥇 ${b.championName}${b.runnerUpName ? `  🥈 ${b.runnerUpName}` : ''}`),
      '',
      'Powered by Pickleball App',
    ];
    try {
      await Share.share({ message: lines.join('\n') });
    } catch {
      Alert.alert('Unable to share', 'Please try again.');
    }
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* ── Header (Phase 1) ── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={L.navy} />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.title} numberOfLines={1}>{tournament?.name ?? ''}</Text>
          <Text style={s.sub} numberOfLines={1}>
            {completedDate}  ·  {tournament?.city ?? ''}, {tournament?.state ?? ''}
          </Text>
        </View>
        <StatusChip
          label={getTournamentStatusInfo(tournamentStatusKey).label}
          variant={getTournamentStatusInfo(tournamentStatusKey).variant}
        />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
      >

        {/* ── Phase 2 — Tournament summary ── */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Ionicons name="grid-outline" size={13} color={L.gold} />
            <Text style={s.sectionTitle}>TOURNAMENT SUMMARY</Text>
          </View>
          <View style={s.summaryRow}>
            <SummaryCard
              label="DIVISIONS"
              value={`${completedBrackets.length}/${divCount}`}
              success={completedBrackets.length === divCount && divCount > 0}
            />
            <SummaryCard
              label="TOTAL MATCHES"
              value={String(matchCounts.completed)}
            />
            <SummaryCard
              label="CHAMPIONS"
              value={String(championsCount)}
              accent={championsCount > 0}
            />
            <SummaryCard
              label="COMPLETE"
              value={`${matchCounts.completionPct}%`}
              success={matchCounts.completionPct === 100}
            />
          </View>
        </View>

        {/* ── Phase 3–6 — Division results cards ── */}
        {sorted.length > 0 ? (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="trophy-outline" size={13} color={L.gold} />
              <Text style={s.sectionTitle}>DIVISION RESULTS</Text>
            </View>
            {sorted.map(b => (
              <DivisionResultCard key={b.id} bracket={b} />
            ))}
          </View>
        ) : (
          <View style={s.section}>
            <View style={[s.emptyCard]}>
              <Ionicons name="git-branch-outline" size={32} color={L.textSub} />
              <Text style={s.emptyCardText}>No division results available</Text>
            </View>
          </View>
        )}

        {/* ── Phase 7 — Share button ── */}
        <View style={s.section}>
          <TouchableOpacity
            style={s.shareBtn}
            activeOpacity={0.85}
            onPress={handleShare}
          >
            <Ionicons name="share-social-outline" size={18} color={L.bg} />
            <Text style={s.shareBtnText}>Share Results</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: L.page },
  scroll: { padding: 16, gap: 4 },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: L.bg,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title:   { color: L.navy, fontSize: 19, fontWeight: '800' },
  sub:     { color: L.textSub, fontSize: 12, marginTop: 1 },

  section: { marginBottom: 20 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12,
  },
  sectionTitle: {
    color: L.navy, fontSize: 11, fontWeight: '800', letterSpacing: 0.8,
  },

  summaryRow: { flexDirection: 'row', gap: 8 },

  emptyCard: {
    backgroundColor: L.bg, borderWidth: 1, borderColor: L.border,
    borderRadius: radius.card, padding: 32,
    alignItems: 'center', gap: 10,
  },
  emptyCardText: { color: L.textSub, fontSize: 14, fontWeight: '600' },

  shareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: L.navy, borderRadius: 14,
    paddingVertical: 16,
  },
  shareBtnText: { color: L.bg, fontSize: 16, fontWeight: '800' },

  // Empty state
  emptyRoot: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: 12, paddingHorizontal: 36,
  },
  emptyIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: L.page, borderWidth: 1, borderColor: L.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyTitle: { color: L.navy, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  emptySub:   {
    color: L.textSub, fontSize: 14, textAlign: 'center', lineHeight: 22,
  },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: L.navy, borderRadius: 12,
    paddingHorizontal: 22, paddingVertical: 13, marginTop: 8,
  },
  emptyBtnText: { color: L.bg, fontSize: 14, fontWeight: '700' },
});
