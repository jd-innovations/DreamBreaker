import React, { useCallback, useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Modal, Pressable, Alert, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
  Animated, AccessibilityInfo,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { IS_INTERNAL_BUILD } from '@/lib/featureFlags';
import { StatusBar } from 'expo-status-bar';
import { colors } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
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
import { assignCourt, fetchCourtQueue, fetchCourtsInUse, saveMatchScore, type CourtInUse } from '@/lib/supabase/matches';
import { supabase } from '@/lib/supabase';
import { courtLabel } from '@/lib/tournamentCourts';
import { CourtsSheet } from '@/components/CourtsSheet';
import { buildBracketFromPools, fetchDivisionPools, planBracketFromPools, type BracketPlan, type DivisionPools } from '@/lib/supabase/pools';
import { BuildBracketSheet } from '@/components/BuildBracketSheet';
import { useSupportContext } from '@/lib/support/supportContext';
import type { TournamentRegistration } from '@/lib/registrationStore';
import type { Tournament } from '@/lib/tournamentTypes';
import { DirectorOnly } from '@/components/DirectorOnly';
import { confirmBracketFormat } from '@/lib/tournamentFormats';

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
  seedText: { color: L.textSub, fontSize: text.microLabel.size, fontWeight: '700' },
  name: { color: L.navy, fontSize: text.rowTitle.size, fontWeight: '700' },
  partner: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', marginTop: 1 },
  score: { fontSize: text.modalTitle.size, fontWeight: '900', minWidth: 26, textAlign: 'right' },
});

// ─── Match card ───────────────────────────────────────────────────────────────

// How many queued matches get an "Up next" badge.
const UP_NEXT_SHOWN = 5;

// Queue banner on a match card. #1 (gets the next free court) is solid gold
// and pulses so it reads from across a facility; #2-5 are a calm "ON DECK"
// so the screen isn't a wall of blinking cards. Reduce Motion: no pulse.
function UpNextBanner({ position }: { position: number }) {
  const first = position === 1;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!first) return;
    let loop: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(reduce => {
        if (cancelled || reduce) return;
        loop = Animated.loop(
          Animated.sequence([
            Animated.timing(opacity, { toValue: 0.45, duration: 750, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 1, duration: 750, useNativeDriver: true }),
          ]),
        );
        loop.start();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      loop?.stop();
      opacity.setValue(1);
    };
  }, [first, opacity]);

  return (
    <Animated.View
      style={[mc.upNextBadge, first ? mc.upNextFirst : mc.upNextDeck, first && { opacity }]}
      accessibilityLabel={first ? 'Up next' : `On deck, number ${position}`}
    >
      <Ionicons name={first ? 'megaphone' : 'hourglass-outline'} size={first ? 13 : 11} color={first ? L.navy : colors.danger} />
      <Text style={[mc.upNextText, first ? mc.upNextTextFirst : mc.onDeckText]}>
        {first ? 'UP NEXT' : `ON DECK #${position}`}
      </Text>
    </Animated.View>
  );
}

