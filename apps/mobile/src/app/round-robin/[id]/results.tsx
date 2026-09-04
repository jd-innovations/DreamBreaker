import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Animated, Easing, Share,
} from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { IS_INTERNAL_BUILD } from '@/lib/featureFlags';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SecondaryButton } from '@/components/SecondaryButton';
import { getRoundRobin, updateStatus } from '@/lib/roundRobinStore';
import { getSchedule, type RRRound, type RRMatch } from '@/lib/rrScheduleStore';
import { computeStandings, fmtDiff, type RRStanding } from '@/lib/rrStandings';
import {
  fetchRoundRobinMatches, sbMatchesToRRRounds,
} from '@/lib/supabase/roundRobin';
import { fetchPlayEventById } from '@/lib/supabase/playEvents';

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

const SILVER_TEXT  = '#64748B';
const SILVER_BG    = '#F1F5F9';
const SILVER_BORDER= '#CBD5E1';
const BRONZE_TEXT  = '#92713A';
const BRONZE_BG    = '#FFF8EE';
const BRONZE_BORDER= '#E2C97B';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function comingSoon(feature: string) {
  Alert.alert(feature, 'Coming soon — this feature is on the way.', [{ text: 'Got It' }]);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ─── Derived stats ────────────────────────────────────────────────────────────

type Achievement = {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail: string;
  playerName?: string;
};

function deriveAchievements(rounds: RRRound[], standings: RRStanding[]): Achievement[] {
  const completed = rounds.flatMap(r => r.matches).filter(m => m.status === 'completed');
  if (completed.length === 0) return [];

  const out: Achievement[] = [];

  // Undefeated champion
  const undefeated = standings.find(s => s.losses === 0 && s.matchesPlayed > 0);
  if (undefeated) {
    out.push({
      id: 'undefeated',
      icon: 'shield-checkmark-outline',
      label: 'Undefeated',
      detail: `${undefeated.wins}-0 record`,
      playerName: undefeated.playerName,
    });
  }

  // Biggest blowout
  let blowout: RRMatch | null = null;
  let blowoutDiff = 0;
  for (const m of completed) {
    if (m.score1 !== undefined && m.score2 !== undefined) {
      const diff = Math.abs(m.score1 - m.score2);
      if (diff > blowoutDiff) { blowoutDiff = diff; blowout = m; }
    }
  }
  if (blowout && blowout.score1 !== undefined && blowout.score2 !== undefined) {
    const winnerName = blowout.winnerId === blowout.player1?.id
      ? blowout.player1?.name : blowout.player2?.name;
    out.push({
      id: 'blowout',
      icon: 'flash-outline',
      label: 'Biggest Blowout',
      detail: `${blowout.score1}–${blowout.score2} (${blowoutDiff} pt gap)`,
      playerName: winnerName,
    });
  }

  // Closest match
  let closest: RRMatch | null = null;
  let closestDiff = Infinity;
  for (const m of completed) {
    if (m.score1 !== undefined && m.score2 !== undefined) {
      const diff = Math.abs(m.score1 - m.score2);
      if (diff < closestDiff) { closestDiff = diff; closest = m; }
    }
  }
  if (closest && closest.score1 !== undefined && closest.score2 !== undefined) {
    out.push({
      id: 'closest',
      icon: 'pulse-outline',
      label: 'Closest Match',
      detail: `${closest.score1}–${closest.score2} (${closestDiff} pt gap)`,
      playerName: closest.player1?.name ?? '',
    });
  }

  // Highest scoring match
  let highScoring: RRMatch | null = null;
  let highTotal = 0;
  for (const m of completed) {
    if (m.score1 !== undefined && m.score2 !== undefined) {
      const total = m.score1 + m.score2;
      if (total > highTotal) { highTotal = total; highScoring = m; }
    }
  }
  if (highScoring && highScoring.score1 !== undefined && highScoring.score2 !== undefined) {
    out.push({
      id: 'highest',
      icon: 'trending-up-outline',
      label: 'Highest Scoring',
      detail: `${highScoring.score1}–${highScoring.score2} (${highTotal} pts)`,
      playerName: `${highScoring.player1?.name} vs ${highScoring.player2?.name}`,
    });
  }

  return out;
}

// ─── Standings table row (reused from standings screen) ───────────────────────

const RANK_COL   = 36;
const PLAYER_COL = 120;
const STAT_COL   = 30;
const DIFF_COL   = 40;

function StandingRow({ s }: { s: RRStanding }) {
  const isGold   = s.rank === 1;
  const isSilver = s.rank === 2;
  const isBronze = s.rank === 3;

  const bg     = isGold ? L.goldLight   : isSilver ? SILVER_BG   : isBronze ? BRONZE_BG   : L.bg;
  const border = isGold ? L.goldBorder  : isSilver ? SILVER_BORDER: isBronze ? BRONZE_BORDER: 'transparent';
  const numCol = isGold ? L.gold        : isSilver ? SILVER_TEXT  : isBronze ? BRONZE_TEXT  : L.textSub;

  return (
    <View style={[tr.row, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[tr.rankCell, { color: numCol }]}>#{s.rank}</Text>
      <View style={tr.playerCell}>
        <View style={[tr.avatar, isGold && tr.avatarGold, isSilver && tr.avatarSilver, isBronze && tr.avatarBronze]}>
          <Text style={tr.avatarText}>{s.avatarInitials}</Text>
        </View>
        <Text style={tr.playerName} numberOfLines={1}>{s.playerName}</Text>
      </View>
      <Text style={tr.statCell}>{s.wins}</Text>
      <Text style={tr.statCell}>{s.losses}</Text>
      <Text style={tr.statCell}>{s.pointsFor}</Text>
      <Text style={tr.statCell}>{s.pointsAgainst}</Text>
      <Text style={[tr.diffCell, s.pointDifferential >= 0 ? tr.diffPos : tr.diffNeg]}>
        {fmtDiff(s.pointDifferential)}
      </Text>
    </View>
  );
}

const tr = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 9, paddingHorizontal: 10,
    borderRadius: shape.cta, borderWidth: 1, marginBottom: 4,
  },
  rankCell: { width: RANK_COL, fontSize: text.chipValue.size, fontWeight: '800', textAlign: 'center' },
  playerCell: { width: PLAYER_COL, flexDirection: 'row', alignItems: 'center', gap: 7 },
  avatar: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: L.goldBg, borderWidth: 1.5, borderColor: L.goldBorder,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarGold: { borderColor: L.gold },
  avatarSilver: { borderColor: SILVER_BORDER, backgroundColor: SILVER_BG },
  avatarBronze: { borderColor: BRONZE_BORDER, backgroundColor: BRONZE_BG },
  avatarText: { fontSize: 8, fontWeight: '900', color: L.navy },
  playerName: { flex: 1, fontSize: text.chipValue.size, fontWeight: '800', color: L.navy },
  statCell: { width: STAT_COL, fontSize: text.chipValue.size, fontWeight: '800', color: L.navy, textAlign: 'center' },
  diffCell: { width: DIFF_COL, fontSize: 11, fontWeight: '800', textAlign: 'right' },
  diffPos: { color: L.success },
  diffNeg: { color: L.danger },
});

