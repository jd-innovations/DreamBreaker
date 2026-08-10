import React, { useCallback, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Modal, Pressable, Alert, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors, radius } from '@/theme';
import { StatusChip } from '@/components';
import { useSession } from '@/hooks/useSession';
import { requireAuth } from '@/lib/authGuard';
import { fetchTournamentById } from '@/lib/supabase/tournaments';
import { fetchTournamentRegistrations } from '@/lib/supabase/registrations';
import {
  fetchBracket,
  createBracket,
  validateScores,
  type DirectorBracket,
  type DirectorBracketMatch,
} from '@/lib/supabase/brackets';
import { assignCourt, saveMatchScore } from '@/lib/supabase/matches';
import { useSupportContext } from '@/lib/support/supportContext';
import type { TournamentRegistration } from '@/lib/registrationStore';
import type { Tournament } from '@/lib/tournamentTypes';

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

function matchStatusVariant(
  s: DirectorBracketMatch['status'],
): 'gray' | 'gold' | 'green' | 'navy' {
  switch (s) {
    case 'pending':     return 'gray';
    case 'scheduled':   return 'gold';
    case 'in_progress': return 'navy';
    case 'completed':   return 'green';
    default:            return 'gray';
  }
}

function matchStatusLabel(s: DirectorBracketMatch['status']): string {
  switch (s) {
    case 'pending':     return 'Pending';
    case 'scheduled':   return 'Scheduled';
    case 'in_progress': return 'Live';
    case 'completed':   return 'Completed';
    default:            return s;
  }
}

function bracketStatusVariant(s: DirectorBracket['status']): 'gray' | 'gold' | 'green' {
  switch (s) {
    case 'not_started': return 'gold';
    case 'in_progress': return 'gold';
    case 'completed':   return 'green';
    default:            return 'gray';
  }
}

function bracketStatusLabel(s: DirectorBracket['status']): string {
  switch (s) {
    case 'not_started': return 'Ready';
    case 'in_progress': return 'In Progress';
    case 'completed':   return 'Completed';
    default:            return s;
  }
}

function initials(name: string): string {
  return name.split(' ').map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase();
}

function comingSoon(feature: string) {
  Alert.alert('Coming Soon', `${feature} is not available yet.`);
}

// ─── Participant row ──────────────────────────────────────────────────────────

function ParticipantRow({
  participant, isWinner, isLoser, isBye, seed, score,
}: {
  participant: DirectorBracketMatch['participant1'];
  isWinner: boolean;
  isLoser: boolean;
  isBye: boolean;
  seed?: number;
  score?: number;
}) {
  const isEmpty = participant === null && !isBye;
  const txtColor = isLoser ? L.textSub : isWinner ? L.success : isEmpty ? L.textSub : L.navy;

  return (
    <View style={[
      pr.row,
      isWinner && { backgroundColor: L.successBg, borderColor: 'rgba(34,197,94,0.30)', borderWidth: 1, borderRadius: 8 },
    ]}>
      {seed !== undefined && (
        <View style={pr.seed}>
          <Text style={pr.seedText}>{isBye ? '' : seed}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={[pr.name, { color: txtColor, opacity: isLoser ? 0.5 : 1 }]} numberOfLines={1}>
          {isBye ? 'BYE' : isEmpty ? 'Awaiting...' : participant!.name}
        </Text>
        {participant?.partnerName && !isEmpty && !isBye && (
          <Text style={pr.partner} numberOfLines={1}>w/ {participant.partnerName}</Text>
        )}
      </View>
      {score !== undefined && (
        <Text style={[pr.score, { color: isWinner ? L.success : isLoser ? L.textSub : L.navy }]}>
          {score}
        </Text>
      )}
      {isWinner && <Ionicons name="trophy" size={13} color={L.success} />}
    </View>
  );
}

const pr = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  seed: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: L.page, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  seedText: { color: L.textSub, fontSize: 10, fontWeight: '700' },
  name:     { color: L.navy, fontSize: 13, fontWeight: '700' },
  partner:  { color: L.textSub, fontSize: 11, marginTop: 1 },
  score:    { fontSize: 18, fontWeight: '900', minWidth: 26, textAlign: 'right' },
});

// ─── Match card ───────────────────────────────────────────────────────────────

