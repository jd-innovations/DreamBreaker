import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { StatusChip } from '@/components';
import type { Tournament } from '@/lib/tournamentTypes';
import { fetchTournamentById } from '@/lib/supabase/tournaments';
import {
  fetchAllBrackets,
  getBracketMatchCounts,
  type DirectorBracket,
  type DirectorBracketMatch,
} from '@/lib/supabase/brackets';
import {
  getTournamentStatus,
  getTournamentStatusInfo,
  type TournamentStatusKey,
} from '@/lib/tournamentStatus';
import { useSession } from '@/hooks/useSession';

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Updated by the main screen component from useSession on each render
let _currentPlayerName = '';

function isCurrentPlayer(name: string | undefined): boolean {
  if (!name || !_currentPlayerName) return false;
  return name.trim().toLowerCase() === _currentPlayerName.trim().toLowerCase();
}

function matchStatusLabel(s: DirectorBracketMatch['status']): string {
  switch (s) {
    case 'pending':     return 'Pending';
    case 'scheduled':   return 'Scheduled';
    case 'in_progress': return 'Live';
    case 'completed':   return 'Completed';
    default:            return s;
  }
}

function matchStatusVariant(
  s: DirectorBracketMatch['status'],
): 'gray' | 'gold' | 'green' {
  switch (s) {
    case 'pending':     return 'gray';
    case 'scheduled':   return 'gold';
    case 'in_progress': return 'gold';
    case 'completed':   return 'green';
    default:            return 'gray';
  }
}

// ─── Participant row ──────────────────────────────────────────────────────────

function ParticipantRow({
  participant,
  isWinner,
  isLoser,
  isBye,
  seed,
  score,
}: {
  participant: DirectorBracketMatch['participant1'];
  isWinner: boolean;
  isLoser: boolean;
  isBye: boolean;
  seed?: number;
  score?: number;
}) {
  const isEmpty   = participant === null && !isBye;
  const isMe      = isCurrentPlayer(participant?.name);
  const nameColor = isLoser ? L.textSub : isWinner ? L.success : isEmpty ? L.textSub : L.navy;

  return (
    <View style={[
      pr.row,
      isWinner && pr.rowWinner,
      isMe      && pr.rowMe,
    ]}>
      {seed !== undefined && (
        <View style={pr.seed}>
          <Text style={pr.seedText}>{isBye ? '' : seed}</Text>
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={pr.nameRow}>
          <Text
            style={[pr.name, { color: nameColor, opacity: isLoser ? 0.5 : 1 }]}
            numberOfLines={1}
          >
            {isBye ? 'BYE' : isEmpty ? 'Awaiting...' : participant!.name}
          </Text>
          {isMe && !isBye && !isEmpty && (
            <View style={pr.youBadge}>
              <Text style={pr.youText}>YOU</Text>
            </View>
          )}
        </View>
        {participant?.partnerName && !isEmpty && !isBye && (
          <Text style={pr.partner} numberOfLines={1}>w/ {participant.partnerName}</Text>
        )}
      </View>
      {score !== undefined && (
        <Text style={[pr.score, {
          color: isWinner ? L.success : isLoser ? L.textSub : L.navy,
        }]}>
          {score}
        </Text>
      )}
      {isWinner && <Ionicons name="trophy" size={12} color={L.success} />}
    </View>
  );
}

const pr = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  rowWinner: {
    backgroundColor: L.successBg,
    borderColor: 'rgba(34,197,94,0.25)', borderWidth: 1, borderRadius: shape.badge,
  },
  rowMe: {
    borderColor: L.goldBorder, borderWidth: 1.5, borderRadius: shape.badge,
    backgroundColor: L.goldBg,
  },
  seed: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: L.page, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  seedText: { color: L.textSub, fontSize: text.microLabel.size, fontWeight: '700' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'nowrap' },
  name: { color: L.navy, fontSize: text.rowTitle.size, fontWeight: '700', flexShrink: 1 },
  partner: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', marginTop: 1 },
  youBadge: {
    backgroundColor: L.gold, borderRadius: shape.badge,
    paddingHorizontal: 5, paddingVertical: 1, flexShrink: 0,
  },
  youText: { color: L.bg, fontSize: 9, fontWeight: '900', letterSpacing: 0.4 },
  score: { fontSize: text.modalTitle.size, fontWeight: '900', minWidth: 24, textAlign: 'right' },
});

// ─── Match card (read-only) ───────────────────────────────────────────────────

