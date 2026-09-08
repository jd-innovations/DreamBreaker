import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Alert, Animated, Easing, Share, ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { IS_INTERNAL_BUILD } from '@/lib/featureFlags';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { getRoundRobin } from '@/lib/roundRobinStore';
import { getSchedule, type RRRound } from '@/lib/rrScheduleStore';
import { computeStandings, fmtDiff, type RRStanding } from '@/lib/rrStandings';
import {
  fetchRoundRobinMatches, sbMatchesToRRRounds,
} from '@/lib/supabase/roundRobin';
import { fetchPlayEventById, completePlayEvent } from '@/lib/supabase/playEvents';

// ─── Theme ───────────────────────────────────────────────────────────────────

const L = {
  navy:       colors.navy,
  gold:       colors.gold,
  goldBg:     colors.goldBg,
  goldLight:  colors.goldLight,
  goldBorder: colors.goldBorder,
  text:       colors.text,
  textSub:    colors.textSub,
  bg:         colors.bg,
  page:       colors.page,
  border:     colors.border,
  white:      colors.white,
  success:    colors.success,
  successBg:  colors.successBg,
  danger:     colors.danger,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function comingSoon(feature: string) {
  Alert.alert(feature, 'Coming soon — this feature is on the way.', [{ text: 'Got It' }]);
}

// Row background for rank medals
function rankBg(rank: number): string {
  if (rank === 1) return colors.goldLight;
  if (rank === 2) return '#F1F5F9';   // silver tint
  if (rank === 3) return '#FFF8EE';   // bronze tint
  return colors.bg;
}
function rankBorder(rank: number): string {
  if (rank === 1) return colors.goldBorder;
  if (rank === 2) return '#CBD5E1';
  if (rank === 3) return '#E2C97B';
  return 'transparent';
}
function rankNumColor(rank: number): string {
  if (rank === 1) return colors.gold;
  if (rank === 2) return '#64748B';
  if (rank === 3) return '#92713A';
  return colors.textSub;
}

// ─── Standing Row ─────────────────────────────────────────────────────────────

function StandingRow({ s }: { s: RRStanding }) {
  const bg     = rankBg(s.rank);
  const border = rankBorder(s.rank);
  const numCol = rankNumColor(s.rank);
  const diff   = fmtDiff(s.pointDifferential);

  return (
    <View style={[tr.row, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[tr.rankCell, { color: numCol }]}>#{s.rank}</Text>
      <View style={tr.playerCell}>
        <View style={[tr.avatar, s.rank === 1 && tr.avatarLeader]}>
          <Text style={tr.avatarText}>{s.avatarInitials}</Text>
        </View>
        <View style={tr.playerInfo}>
          <Text style={tr.playerName} numberOfLines={1}>{s.playerName}</Text>
          {s.dupr ? <Text style={tr.playerDupr}>{s.dupr} DUPR</Text> : null}
        </View>
      </View>
      <Text style={tr.statCell}>{s.wins}</Text>
      <Text style={tr.statCell}>{s.losses}</Text>
      <Text style={tr.statCell}>{s.pointsFor}</Text>
      <Text style={tr.statCell}>{s.pointsAgainst}</Text>
      <Text style={[tr.diffCell, s.pointDifferential >= 0 ? tr.diffPos : tr.diffNeg]}>
        {diff}
      </Text>
    </View>
  );
}

const RANK_COL  = 36;
const PLAYER_COL = 130;
const STAT_COL  = 32;
const DIFF_COL  = 44;

const tr = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 10,
    borderRadius: shape.cta,
    borderWidth: 1,
    marginBottom: 4,
  },
  rankCell: {
    width: RANK_COL,
    fontSize: text.chipValue.size, fontWeight: '800', textAlign: 'center',
  },
  playerCell: {
    width: PLAYER_COL,
    flexDirection: 'row', alignItems: 'center', gap: 7,
  },
  avatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: L.goldBg, borderWidth: 1.5, borderColor: L.goldBorder,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarLeader: { borderColor: L.gold },
  avatarText: { fontSize: 9, fontWeight: '900', color: L.navy },
  playerInfo: { flex: 1 },
  playerName: { fontSize: text.chipValue.size, fontWeight: '800', color: L.navy },
  playerDupr: { fontSize: 10, color: L.textSub },
  statCell: {
    width: STAT_COL,
    fontSize: text.controlLabel.size, fontWeight: '700', color: L.navy, textAlign: 'center',
  },
  diffCell: {
    width: DIFF_COL,
    fontSize: text.chipValue.size, fontWeight: '800', textAlign: 'right',
  },
  diffPos: { color: L.success },
  diffNeg: { color: L.danger },
});

