import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors, radius } from '@/theme';
import { StatusChip } from '@/components';
import { type Tournament } from '@/lib/tournamentTypes';
import { getAllBrackets } from '@/lib/directorBracketStore';
import { type TournamentMetrics } from '@/lib/directorRegistrationAdapter';
import { useProfile } from '@/hooks/useProfile';
import { fetchDirectorTournaments } from '@/lib/supabase/tournaments';
import { fetchDivisionsForTournament } from '@/lib/supabase/divisions';
import { fetchTournamentRegistrations } from '@/lib/supabase/registrations';
import {
  getTournamentStatus,
  getTournamentStatusInfo,
} from '@/lib/tournamentStatus';
import { useSupportContext } from '@/lib/support/supportContext';

// ─── Theme alias ──────────────────────────────────────────────────────────────

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

function fmt(cents: number) {
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function readAuthAvatarUrl(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const record = metadata as Record<string, unknown>;
  const value = record.avatar_url ?? record.picture;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}

type TournamentGroup = 'active' | 'upcoming' | 'completed';

function getGroup(t: Tournament): TournamentGroup {
  const s = getTournamentStatus(t);
  if (s === 'completed') return 'completed';
  if (t.status === 'filling_fast' || t.status === 'full' || s === 'registration_closed') return 'active';
  return 'upcoming';
}

// ─── Summary card ─────────────────────────────────────────────────────────────

function SummaryCard({
  label, value, accent, warn,
}: {
  label: string; value: string | number; accent?: boolean; warn?: boolean;
}) {
  const bg  = accent ? L.goldLight : warn ? L.dangerBg  : L.bg;
  const bd  = accent ? L.goldBorder : warn ? 'rgba(239,68,68,0.25)' : L.border;
  const col = accent ? L.gold      : warn ? L.danger    : L.navy;
  return (
    <View style={[sc.card, { backgroundColor: bg, borderColor: bd }]}>
      <Text style={[sc.value, { color: col }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={sc.label}>{label}</Text>
    </View>
  );
}

const sc = StyleSheet.create({
  card: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderRadius: radius.card,
    paddingVertical: 12, paddingHorizontal: 4, gap: 3, minHeight: 70,
  },
  value: { fontSize: 22, fontWeight: '900' },
  label: { color: L.textSub, fontSize: 9, fontWeight: '700', letterSpacing: 0.5, textAlign: 'center' },
});

// ─── Quick action button ──────────────────────────────────────────────────────

function QuickAction({
  icon, label, onPress, accent, disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  accent?: boolean;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[qa.btn, accent && qa.btnAccent, disabled && qa.btnDisabled]}
      activeOpacity={disabled ? 1 : 0.8}
      onPress={disabled ? undefined : onPress}
    >
      <Ionicons
        name={icon}
        size={20}
        color={disabled ? L.textSub : accent ? L.bg : L.navy}
      />
      <Text
        style={[qa.label, accent && qa.labelAccent, disabled && qa.labelDisabled]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const qa = StyleSheet.create({
  btn: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: L.bg, borderWidth: 1, borderColor: L.border,
    borderRadius: radius.card, paddingVertical: 14, paddingHorizontal: 4,
    minWidth: 72, minHeight: 76,
  },
  btnAccent:   { backgroundColor: L.navy, borderColor: L.navy },
  btnDisabled: { opacity: 0.5 },
  label:       { color: L.navy, fontSize: 11, fontWeight: '700', textAlign: 'center' },
  labelAccent: { color: L.bg },
  labelDisabled: { color: L.textSub },
});

// ─── Tournament card ──────────────────────────────────────────────────────────

function TournamentCard({
  tournament: t,
  metrics,
  bracketCount,
  divCount,
}: {
  tournament: Tournament;
  metrics: TournamentMetrics;
  bracketCount: number;
  divCount: number;
}) {
  const statusKey  = getTournamentStatus(t);
  const statusInfo = getTournamentStatusInfo(statusKey);
  const fillPct    = pct(t.spotsFilled, t.drawSize);
  const spotsLeft  = t.drawSize - t.spotsFilled;
  const barColor   =
    fillPct >= 90 ? L.danger :
    fillPct >= 70 ? L.gold   : L.success;

  return (
    <View style={tc.card}>
      {/* ── Card header ── */}
      <View style={tc.cardHeader}>
        <View style={tc.logoBox}>
          <Ionicons name="trophy-outline" size={20} color={L.gold} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={tc.name} numberOfLines={1}>{t.name}</Text>
          <Text style={tc.sub}>
            {t.date}  ·  {t.city}, {t.state}
          </Text>
        </View>
        <StatusChip label={statusInfo.label} variant={statusInfo.variant} />
      </View>

      {/* ── Health row ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={tc.healthRow}
        contentContainerStyle={tc.healthRowContent}
      >
        <View style={tc.healthCell}>
          <Text style={tc.healthValue}>{divCount}</Text>
          <Text style={tc.healthLabel}>Divisions</Text>
        </View>
        <View style={tc.healthDivider} />
        <View style={tc.healthCell}>
          <Text style={tc.healthValue}>{t.spotsFilled}/{t.drawSize}</Text>
          <Text style={tc.healthLabel}>Registered</Text>
        </View>
        <View style={tc.healthDivider} />
        <View style={tc.healthCell}>
          <Text style={[tc.healthValue, metrics.waitlisted > 0 && { color: L.gold }]}>
            {metrics.waitlisted}
          </Text>
          <Text style={tc.healthLabel}>Waitlisted</Text>
        </View>
        <View style={tc.healthDivider} />
        <View style={tc.healthCell}>
          <Text style={[tc.healthValue, metrics.checkedIn > 0 && { color: L.success }]}>
            {metrics.checkedIn}
          </Text>
          <Text style={tc.healthLabel}>Checked In</Text>
        </View>
        <View style={tc.healthDivider} />
        <View style={tc.healthCell}>
          <Text style={tc.healthValue}>{bracketCount}</Text>
          <Text style={tc.healthLabel}>Brackets</Text>
        </View>
      </ScrollView>

      {/* ── Fill bar ── */}
      <View style={tc.fillSection}>
        <View style={tc.fillRow}>
          <View style={tc.fillTrack}>
            <View style={[tc.fillBar, { width: `${fillPct}%` as `${number}%`, backgroundColor: barColor }]} />
          </View>
          <Text style={tc.fillLabel}>
            {statusKey === 'registration_closed' ? 'FULL' : `${spotsLeft} left`}
          </Text>
        </View>
      </View>

      {/* ── Actions ── */}
      <View style={tc.actions}>
        <TouchableOpacity
          style={[tc.actionBtn, tc.actionBtnPrimary]}
          activeOpacity={0.8}
          onPress={() => router.push(`/tournament/${t.id}/command-center` as never)}
        >
          <Ionicons name="construct-outline" size={18} color={L.bg} />
          <Text style={[tc.actionLabel, tc.actionLabelPrimary]} numberOfLines={1}>MANAGE</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={tc.actionBtn}
          activeOpacity={0.8}
          onPress={() => router.push(`/tournament/${t.id}/workspace` as never)}
        >
          <Ionicons name="people-outline" size={18} color={L.navy} />
          <Text style={tc.actionLabel} numberOfLines={1}>REGISTRATIONS</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={tc.actionBtn}
          activeOpacity={0.8}
          onPress={() => router.push(`/tournament/${t.id}/brackets` as never)}
        >
          <Ionicons name="git-branch-outline" size={18} color={L.navy} />
          <Text style={tc.actionLabel} numberOfLines={1}>BRACKETS</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const tc = StyleSheet.create({
  card: {
    backgroundColor: L.bg, borderWidth: 1, borderColor: L.border,
    borderRadius: radius.card, marginBottom: 12, overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10,
  },
  logoBox: {
    width: 40, height: 40, borderRadius: 10, flexShrink: 0,
    backgroundColor: L.goldBg, alignItems: 'center', justifyContent: 'center',
  },
  name: { color: L.navy, fontSize: 17, fontWeight: '800', lineHeight: 22, marginBottom: 2 },
  sub:  { color: L.textSub, fontSize: 11 },

  healthRow: {
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: L.border,
  },
  healthRowContent: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 14, gap: 14,
  },
  healthCell: { alignItems: 'center', gap: 2, minWidth: 58 },
  healthDivider: { width: StyleSheet.hairlineWidth, height: 28, backgroundColor: L.border },
  healthValue: { color: L.navy, fontSize: 14, fontWeight: '800' },
  healthLabel: { color: L.textSub, fontSize: 9, fontWeight: '600', letterSpacing: 0.3 },

  fillSection: {
    paddingHorizontal: 14, paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: L.border,
    paddingTop: 10,
  },
  fillRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fillTrack: { flex: 1, height: 5, backgroundColor: L.page, borderRadius: 3, overflow: 'hidden' },
  fillBar:   { height: '100%', borderRadius: 3 },
  fillLabel: { color: L.textSub, fontSize: 10, fontWeight: '700', minWidth: 40, textAlign: 'right' },

  actions: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 14, paddingBottom: 14,
  },
  actionBtn: {
    flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: L.page, borderWidth: 1, borderColor: L.border,
    borderRadius: radius.button, paddingVertical: 12, minHeight: 64,
  },
  actionBtnPrimary: { backgroundColor: L.navy, borderColor: L.navy },
  actionLabel:        { color: L.navy,    fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  actionLabelPrimary: { color: L.bg },
});

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <View style={sh.row}>
      <Text style={sh.title}>{title}</Text>
      <View style={sh.badge}>
        <Text style={sh.badgeText}>{count}</Text>
      </View>
    </View>
  );
}

const sh = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  title:     { color: L.navy, fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  badge:     { backgroundColor: L.goldBg, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { color: L.gold, fontSize: 11, fontWeight: '800' },
});

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <View style={es.root}>
      <View style={es.iconWrap}>
        <Ionicons name="trophy-outline" size={44} color={L.textSub} />
      </View>
      <Text style={es.title}>No tournaments yet</Text>
      <Text style={es.sub}>
        Once you create a tournament it will appear here with full management tools.
      </Text>
      <TouchableOpacity
        style={es.cta}
        activeOpacity={0.8}
        onPress={() => router.push('/director/create-tournament' as never)}
      >
        <Text style={es.ctaText}>Create Your First Tournament</Text>
        <Ionicons name="arrow-forward" size={14} color={L.bg} />
      </TouchableOpacity>
    </View>
  );
}