function MatchCard({ match }: { match: DirectorBracketMatch }) {
  const isCompleted  = match.status === 'completed';
  const p1 = match.participant1;
  const p2 = match.participant2;
  const isDoubleBye  = p1 === null && p2 === null;
  const isBye1       = p1 !== null && p2 === null && isCompleted;
  const isBye2       = p2 !== null && p1 === null && isCompleted;
  const hasScores    = match.score1 !== undefined && match.score2 !== undefined;
  const isAwaiting   = !isCompleted && (p1 === null || p2 === null) && !isDoubleBye;
  const meInvolved   = isCurrentPlayer(p1?.name) || isCurrentPlayer(p2?.name);

  if (isDoubleBye) return null;

  return (
    <View style={[mc.card, meInvolved && mc.cardMe]}>
      {/* Header */}
      <View style={mc.header}>
        <Text style={mc.matchNum}>Match {match.matchNumber + 1}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {match.courtNumber !== undefined && (
            <View style={mc.courtBadge}>
              <Ionicons name="location-outline" size={10} color={L.gold} />
              <Text style={mc.courtText}>Court {match.courtNumber}</Text>
            </View>
          )}
          <StatusChip
            label={matchStatusLabel(match.status)}
            variant={matchStatusVariant(match.status)}
          />
        </View>
      </View>

      {/* Participants */}
      <View style={mc.participants}>
        <ParticipantRow
          participant={p1}
          isWinner={isCompleted && match.winnerId === p1?.id}
          isLoser={isCompleted && match.winnerId !== p1?.id && p1 !== null}
          isBye={isBye2}
          seed={p1?.seed}
          score={hasScores ? match.score1 : undefined}
        />
        <View style={mc.divider} />
        <ParticipantRow
          participant={p2}
          isWinner={isCompleted && match.winnerId === p2?.id}
          isLoser={isCompleted && match.winnerId !== p2?.id && p2 !== null}
          isBye={isBye1}
          seed={p2?.seed}
          score={hasScores ? match.score2 : undefined}
        />
      </View>

      {isAwaiting && (
        <View style={mc.awaiting}>
          <Ionicons name="time-outline" size={11} color={L.textSub} />
          <Text style={mc.awaitingText}>Awaiting previous round</Text>
        </View>
      )}

      {isCompleted && hasScores && (
        <View style={mc.scoreFooter}>
          <Text style={mc.scoreFooterText}>{match.score1} – {match.score2}</Text>
        </View>
      )}
    </View>
  );
}

const mc = StyleSheet.create({
  card: {
    width: 220, backgroundColor: L.bg,
    borderWidth: 1, borderColor: L.border,
    borderRadius: shape.card, overflow: 'hidden', marginBottom: 10,
  },
  cardMe: {
    borderColor: L.gold, borderWidth: 1.5,
    shadowColor: L.gold, shadowOpacity: 0.25,
    shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 4,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 10, paddingTop: 10, paddingBottom: 6,
  },
  matchNum: { color: L.textSub, fontSize: text.cardLabel.size, fontWeight: '800', letterSpacing: text.cardLabel.letterSpacing },
  courtBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: L.goldBg, borderRadius: shape.badge,
    paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: StyleSheet.hairlineWidth, borderColor: L.goldBorder,
  },
  courtText: { color: L.gold, fontSize: text.microLabel.size, fontWeight: '700' },
  participants: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: L.border },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: L.border, marginHorizontal: 10 },
  awaiting: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth, borderColor: L.border,
  },
  awaitingText: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', fontStyle: 'italic' },
  scoreFooter: {
    alignItems: 'center', paddingVertical: 7,
    borderTopWidth: StyleSheet.hairlineWidth, borderColor: L.border,
    backgroundColor: L.page,
  },
  scoreFooterText: { color: L.navy, fontSize: text.rowValue.size, fontWeight: '800', letterSpacing: 0.5 },
});

// ─── Division selector chip ───────────────────────────────────────────────────

function DivChip({
  label, active, onPress,
}: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[dc.chip, active && dc.chipActive]}
      activeOpacity={0.75}
      onPress={onPress}
    >
      <Text style={[dc.label, active && dc.labelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const dc = StyleSheet.create({
  chip: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: shape.pill, borderWidth: 1, borderColor: L.border,
    backgroundColor: L.bg,
  },
  chipActive: { backgroundColor: L.navy, borderColor: L.navy },
  label: { color: L.textSub, fontSize: text.controlLabel.size, fontWeight: '700' },
  labelActive: { color: L.bg },
});

// ─── Progress strip ───────────────────────────────────────────────────────────

function ProgressStrip({ counts }: { counts: { total: number; completed: number; remaining: number; completionPct: number } }) {
  return (
    <View style={ps.strip}>
      <View style={ps.item}>
        <Text style={[ps.num, { color: L.success }]}>{counts.completed}</Text>
        <Text style={ps.label}>PLAYED</Text>
      </View>
      <View style={ps.div} />
      <View style={ps.item}>
        <Text style={[ps.num, { color: counts.remaining > 0 ? L.gold : L.success }]}>
          {counts.remaining}
        </Text>
        <Text style={ps.label}>REMAINING</Text>
      </View>
      <View style={ps.div} />
      <View style={ps.item}>
        <Text style={[ps.num, { color: counts.completionPct === 100 ? L.success : L.navy }]}>
          {counts.completionPct}%
        </Text>
        <Text style={ps.label}>COMPLETE</Text>
      </View>
      <View style={ps.div} />
      <View style={ps.item}>
        <Text style={ps.num}>{counts.total}</Text>
        <Text style={ps.label}>TOTAL</Text>
      </View>
    </View>
  );
}

const ps = StyleSheet.create({
  strip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: L.bg,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
    gap: 10,
  },
  item: { flex: 1, alignItems: 'center', gap: 3 },
  div: { width: StyleSheet.hairlineWidth, height: 28, backgroundColor: L.border },
  num: { color: L.navy, fontSize: text.actionLarge.size, fontWeight: '800' },
  label: { color: L.textSub, fontSize: 9, fontWeight: '700', letterSpacing: 0.4 },
});

