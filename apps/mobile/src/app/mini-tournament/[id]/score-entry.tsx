import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing, radius } from '@/theme';
import { StatusChip } from '@/components/StatusChip';
import { PickleballIcon } from '@/components';
import { getMiniTournament } from '@/lib/miniTournamentStore';
import { getBracket, getMatch, saveMatchResult } from '@/lib/bracketStore';
import { isTeam } from '@/lib/bracketTypes';
import { useSupportContext } from '@/lib/support/supportContext';
import type { BTeam, BMatch } from '@/lib/bracketTypes';
import {
  fetchMiniTournamentMatches, sbMatchesToBracket, saveMiniTournamentScore,
} from '@/lib/supabase/miniTournament';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

// ─── Helpers ─────────────────────────────────────────────────────────────────────

function getRoundLabel(roundIdx: number, totalRounds: number): string {
  const fromEnd = totalRounds - 1 - roundIdx;
  if (fromEnd === 0) return 'Final';
  if (fromEnd === 1) return 'Semifinals';
  if (fromEnd === 2) return 'Quarterfinals';
  return `Round ${roundIdx + 1}`;
}

function nextPowerOfTwo(n: number): number {
  if (n <= 0) return 1;
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function getNextRoundLabel(roundIdx: number, totalRounds: number): string {
  const fromEnd = totalRounds - 1 - roundIdx;
  if (fromEnd === 0) return 'Champion';
  if (fromEnd === 1) return 'Final';
  if (fromEnd === 2) return 'Semifinals';
  if (fromEnd === 3) return 'Quarterfinals';
  return `Round ${roundIdx + 2}`;
}

// Parse target score from format string, e.g. "1 Game to 11 (Win by 2)" → 11
function parseTargetScore(matchFormat: string): number {
  const m = matchFormat.match(/to (\d+)/i);
  return m ? parseInt(m[1], 10) : 11;
}

// ─── Team avatar stack (overlapping bubbles for score entry header) ──────────────

function TeamAvatarStack({ team }: { team: BTeam }) {
  return (
    <View style={{ width: 64, height: 52, position: 'relative', alignSelf: 'center' }}>
      <View style={[sea.bubble, { top: 0, left: 0 }]}>
        <Text style={sea.bubbleText}>{team.players[0].avatarInitials}</Text>
      </View>
      <View style={[sea.bubble, { top: 16, left: 20 }]}>
        <Text style={sea.bubbleText}>{team.players[1].avatarInitials}</Text>
      </View>
    </View>
  );
}

const sea = StyleSheet.create({
  bubble: {
    width: 36, height: 36, borderRadius: 18, position: 'absolute',
    backgroundColor: colors.goldBg, borderWidth: 2, borderColor: colors.goldBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  bubbleText: { fontSize: 10, fontWeight: '800', color: colors.gold },
});

// ─── Screen ──────────────────────────────────────────────────────────────────────

export default function ScoreEntryScreen() {
  const insets = useSafeAreaInsets();
  const { id, matchId } = useLocalSearchParams<{ id: string; matchId: string }>();

  const isSupabase = UUID_RE.test(id ?? '');

  // ── Supabase state ──
  const [sbMatch,      setSbMatch]      = useState<BMatch | null>(null);
  const [sbTotalRounds,setSbTotalRounds]= useState(0);
  const [loadingMatch, setLoadingMatch] = useState(isSupabase);
  const [saving,       setSaving]       = useState(false);

  // Explicit user ask (§7): never risk a mis-tap during rapid score entry.
  useSupportContext({ feature: 'score_entry', entityType: 'mini_tournament', entityId: id, visibility: 'hidden' });

  // Supabase: fetch all matches to find this one + derive totalRounds
  useEffect(() => {
    if (!isSupabase) return;
    setLoadingMatch(true);
    fetchMiniTournamentMatches(id!)
      .then(rows => {
        const bracket = sbMatchesToBracket(rows);
        setSbTotalRounds(bracket.length);
        for (const round of bracket) {
          const found = round.find(m => m.id === matchId);
          if (found) { setSbMatch(found); break; }
        }
      })
      .catch(() => {})
      .finally(() => setLoadingMatch(false));
  }, [id, matchId, isSupabase]);

  // ── Local state ──
  const tournament  = getMiniTournament();
  const matchFormat = isSupabase ? '1 Game to 11 (Win by 2)' : (tournament?.matchFormat ?? '1 Game to 11 (Win by 2)');

  const storedBracket       = isSupabase ? null : getBracket(id ?? '');
  const totalRoundsEstimate = isSupabase
    ? sbTotalRounds
    : (storedBracket ? storedBracket.length : Math.log2(nextPowerOfTwo(tournament?.maxPlayers ?? 16)));

  const match: BMatch | null = isSupabase ? sbMatch : getMatch(id ?? '', matchId ?? '');

  const [rawScore1, setRawScore1] = useState('');
  const [rawScore2, setRawScore2] = useState('');
  const [saved, setSaved]         = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (loadingMatch) {
    return (
      <View style={[s.root, s.center]}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color={colors.gold} />
        <Text style={{ marginTop: 12, fontSize: 14, color: colors.textSub }}>Loading match…</Text>
      </View>
    );
  }

  if (!match || !match.player1 || !match.player2) {
    return (
      <View style={[s.root, s.center]}>
        <StatusBar style="dark" />
        <Ionicons name="alert-circle-outline" size={40} color={L.textSub} />
        <Text style={s.notFoundTitle}>Match not found</Text>
        <Text style={s.notFoundSub}>Return to the bracket and try again.</Text>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Text style={s.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const p1 = match.player1;
  const p2 = match.player2;
  const roundLabel  = getRoundLabel(match.roundIdx, totalRoundsEstimate);
  const nextLabel   = getNextRoundLabel(match.roundIdx, totalRoundsEstimate);
  const targetScore = parseTargetScore(matchFormat);

  const s1 = rawScore1 === '' ? null : parseInt(rawScore1, 10);
  const s2 = rawScore2 === '' ? null : parseInt(rawScore2, 10);

  // Live winner detection
  function getLiveWinner() {
    if (s1 === null || s2 === null) return null;
    if (isNaN(s1) || isNaN(s2)) return null;
    if (s1 === s2) return null;
    const winner = s1 > s2 ? p1 : p2;
    const winScore = Math.max(s1, s2);
    const loseScore = Math.min(s1, s2);
    // Must reach target and win by ≥2
    if (winScore < targetScore) return null;
    if (winScore - loseScore < 2) return null;
    return winner;
  }

  const liveWinner = getLiveWinner();

  function validate(): string | null {
    if (s1 === null || s2 === null) return 'Enter scores for both players.';
    if (isNaN(s1) || isNaN(s2) || s1 < 0 || s2 < 0) return 'Scores must be non-negative numbers.';
    if (s1 === s2) return 'Scores cannot be tied.';
    const winScore  = Math.max(s1, s2);
    const loseScore = Math.min(s1, s2);
    if (winScore < targetScore) return `Winner must reach at least ${targetScore} points.`;
    if (winScore - loseScore < 2) return 'Winner must win by at least 2 points.';
    return null;
  }

  async function handleSave() {
    const err = validate();
    if (err) { setSaveError(err); return; }
    setSaveError(null);

    if (isSupabase) {
      setSaving(true);
      try {
        await saveMiniTournamentScore(match!.id, s1!, s2!);
        setSaved(true);
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : 'Failed to save score.');
      } finally {
        setSaving(false);
      }
      return;
    }

    const winner = s1! > s2! ? p1 : p2;
    saveMatchResult(id ?? '', match!.id, winner.id, s1!, s2!);
    setSaved(true);
  }

  // ── Saved state ──────────────────────────────────────────────────────────────

  if (saved) {
    const winner = s1! > s2! ? p1 : p2;
    return (
      <View style={[s.root, s.center]}>
        <StatusBar style="dark" />
        <View style={s.successIconWrap}>
          <Ionicons name="checkmark-circle" size={56} color={L.success} />
        </View>
        <Text style={s.successTitle}>Result Saved</Text>
        <Text style={s.successSub}>
          {nextLabel === 'Champion'
            ? `${winner.name} is Champion`
            : `${winner.name} advances to ${nextLabel}.`}
        </Text>
        <TouchableOpacity
          style={s.viewBracketBtn}
          onPress={() => router.back()}
          activeOpacity={0.85}
        >
          <Ionicons name="git-network-outline" size={18} color={L.white} />
          <Text style={s.viewBracketText}>View Updated Bracket</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Score entry form ─────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar style="dark" />

      {/* ── HEADER ── */}
      <View style={[s.header, { paddingTop: insets.top }]}>
        <TouchableOpacity style={s.headerBtn} onPress={() => router.back()} activeOpacity={0.6}>
          <Ionicons name="chevron-back" size={22} color={L.navy} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>Enter Scores</Text>
          <Text style={s.headerSub}>Match Result</Text>
        </View>
        <View style={s.headerRight}>
          <StatusChip label="Scheduled" variant="gold" />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── MATCH SUMMARY CARD ── */}
        <View style={s.summaryCard}>
          {/* Players / Teams */}
          <View style={s.vsRow}>
            <View style={s.playerCol}>
              {isTeam(p1) ? (
                <TeamAvatarStack team={p1} />
              ) : (
                <View style={s.avatarCircle}>
                  <Text style={s.avatarText}>{p1.avatarInitials}</Text>
                </View>
              )}
              <Text numberOfLines={2} style={[s.playerName, isTeam(p1) && s.teamName]}>
                {p1.name}
              </Text>
              <Text style={s.playerMeta}>
                {isTeam(p1) ? `Avg ${(p1 as BTeam).avgDupr.toFixed(1)} DUPR` : `${(p1 as any).dupr} DUPR`}
              </Text>
            </View>
            <View style={s.vsCol}>
              <Text style={s.vsText}>vs</Text>
            </View>
            <View style={s.playerCol}>
              {isTeam(p2) ? (
                <TeamAvatarStack team={p2} />
              ) : (
                <View style={s.avatarCircle}>
                  <Text style={s.avatarText}>{p2.avatarInitials}</Text>
                </View>
              )}
              <Text numberOfLines={2} style={[s.playerName, isTeam(p2) && s.teamName]}>
                {p2.name}
              </Text>
              <Text style={s.playerMeta}>
                {isTeam(p2) ? `Avg ${(p2 as BTeam).avgDupr.toFixed(1)} DUPR` : `${(p2 as any).dupr} DUPR`}
              </Text>
            </View>
          </View>

          {/* Match details row */}
          <View style={s.matchMetaRow}>
            {match.court && (
              <View style={s.metaChip}>
                <PickleballIcon size={11} color={L.textSub} />
                <Text style={s.metaChipText}>{match.court}</Text>
              </View>
            )}
            {match.time && (
              <View style={s.metaChip}>
                <Ionicons name="time-outline" size={11} color={L.textSub} />
                <Text style={s.metaChipText}>{match.time}</Text>
              </View>
            )}
            <View style={s.metaChip}>
              <Ionicons name="layers-outline" size={11} color={L.textSub} />
              <Text style={s.metaChipText}>{roundLabel}</Text>
            </View>
          </View>
        </View>

        {/* ── MATCH FORMAT CARD ── */}
        <View style={s.formatCard}>
          <View style={s.formatIconWrap}>
            <Ionicons name="trophy-outline" size={16} color={L.gold} />
          </View>
          <View>
            <Text style={s.formatLabel}>Match Format</Text>
            <Text style={s.formatValue}>{matchFormat}</Text>
          </View>
        </View>

        {/* ── SCORE ENTRY ── */}
        <View style={s.scoreCard}>
          <Text style={s.scoreCardTitle}>Enter Match Score</Text>

          <View style={s.scoreRow}>
            {/* Participant 1 */}
            <View style={s.scoreCol}>
              <Text style={s.scoreName} numberOfLines={1}>
                {isTeam(p1) ? 'Team 1' : p1.name}
              </Text>
              <TextInput
                style={[
                  s.scoreInput,
                  liveWinner?.id === p1.id && s.scoreInputWinner,
                  liveWinner?.id === p2.id && s.scoreInputLoser,
                ]}
                value={rawScore1}
                onChangeText={t => { setRawScore1(t.replace(/[^0-9]/g, '')); setSaveError(null); }}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="0"
                placeholderTextColor={L.border}
                textAlign="center"
              />
            </View>

            {/* Divider */}
            <View style={s.scoreDivider}>
              <Text style={s.scoreDividerText}>–</Text>
            </View>

            {/* Participant 2 */}
            <View style={s.scoreCol}>
              <Text style={s.scoreName} numberOfLines={1}>
                {isTeam(p2) ? 'Team 2' : p2.name}
              </Text>
              <TextInput
                style={[
                  s.scoreInput,
                  liveWinner?.id === p2.id && s.scoreInputWinner,
                  liveWinner?.id === p1.id && s.scoreInputLoser,
                ]}
                value={rawScore2}
                onChangeText={t => { setRawScore2(t.replace(/[^0-9]/g, '')); setSaveError(null); }}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="0"
                placeholderTextColor={L.border}
                textAlign="center"
              />
            </View>
          </View>

          {/* Validation error */}
          {saveError && (
            <View style={s.errorRow}>
              <Ionicons name="alert-circle-outline" size={14} color={L.danger} />
              <Text style={s.errorText}>{saveError}</Text>
            </View>
          )}
        </View>

        {/* ── LIVE WINNER PREVIEW ── */}
        {liveWinner && (
          <View style={s.winnerCard}>
            <View style={s.winnerIconWrap}>
              <Ionicons name="trophy" size={18} color={L.gold} />
            </View>
            <View>
              <Text style={s.winnerLabel}>Winner</Text>
              <Text style={s.winnerName}>{liveWinner.name}</Text>
              <Text style={s.winnerSub}>Advances to {nextLabel}</Text>
            </View>
          </View>
        )}

        {/* ── SAVE BUTTON ── */}
        <TouchableOpacity
          style={[s.saveBtn, (!liveWinner || saving) && s.saveBtnDisabled]}
          onPress={handleSave}
          activeOpacity={(liveWinner && !saving) ? 0.85 : 1}
        >
          {saving ? (
            <ActivityIndicator size="small" color={L.white} />
          ) : (
            <Ionicons name="checkmark-circle-outline" size={18} color={liveWinner ? L.white : L.textSub} />
          )}
          <Text style={[s.saveBtnText, (!liveWinner || saving) && s.saveBtnTextDisabled]}>
            {saving ? 'Saving…' : 'Save Result'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },

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
  headerTitle:  { fontSize: 16, fontWeight: '800', color: L.navy },
  headerSub:    { fontSize: 12, color: L.textSub, marginTop: 1 },
  headerRight:  { flexDirection: 'row', gap: 6, alignItems: 'center', flexShrink: 0 },

  scroll: { paddingHorizontal: spacing.screenH, paddingTop: 20, gap: 14 },

  // Match summary card
  summaryCard: {
    backgroundColor: L.bg,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: L.border,
    overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.04,
    shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  vsRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 24, paddingTop: 24, paddingBottom: 16,
  },
  playerCol: { flex: 1, alignItems: 'center', gap: 8 },
  vsCol:     { width: 36, alignItems: 'center' },
  vsText:    { fontSize: 15, fontWeight: '800', color: L.textSub },

  avatarCircle: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: L.goldBg,
    borderWidth: 2, borderColor: L.goldBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText:  { fontSize: 14, fontWeight: '800', color: L.gold },
  playerName:  { fontSize: 14, fontWeight: '700', color: L.navy, textAlign: 'center' },
  teamName:    { fontSize: 12 },
  playerMeta:  { fontSize: 12, color: L.textSub, textAlign: 'center' },

  matchMetaRow: {
    flexDirection: 'row', gap: 8, flexWrap: 'wrap',
    paddingHorizontal: 16, paddingBottom: 14,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: L.border,
    paddingTop: 12,
  },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaChipText: { fontSize: 12, color: L.textSub, fontWeight: '500' },

  // Format card
  formatCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: L.bg,
    borderRadius: radius.sm,
    borderWidth: 1, borderColor: L.border,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  formatIconWrap: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: L.goldLight,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  formatLabel: { fontSize: 11, color: L.textSub, fontWeight: '500' },
  formatValue: { fontSize: 14, fontWeight: '700', color: L.navy, marginTop: 1 },

  // Score entry card
  scoreCard: {
    backgroundColor: L.bg,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: L.border,
    paddingHorizontal: 20, paddingVertical: 20, gap: 16,
    shadowColor: '#000', shadowOpacity: 0.04,
    shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  scoreCardTitle: { fontSize: 13, fontWeight: '700', color: L.navy, textAlign: 'center' },
  scoreRow:       { flexDirection: 'row', alignItems: 'center' },
  scoreCol:       { flex: 1, alignItems: 'center', gap: 8 },
  scoreName:      { fontSize: 12, fontWeight: '600', color: L.textSub, textAlign: 'center' },
  scoreInput: {
    width: 80, height: 80,
    borderRadius: 16,
    borderWidth: 2, borderColor: L.border,
    backgroundColor: L.page,
    fontSize: 36, fontWeight: '900', color: L.navy,
    textAlign: 'center',
  },
  scoreInputWinner: {
    borderColor: L.gold,
    backgroundColor: L.goldLight,
    color: L.gold,
  },
  scoreInputLoser: {
    borderColor: L.border,
    backgroundColor: L.page,
    color: L.textSub,
    opacity: 0.5,
  },
  scoreDivider:     { width: 32, alignItems: 'center' },
  scoreDividerText: { fontSize: 24, fontWeight: '300', color: L.border },

  // Validation error
  errorRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FFF5F5',
    borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: '#FFCDD2',
  },
  errorText: { fontSize: 13, color: L.danger, flex: 1 },

  // Live winner preview
  winnerCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: L.goldLight,
    borderRadius: radius.md,
    borderWidth: 1.5, borderColor: L.goldBorder,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  winnerIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: L.goldBg,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  winnerLabel: { fontSize: 11, color: L.gold, fontWeight: '700', letterSpacing: 0.5 },
  winnerName:  { fontSize: 17, fontWeight: '900', color: L.navy, marginTop: 1 },
  winnerSub:   { fontSize: 12, color: L.textSub, marginTop: 2 },

  // Save button
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: L.gold,
    borderRadius: radius.md,
    paddingVertical: 16,
    shadowColor: L.gold, shadowOpacity: 0.3,
    shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  saveBtnDisabled: {
    backgroundColor: L.border,
    shadowOpacity: 0,
    elevation: 0,
  },
  saveBtnText:         { fontSize: 16, fontWeight: '800', color: L.white },
  saveBtnTextDisabled: { color: L.textSub },

  // Success state
  successIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#E8F5E9',
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  successTitle: { fontSize: 22, fontWeight: '900', color: L.navy },
  successSub:   { fontSize: 15, color: L.textSub, textAlign: 'center', lineHeight: 22 },

  viewBracketBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: L.navy,
    borderRadius: radius.md,
    paddingVertical: 14, paddingHorizontal: 28,
    marginTop: 12,
  },
  viewBracketText: { fontSize: 15, fontWeight: '800', color: L.white },

  // Not-found state
  notFoundTitle: { fontSize: 18, fontWeight: '800', color: L.navy, textAlign: 'center' },
  notFoundSub:   { fontSize: 14, color: L.textSub, textAlign: 'center' },
  backBtn: {
    backgroundColor: L.gold, borderRadius: radius.sm,
    paddingVertical: 12, paddingHorizontal: 24, marginTop: 8,
  },
  backBtnText: { fontSize: 14, fontWeight: '700', color: L.white },
});
