import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Alert, Animated, Easing,
  Share, ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing, radius } from '@/theme';
import { StatusChip } from '@/components/StatusChip';
import { PickleballIcon } from '@/components';
import { getRoundRobin } from '@/lib/roundRobinStore';
import { getSchedule, type RRRound, type RRMatch } from '@/lib/rrScheduleStore';
import { useSupportContext } from '@/lib/support/supportContext';
import {
  fetchRoundRobinMatches, deleteRoundRobinSchedule, sbMatchesToRRRounds,
} from '@/lib/supabase/roundRobin';
import { fetchPlayEventById } from '@/lib/supabase/playEvents';

// ─── Constants ────────────────────────────────────────────────────────────────

const FALLBACK_RR = {
  id: 'rr-demo',
  title: 'Wednesday Round Robin',
  locationName: 'Lakewood Ranch Courts',
  date: new Date(2025, 5, 25, 18, 30).toISOString(),
  maxPlayers: 8,
};

// ─── Theme alias ──────────────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

function comingSoon(feature: string) {
  Alert.alert(feature, 'Coming soon — this feature is on the way.', [{ text: 'Got It' }]);
}

// ─── Match Card ───────────────────────────────────────────────────────────────

function MatchCard({
  match,
  tournamentId,
}: {
  match: RRMatch;
  tournamentId: string;
}) {
  const p1 = match.player1;
  const p2 = match.player2;
  const isCompleted = match.status === 'completed';
  const p1Won = isCompleted && match.winnerId === p1?.id;
  const p2Won = isCompleted && match.winnerId === p2?.id;

  return (
    <View style={[mc.card, isCompleted && mc.cardCompleted]}>
      {/* Court + Time row */}
      <View style={mc.metaRow}>
        <View style={mc.courtBadge}>
          <PickleballIcon size={11} color={L.gold} />
          <Text style={mc.courtText}>Court {match.courtNumber}</Text>
        </View>
        {match.scheduledTime && (
          <View style={mc.timeBadge}>
            <Ionicons name="time-outline" size={11} color={L.textSub} />
            <Text style={mc.timeText}>{match.scheduledTime}</Text>
          </View>
        )}
        <View style={{ marginLeft: 'auto' }}>
          <StatusChip
            label={isCompleted ? 'Completed' : 'Scheduled'}
            variant={isCompleted ? 'green' : 'gray'}
          />
        </View>
      </View>

      {/* Players + Scores row */}
      {isCompleted ? (
        <View style={mc.completedPlayers}>
          {/* Player 1 result row */}
          <View style={[mc.resultRow, !p1Won && mc.resultRowLoser]}>
            <View style={[mc.avatar, p1Won && mc.avatarWinner]}>
              <Text style={mc.avatarText}>{p1?.avatarInitials ?? '?'}</Text>
            </View>
            <View style={mc.playerInfo}>
              <Text style={[mc.playerName, !p1Won && mc.playerNameLoser]} numberOfLines={1}>
                {p1?.name ?? '—'}
              </Text>
              {p1Won && (
                <View style={mc.winnerBadge}>
                  <Ionicons name="trophy-outline" size={10} color={L.gold} />
                  <Text style={mc.winnerBadgeText}>Winner</Text>
                </View>
              )}
            </View>
            <Text style={[mc.resultScore, p1Won ? mc.resultScoreWinner : mc.resultScoreLoser]}>
              {match.score1}
            </Text>
          </View>

          <View style={mc.resultDivider} />

          {/* Player 2 result row */}
          <View style={[mc.resultRow, !p2Won && mc.resultRowLoser]}>
            <View style={[mc.avatar, p2Won && mc.avatarWinner]}>
              <Text style={mc.avatarText}>{p2?.avatarInitials ?? '?'}</Text>
            </View>
            <View style={mc.playerInfo}>
              <Text style={[mc.playerName, !p2Won && mc.playerNameLoser]} numberOfLines={1}>
                {p2?.name ?? '—'}
              </Text>
              {p2Won && (
                <View style={mc.winnerBadge}>
                  <Ionicons name="trophy-outline" size={10} color={L.gold} />
                  <Text style={mc.winnerBadgeText}>Winner</Text>
                </View>
              )}
            </View>
            <Text style={[mc.resultScore, p2Won ? mc.resultScoreWinner : mc.resultScoreLoser]}>
              {match.score2}
            </Text>
          </View>
        </View>
      ) : (
        <View style={mc.playersRow}>
          <View style={mc.playerSide}>
            <View style={mc.avatar}>
              <Text style={mc.avatarText}>{p1?.avatarInitials ?? '?'}</Text>
            </View>
            <View style={mc.playerInfo}>
              <Text style={mc.playerName} numberOfLines={1}>{p1?.name ?? '—'}</Text>
              {p1?.dupr ? <Text style={mc.playerDupr}>{p1.dupr} DUPR</Text> : null}
            </View>
          </View>

          <View style={mc.vsDivider}>
            <Text style={mc.vsText}>vs</Text>
          </View>

          <View style={[mc.playerSide, mc.playerSideRight]}>
            <View style={mc.playerInfo}>
              <Text style={[mc.playerName, mc.playerNameRight]} numberOfLines={1}>{p2?.name ?? '—'}</Text>
              {p2?.dupr ? <Text style={[mc.playerDupr, mc.playerDuprRight]}>{p2.dupr} DUPR</Text> : null}
            </View>
            <View style={mc.avatar}>
              <Text style={mc.avatarText}>{p2?.avatarInitials ?? '?'}</Text>
            </View>
          </View>
        </View>
      )}

      {/* Enter Scores button */}
      {!isCompleted && (
        <TouchableOpacity
          style={mc.enterBtn}
          onPress={() =>
            router.push(`/round-robin/${tournamentId}/score-entry?matchId=${match.id}` as never)
          }
          activeOpacity={0.85}
        >
          <Ionicons name="create-outline" size={14} color={L.navy} />
          <Text style={mc.enterBtnText}>Enter Scores</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const mc = StyleSheet.create({
  card: {
    backgroundColor: L.bg,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: L.border,
    padding: spacing.md,
    gap: 12,
    marginBottom: 10,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  courtBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: L.goldBg, borderRadius: radius.chip,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: L.goldBorder,
  },
  courtText: { fontSize: 11, fontWeight: '700', color: L.navy },
  timeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: L.page, borderRadius: radius.chip,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: L.border,
  },
  timeText: { fontSize: 11, fontWeight: '600', color: L.textSub },

  playersRow: {
    flexDirection: 'row', alignItems: 'center',
  },
  playerSide: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  playerSideRight: { justifyContent: 'flex-end' },
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: L.goldBg, borderWidth: 1.5, borderColor: L.goldBorder,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarText: { fontSize: 11, fontWeight: '800', color: L.navy },
  playerInfo: { flex: 1 },
  playerName: { fontSize: 13, fontWeight: '700', color: L.navy },
  playerNameRight: { textAlign: 'right' },
  playerDupr: { fontSize: 11, color: L.textSub, marginTop: 1 },
  playerDuprRight: { textAlign: 'right' },
  vsDivider: {
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  vsText: { fontSize: 12, fontWeight: '900', color: L.textSub, letterSpacing: 0.5 },

  // Completed card accent
  cardCompleted: { borderColor: colors.successBg },

  // Completed players layout
  completedPlayers: { gap: 6 },
  resultRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  resultRowLoser: { opacity: 0.45 },
  avatarWinner: {
    borderColor: L.gold, backgroundColor: L.goldBg,
  },
  winnerBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2,
  },
  winnerBadgeText: { fontSize: 10, fontWeight: '700', color: L.gold },
  playerNameLoser: { color: L.textSub },
  resultDivider: {
    height: StyleSheet.hairlineWidth, backgroundColor: L.border, marginVertical: 2,
  },
  resultScore: {
    fontSize: 22, fontWeight: '900', minWidth: 30, textAlign: 'right',
  },
  resultScoreWinner: { color: L.navy },
  resultScoreLoser:  { color: L.textSub },

  enterBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderColor: L.border,
    borderRadius: radius.sm, paddingVertical: 9,
  },
  enterBtnText: { fontSize: 13, fontWeight: '700', color: L.navy },
});

// ─── BYE Row ──────────────────────────────────────────────────────────────────

function ByeRow({ playerName }: { playerName: string }) {
  return (
    <View style={br.row}>
      <Ionicons name="pause-circle-outline" size={15} color={L.textSub} />
      <Text style={br.text}>{playerName} has a BYE this round.</Text>
    </View>
  );
}

const br = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: L.page,
    borderRadius: radius.sm,
    borderWidth: 1, borderColor: L.border,
    paddingHorizontal: 12, paddingVertical: 9,
    marginBottom: 10,
  },
  text: { fontSize: 12, color: L.textSub, fontStyle: 'italic' },
});