// ─── Action Row ───────────────────────────────────────────────────────────────

function ActionRow({
  icon, label, sub, onPress, last = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sub?: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[ar.row, !last && ar.border]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={ar.iconWrap}>
        <Ionicons name={icon} size={18} color={L.gold} />
      </View>
      <View style={ar.body}>
        <Text style={ar.label}>{label}</Text>
        {sub ? <Text style={ar.sub}>{sub}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={L.textSub} />
    </TouchableOpacity>
  );
}

const ar = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 16 },
  border: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border },
  iconWrap: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: L.goldBg, borderWidth: 1, borderColor: L.goldBorder,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  body: { flex: 1 },
  label: { fontSize: text.rowTitle.size, fontWeight: '700', color: L.navy },
  sub: { fontSize: text.caption.size, fontWeight: '500', color: L.textSub, marginTop: 1 },
});

// ─── Context menu ─────────────────────────────────────────────────────────────

const ALL_MENU_ITEMS = [
  { id: 'share',     label: 'Share Results',    icon: 'share-outline' },
  { id: 'export',    label: 'Export Results',   icon: 'download-outline' },
  { id: 'standings', label: 'View Standings',   icon: 'podium-outline' },
  { id: 'schedule',  label: 'View Schedule',    icon: 'calendar-outline' },
  { id: 'archive',   label: 'Archive Event',    icon: 'archive-outline' },
];

// Actions with no implementation behind them. They used to sit in the menu
// and answer with a "coming soon" alert; item 6.2's bar is that a visible CTA
// does something real, so in a production build they are simply not offered.
// Internal builds keep them visible so the gap stays obvious to QA.
const UNBUILT_MENU_IDS = new Set(['export', 'archive']);
const MENU_ITEMS = ALL_MENU_ITEMS.filter(
  (i) => IS_INTERNAL_BUILD || !UNBUILT_MENU_IDS.has(i.id),
);
const MENU_DANGER = { id: 'delete', label: 'Delete Event', icon: 'trash-outline' };