// ─── Leaderboard Stat Card ────────────────────────────────────────────────────

function LeaderStat({
  icon, label, playerName, value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  playerName: string;
  value: string;
}) {
  return (
    <View style={ls.card}>
      <View style={ls.iconWrap}>
        <Ionicons name={icon} size={15} color={L.gold} />
      </View>
      <Text style={ls.label}>{label}</Text>
      <Text style={ls.name} numberOfLines={1}>{playerName}</Text>
      <Text style={ls.value}>{value}</Text>
    </View>
  );
}

const ls = StyleSheet.create({
  card: {
    flex: 1, alignItems: 'center',
    backgroundColor: L.bg,
    borderRadius: shape.panel,
    borderWidth: 1, borderColor: L.border,
    padding: 12, gap: 4,
  },
  iconWrap: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: L.goldBg, borderWidth: 1, borderColor: L.goldBorder,
    alignItems: 'center', justifyContent: 'center', marginBottom: 2,
  },
  label: { fontSize: text.microLabel.size, fontWeight: '700', color: L.textSub, textAlign: 'center', letterSpacing: 0.3 },
  name: { fontSize: text.chipValue.size, fontWeight: '800', color: L.navy, textAlign: 'center' },
  value: { fontSize: text.rowValue.size, fontWeight: '800', color: L.gold },
});

// ─── Context menu items ───────────────────────────────────────────────────────

const ALL_MENU_ITEMS = [
  { id: 'share',    label: 'Share Standings',          icon: 'share-outline' },
  { id: 'export',   label: 'Export Standings',         icon: 'download-outline' },
  { id: 'results',  label: 'View Results',             icon: 'trophy-outline' },
  { id: 'schedule', label: 'View Schedule',            icon: 'calendar-outline' },
  { id: 'command',  label: 'Return to Command Center', icon: 'arrow-back-outline' },
];

// Actions with no implementation behind them. They used to sit in the menu
// and answer with a "coming soon" alert; item 6.2's bar is that a visible CTA
// does something real, so in a production build they are simply not offered.
// Internal builds keep them visible so the gap stays obvious to QA.
const UNBUILT_MENU_IDS = new Set(['export']);
const MENU_ITEMS = ALL_MENU_ITEMS.filter(
  (i) => IS_INTERNAL_BUILD || !UNBUILT_MENU_IDS.has(i.id),
);
const MENU_DANGER = { id: 'close', label: 'Close Round Robin', icon: 'close-circle-outline' };