// ─── Round Section ────────────────────────────────────────────────────────────

function RoundSection({
  round,
  tournamentId,
}: {
  round: RRRound;
  tournamentId: string;
}) {
  const allDone = round.matches.length > 0 &&
    round.matches.every(m => m.status === 'completed');

  return (
    <View style={rs.wrap}>
      <View style={rs.header}>
        <Text style={rs.title}>Round {round.roundNumber}</Text>
        {allDone ? (
          <View style={rs.completeBadge}>
            <Ionicons name="checkmark-circle" size={13} color={L.success} />
            <Text style={rs.completeBadgeText}>Round Complete</Text>
          </View>
        ) : (
          <Text style={rs.sub}>{round.matches.length} Match{round.matches.length !== 1 ? 'es' : ''}</Text>
        )}
      </View>
      {round.byePlayerName ? (
        <ByeRow playerName={round.byePlayerName} />
      ) : null}
      {round.matches.map(m => (
        <MatchCard key={m.id} match={m} tournamentId={tournamentId} />
      ))}
    </View>
  );
}

const rs = StyleSheet.create({
  wrap: { marginBottom: 6 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 10,
  },
  title: { fontSize: 16, fontWeight: '900', color: L.navy },
  sub:   { fontSize: 12, color: L.textSub },
  completeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.successBg,
    borderRadius: radius.chip,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  completeBadgeText: { fontSize: 11, fontWeight: '700', color: L.success },
});