function MatchCard({
  match,
  onAssignCourt,
  onEnterScore,
}: {
  match: DirectorBracketMatch;
  onAssignCourt: (m: DirectorBracketMatch) => void;
  onEnterScore:  (m: DirectorBracketMatch) => void;
}) {
  const isCompleted = match.status === 'completed';
  const p1 = match.participant1;
  const p2 = match.participant2;
  const isDoubleBye = p1 === null && p2 === null;
  const isBye1 = p1 !== null && p2 === null && isCompleted;
  const isBye2 = p2 !== null && p1 === null && isCompleted;
  const canAssign  = !isCompleted && (p1 !== null || p2 !== null);
  const canScore   = !isCompleted && p1 !== null && p2 !== null;
  const isAwaiting = !isCompleted && (p1 === null || p2 === null) && !isDoubleBye;
  const hasScores  = match.score1 !== undefined && match.score2 !== undefined;

  if (isDoubleBye) return null;

  return (
    <View style={mc.card}>
      {/* Match header */}
      <View style={mc.header}>
        <Text style={mc.matchNum}>Match {match.matchNumber + 1}</Text>
        <StatusChip label={matchStatusLabel(match.status)} variant={matchStatusVariant(match.status)} />
      </View>

      {/* Court badge */}
      {match.courtNumber !== undefined && (
        <View style={mc.courtBadge}>
          <Ionicons name="location-outline" size={11} color={L.gold} />
          <Text style={mc.courtText}>Court {match.courtNumber}</Text>
        </View>
      )}

      {/* Participants + scores */}
      <View style={mc.participants}>
        <ParticipantRow
          participant={p1}
          isWinner={isCompleted && match.winnerId === p1?.id}
          isLoser={isCompleted && match.winnerId !== p1?.id && p1 !== null}
          isBye={isBye2}
          seed={p1?.seed}
          score={hasScores ? match.score1 : undefined}
        />
        <View style={mc.divider} />
        <ParticipantRow
          participant={p2}
          isWinner={isCompleted && match.winnerId === p2?.id}
          isLoser={isCompleted && match.winnerId !== p2?.id && p2 !== null}
          isBye={isBye1}
          seed={p2?.seed}
          score={hasScores ? match.score2 : undefined}
        />
      </View>

      {/* Awaiting */}
      {isAwaiting && (
        <View style={mc.awaiting}>
          <Ionicons name="time-outline" size={12} color={L.textSub} />
          <Text style={mc.awaitingText}>Awaiting Previous Round</Text>
        </View>
      )}

      {/* Action buttons */}
      {!isCompleted && !isAwaiting && (
        <View style={mc.actions}>
          <TouchableOpacity
            style={[mc.actionBtn, !canAssign && mc.actionBtnDisabled]}
            activeOpacity={canAssign ? 0.8 : 1}
            onPress={canAssign ? () => onAssignCourt(match) : undefined}
          >
            <Ionicons name="location-outline" size={13} color={canAssign ? L.navy : L.textSub} />
            <Text style={[mc.actionLabel, !canAssign && mc.actionLabelDisabled]}>
              {match.courtNumber !== undefined ? `Court ${match.courtNumber}` : 'Assign Court'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[mc.actionBtn, mc.actionBtnAccent, !canScore && mc.actionBtnDisabled]}
            activeOpacity={canScore ? 0.8 : 1}
            onPress={canScore ? () => onEnterScore(match) : undefined}
          >
            <Ionicons name="create-outline" size={13} color={canScore ? L.bg : L.textSub} />
            <Text style={[mc.actionLabelAccent, !canScore && mc.actionLabelDisabled]}>
              Enter Score
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Completed footer */}
      {isCompleted && (
        <View style={mc.completedRow}>
          <Ionicons name="checkmark-circle" size={13} color={L.success} />
          <Text style={mc.completedText}>
            {hasScores ? `${match.score1} – ${match.score2}` : 'Completed'}
          </Text>
        </View>
      )}
    </View>
  );
}

const mc = StyleSheet.create({
  card: {
    width: 220, backgroundColor: L.bg, borderWidth: 1, borderColor: L.border,
    borderRadius: radius.card, overflow: 'hidden', marginBottom: 10,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 10, paddingTop: 10, paddingBottom: 6,
  },
  matchNum: { color: L.textSub, fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  courtBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: L.goldBg, paddingHorizontal: 10, paddingVertical: 5,
    borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: L.goldBorder,
  },
  courtText:  { color: L.gold, fontSize: 11, fontWeight: '700' },
  participants:{ borderTopWidth: StyleSheet.hairlineWidth, borderColor: L.border },
  divider:    { height: StyleSheet.hairlineWidth, backgroundColor: L.border, marginHorizontal: 10 },
  awaiting:   {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth, borderColor: L.border,
  },
  awaitingText: { color: L.textSub, fontSize: 11, fontStyle: 'italic' },
  actions: {
    flexDirection: 'row', gap: 6, padding: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderColor: L.border,
  },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    borderWidth: 1, borderColor: L.border, borderRadius: 8, paddingVertical: 8,
  },
  actionBtnAccent:    { backgroundColor: L.navy, borderColor: L.navy },
  actionBtnDisabled:  { opacity: 0.4 },
  actionLabel:        { color: L.navy, fontSize: 11, fontWeight: '700' },
  actionLabelAccent:  { color: L.bg, fontSize: 11, fontWeight: '700' },
  actionLabelDisabled:{ color: L.textSub },
  completedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth, borderColor: L.border,
  },
  completedText: { color: L.success, fontSize: 13, fontWeight: '800' },
});

