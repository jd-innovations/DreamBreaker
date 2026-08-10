import React, { useCallback, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors, radius } from '@/theme';
import { StatusChip } from '@/components';
import { useSession } from '@/hooks/useSession';
import { requireAuth } from '@/lib/authGuard';
import type { Tournament } from '@/lib/tournamentTypes';
import { fetchTournamentById } from '@/lib/supabase/tournaments';
import { fetchDivisionsForTournament, type DivisionData } from '@/lib/supabase/divisions';
import { fetchTournamentRegistrations } from '@/lib/supabase/registrations';
import type { TournamentRegistration } from '@/lib/registrationStore';
import {
  createBracket,
  fetchAllBrackets,
  hasBracket,
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function bracketStatusVariant(
  b: DirectorBracket | null,
): 'gray' | 'gold' | 'green' {
  if (!b) return 'gray';
  if (b.status === 'completed')   return 'green';
  if (b.status === 'in_progress') return 'gold';
  return 'gold';
}

function bracketStatusLabel(b: DirectorBracket | null): string {
  if (!b) return 'Not Generated';
  if (b.status === 'completed')   return 'Completed';
  if (b.status === 'in_progress') return 'In Progress';
  return 'Ready';
}

// ─── Division bracket card ────────────────────────────────────────────────────

function DivisionBracketCard({
  division,
  bracket,
  registrations,
  onGenerate,
  onView,
}: {
  division: DivisionData;
  bracket: DirectorBracket | null;
  registrations: TournamentRegistration[];
  onGenerate: () => void;
  onView: () => void;
}) {
  const registeredCount = registrations.filter(
    r => r.status === 'registered' || r.status === 'checked_in',
  ).length;
  const checkedInCount  = registrations.filter(r => r.status === 'checked_in').length;
  const waitlistedCount = registrations.filter(r => r.status === 'waitlisted').length;
  const eligibleCount   = registeredCount;

  const canGenerate = eligibleCount >= 4;

  return (
    <View style={dbc.card}>
      {/* Header */}
      <View style={dbc.header}>
        <View style={{ flex: 1 }}>
          <Text style={dbc.name}>{division.name}</Text>
          <View style={dbc.levelRow}>
            <View style={[dbc.levelBadge, division.levelNavy && dbc.levelBadgeNavy]}>
              <Text style={[dbc.levelText, division.levelNavy && dbc.levelTextNavy]}>
                {division.level}
              </Text>
            </View>
          </View>
        </View>
        <StatusChip
          label={bracketStatusLabel(bracket)}
          variant={bracket ? bracketStatusVariant(bracket) : 'gray'}
        />
      </View>

      {/* Stats row */}
      <View style={dbc.stats}>
        <View style={dbc.stat}>
          <Text style={[dbc.statNum, { color: L.gold }]}>{registeredCount}</Text>
          <Text style={dbc.statLabel}>REGISTERED</Text>
        </View>
        <View style={dbc.statDiv} />
        <View style={dbc.stat}>
          <Text style={[dbc.statNum, { color: L.success }]}>{checkedInCount}</Text>
          <Text style={dbc.statLabel}>CHECKED IN</Text>
        </View>
        <View style={dbc.statDiv} />
        <View style={dbc.stat}>
          <Text style={dbc.statNum}>{waitlistedCount}</Text>
          <Text style={dbc.statLabel}>WAITLISTED</Text>
        </View>
        <View style={dbc.statDiv} />
        <View style={dbc.stat}>
          <Text style={[dbc.statNum, { color: L.navy }]}>
            {bracket ? bracket.bracketSize : '—'}
          </Text>
          <Text style={dbc.statLabel}>BRACKET SIZE</Text>
        </View>
      </View>

      {!canGenerate && (
        <View style={dbc.warningRow}>
          <Ionicons name="alert-circle-outline" size={13} color={L.gold} />
          <Text style={dbc.warningText}>Need at least 4 registered or checked-in players</Text>
        </View>
      )}

      {/* Actions */}
      <View style={dbc.actions}>
        {bracket ? (
          <>
            <TouchableOpacity style={dbc.viewBtn} activeOpacity={0.8} onPress={onView}>
              <Ionicons name="git-branch-outline" size={15} color={L.bg} />
              <Text style={dbc.viewBtnText}>View Bracket</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={dbc.regenBtn}
              activeOpacity={0.8}
              onPress={onGenerate}
            >
              <Ionicons name="refresh-outline" size={15} color={L.navy} />
              <Text style={dbc.regenBtnText}>Regenerate</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={[dbc.generateBtn, !canGenerate && dbc.btnDisabled]}
            activeOpacity={canGenerate ? 0.8 : 1}
            onPress={canGenerate ? onGenerate : undefined}
          >
            <Ionicons
              name="git-branch-outline"
              size={15}
              color={canGenerate ? L.bg : L.textSub}
            />
            <Text style={[dbc.generateBtnText, !canGenerate && dbc.btnTextDisabled]}>
              Generate Bracket
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const dbc = StyleSheet.create({
  card: {
    backgroundColor: L.bg, borderWidth: 1, borderColor: L.border,
    borderRadius: radius.card, padding: 16, marginBottom: 12,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  name:   { color: L.navy, fontSize: 16, fontWeight: '800', marginBottom: 6 },
  levelRow: { flexDirection: 'row' },
  levelBadge: {
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2,
    borderWidth: 1, borderColor: L.border, backgroundColor: L.page,
  },
  levelBadgeNavy: { backgroundColor: L.navy, borderColor: L.navy },
  levelText:      { color: L.textSub, fontSize: 11, fontWeight: '800' },
  levelTextNavy:  { color: L.bg },

  stats:   { flexDirection: 'row', marginBottom: 12 },
  stat:    { flex: 1, alignItems: 'center', gap: 3 },
  statDiv: { width: StyleSheet.hairlineWidth, backgroundColor: L.border },
  statNum: { color: L.navy, fontSize: 16, fontWeight: '900' },
  statLabel: { color: L.textSub, fontSize: 9, fontWeight: '700', letterSpacing: 0.4 },

  warningRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: L.goldBg, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 7, marginBottom: 12,
    borderWidth: 1, borderColor: L.goldBorder,
  },
  warningText: { color: L.gold, fontSize: 12, fontWeight: '600', flex: 1 },

  actions: { flexDirection: 'row', gap: 8 },

  generateBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: L.navy, borderRadius: 10, paddingVertical: 12,
  },
  generateBtnText: { color: L.bg, fontSize: 14, fontWeight: '700' },

  viewBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: L.navy, borderRadius: 10, paddingVertical: 12,
  },
  viewBtnText: { color: L.bg, fontSize: 14, fontWeight: '700' },

  regenBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    borderWidth: 1, borderColor: L.border, borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 16,
  },
  regenBtnText: { color: L.navy, fontSize: 14, fontWeight: '700' },

  btnDisabled:     { backgroundColor: L.page, borderWidth: 1, borderColor: L.border },
  btnTextDisabled: { color: L.textSub },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function BracketsScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, loading: authLoading } = useSession();

  useEffect(() => {
    if (!authLoading && !user) router.replace('/sign-in' as never);
  }, [user, authLoading]);

  const [tournament, setTournament]     = useState<Tournament | null>(null);
  const [divisions, setDivisions]       = useState<DivisionData[]>([]);
  const [brackets, setBrackets]         = useState<DirectorBracket[]>([]);
  const [registrations, setRegistrations] = useState<TournamentRegistration[]>([]);
  const [loading, setLoading]           = useState(true);

  const refresh = useCallback(async () => {
    const [t, divs, regs] = await Promise.all([
      fetchTournamentById(id),
      fetchDivisionsForTournament(id),
      fetchTournamentRegistrations(id),
    ]);
    const divNameMap: Record<string, string> = {};
    for (const d of divs ?? []) divNameMap[d.id] = d.name;
    const bkts = await fetchAllBrackets(id, divNameMap);
    setTournament(t);
    setDivisions(divs ?? []);
    setBrackets(bkts);
    setRegistrations(regs);
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

  function handleGenerate(divisionId: string) {
    requireAuth(user?.id, () => {
      const existing = brackets.find(b => b.divisionId === divisionId);
      const division = divisions.find(d => d.id === divisionId);
      const divRegs  = registrations.filter(r => r.divisionId === divisionId);

      if (existing) {
        Alert.alert(
          'Regenerate Bracket',
          'This will delete the current bracket and create a new one. All court assignments and match results will be lost.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Regenerate',
              style: 'destructive',
              onPress: () => {
                createBracket(tournament!.id, divisionId, division?.name ?? '', divRegs)
                  .then(() => refresh());
              },
            },
          ],
        );
      } else {
        createBracket(tournament!.id, divisionId, division?.name ?? '', divRegs)
          .then(() => refresh());
      }
    });
  }

  function handleView(divisionId: string) {
    router.push(
      `/tournament/${tournament!.id}/division-bracket?divisionId=${divisionId}` as never,
    );
  }

  // Derived summary values
  const generatedCount = divisions.filter(d => hasBracket !== undefined && brackets.some(b => b.divisionId === d.id)).length;
  const readyCount = divisions.filter(d => {
    const eligible = registrations.filter(
      r => r.divisionId === d.id && (r.status === 'registered' || r.status === 'checked_in'),
    ).length;
    return eligible >= 4;
  }).length;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={L.navy} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Brackets</Text>
          <Text style={s.sub}>Tournament Operations</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
      >
        {/* ── Summary card ── */}
        <View style={s.summaryCard}>
          <Text style={s.summaryTournament} numberOfLines={1}>{tournament.name}</Text>
          <View style={s.summaryRow}>
            <View style={s.summaryItem}>
              <Text style={s.summaryNum}>{divisions.length}</Text>
              <Text style={s.summaryLabel}>DIVISIONS</Text>
            </View>
            <View style={s.summaryDiv} />
            <View style={s.summaryItem}>
              <Text style={[s.summaryNum, { color: generatedCount === divisions.length && divisions.length > 0 ? L.success : L.navy }]}>
                {generatedCount}
              </Text>
              <Text style={s.summaryLabel}>GENERATED</Text>
            </View>
            <View style={s.summaryDiv} />
            <View style={s.summaryItem}>
              <Text style={s.summaryNum}>{readyCount}</Text>
              <Text style={s.summaryLabel}>READY DIVS</Text>
            </View>
            <View style={s.summaryDiv} />
            <View style={s.summaryItem}>
              <Text style={[s.summaryNum, { color: L.gold }]}>
                {generatedCount === divisions.length && divisions.length > 0 ? '✓' : `${divisions.length - generatedCount}`}
              </Text>
              <Text style={s.summaryLabel}>
                {generatedCount === divisions.length && divisions.length > 0 ? 'ALL READY' : 'REMAINING'}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Division bracket cards ── */}
        {divisions.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="layers-outline" size={48} color={L.textSub} />
            <Text style={s.emptyTitle}>No divisions configured</Text>
            <Text style={s.emptySub}>Divisions will appear once configured for this tournament.</Text>
          </View>
        ) : (
          divisions.map(div => {
            const bracket = brackets.find(b => b.divisionId === div.id) ?? null;
            const divRegs = registrations.filter(r => r.divisionId === div.id);
            return (
              <DivisionBracketCard
                key={div.id}
                division={div}
                bracket={bracket}
                registrations={divRegs}
                onGenerate={() => handleGenerate(div.id)}
                onView={() => handleView(div.id)}
              />
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:  { flex: 1, backgroundColor: L.page },
  scroll:{ padding: 16, gap: 4 },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: L.bg,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title:   { color: L.navy, fontSize: 17, fontWeight: '800' },
  sub:     { color: L.textSub, fontSize: 12, fontWeight: '500', marginTop: 1 },

  summaryCard: {
    backgroundColor: L.bg, borderWidth: 1, borderColor: L.border,
    borderRadius: radius.card, padding: 16, marginBottom: 16,
  },
  summaryTournament: {
    color: L.navy, fontSize: 15, fontWeight: '800', marginBottom: 14,
  },
  summaryRow:  { flexDirection: 'row' },
  summaryItem: { flex: 1, alignItems: 'center', gap: 4 },
  summaryDiv:  { width: StyleSheet.hairlineWidth, backgroundColor: L.border },
  summaryNum:  { color: L.navy, fontSize: 20, fontWeight: '900' },
  summaryLabel:{ color: L.textSub, fontSize: 9, fontWeight: '700', letterSpacing: 0.4 },

  empty: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 64, gap: 10,
  },
  emptyTitle: { color: L.navy, fontSize: 16, fontWeight: '700' },
  emptySub:   { color: L.textSub, fontSize: 13, textAlign: 'center', paddingHorizontal: 24 },
});
