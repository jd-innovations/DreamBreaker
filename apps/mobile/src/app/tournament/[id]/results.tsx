import React, { useCallback, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors, radius } from '@/theme';
import { StatusChip, PickleballIcon } from '@/components';
import { useSession } from '@/hooks/useSession';
import { requireAuth } from '@/lib/authGuard';
import type { Tournament } from '@/lib/tournamentTypes';
import { fetchTournamentById } from '@/lib/supabase/tournaments';
import { fetchDivisionsForTournament } from '@/lib/supabase/divisions';
import {
  fetchAllBrackets,
  getBracketMatchCounts,
  publishAllBrackets,
  type DirectorBracket,
} from '@/lib/supabase/brackets';

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
  dangerBg:   colors.dangerBg,
};

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title, icon }: { title: string; icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={sh.row}>
      <Ionicons name={icon} size={14} color={L.gold} />
      <Text style={sh.text}>{title}</Text>
    </View>
  );
}

const sh = StyleSheet.create({
  row:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  text: { color: L.navy, fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
});

// ─── Division result card ─────────────────────────────────────────────────────

function DivisionResultCard({ bracket }: { bracket: DirectorBracket }) {
  const isComplete = bracket.status === 'completed';
  const isPublished = bracket.publishedAt != null;

  const allMatches = bracket.rounds.flatMap(r => r.matches).filter(
    m => m.participant1 !== null || m.participant2 !== null,
  );
  const completedMatches = allMatches.filter(m => m.status === 'completed').length;

  return (
    <View style={dc.card}>
      {/* Division header */}
      <View style={dc.header}>
        <Text style={dc.divName}>{bracket.divisionName}</Text>
        <StatusChip
          label={isComplete ? 'Complete' : 'In Progress'}
          variant={isComplete ? 'green' : 'gold'}
        />
      </View>

      {/* Matches stat */}
      <View style={dc.statRow}>
        <PickleballIcon size={13} color={L.textSub} />
        <Text style={dc.statText}>
          {completedMatches} of {allMatches.length} matches played
        </Text>
      </View>

      {isComplete ? (
        <>
          {/* Champion */}
          <View style={dc.podiumRow}>
            <View style={[dc.podiumBadge, dc.podiumGold]}>
              <Ionicons name="trophy" size={14} color={L.gold} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={dc.podiumTitle}>Champion</Text>
              <Text style={dc.podiumName}>{bracket.championName ?? '—'}</Text>
            </View>
            {isPublished && (
              <View style={dc.publishedBadge}>
                <Ionicons name="checkmark-circle" size={12} color={L.success} />
                <Text style={dc.publishedText}>Published</Text>
              </View>
            )}
          </View>

          {/* Runner-up */}
          <View style={dc.podiumRow}>
            <View style={[dc.podiumBadge, dc.podiumSilver]}>
              <Ionicons name="medal-outline" size={14} color={L.textSub} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={dc.podiumTitle}>Runner-Up</Text>
              <Text style={dc.podiumName}>{bracket.runnerUpName ?? '—'}</Text>
            </View>
          </View>
        </>
      ) : (
        <View style={dc.pendingRow}>
          <Ionicons name="time-outline" size={13} color={L.gold} />
          <Text style={dc.pendingText}>Division still in progress</Text>
        </View>
      )}
    </View>
  );
}

const dc = StyleSheet.create({
  card: {
    backgroundColor: L.bg, borderWidth: 1, borderColor: L.border,
    borderRadius: radius.card, overflow: 'hidden', marginBottom: 10,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  divName: { color: L.navy, fontSize: 14, fontWeight: '800' },

  statRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  statText: { color: L.textSub, fontSize: 12 },

  podiumRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  podiumBadge: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  podiumGold:   { backgroundColor: L.goldBg, borderWidth: 1, borderColor: L.goldBorder },
  podiumSilver: { backgroundColor: L.page,   borderWidth: 1, borderColor: L.border },

  podiumTitle: { color: L.textSub, fontSize: 10, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 2 },
  podiumName:  { color: L.navy,    fontSize: 14, fontWeight: '800' },

  publishedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  publishedText:  { color: L.success, fontSize: 11, fontWeight: '700' },

  pendingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: L.goldBg,
  },
  pendingText: { color: L.gold, fontSize: 12, fontWeight: '600' },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ResultsScreen() {
  const insets = useSafeAreaInsets();
  const { user, loading: authLoading } = useSession();

  useEffect(() => {
    if (!authLoading && !user) router.replace('/sign-in' as never);
  }, [user, authLoading]);
  const { id } = useLocalSearchParams<{ id: string }>();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [brackets, setBrackets]     = useState<DirectorBracket[]>([]);
  const [divCount, setDivCount]     = useState(0);
  const [matchCounts, setMatchCounts] = useState({ total: 0, completed: 0, remaining: 0, completionPct: 0 });
  const [loading, setLoading]       = useState(true);

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
    setLoading(false);
  }, [id]);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    refresh().then(() => { if (!active) return; }).catch(() => setLoading(false));
    return () => { active = false; };
  }, [refresh]));

  if (loading || !tournament) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.page }}>
        <ActivityIndicator color={colors.gold} size="large" />
      </View>
    );
  }

  const completedDivs = brackets.filter(b => b.status === 'completed').length;
  const totalDivs     = divCount;
  const allComplete   = completedDivs > 0 && completedDivs === totalDivs;
  const allPublished  = brackets.length > 0 && brackets.every(b => b.publishedAt != null);

  const completedDate = (() => {
    const dates = brackets
      .map(b => b.completedAt)
      .filter(Boolean) as string[];
    if (dates.length === 0) return null;
    const latest = dates.sort().at(-1)!;
    return new Date(latest).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  })();

  function handlePublish() {
    if (!allComplete) {
      Alert.alert('Not Ready', 'All division brackets must be completed before publishing results.');
      return;
    }
    requireAuth(user?.id, () => Alert.alert(
      'Publish Results',
      'This will publish all division champions and results. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Publish',
          onPress: () => {
            publishAllBrackets(tournament!.id)
              .then(() => refresh())
              .then(() => Alert.alert('Results Published!', 'Tournament results are now published.'));
          },
        },
      ],
    ));
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={L.navy} />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.title} numberOfLines={1}>Tournament Results</Text>
          <Text style={s.sub} numberOfLines={1}>{tournament.name}</Text>
        </View>
        {completedDate && (
          <View style={s.dateBadge}>
            <Ionicons name="calendar-outline" size={12} color={L.textSub} />
            <Text style={s.dateText}>{completedDate}</Text>
          </View>
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
      >

        {/* ── Section A: Tournament summary ── */}
        <View style={s.section}>
          <SectionHeader title="Tournament Summary" icon="grid-outline" />

          <View style={s.summaryGrid}>
            <View style={s.summaryCard}>
              <Text style={s.summaryVal}>{totalDivs}</Text>
              <Text style={s.summaryLabel}>DIVISIONS</Text>
            </View>
            <View style={s.summaryCard}>
              <Text style={[s.summaryVal, completedDivs === totalDivs && { color: L.success }]}>
                {completedDivs}
              </Text>
              <Text style={s.summaryLabel}>COMPLETED</Text>
            </View>
            <View style={s.summaryCard}>
              <Text style={[s.summaryVal, { color: L.success }]}>{matchCounts.completed}</Text>
              <Text style={s.summaryLabel}>MATCHES PLAYED</Text>
            </View>
            <View style={s.summaryCard}>
              <Text style={[s.summaryVal, { color: matchCounts.completionPct === 100 ? L.success : L.gold }]}>
                {matchCounts.completionPct}%
              </Text>
              <Text style={s.summaryLabel}>COMPLETION</Text>
            </View>
          </View>
        </View>

        {/* ── Section B: Division results ── */}
        <View style={s.section}>
          <SectionHeader title="Division Results" icon="trophy-outline" />

          {brackets.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="git-branch-outline" size={40} color={L.textSub} />
              <Text style={s.emptyTitle}>No brackets generated</Text>
              <Text style={s.emptySub}>Go to Brackets and generate brackets for each division.</Text>
              <TouchableOpacity
                style={s.emptyBtn}
                activeOpacity={0.8}
                onPress={() => router.push(`/tournament/${tournament.id}/brackets` as never)}
              >
                <Text style={s.emptyBtnText}>View Brackets</Text>
              </TouchableOpacity>
            </View>
          ) : (
            brackets.map(b => <DivisionResultCard key={b.id} bracket={b} />)
          )}
        </View>

        {/* ── Section C: Publish ── */}
        {brackets.length > 0 && (
          <View style={s.section}>
            <SectionHeader title="Publish Results" icon="share-outline" />

            <View style={s.publishCard}>
              {allPublished ? (
                <View style={s.publishedRow}>
                  <Ionicons name="checkmark-circle" size={24} color={L.success} />
                  <Text style={s.publishedMsg}>Results have been published.</Text>
                </View>
              ) : (
                <>
                  <Text style={s.publishDesc}>
                    {allComplete
                      ? 'All brackets are complete. Publish results to make champions visible to players.'
                      : `${completedDivs} of ${totalDivs} divisions complete. Complete all brackets before publishing.`}
                  </Text>
                  <TouchableOpacity
                    style={[s.publishBtn, !allComplete && s.publishBtnDisabled]}
                    activeOpacity={allComplete ? 0.85 : 1}
                    onPress={handlePublish}
                  >
                    <Ionicons name="share-outline" size={18} color={allComplete ? L.bg : L.textSub} />
                    <Text style={[s.publishBtnText, !allComplete && s.publishBtnTextDisabled]}>
                      Publish Results
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        )}

        {/* ── Return to command center ── */}
        <TouchableOpacity
          style={s.ccBtn}
          activeOpacity={0.8}
          onPress={() => router.push(`/tournament/${tournament.id}/command-center` as never)}
        >
          <Ionicons name="grid-outline" size={16} color={L.navy} />
          <Text style={s.ccBtnText}>Return to Command Center</Text>
        </TouchableOpacity>

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
  title:   { color: L.navy, fontSize: 17, fontWeight: '800' },
  sub:     { color: L.textSub, fontSize: 12, marginTop: 1 },
  dateBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dateText:  { color: L.textSub, fontSize: 11 },

  section: { marginBottom: 20 },

  summaryGrid: { flexDirection: 'row', gap: 8 },
  summaryCard: {
    flex: 1, backgroundColor: L.bg, borderWidth: 1, borderColor: L.border,
    borderRadius: radius.card, alignItems: 'center', paddingVertical: 14, gap: 4,
  },
  summaryVal:   { color: L.navy, fontSize: 22, fontWeight: '900' },
  summaryLabel: { color: L.textSub, fontSize: 9, fontWeight: '700', letterSpacing: 0.4 },

  empty: {
    backgroundColor: L.bg, borderWidth: 1, borderColor: L.border,
    borderRadius: radius.card, padding: 32,
    alignItems: 'center', gap: 8,
  },
  emptyTitle: { color: L.navy, fontSize: 15, fontWeight: '800' },
  emptySub:   { color: L.textSub, fontSize: 13, textAlign: 'center' },
  emptyBtn: {
    backgroundColor: L.navy, borderRadius: 10,
    paddingHorizontal: 20, paddingVertical: 11, marginTop: 4,
  },
  emptyBtnText: { color: L.bg, fontSize: 13, fontWeight: '700' },

  publishCard: {
    backgroundColor: L.bg, borderWidth: 1, borderColor: L.border,
    borderRadius: radius.card, padding: 16, gap: 14,
  },
  publishDesc: { color: L.textSub, fontSize: 13, lineHeight: 18 },
  publishBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: L.navy, borderRadius: 12, paddingVertical: 15,
  },
  publishBtnDisabled:     { backgroundColor: L.page, borderWidth: 1, borderColor: L.border },
  publishBtnText:         { color: L.bg, fontSize: 16, fontWeight: '800' },
  publishBtnTextDisabled: { color: L.textSub },

  publishedRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  publishedMsg: { color: L.success, fontSize: 14, fontWeight: '700' },

  ccBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: L.border, borderRadius: 12,
    paddingVertical: 14, backgroundColor: L.bg,
  },
  ccBtnText: { color: L.navy, fontSize: 14, fontWeight: '700' },
});