function MatchCard({
  match,
  queuePos,
  onAssignCourt,
  onEnterScore,
}: {
  match: DirectorBracketMatch;
  /** 1-based place in the tournament-wide court queue (court_queue()), if waiting. */
  queuePos?: number;
  onAssignCourt: (m: DirectorBracketMatch) => void;
  onEnterScore:  (m: DirectorBracketMatch) => void;
}) {
  const isCompleted = match.status === 'completed';
  const p1 = match.participant1;
  const p2 = match.participant2;
  // A PERMANENT double bye only exists in round 0: a first-round slot that
  // was empty from seeding (more bracket slots than entrants) and will never
  // fill. From round 1 on, "both null" instead means "awaiting both feeder
  // matches" — it WILL resolve once earlier rounds are scored. Conflating the
  // two hid every later round entirely before any match had been played:
  // Round of 16 showed a header and nothing else, because every one of its
  // matches was "both null" and got treated as a dead bye.
  const isDoubleBye = p1 === null && p2 === null && match.roundIndex === 0;
  const isBye1 = p1 !== null && p2 === null && isCompleted;
  const isBye2 = p2 !== null && p1 === null && isCompleted;
  // A court is only held by a match that can start: both sides known.
  const canAssign  = !isCompleted && p1 !== null && p2 !== null;
  const canScore   = !isCompleted && p1 !== null && p2 !== null;
  const isAwaiting = !isCompleted && (p1 === null || p2 === null) && !isDoubleBye;
  const hasScores  = match.score1 !== undefined && match.score2 !== undefined;

  if (isDoubleBye) return null;

  // On court now (assigned, unfinished) vs. waiting near the front of the queue.
  const onCourt = match.court !== undefined && !isCompleted;
  const upNext = !onCourt && queuePos !== undefined && queuePos <= UP_NEXT_SHOWN ? queuePos : undefined;

  return (
    <View style={[mc.card, onCourt && mc.cardOnCourt, upNext !== undefined && (upNext === 1 ? mc.cardUpFirst : mc.cardUpNext)]}>
      {/* Match header */}
      <View style={mc.header}>
        <Text style={mc.matchNum}>Match {match.matchNumber + 1}</Text>
        <StatusChip label={matchStatusLabel(match.status)} variant={matchStatusVariant(match.status)} />
      </View>

      {upNext !== undefined && <UpNextBanner position={upNext} />}

      {/* Court badge */}
      {match.court !== undefined && (
        <View style={[mc.courtBadge, onCourt && mc.courtBadgeLive]}>
          <Ionicons name={onCourt ? 'radio-button-on' : 'location-outline'} size={11} color={onCourt ? L.bg : L.gold} />
          <Text style={[mc.courtText, onCourt && mc.courtTextLive]}>
            {onCourt ? `ON ${courtLabel(match.court).toUpperCase()}` : courtLabel(match.court)}
          </Text>
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
            <Ionicons name="location-outline" size={12} color={canAssign ? L.navy : L.textSub} />
            {/* numberOfLines + adjustsFontSizeToFit: a safety net on top of the
                width fix above, so a locale with a longer label (or an
                unusually wide court number) shrinks a point rather than
                wrapping onto a second line and colliding with the next
                button, which is what "Assign Court" / "Enter Score" were
                doing at the old card width. */}
            <Text
              style={[mc.actionLabel, !canAssign && mc.actionLabelDisabled]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
            >
              {match.court !== undefined ? courtLabel(match.court) : 'Assign Court'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[mc.actionBtn, mc.actionBtnAccent, !canScore && mc.actionBtnDisabled]}
            activeOpacity={canScore ? 0.8 : 1}
            onPress={canScore ? () => onEnterScore(match) : undefined}
          >
            <Ionicons name="create-outline" size={12} color={canScore ? L.bg : L.textSub} />
            <Text
              style={[mc.actionLabelAccent, !canScore && mc.actionLabelDisabled]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
            >
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
    // 220 left no room for the two action-button labels below ("Assign
    // Court" / "Enter Score") at their bold, letter-spaced size — the text
    // overflowed its button and visually collided with its neighbour.
    // Nothing else in this file keys off this number (checked: no connector
    // lines, no other hardcoded 220), so widening it is a safe, local fix.
    width: 240, backgroundColor: L.bg, borderWidth: 1, borderColor: L.border,
    borderRadius: shape.card, overflow: 'hidden', marginBottom: 10,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 10, paddingTop: 10, paddingBottom: 6,
  },
  matchNum: { color: L.textSub, fontSize: text.cardLabel.size, fontWeight: '800', letterSpacing: text.cardLabel.letterSpacing },
  courtBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: L.goldBg, paddingHorizontal: 10, paddingVertical: 5,
    borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: L.goldBorder,
  },
  courtText: { color: L.gold, fontSize: text.cardLabel.size, fontWeight: '800', letterSpacing: text.cardLabel.letterSpacing },
  cardOnCourt: { borderColor: L.gold, borderWidth: 2 },
  cardUpNext: { borderColor: L.goldBorder, borderWidth: 1.5 },
  cardUpFirst: { borderColor: L.navy, borderWidth: 2 },
  courtBadgeLive: { backgroundColor: L.gold, borderColor: L.gold },
  courtTextLive: { color: L.bg },
  upNextBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5,
    borderTopWidth: StyleSheet.hairlineWidth, borderColor: L.border,
  },
  upNextFirst: { backgroundColor: L.gold, paddingVertical: 8, borderColor: L.gold },
  upNextDeck: { backgroundColor: L.goldBg, borderColor: L.goldBorder },
  upNextText: { color: L.navy, fontSize: text.cardLabel.size, fontWeight: '800', letterSpacing: text.cardLabel.letterSpacing },
  upNextTextFirst: { fontSize: text.rowTitle.size, fontWeight: '900' },
  onDeckText: { color: colors.danger },
  participants: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: L.border },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: L.border, marginHorizontal: 10 },
  awaiting: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth, borderColor: L.border,
  },
  awaitingText: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', fontStyle: 'italic' },
  actions: {
    flexDirection: 'row', gap: 4, padding: 8,
    borderTopWidth: StyleSheet.hairlineWidth, borderColor: L.border,
  },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    // A little horizontal padding INSIDE each button, not none: with zero
    // padding the label sat flush against the border, which read as even
    // more cramped than the missing space actually was.
    borderWidth: 1, borderColor: L.border, borderRadius: shape.badge,
    paddingVertical: 8, paddingHorizontal: 4,
  },
  actionBtnAccent: { backgroundColor: L.navy, borderColor: L.navy },
  actionBtnDisabled: { opacity: 0.4 },
  // microLabel (10/700, no tracking) rather than cardLabel (11/800/ls0.8) —
  // the smallest role in the shared scale, picked because these two labels
  // are exactly the "under a button, no room to spare" case it exists for.
  // Also buys back the width text.cardLabel's letter-spacing was spending.
  // Matches this file's existing convention (see tabLabel below): size comes
  // from the token, weight is written as the plain string RN's fontWeight
  // wants, matching the token's own (numeric) 700.
  actionLabel: { color: L.navy, fontSize: text.microLabel.size, fontWeight: '700' },
  actionLabelAccent: { color: L.bg, fontSize: text.microLabel.size, fontWeight: '700' },
  actionLabelDisabled: { color: L.textSub },
  completedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth, borderColor: L.border,
  },
  completedText: { color: L.success, fontSize: text.rowValue.size, fontWeight: '800' },
});