// ─── Champion banner ──────────────────────────────────────────────────────────

function ChampionBanner({ bracket }: { bracket: DirectorBracket }) {
  if (bracket.status !== 'completed' || !bracket.championName) return null;
  const iAmChamp   = isCurrentPlayer(bracket.championName);
  const iAmRunnerUp = isCurrentPlayer(bracket.runnerUpName ?? '');

  return (
    <View style={cb.banner}>
      <View style={cb.row}>
        <Ionicons name="trophy" size={18} color={L.gold} />
        <View style={{ flex: 1 }}>
          <Text style={cb.title}>Champion</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={cb.name}>{bracket.championName}</Text>
            {iAmChamp && <View style={cb.youBadge}><Text style={cb.youText}>YOU</Text></View>}
          </View>
        </View>
      </View>
      {bracket.runnerUpName && (
        <View style={cb.runnerRow}>
          <Ionicons name="medal-outline" size={16} color={L.textSub} />
          <Text style={cb.runnerLabel}>Runner-Up  </Text>
          <Text style={cb.runnerName}>{bracket.runnerUpName}</Text>
          {iAmRunnerUp && <View style={cb.youBadge}><Text style={cb.youText}>YOU</Text></View>}
        </View>
      )}
    </View>
  );
}

const cb = StyleSheet.create({
  banner: {
    backgroundColor: L.goldBg, borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: L.goldBorder, paddingHorizontal: 16, paddingVertical: 12, gap: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { color: L.gold, fontSize: text.microLabel.size, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  name: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800' },
  runnerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 2 },
  runnerLabel: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500' },
  runnerName: { color: L.navy, fontSize: text.rowTitle.size, fontWeight: '700' },
  youBadge: { backgroundColor: L.gold, borderRadius: shape.badge, paddingHorizontal: 5, paddingVertical: 1 },
  youText: { color: L.bg, fontSize: 9, fontWeight: '900', letterSpacing: 0.4 },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function PlayerBracketsScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();

  const [tournament, setTournament]         = useState<Tournament | null>(null);
  const [brackets, setBrackets]             = useState<DirectorBracket[]>([]);
  const [matchCounts, setMatchCounts]       = useState({ total: 0, completed: 0, remaining: 0, completionPct: 0 });
  const [activeDivId, setActiveDivId]       = useState<string | null>(null);
  const [roundFilter, setRoundFilter]       = useState<string>('All');
  const [tournamentStatusKey, setTournamentStatusKey] = useState<TournamentStatusKey>('open');
  const [loading, setLoading]               = useState(true);

  const refresh = useCallback(async () => {
    const t = await fetchTournamentById(id);
    const divNameMap: Record<string, string> = {};
    const [bkts, counts] = await Promise.all([
      fetchAllBrackets(id, divNameMap),
      getBracketMatchCounts(id),
    ]);
    setTournament(t);
    setBrackets(bkts);
    setMatchCounts(counts);
    setActiveDivId(prev => {
      if (prev && bkts.find(b => b.divisionId === prev)) return prev;
      return bkts.length > 0 ? bkts[0].divisionId : null;
    });
    if (t) setTournamentStatusKey(getTournamentStatus(t));
    setLoading(false);
  }, [id]);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setRoundFilter('All');
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

  const tStatusInfo = getTournamentStatusInfo(tournamentStatusKey);
  const tournamentName = tournament?.name ?? '';
  const tournamentDate = tournament?.date ?? '';
  const tournamentCity = tournament?.city ?? '';
  const tournamentState = tournament?.state ?? '';

  const activeBracket = activeDivId
    ? brackets.find(b => b.divisionId === activeDivId) ?? null
    : null;

  const roundTabs = activeBracket
    ? ['All', ...activeBracket.rounds.map(r => r.roundName)]
    : [];

  const visibleRounds = !activeBracket
    ? []
    : roundFilter === 'All'
      ? activeBracket.rounds
      : activeBracket.rounds.filter(r => r.roundName === roundFilter);

  // ── No brackets generated ────────────────────────────────────────────────

  if (brackets.length === 0) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={24} color={L.navy} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Brackets</Text>
            <Text style={s.sub} numberOfLines={1}>{tournamentName}</Text>
          </View>
          <StatusChip label={tStatusInfo.label} variant={tStatusInfo.variant} />
        </View>
        <View style={s.emptyRoot}>
          <View style={s.emptyIconWrap}>
            <Ionicons name="git-branch-outline" size={52} color={L.textSub} />
          </View>
          <Text style={s.emptyTitle}>No brackets yet</Text>
          <Text style={s.emptySub}>
            Brackets will appear here once the tournament director generates them.
            Check back after registration closes.
          </Text>
          <TouchableOpacity
            style={s.emptyBtn}
            activeOpacity={0.8}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={16} color={L.bg} />
            <Text style={s.emptyBtnText}>Back to Tournament</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Main view ────────────────────────────────────────────────────────────

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={L.navy} />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.title}>Brackets</Text>
          <Text style={s.sub} numberOfLines={1}>
            {tournamentName}  ·  {tournamentDate}  ·  {tournamentCity}, {tournamentState}
          </Text>
        </View>
        <StatusChip label={tStatusInfo.label} variant={tStatusInfo.variant} />
      </View>

      {/* ── Tournament progress strip (Phase 5) ── */}
      <ProgressStrip counts={matchCounts} />

      {/* ── Division selector chips (Phase 1) ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.chipScroll}
        contentContainerStyle={s.chipRow}
      >
        {brackets.map(b => (
          <DivChip
            key={b.divisionId}
            label={b.divisionName}
            active={activeDivId === b.divisionId}
            onPress={() => { setActiveDivId(b.divisionId); setRoundFilter('All'); }}
          />
        ))}
      </ScrollView>

      {/* ── Champion banner (Phase 6) ── */}
      {activeBracket && <ChampionBanner bracket={activeBracket} />}

      {/* ── Round filter tabs ── */}
      {activeBracket && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.tabScroll}
          contentContainerStyle={s.tabRow}
        >
          {roundTabs.map(tab => {
            const active = roundFilter === tab;
            return (
              <TouchableOpacity
                key={tab}
                style={[s.tab, active && s.tabActive]}
                activeOpacity={0.7}
                onPress={() => setRoundFilter(tab)}
              >
                <Text style={[s.tabLabel, active && s.tabLabelActive]}>{tab}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* ── Bracket canvas ── */}
      {activeBracket ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.bracketCanvas}
          >
            {visibleRounds.map(round => (
              <View key={round.id} style={s.roundCol}>
                <Text style={s.roundHeader}>{round.roundName}</Text>
                {round.matches.map(match => {
                  if (match.participant1 === null && match.participant2 === null) return null;
                  return <MatchCard key={match.id} match={match} />;
                })}
              </View>
            ))}
          </ScrollView>
        </ScrollView>
      ) : (
        <View style={s.emptyRoot}>
          <Text style={s.emptyTitle}>Select a division above</Text>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: L.bg,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800' },
  sub: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', marginTop: 1 },

  chipScroll: { maxHeight: 52, flexGrow: 0, backgroundColor: L.bg },
  chipRow: {
    flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },

  tabScroll: { maxHeight: 44, flexGrow: 0, backgroundColor: L.bg },
  tabRow: {
    paddingHorizontal: 16, paddingVertical: 8, gap: 8, flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  tab: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: shape.pill, borderWidth: 1, borderColor: L.border, backgroundColor: L.bg },
  tabActive: { backgroundColor: L.navy, borderColor: L.navy },
  tabLabel: { color: L.textSub, fontSize: text.controlLabel.size, fontWeight: '700' },
  tabLabelActive: { color: L.bg },

  bracketCanvas: { paddingHorizontal: 16, paddingTop: 16, flexDirection: 'row', gap: 16 },
  roundCol: { gap: 0 },
  roundHeader: {
    color: L.navy, fontSize: text.sectionLabel.size, fontWeight: '800', letterSpacing: text.sectionLabel.letterSpacing,
    textTransform: 'uppercase', marginBottom: 10, paddingHorizontal: 2,
  },

  emptyRoot: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: 12, paddingHorizontal: 36,
  },
  emptyIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: L.page, borderWidth: 1, borderColor: L.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyTitle: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800', textAlign: 'center' },
  emptySub: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', textAlign: 'center', lineHeight: 22 },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: L.navy, borderRadius: shape.cta,
    paddingHorizontal: 22, paddingVertical: 13, marginTop: 8,
  },
  emptyBtnText: { color: L.bg, fontSize: text.action.size, fontWeight: '800' },
});
