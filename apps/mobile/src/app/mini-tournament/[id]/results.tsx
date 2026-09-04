import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Share, Alert, Animated, Easing, } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing } from '@/theme';
import { LoadingState } from '@/components/states/ScreenState';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { StatusChip } from '@/components/StatusChip';
import { AppIcon, type AppIconName } from '@/components';
import { getMiniTournament } from '@/lib/miniTournamentStore';
import { getBracket } from '@/lib/bracketStore';
import type { BMatch, BParticipant } from '@/lib/bracketTypes';
import { isTeam } from '@/lib/bracketTypes';
import { fetchMiniTournamentMatches, sbMatchesToBracket } from '@/lib/supabase/miniTournament';
import { fetchPlayEventById, completePlayEvent } from '@/lib/supabase/playEvents';

// ─── Theme ───────────────────────────────────────────────────────────────────────

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
  danger:     colors.danger,
};

const SILVER  = '#8E9EAB';
const BRONZE  = '#C07D4A';

// ─── Helpers ─────────────────────────────────────────────────────────────────────

function getRoundLabel(roundIdx: number, totalRounds: number): string {
  const fromEnd = totalRounds - 1 - roundIdx;
  if (fromEnd === 0) return 'Final';
  if (fromEnd === 1) return 'Semifinals';
  if (fromEnd === 2) return 'Quarterfinals';
  return `Round ${roundIdx + 1}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getWinner(match: BMatch): BParticipant | null {
  if (!match.winnerId) return null;
  return match.player1?.id === match.winnerId ? match.player1 : match.player2 ?? null;
}

function getLoser(match: BMatch): BParticipant | null {
  if (!match.winnerId) return null;
  return match.player1?.id === match.winnerId ? match.player2 : match.player1 ?? null;
}

// Safe field accessors for BParticipant (works for both BPlayer and BTeam)
function pInitials(p: BParticipant): string {
  return isTeam(p) ? (p.players[0].avatarInitials + p.players[1].avatarInitials[0]).slice(0, 3) : p.avatarInitials;
}
function pDupr(p: BParticipant): string {
  return isTeam(p) ? `Avg ${p.avgDupr.toFixed(1)} DUPR` : `${p.dupr} DUPR`;
}
function pCity(p: BParticipant): string {
  return isTeam(p) ? '' : p.city;
}

function winnerScore(match: BMatch): number | undefined {
  if (!match.winnerId) return undefined;
  return match.player1?.id === match.winnerId ? match.score1 : match.score2;
}

function loserScore(match: BMatch): number | undefined {
  if (!match.winnerId) return undefined;
  return match.player1?.id === match.winnerId ? match.score2 : match.score1;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Context menu ────────────────────────────────────────────────────────────────

const MENU_ITEMS = [
  { id: 'share',   label: 'Share Results',       icon: 'share-outline' },
  { id: 'export',  label: 'Export Results',       icon: 'download-outline' },
  { id: 'bracket', label: 'View Bracket',         icon: 'git-network-outline' },
  { id: 'rematch', label: 'Create Rematch',       icon: 'refresh-outline' },
  { id: 'archive', label: 'Archive Tournament',   icon: 'archive-outline' },
];

// ─── Screen ──────────────────────────────────────────────────────────────────────

export default function ResultsScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isSupabase = UUID_RE.test(id ?? '');

  // ── Supabase state ──
  const [sbBracket,  setSbBracket]  = useState<BMatch[][] | null>(null);
  const [sbTitle,    setSbTitle]    = useState<string | null>(null);
  const [sbLocation, setSbLocation] = useState<string | null>(null);
  const [sbDate,     setSbDate]     = useState<string | null>(null);
  const [sbMax,      setSbMax]      = useState<number>(16);
  const [loadingResults, setLoadingResults] = useState(isSupabase);
  const completionFiredRef = useRef(false);

  function fetchSb() {
    return Promise.all([
      fetchMiniTournamentMatches(id!),
      fetchPlayEventById(id!),
    ]).then(([rows, ev]) => {
      const bkt = sbMatchesToBracket(rows);
      setSbBracket(bkt);
      if (ev) {
        setSbTitle(ev.name);
        setSbLocation(ev.venue_name ?? ev.location);
        setSbDate(ev.event_date);
        setSbMax(ev.max_players);
        if (!completionFiredRef.current && ev.status !== 'completed') {
          const finalM = bkt[bkt.length - 1]?.[0] ?? null;
          if (finalM?.status === 'completed') {
            completionFiredRef.current = true;
            completePlayEvent(id!).catch(() => {});
          }
        }
      }
    });
  }

  useEffect(() => {
    if (!isSupabase) return;
    setLoadingResults(true);
    // Was swallowed: a failed load rendered as "no results yet" rather than as
    // a failure (item 6.3). Logged so it reaches Sentry at minimum.
    fetchSb()
      .catch((err) => console.error('[mini-tournament/results] load failed', err))
      .finally(() => setLoadingResults(false));
  }, [id, isSupabase]);

  useFocusEffect(useCallback(() => {
    if (!isSupabase) return;
    fetchSb().catch((err) => console.error('[mini-tournament/results] refresh failed', err));
  }, [id, isSupabase]));

  // ── Local state (non-UUID path) ──
  const tournament = getMiniTournament();

  // ── Resolved bracket + meta ──
  const bracket: BMatch[][] = isSupabase ? (sbBracket ?? []) : (getBracket(id ?? '') ?? []);
  const title       = isSupabase ? (sbTitle    ?? 'Mini Tournament')         : (tournament?.title        ?? 'Mini Tournament');
  const location    = isSupabase ? (sbLocation ?? '—')                       : (tournament?.locationName ?? 'Lakewood Ranch Courts');
  const dateStr     = isSupabase ? (sbDate ? fmtDate(sbDate) : '—')         : (tournament?.date ? fmtDate(tournament.date) : 'Jul 12, 2025');
  const tType       = 'Single Elimination';
  const matchFormat = isSupabase ? '1 Game to 11 (Win by 2)'                : (tournament?.matchFormat  ?? '1 Game to 11 (Win by 2)');
  const maxPlayers  = isSupabase ? sbMax                                     : (tournament?.maxPlayers   ?? 16);

  // ── Derived results ──────────────────────────────────────────────────────────

  const totalRounds  = bracket.length;
  const finalMatch   = bracket[totalRounds - 1]?.[0] ?? null;
  const champion     = finalMatch ? getWinner(finalMatch) : null;
  const runnerUp     = finalMatch ? getLoser(finalMatch)  : null;

  // SF round (second-to-last) → losers are 3rd/4th
  const sfRound      = totalRounds >= 2 ? (bracket[totalRounds - 2] ?? []) : [];
  const sfLosers     = sfRound
    .filter(m => m.status === 'completed')
    .map(m => getLoser(m))
    .filter((p): p is BParticipant => p !== null);
  const thirdPlace   = sfLosers.find(p => p.id !== runnerUp?.id) ?? sfLosers[0] ?? null;

  const completedMatches = bracket.flat().filter(m => m.status === 'completed');
  const championWins     = completedMatches.filter(m => m.winnerId === champion?.id).length;

  // Final match scores
  const champScore   = finalMatch ? winnerScore(finalMatch) : undefined;
  const runnerScore  = finalMatch ? loserScore(finalMatch)  : undefined;

  // ── Context menu ─────────────────────────────────────────────────────────────

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
    if (menuId === 'share')   { closeMenu(handleShare); return; }
    if (menuId === 'bracket') { closeMenu(() => router.back()); return; }
    if (menuId === 'rematch') { closeMenu(handleRematch); return; }
    if (menuId === 'archive') { closeMenu(handleArchive); return; }
    closeMenu();
  }

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function handleShare() {
    const text = [
      `🏆 ${title} — Results`,
      `Champion: ${champion?.name ?? 'TBD'}`,
      champion ? pDupr(champion) : '',
      `Players: ${maxPlayers}`,
      `Type: ${tType}`,
      `Completed: ${dateStr}`,
      '',
      'Powered by Pickleball App',
    ].filter(Boolean).join('\n');
    try {
      await Share.share({ message: text, title });
    } catch { /* dismissed */ }
  }

  function handleRematch() {
    Alert.alert(
      'Create Rematch',
      'Rematch tournaments will be pre-populated with the same settings in a future update.',
      [{ text: 'Got It' }],
    );
  }

  function handleArchive() {
    Alert.alert(
      'Archive Tournament',
      'This tournament will be moved to your archive.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Archive', onPress: () => router.back() },
      ],
    );
  }

  // ── Loading state ────────────────────────────────────────────────────────────

  if (loadingResults) {
    return (
      <View style={[s.root, s.center]}>
        <StatusBar style="dark" />
        <LoadingState inline label="Loading results…" />
      </View>
    );
  }

  // ── Not complete guard ───────────────────────────────────────────────────────

  if (!champion) {
    return (
      <View style={s.root}>
        <StatusBar style="dark" />
        <View style={[s.header, { paddingTop: insets.top }]}>
          <TouchableOpacity style={s.headerBtn} onPress={() => router.back()} activeOpacity={0.6}>
            <Ionicons name="chevron-back" size={22} color={L.navy} />
          </TouchableOpacity>
          <View style={s.headerCenter}>
            <Text style={s.headerTitle}>Tournament Results</Text>
            <Text style={s.headerSub}>Completed Tournament</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>
        <View style={s.emptyWrap}>
          <Ionicons name="hourglass-outline" size={44} color={L.textSub} />
          <Text style={s.emptyTitle}>Results Not Available</Text>
          <Text style={s.emptySub}>Complete all bracket matches to view tournament results.</Text>
          <TouchableOpacity style={s.emptyBtn} onPress={() => router.back()} activeOpacity={0.85}>
            <Text style={s.emptyBtnText}>View Bracket</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <View style={s.root}>
      <StatusBar style="dark" />

      {/* ── HEADER ── */}
      <View style={[s.header, { paddingTop: insets.top }]}>
        <TouchableOpacity style={s.headerBtn} onPress={() => router.back()} activeOpacity={0.6}>
          <Ionicons name="chevron-back" size={22} color={L.navy} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>Tournament Results</Text>
          <Text style={s.headerSub}>Completed Tournament</Text>
        </View>
        <View style={s.headerRight}>
          <TouchableOpacity style={s.headerBtn} onPress={handleShare} activeOpacity={0.7}>
            <Ionicons name="share-outline" size={22} color={L.navy} />
          </TouchableOpacity>
          <TouchableOpacity style={s.headerBtn} onPress={openMenu} activeOpacity={0.7}>
            <Ionicons name="ellipsis-horizontal" size={22} color={L.navy} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── COMPLETE BANNER ── */}
        <View style={s.completeBanner}>
          <View style={s.completeDot} />
          <Text style={s.completeText}>Tournament Complete · Champion Crowned</Text>
        </View>

        {/* ── 1. CHAMPION HERO ── */}
        <View style={s.heroCard}>
          <View style={s.heroTop}>
            <Ionicons name="trophy" size={36} color={L.gold} />
            <Text style={s.heroTopLabel}>CHAMPION</Text>
          </View>
          <View style={s.heroBody}>
            <View style={s.heroAvatar}>
              <Text style={s.heroAvatarText}>{pInitials(champion)}</Text>
            </View>
            <Text style={s.heroName}>{champion.name}</Text>
            <Text style={s.heroMeta}>{pDupr(champion)}</Text>
            {pCity(champion) ? <Text style={s.heroCity}>{pCity(champion)}</Text> : null}
            {champScore !== undefined && runnerScore !== undefined && (
              <View style={s.heroScore}>
                <Text style={s.heroScoreText}>Final: {champScore} – {runnerScore}</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── 2. PODIUM ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Podium</Text>

          {/* 1st Place */}
          <View style={[s.podiumRow, s.podiumRowFirst]}>
            <View style={[s.medalBadge, { backgroundColor: L.goldBg, borderColor: L.goldBorder }]}>
              <Text style={[s.medalText, { color: L.gold }]}>1</Text>
            </View>
            <View style={s.podiumAvatar}>
              <Text style={s.podiumAvatarText}>{pInitials(champion)}</Text>
            </View>
            <View style={s.podiumBody}>
              <Text style={s.podiumName}>{champion.name}</Text>
              <Text style={s.podiumMeta}>{pDupr(champion)}{pCity(champion) ? ` · ${pCity(champion)}` : ''}</Text>
            </View>
            <StatusChip label="Champion" variant="gold" />
          </View>

          {/* 2nd Place */}
          {runnerUp && (
            <View style={[s.podiumRow, s.podiumBorder]}>
              <View style={[s.medalBadge, { backgroundColor: '#EEF0F2', borderColor: SILVER }]}>
                <Text style={[s.medalText, { color: SILVER }]}>2</Text>
              </View>
              <View style={[s.podiumAvatar, { backgroundColor: '#EEF0F2', borderColor: SILVER }]}>
                <Text style={[s.podiumAvatarText, { color: SILVER }]}>{pInitials(runnerUp)}</Text>
              </View>
              <View style={s.podiumBody}>
                <Text style={s.podiumName}>{runnerUp.name}</Text>
                <Text style={s.podiumMeta}>{pDupr(runnerUp)}{pCity(runnerUp) ? ` · ${pCity(runnerUp)}` : ''}</Text>
              </View>
              <Text style={[s.podiumPlace, { color: SILVER }]}>Runner-Up</Text>
            </View>
          )}

          {/* 3rd Place */}
          {thirdPlace && (
            <View style={[s.podiumRow, s.podiumBorder]}>
              <View style={[s.medalBadge, { backgroundColor: '#FBF0E7', borderColor: BRONZE }]}>
                <Text style={[s.medalText, { color: BRONZE }]}>3</Text>
              </View>
              <View style={[s.podiumAvatar, { backgroundColor: '#FBF0E7', borderColor: BRONZE }]}>
                <Text style={[s.podiumAvatarText, { color: BRONZE }]}>{pInitials(thirdPlace)}</Text>
              </View>
              <View style={s.podiumBody}>
                <Text style={s.podiumName}>{thirdPlace.name}</Text>
                <Text style={s.podiumMeta}>{pDupr(thirdPlace)}{pCity(thirdPlace) ? ` · ${pCity(thirdPlace)}` : ''}</Text>
              </View>
              <Text style={[s.podiumPlace, { color: BRONZE }]}>3rd Place</Text>
            </View>
          )}
        </View>

        {/* ── 3. TOURNAMENT SUMMARY ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Tournament Summary</Text>
          {[
            { icon: 'trophy-outline',        label: title },
            { icon: 'git-network-outline',   label: tType },
            { icon: 'location-outline',      label: location },
            { icon: 'calendar-outline',      label: `Completed ${dateStr}` },
            { icon: 'people-outline',        label: `${maxPlayers} Players` },
            { icon: 'checkmark-circle-outline', label: `${completedMatches.length} Matches Played` },
            { icon: 'pickleball',    label: matchFormat },
          ].map((row, i) => (
            <View key={i} style={[s.summaryRow, i > 0 && s.summaryRowBorder]}>
              <AppIcon name={row.icon as AppIconName} size={14} color={L.textSub} />
              <Text style={s.summaryText} numberOfLines={1}>{row.label}</Text>
            </View>
          ))}
        </View>

        {/* ── 4. STATS ── */}
        <View style={s.statsRow}>
          {[
            { icon: 'checkbox-outline',      value: `${completedMatches.length}`, label: 'Matches' },
            { icon: 'people-outline',        value: `${maxPlayers}`,              label: 'Players' },
            { icon: 'layers-outline',        value: `${totalRounds}`,             label: 'Rounds' },
            { icon: 'trophy-outline',        value: `${championWins}`,            label: 'Champ Wins' },
          ].map(item => (
            <View key={item.label} style={s.statPill}>
              <Ionicons name={item.icon as never} size={14} color={L.gold} />
              <Text style={s.statVal}>{item.value}</Text>
              <Text style={s.statLabel}>{item.label}</Text>
            </View>
          ))}
        </View>

        {/* ── 5. MATCH HISTORY ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Match Results</Text>
          {bracket.map((round, rIdx) => {
            const roundMatches = round.filter(m => m.status === 'completed');
            if (roundMatches.length === 0) return null;
            return (
              <View key={rIdx}>
                <Text style={s.historyRoundLabel}>{getRoundLabel(rIdx, totalRounds)}</Text>
                {roundMatches.map((m, mIdx) => {
                  const w    = getWinner(m);
                  const l    = getLoser(m);
                  const wSc  = winnerScore(m);
                  const lSc  = loserScore(m);
                  if (!w || !l) return null;
                  return (
                    <View key={m.id} style={[s.historyRow, mIdx > 0 && s.historyRowBorder]}>
                      <View style={s.historyLeft}>
                        <Text style={s.historyWinner} numberOfLines={1}>{w.name}</Text>
                        <Text style={s.historyDef} numberOfLines={1}>
                          def. {l.name}
                        </Text>
                      </View>
                      {wSc !== undefined && lSc !== undefined && (
                        <Text style={s.historyScore}>{wSc}–{lSc}</Text>
                      )}
                    </View>
                  );
                })}
              </View>
            );
          })}
        </View>

        {/* ── 6. BRACKET SNAPSHOT ── */}
        {finalMatch && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Final Match</Text>
            <View style={s.snapshotCard}>
              {/* Champion row */}
              <View style={s.snapshotRow}>
                <View style={[s.snapshotAvatar, s.snapshotAvatarGold]}>
                  <Text style={[s.snapshotAvatarText, { color: L.gold }]}>{pInitials(champion)}</Text>
                </View>
                <Text style={[s.snapshotName, s.snapshotNameWinner]} numberOfLines={1}>{champion.name}</Text>
                <Text style={s.snapshotScore}>{champScore ?? '—'}</Text>
              </View>
              <View style={s.snapshotDivider} />
              {/* Runner-up row */}
              {runnerUp && (
                <View style={[s.snapshotRow, { opacity: 0.5 }]}>
                  <View style={s.snapshotAvatar}>
                    <Text style={s.snapshotAvatarText}>{pInitials(runnerUp)}</Text>
                  </View>
                  <Text style={s.snapshotName} numberOfLines={1}>{runnerUp.name}</Text>
                  <Text style={s.snapshotScore}>{runnerScore ?? '—'}</Text>
                </View>
              )}
            </View>
            <TouchableOpacity
              style={s.viewBracketBtn}
              onPress={() => router.back()}
              activeOpacity={0.8}
            >
              <Ionicons name="git-network-outline" size={14} color={L.navy} />
              <Text style={s.viewBracketText}>View Full Bracket</Text>
              <Ionicons name="chevron-forward" size={14} color={L.textSub} style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>
          </View>
        )}

        {/* ── 7. SHARE RESULTS ── */}
        <TouchableOpacity style={s.primaryBtn} onPress={handleShare} activeOpacity={0.85}>
          <Ionicons name="share-outline" size={18} color={L.white} />
          <Text style={s.primaryBtnText}>Share Results</Text>
        </TouchableOpacity>

        {/* ── 8. REMATCH ── */}
        <TouchableOpacity style={s.secondaryBtn} onPress={handleRematch} activeOpacity={0.8}>
          <Ionicons name="refresh-outline" size={18} color={L.navy} />
          <Text style={s.secondaryBtnText}>Create Rematch Tournament</Text>
        </TouchableOpacity>

        {/* ── 9. MANAGEMENT ROWS ── */}
        <View style={s.card}>
          {[
            { icon: 'git-network-outline', label: 'View Bracket',       onPress: () => router.back() },
            { icon: 'share-outline',       label: 'Share Results',       onPress: handleShare },
            { icon: 'refresh-outline',     label: 'Create Rematch',      onPress: handleRematch },
            { icon: 'archive-outline',     label: 'Archive Tournament',  onPress: handleArchive },
          ].map((row, i) => (
            <TouchableOpacity
              key={row.label}
              style={[s.mgmtRow, i > 0 && s.mgmtRowBorder]}
              onPress={row.onPress}
              activeOpacity={0.7}
            >
              <View style={s.mgmtIconWrap}>
                <Ionicons name={row.icon as never} size={17} color={L.navy} />
              </View>
              <Text style={s.mgmtLabel}>{row.label}</Text>
              <Ionicons name="chevron-forward" size={15} color={L.textSub} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Delete (danger) */}
        <TouchableOpacity
          style={s.deleteRow}
          onPress={() => Alert.alert('Delete Tournament', 'This will permanently delete all data.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => router.back() },
          ])}
          activeOpacity={0.75}
        >
          <Ionicons name="trash-outline" size={16} color={L.danger} />
          <Text style={s.deleteText}>Delete Tournament</Text>
        </TouchableOpacity>
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
              onPress={() => closeMenu(() => Alert.alert('Delete Tournament', 'This will permanently delete all data.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => router.back() },
              ]))}
              activeOpacity={0.7}
            >
              <View style={mm.iconWrap}>
                <Ionicons name="trash-outline" size={17} color={L.danger} />
              </View>
              <Text style={[mm.rowLabel, { color: L.danger }]}>Delete Tournament</Text>
            </TouchableOpacity>
          </Animated.View>
        </>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },
  center: { alignItems: 'center', justifyContent: 'center' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.sm, height: 52, gap: 4,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  headerBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: text.actionLarge.size, fontWeight: '800', color: L.navy },
  headerSub: { fontSize: text.caption.size, fontWeight: '500', color: L.textSub, marginTop: 1 },
  headerRight: { flexDirection: 'row', gap: 2, flexShrink: 0 },

  scroll: { paddingHorizontal: spacing.screenH, paddingTop: 16, gap: 14 },

  // Not complete guard
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  emptyTitle: { fontSize: text.titleSm.size, fontWeight: '800', color: L.navy, textAlign: 'center' },
  emptySub: { fontSize: text.body.size, fontWeight: '500', color: L.textSub, textAlign: 'center', lineHeight: 20 },
  emptyBtn: {
    backgroundColor: L.gold, borderRadius: shape.cta,
    paddingVertical: 12, paddingHorizontal: 24, marginTop: 8,
  },
  emptyBtnText: { fontSize: text.rowTitle.size, fontWeight: '700', color: L.white },

  // Complete banner
  completeBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#E8F5E9',
    borderRadius: shape.cta,
    borderWidth: 1, borderColor: colors.success + '55',
    paddingHorizontal: 12, paddingVertical: 7,
  },
  completeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success, flexShrink: 0 },
  completeText: { fontSize: text.caption.size, fontWeight: '500', color: colors.success, flex: 1 },

  // Champion hero
  heroCard: {
    borderRadius: shape.card,
    overflow: 'hidden',
    borderWidth: 2, borderColor: L.goldBorder,
    shadowColor: L.gold, shadowOpacity: 0.2,
    shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  heroTop: {
    backgroundColor: L.goldBg,
    alignItems: 'center', paddingVertical: 16, gap: 6,
  },
  heroTopLabel: {
    fontSize: text.cardLabel.size, fontWeight: '800', color: L.gold,
    letterSpacing: text.cardLabel.letterSpacing, textTransform: 'uppercase',
  },
  heroBody: {
    backgroundColor: L.bg,
    alignItems: 'center', paddingVertical: 24, gap: 4,
  },
  heroAvatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: L.goldBg,
    borderWidth: 3, borderColor: L.goldBorder,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  heroAvatarText: { fontSize: 20, fontWeight: '900', color: L.gold },
  heroName: { fontSize: text.cardTitle.size, fontWeight: '800', color: L.navy },
  heroMeta: { fontSize: text.body.size, fontWeight: '500', color: L.textSub },
  heroCity: { fontSize: text.caption.size, fontWeight: '500', color: L.textSub },
  heroScore: {
    marginTop: 8,
    paddingHorizontal: 14, paddingVertical: 5,
    backgroundColor: L.goldLight,
    borderRadius: shape.pill,
    borderWidth: 1, borderColor: L.goldBorder,
  },
  heroScoreText: { fontSize: text.chipValue.size, fontWeight: '800', color: L.navy },

  // Cards
  card: {
    backgroundColor: L.bg,
    borderRadius: shape.panel,
    borderWidth: 1, borderColor: L.border,
    overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.04,
    shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    paddingVertical: 16,
  },
  cardTitle: {
    fontSize: text.rowValue.size, fontWeight: '800', color: L.navy,
    paddingHorizontal: 16, marginBottom: 12,
  },

  // Podium
  podiumRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 11,
  },
  podiumRowFirst: { backgroundColor: L.goldLight },
  podiumBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: L.border },
  medalBadge: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  medalText: { fontSize: 11, fontWeight: '900' },
  podiumAvatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: L.goldBg, borderWidth: 1.5, borderColor: L.goldBorder,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  podiumAvatarText: { fontSize: 10, fontWeight: '800', color: L.gold },
  podiumBody: { flex: 1 },
  podiumName: { fontSize: text.rowTitle.size, fontWeight: '700', color: L.navy },
  podiumMeta: { fontSize: 11, color: L.textSub, marginTop: 1 },
  podiumPlace: { fontSize: 11, fontWeight: '700', flexShrink: 0 },

  // Summary rows
  summaryRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  summaryRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: L.border },
  summaryText: { fontSize: text.caption.size, fontWeight: '500', color: L.navy, flex: 1 },

  // Stats pills
  statsRow: { flexDirection: 'row', gap: 8 },
  statPill: {
    flex: 1, alignItems: 'center', gap: 3,
    backgroundColor: L.bg,
    borderRadius: shape.cta,
    borderWidth: 1, borderColor: L.border,
    paddingVertical: 10,
  },
  statVal: { fontSize: text.body.size, fontWeight: '500', color: L.navy },
  statLabel: { fontSize: 10, color: L.textSub },

  // Match history
  historyRoundLabel: {
    fontSize: text.cardLabel.size, fontWeight: '800', color: L.textSub,
    letterSpacing: text.cardLabel.letterSpacing, textTransform: 'uppercase',
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4,
  },
  historyRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 9, gap: 12,
  },
  historyRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: L.border },
  historyLeft: { flex: 1 },
  historyWinner: { fontSize: text.fieldLabel.size, fontWeight: '800', color: L.navy },
  historyDef: { fontSize: 11, color: L.textSub, marginTop: 1 },
  historyScore: { fontSize: text.fieldLabel.size, fontWeight: '800', color: L.navy, flexShrink: 0 },

  // Bracket snapshot
  snapshotCard: {
    marginHorizontal: 16, marginBottom: 10,
    borderRadius: shape.cta,
    borderWidth: 1, borderColor: L.border,
    overflow: 'hidden',
  },
  snapshotRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  snapshotAvatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: L.page, borderWidth: 1, borderColor: L.border,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  snapshotAvatarGold: { backgroundColor: L.goldBg, borderColor: L.goldBorder },
  snapshotAvatarText: { fontSize: 8, fontWeight: '800', color: L.textSub },
  snapshotName: { flex: 1, fontSize: text.caption.size, fontWeight: '500', color: L.navy },
  snapshotNameWinner: { fontWeight: '800' },
  snapshotScore: { fontSize: text.body.size, fontWeight: '500', color: L.navy, flexShrink: 0 },
  snapshotDivider: { height: StyleSheet.hairlineWidth, backgroundColor: L.border },
  viewBracketBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: L.border,
  },
  viewBracketText: { fontSize: text.caption.size, fontWeight: '500', color: L.navy },

  // Primary / Secondary buttons
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: L.gold, borderRadius: shape.cta, paddingVertical: 15,
    shadowColor: L.gold, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  primaryBtnText: { fontSize: text.actionLarge.size, fontWeight: '800', color: L.white },
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: L.bg, borderRadius: shape.cta, paddingVertical: 14,
    borderWidth: 1.5, borderColor: L.border,
  },
  secondaryBtnText: { fontSize: text.actionLarge.size, fontWeight: '800', color: L.navy },

  // Management rows
  mgmtRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 13,
  },
  mgmtRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: L.border },
  mgmtIconWrap: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: L.page,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  mgmtLabel: { flex: 1, fontSize: text.rowTitle.size, fontWeight: '700', color: L.navy },

  // Delete row
  deleteRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14,
  },
  deleteText: { fontSize: text.rowTitle.size, fontWeight: '700', color: L.danger },
});

// ─── Context menu styles ──────────────────────────────────────────────────────────

const mm = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0A1228',
    zIndex: 30,
  },
  popover: {
    position: 'absolute',
    width: 252,
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
  rowLabel: { color: '#0A1228', fontSize: text.rowTitle.size, fontWeight: '700' },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E9F0',
    marginHorizontal: 10, marginVertical: 3,
  },
});
