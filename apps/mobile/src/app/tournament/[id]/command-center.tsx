import React, { useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors, radius } from '@/theme';
import { StatusChip } from '@/components';
import { type DivisionMetrics } from '@/lib/directorRegistrationAdapter';
import type { TournamentRegistration } from '@/lib/registrationStore';
import { fetchTournamentById, submitTournamentForApproval } from '@/lib/supabase/tournaments';
import { fetchDivisionsForTournament } from '@/lib/supabase/divisions';
import { fetchTournamentRegistrations } from '@/lib/supabase/registrations';
import type { Tournament } from '@/lib/tournamentTypes';
import type { DivisionData } from '@/data/divisions';
import {
  hasBracket,
  getAllBrackets,
  getBracketMatchCounts,
} from '@/lib/directorBracketStore';
import { getTournamentStatus, getTournamentStatusInfo } from '@/lib/tournamentStatus';
import { exportRosterCsv } from '@/lib/tournamentReport';

// ─── Theme alias ──────────────────────────────────────────────────────────────

const L = {
  bg:        colors.bg,
  page:      colors.page,
  navy:      colors.navy,
  gold:      colors.gold,
  goldBg:    colors.goldBg,
  goldLight: colors.goldLight,
  goldBorder:colors.goldBorder,
  text:      colors.text,
  textSub:   colors.textSub,
  border:    colors.border,
  success:   colors.success,
  successBg: colors.successBg,
  danger:    colors.danger,
  dangerBg:  colors.dangerBg,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(cents: number) { return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`; }
function pct(n: number, d: number): number { return d > 0 ? Math.round((n / d) * 100) : 0; }

function comingSoon() {
  Alert.alert('Coming Soon', 'This feature is not available yet.');
}

// Tournament status helpers imported from central lib — see tournamentStatus.ts

// ─── Division readiness ───────────────────────────────────────────────────────

type DivReadiness = 'ready' | 'low' | 'attention';

function divReadiness(dm: DivisionMetrics): DivReadiness {
  const fillPct = dm.capacity > 0 ? dm.registeredCount / dm.capacity : 0;
  if (fillPct >= 0.75) return 'ready';
  if (fillPct >= 0.25) return 'low';
  return 'attention';
}

function divReadinessLabel(r: DivReadiness): string {
  switch (r) {
    case 'ready':     return 'Ready';
    case 'low':       return 'Low Registration';
    case 'attention': return 'Needs Attention';
  }
}

function divReadinessVariant(r: DivReadiness): 'green' | 'gold' | 'red' {
  switch (r) {
    case 'ready':     return 'green';
    case 'low':       return 'gold';
    case 'attention': return 'red';
  }
}

// ─── Shared section header ────────────────────────────────────────────────────

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

// ─── Metric card ──────────────────────────────────────────────────────────────

function MetricCard({
  label, value, sub, accent, warn,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  warn?: boolean;
}) {
  const bgColor = accent ? L.goldLight : warn ? L.dangerBg : L.bg;
  const bdColor = accent ? L.goldBorder : warn ? 'rgba(239,68,68,0.30)' : L.border;
  const valColor = accent ? L.gold : warn ? L.danger : L.navy;

  return (
    <View style={[mc.card, { backgroundColor: bgColor, borderColor: bdColor }]}>
      <Text style={[mc.value, { color: valColor }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={mc.label}>{label}</Text>
      {sub ? <Text style={mc.sub}>{sub}</Text> : null}
    </View>
  );
}

const mc = StyleSheet.create({
  card: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderRadius: radius.card,
    paddingVertical: 12, paddingHorizontal: 4, gap: 3, minHeight: 76,
  },
  value: { fontSize: 20, fontWeight: '900' },
  label: { color: L.textSub, fontSize: 9, fontWeight: '700', letterSpacing: 0.5, textAlign: 'center' },
  sub:   { color: L.textSub, fontSize: 10, textAlign: 'center', marginTop: 1 },
});

// ─── Checklist item ───────────────────────────────────────────────────────────

function ChecklistItem({ label, complete }: { label: string; complete: boolean }) {
  return (
    <View style={ci.row}>
      <View style={[ci.dot, complete ? ci.dotDone : ci.dotWarn]}>
        <Ionicons
          name={complete ? 'checkmark' : 'alert'}
          size={12}
          color={complete ? L.success : L.gold}
        />
      </View>
      <Text style={ci.label}>{label}</Text>
      <Text style={[ci.status, { color: complete ? L.success : L.gold }]}>
        {complete ? 'Complete' : 'Attention Required'}
      </Text>
    </View>
  );
}

const ci = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  dot: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  dotDone: { backgroundColor: L.successBg },
  dotWarn: { backgroundColor: L.goldLight },
  label:  { flex: 1, color: L.navy, fontSize: 13, fontWeight: '600' },
  status: { fontSize: 11, fontWeight: '700' },
});

// ─── Quick action button ──────────────────────────────────────────────────────

function QuickAction({
  icon, label, onPress, accent,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  accent?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[qa.btn, accent && qa.btnAccent]}
      activeOpacity={0.8}
      onPress={onPress}
    >
      <Ionicons name={icon} size={20} color={accent ? L.bg : L.navy} />
      <Text style={[qa.label, accent && qa.labelAccent]}>{label}</Text>
    </TouchableOpacity>
  );
}

const qa = StyleSheet.create({
  btn: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: L.bg, borderWidth: 1, borderColor: L.border,
    borderRadius: radius.card, paddingVertical: 16, minWidth: '28%',
  },
  btnAccent:  { backgroundColor: L.navy, borderColor: L.navy },
  label:      { color: L.navy, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  labelAccent:{ color: L.bg },
});

const draftBanner = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: L.goldLight, borderWidth: 1, borderColor: L.goldBorder,
    borderRadius: radius.card, padding: 14, marginBottom: 10,
  },
  title: { color: L.navy, fontSize: 13, fontWeight: '800', marginBottom: 2 },
  sub:   { color: L.textSub, fontSize: 12, lineHeight: 17 },
  btn: {
    backgroundColor: L.navy, borderRadius: radius.button,
    paddingVertical: 13, alignItems: 'center', justifyContent: 'center',
  },
  btnText: { color: L.bg, fontSize: 14, fontWeight: '800' },
  btnRow: { flexDirection: 'row', gap: 10 },
  editBtn: {
    flex: 1, borderWidth: 1.5, borderColor: L.border, borderRadius: radius.button,
    paddingVertical: 13, alignItems: 'center', justifyContent: 'center',
  },
  editBtnText: { color: L.navy, fontSize: 14, fontWeight: '800' },
  submitBtn: { flex: 1 },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function CommandCenterScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [tournament, setTournament] = React.useState<Tournament | null>(null);
  const [allDivisions, setAllDivisions] = React.useState<DivisionData[]>([]);
  const emptyMetrics = { total:0,registered:0,checkedIn:0,waitlisted:0,noShow:0,cancelled:0,revenueCents:0,outstandingCents:0 };
  const [metrics, setMetrics]           = React.useState(emptyMetrics);
  const [divMetrics, setDivMetrics]     = React.useState<DivisionMetrics[]>([]);
  const [cancelledCount, setCancelledCount] = React.useState(0);
  const [allBrackets, setAllBrackets]   = React.useState(() => getAllBrackets(id));
  const [matchCounts, setMatchCounts]   = React.useState(() => getBracketMatchCounts(id));
  const [loading, setLoading]           = React.useState(true);
  const [roster, setRoster]             = React.useState<TournamentRegistration[]>([]);
  const [exporting, setExporting]       = React.useState(false);
  const [submittingApproval, setSubmittingApproval] = React.useState(false);

  const refresh = useCallback(async () => {
    const [t, divs, regs] = await Promise.all([
      fetchTournamentById(id),
      fetchDivisionsForTournament(id),
      fetchTournamentRegistrations(id),
    ]);
    setTournament(t);
    setAllDivisions(divs);
    const active = regs.filter((r: TournamentRegistration) => r.status !== 'cancelled');
    setMetrics({
      total:            active.length,
      registered:       active.filter((r: TournamentRegistration) => r.status === 'registered').length,
      checkedIn:        active.filter((r: TournamentRegistration) => r.status === 'checked_in').length,
      waitlisted:       active.filter((r: TournamentRegistration) => r.status === 'waitlisted').length,
      noShow:           active.filter((r: TournamentRegistration) => r.status === 'no_show').length,
      cancelled:        regs.filter((r: TournamentRegistration) => r.status === 'cancelled').length,
      revenueCents:     active.reduce((s: number, r: TournamentRegistration) => s + r.amountPaid, 0),
      outstandingCents: active.filter((r: TournamentRegistration) => r.status !== 'no_show').reduce((s: number, r: TournamentRegistration) => s + r.balanceDue, 0),
    });
    setDivMetrics(divs.map(d => {
      const divRegs = active.filter((r: TournamentRegistration) => r.divisionId === d.id);
      const registeredCount = divRegs.filter((r: TournamentRegistration) => r.status === 'registered' || r.status === 'checked_in').length;
      return {
        divisionId: d.id, divisionName: d.name, level: d.level, capacity: d.capacity,
        registeredCount, checkedInCount: divRegs.filter((r: TournamentRegistration) => r.status === 'checked_in').length,
        waitlistedCount: divRegs.filter((r: TournamentRegistration) => r.status === 'waitlisted').length,
        noShowCount: divRegs.filter((r: TournamentRegistration) => r.status === 'no_show').length,
        openSpots: Math.max(0, d.capacity - registeredCount),
        revenueCollected: divRegs.reduce((s: number, r: TournamentRegistration) => s + r.amountPaid, 0),
        outstandingBalance: divRegs.filter((r: TournamentRegistration) => r.status !== 'no_show').reduce((s: number, r: TournamentRegistration) => s + r.balanceDue, 0),
      };
    }));
    setCancelledCount(regs.filter((r: TournamentRegistration) => r.status === 'cancelled').length);
    setAllBrackets(getAllBrackets(id));
    setMatchCounts(getBracketMatchCounts(id));
    setRoster(regs);
    setLoading(false);
  }, [id]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  async function handleExportRoster() {
    if (!tournament) return;
    if (roster.length === 0) {
      Alert.alert('Nothing to Export', 'This tournament has no registrations yet.');
      return;
    }
    setExporting(true);
    try {
      await exportRosterCsv(tournament.name, roster);
    } catch (e) {
      Alert.alert('Export Failed', e instanceof Error ? e.message : 'Could not export the roster.');
    } finally {
      setExporting(false);
    }
  }

  async function handleSubmitForApproval() {
    if (!tournament) return;

    setSubmittingApproval(true);
    const result = await submitTournamentForApproval(id);
    setSubmittingApproval(false);

    if (!result.ok) {
      Alert.alert('Submit Failed', result.error);
      return;
    }
    Alert.alert('Submitted', 'Your tournament was submitted for admin approval.');
    refresh();
  }

  if (loading || !tournament) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.page, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.gold} />
      </View>
    );
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const totalRegs        = metrics.total;
  const checkedInPct     = pct(metrics.checkedIn, totalRegs);
  const activeDivisions  = allDivisions.length;
  const avgPaidPct       = metrics.revenueCents + metrics.outstandingCents > 0
    ? pct(metrics.revenueCents, metrics.revenueCents + metrics.outstandingCents)
    : 0;
  const waitlistRevPotential = metrics.waitlisted * tournament.entryFeeCents;

  // Readiness checklist
  const divisionsBalanced = divMetrics.every(d => divReadiness(d) !== 'attention');
  const bracketReady      =
    allDivisions.length > 0 &&
    allDivisions.every(d => hasBracket(id, d.id));
  const resultsReady = allBrackets.length > 0 && allBrackets.every(b => b.status === 'completed');

  // Phase 11: extended status reflects tournament completion
  const tournamentStatusKey = getTournamentStatus(tournament);

  const checklist = [
    { label: 'Registrations Reviewed',  complete: totalRegs > 0 },
    { label: 'Divisions Balanced',       complete: divisionsBalanced },
    { label: 'Check-In Ready',           complete: totalRegs > 0 },
    { label: 'Bracket Ready',            complete: bracketReady },
    { label: 'Results Ready',            complete: resultsReady },
  ];

  // Phase 9: bracket metrics
  const completedDivs = allBrackets.filter(b => b.status === 'completed').length;
  const totalDivisions = allDivisions.length;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* ── SECTION 1 — HEADER ── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={L.navy} />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.headerTitle} numberOfLines={1}>{tournament.name}</Text>
          <Text style={s.headerSub}>{tournament.date}  •  {tournament.city}, {tournament.state}</Text>
        </View>
        <StatusChip
          label={getTournamentStatusInfo(tournamentStatusKey).label}
          variant={getTournamentStatusInfo(tournamentStatusKey).variant}
        />
      </View>

      {/* ── Header action row ── */}
      <View style={s.headerActions}>
        <TouchableOpacity
          style={s.headerAction}
          activeOpacity={0.8}
          onPress={() => router.push(`/tournament/${id}/check-in` as never)}
        >
          <Ionicons name="scan-outline" size={15} color={L.navy} />
          <Text style={s.headerActionText}>Check-In</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.headerAction}
          activeOpacity={0.8}
          onPress={() => router.push(`/tournament/${id}/workspace` as never)}
        >
          <Ionicons name="people-outline" size={15} color={L.navy} />
          <Text style={s.headerActionText}>Registrations</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.headerAction}
          activeOpacity={0.8}
          onPress={() => router.push(`/tournament/${id}/brackets` as never)}
        >
          <Ionicons name="git-branch-outline" size={15} color={L.navy} />
          <Text style={s.headerActionText}>Bracket</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
      >

        {/* ── SECTION 2 — OPERATIONS SUMMARY ── */}
        <View style={s.section}>
          <SectionHeader title="Operations Summary" icon="grid-outline" />

          <View style={s.metricRow}>
            <MetricCard label="REGISTERED"       value={String(totalRegs)}            accent />
            <MetricCard label="CHECKED IN"        value={String(metrics.checkedIn)}    />
            <MetricCard label="ACTIVE DIVISIONS"  value={String(activeDivisions)}      />
            <MetricCard label="REVENUE"           value={fmt(metrics.revenueCents)}    />
          </View>

          <View style={[s.metricRow, { marginTop: 8 }]}>
            <MetricCard
              label="OUTSTANDING"
              value={fmt(metrics.outstandingCents)}
              warn={metrics.outstandingCents > 0}
            />
            <MetricCard label="WAITLISTED"   value={String(metrics.waitlisted)} />
            <MetricCard label="NO SHOWS"     value={String(metrics.noShow)}     />
            <MetricCard
              label="COMPLETION"
              value={`${checkedInPct}%`}
              sub={`${metrics.checkedIn} / ${totalRegs}`}
            />
          </View>
        </View>

        {/* ── SECTION 2B — BRACKET METRICS ── */}
        {allBrackets.length > 0 && (
          <View style={s.section}>
            <SectionHeader title="Bracket Progress" icon="git-branch-outline" />

            <View style={s.metricRow}>
              <MetricCard label="COMPLETED DIVS"   value={`${completedDivs}/${totalDivisions}`} accent={completedDivs === totalDivisions && totalDivisions > 0} />
              <MetricCard label="MATCHES PLAYED"   value={String(matchCounts.completed)} />
              <MetricCard label="REMAINING"        value={String(matchCounts.remaining)} warn={matchCounts.remaining > 0} />
              <MetricCard
                label="TOURNAMENT %"
                value={`${matchCounts.completionPct}%`}
                accent={matchCounts.completionPct === 100}
              />
            </View>
          </View>
        )}

        {/* ── SECTION 3 — DIVISION STATUS BOARD ── */}
        <View style={s.section}>
          <View style={divs.sectionRow}>
            <View style={[sh.row, { marginBottom: 0 }]}>
              <Ionicons name="layers-outline" size={14} color={L.gold} />
              <Text style={sh.text}>Division Status Board</Text>
            </View>
            <TouchableOpacity
              style={divs.addBtn}
              onPress={() => router.push(`/tournament/${id}/divisions/create` as never)}
              activeOpacity={0.75}
            >
              <Ionicons name="add" size={14} color={L.navy} />
              <Text style={divs.addBtnText}>Add Division</Text>
            </TouchableOpacity>
          </View>

          {divMetrics.length === 0 ? (
            <TouchableOpacity
              style={divs.emptyState}
              onPress={() => router.push(`/tournament/${id}/divisions/create` as never)}
              activeOpacity={0.8}
            >
              <Ionicons name="layers-outline" size={28} color={L.textSub} />
              <Text style={divs.emptyTitle}>No divisions yet</Text>
              <Text style={divs.emptySub}>Tap to add the first division for this tournament.</Text>
              <View style={divs.emptyBtn}>
                <Text style={divs.emptyBtnText}>+ Add Division</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <View style={s.divBoard}>
              {divMetrics.map(dm => {
                const status  = divReadiness(dm);
                const fillPct = dm.capacity > 0 ? Math.min(dm.registeredCount / dm.capacity, 1) : 0;
                return (
                  <View key={dm.divisionId} style={dsb.row}>
                    {/* Name + level */}
                    <View style={dsb.nameCol}>
                      <Text style={dsb.name}>{dm.divisionName}</Text>
                      <View style={dsb.levelBadge}>
                        <Text style={dsb.levelText}>{dm.level}</Text>
                      </View>
                    </View>

                    {/* Counts */}
                    <View style={dsb.counts}>
                      <Text style={dsb.countItem}>
                        <Text style={dsb.countNum}>{dm.registeredCount}</Text>
                        <Text style={dsb.countLabel}> reg</Text>
                      </Text>
                      <Text style={dsb.countItem}>
                        <Text style={dsb.countNum}>{dm.openSpots}</Text>
                        <Text style={dsb.countLabel}> open</Text>
                      </Text>
                      <Text style={dsb.countItem}>
                        <Text style={dsb.countNum}>{dm.waitlistedCount}</Text>
                        <Text style={dsb.countLabel}> wait</Text>
                      </Text>
                      <Text style={dsb.countItem}>
                        <Text style={dsb.countNum}>{dm.checkedInCount}</Text>
                        <Text style={dsb.countLabel}> in</Text>
                      </Text>
                    </View>

                    {/* Progress + status */}
                    <View style={dsb.statusCol}>
                      <View style={dsb.barBg}>
                        <View style={[
                          dsb.barFill,
                          { width: `${Math.round(fillPct * 100)}%` as `${number}%` },
                          status === 'ready'     && dsb.barGreen,
                          status === 'low'       && dsb.barGold,
                          status === 'attention' && dsb.barRed,
                        ]} />
                      </View>
                      <StatusChip
                        label={divReadinessLabel(status)}
                        variant={divReadinessVariant(status)}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* ── SECTION 4 — CHECK-IN PROGRESS ── */}
        <View style={s.section}>
          <SectionHeader title="Check-In Progress" icon="scan-outline" />

          <TouchableOpacity
            style={ci4.card}
            activeOpacity={0.85}
            onPress={() => router.push(`/tournament/${id}/check-in` as never)}
          >
            <View style={ci4.top}>
              <Text style={ci4.fraction}>
                {metrics.checkedIn}
                <Text style={ci4.total}> / {totalRegs} Checked In</Text>
              </Text>
              <Text style={ci4.pct}>{checkedInPct}%</Text>
            </View>
            <View style={ci4.barBg}>
              <View style={[ci4.barFill, { width: `${checkedInPct}%` as `${number}%` }]} />
            </View>
            <View style={ci4.footer}>
              <Text style={ci4.footerText}>Tap to open Check-In screen</Text>
              <Ionicons name="chevron-forward" size={14} color={L.textSub} />
            </View>
          </TouchableOpacity>
        </View>

        {/* ── SECTION 5 — REGISTRATION HEALTH ── */}
        <View style={s.section}>
          <SectionHeader title="Registration Health" icon="people-outline" />

          <View style={s.card}>
            {[
              { label: 'Registered',  count: metrics.registered,  variant: 'gold'  as const },
              { label: 'Checked In',  count: metrics.checkedIn,   variant: 'green' as const },
              { label: 'Waitlisted',  count: metrics.waitlisted,  variant: 'gray'  as const },
              { label: 'No Show',     count: metrics.noShow,      variant: 'red'   as const },
              { label: 'Cancelled',   count: cancelledCount,      variant: 'gray'  as const },
            ].map((item, i, arr) => (
              <View
                key={item.label}
                style={[rh.row, i === arr.length - 1 && rh.rowLast]}
              >
                <StatusChip label={item.label} variant={item.variant} />
                <Text style={rh.count}>{item.count}</Text>
                <View style={rh.barBg}>
                  <View style={[
                    rh.barFill,
                    {
                      width: `${totalRegs > 0 ? Math.round((item.count / totalRegs) * 100) : 0}%` as `${number}%`,
                      backgroundColor:
                        item.variant === 'gold'  ? L.gold    :
                        item.variant === 'green' ? L.success :
                        item.variant === 'red'   ? L.danger  : L.border,
                    },
                  ]} />
                </View>
                <Text style={rh.pct}>
                  {totalRegs > 0 ? Math.round((item.count / totalRegs) * 100) : 0}%
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── SECTION 6 — FINANCIAL HEALTH ── */}
        <View style={s.section}>
          <SectionHeader title="Financial Health" icon="cash-outline" />

          <View style={s.metricRow}>
            <MetricCard label="COLLECTED"   value={fmt(metrics.revenueCents)}    accent />
            <MetricCard
              label="OUTSTANDING"
              value={fmt(metrics.outstandingCents)}
              warn={metrics.outstandingCents > 0}
            />
          </View>
          <View style={[s.metricRow, { marginTop: 8 }]}>
            <MetricCard label="AVG PAID"        value={`${avgPaidPct}%`}              sub="of total potential" />
            <MetricCard label="WAITLIST POTENTIAL" value={fmt(waitlistRevPotential)}  sub="if converted" />
          </View>
        </View>

        {/* ── SECTION 7 — TOURNAMENT READINESS ── */}
        <View style={s.section}>
          <SectionHeader title="Tournament Readiness" icon="checkmark-circle-outline" />

          <View style={s.card}>
            {checklist.map((item, i) => (
              <ChecklistItem key={i} label={item.label} complete={item.complete} />
            ))}
          </View>
        </View>

        {/* ── DRAFT BANNER — submit for approval ── */}
        {tournament.status === 'draft' && (
          <View style={s.section}>
            <View style={draftBanner.card}>
              <Ionicons name="cloud-upload-outline" size={20} color={L.gold} />
              <View style={{ flex: 1 }}>
                <Text style={draftBanner.title}>This tournament is a draft</Text>
                <Text style={draftBanner.sub}>
                  It&rsquo;s not visible to players yet. Submit it for admin review when you&rsquo;re ready to go live.
                </Text>
              </View>
            </View>
            <View style={draftBanner.btnRow}>
              <TouchableOpacity
                style={draftBanner.editBtn}
                activeOpacity={0.85}
                onPress={() => router.push(`/tournament/${id}/edit` as never)}
              >
                <Text style={draftBanner.editBtnText}>Edit Tournament</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[draftBanner.btn, draftBanner.submitBtn, submittingApproval && { opacity: 0.6 }]}
                activeOpacity={0.85}
                onPress={submittingApproval ? undefined : handleSubmitForApproval}
                disabled={submittingApproval}
              >
                <Text style={draftBanner.btnText}>
                  {submittingApproval ? 'Submitting…' : 'Submit for Approval'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── SECTION 8 — QUICK ACTIONS ── */}
        <View style={s.section}>
          <SectionHeader title="Quick Actions" icon="flash-outline" />

          <View style={s.actionGrid}>
            <QuickAction
              icon="people-outline"
              label="Registration Workspace"
              accent
              onPress={() => router.push(`/tournament/${id}/workspace` as never)}
            />
            <QuickAction
              icon="scan-outline"
              label="Check-In"
              accent
              onPress={() => router.push(`/tournament/${id}/check-in` as never)}
            />
          </View>

          <View style={[s.actionGrid, { marginTop: 8 }]}>
            <QuickAction
              icon="git-branch-outline"
              label="View Brackets"
              onPress={() => router.push(`/tournament/${id}/brackets` as never)}
            />
            <QuickAction icon="trophy-outline"     label="View Results"     onPress={() => router.push(`/tournament/${id}/results` as never)} />
            <QuickAction icon="document-text-outline" label="Tournament Report" onPress={() => router.push(`/tournament/${id}/report` as never)} />
            <QuickAction
              icon={exporting ? 'hourglass-outline' : 'download-outline'}
              label="Export Players"
              onPress={exporting ? () => {} : handleExportRoster}
            />
            <QuickAction icon="settings-outline"   label="Tournament Settings" onPress={comingSoon} />
          </View>
        </View>

      </ScrollView>
    </View>
  );
}

// ─── Division status board styles ─────────────────────────────────────────────

const dsb = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  nameCol: { width: 90, gap: 4 },
  name: { color: L.navy, fontSize: 12, fontWeight: '700', lineHeight: 16 },
  levelBadge: {
    alignSelf: 'flex-start', backgroundColor: L.navy,
    borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1,
  },
  levelText: { color: L.bg, fontSize: 10, fontWeight: '800' },

  counts: { flex: 1, flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  countItem: { fontSize: 11 },
  countNum:  { color: L.navy, fontWeight: '800' },
  countLabel:{ color: L.textSub },

  statusCol: { width: 88, alignItems: 'flex-end', gap: 5 },
  barBg:   { width: '100%', height: 4, backgroundColor: L.page, borderRadius: 2, overflow: 'hidden' },
  barFill: { height: 4, borderRadius: 2 },
  barGreen:{ backgroundColor: L.success },
  barGold: { backgroundColor: L.gold    },
  barRed:  { backgroundColor: L.danger  },
});

// ─── Division section header / empty state styles ────────────────────────────

const divs = StyleSheet.create({
  sectionRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  addBtn:       {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: radius.chip, borderWidth: 1, borderColor: L.border,
    backgroundColor: L.bg,
  },
  addBtnText:   { color: L.navy, fontSize: 12, fontWeight: '700' },

  emptyState:   {
    alignItems: 'center', gap: 6, paddingVertical: 28,
    backgroundColor: L.bg, borderRadius: radius.card,
    borderWidth: 1, borderColor: L.border,
  },
  emptyTitle:   { color: L.navy, fontSize: 15, fontWeight: '700' },
  emptySub:     { color: L.textSub, fontSize: 13, textAlign: 'center', paddingHorizontal: 24 },
  emptyBtn:     {
    marginTop: 4, backgroundColor: L.navy,
    borderRadius: radius.button, paddingHorizontal: 20, paddingVertical: 8,
  },
  emptyBtnText: { color: L.bg, fontSize: 13, fontWeight: '700' },
});

// ─── Check-in progress card styles ───────────────────────────────────────────

const ci4 = StyleSheet.create({
  card: {
    backgroundColor: L.bg, borderWidth: 1, borderColor: L.border,
    borderRadius: radius.card, padding: 16, gap: 10,
  },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  fraction: { color: L.navy, fontSize: 22, fontWeight: '900' },
  total:    { color: L.textSub, fontSize: 14, fontWeight: '500' },
  pct:      { color: L.gold, fontSize: 22, fontWeight: '900' },

  barBg:   { height: 8, backgroundColor: L.page, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, backgroundColor: L.success, borderRadius: 4 },

  footer:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  footerText: { color: L.textSub, fontSize: 12, fontWeight: '500' },
});

// ─── Registration health row styles ──────────────────────────────────────────

const rh = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  rowLast: { borderBottomWidth: 0 },
  count:  { color: L.navy, fontSize: 15, fontWeight: '800', width: 28, textAlign: 'right' },
  barBg:  { flex: 1, height: 6, backgroundColor: L.page, borderRadius: 3, overflow: 'hidden' },
  barFill:{ height: 6, borderRadius: 3 },
  pct:    { color: L.textSub, fontSize: 11, fontWeight: '600', width: 32, textAlign: 'right' },
});

// ─── Screen styles ────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: L.page },
  scroll: { padding: 16, gap: 4 },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: L.bg,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  headerTitle: { color: L.navy, fontSize: 16, fontWeight: '800' },
  headerSub:   { color: L.textSub, fontSize: 11, fontWeight: '500', marginTop: 1 },

  headerActions: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: L.bg,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  headerAction: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    borderWidth: 1, borderColor: L.border, borderRadius: 10,
    paddingVertical: 7,
  },
  headerActionText: { color: L.navy, fontSize: 12, fontWeight: '700' },

  section: { marginBottom: 20 },

  card: {
    backgroundColor: L.bg, borderWidth: 1, borderColor: L.border,
    borderRadius: radius.card, paddingHorizontal: 14,
  },

  divBoard: {
    backgroundColor: L.bg, borderWidth: 1, borderColor: L.border,
    borderRadius: radius.card, paddingHorizontal: 14,
  },

  metricRow: { flexDirection: 'row', gap: 8 },

  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  emptyInline: {
    backgroundColor: L.bg, borderWidth: 1, borderColor: L.border,
    borderRadius: radius.card, padding: 20, alignItems: 'center',
  },
  emptyInlineText: { color: L.textSub, fontSize: 13, fontWeight: '500' },
});