// ─── UUID detection ──────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function RRResultsScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const tournamentId = id ?? '';
  const isSupabase   = UUID_RE.test(tournamentId);

  // ── Supabase state ──
  const [sbTitle,    setSbTitle]    = useState<string | null>(null);
  const [sbLocation, setSbLocation] = useState<string | null>(null);
  const [sbDate,     setSbDate]     = useState<string | null>(null);

  // ── Rounds + standings ──
  const [rounds,    setRounds]    = useState<RRRound[]>(() =>
    isSupabase ? [] : (getSchedule(tournamentId) ?? []),
  );
  const [standings, setStandings] = useState<RRStanding[]>(() =>
    isSupabase ? [] : computeStandings(getSchedule(tournamentId) ?? []),
  );

  // Supabase: load matches + event meta on mount
  useEffect(() => {
    if (!isSupabase) return;
    Promise.all([
      fetchRoundRobinMatches(tournamentId),
      fetchPlayEventById(tournamentId),
    ])
      .then(([rows, ev]) => {
        const r = sbMatchesToRRRounds(rows);
        setRounds(r);
        setStandings(computeStandings(r));
        if (ev) {
          setSbTitle(ev.name);
          setSbLocation(ev.venue_name ?? ev.location);
          setSbDate(ev.event_date);
        }
      })
      .catch(() => {});
  }, [tournamentId, isSupabase]);

  useFocusEffect(useCallback(() => {
    if (isSupabase) {
      fetchRoundRobinMatches(tournamentId)
        .then(rows => {
          const r = sbMatchesToRRRounds(rows);
          setRounds(r);
          setStandings(computeStandings(r));
        })
        .catch(() => {});
    } else {
      const fresh = getSchedule(tournamentId) ?? [];
      setRounds(fresh);
      const s = computeStandings(fresh);
      setStandings(s);
      // Mark completed in local store
      const allMatches  = fresh.reduce((acc, r) => acc + r.matches.length, 0);
      const completedCt = fresh.reduce((acc, r) => acc + r.matches.filter(m => m.status === 'completed').length, 0);
      if (allMatches > 0 && completedCt === allMatches) {
        updateStatus('completed');
      }
    }
  }, [tournamentId, isSupabase]));

  // ── Derived display values ──
  const localRR       = getRoundRobin();
  const displayTitle  = isSupabase ? (sbTitle    ?? 'Round Robin')              : (localRR?.title        ?? 'Round Robin');
  const displayLoc    = isSupabase ? (sbLocation ?? '—')                        : (localRR?.locationName ?? '—');
  const displayDate   = isSupabase ? (sbDate     ?? new Date().toISOString())   : (localRR?.date         ?? '');

  // ── Derived ──
  const allMatches    = rounds.reduce((acc, r) => acc + r.matches.length, 0);
  const completedCt   = rounds.reduce((acc, r) => acc + r.matches.filter(m => m.status === 'completed').length, 0);
  const completePct   = allMatches > 0 ? Math.round((completedCt / allMatches) * 100) : 0;
  const completedList = rounds.flatMap(r => r.matches).filter(m => m.status === 'completed');

  const champion   = standings[0] ?? null;
  const runnerUp   = standings[1] ?? null;
  const thirdPlace = standings[2] ?? null;

  const mostWins   = standings.reduce<RRStanding | null>((b, s) => (!b || s.wins > b.wins) ? s : b, null);
  const bestDiff   = standings.reduce<RRStanding | null>((b, s) => (!b || s.pointDifferential > b.pointDifferential) ? s : b, null);
  const mostPts    = standings.reduce<RRStanding | null>((b, s) => (!b || s.pointsFor > b.pointsFor) ? s : b, null);

  const achievements = deriveAchievements(rounds, standings);

  // ── Share ──
  async function handleShare() {
    try {
      const champLine = champion ? `🏆 Champion: ${champion.playerName} (${champion.wins}-${champion.losses})` : '';
      const runLine   = runnerUp  ? `🥈 Runner-Up: ${runnerUp.playerName}` : '';
      await Share.share({
        message: [
          `${displayTitle} — Final Results`,
          `📅 ${displayDate ? fmtDate(displayDate) : ''}`,
          '',
          champLine,
          runLine,
          '',
          `${completedCt}/${allMatches} matches completed`,
        ].filter(Boolean).join('\n'),
        title: 'Round Robin Results',
      });
    } catch { /* dismissed */ }
  }

  // ── Context menu ──
  const [menuOpen, setMenuOpen] = useState(false);
  const menuAnim = useRef(new Animated.Value(0)).current;
  const menuOpacity     = menuAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const menuScale       = menuAnim.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] });
  const backdropOpacity = menuAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.18] });

  function openMenu() {
    setMenuOpen(true);
    Animated.timing(menuAnim, { toValue: 1, duration: 160, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }
  function closeMenu(cb?: () => void) {
    Animated.timing(menuAnim, { toValue: 0, duration: 120, easing: Easing.in(Easing.cubic), useNativeDriver: true })
      .start(() => { setMenuOpen(false); cb?.(); });
  }

  function handleMenuAction(menuId: string) {
    switch (menuId) {
      case 'share':     closeMenu(handleShare); break;
      case 'export':    closeMenu(() => comingSoon('Export Results')); break;
      case 'standings': closeMenu(() => router.push(`/round-robin/${tournamentId}/standings` as never)); break;
      case 'schedule':  closeMenu(() => router.push(`/round-robin/${tournamentId}/schedule` as never)); break;
      case 'archive':   closeMenu(() => comingSoon('Archive Event')); break;
      case 'delete':    closeMenu(() => Alert.alert(
        'Delete Event?',
        'This will permanently delete the event and all results.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => router.back() },
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
          <Text style={s.headerTitle}>Round Robin Results</Text>
          <Text style={s.headerSub}>Final Results</Text>
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
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── SECTION 1: CHAMPION HERO ── */}
        {champion && champion.matchesPlayed > 0 && (
          <View style={s.championCard}>
            <View style={s.championBadgeRow}>
              <View style={s.championBadge}>
                <Ionicons name="trophy" size={14} color={L.gold} />
                <Text style={s.championBadgeText}>Champion</Text>
              </View>
            </View>
            <View style={s.championAvatar}>
              <Text style={s.championAvatarText}>{champion.avatarInitials}</Text>
            </View>
            <Text style={s.championName}>{champion.playerName}</Text>
            <Text style={s.championRecord}>{champion.wins}–{champion.losses} Record</Text>
            <View style={s.championStats}>
              <View style={s.championStat}>
                <Text style={s.championStatValue}>{champion.wins}</Text>
                <Text style={s.championStatLabel}>Wins</Text>
              </View>
              <View style={s.championStatDivider} />
              <View style={s.championStat}>
                <Text style={s.championStatValue}>{champion.pointsFor}</Text>
                <Text style={s.championStatLabel}>Points For</Text>
              </View>
              <View style={s.championStatDivider} />
              <View style={s.championStat}>
                <Text style={[s.championStatValue, champion.pointDifferential >= 0 ? s.posVal : s.negVal]}>
                  {fmtDiff(champion.pointDifferential)}
                </Text>
                <Text style={s.championStatLabel}>Differential</Text>
              </View>
            </View>
          </View>
        )}

        {/* ── SECTION 2: PODIUM ── */}
        {(runnerUp || thirdPlace) && (
          <View style={s.card}>
            <View style={s.sectionHeader}>
              <Ionicons name="podium-outline" size={16} color={L.gold} />
              <Text style={s.sectionTitle}>Final Podium</Text>
            </View>

            {/* 2nd + 3rd row */}
            <View style={s.podiumRow}>
              {/* 2nd place */}
              {runnerUp && (
                <View style={[s.podiumTile, s.podiumSilver]}>
                  <Text style={s.podiumMedal}>🥈</Text>
                  <View style={[s.podiumAvatar, s.podiumAvatarSilver]}>
                    <Text style={s.podiumAvatarText}>{runnerUp.avatarInitials}</Text>
                  </View>
                  <Text style={s.podiumName} numberOfLines={1}>{runnerUp.playerName}</Text>
                  <Text style={s.podiumRecord}>{runnerUp.wins}–{runnerUp.losses}</Text>
                  <Text style={s.podiumPlace}>2nd Place</Text>
                </View>
              )}
              {/* 1st place — center, taller */}
              {champion && champion.matchesPlayed > 0 && (
                <View style={[s.podiumTile, s.podiumGold, s.podiumCenter]}>
                  <Text style={s.podiumMedal}>🏆</Text>
                  <View style={[s.podiumAvatar, s.podiumAvatarGold]}>
                    <Text style={[s.podiumAvatarText, s.podiumAvatarTextGold]}>
                      {champion.avatarInitials}
                    </Text>
                  </View>
                  <Text style={[s.podiumName, s.podiumNameGold]} numberOfLines={1}>
                    {champion.playerName}
                  </Text>
                  <Text style={[s.podiumRecord, s.podiumRecordGold]}>
                    {champion.wins}–{champion.losses}
                  </Text>
                  <Text style={[s.podiumPlace, s.podiumPlaceGold]}>1st Place</Text>
                </View>
              )}
              {/* 3rd place */}
              {thirdPlace && (
                <View style={[s.podiumTile, s.podiumBronze]}>
                  <Text style={s.podiumMedal}>🥉</Text>
                  <View style={[s.podiumAvatar, s.podiumAvatarBronze]}>
                    <Text style={s.podiumAvatarText}>{thirdPlace.avatarInitials}</Text>
                  </View>
                  <Text style={s.podiumName} numberOfLines={1}>{thirdPlace.playerName}</Text>
                  <Text style={s.podiumRecord}>{thirdPlace.wins}–{thirdPlace.losses}</Text>
                  <Text style={s.podiumPlace}>3rd Place</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* ── SECTION 3: SUMMARY ── */}
        <View style={s.card}>
          <View style={s.sectionHeader}>
            <Ionicons name="document-text-outline" size={16} color={L.gold} />
            <Text style={s.sectionTitle}>Event Summary</Text>
          </View>
          <View style={s.summaryGrid}>
            {[
              { label: 'Event',    value: displayTitle },
              { label: 'Location', value: displayLoc },
              { label: 'Date',     value: displayDate ? fmtDate(displayDate) : '—' },
              { label: 'Players',  value: `${standings.length}` },
              { label: 'Rounds',   value: `${rounds.length}` },
              { label: 'Matches',  value: `${completedCt} of ${allMatches} Completed` },
            ].map((row, i, arr) => (
              <View key={row.label} style={[s.summaryRow, i < arr.length - 1 && s.summaryRowBorder]}>
                <Text style={s.summaryLabel}>{row.label}</Text>
                <Text style={s.summaryValue} numberOfLines={1}>{row.value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── SECTION 4: FINAL LEADERBOARD ── */}
        <View style={s.card}>
          <View style={s.sectionHeader}>
            <Ionicons name="list-outline" size={16} color={L.gold} />
            <Text style={s.sectionTitle}>Final Leaderboard</Text>
          </View>
          {/* Column headers */}
          <View style={s.tableHeader}>
            <Text style={[s.tableHeaderCell, { width: RANK_COL }]}>#</Text>
            <Text style={[s.tableHeaderCell, { width: PLAYER_COL }]}>Player</Text>
            <Text style={[s.tableHeaderCell, { width: STAT_COL }]}>W</Text>
            <Text style={[s.tableHeaderCell, { width: STAT_COL }]}>L</Text>
            <Text style={[s.tableHeaderCell, { width: STAT_COL }]}>PF</Text>
            <Text style={[s.tableHeaderCell, { width: STAT_COL }]}>PA</Text>
            <Text style={[s.tableHeaderCell, { width: DIFF_COL, textAlign: 'right' }]}>+/-</Text>
          </View>
          {standings.length === 0 ? (
            <View style={s.emptyTable}><Text style={s.emptyText}>No results yet.</Text></View>
          ) : (
            standings.map(st => <StandingRow key={st.playerId} s={st} />)
          )}
        </View>

        {/* ── SECTION 5: PERFORMANCE AWARDS ── */}
        {(mostWins || bestDiff || mostPts) && (
          <View style={s.card}>
            <View style={s.sectionHeader}>
              <Ionicons name="ribbon-outline" size={16} color={L.gold} />
              <Text style={s.sectionTitle}>Performance Awards</Text>
            </View>
            <View style={s.awardsRow}>
              {mostWins && (
                <View style={s.awardTile}>
                  <View style={s.awardIcon}>
                    <Ionicons name="trophy-outline" size={16} color={L.gold} />
                  </View>
                  <Text style={s.awardCategory}>MOST WINS</Text>
                  <Text style={s.awardName} numberOfLines={1}>{mostWins.playerName}</Text>
                  <Text style={s.awardValue}>{mostWins.wins}</Text>
                </View>
              )}
              {bestDiff && (
                <View style={s.awardTile}>
                  <View style={s.awardIcon}>
                    <Ionicons name="trending-up-outline" size={16} color={L.gold} />
                  </View>
                  <Text style={s.awardCategory}>BEST DIFF</Text>
                  <Text style={s.awardName} numberOfLines={1}>{bestDiff.playerName}</Text>
                  <Text style={s.awardValue}>{fmtDiff(bestDiff.pointDifferential)}</Text>
                </View>
              )}
              {mostPts && (
                <View style={s.awardTile}>
                  <View style={s.awardIcon}>
                    <Ionicons name="flash-outline" size={16} color={L.gold} />
                  </View>
                  <Text style={s.awardCategory}>MOST POINTS</Text>
                  <Text style={s.awardName} numberOfLines={1}>{mostPts.playerName}</Text>
                  <Text style={s.awardValue}>{mostPts.pointsFor}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* ── SECTION 6: PLAYER ACHIEVEMENTS ── */}
        {achievements.length > 0 && (
          <View style={s.card}>
            <View style={s.sectionHeader}>
              <Ionicons name="star-outline" size={16} color={L.gold} />
              <Text style={s.sectionTitle}>Player Achievements</Text>
            </View>
            <View style={s.achieveList}>
              {achievements.map((a, i) => (
                <View
                  key={a.id}
                  style={[s.achieveRow, i < achievements.length - 1 && s.achieveRowBorder]}
                >
                  <View style={s.achieveIconWrap}>
                    <Ionicons name={a.icon} size={16} color={L.gold} />
                  </View>
                  <View style={s.achieveBody}>
                    <Text style={s.achieveLabel}>{a.label}</Text>
                    {a.playerName ? (
                      <Text style={s.achievePlayer}>{a.playerName}</Text>
                    ) : null}
                    <Text style={s.achieveDetail}>{a.detail}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── SECTION 7: MATCH HISTORY ── */}
        {completedList.length > 0 && (
          <View style={s.card}>
            <View style={s.sectionHeader}>
              <Ionicons name="time-outline" size={16} color={L.gold} />
              <Text style={s.sectionTitle}>Match History</Text>
            </View>
            {rounds.filter(r => r.matches.some(m => m.status === 'completed')).map(round => (
              <View key={round.id} style={s.historyRound}>
                <Text style={s.historyRoundLabel}>Round {round.roundNumber}</Text>
                {round.matches
                  .filter(m => m.status === 'completed')
                  .map(m => {
                    const winnerName = m.winnerId === m.player1?.id ? m.player1?.name : m.player2?.name;
                    const loserName  = m.winnerId === m.player1?.id ? m.player2?.name : m.player1?.name;
                    const wScore     = m.winnerId === m.player1?.id ? m.score1 : m.score2;
                    const lScore     = m.winnerId === m.player1?.id ? m.score2 : m.score1;
                    return (
                      <View key={m.id} style={s.historyMatch}>
                        <View style={s.historyMatchLeft}>
                          <Text style={s.historyWinner} numberOfLines={1}>
                            {winnerName ?? '—'}
                          </Text>
                          <Text style={s.historyDef}> def. </Text>
                          <Text style={s.historyLoser} numberOfLines={1}>
                            {loserName ?? '—'}
                          </Text>
                        </View>
                        <Text style={s.historyScore}>
                          {wScore}–{lScore}
                        </Text>
                      </View>
                    );
                  })}
              </View>
            ))}
          </View>
        )}

        {/* ── SECTION 8: RESULTS SNAPSHOT ── */}
        <View style={s.snapshotCard}>
          <View style={s.sectionHeader}>
            <Ionicons name="checkmark-circle-outline" size={16} color={L.gold} />
            <Text style={s.sectionTitle}>Results Snapshot</Text>
          </View>
          <View style={s.snapshotGrid}>
            <View style={s.snapshotTile}>
              <Text style={s.snapshotLabel}>Champion</Text>
              <Text style={s.snapshotValue} numberOfLines={1}>
                {champion?.playerName ?? '—'}
              </Text>
            </View>
            <View style={s.snapshotDivider} />
            <View style={s.snapshotTile}>
              <Text style={s.snapshotLabel}>Runner-Up</Text>
              <Text style={s.snapshotValue} numberOfLines={1}>
                {runnerUp?.playerName ?? '—'}
              </Text>
            </View>
            <View style={s.snapshotDivider} />
            <View style={s.snapshotTile}>
              <Text style={s.snapshotLabel}>Completion</Text>
              <Text style={[s.snapshotValue, completePct === 100 && s.snapshotValueDone]}>
                {completePct}%
              </Text>
            </View>
          </View>
          <View style={s.snapshotBar}>
            <View style={[s.snapshotBarFill, { width: `${completePct}%` }]} />
          </View>
          <Text style={s.snapshotBarLabel}>
            {completedCt} of {allMatches} Matches Completed
          </Text>
        </View>

        {/* ── SECTION 9: SHARE ── */}
        <PrimaryButton
          label="Share Results"
          icon="share-outline"
          onPress={handleShare}
        />

        {/* ── SECTION 10: REMATCH ── */}
        <SecondaryButton
          label="Create New Round Robin"
          icon="refresh-outline"
          onPress={() => router.push('/create-round-robin' as never)}
        />

        {/* ── SECTION 11: MANAGEMENT ACTIONS ── */}
        <View style={[s.card, { padding: 0 }]}>
          <ActionRow
            icon="podium-outline"
            label="View Standings"
            sub="See full rankings and stats"
            onPress={() => router.push(`/round-robin/${tournamentId}/standings` as never)}
          />
          <ActionRow
            icon="calendar-outline"
            label="View Schedule"
            sub="Browse all matches and results"
            onPress={() => router.push(`/round-robin/${tournamentId}/schedule` as never)}
          />
          <ActionRow
            icon="share-outline"
            label="Share Results"
            onPress={handleShare}
          />
          <ActionRow
            icon="refresh-outline"
            label="Create New Round Robin"
            onPress={() => router.push('/create-round-robin' as never)}
          />
          {IS_INTERNAL_BUILD && (
            <ActionRow
              icon="archive-outline"
              label="Archive Event"
              onPress={() => comingSoon('Archive Event')}
              last
            />
          )}
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
              onPress={() => handleMenuAction('delete')}
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
    paddingHorizontal: spacing.screenH, paddingBottom: 10,
    backgroundColor: L.page,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 60 },
  backText: { fontSize: 17, color: '#007AFF', fontWeight: '400' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: text.body.size, fontWeight: '500', color: L.navy },
  headerSub: { fontSize: 11, color: L.textSub, marginTop: 1 },
  headerActions: { flexDirection: 'row', gap: 4, minWidth: 60, justifyContent: 'flex-end' },
  headerIconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },

  scroll: { paddingHorizontal: spacing.screenH, paddingTop: spacing.md, gap: 14 },

  // ── Champion hero ──
  championCard: {
    backgroundColor: L.goldLight,
    borderRadius: shape.card,
    borderWidth: 1.5, borderColor: L.goldBorder,
    padding: spacing.lg,
    alignItems: 'center', gap: 6,
  },
  championBadgeRow: { width: '100%', alignItems: 'center', marginBottom: 4 },
  championBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: L.navy, borderRadius: shape.pill,
    paddingHorizontal: 14, paddingVertical: 5,
  },
  championBadgeText: { fontSize: text.chipValue.size, fontWeight: '800', color: L.gold, letterSpacing: 0.5 },
  championAvatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: L.goldBg, borderWidth: 3, borderColor: L.gold,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  championAvatarText: { fontSize: 22, fontWeight: '900', color: L.navy },
  championName: { fontSize: text.cardTitle.size, fontWeight: '800', color: L.navy },
  championRecord: { fontSize: text.caption.size, fontWeight: '500', color: L.textSub, marginBottom: 4 },
  championStats: {
    flexDirection: 'row', alignItems: 'center', gap: 0,
    backgroundColor: L.bg, borderRadius: shape.cta, borderWidth: 1, borderColor: L.goldBorder,
    paddingVertical: 10, width: '100%', marginTop: 6,
  },
  championStat: { flex: 1, alignItems: 'center' },
  championStatDivider: { width: 1, height: 28, backgroundColor: L.goldBorder },
  championStatValue: { fontSize: text.statValueSm.size, fontWeight: '900', color: L.navy },
  championStatLabel: { fontSize: 10, color: L.textSub, marginTop: 2 },
  posVal: { color: L.success },
  negVal: { color: L.danger },

  // ── Card ──
  card: {
    backgroundColor: L.bg, borderRadius: shape.card,
    borderWidth: 1, borderColor: L.border, padding: spacing.md, gap: 12,
    overflow: 'hidden',
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: text.body.size, fontWeight: '500', color: L.navy },

  // ── Podium ──
  podiumRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
  },
  podiumTile: {
    flex: 1, alignItems: 'center', gap: 5,
    borderRadius: shape.panel, borderWidth: 1,
    paddingVertical: 14, paddingHorizontal: 8,
  },
  podiumGold: { backgroundColor: L.goldLight, borderColor: L.goldBorder },
  podiumSilver: { backgroundColor: SILVER_BG,   borderColor: SILVER_BORDER },
  podiumBronze: { backgroundColor: BRONZE_BG,   borderColor: BRONZE_BORDER },
  podiumCenter: { paddingVertical: 20 },

  podiumMedal: { fontSize: 22 },
  podiumAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: L.goldBg, borderWidth: 1.5, borderColor: L.goldBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  podiumAvatarGold: { borderColor: L.gold },
  podiumAvatarSilver: { borderColor: SILVER_BORDER, backgroundColor: SILVER_BG },
  podiumAvatarBronze: { borderColor: BRONZE_BORDER, backgroundColor: BRONZE_BG },
  podiumAvatarText: { fontSize: 10, fontWeight: '900', color: L.navy },
  podiumAvatarTextGold: { fontSize: 12 },

  podiumName: { fontSize: 11, fontWeight: '800', color: L.navy, textAlign: 'center' },
  podiumNameGold: { fontSize: text.caption.size, fontWeight: '500' },
  podiumRecord: { fontSize: 11, color: L.textSub },
  podiumRecordGold: { fontWeight: '700', color: L.navy },
  podiumPlace: { fontSize: 10, color: L.textSub, fontWeight: '700' },
  podiumPlaceGold: { color: L.gold },

  // ── Summary ──
  summaryGrid: { gap: 0 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  summaryRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border },
  summaryLabel: { flex: 1, fontSize: text.caption.size, color: L.textSub, fontWeight: '500' },
  summaryValue: { flex: 2, fontSize: text.fieldLabel.size, color: L.navy, fontWeight: '800', textAlign: 'right' },

  // ── Table ──
  tableHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingBottom: 8, marginBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  tableHeaderCell: { fontSize: 10, fontWeight: '800', color: L.textSub, letterSpacing: 0.5, textAlign: 'center' },
  emptyTable: { paddingVertical: 20, alignItems: 'center' },
  emptyText: { fontSize: text.caption.size, fontWeight: '500', color: L.textSub },

  // ── Awards ──
  awardsRow: { flexDirection: 'row', gap: 8 },
  awardTile: {
    flex: 1, alignItems: 'center', gap: 4,
    backgroundColor: L.page, borderRadius: shape.panel,
    borderWidth: 1, borderColor: L.border,
    padding: 12,
  },
  awardIcon: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: L.goldBg, borderWidth: 1, borderColor: L.goldBorder,
    alignItems: 'center', justifyContent: 'center', marginBottom: 2,
  },
  awardCategory: { fontSize: 9, fontWeight: '800', color: L.textSub, letterSpacing: 0.5, textAlign: 'center' },
  awardName: { fontSize: text.chipValue.size, fontWeight: '800', color: L.navy, textAlign: 'center' },
  awardValue: { fontSize: text.actionLarge.size, fontWeight: '800', color: L.gold },

  // ── Achievements ──
  achieveList: { gap: 0 },
  achieveRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  achieveRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border },
  achieveIconWrap: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: L.goldBg, borderWidth: 1, borderColor: L.goldBorder,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  achieveBody: { flex: 1 },
  achieveLabel: { fontSize: text.fieldLabel.size, fontWeight: '800', color: L.navy },
  achievePlayer: { fontSize: text.caption.size, fontWeight: '500', color: L.textSub, marginTop: 1 },
  achieveDetail: { fontSize: text.caption.size, fontWeight: '500', color: L.textSub },

  // ── Match History ──
  historyRound: { marginBottom: 12 },
  historyRoundLabel: {
    fontSize: text.chipValue.size, fontWeight: '800', color: L.textSub,
    letterSpacing: 0.4, marginBottom: 6,
  },
  historyMatch: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: L.page, borderRadius: shape.cta,
    paddingHorizontal: 12, paddingVertical: 8,
    marginBottom: 4,
  },
  historyMatchLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  historyWinner: { fontSize: text.fieldLabel.size, fontWeight: '800', color: L.navy, flexShrink: 1 },
  historyDef: { fontSize: text.caption.size, fontWeight: '500', color: L.textSub, fontStyle: 'italic' },
  historyLoser: { fontSize: text.caption.size, fontWeight: '500', color: L.textSub, flexShrink: 1 },
  historyScore: { fontSize: text.rowValue.size, fontWeight: '800', color: L.navy, marginLeft: 8 },

  // ── Snapshot ──
  snapshotCard: {
    backgroundColor: L.goldLight,
    borderRadius: shape.card,
    borderWidth: 1.5, borderColor: L.goldBorder,
    padding: spacing.md, gap: 10,
  },
  snapshotGrid: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: L.bg, borderRadius: shape.cta,
    borderWidth: 1, borderColor: L.goldBorder,
    paddingVertical: 12,
  },
  snapshotTile: { flex: 1, alignItems: 'center' },
  snapshotDivider: { width: 1, height: 28, backgroundColor: L.goldBorder },
  snapshotLabel: { fontSize: 10, fontWeight: '700', color: L.textSub, marginBottom: 3 },
  snapshotValue: { fontSize: text.rowValue.size, fontWeight: '800', color: L.navy },
  snapshotValueDone: { color: L.success },
  snapshotBar: {
    height: 6, borderRadius: 3, backgroundColor: L.border, overflow: 'hidden',
  },
  snapshotBarFill: { height: '100%', borderRadius: 3, backgroundColor: L.gold },
  snapshotBarLabel: { fontSize: 11, color: L.textSub, textAlign: 'center' },
});

// ─── Context menu ─────────────────────────────────────────────────────────────

const mm = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0A1228', zIndex: 30 },
  popover: {
    position: 'absolute', width: 256,
    backgroundColor: '#FFFFFF', borderRadius: 22, paddingVertical: 5, zIndex: 31,
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
    paddingHorizontal: 8, marginHorizontal: 5, borderRadius: 11, height: 50,
  },
  rowFirst: { marginTop: 4 },
  iconWrap: {
    width: 32, height: 32, borderRadius: 9, backgroundColor: '#F3F6FC',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  rowLabel: { color: L.navy, fontSize: text.rowTitle.size, fontWeight: '700' },
  rowLabelDanger: { color: L.danger },
  divider: {
    height: StyleSheet.hairlineWidth, backgroundColor: L.border, marginHorizontal: 10, marginVertical: 3,
  },
});