// ─── UUID detection ──────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function RRStandingsScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const tournamentId = id ?? '';
  const isSupabase   = UUID_RE.test(tournamentId);

  // ── Supabase state ──
  const [sbRounds,      setSbRounds]      = useState<RRRound[]>([]);
  const [sbTitle,       setSbTitle]       = useState<string | null>(null);
  const [sbEventStatus, setSbEventStatus] = useState<string>('open');
  const [loadingSb,     setLoadingSb]     = useState(isSupabase);
  const completionFiredRef = useRef(false);

  // ── Standings state ──
  const [standings, setStandings] = useState<RRStanding[]>(() =>
    isSupabase ? [] : computeStandings(getSchedule(tournamentId) ?? []),
  );

  // Supabase: load matches + event title on mount
  useEffect(() => {
    if (!isSupabase) return;
    setLoadingSb(true);
    Promise.all([
      fetchRoundRobinMatches(tournamentId),
      fetchPlayEventById(tournamentId),
    ])
      .then(([rows, ev]) => {
        const r = sbMatchesToRRRounds(rows);
        setSbRounds(r);
        setStandings(computeStandings(r));
        if (ev) {
          setSbTitle(ev.name);
          setSbEventStatus(ev.status);
        }
        if (!completionFiredRef.current) {
          const total = r.reduce((acc, round) => acc + round.matches.length, 0);
          const done  = r.reduce((acc, round) => acc + round.matches.filter(m => m.status === 'completed').length, 0);
          if (total > 0 && done === total && ev && ev.status !== 'completed') {
            completionFiredRef.current = true;
            setSbEventStatus('completed');
            completePlayEvent(tournamentId).catch(() => {});
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoadingSb(false));
  }, [tournamentId, isSupabase]);

  // Re-fetch on every focus so scores entered elsewhere are reflected
  useFocusEffect(useCallback(() => {
    if (isSupabase) {
      fetchRoundRobinMatches(tournamentId)
        .then(rows => {
          const r = sbMatchesToRRRounds(rows);
          setSbRounds(r);
          setStandings(computeStandings(r));
          if (!completionFiredRef.current) {
            const total = r.reduce((acc, round) => acc + round.matches.length, 0);
            const done  = r.reduce((acc, round) => acc + round.matches.filter(m => m.status === 'completed').length, 0);
            if (total > 0 && done === total) {
              completionFiredRef.current = true;
              setSbEventStatus('completed');
              completePlayEvent(tournamentId).catch(() => {});
            }
          }
        })
        .catch(() => {});
    } else {
      setStandings(computeStandings(getSchedule(tournamentId) ?? []));
    }
  }, [tournamentId, isSupabase]));

  // ── Derived display values ──
  const localRR        = getRoundRobin();
  const displayTitle   = isSupabase ? (sbTitle ?? 'Round Robin') : (localRR?.title ?? 'Round Robin');
  const rounds: RRRound[] = isSupabase ? sbRounds : (getSchedule(tournamentId) ?? []);

  const allMatches = rounds.reduce((acc, r) => acc + r.matches.length, 0);
  const completed  = rounds.reduce(
    (acc, r) => acc + r.matches.filter(m => m.status === 'completed').length, 0,
  );
  const allDone    = allMatches > 0 && completed === allMatches;
  const leader     = standings[0];

  const mostWins  = standings.reduce<RRStanding | null>(
    (best, s) => (!best || s.wins > best.wins) ? s : best, null,
  );
  const bestDiff  = standings.reduce<RRStanding | null>(
    (best, s) => (!best || s.pointDifferential > best.pointDifferential) ? s : best, null,
  );
  const mostPts   = standings.reduce<RRStanding | null>(
    (best, s) => (!best || s.pointsFor > best.pointsFor) ? s : best, null,
  );

  // ── Context menu ──
  const [menuOpen, setMenuOpen] = useState(false);
  const menuAnim = useRef(new Animated.Value(0)).current;
  const menuOpacity     = menuAnim.interpolate({ inputRange: [0,1], outputRange: [0,1] });
  const menuScale       = menuAnim.interpolate({ inputRange: [0,1], outputRange: [0.88,1] });
  const backdropOpacity = menuAnim.interpolate({ inputRange: [0,1], outputRange: [0,0.18] });

  function openMenu() {
    setMenuOpen(true);
    Animated.timing(menuAnim, { toValue:1, duration:160, easing: Easing.out(Easing.cubic), useNativeDriver:true }).start();
  }
  function closeMenu(cb?: () => void) {
    Animated.timing(menuAnim, { toValue:0, duration:120, easing: Easing.in(Easing.cubic), useNativeDriver:true })
      .start(() => { setMenuOpen(false); cb?.(); });
  }

  async function handleShare() {
    try {
      const lines = standings.map(s =>
        `#${s.rank} ${s.playerName}  ${s.wins}-${s.losses}  ${fmtDiff(s.pointDifferential)}`,
      ).join('\n');
      await Share.share({
        message: `${displayTitle} Standings\n\n${lines}`,
        title: 'Standings',
      });
    } catch { /* dismissed */ }
  }

  function handleMenuAction(id: string) {
    switch (id) {
      case 'share':    closeMenu(handleShare); break;
      case 'export':   closeMenu(() => comingSoon('Export Standings')); break;
      case 'results':  closeMenu(() => router.push(`/round-robin/${tournamentId}/results` as never)); break;
      case 'schedule': closeMenu(() => router.push(`/round-robin/${tournamentId}/schedule` as never)); break;
      case 'command':  closeMenu(() => router.back()); break;
      case 'close':    closeMenu(() => Alert.alert(
        'Close Round Robin?',
        'This will finalize standings. This cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Close Round Robin', style: 'destructive', onPress: () => router.back() },
        ],
      )); break;
      default: closeMenu();
    }
  }

  return (
    <View style={s.root}>
      <StatusBar style="dark" />

      {/* ── HEADER ── */}
      <View style={[s.header, { paddingTop: insets.top }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.6}>
          <Ionicons name="chevron-back" size={20} color="#007AFF" />
          <Text style={s.backText}>Back</Text>
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>Standings</Text>
          <Text style={s.headerSub}>Round Robin Rankings</Text>
        </View>
        <View style={s.headerActions}>
          <TouchableOpacity style={s.headerIconBtn} onPress={handleShare} activeOpacity={0.7}>
            <Ionicons name="share-outline" size={20} color={L.navy} />
          </TouchableOpacity>
          <TouchableOpacity style={s.headerIconBtn} onPress={openMenu} activeOpacity={0.7}>
            <Ionicons name="ellipsis-horizontal" size={20} color={L.navy} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── COMPLETE BANNER ── */}
        {allDone && (
          <View style={s.completeBanner}>
            <View style={s.completeBannerIcon}>
              <Ionicons name="trophy" size={18} color={L.gold} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.completeBannerTitle}>Round Robin Complete</Text>
              <Text style={s.completeBannerSub}>Standings Finalized</Text>
            </View>
            <TouchableOpacity
              style={s.viewResultsBtn}
              onPress={() => router.push(`/round-robin/${tournamentId}/results` as never)}
              activeOpacity={0.85}
            >
              <Text style={s.viewResultsBtnText}>View Results</Text>
              <Ionicons name="chevron-forward" size={13} color={L.gold} />
            </TouchableOpacity>
          </View>
        )}

        {/* ── SUMMARY CARD ── */}
        <View style={s.summaryCard}>
          <Text style={s.summaryTitle} numberOfLines={1}>{displayTitle}</Text>
          <View style={s.summaryPills}>
            <View style={s.summaryPill}>
              <Text style={s.pillValue}>{standings.length}</Text>
              <Text style={s.pillLabel}>Players</Text>
            </View>
            <View style={s.pillDivider} />
            <View style={s.summaryPill}>
              <Text style={s.pillValue}>{rounds.length}</Text>
              <Text style={s.pillLabel}>Rounds</Text>
            </View>
            <View style={s.pillDivider} />
            <View style={s.summaryPill}>
              <Text style={s.pillValue}>{completed}/{allMatches}</Text>
              <Text style={s.pillLabel}>Matches</Text>
            </View>
          </View>
        </View>

        {/* ── TOP PERFORMER ── */}
        {leader && leader.matchesPlayed > 0 && (
          <View style={s.leaderCard}>
            <View style={s.leaderLeft}>
              <View style={s.leaderIconWrap}>
                <Ionicons name="trophy" size={18} color={L.gold} />
              </View>
              <Text style={s.leaderBadgeText}>Current Leader</Text>
            </View>
            <View style={s.leaderBody}>
              <View style={s.leaderAvatar}>
                <Text style={s.leaderAvatarText}>{leader.avatarInitials}</Text>
              </View>
              <View>
                <Text style={s.leaderName}>{leader.playerName}</Text>
                <Text style={s.leaderRecord}>{leader.wins}-{leader.losses} Record</Text>
                <Text style={s.leaderDiff}>{fmtDiff(leader.pointDifferential)} Point Differential</Text>
              </View>
            </View>
          </View>
        )}

        {/* ── STANDINGS TABLE ── */}
        <View style={s.tableCard}>
          {/* Column headers */}
          <View style={[s.tableHeader]}>
            <Text style={[s.tableHeaderCell, { width: RANK_COL }]}>#</Text>
            <Text style={[s.tableHeaderCell, { width: PLAYER_COL }]}>Player</Text>
            <Text style={[s.tableHeaderCell, { width: STAT_COL }]}>W</Text>
            <Text style={[s.tableHeaderCell, { width: STAT_COL }]}>L</Text>
            <Text style={[s.tableHeaderCell, { width: STAT_COL }]}>PF</Text>
            <Text style={[s.tableHeaderCell, { width: STAT_COL }]}>PA</Text>
            <Text style={[s.tableHeaderCell, { width: DIFF_COL, textAlign: 'right' }]}>+/-</Text>
          </View>

          {loadingSb ? (
            <View style={s.emptyTable}>
              <ActivityIndicator size="small" color={colors.gold} />
            </View>
          ) : standings.length === 0 ? (
            <View style={s.emptyTable}>
              <Text style={s.emptyText}>No matches completed yet.</Text>
            </View>
          ) : (
            standings.map(st => <StandingRow key={st.playerId} s={st} />)
          )}
        </View>

        {/* ── LEADERBOARD STATS ── */}
        {standings.some(s => s.matchesPlayed > 0) && (
          <View style={s.statsSection}>
            <Text style={s.statsSectionTitle}>Leaderboard Stats</Text>
            <View style={s.statsRow}>
              {mostWins && (
                <LeaderStat
                  icon="trophy-outline"
                  label="MOST WINS"
                  playerName={mostWins.playerName}
                  value={`${mostWins.wins}`}
                />
              )}
              {bestDiff && (
                <LeaderStat
                  icon="trending-up-outline"
                  label="BEST DIFFERENTIAL"
                  playerName={bestDiff.playerName}
                  value={fmtDiff(bestDiff.pointDifferential)}
                />
              )}
              {mostPts && (
                <LeaderStat
                  icon="flash-outline"
                  label="MOST POINTS"
                  playerName={mostPts.playerName}
                  value={`${mostPts.pointsFor}`}
                />
              )}
            </View>
          </View>
        )}

        {/* ── PLAYOFFS PLACEHOLDER ── */}
        <View style={s.playoffCard}>
          <View style={s.playoffHeader}>
            <View style={s.playoffIconWrap}>
              <Ionicons name="git-branch-outline" size={17} color={L.gold} />
            </View>
            <View>
              <Text style={s.playoffTitle}>Playoffs</Text>
              <Text style={s.playoffSub}>Top finishers advance to bracket play</Text>
            </View>
          </View>
          <View style={s.playoffEmptyState}>
            <Text style={s.playoffEmptyText}>Coming Soon</Text>
            <Text style={s.playoffEmptySub}>
              Playoff bracket support is on the way. Top 4 or Top 8 formats will be available here.
            </Text>
          </View>
        </View>

      </ScrollView>

      {/* ── CONTEXT MENU ── */}
      {menuOpen && (
        <>
          <Animated.View style={[mm.backdrop, { opacity: backdropOpacity }]} pointerEvents="none" />
          <TouchableOpacity
            style={[StyleSheet.absoluteFill, { zIndex: 30 }]}
            activeOpacity={1}
            onPress={() => closeMenu()}
          />
          <Animated.View
            style={[mm.popover, {
              top: insets.top + 52,
              right: 16,
              opacity: menuOpacity,
              transform: [{ scale: menuScale }],
            }]}
          >
            <View style={mm.caret} />
            {MENU_ITEMS.map((item, i) => (
              <TouchableOpacity
                key={item.id}
                style={[mm.row, i === 0 && mm.rowFirst]}
                onPress={() => handleMenuAction(item.id)}
                activeOpacity={0.7}
              >
                <View style={mm.iconWrap}>
                  <Ionicons name={item.icon as never} size={17} color={L.navy} />
                </View>
                <Text style={mm.rowLabel}>{item.label}</Text>
              </TouchableOpacity>
            ))}
            <View style={mm.divider} />
            <TouchableOpacity
              style={mm.row}
              onPress={() => handleMenuAction('close')}
              activeOpacity={0.7}
            >
              <View style={mm.iconWrap}>
                <Ionicons name={MENU_DANGER.icon as never} size={17} color={L.danger} />
              </View>
              <Text style={[mm.rowLabel, mm.rowLabelDanger]}>{MENU_DANGER.label}</Text>
            </TouchableOpacity>
          </Animated.View>
        </>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.screenH,
    paddingBottom: 10,
    backgroundColor: L.page,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 60 },
  backText: { fontSize: text.link.size, color: '#007AFF', fontWeight: '700' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: text.titleSm.size, fontWeight: '800', color: L.navy },
  headerSub: { fontSize: text.caption.size, fontWeight: '500', color: L.textSub, marginTop: 1 },
  headerActions: { flexDirection: 'row', gap: 4, minWidth: 60, justifyContent: 'flex-end' },
  headerIconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },

  scroll: { paddingHorizontal: spacing.screenH, paddingTop: spacing.md, gap: 14 },

  // Complete banner
  completeBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: L.goldLight,
    borderRadius: shape.card,
    borderWidth: 1.5, borderColor: L.goldBorder,
    padding: spacing.md,
  },
  completeBannerIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: L.goldBg, borderWidth: 1.5, borderColor: L.goldBorder,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  completeBannerTitle: { fontSize: text.titleSm.size, fontWeight: '800', color: L.navy },
  completeBannerSub: { fontSize: text.caption.size, fontWeight: '500', color: L.textSub, marginTop: 2 },
  viewResultsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: L.bg, borderRadius: shape.cta,
    borderWidth: 1.5, borderColor: L.goldBorder,
    paddingHorizontal: 10, paddingVertical: 6, flexShrink: 0,
  },
  viewResultsBtnText: { fontSize: text.action.size, fontWeight: '800', color: L.gold },

  // Summary card
  summaryCard: {
    backgroundColor: L.bg, borderRadius: shape.card,
    borderWidth: 1, borderColor: L.border, padding: spacing.md, gap: 12,
  },
  summaryTitle: { fontSize: text.titleSm.size, fontWeight: '800', color: L.navy },
  summaryPills: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: L.page, borderRadius: shape.cta, padding: 12,
  },
  summaryPill: { flex: 1, alignItems: 'center' },
  pillValue: { fontSize: text.statValueSm.size, fontWeight: '900', color: L.navy },
  pillLabel: { fontSize: text.caption.size, fontWeight: '500', color: L.textSub, marginTop: 2 },
  pillDivider: { width: 1, height: 24, backgroundColor: L.border },

  // Leader card
  leaderCard: {
    backgroundColor: L.goldLight,
    borderRadius: shape.card,
    borderWidth: 1.5, borderColor: L.goldBorder,
    padding: spacing.md,
    gap: 12,
  },
  leaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  leaderIconWrap: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: L.goldBg, borderWidth: 1, borderColor: L.goldBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  leaderBadgeText: { fontSize: text.chipValue.size, fontWeight: '800', color: L.navy, letterSpacing: 0.3 },
  leaderBody: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  leaderAvatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: L.goldBg, borderWidth: 2, borderColor: L.gold,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  leaderAvatarText: { fontSize: text.rowValue.size, fontWeight: '800', color: L.navy },
  leaderName: { fontSize: text.titleSm.size, fontWeight: '800', color: L.navy },
  leaderRecord: { fontSize: text.caption.size, fontWeight: '500', color: L.textSub, marginTop: 2 },
  leaderDiff: { fontSize: text.caption.size, fontWeight: '500', color: L.textSub, marginTop: 1 },

  // Table
  tableCard: {
    backgroundColor: L.bg, borderRadius: shape.card,
    borderWidth: 1, borderColor: L.border, padding: spacing.md,
  },
  tableHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingBottom: 8, marginBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  tableHeaderCell: {
    fontSize: 10, fontWeight: '800', color: L.textSub,
    letterSpacing: 0.5, textAlign: 'center',
  },
  emptyTable: { paddingVertical: 24, alignItems: 'center' },
  emptyText: { fontSize: text.caption.size, fontWeight: '500', color: L.textSub },

  // Leaderboard stats
  statsSection: { gap: 10 },
  statsSectionTitle: { fontSize: text.rowValue.size, fontWeight: '800', color: L.navy },
  statsRow: { flexDirection: 'row', gap: 10 },

  // Playoffs placeholder
  playoffCard: {
    backgroundColor: L.bg, borderRadius: shape.card,
    borderWidth: 1, borderColor: L.border, padding: spacing.md,
    gap: 12,
  },
  playoffHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  playoffIconWrap: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: L.goldBg, borderWidth: 1, borderColor: L.goldBorder,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  playoffTitle: { fontSize: text.rowValue.size, fontWeight: '800', color: L.navy },
  playoffSub: { fontSize: text.caption.size, fontWeight: '500', color: L.textSub, marginTop: 1 },
  playoffEmptyState: {
    backgroundColor: L.page, borderRadius: shape.cta,
    padding: 16, alignItems: 'center', gap: 6,
  },
  playoffEmptyText: { fontSize: text.rowValue.size, fontWeight: '800', color: L.textSub },
  playoffEmptySub: { fontSize: text.caption.size, fontWeight: '500', color: L.textSub, textAlign: 'center', lineHeight: 17 },
});

// ─── Context menu styles ──────────────────────────────────────────────────────

const mm = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0A1228', zIndex: 30 },
  popover: {
    position: 'absolute', width: 256,
    backgroundColor: '#FFFFFF', borderRadius: shape.card, paddingVertical: 5, zIndex: 31,
    shadowColor: '#000', shadowOpacity: 0.13, shadowRadius: 18, shadowOffset: { width: 0, height: 8 },
    elevation: 16,
  },
  caret: {
    position: 'absolute', top: -7, right: 13, width: 0, height: 0,
    borderLeftWidth: 6, borderRightWidth: 6, borderBottomWidth: 8,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#FFFFFF',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 8, marginHorizontal: 5, borderRadius: shape.pill, height: 50,
  },
  rowFirst: { marginTop: 4 },
  iconWrap: {
    width: 32, height: 32, borderRadius: shape.cta, backgroundColor: '#F3F6FC',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  rowLabel: { color: L.navy, fontSize: text.body.size, fontWeight: '500' },
  rowLabelDanger: { color: L.danger },
  divider: {
    height: StyleSheet.hairlineWidth, backgroundColor: L.border, marginHorizontal: 10, marginVertical: 3,
  },
});