const es = StyleSheet.create({
  root:    { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32, gap: 12 },
  iconWrap:{
    width: 80, height: 80, borderRadius: 40, backgroundColor: L.page,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  title:   { color: L.navy, fontSize: 20, fontWeight: '900', textAlign: 'center' },
  sub:     { color: L.textSub, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  cta: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: L.navy, borderRadius: radius.button,
    paddingHorizontal: 20, paddingVertical: 12, marginTop: 8,
  },
  ctaText: { color: L.bg, fontSize: 13, fontWeight: '800' },
});

// ─── Not-a-director / pending states ──────────────────────────────────────────

const notDirector = StyleSheet.create({
  root: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32, gap: 12,
  },
  title:   { color: L.navy, fontSize: 18, fontWeight: '900', textAlign: 'center', marginTop: 4 },
  sub:     { color: L.textSub, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  cta: {
    backgroundColor: L.navy, borderRadius: radius.button,
    paddingHorizontal: 20, paddingVertical: 12, marginTop: 8,
  },
  ctaText: { color: L.bg, fontSize: 13, fontWeight: '800' },
});

// ─── Snapshot type (avoids re-computing on every render) ─────────────────────

type TournamentSnapshot = {
  tournament: Tournament;
  metrics: TournamentMetrics;
  bracketCount: number;
  divCount: number;
  group: TournamentGroup;
};

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function DirectorDashboard() {
  const insets = useSafeAreaInsets();
  const { user, profile, loading: authLoading } = useProfile();
  const avatarUrl = profile?.avatar_url ?? readAuthAvatarUrl(user?.user_metadata) ?? null;

  const [snapshots, setSnapshots] = useState<TournamentSnapshot[]>([]);
  const [loading, setLoading]     = useState(true);

  useSupportContext({
    feature: 'director',
    visibility: 'minimized',
    metadata: { is_director: true },
  });

  useEffect(() => {
    if (!authLoading && !user) router.replace('/sign-in' as never);
  }, [user, authLoading]);

  const loadSnapshots = useCallback(async () => {
    if (!user?.id) return;
    const tournaments = await fetchDirectorTournaments(user.id);
    const snaps = await Promise.all(
      tournaments.map(async t => {
        const [divs, regs] = await Promise.all([
          fetchDivisionsForTournament(t.id),
          fetchTournamentRegistrations(t.id),
        ]);
        const active = regs.filter(r => r.status !== 'cancelled');
        const metrics: TournamentMetrics = {
          total:            active.length,
          registered:       active.filter(r => r.status === 'registered').length,
          checkedIn:        active.filter(r => r.status === 'checked_in').length,
          waitlisted:       active.filter(r => r.status === 'waitlisted').length,
          noShow:           active.filter(r => r.status === 'no_show').length,
          cancelled:        regs.filter(r => r.status === 'cancelled').length,
          revenueCents:     active.reduce((s, r) => s + r.amountPaid, 0),
          outstandingCents: active.filter(r => r.status !== 'no_show').reduce((s, r) => s + r.balanceDue, 0),
        };
        return { tournament: t, metrics, bracketCount: getAllBrackets(t.id).length, divCount: divs.length, group: getGroup(t) };
      }),
    );
    setSnapshots(snaps);
    setLoading(false);
  }, [user?.id]);

  useFocusEffect(useCallback(() => { loadSnapshots(); }, [loadSnapshots]));

  // ── Derived summary values ────────────────────────────────────────────────

  const active    = snapshots.filter(s => s.group === 'active');
  const upcoming  = snapshots.filter(s => s.group === 'upcoming');
  const completed = snapshots.filter(s => s.group === 'completed');
  const totalRegs = snapshots.reduce((sum, s) => sum + s.metrics.total, 0);

  // Fall back to spotsFilled when store is empty (mock seed data)
  const totalFilled = snapshots.reduce((sum, s) =>
    sum + Math.max(s.metrics.total, s.tournament.spotsFilled), 0,
  );

  if (loading || authLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.page, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.gold} />
      </View>
    );
  }

  // Not a director at all — shouldn't normally be reachable (profile.tsx only
  // links here for directors), but guard direct/deep-linked navigation.
  if (!profile?.is_director) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.page }}>
        <StatusBar style="dark" />
        <View style={notDirector.root}>
          <Ionicons name="shield-outline" size={44} color={L.textSub} />
          <Text style={notDirector.title}>Director Access Required</Text>
          <Text style={notDirector.sub}>You need to apply to be a tournament director to access this page.</Text>
          <TouchableOpacity
            style={notDirector.cta}
            activeOpacity={0.8}
            onPress={() => router.replace('/apply-director' as never)}
          >
            <Text style={notDirector.ctaText}>Apply to Be a Director</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // is_director but not yet approved (or suspended) — no dashboard access
  // yet; tournaments: director insert RLS requires director_status='approved'.
  if (profile.director_status !== 'approved') {
    const suspended = profile.director_status === 'suspended';
    return (
      <View style={{ flex: 1, backgroundColor: colors.page }}>
        <StatusBar style="dark" />
        <View style={notDirector.root}>
          <Ionicons
            name={suspended ? 'alert-circle-outline' : 'time-outline'}
            size={44}
            color={suspended ? colors.danger : L.gold}
          />
          <Text style={notDirector.title}>
            {suspended ? 'Director Access Suspended' : 'Application Pending Review'}
          </Text>
          <Text style={notDirector.sub}>
            {suspended
              ? 'Your director access was suspended. Contact support to be reinstated.'
              : 'Your director application is being reviewed. We’ll notify you once it’s approved.'}
          </Text>
        </View>
      </View>
    );
  }

  const isEmpty = snapshots.length === 0;

  function goCreate() {
    router.push('/director/create-tournament' as never);
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={L.navy} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Director Hub</Text>
        </View>
        <View style={s.directorPill}>
          <Ionicons name="sync-circle-outline" size={12} color={L.gold} />
          <Text style={s.directorPillText}>DIRECTOR</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
      >

        {/* ── Director identity ── */}
        <View style={s.identityCard}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => router.push('/profile' as never)}
          >
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={s.avatarImg} />
            ) : (
              <View style={s.avatar}>
                <Text style={s.avatarText}>{initials(profile?.full_name ?? '')}</Text>
              </View>
            )}
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.directorName}>{(profile?.full_name ?? 'Director').toUpperCase()}</Text>
            <Text style={s.directorSub}>
              Tournament Director  ·  {snapshots.length} tournament{snapshots.length !== 1 ? 's' : ''}
            </Text>
          </View>
          {/* Reaching this point already guarantees director_status === 'approved' — see the gate above */}
          <View style={s.verifiedBadge}>
            <Ionicons name="shield-checkmark" size={14} color="#3B82F6" />
            <Text style={s.verifiedText}>Verified</Text>
          </View>
        </View>

        {/* ── Summary cards ── */}
        <View style={s.summaryRow}>
          <SummaryCard label="ACTIVE"    value={active.length}    accent />
          <SummaryCard label="UPCOMING"  value={upcoming.length}  />
          <SummaryCard label="COMPLETED" value={completed.length} />
          <SummaryCard label="TOTAL REGS" value={totalFilled}     />
        </View>

        {/* ── Quick actions ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>QUICK ACTIONS</Text>
          <View style={s.actionsRow}>
            <QuickAction
              icon="add-circle-outline"
              label="Create"
              onPress={goCreate}
              accent
            />
            <QuickAction
              icon="people-outline"
              label="Registrations"
              onPress={() => {
                const first = snapshots[0];
                if (first) router.push(`/tournament/${first.tournament.id}/workspace` as never);
              }}
            />
            <QuickAction
              icon="git-branch-outline"
              label="Brackets"
              onPress={() => {
                const first = snapshots[0];
                if (first) router.push(`/tournament/${first.tournament.id}/brackets` as never);
              }}
            />
            <QuickAction
              icon="trophy-outline"
              label="Results"
              onPress={() => {
                const done = completed[0];
                if (done) router.push(`/tournament/${done.tournament.id}/results` as never);
                else Alert.alert('No Results Yet', 'Complete a tournament to view results.');
              }}
            />
          </View>
        </View>

        {/* ── Active tournaments ── */}
        {active.length > 0 && (
          <View style={s.section}>
            <SectionHeader title="IN PROGRESS" count={active.length} />
            {active.map(({ tournament: t, metrics, bracketCount, divCount }) => (
              <TournamentCard
                key={t.id}
                tournament={t}
                metrics={metrics}
                bracketCount={bracketCount}
                divCount={divCount}
              />
            ))}
          </View>
        )}

        {/* ── Upcoming tournaments ── */}
        {upcoming.length > 0 && (
          <View style={s.section}>
            <SectionHeader title="UPCOMING" count={upcoming.length} />
            {upcoming.map(({ tournament: t, metrics, bracketCount, divCount }) => (
              <TournamentCard
                key={t.id}
                tournament={t}
                metrics={metrics}
                bracketCount={bracketCount}
                divCount={divCount}
              />
            ))}
          </View>
        )}

        {/* ── Completed tournaments ── */}
        {completed.length > 0 && (
          <View style={s.section}>
            <SectionHeader title="COMPLETED" count={completed.length} />
            {completed.map(({ tournament: t, metrics, bracketCount, divCount }) => (
              <TournamentCard
                key={t.id}
                tournament={t}
                metrics={metrics}
                bracketCount={bracketCount}
                divCount={divCount}
              />
            ))}
          </View>
        )}

        {/* ── Empty state ── */}
        {isEmpty && <EmptyState />}

      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: L.page },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: L.bg,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  backBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: L.navy, fontSize: 17, fontWeight: '800' },
  directorPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: L.goldBg, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4,
    borderWidth: 1, borderColor: L.goldBorder,
  },
  directorPillText: { color: L.gold, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

  scroll: { paddingHorizontal: 16, paddingTop: 16 },

  identityCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: L.bg, borderWidth: 1, borderColor: L.border,
    borderRadius: radius.card, padding: 14, marginBottom: 16,
  },
  avatar: {
    width: 48, height: 48, borderRadius: 24, flexShrink: 0,
    backgroundColor: L.navy, alignItems: 'center', justifyContent: 'center',
  },
  avatarImg:     { width: 48, height: 48, borderRadius: 24, flexShrink: 0 },
  avatarText:    { color: L.bg, fontSize: 16, fontWeight: '800' },
  directorName:  { color: L.navy, fontSize: 15, fontWeight: '800', marginBottom: 2, letterSpacing: 0.3 },
  directorSub:   { color: L.textSub, fontSize: 12 },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  verifiedText:  { color: '#3B82F6', fontSize: 11, fontWeight: '700' },

  summaryRow: {
    flexDirection: 'row', gap: 8, marginBottom: 20,
  },

  section:      { marginBottom: 20 },
  sectionTitle: {
    color: L.navy, fontSize: 11, fontWeight: '900',
    letterSpacing: 0.8, marginBottom: 10,
  },
  actionsRow: { flexDirection: 'row', gap: 8 },
});