// ─── Court assignment modal ───────────────────────────────────────────────────

const COURTS = [1, 2, 3, 4, 5, 6];

function CourtModal({
  match, onSelect, onClose,
}: { match: DirectorBracketMatch; onSelect: (c: number) => void; onClose: () => void }) {
  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={cm.backdrop} onPress={onClose}>
        <Pressable style={cm.sheet} onPress={() => {}}>
          <View style={cm.handle} />
          <Text style={cm.title}>Assign Court</Text>
          <Text style={cm.sub}>Match {match.matchNumber + 1} — {match.roundName}</Text>
          <View style={cm.grid}>
            {COURTS.map(c => (
              <TouchableOpacity
                key={c}
                style={[cm.courtBtn, match.courtNumber === c && cm.courtBtnSelected]}
                activeOpacity={0.8}
                onPress={() => onSelect(c)}
              >
                <Ionicons name="location" size={20} color={match.courtNumber === c ? L.bg : L.navy} />
                <Text style={[cm.courtLabel, match.courtNumber === c && cm.courtLabelSelected]}>
                  Court {c}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={cm.cancelBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={cm.cancelLabel}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const cm = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(10,18,40,0.50)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: L.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingBottom: 32,
  },
  handle:   { width: 36, height: 4, borderRadius: 2, backgroundColor: L.border, alignSelf: 'center', marginVertical: 12 },
  title:    { color: L.navy, fontSize: 18, fontWeight: '800', marginBottom: 4 },
  sub:      { color: L.textSub, fontSize: 13, marginBottom: 18 },
  grid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  courtBtn: {
    width: '30%', aspectRatio: 1.3, alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: L.page, borderWidth: 1, borderColor: L.border, borderRadius: 12,
  },
  courtBtnSelected:   { backgroundColor: L.navy, borderColor: L.navy },
  courtLabel:         { color: L.navy, fontSize: 13, fontWeight: '700' },
  courtLabelSelected: { color: L.bg },
  cancelBtn: { alignItems: 'center', paddingVertical: 14, borderWidth: 1, borderColor: L.border, borderRadius: 12 },
  cancelLabel: { color: L.textSub, fontSize: 15, fontWeight: '600' },
});

// ─── Match result modal (Phase 3) ─────────────────────────────────────────────

function MatchResultModal({
  match,
  bottomInset,
  onSave,
  onClose,
}: {
  match: DirectorBracketMatch;
  bottomInset: number;
  onSave: (score1: number, score2: number) => void;
  onClose: () => void;
}) {
  const [s1, setS1] = useState(match.score1 !== undefined ? String(match.score1) : '');
  const [s2, setS2] = useState(match.score2 !== undefined ? String(match.score2) : '');
  const p1 = match.participant1;
  const p2 = match.participant2;

  if (!p1 || !p2) return null;

  function handleSave() {
    const n1 = parseInt(s1.trim(), 10);
    const n2 = parseInt(s2.trim(), 10);
    if (isNaN(n1) || isNaN(n2)) {
      Alert.alert('Invalid Scores', 'Please enter a score for each player.');
      return;
    }
    const validationError = validateScores(n1, n2);
    if (validationError) {
      Alert.alert('Invalid Score', validationError);
      return;
    }
    onSave(n1, n2);
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <Pressable style={rm.backdrop} onPress={onClose}>
          <Pressable style={[rm.sheet, { paddingBottom: bottomInset + 24 }]} onPress={() => {}}>
            <View style={rm.handle} />
            <Text style={rm.title}>Enter Match Result</Text>
            <Text style={rm.sub}>
              {match.roundName}  ·  Match {match.matchNumber + 1}
              {match.courtNumber !== undefined ? `  ·  Court ${match.courtNumber}` : ''}
            </Text>

            {/* Score row */}
            <View style={rm.scoreRow}>
              <View style={rm.playerBlock}>
                <Text style={rm.playerName} numberOfLines={1}>{p1.name}</Text>
                {p1.partnerName && (
                  <Text style={rm.playerPartner} numberOfLines={1}>w/ {p1.partnerName}</Text>
                )}
                <TextInput
                  style={rm.scoreInput}
                  keyboardType="number-pad"
                  maxLength={2}
                  value={s1}
                  onChangeText={setS1}
                  placeholder="0"
                  placeholderTextColor={L.textSub}
                  selectTextOnFocus
                  returnKeyType="done"
                />
              </View>

              <View style={rm.vsCol}>
                <Text style={rm.vs}>VS</Text>
              </View>

              <View style={rm.playerBlock}>
                <Text style={rm.playerName} numberOfLines={1}>{p2.name}</Text>
                {p2.partnerName && (
                  <Text style={rm.playerPartner} numberOfLines={1}>w/ {p2.partnerName}</Text>
                )}
                <TextInput
                  style={rm.scoreInput}
                  keyboardType="number-pad"
                  maxLength={2}
                  value={s2}
                  onChangeText={setS2}
                  placeholder="0"
                  placeholderTextColor={L.textSub}
                  selectTextOnFocus
                  returnKeyType="done"
                />
              </View>
            </View>

            {/* Validation hint */}
            <View style={rm.hint}>
              <Ionicons name="information-circle-outline" size={13} color={L.textSub} />
              <Text style={rm.hintText}>Win to 11, win by 2  ·  e.g. 11–9, 12–10, 15–13</Text>
            </View>

            <TouchableOpacity style={rm.saveBtn} activeOpacity={0.85} onPress={handleSave}>
              <Text style={rm.saveBtnText}>Save Result</Text>
            </TouchableOpacity>
            <TouchableOpacity style={rm.cancelBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={rm.cancelLabel}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const rm = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(10,18,40,0.50)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: L.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: L.border, alignSelf: 'center', marginVertical: 12 },
  title:  { color: L.navy, fontSize: 18, fontWeight: '800', marginBottom: 4 },
  sub:    { color: L.textSub, fontSize: 13, marginBottom: 20 },

  scoreRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginBottom: 16 },
  playerBlock: { flex: 1, gap: 4 },
  playerName:  { color: L.navy, fontSize: 14, fontWeight: '800' },
  playerPartner:{ color: L.textSub, fontSize: 12 },
  scoreInput: {
    borderWidth: 2, borderColor: L.border, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 28, fontWeight: '900', color: L.navy,
    textAlign: 'center', backgroundColor: L.page,
  },
  vsCol: { alignItems: 'center', paddingBottom: 10 },
  vs:    { color: L.textSub, fontSize: 13, fontWeight: '800', letterSpacing: 1 },

  hint: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: L.page, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8, marginBottom: 16,
  },
  hintText: { color: L.textSub, fontSize: 12 },

  saveBtn: {
    backgroundColor: L.navy, borderRadius: 12,
    alignItems: 'center', paddingVertical: 15, marginBottom: 10,
  },
  saveBtnText: { color: L.bg, fontSize: 16, fontWeight: '800' },

  cancelBtn: { alignItems: 'center', paddingVertical: 14, borderWidth: 1, borderColor: L.border, borderRadius: 12 },
  cancelLabel: { color: L.textSub, fontSize: 15, fontWeight: '600' },
});