// ─── Court assignment modal ───────────────────────────────────────────────────
// Lists the tournament's own courts (tournaments.courts, by real name) with
// live status across EVERY division: a court is in use while a match on it is
// unfinished, and frees itself when that match's score is saved.

function CourtModal({
  match, courts, inUse, loadingUse, onSelect, onClear, onManage, onClose,
}: {
  match: DirectorBracketMatch;
  courts: string[];
  inUse: CourtInUse[];
  loadingUse: boolean;
  onSelect: (court: string) => void;
  onClear: () => void;
  onManage: () => void;
  onClose: () => void;
}) {
  const busy = new Map(inUse.filter(u => u.matchId !== match.id).map(u => [u.court, u]));
  const current = match.court;
  const currentNotListed = current !== undefined && !courts.includes(current);

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={cm.backdrop} onPress={onClose}>
        <Pressable style={cm.sheet} onPress={() => {}}>
          <View style={cm.handle} />
          <Text style={cm.title}>Assign Court</Text>
          <Text style={cm.sub}>Match {match.matchNumber + 1} — {match.roundName}</Text>

          {courts.length === 0 ? (
            <View style={cm.empty}>
              <Text style={cm.emptyText}>
                This tournament has no courts set yet. Add the courts reserved at the venue, e.g. 7-12.
              </Text>
              <TouchableOpacity style={cm.primaryBtn} onPress={onManage} activeOpacity={0.85}>
                <Text style={cm.primaryLabel}>Set up courts</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {loadingUse && <ActivityIndicator color={L.gold} style={{ marginBottom: 10 }} />}
              <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={cm.grid}>
                {courts.map(c => {
                  const mine = current === c;
                  const taken = busy.get(c);
                  const disabled = !!taken || mine || loadingUse;
                  return (
                    <TouchableOpacity
                      key={c}
                      style={[cm.courtBtn, mine && cm.courtBtnSelected, taken && cm.courtBtnBusy]}
                      activeOpacity={0.8}
                      disabled={disabled}
                      onPress={() => onSelect(c)}
                      accessibilityRole="button"
                      accessibilityState={{ disabled, selected: mine }}
                      accessibilityLabel={
                        taken ? `${courtLabel(c)}, in use` : mine ? `${courtLabel(c)}, this match` : `${courtLabel(c)}, available`
                      }
                    >
                      <Text style={[cm.courtLabel, mine && cm.courtLabelSelected, taken && cm.courtLabelBusy]} numberOfLines={1}>
                        {courtLabel(c)}
                      </Text>
                      <Text
                        style={[cm.courtStatus, mine && cm.courtLabelSelected, taken && cm.courtStatusBusy]}
                        numberOfLines={2}
                      >
                        {mine
                          ? 'This match'
                          : taken
                            ? `In use · ${taken.divisionName} ${taken.roundName} M${taken.matchNumber + 1}`
                            : 'Available'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              {currentNotListed && (
                <Text style={cm.note}>
                  This match is on {courtLabel(current)}, which is no longer in the tournament&apos;s courts.
                </Text>
              )}
            </>
          )}

          <View style={cm.footerRow}>
            {current !== undefined && (
              <TouchableOpacity style={cm.footerBtn} onPress={onClear} activeOpacity={0.7}>
                <Text style={cm.footerLabel}>Clear court</Text>
              </TouchableOpacity>
            )}
            {courts.length > 0 && (
              <TouchableOpacity style={cm.footerBtn} onPress={onManage} activeOpacity={0.7}>
                <Text style={cm.footerLabel}>Manage courts</Text>
              </TouchableOpacity>
            )}
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
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: L.border, alignSelf: 'center', marginVertical: 12 },
  title: { color: L.navy, fontSize: text.modalTitle.size, fontWeight: '900', marginBottom: 4 },
  sub: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', marginBottom: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  courtBtn: {
    width: '30%', aspectRatio: 1.3, alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: L.page, borderWidth: 1, borderColor: L.border, borderRadius: shape.cta,
  },
  courtBtnSelected: { backgroundColor: L.navy, borderColor: L.navy },
  courtBtnBusy: { backgroundColor: L.bg, borderStyle: 'dashed' },
  courtLabel: { color: L.navy, fontSize: text.controlLabel.size, fontWeight: '700' },
  courtLabelSelected: { color: L.bg },
  courtLabelBusy: { color: L.textSub },
  courtStatus: { color: L.success, fontSize: 10, fontWeight: '700', textAlign: 'center', paddingHorizontal: 4 },
  courtStatusBusy: { color: L.textSub, fontWeight: '600' },
  empty: { gap: 12, marginBottom: 12 },
  emptyText: { color: L.text, fontSize: text.caption.size, fontWeight: '500', lineHeight: 19 },
  primaryBtn: { backgroundColor: L.navy, borderRadius: shape.cta, paddingVertical: 13, alignItems: 'center' },
  primaryLabel: { color: L.bg, fontSize: text.action.size, fontWeight: '800' },
  note: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', marginBottom: 10 },
  footerRow: { flexDirection: 'row', justifyContent: 'center', gap: 24, marginBottom: 12 },
  footerBtn: { paddingVertical: 6 },
  footerLabel: { color: L.navy, fontSize: text.action.size, fontWeight: '800', textDecorationLine: 'underline' },
  cancelBtn: { alignItems: 'center', paddingVertical: 14, borderWidth: 1, borderColor: L.border, borderRadius: shape.cta },
  cancelLabel: { color: L.textSub, fontSize: text.action.size, fontWeight: '800' },
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
              {match.court !== undefined ? `  ·  ${courtLabel(match.court)}` : ''}
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
  title: { color: L.navy, fontSize: text.modalTitle.size, fontWeight: '900', marginBottom: 4 },
  sub: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', marginBottom: 20 },

  scoreRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginBottom: 16 },
  playerBlock: { flex: 1, gap: 4 },
  playerName: { color: L.navy, fontSize: text.rowValue.size, fontWeight: '800' },
  playerPartner: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500' },
  scoreInput: {
    borderWidth: 2, borderColor: L.border, borderRadius: shape.cta,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: text.pageTitle.size, fontWeight: '900', color: L.navy,
    textAlign: 'center', backgroundColor: L.page,
  },
  vsCol: { alignItems: 'center', paddingBottom: 10 },
  vs: { color: L.textSub, fontSize: text.rowValue.size, fontWeight: '800', letterSpacing: 1 },

  hint: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: L.page, borderRadius: shape.badge,
    paddingHorizontal: 12, paddingVertical: 8, marginBottom: 16,
  },
  hintText: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500' },

  saveBtn: {
    backgroundColor: L.navy, borderRadius: shape.cta,
    alignItems: 'center', paddingVertical: 15, marginBottom: 10,
  },
  saveBtnText: { color: L.bg, fontSize: text.actionLarge.size, fontWeight: '800' },

  cancelBtn: { alignItems: 'center', paddingVertical: 14, borderWidth: 1, borderColor: L.border, borderRadius: shape.cta },
  cancelLabel: { color: L.textSub, fontSize: text.action.size, fontWeight: '800' },
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

  // Share/Export Bracket have no implementation behind them -- there is no
  // bracket share helper (createCommunityShareMessage takes a PlayEvent) and no
  // export path. They answered with a "coming soon" alert; in a production
  // build they are simply not offered (item 6.2).
  const items = [
    ...(IS_INTERNAL_BUILD ? [
      { label: 'Share Bracket',      icon: 'share-outline' as const,       onPress: () => { onClose(); comingSoon('Share Bracket'); } },
      { label: 'Export Bracket',     icon: 'download-outline' as const,     onPress: () => { onClose(); comingSoon('Export Bracket'); } },
    ] : []),
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
    backgroundColor: L.bg, borderWidth: 1, borderColor: L.border, borderRadius: shape.cta,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 8,
    minWidth: 210, overflow: 'hidden', zIndex: 101,
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13 },
  itemBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border },
  label: { color: L.navy, fontSize: text.controlLabel.size, fontWeight: '700' },
  labelDanger: { color: L.danger },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

function DivisionBracketScreen() {
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
  const [courtsInUse,   setCourtsInUse]   = useState<CourtInUse[]>([]);
  const [loadingUse,    setLoadingUse]    = useState(false);
  const [courtsOpen,    setCourtsOpen]    = useState(false);
  const [courtQueue,    setCourtQueue]    = useState<Map<string, number>>(new Map());
  // Pool Play → Bracket: the division's pool stage (20260928170000).
  const [pools,         setPools]         = useState<DivisionPools | null>(null);
  const [stageView,     setStageView]     = useState<'pools' | 'bracket' | null>(null);
  const [buildPlan,     setBuildPlan]     = useState<BracketPlan | null>(null);
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
    const [t, bkt, regs, inUse, queue, pl] = await Promise.all([
      fetchTournamentById(id),
      fetchBracket(id, divisionId),
      fetchTournamentRegistrations(id),
      // Tournament-wide: the court board and "Up next" span every division.
      fetchCourtsInUse(id),
      fetchCourtQueue(id),
      fetchDivisionPools(id, divisionId),
    ]);
    setTournament(t);
    setBracket(bkt);
    setPools(pl);
    // First load only: open on pools until the bracket exists.
    setStageView(prev => prev ?? (pl && !bkt ? 'pools' : 'bracket'));
    setRegistrations(regs);
    setCourtsInUse(inUse);
    setCourtQueue(queue);
    setLoading(false);
  }, [id, divisionId]);

  // Live: a score saved anywhere frees a court and the database hands it to
  // the next match (20260928150000). bracket_matches is in the realtime
  // publication, so re-read on any change to this tournament's matches,
  // debounced because one score save is several row writes.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel(`bracket-courts:${id}:${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bracket_matches', filter: `tournament_id=eq.${id}` },
        () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => { void refresh(); }, 400);
        },
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [id, refresh]);

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

  if (!bracket && !pools) {
    return (
      <View style={s.root}>
        <StatusBar style="dark" />
        {/* Safe-area inset on the HEADER, not the root, so the white header
          colour runs to the top of the screen. Pattern from wallet.tsx. */}
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
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

  const bracketRounds = bracket?.rounds ?? [];
  const roundTabs    = ['All', ...bracketRounds.map(r => r.roundName)];
  const visibleRounds =
    roundFilter === 'All'
      ? bracketRounds
      : bracketRounds.filter(r => r.roundName === roundFilter);
  const view = pools && (!bracket || stageView === 'pools') ? 'pools' : 'bracket';

  // Phase 10: bracket summary counts. Excludes only a round-0 double bye (an
  // empty slot from seeding, e.g. more bracket slots than entrants — it will
  // never be played). A later round with both slots still undetermined DOES
  // count: it is a real match awaiting its feeders, same rule as MatchCard's
  // isDoubleBye and the round-render filter above, so REMAINING matches what
  // is actually visible under "All" and under that round's own tab.
  const allMatches  = bracketRounds.flatMap(r => r.matches).filter(
    m => !(m.participant1 === null && m.participant2 === null && m.roundIndex === 0),
  );
  const totalMatches    = allMatches.length;
  const playedMatches   = allMatches.filter(m => m.status === 'completed').length;
  const remainingMatches = totalMatches - playedMatches;

  const tournamentId = tournament?.id ?? id;

  // Live court usage is re-read every time the picker opens, so another
  // division's director (or a score just saved) is reflected.
  function openCourtPicker(m: DirectorBracketMatch) {
    setCourtTarget(m);
    setLoadingUse(true);
    fetchCourtsInUse(tournamentId)
      .then(setCourtsInUse)
      .finally(() => setLoadingUse(false));
  }

  function applyCourt(court: string | null) {
    if (!courtTarget) return;
    requireAuth(user?.id, async () => {
      const result = await assignCourt(courtTarget.id, court);
      if (!result.ok) {
        Alert.alert('Court not assigned', result.error);
        // Someone else may have just taken it: show the current picture.
        setCourtsInUse(await fetchCourtsInUse(tournamentId));
        return;
      }
      await refresh();
      setCourtTarget(null);
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

  // Pool Play → Bracket, step 2: seed pool qualifiers into the bracket.
  function openBuildFromPools() {
    if (!pools) return;
    const divRegs = registrations.filter(r => r.divisionId === divisionId);
    setBuildPlan(planBracketFromPools(pools, divRegs));
  }

  function confirmBuildFromPools(): Promise<void> {
    return new Promise(resolve => requireAuth(user?.id, async () => {
      if (!buildPlan) { resolve(); return; }
      const result = await buildBracketFromPools({
        tournamentId,
        divisionId,
        divisionName: bracket?.divisionName || pools?.divisionName || '',
        plan: buildPlan,
        registrations: registrations.filter(r => r.divisionId === divisionId),
      });
      if (!result.ok) {
        Alert.alert('Bracket not built', result.error);
      } else {
        setBuildPlan(null);
        await refresh();
        setStageView('bracket');
      }
      resolve();
    }));
  }

  function handleRegenerate() {
    if (pools) {
      openBuildFromPools();
      return;
    }
    requireAuth(user?.id, () => Alert.alert(
      'Regenerate Bracket',
      'This will delete the current bracket and all match results. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Regenerate',
          style: 'destructive',
          onPress: () => confirmBracketFormat(tournament?.tournamentFormat, () => {
            const divRegs = registrations.filter(r => r.divisionId === divisionId);
            createBracket(tournamentId, divisionId, bracket?.divisionName ?? '', divRegs)
              .then(() => refresh());
          }),
        },
      ],
    ));
  }

  return (
    <View style={s.root}>
      <StatusBar style="dark" />

      {/* ── Header ── */}
      {/* Safe-area inset on the HEADER, not the root, so the white header
          colour runs to the top of the screen. Pattern from wallet.tsx. */}
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={L.navy} />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.title} numberOfLines={1}>{bracket?.divisionName || pools?.divisionName}</Text>
          <Text style={s.sub}>{view === 'pools' ? 'Pool Play' : 'Bracket Management'}</Text>
        </View>
        <View style={s.headerRight}>
          {IS_INTERNAL_BUILD && (
            <TouchableOpacity style={s.iconBtn} activeOpacity={0.7} onPress={() => comingSoon('Share')}>
              <Ionicons name="share-outline" size={20} color={L.navy} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={s.iconBtn} activeOpacity={0.7} onPress={() => setMenuOpen(v => !v)}>
            <Ionicons name="ellipsis-vertical" size={20} color={L.navy} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Stage toggle: pools, then the bracket built from them ── */}
      {pools && (
        <View style={s.stageRow}>
          {(['pools', 'bracket'] as const).map(v => {
            const active = view === v;
            const disabled = v === 'bracket' && !bracket;
            return (
              <TouchableOpacity
                key={v}
                style={[s.stageBtn, active && s.stageBtnActive, disabled && { opacity: 0.45 }]}
                onPress={() => setStageView(v)}
                disabled={disabled}
                activeOpacity={0.8}
              >
                <Text style={[s.stageText, active && s.stageTextActive]}>
                  {v === 'pools'
                    ? `Pools · ${pools.completedMatches}/${pools.totalMatches}`
                    : bracket ? 'Bracket' : 'Bracket (after pools)'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {view === 'bracket' && bracket && (
        <>
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

        </>
      )}

      {/* ── Court board: every court in the tournament, live ── */}
      {(tournament?.courts?.length ?? 0) > 0 && (
        <View style={s.boardWrap}>
          <View style={s.boardHeader}>
            <Text style={s.boardTitle}>COURTS</Text>
            <Text style={s.boardAuto}>
              {tournament?.autoAssignCourts === false ? 'Auto-assign off' : 'Auto-assign on'}
            </Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.boardRow}>
            {(tournament?.courts ?? []).map(c => {
              const on = courtsInUse.find(u => u.court === c);
              return (
                <View key={c} style={[s.boardChip, on && s.boardChipBusy]}>
                  <Text style={[s.boardCourt, on && s.boardCourtBusy]} numberOfLines={1}>{courtLabel(c)}</Text>
                  <Text style={[s.boardMatch, on && s.boardMatchBusy]} numberOfLines={1}>
                    {on ? `${on.divisionName} ${on.roundName} M${on.matchNumber + 1}` : 'Free'}
                  </Text>
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* ── Pools view ── */}
      {view === 'pools' && pools && (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        >
          {pools.completedMatches === pools.totalMatches ? (
            <View style={s.poolsDone}>
              <Ionicons name="checkmark-circle" size={18} color={L.success} />
              <View style={{ flex: 1, gap: 10 }}>
                <Text style={s.poolsDoneText}>
                  {bracket
                    ? 'Pools are complete and the bracket is built from them.'
                    : `All pool matches are scored. The top ${pools.advancePerPool} of each pool go on to the bracket.`}
                </Text>
                <TouchableOpacity style={s.buildBtn} onPress={openBuildFromPools} activeOpacity={0.85}>
                  <Ionicons name="git-branch-outline" size={15} color={L.bg} />
                  <Text style={s.buildBtnText}>{bracket ? 'Rebuild bracket from pools' : 'Build bracket'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={s.poolsPending}>
              <Text style={s.poolsPendingText}>
                {pools.totalMatches - pools.completedMatches} pool{' '}
                {pools.totalMatches - pools.completedMatches === 1 ? 'match' : 'matches'} left. Build bracket unlocks
                when every pool match is scored.
              </Text>
            </View>
          )}
          {pools.pools.map(pool => (
            <View key={pool.label} style={s.poolBlock}>
              <Text style={s.poolTitle}>POOL {pool.label}</Text>
              <View style={s.standings}>
                <View style={[s.standRow, s.standHead]}>
                  <Text style={[s.standRank, s.standHeadText]}>#</Text>
                  <Text style={[s.standName, s.standHeadText]}>TEAM</Text>
                  <Text style={[s.standNum, s.standHeadText]}>W-L</Text>
                  <Text style={[s.standNum, s.standHeadText]}>+/-</Text>
                </View>
                {pool.standings.map(st => {
                  const advances = st.rank <= pools.advancePerPool;
                  return (
                    <View key={st.teamKey} style={[s.standRow, advances && s.standAdvance]}>
                      <Text style={[s.standRank, advances && s.standAdvanceText]}>{st.rank}</Text>
                      <Text style={[s.standName, advances && s.standAdvanceText]} numberOfLines={1}>{st.name}</Text>
                      <Text style={s.standNum}>{st.wins}-{st.losses}</Text>
                      <Text style={s.standNum}>{st.diff > 0 ? `+${st.diff}` : st.diff}</Text>
                    </View>
                  );
                })}
                <Text style={s.standFoot}>
                  Top {pools.advancePerPool} advance · ties: head-to-head, then point difference, then points scored
                </Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.poolMatches}>
                {pool.matches.map(match => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    queuePos={courtQueue.get(match.id)}
                    onAssignCourt={openCourtPicker}
                    onEnterScore={setMatchTarget}
                  />
                ))}
              </ScrollView>
            </View>
          ))}
        </ScrollView>
      )}

      {view === 'bracket' && bracket && (
        <>
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
              <Text style={[s.tabLabel, active && s.tabLabelActive]} numberOfLines={1}>{tab}</Text>
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
                // Same rule as MatchCard's isDoubleBye: only round 0 can be a
                // permanent bye. Skipping this here as well as in MatchCard
                // (not just there) matters for the round-header count above
                // it staying visible with the round's OTHER real matches even
                // when a genuine round-0 double-bye sits among them.
                if (match.participant1 === null && match.participant2 === null && match.roundIndex === 0) return null;
                return (
                  <MatchCard
                    key={match.id}
                    match={match}
                    queuePos={courtQueue.get(match.id)}
                    onAssignCourt={openCourtPicker}
                    onEnterScore={setMatchTarget}
                  />
                );
              })}
            </View>
          ))}
        </ScrollView>
      </ScrollView>

        </>
      )}

      {/* ── Build bracket from pools ── */}
      {buildPlan && (
        <BuildBracketSheet
          visible
          onClose={() => setBuildPlan(null)}
          plan={buildPlan}
          rebuilding={!!bracket}
          onConfirm={confirmBuildFromPools}
        />
      )}

      {/* ── Context menu ── */}
      <ContextMenu
        visible={menuOpen}
        tournamentId={tournamentId}
        divisionId={divisionId}
        onRegenerate={handleRegenerate}
        onClose={() => setMenuOpen(false)}
      />

      {/* ── Court modal ── */}
      {courtTarget && !courtsOpen && (
        <CourtModal
          match={courtTarget}
          courts={tournament?.courts ?? []}
          inUse={courtsInUse}
          loadingUse={loadingUse}
          onSelect={c => applyCourt(c)}
          onClear={() => applyCourt(null)}
          onManage={() => setCourtsOpen(true)}
          onClose={() => setCourtTarget(null)}
        />
      )}

      {/* ── Courts (set / change the tournament's list, day-of too) ── */}
      <CourtsSheet
        visible={courtsOpen}
        onClose={() => setCourtsOpen(false)}
        tournamentId={tournamentId}
        courts={tournament?.courts ?? []}
        onSaved={courts => setTournament(prev => (prev ? { ...prev, courts } : prev))}
        autoAssign={tournament?.autoAssignCourts ?? true}
        onAutoAssignChanged={autoAssignCourts => setTournament(prev => (prev ? { ...prev, autoAssignCourts } : prev))}
      />

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
  stageRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4 },
  stageBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 9,
    borderRadius: shape.pill, borderWidth: 1, borderColor: L.border, backgroundColor: L.bg,
  },
  stageBtnActive: { backgroundColor: L.navy, borderColor: L.navy },
  stageText: { color: L.navy, fontSize: text.caption.size, fontWeight: '800' },
  stageTextActive: { color: L.bg },
  poolsDone: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start', margin: 12, marginBottom: 0,
    padding: 12, borderRadius: shape.card, borderWidth: 1, borderColor: L.success, backgroundColor: L.bg,
  },
  poolsDoneText: { color: L.navy, fontSize: text.caption.size, fontWeight: '600', lineHeight: 18 },
  buildBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, alignSelf: 'flex-start',
    backgroundColor: L.navy, borderRadius: shape.cta, paddingHorizontal: 14, paddingVertical: 9,
  },
  buildBtnText: { color: L.bg, fontSize: text.action.size, fontWeight: '800' },
  poolsPending: {
    margin: 12, marginBottom: 0, padding: 10, borderRadius: shape.card,
    borderWidth: 1, borderColor: L.border, backgroundColor: L.bg,
  },
  poolsPendingText: { color: L.textSub, fontSize: text.caption.size, fontWeight: '600', lineHeight: 18 },
  poolBlock: { paddingTop: 14 },
  poolTitle: {
    color: L.navy, fontSize: text.cardLabel.size, fontWeight: '800',
    letterSpacing: text.cardLabel.letterSpacing, paddingHorizontal: 12, marginBottom: 6,
  },
  standings: {
    marginHorizontal: 12, borderWidth: 1, borderColor: L.border, borderRadius: shape.card,
    backgroundColor: L.bg, overflow: 'hidden',
  },
  standRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  standHead: { backgroundColor: L.page, paddingVertical: 6 },
  standHeadText: { color: L.textSub, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  standAdvance: { backgroundColor: L.goldBg },
  standAdvanceText: { color: L.navy, fontWeight: '800' },
  standRank: { width: 18, color: L.textSub, fontSize: text.caption.size, fontWeight: '700' },
  standName: { flex: 1, color: L.navy, fontSize: text.caption.size, fontWeight: '600' },
  standNum: { width: 40, textAlign: 'right', color: L.navy, fontSize: text.caption.size, fontWeight: '700' },
  standFoot: { color: L.textSub, fontSize: 10, fontWeight: '500', paddingHorizontal: 12, paddingVertical: 7 },
  poolMatches: { gap: 10, paddingHorizontal: 12, paddingTop: 10 },
  boardWrap: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 6 },
  boardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  boardTitle: { color: L.navy, fontSize: text.cardLabel.size, fontWeight: '800', letterSpacing: text.cardLabel.letterSpacing },
  boardAuto: { color: L.textSub, fontSize: text.caption.size, fontWeight: '600' },
  boardRow: { gap: 6 },
  boardChip: {
    minWidth: 92, maxWidth: 160, paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: shape.cta, borderWidth: 1, borderColor: L.border, backgroundColor: L.bg,
  },
  boardChipBusy: { backgroundColor: L.gold, borderColor: L.gold },
  boardCourt: { color: L.navy, fontSize: text.caption.size, fontWeight: '800' },
  boardCourtBusy: { color: L.bg },
  boardMatch: { color: L.success, fontSize: 11, fontWeight: '700', marginTop: 1 },
  boardMatchBusy: { color: L.bg, fontWeight: '600' },
  root: { flex: 1, backgroundColor: L.page },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: L.bg,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800' },
  sub: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', marginTop: 1 },
  headerRight: { flexDirection: 'row', gap: 4 },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },

  championBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: L.goldBg, borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: L.goldBorder, paddingHorizontal: 16, paddingVertical: 12,
  },
  championLabel: { color: L.gold, fontSize: text.microLabel.size, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  championName: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800' },
  resultsLink: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  resultsLinkText: { color: L.gold, fontSize: text.link.size, fontWeight: '700' },

  summaryStrip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, gap: 10,
    backgroundColor: L.bg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  summaryItem: { alignItems: 'center', gap: 2 },
  summaryDiv: { width: StyleSheet.hairlineWidth, height: 28, backgroundColor: L.border },
  summaryNum: { color: L.navy, fontSize: text.statValueSm.size, fontWeight: '900' },
  summaryLabel: { color: L.textSub, fontSize: 9, fontWeight: '700', letterSpacing: 0.4 },

  // No maxHeight (removed — it clipped text at larger accessibility text
  // sizes; see the git history for that bug). Removing it alone caused a
  // DIFFERENT regression: a ScrollView with no explicit height, as a child of
  // a flex column, doesn't reliably shrink-wrap to its single line of
  // content — Yoga's default alignItems is 'stretch', so each pill filled
  // whatever ambient height the row resolved to, ballooning into a tall
  // capsule (same borderRadius: 20, just applied to a much bigger box).
  // flexGrow/flexShrink: 0 stop the ScrollView claiming flexible VERTICAL
  // space from its parent column (that is the height fix). Deliberately no
  // alignSelf here — the row still needs to span the full screen WIDTH so a
  // touch anywhere across it can start the horizontal drag, even where the
  // pills themselves don't fill it. alignItems: 'center' below stops each
  // pill stretching to fill whatever height the row resolves to. Together
  // they make the row hug its own content height, whatever that is at the
  // current text size — no fixed number anywhere, so there is nothing left
  // to clip OR overinflate.
  tabScroll: { backgroundColor: L.bg, flexGrow: 0, flexShrink: 0 },
  tabRow: {
    paddingHorizontal: 16, paddingVertical: 8, gap: 8, flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  tab: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: shape.pill, borderWidth: 1, borderColor: L.border, backgroundColor: L.bg, flexShrink: 0 },
  tabActive: { backgroundColor: L.navy, borderColor: L.navy },
  // Second, separate bug: L.textSub (#8A9DC0) on white is a 2.84:1 contrast
  // ratio — under WCAG's 4.5:1 floor for normal text. roundHeader uses
  // L.navy/L.text (#0A1228, ~19:1) for exactly this reason and reads cleanly
  // in every screenshot; the inactive pill label just had the wrong token.
  tabLabel: { color: L.text, fontSize: text.controlLabel.size, fontWeight: '700' },
  tabLabelActive: { color: L.bg },

  bracketScroll: { paddingHorizontal: 16, paddingTop: 16, flexDirection: 'row', gap: 16 },
  roundCol: { gap: 0 },
  roundHeader: {
    color: L.navy, fontSize: text.sectionLabel.size, fontWeight: '800', letterSpacing: text.sectionLabel.letterSpacing,
    textTransform: 'uppercase', marginBottom: 10, paddingHorizontal: 2,
  },

  noBracket: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  noBracketTitle: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800' },
  noBracketSub: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', textAlign: 'center' },
  noBracketBtn: { backgroundColor: L.navy, borderRadius: shape.cta, paddingHorizontal: 24, paddingVertical: 13, marginTop: 8 },
  noBracketBtnText: { color: L.bg, fontSize: text.actionLarge.size, fontWeight: '800' },
});

// Director-only route. The screen body above is mounted only after
// DirectorOnly confirms the signed-in user directs this tournament, so its
// effects and fetches never run for anyone else.
export default function DivisionBracketScreenRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <DirectorOnly tournamentId={id}>
      <DivisionBracketScreen />
    </DirectorOnly>
  );
}