// ─── Context Menu ─────────────────────────────────────────────────────────────

const MENU_ITEMS = [
  { id: 'share',       label: 'Share Schedule',          icon: 'share-outline' },
  { id: 'export',      label: 'Export Schedule',         icon: 'download-outline' },
  { id: 'command',     label: 'Return to Command Center', icon: 'arrow-back-outline' },
  { id: 'regenerate',  label: 'Regenerate Schedule',     icon: 'refresh-outline' },
];
const MENU_DANGER = { id: 'cancel', label: 'Cancel Round Robin', icon: 'trash-outline' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function RRScheduleScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const tournamentId = id ?? '';
  const isSupabase   = UUID_RE.test(tournamentId);

  // ── Event title/location (Supabase path) ──
  const [sbTitle,    setSbTitle]    = useState<string | null>(null);
  const [sbLocation, setSbLocation] = useState<string | null>(null);
  const [sbDate,     setSbDate]     = useState<string | null>(null);
  const [sbMax,      setSbMax]      = useState<number | null>(null);

  useSupportContext({ feature: 'round_robin', entityType: 'round_robin', entityId: tournamentId, entityLabel: sbTitle ?? undefined });

  useEffect(() => {
    if (!isSupabase) return;
    fetchPlayEventById(tournamentId)
      .then(ev => {
        if (!ev) return;
        setSbTitle(ev.name);
        setSbLocation(ev.venue_name ?? ev.location);
        setSbDate(ev.event_date);
        setSbMax(ev.max_players);
      })
      .catch(() => {});
  }, [tournamentId, isSupabase]);

  // ── Display object used by summary card ──
  const localRR = getRoundRobin();
  const g = isSupabase
    ? {
        title:        sbTitle ?? 'Round Robin',
        locationName: sbLocation ?? '',
        date:         sbDate ?? new Date().toISOString(),
        maxPlayers:   sbMax ?? 0,
      }
    : (localRR ?? FALLBACK_RR);

  // ── Rounds state ──
  const [rounds, setRounds] = useState<RRRound[]>(() =>
    isSupabase ? [] : (getSchedule(tournamentId) ?? []),
  );
  const [loadingRounds, setLoadingRounds] = useState(isSupabase);
  const [selectedRound, setSelectedRound] = useState<number | 'all'>('all');

  useEffect(() => {
    if (!isSupabase) return;
    setLoadingRounds(true);
    fetchRoundRobinMatches(tournamentId)
      .then(rows => setRounds(sbMatchesToRRRounds(rows)))
      .catch(() => {})
      .finally(() => setLoadingRounds(false));
  }, [tournamentId, isSupabase]);

  useFocusEffect(useCallback(() => {
    if (isSupabase) {
      fetchRoundRobinMatches(tournamentId)
        .then(rows => setRounds(sbMatchesToRRRounds(rows)))
        .catch(() => {});
    } else {
      const fresh = getSchedule(tournamentId);
      if (fresh) setRounds(fresh);
    }
  }, [tournamentId, isSupabase]));

  const totalMatches = rounds.reduce((acc, r) => acc + r.matches.length, 0);
  const displayRounds = selectedRound === 'all'
    ? rounds
    : rounds.filter(r => r.roundNumber === selectedRound);

  // ── Context menu ──
  const [menuOpen, setMenuOpen] = useState(false);
  const menuAnim = useRef(new Animated.Value(0)).current;
  const menuOpacity    = menuAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const menuScale      = menuAnim.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] });
  const backdropOpacity = menuAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.18] });

  function openMenu() {
    setMenuOpen(true);
    Animated.timing(menuAnim, {
      toValue: 1, duration: 160,
      easing: Easing.out(Easing.cubic), useNativeDriver: true,
    }).start();
  }

  function closeMenu(cb?: () => void) {
    Animated.timing(menuAnim, {
      toValue: 0, duration: 120,
      easing: Easing.in(Easing.cubic), useNativeDriver: true,
    }).start(() => { setMenuOpen(false); cb?.(); });
  }

  async function handleShare() {
    try {
      await Share.share({
        message: `Round Robin Schedule — ${g.title}\n${rounds.length} Rounds • ${totalMatches} Matches`,
        title: g.title,
      });
    } catch { /* dismissed */ }
  }

  function handleMenuAction(id: string) {
    switch (id) {
      case 'share':      closeMenu(handleShare); break;
      case 'export':     closeMenu(() => comingSoon('Export Schedule')); break;
      case 'command':    closeMenu(() => router.back()); break;
      case 'regenerate':
        if (isSupabase) {
          closeMenu(() => Alert.alert(
            'Regenerate Schedule?',
            'This will delete the current schedule and create a new one from the current roster.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Regenerate',
                style: 'destructive',
                onPress: async () => {
                  try {
                    await deleteRoundRobinSchedule(tournamentId);
                    router.replace(`/round-robin-created?id=${tournamentId}` as never);
                  } catch {
                    Alert.alert('Error', 'Could not delete schedule. Please try again.');
                  }
                },
              },
            ],
          ));
        } else {
          closeMenu(() => comingSoon('Regenerate Schedule'));
        }
        break;
      case 'cancel':     closeMenu(() => Alert.alert(
        'Cancel Round Robin?',
        'This cannot be undone.',
        [
          { text: 'Keep Event', style: 'cancel' },
          { text: 'Cancel Round Robin', style: 'destructive', onPress: () => router.back() },
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
        <TouchableOpacity style={s.headerBtn} onPress={() => router.back()} activeOpacity={0.6}>
          <Ionicons name="chevron-back" size={20} color="#007AFF" />
          <Text style={s.backText}>Back</Text>
        </TouchableOpacity>

        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>Round Robin Schedule</Text>
          <Text style={s.headerSub}>Match Schedule</Text>
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

        {/* ── SUMMARY CARD ── */}
        <View style={s.summaryCard}>
          <Text style={s.summaryTitle} numberOfLines={1}>{g.title}</Text>
          <View style={s.summaryRow}>
            <Ionicons name="location-outline" size={13} color={L.textSub} />
            <Text style={s.summaryMeta} numberOfLines={1}>{g.locationName}</Text>
          </View>
          <View style={s.summaryRow}>
            <Ionicons name="calendar-outline" size={13} color={L.textSub} />
            <Text style={s.summaryMeta}>{'date' in g ? fmtDate(g.date) : ''}</Text>
          </View>
          <View style={s.summaryPills}>
            <View style={s.summaryPill}>
              <Text style={s.summaryPillValue}>{g.maxPlayers}</Text>
              <Text style={s.summaryPillLabel}>Players</Text>
            </View>
            <View style={s.summaryPillDivider} />
            <View style={s.summaryPill}>
              <Text style={s.summaryPillValue}>{rounds.length}</Text>
              <Text style={s.summaryPillLabel}>Rounds</Text>
            </View>
            <View style={s.summaryPillDivider} />
            <View style={s.summaryPill}>
              <Text style={s.summaryPillValue}>{totalMatches}</Text>
              <Text style={s.summaryPillLabel}>Matches</Text>
            </View>
          </View>
        </View>

        {/* ── ROUND FILTERS ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.filterScroll}
          style={s.filterRow}
        >
          <TouchableOpacity
            style={[s.filterChip, selectedRound === 'all' && s.filterChipActive]}
            onPress={() => setSelectedRound('all')}
            activeOpacity={0.8}
          >
            <Text style={[s.filterChipText, selectedRound === 'all' && s.filterChipTextActive]}>
              All
            </Text>
          </TouchableOpacity>
          {rounds.map(r => (
            <TouchableOpacity
              key={r.id}
              style={[s.filterChip, selectedRound === r.roundNumber && s.filterChipActive]}
              onPress={() => setSelectedRound(r.roundNumber)}
              activeOpacity={0.8}
            >
              <Text style={[s.filterChipText, selectedRound === r.roundNumber && s.filterChipTextActive]}>
                R{r.roundNumber}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── SCHEDULE VIEW ── */}
        {loadingRounds ? (
          <View style={s.emptyState}>
            <ActivityIndicator size="large" color={colors.gold} />
            <Text style={s.emptySub}>Loading schedule…</Text>
          </View>
        ) : rounds.length === 0 ? (
          <View style={s.emptyState}>
            <Ionicons name="calendar-outline" size={36} color={L.border} />
            <Text style={s.emptyText}>No schedule available.</Text>
            <Text style={s.emptySub}>Return to the command center to generate a schedule.</Text>
          </View>
        ) : (
          <View style={s.scheduleBody}>
            {displayRounds.map(round => (
              <RoundSection key={round.id} round={round} tournamentId={tournamentId} />
            ))}
          </View>
        )}

      </ScrollView>

      {/* ── CONTEXT MENU ── */}
      {menuOpen && (
        <>
          <Animated.View style={[mm.backdrop, { opacity: backdropOpacity }]} pointerEvents="none" />
          <TouchableOpacity
            style={[StyleSheet.absoluteFillObject, { zIndex: 30 }]}
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
              onPress={() => handleMenuAction('cancel')}
              activeOpacity={0.7}
            >
              <View style={mm.iconWrap}>
                <Ionicons name="trash-outline" size={17} color={L.danger} />
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
  headerBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 60 },
  backText:  { fontSize: 17, color: '#007AFF', fontWeight: '400' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle:  { fontSize: 15, fontWeight: '800', color: L.navy },
  headerSub:    { fontSize: 11, color: L.textSub, marginTop: 1 },
  headerActions: { flexDirection: 'row', gap: 4, minWidth: 60, justifyContent: 'flex-end' },
  headerIconBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },

  // Scroll
  scroll: { paddingHorizontal: spacing.screenH, paddingTop: spacing.md, gap: 14 },

  // Summary card
  summaryCard: {
    backgroundColor: L.bg,
    borderRadius: radius.card,
    borderWidth: 1, borderColor: L.border,
    padding: spacing.md,
    gap: 8,
  },
  summaryTitle: { fontSize: 18, fontWeight: '900', color: L.navy },
  summaryRow:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  summaryMeta:  { fontSize: 12, color: L.textSub, flex: 1 },
  summaryPills: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: L.page, borderRadius: radius.sm,
    padding: 12, marginTop: 4,
  },
  summaryPill: { flex: 1, alignItems: 'center' },
  summaryPillValue: { fontSize: 22, fontWeight: '900', color: L.navy },
  summaryPillLabel: { fontSize: 11, color: L.textSub, marginTop: 2 },
  summaryPillDivider: { width: 1, height: 28, backgroundColor: L.border },

  // Round filters
  filterRow: { marginHorizontal: -spacing.screenH },
  filterScroll: { paddingHorizontal: spacing.screenH, gap: 8 },
  filterChip: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: radius.chip,
    borderWidth: 1.5, borderColor: L.border,
    backgroundColor: L.bg,
  },
  filterChipActive: { backgroundColor: L.navy, borderColor: L.navy },
  filterChipText:       { fontSize: 13, fontWeight: '700', color: L.navy },
  filterChipTextActive: { color: L.white },

  // Schedule body
  scheduleBody: { gap: 8 },

  // Empty state
  emptyState: {
    alignItems: 'center', gap: 8,
    paddingVertical: 48,
  },
  emptyText: { fontSize: 15, fontWeight: '700', color: L.textSub },
  emptySub:  { fontSize: 13, color: L.textSub, textAlign: 'center', lineHeight: 18, paddingHorizontal: 32 },
});

// ─── Context menu styles ──────────────────────────────────────────────────────

const mm = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0A1228',
    zIndex: 30,
  },
  popover: {
    position: 'absolute',
    width: 256,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingVertical: 5,
    zIndex: 31,
    shadowColor: '#000',
    shadowOpacity: 0.13,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 16,
  },
  caret: {
    position: 'absolute', top: -7, right: 13,
    width: 0, height: 0,
    borderLeftWidth: 6, borderRightWidth: 6, borderBottomWidth: 8,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    borderBottomColor: '#FFFFFF',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 8, marginHorizontal: 5,
    borderRadius: 11, height: 50,
  },
  rowFirst: { marginTop: 4 },
  iconWrap: {
    width: 32, height: 32, borderRadius: 9,
    backgroundColor: '#F3F6FC',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  rowLabel:       { color: L.navy, fontSize: 14, fontWeight: '500' },
  rowLabelDanger: { color: L.danger },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: L.border,
    marginHorizontal: 10, marginVertical: 3,
  },
});