// ─── Context menu (Phase 12) ──────────────────────────────────────────────────

function ContextMenu({
  visible, tournamentId, divisionId, onRegenerate, onClose,
}: {
  visible: boolean;
  tournamentId: string;
  divisionId: string;
  onRegenerate: () => void;
  onClose: () => void;
}) {
  if (!visible) return null;

  const items = [
    { label: 'Share Bracket',      icon: 'share-outline' as const,       onPress: () => { onClose(); comingSoon('Share Bracket'); } },
    { label: 'Export Bracket',     icon: 'download-outline' as const,     onPress: () => { onClose(); comingSoon('Export Bracket'); } },
    { label: 'View Results',       icon: 'trophy-outline' as const,       onPress: () => { onClose(); router.push(`/tournament/${tournamentId}/results` as never); } },
    { label: 'Regenerate Bracket', icon: 'refresh-outline' as const,      onPress: () => { onClose(); onRegenerate(); }, danger: true },
    { label: 'Return to Brackets', icon: 'arrow-back-outline' as const,   onPress: () => { onClose(); router.back(); } },
    { label: 'Command Center',     icon: 'grid-outline' as const,         onPress: () => { onClose(); router.push(`/tournament/${tournamentId}/command-center` as never); } },
  ];

  return (
    <Pressable style={ctx.overlay} onPress={onClose}>
      <View style={ctx.menu}>
        {items.map((item, i) => (
          <TouchableOpacity
            key={item.label}
            style={[ctx.item, i < items.length - 1 && ctx.itemBorder]}
            activeOpacity={0.8}
            onPress={item.onPress}
          >
            <Ionicons name={item.icon} size={16} color={item.danger ? L.danger : L.navy} />
            <Text style={[ctx.label, item.danger && ctx.labelDanger]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </Pressable>
  );
}

const ctx = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 100 },
  menu: {
    position: 'absolute', top: 56, right: 16,
    backgroundColor: L.bg, borderWidth: 1, borderColor: L.border, borderRadius: 14,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 8,
    minWidth: 210, overflow: 'hidden', zIndex: 101,
  },
  item:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13 },
  itemBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border },
  label:      { color: L.navy, fontSize: 14, fontWeight: '600' },
  labelDanger:{ color: L.danger },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function DivisionBracketScreen() {
  const insets = useSafeAreaInsets();
  const { id, divisionId } = useLocalSearchParams<{ id: string; divisionId: string }>();
  const { user, loading: authLoading } = useSession();

  useEffect(() => {
    if (!authLoading && !user) router.replace('/sign-in' as never);
  }, [user, authLoading]);

  const [tournament,    setTournament]    = useState<Tournament | null>(null);
  const [bracket,       setBracket]       = useState<DirectorBracket | null>(null);
  const [registrations, setRegistrations] = useState<TournamentRegistration[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [roundFilter,   setRoundFilter]   = useState<string>('All');
  const [courtTarget,   setCourtTarget]   = useState<DirectorBracketMatch | null>(null);
  const [matchTarget,   setMatchTarget]   = useState<DirectorBracketMatch | null>(null);
  const [menuOpen,      setMenuOpen]      = useState(false);

  useSupportContext({
    feature: 'tournament_bracket',
    entityType: 'tournament',
    entityId: id,
    entityLabel: tournament?.name,
    // Dense screen -- icon-only per §7/§8 rather than the full labeled button.
    visibility: 'minimized',
  });

  const refresh = useCallback(async () => {
    const [t, bkt, regs] = await Promise.all([
      fetchTournamentById(id),
      fetchBracket(id, divisionId),
      fetchTournamentRegistrations(id),
    ]);
    setTournament(t);
    setBracket(bkt);
    setRegistrations(regs);
    setLoading(false);
  }, [id, divisionId]);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    refresh().then(() => { if (!active) return; }).catch(() => setLoading(false));
    return () => { active = false; };
  }, [refresh]));

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.page }}>
        <ActivityIndicator color={colors.gold} size="large" />
      </View>
    );
  }

  if (!bracket) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={24} color={L.navy} />
          </TouchableOpacity>
          <Text style={s.title}>No Bracket</Text>
        </View>
        <View style={s.noBracket}>
          <Ionicons name="git-branch-outline" size={52} color={L.textSub} />
          <Text style={s.noBracketTitle}>Bracket not generated</Text>
          <Text style={s.noBracketSub}>Go back to Brackets and generate a bracket for this division.</Text>
          <TouchableOpacity style={s.noBracketBtn} activeOpacity={0.8} onPress={() => router.back()}>
            <Text style={s.noBracketBtnText}>Back to Brackets</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const roundTabs    = ['All', ...bracket.rounds.map(r => r.roundName)];
  const visibleRounds =
    roundFilter === 'All'
      ? bracket.rounds
      : bracket.rounds.filter(r => r.roundName === roundFilter);

  // Phase 10: bracket summary counts
  const allMatches  = bracket.rounds.flatMap(r => r.matches).filter(
    m => m.participant1 !== null || m.participant2 !== null,
  );
  const totalMatches    = allMatches.length;
  const playedMatches   = allMatches.filter(m => m.status === 'completed').length;
  const remainingMatches = totalMatches - playedMatches;

  const tournamentId = tournament?.id ?? id;

  function handleCourtSelect(court: number) {
    if (!courtTarget) return;
    requireAuth(user?.id, () => {
      assignCourt(courtTarget.id, court)
        .then(() => refresh())
        .then(() => setCourtTarget(null));
    });
  }

  function handleSaveScore(score1: number, score2: number) {
    if (!matchTarget) return;
    requireAuth(user?.id, () => saveMatchScore(matchTarget!.id, score1, score2).then(async error => {
      if (error) {
        Alert.alert('Invalid Score', error);
        return;
      }
      setMatchTarget(null);
      await refresh();
      if (bracket?.status === 'completed') {
        Alert.alert(
          'Division Complete!',
          `Champion: ${bracket.championName ?? 'TBD'}\nRunner-Up: ${bracket.runnerUpName ?? 'TBD'}`,
          [
            { text: 'View Results', onPress: () => router.push(`/tournament/${tournamentId}/results` as never) },
            { text: 'OK' },
          ],
        );
      }
    }));
  }

  function handleRegenerate() {
    requireAuth(user?.id, () => Alert.alert(
      'Regenerate Bracket',
      'This will delete the current bracket and all match results. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Regenerate',
          style: 'destructive',
          onPress: () => {
            const divRegs = registrations.filter(r => r.divisionId === divisionId);
            createBracket(tournamentId, divisionId, bracket?.divisionName ?? '', divRegs)
              .then(() => refresh());
          },
        },
      ],
    ));
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={L.navy} />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.title} numberOfLines={1}>{bracket.divisionName}</Text>
          <Text style={s.sub}>Bracket Management</Text>
        </View>
        <View style={s.headerRight}>
          <TouchableOpacity style={s.iconBtn} activeOpacity={0.7} onPress={() => comingSoon('Share')}>
            <Ionicons name="share-outline" size={20} color={L.navy} />
          </TouchableOpacity>
          <TouchableOpacity style={s.iconBtn} activeOpacity={0.7} onPress={() => setMenuOpen(v => !v)}>
            <Ionicons name="ellipsis-vertical" size={20} color={L.navy} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Champion banner (Phase 5) ── */}
      {bracket.status === 'completed' && bracket.championName && (
        <View style={s.championBanner}>
          <Ionicons name="trophy" size={18} color={L.gold} />
          <View style={{ flex: 1 }}>
            <Text style={s.championLabel}>Champion</Text>
            <Text style={s.championName}>{bracket.championName}</Text>
          </View>
          <TouchableOpacity
            style={s.resultsLink}
            activeOpacity={0.8}
            onPress={() => router.push(`/tournament/${tournamentId}/results` as never)}
          >
            <Text style={s.resultsLinkText}>Results</Text>
            <Ionicons name="chevron-forward" size={13} color={L.gold} />
          </TouchableOpacity>
        </View>
      )}

      {/* ── Division summary strip (Phase 10) ── */}
      <View style={s.summaryStrip}>
        <View style={s.summaryItem}>
          <Text style={s.summaryNum}>{bracket.participants.length}</Text>
          <Text style={s.summaryLabel}>PLAYERS</Text>
        </View>
        <View style={s.summaryDiv} />
        <View style={s.summaryItem}>
          <Text style={s.summaryNum}>{bracket.bracketSize}</Text>
          <Text style={s.summaryLabel}>BRACKET</Text>
        </View>
        <View style={s.summaryDiv} />
        <View style={s.summaryItem}>
          <Text style={[s.summaryNum, { color: L.success }]}>{playedMatches}</Text>
          <Text style={s.summaryLabel}>PLAYED</Text>
        </View>
        <View style={s.summaryDiv} />
        <View style={s.summaryItem}>
          <Text style={[s.summaryNum, { color: remainingMatches > 0 ? L.gold : L.success }]}>
            {remainingMatches}
          </Text>
          <Text style={s.summaryLabel}>REMAINING</Text>
        </View>
        <View style={s.summaryDiv} />
        <StatusChip
          label={bracketStatusLabel(bracket.status)}
          variant={bracketStatusVariant(bracket.status)}
        />
      </View>

      {/* ── Round filter tabs ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.tabScroll}
        contentContainerStyle={s.tabRow}
      >
        {roundTabs.map(tab => {
          const active = roundFilter === tab;
          return (
            <TouchableOpacity
              key={tab}
              style={[s.tab, active && s.tabActive]}
              activeOpacity={0.7}
              onPress={() => setRoundFilter(tab)}
            >
              <Text style={[s.tabLabel, active && s.tabLabelActive]}>{tab}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Bracket view ── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.bracketScroll}
        >
          {visibleRounds.map(round => (
            <View key={round.id} style={s.roundCol}>
              <Text style={s.roundHeader}>{round.roundName}</Text>
              {round.matches.map(match => {
                if (match.participant1 === null && match.participant2 === null) return null;
                return (
                  <MatchCard
                    key={match.id}
                    match={match}
                    onAssignCourt={setCourtTarget}
                    onEnterScore={setMatchTarget}
                  />
                );
              })}
            </View>
          ))}
        </ScrollView>
      </ScrollView>

      {/* ── Context menu ── */}
      <ContextMenu
        visible={menuOpen}
        tournamentId={tournamentId}
        divisionId={divisionId}
        onRegenerate={handleRegenerate}
        onClose={() => setMenuOpen(false)}
      />

      {/* ── Court modal ── */}
      {courtTarget && (
        <CourtModal
          match={courtTarget}
          onSelect={handleCourtSelect}
          onClose={() => setCourtTarget(null)}
        />
      )}

      {/* ── Match result modal ── */}
      {matchTarget && (
        <MatchResultModal
          match={matchTarget}
          bottomInset={insets.bottom}
          onSave={handleSaveScore}
          onClose={() => setMatchTarget(null)}
        />
      )}
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
  backBtn:    { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title:      { color: L.navy, fontSize: 17, fontWeight: '800' },
  sub:        { color: L.textSub, fontSize: 12, fontWeight: '500', marginTop: 1 },
  headerRight:{ flexDirection: 'row', gap: 4 },
  iconBtn:    { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },

  championBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: L.goldBg, borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: L.goldBorder, paddingHorizontal: 16, paddingVertical: 12,
  },
  championLabel: { color: L.gold, fontSize: 10, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  championName:  { color: L.navy, fontSize: 15, fontWeight: '800' },
  resultsLink: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  resultsLinkText: { color: L.gold, fontSize: 13, fontWeight: '700' },

  summaryStrip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, gap: 10,
    backgroundColor: L.bg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  summaryItem:  { alignItems: 'center', gap: 2 },
  summaryDiv:   { width: StyleSheet.hairlineWidth, height: 28, backgroundColor: L.border },
  summaryNum:   { color: L.navy, fontSize: 16, fontWeight: '900' },
  summaryLabel: { color: L.textSub, fontSize: 9, fontWeight: '700', letterSpacing: 0.4 },

  tabScroll:    { maxHeight: 44, backgroundColor: L.bg },
  tabRow: {
    paddingHorizontal: 16, paddingVertical: 8, gap: 8, flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  tab:          { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: L.border, backgroundColor: L.bg },
  tabActive:    { backgroundColor: L.navy, borderColor: L.navy },
  tabLabel:     { color: L.textSub, fontSize: 13, fontWeight: '700' },
  tabLabelActive:{ color: L.bg },

  bracketScroll: { paddingHorizontal: 16, paddingTop: 16, flexDirection: 'row', gap: 16 },
  roundCol:      { gap: 0 },
  roundHeader: {
    color: L.navy, fontSize: 13, fontWeight: '800', letterSpacing: 0.4,
    textTransform: 'uppercase', marginBottom: 10, paddingHorizontal: 2,
  },

  noBracket: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  noBracketTitle: { color: L.navy, fontSize: 17, fontWeight: '800' },
  noBracketSub:   { color: L.textSub, fontSize: 14, textAlign: 'center' },
  noBracketBtn: { backgroundColor: L.navy, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 13, marginTop: 8 },
  noBracketBtnText: { color: L.bg, fontSize: 15, fontWeight: '700' },
});
