import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { PrimaryButton } from '@/components/PrimaryButton';
import { PickleballIcon } from '@/components';
import { getRoundRobin } from '@/lib/roundRobinStore';
import { useSupportContext } from '@/lib/support/supportContext';
import {
  getSchedule, saveMatchResult, type RRMatch,
} from '@/lib/rrScheduleStore';
import {
  fetchRoundRobinMatchById, saveRoundRobinScore,
  sbMatchesToRRRounds, type PlayMatchWithPlayers,
} from '@/lib/supabase/roundRobin';

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
  dangerBg:   colors.dangerBg,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseTargetScore(fmt: string): number | null {
  const m = fmt.match(/to (\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

function requiresWinBy2(fmt: string): boolean {
  return /win by 2/i.test(fmt);
}

// ─── Score Stepper ────────────────────────────────────────────────────────────

function ScoreStepper({
  label,
  value,
  onChange,
  isWinner,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  isWinner: boolean;
}) {
  const numVal = parseInt(value, 10);
  const safeVal = isNaN(numVal) ? 0 : numVal;

  function decrement() {
    if (safeVal > 0) onChange(String(safeVal - 1));
  }
  function increment() {
    onChange(String(safeVal + 1));
  }

  return (
    <View style={[sp.wrap, isWinner && sp.wrapWinner]}>
      <View style={sp.labelRow}>
        <Text style={[sp.label, isWinner && sp.labelWinner]} numberOfLines={1}>
          {label}
        </Text>
        {isWinner && (
          <View style={sp.winnerPill}>
            <Ionicons name="trophy-outline" size={11} color={L.gold} />
            <Text style={sp.winnerPillText}>Winning</Text>
          </View>
        )}
      </View>

      <View style={sp.controls}>
        <TouchableOpacity
          style={[sp.btn, safeVal <= 0 && sp.btnDisabled]}
          onPress={decrement}
          disabled={safeVal <= 0}
          activeOpacity={0.75}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="remove" size={22} color={safeVal <= 0 ? L.border : L.navy} />
        </TouchableOpacity>

        <TextInput
          style={[sp.scoreInput, isWinner && sp.scoreInputWinner]}
          value={value}
          onChangeText={v => {
            if (/^\d{0,2}$/.test(v)) onChange(v);
          }}
          keyboardType="number-pad"
          maxLength={2}
          selectTextOnFocus
        />

        <TouchableOpacity
          style={sp.btn}
          onPress={increment}
          activeOpacity={0.75}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="add" size={22} color={L.navy} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const sp = StyleSheet.create({
  wrap: {
    flex: 1, alignItems: 'center',
    backgroundColor: L.bg,
    borderRadius: shape.panel,
    borderWidth: 1.5, borderColor: L.border,
    padding: spacing.md,
    gap: 12,
  },
  wrapWinner: {
    borderColor: L.goldBorder,
    backgroundColor: L.goldLight,
  },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'center' },
  label: {
    fontSize: text.rowValue.size, fontWeight: '800', color: L.navy,
    textAlign: 'center',
  },
  labelWinner: { color: L.navy },
  winnerPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: L.goldBg,
    borderRadius: shape.pill,
    paddingHorizontal: 7, paddingVertical: 2,
    borderWidth: 1, borderColor: L.goldBorder,
  },
  winnerPillText: { fontSize: text.microLabel.size, fontWeight: '700', color: L.gold },

  controls: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  btn: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 1.5, borderColor: L.border,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: L.bg,
  },
  btnDisabled: { opacity: 0.3 },
  scoreInput: {
    width: 64, height: 64, borderRadius: shape.panel,
    borderWidth: 2, borderColor: L.border,
    fontSize: 36, fontWeight: '900', color: L.navy,
    textAlign: 'center',
    backgroundColor: L.page,
  },
  scoreInputWinner: {
    borderColor: L.gold,
    color: L.navy,
  },
});

// ─── UUID detection ───────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function RRScoreEntryScreen() {
  const insets = useSafeAreaInsets();
  const { id, matchId } = useLocalSearchParams<{ id: string; matchId: string }>();
  const tournamentId = id ?? '';
  const isSupabase   = UUID_RE.test(tournamentId);

  // ── Match format (local store for local events; hardcoded default for Supabase) ──
  const rr = getRoundRobin();
  const matchFormat = isSupabase
    ? '1 Game to 11 (Win by 2)'
    : (rr?.matchFormat ?? '1 Game to 11 (Win by 2)');
  const targetScore = parseTargetScore(matchFormat);
  const winBy2 = requiresWinBy2(matchFormat);

  // Explicit user ask (§7): never risk a mis-tap during rapid score entry.
  useSupportContext({ feature: 'score_entry', entityType: 'round_robin', entityId: tournamentId, visibility: 'hidden' });

  // ── Supabase state ──
  const [sbMatchRow,   setSbMatchRow]   = useState<PlayMatchWithPlayers | null>(null);
  const [loadingMatch, setLoadingMatch] = useState(isSupabase);
  const [saving,       setSaving]       = useState(false);

  // ── Local match state ──
  const [localMatch, setLocalMatch] = useState<RRMatch | null>(() => {
    if (isSupabase || !matchId) return null;
    const rounds = getSchedule(tournamentId);
    if (!rounds) return null;
    for (const round of rounds) {
      const m = round.matches.find(m => m.id === matchId);
      if (m) return m;
    }
    return null;
  });

  // Supabase: fetch match on mount + pre-populate existing scores for re-entry
  useEffect(() => {
    if (!isSupabase || !matchId) return;
    setLoadingMatch(true);
    fetchRoundRobinMatchById(matchId, tournamentId)
      .then(row => {
        setSbMatchRow(row);
        if (row?.score_a != null) setScore1(String(row.score_a));
        if (row?.score_b != null) setScore2(String(row.score_b));
      })
      .catch(() => {})
      .finally(() => setLoadingMatch(false));
  }, [matchId, tournamentId, isSupabase]);

  // Local: refresh on focus
  useFocusEffect(useCallback(() => {
    if (isSupabase || !matchId) return;
    const rounds = getSchedule(tournamentId);
    if (!rounds) return;
    for (const round of rounds) {
      const m = round.matches.find(m => m.id === matchId);
      if (m) { setLocalMatch(m); return; }
    }
  }, [tournamentId, matchId, isSupabase]));

  // Derive display match from whichever path is active
  const match: RRMatch | null = isSupabase
    ? (sbMatchRow ? (sbMatchesToRRRounds([sbMatchRow])[0]?.matches[0] ?? null) : null)
    : localMatch;

  const [score1, setScore1] = useState('');
  const [score2, setScore2] = useState('');
  const [error, setError]   = useState('');
  const [saved, setSaved]   = useState(false);

  const s1 = parseInt(score1, 10);
  const s2 = parseInt(score2, 10);
  const bothValid = !isNaN(s1) && !isNaN(s2) && score1 !== '' && score2 !== '';
  const isTie     = bothValid && s1 === s2;
  const p1Winning = bothValid && !isTie && s1 > s2;
  const p2Winning = bothValid && !isTie && s2 > s1;

  const p1 = match?.player1;
  const p2 = match?.player2;

  function validate(): string | null {
    if (score1 === '' || score2 === '') return 'Both scores are required.';
    if (isNaN(s1) || isNaN(s2))         return 'Scores must be numbers.';
    if (s1 < 0 || s2 < 0)               return 'Scores cannot be negative.';
    if (s1 === s2)                       return 'Scores cannot be tied. A winner is required.';
    if (targetScore !== null) {
      const winner = Math.max(s1, s2);
      const loser  = Math.min(s1, s2);
      if (winBy2 && winner - loser < 2) {
        return `Format requires a win by at least 2 points.`;
      }
    }
    return null;
  }

  async function handleSave() {
    const err = validate();
    if (err) { setError(err); return; }
    setError('');

    if (isSupabase) {
      setSaving(true);
      try {
        await saveRoundRobinScore(matchId!, s1, s2);
        setSaved(true);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Could not save score. Please try again.';
        Alert.alert('Error Saving Score', msg);
      } finally {
        setSaving(false);
      }
    } else {
      saveMatchResult(tournamentId, matchId ?? '', s1, s2);
      setSaved(true);
    }
  }

  if (loadingMatch) {
    return (
      <View style={[st.root, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <View style={st.errorState}>
          <ActivityIndicator size="large" color={colors.gold} />
          <Text style={st.errorText}>Loading match…</Text>
        </View>
      </View>
    );
  }

  if (!match) {
    return (
      <View style={[st.root, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <View style={st.errorState}>
          <Ionicons name="alert-circle-outline" size={40} color={L.textSub} />
          <Text style={st.errorText}>Match not found.</Text>
          <TouchableOpacity onPress={() => router.back()} style={st.errorBtn}>
            <Text style={st.errorBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Success state ──
  if (saved) {
    const winnerName = p1Winning ? p1?.name : p2?.name;
    return (
      <View style={[st.root, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <View style={st.successState}>
          <View style={st.successIcon}>
            <Ionicons name="checkmark" size={32} color={L.gold} />
          </View>
          <Text style={st.successTitle}>Result Saved</Text>
          <Text style={st.successSub}>
            {winnerName} wins this match.
          </Text>
          <View style={st.successScoreRow}>
            <Text style={st.successScore}>{score1}</Text>
            <Text style={st.successScoreDash}>–</Text>
            <Text style={st.successScore}>{score2}</Text>
          </View>
          <PrimaryButton
            label="View Updated Schedule"
            icon="calendar-outline"
            onPress={() => router.back()}
            style={st.successBtn}
          />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[st.root, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />

        {/* ── HEADER ── */}
        <View style={st.header}>
          <TouchableOpacity style={st.backBtn} onPress={() => router.back()} activeOpacity={0.6}>
            <Ionicons name="chevron-back" size={20} color="#007AFF" />
            <Text style={st.backText}>Back</Text>
          </TouchableOpacity>
          <View style={st.headerCenter}>
            <Text style={st.headerTitle}>Enter Scores</Text>
            <Text style={st.headerSub}>Round Robin Match</Text>
          </View>
          <View style={{ minWidth: 60 }} />
        </View>

        <ScrollView
          contentContainerStyle={[st.scroll, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── MATCH SUMMARY CARD ── */}
          <View style={st.summaryCard}>
            <View style={st.summaryMeta}>
              <View style={st.metaChip}>
                <PickleballIcon size={11} color={L.gold} />
                <Text style={st.metaChipText}>Court {match.courtNumber}</Text>
              </View>
              {match.scheduledTime && (
                <View style={st.metaChip}>
                  <Ionicons name="time-outline" size={11} color={L.textSub} />
                  <Text style={[st.metaChipText, { color: L.textSub }]}>{match.scheduledTime}</Text>
                </View>
              )}
              <View style={st.metaChip}>
                <Ionicons name="layers-outline" size={11} color={L.textSub} />
                <Text style={[st.metaChipText, { color: L.textSub }]}>Round {match.roundNumber}</Text>
              </View>
            </View>

            {/* Players vs row */}
            <View style={st.vsRow}>
              <View style={st.vsPlayer}>
                <View style={st.vsAvatar}>
                  <Text style={st.vsAvatarText}>{p1?.avatarInitials ?? '?'}</Text>
                </View>
                <Text style={st.vsName} numberOfLines={1}>{p1?.name ?? '—'}</Text>
                {p1?.dupr ? <Text style={st.vsDupr}>{p1.dupr} DUPR</Text> : null}
              </View>

              <View style={st.vsBadge}>
                <Text style={st.vsLabel}>vs</Text>
              </View>

              <View style={st.vsPlayer}>
                <View style={st.vsAvatar}>
                  <Text style={st.vsAvatarText}>{p2?.avatarInitials ?? '?'}</Text>
                </View>
                <Text style={st.vsName} numberOfLines={1}>{p2?.name ?? '—'}</Text>
                {p2?.dupr ? <Text style={st.vsDupr}>{p2.dupr} DUPR</Text> : null}
              </View>
            </View>
          </View>

          {/* ── MATCH FORMAT CARD ── */}
          <View style={st.formatCard}>
            <View style={st.formatRow}>
              <Ionicons name="trophy-outline" size={15} color={L.gold} />
              <Text style={st.formatLabel}>Match Format</Text>
            </View>
            <Text style={st.formatValue}>{matchFormat}</Text>
          </View>

          {/* ── SCORE ENTRY ── */}
          <View style={st.scoreCard}>
            <Text style={st.scoreCardTitle}>Enter Scores</Text>
            <View style={st.steppers}>
              <ScoreStepper
                label={p1?.name ?? 'Player 1'}
                value={score1}
                onChange={v => { setScore1(v); setError(''); }}
                isWinner={p1Winning}
              />
              <ScoreStepper
                label={p2?.name ?? 'Player 2'}
                value={score2}
                onChange={v => { setScore2(v); setError(''); }}
                isWinner={p2Winning}
              />
            </View>

            {/* Live winner preview */}
            {bothValid && !isTie && (
              <View style={st.winnerPreview}>
                <Ionicons name="trophy" size={15} color={L.gold} />
                <Text style={st.winnerPreviewLabel}>Winner</Text>
                <Text style={st.winnerPreviewName}>
                  {p1Winning ? p1?.name : p2?.name}
                </Text>
              </View>
            )}

            {/* Tie warning */}
            {isTie && (
              <View style={st.tieWarning}>
                <Ionicons name="alert-circle-outline" size={15} color={L.danger} />
                <Text style={st.tieWarningText}>Scores are tied — a winner is required.</Text>
              </View>
            )}
          </View>

          {/* ── VALIDATION ERROR ── */}
          {error !== '' && (
            <View style={st.errorBanner}>
              <Ionicons name="alert-circle-outline" size={15} color={L.danger} />
              <Text style={st.errorBannerText}>{error}</Text>
            </View>
          )}

          {/* ── SAVE BUTTON ── */}
          {saving
            ? <ActivityIndicator size="large" color={colors.gold} style={{ marginVertical: 8 }} />
            : <PrimaryButton
                label="Save Result"
                icon="checkmark-circle-outline"
                onPress={handleSave}
              />
          }

        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.screenH,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
    backgroundColor: L.page,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 60 },
  backText: { fontSize: text.link.size, color: '#007AFF', fontWeight: '700' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: text.titleSm.size, fontWeight: '800', color: L.navy },
  headerSub: { fontSize: text.caption.size, fontWeight: '500', color: L.textSub, marginTop: 1 },

  // Scroll
  scroll: { paddingHorizontal: spacing.screenH, paddingTop: spacing.md, gap: 14 },

  // Summary card
  summaryCard: {
    backgroundColor: L.bg,
    borderRadius: shape.card,
    borderWidth: 1, borderColor: L.border,
    padding: spacing.md,
    gap: 14,
  },
  summaryMeta: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  metaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: L.goldBg, borderRadius: shape.pill,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: L.goldBorder,
  },
  metaChipText: { fontSize: text.cardLabel.size, fontWeight: '800', letterSpacing: text.cardLabel.letterSpacing, color: L.navy },

  vsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  vsPlayer: { flex: 1, alignItems: 'center', gap: 6 },
  vsAvatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: L.goldBg, borderWidth: 2, borderColor: L.goldBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  vsAvatarText: { fontSize: 14, fontWeight: '900', color: L.navy },
  vsName: { fontSize: text.rowTitle.size, fontWeight: '700', color: L.navy, textAlign: 'center' },
  vsDupr: { fontSize: text.caption.size, fontWeight: '500', color: L.textSub },
  vsBadge: { alignItems: 'center', paddingHorizontal: 4 },
  vsLabel: { fontSize: text.sectionLabel.size, fontWeight: '800', letterSpacing: text.sectionLabel.letterSpacing, color: L.textSub },

  // Match format card
  formatCard: {
    backgroundColor: L.bg,
    borderRadius: shape.card,
    borderWidth: 1, borderColor: L.border,
    padding: spacing.md,
    gap: 6,
  },
  formatRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  formatLabel: { fontSize: text.caption.size, fontWeight: '500', color: L.textSub, letterSpacing: 0.3 },
  formatValue: { fontSize: text.body.size, fontWeight: '500', color: L.navy },

  // Score entry card
  scoreCard: {
    backgroundColor: L.bg,
    borderRadius: shape.card,
    borderWidth: 1, borderColor: L.border,
    padding: spacing.md,
    gap: 16,
  },
  scoreCardTitle: { fontSize: text.rowValue.size, fontWeight: '800', color: L.navy },
  steppers: { flexDirection: 'row', gap: 12 },

  // Winner preview
  winnerPreview: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: L.goldLight,
    borderRadius: shape.cta,
    borderWidth: 1, borderColor: L.goldBorder,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  winnerPreviewLabel: { fontSize: text.caption.size, fontWeight: '500', color: L.textSub },
  winnerPreviewName: { fontSize: text.rowValue.size, fontWeight: '800', color: L.navy, flex: 1 },

  // Tie warning
  tieWarning: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: L.dangerBg,
    borderRadius: shape.cta,
    borderWidth: 1, borderColor: colors.danger,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  tieWarningText: { fontSize: text.caption.size, color: L.danger, fontWeight: '500', flex: 1 },

  // Validation error
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: L.dangerBg,
    borderRadius: shape.cta,
    borderWidth: 1, borderColor: colors.danger,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  errorBannerText: { fontSize: text.caption.size, color: L.danger, fontWeight: '500', flex: 1 },

  // Not-found state
  errorState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  errorText: { fontSize: text.titleSm.size, fontWeight: '800', color: L.textSub },
  errorBtn: { paddingHorizontal: 20, paddingVertical: 10 },
  errorBtnText: { fontSize: text.actionLarge.size, color: '#007AFF', fontWeight: '800' },

  // Success state
  successState: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: 12, paddingHorizontal: spacing.screenH,
  },
  successIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: L.goldBg, borderWidth: 2, borderColor: L.goldBorder,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 8,
  },
  successTitle: { fontSize: text.pageTitle.size, fontWeight: '900', color: L.navy },
  successSub: { fontSize: text.body.size, fontWeight: '500', color: L.textSub, textAlign: 'center' },
  successScoreRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 4 },
  successScore: { fontSize: 48, fontWeight: '900', color: L.navy },
  successScoreDash: { fontSize: 32, fontWeight: '400', color: L.textSub },
  successBtn: { width: '100%', marginTop: 12 },
});
