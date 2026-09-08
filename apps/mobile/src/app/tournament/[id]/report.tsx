import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { StatusChip } from '@/components';
import { statusLabel, statusVariant } from '@/lib/directorRegistrationAdapter';
import { DirectorOnly } from '@/components/DirectorOnly';
import {
  fetchTournamentReport,
  exportRosterCsv,
  type TournamentReport,
} from '@/lib/tournamentReport';

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

// ─── Metric card ──────────────────────────────────────────────────────────────

function MetricCard({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  const bgColor = warn ? L.dangerBg : L.bg;
  const bdColor = warn ? 'rgba(239,68,68,0.30)' : L.border;
  const valColor = warn ? L.danger : L.navy;
  return (
    <View style={[mc.card, { backgroundColor: bgColor, borderColor: bdColor }]}>
      <Text style={[mc.value, { color: valColor }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={mc.label}>{label}</Text>
    </View>
  );
}

const mc = StyleSheet.create({
  card: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderRadius: shape.card,
    paddingVertical: 12, paddingHorizontal: 4, gap: 3, minHeight: 70,
  },
  value: { fontSize: text.statValueSm.size, fontWeight: '900' },
  label: { color: L.textSub, fontSize: 9, fontWeight: '700', letterSpacing: 0.5, textAlign: 'center' },
});

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
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  text: { color: L.navy, fontSize: text.cardLabel.size, fontWeight: '800', letterSpacing: text.cardLabel.letterSpacing, textTransform: 'uppercase' },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

function TournamentReportScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [report, setReport]     = useState<TournamentReport | null>(null);
  const [loading, setLoading]   = useState(true);
  const [exporting, setExporting] = useState(false);

  const refresh = useCallback(async () => {
    const r = await fetchTournamentReport(id);
    setReport(r);
    setLoading(false);
  }, [id]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  async function handleExport() {
    if (!report || report.roster.length === 0) {
      Alert.alert('Nothing to Export', 'This tournament has no registrations yet.');
      return;
    }
    setExporting(true);
    try {
      await exportRosterCsv(report.tournament.name, report.roster);
    } catch (e) {
      Alert.alert('Export Failed', e instanceof Error ? e.message : 'Could not export the roster.');
    } finally {
      setExporting(false);
    }
  }

  if (loading || !report) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.page, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.gold} />
      </View>
    );
  }

  const { tournament, metrics, divisions, roster } = report;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={L.navy} />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.headerTitle} numberOfLines={1}>{tournament.name}</Text>
          <Text style={s.headerSub}>Tournament Report</Text>
        </View>
        <TouchableOpacity
          style={[s.exportBtn, exporting && { opacity: 0.6 }]}
          activeOpacity={0.8}
          onPress={handleExport}
          disabled={exporting}
        >
          {exporting
            ? <ActivityIndicator size="small" color={L.bg} />
            : <Ionicons name="share-outline" size={16} color={L.bg} />}
          <Text style={s.exportBtnText}>Export</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
      >
        {/* ── Summary ── */}
        <View style={s.section}>
          <SectionHeader title="Summary" icon="grid-outline" />
          <View style={s.metricRow}>
            <MetricCard label="REGISTERED" value={String(metrics.total)} />
            <MetricCard label="CHECKED IN" value={String(metrics.checkedIn)} />
            <MetricCard label="WAITLISTED" value={String(metrics.waitlisted)} />
          </View>
          <View style={[s.metricRow, { marginTop: 8 }]}>
            <MetricCard label="ENTRY FEES RECORDED" value={fmt(metrics.revenueCents)} />
            <MetricCard label="OUTSTANDING" value={fmt(metrics.outstandingCents)} warn={metrics.outstandingCents > 0} />
            <MetricCard label="NO SHOWS" value={String(metrics.noShow)} />
          </View>
          <Text style={s.disclaimer}>
            &ldquo;Entry fees recorded&rdquo; reflects amounts entered at registration, not funds actually captured &mdash; real payment processing isn&apos;t live yet.
          </Text>
        </View>

        {/* ── Divisions ── */}
        {divisions.length > 0 && (
          <View style={s.section}>
            <SectionHeader title="Divisions" icon="layers-outline" />
            {divisions.map(d => (
              <View key={d.divisionId} style={s.divRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.divName} numberOfLines={1}>{d.divisionName}</Text>
                  <Text style={s.divSub}>{d.level}</Text>
                </View>
                <Text style={s.divCount}>{d.registeredCount}/{d.capacity}</Text>
                <Text style={s.divLabel}>reg</Text>
                <Text style={[s.divCount, { marginLeft: 12 }]}>{d.checkedInCount}</Text>
                <Text style={s.divLabel}>in</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Roster ── */}
        <View style={s.section}>
          <SectionHeader title={`Roster (${roster.length})`} icon="people-outline" />
          {roster.length === 0 ? (
            <Text style={s.emptyText}>No registrations yet.</Text>
          ) : (
            roster.map(r => (
              <View key={r.id} style={s.rosterRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.rosterName} numberOfLines={1}>{r.playerName}</Text>
                  <Text style={s.rosterSub} numberOfLines={1}>
                    {r.divisionName}{r.partnerName ? `  ·  w/ ${r.partnerName}` : ''}
                  </Text>
                </View>
                <Text style={s.rosterAmount}>{fmt(r.amountPaid)}</Text>
                <StatusChip label={statusLabel(r.status)} variant={statusVariant(r.status)} />
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: L.bg,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800' },
  headerSub: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500' },
  exportBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: L.navy, borderRadius: shape.cta,
    paddingHorizontal: 14, paddingVertical: 9,
  },
  exportBtnText: { color: L.bg, fontSize: text.action.size, fontWeight: '800' },

  scroll: { paddingHorizontal: 16, paddingTop: 16 },
  section: { marginBottom: 20 },

  metricRow: { flexDirection: 'row', gap: 8 },
  disclaimer: { color: L.textSub, fontSize: 10, lineHeight: 14, marginTop: 8 },

  divRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: L.bg, borderWidth: 1, borderColor: L.border,
    borderRadius: shape.card, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8,
  },
  divName: { color: L.navy, fontSize: text.rowTitle.size, fontWeight: '700' },
  divSub: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500' },
  divCount: { color: L.navy, fontSize: text.rowValue.size, fontWeight: '800' },
  divLabel: { color: L.textSub, fontSize: 10, marginLeft: 3, marginRight: 2 },

  rosterRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: L.bg, borderWidth: 1, borderColor: L.border,
    borderRadius: shape.card, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8,
  },
  rosterName: { color: L.navy, fontSize: text.rowTitle.size, fontWeight: '700' },
  rosterSub: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500' },
  rosterAmount: { color: L.navy, fontSize: text.rowValue.size, fontWeight: '800' },

  emptyText: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', textAlign: 'center', paddingVertical: 20 },
});

// Director-only route. The screen body above is mounted only after
// DirectorOnly confirms the signed-in user directs this tournament, so its
// effects and fetches never run for anyone else.
export default function TournamentReportScreenRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <DirectorOnly tournamentId={id}>
      <TournamentReportScreen />
    </DirectorOnly>
  );
}
