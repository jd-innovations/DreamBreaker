import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Modal, Pressable, Alert, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { StatusChip } from '@/components';
import { useSession } from '@/hooks/useSession';
import { requireAuth } from '@/lib/authGuard';
import { hasBracket } from '@/lib/directorBracketStore';
import {
  statusLabel,
  statusVariant,
  partnerPaymentLabel,
  partnerPaymentVariant,
  type DirectorRegistration,
  type TournamentMetrics,
  type DivisionMetrics,
} from '@/lib/directorRegistrationAdapter';
import type { RegistrationStatus } from '@/lib/registrationStore';
import { getOrCreateConversation } from '@/lib/conversationService';
import { fetchTournamentById } from '@/lib/supabase/tournaments';
import { fetchDivisionsForTournament } from '@/lib/supabase/divisions';
import {
  fetchTournamentRegistrations,
  checkInPlayer,
  undoCheckIn,
  markNoShow,
  moveToWaitlist,
  restoreFromWaitlist,
  cancelRegistration,
  restoreNoShow,
  restoreCancelled,
} from '@/lib/supabase/registrations';
import type { TournamentRegistration } from '@/lib/registrationStore';
import type { Tournament } from '@/lib/tournamentTypes';
import type { DivisionData } from '@/data/divisions';
import { DirectorOnly } from '@/components/DirectorOnly';

function toDirector(r: TournamentRegistration): DirectorRegistration {
  return {
    id:                  r.id,
    playerName:          r.playerName,
    playerUserId:        r.playerId ?? null,
    partnerStatus:       r.partnerStatus,
    partnerId:           r.partnerId,
    partnerName:         r.partnerName,
    partnerDupr:         r.partnerDupr,
    teamStatus:          r.teamStatus,
    teamPartnerPaymentState: r.teamPartnerPaymentState,
    divisionId:          r.divisionId,
    divisionName:        r.divisionName,
    divisionLevel:       r.divisionLevel,
    registrationDate:    r.registrationDate,
    status:              r.status,
    amountPaid:          r.amountPaid,
    balanceDue:          r.balanceDue,
    canUndoCheckIn:      r.status === 'checked_in',
    canRestoreNoShow:    r.status === 'no_show',
    canRestoreCancelled: r.status === 'cancelled',
  };
}

function calcMetrics(all: TournamentRegistration[]): TournamentMetrics {
  const active = all.filter(r => r.status !== 'cancelled');
  return {
    total:            active.length,
    registered:       active.filter(r => r.status === 'registered').length,
    checkedIn:        active.filter(r => r.status === 'checked_in').length,
    waitlisted:       active.filter(r => r.status === 'waitlisted').length,
    noShow:           active.filter(r => r.status === 'no_show').length,
    cancelled:        all.filter(r => r.status === 'cancelled').length,
    revenueCents:     active.reduce((s, r) => s + r.amountPaid, 0),
    outstandingCents: active.filter(r => r.status !== 'no_show').reduce((s, r) => s + r.balanceDue, 0),
  };
}

function calcDivMetrics(all: TournamentRegistration[], divisions: DivisionData[]): DivisionMetrics[] {
  return divisions.map(d => {
    const divRegs         = all.filter(r => r.divisionId === d.id && r.status !== 'cancelled');
    const registeredCount = divRegs.filter(r => r.status === 'registered' || r.status === 'checked_in').length;
    const checkedInCount  = divRegs.filter(r => r.status === 'checked_in').length;
    const waitlistedCount = divRegs.filter(r => r.status === 'waitlisted').length;
    const noShowCount     = divRegs.filter(r => r.status === 'no_show').length;
    return {
      divisionId:         d.id,
      divisionName:       d.name,
      level:              d.level,
      capacity:           d.capacity,
      registeredCount,
      checkedInCount,
      waitlistedCount,
      noShowCount,
      openSpots:          Math.max(0, d.capacity - registeredCount),
      revenueCollected:   divRegs.reduce((s, r) => s + r.amountPaid, 0),
      outstandingBalance: divRegs.filter(r => r.status !== 'no_show').reduce((s, r) => s + r.balanceDue, 0),
    };
  });
}

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

function fmt(cents: number) { return `$${Math.round(cents / 100)}`; }

function initials(name: string): string {
  return name.split(' ').map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase();
}

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'Yesterday' : `${days}d ago`;
}

// ─── Tab type ─────────────────────────────────────────────────────────────────

type FilterTab = 'all' | RegistrationStatus | 'divisions';

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'all',         label: 'All'        },
  { key: 'registered',  label: 'Registered' },
  { key: 'checked_in',  label: 'Checked In' },
  { key: 'waitlisted',  label: 'Waitlisted' },
  { key: 'no_show',     label: 'No Show'    },
  { key: 'cancelled',   label: 'Cancelled'  },
  { key: 'divisions',   label: 'Divisions'  },
];

// ─── Metric tile ──────────────────────────────────────────────────────────────

function MetricTile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={[mt.tile, accent && mt.tileAccent]}>
      <Text style={[mt.value, accent && mt.valueAccent]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={mt.label}>{label}</Text>
    </View>
  );
}

const mt = StyleSheet.create({
  tile: {
    flex: 1, alignItems: 'center', gap: 3,
    backgroundColor: L.bg, borderWidth: 1, borderColor: L.border,
    borderRadius: shape.card, paddingVertical: 12, paddingHorizontal: 4,
  },
  tileAccent: { backgroundColor: L.goldLight, borderColor: L.goldBorder },
  value: { color: L.navy, fontSize: text.statValueSm.size, fontWeight: '900' },
  valueAccent: { color: L.gold },
  label: { color: L.textSub, fontSize: 9, fontWeight: '700', letterSpacing: 0.5, textAlign: 'center' },
});

// ─── Registration row ─────────────────────────────────────────────────────────

function RegRow({ reg, onPress }: { reg: DirectorRegistration; onPress: () => void }) {
  return (
    <TouchableOpacity style={rr.row} activeOpacity={0.75} onPress={onPress}>
      <View style={rr.avatar}>
        <Text style={rr.avatarText}>{initials(reg.playerName)}</Text>
      </View>
      <View style={rr.center}>
        <Text style={rr.name}>{reg.playerName}</Text>
        <Text style={rr.sub}>
          {reg.partnerStatus === 'selected' && reg.partnerName
            ? `w/ ${reg.partnerName}`
            : reg.partnerStatus === 'choose_later'
              ? 'Partner: Choose Later'
              : 'Singles'}
        </Text>
        {/* Each player on a doubles/mixed team pays separately — this row's
            "Paid" figure is only this player's own entry fee. */}
        {!!partnerPaymentLabel(reg) && (
          <Text style={[rr.sub, { color: partnerPaymentVariant(reg) === 'green' ? L.success : L.gold }]}>
            {partnerPaymentLabel(reg)}
          </Text>
        )}
      </View>
      <View style={rr.right}>
        <Text style={rr.div}>{reg.divisionName}  {reg.divisionLevel}</Text>
        <StatusChip label={statusLabel(reg.status)} variant={statusVariant(reg.status)} />
        <Text style={rr.paid}>Paid {fmt(reg.amountPaid)}</Text>
      </View>
    </TouchableOpacity>
  );
}

const rr = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
    backgroundColor: L.bg,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: L.navy, alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: { color: L.bg, fontSize: 14, fontWeight: '800' },
  center: { flex: 1, minWidth: 0 },
  name: { color: L.navy, fontSize: text.rowTitle.size, fontWeight: '700', marginBottom: 2 },
  sub: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500' },
  right: { alignItems: 'flex-end', gap: 4, flexShrink: 0 },
  div: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500' },
  paid: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500' },
});

// ─── Division capacity card ───────────────────────────────────────────────────

function DivisionCapacityCard({
  metrics,
  bracketReady,
  onPress,
}: {
  metrics: DivisionMetrics;
  bracketReady: boolean;
  onPress: () => void;
}) {
  const { registeredCount, capacity, waitlistedCount, openSpots } = metrics;
  const progress = capacity > 0 ? Math.min(registeredCount / capacity, 1) : 0;
  const isFull   = openSpots === 0;

  return (
    <TouchableOpacity style={dc.card} activeOpacity={0.8} onPress={onPress}>
      <View style={dc.header}>
        <View style={{ flex: 1 }}>
          <Text style={dc.name}>{metrics.divisionName}</Text>
          <View style={dc.levelRow}>
            <View style={dc.levelBadge}>
              <Text style={dc.levelText}>{metrics.level}</Text>
            </View>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color={L.textSub} />
      </View>

      <View style={dc.barBg}>
        <View style={[dc.barFill, { width: `${Math.round(progress * 100)}%` as `${number}%` }]} />
      </View>

      <View style={dc.statsRow}>
        <View style={dc.stat}>
          <Text style={[dc.statNum, { color: L.gold }]}>{registeredCount}</Text>
          <Text style={dc.statLabel}>REGISTERED</Text>
        </View>
        <View style={dc.statDivider} />
        <View style={dc.stat}>
          <Text style={[dc.statNum, { color: isFull ? L.danger : L.success }]}>{openSpots}</Text>
          <Text style={dc.statLabel}>OPEN SPOTS</Text>
        </View>
        <View style={dc.statDivider} />
        <View style={dc.stat}>
          <Text style={[dc.statNum, { color: L.textSub }]}>{waitlistedCount}</Text>
          <Text style={dc.statLabel}>WAITLISTED</Text>
        </View>
        <View style={dc.statDivider} />
        <View style={dc.stat}>
          <Text style={dc.statNum}>{capacity}</Text>
          <Text style={dc.statLabel}>CAPACITY</Text>
        </View>
      </View>

      <View style={dc.bracketRow}>
        <Ionicons
          name={bracketReady ? 'git-branch' : 'git-branch-outline'}
          size={12}
          color={bracketReady ? L.success : L.textSub}
        />
        <Text style={[dc.bracketLabel, { color: bracketReady ? L.success : L.textSub }]}>
          {bracketReady ? 'Bracket Ready' : 'No Bracket'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const dc = StyleSheet.create({
  card: {
    backgroundColor: L.bg,
    borderWidth: 1, borderColor: L.border,
    borderRadius: shape.card,
    padding: 14, marginBottom: 10,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  name: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800', marginBottom: 5 },
  levelRow: { flexDirection: 'row' },
  levelBadge: {
    backgroundColor: L.navy, borderRadius: shape.badge,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  levelText: { color: L.bg, fontSize: text.cardLabel.size, fontWeight: '800', letterSpacing: text.cardLabel.letterSpacing },

  barBg: { height: 6, backgroundColor: L.page, borderRadius: 3, marginBottom: 12, overflow: 'hidden' },
  barFill: { height: 6, backgroundColor: L.gold, borderRadius: 3 },

  statsRow: { flexDirection: 'row' },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statDivider: { width: StyleSheet.hairlineWidth, backgroundColor: L.border },
  statNum: { color: L.navy, fontSize: text.statValueSm.size, fontWeight: '900' },
  statLabel: { color: L.textSub, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },

  bracketRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginTop: 10, paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: L.border,
  },
  bracketLabel: { fontSize: text.caption.size, fontWeight: '500' },
});

// ─── Registration detail modal ────────────────────────────────────────────────

function DetailModal({
  reg,
  tournamentId,
  onClose,
  onAction,
  bottomInset,
  userId,
  onMessagePlayer,
  messagingPlayer,
}: {
  reg: DirectorRegistration;
  tournamentId: string;
  onClose: () => void;
  onAction: () => void;
  bottomInset: number;
  userId: string | undefined;
  onMessagePlayer: (playerUserId: string) => void;
  messagingPlayer: boolean;
}) {
  function doAction(action: () => Promise<void>, confirmMsg?: string) {
    requireAuth(userId, () => {
      if (confirmMsg) {
        Alert.alert('Confirm', confirmMsg, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Confirm', style: 'destructive', onPress: () => action().then(() => onAction()) },
        ]);
      } else {
        action().then(() => onAction());
      }
    });
  }

  const canCheckIn  = reg.status === 'registered' || reg.status === 'waitlisted';
  const canWaitlist = reg.status === 'registered';
  const canNoShow   = reg.status === 'registered' || reg.status === 'checked_in';
  const canCancel   = reg.status !== 'cancelled';

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={dm.backdrop} onPress={onClose}>
        <Pressable style={[dm.sheet, { paddingBottom: bottomInset + 24 }]} onPress={() => {}}>
          <View style={dm.handle} />

          {/* ── Player ── */}
          <View style={dm.playerRow}>
            <View style={dm.avatar}>
              <Text style={dm.avatarText}>{initials(reg.playerName)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={dm.playerName}>{reg.playerName}</Text>
              {reg.partnerStatus === 'selected' && reg.partnerName ? (
                <Text style={dm.partnerLine}>
                  Partner: {reg.partnerName}{reg.partnerDupr ? ` · ${reg.partnerDupr} DUPR` : ''}
                </Text>
              ) : reg.partnerStatus === 'choose_later' ? (
                <Text style={[dm.partnerLine, { color: L.textSub }]}>Partner: Choose Later</Text>
              ) : null}
              {!!partnerPaymentLabel(reg) && (
                <Text
                  style={[
                    dm.partnerLine,
                    { color: partnerPaymentVariant(reg) === 'green' ? L.success : L.gold },
                  ]}
                >
                  {partnerPaymentLabel(reg)}
                </Text>
              )}
              <Text style={dm.divLine}>{reg.divisionName}  •  {reg.divisionLevel}</Text>
            </View>
            <StatusChip label={statusLabel(reg.status)} variant={statusVariant(reg.status)} />
          </View>

          <View style={dm.divider} />

          {/* ── Fees ── */}
          <View style={dm.feesRow}>
            <View style={dm.feeCell}>
              <Text style={dm.feeCellLabel}>Amount Paid</Text>
              <Text style={dm.feeCellValue}>{fmt(reg.amountPaid)}</Text>
            </View>
            <View style={dm.feeDiv} />
            <View style={dm.feeCell}>
              <Text style={dm.feeCellLabel}>Balance Due</Text>
              <Text style={[dm.feeCellValue, reg.balanceDue === 0 && { color: L.success }]}>
                {reg.balanceDue > 0 ? fmt(reg.balanceDue) : 'Paid'}
              </Text>
            </View>
            <View style={dm.feeDiv} />
            <View style={dm.feeCell}>
              <Text style={dm.feeCellLabel}>Registered</Text>
              <Text style={dm.feeCellValue}>{relativeDate(reg.registrationDate)}</Text>
            </View>
          </View>

          <View style={dm.divider} />

          {/* ── Actions ── */}
          <View style={dm.actionsGrid}>
            <TouchableOpacity
              style={[dm.actionBtn, dm.actionBtnGreen, !canCheckIn && dm.actionBtnDisabled]}
              activeOpacity={canCheckIn ? 0.8 : 1}
              onPress={canCheckIn ? () => doAction(() => checkInPlayer(reg.id, tournamentId)) : undefined}
            >
              <Ionicons name="checkmark-circle-outline" size={18} color={canCheckIn ? L.success : L.textSub} />
              <Text style={[dm.actionLabel, { color: canCheckIn ? L.success : L.textSub }]}>Check In</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[dm.actionBtn, !canWaitlist && dm.actionBtnDisabled]}
              activeOpacity={canWaitlist ? 0.8 : 1}
              onPress={canWaitlist ? () => doAction(() => moveToWaitlist(reg.id)) : undefined}
            >
              <Ionicons name="time-outline" size={18} color={canWaitlist ? L.navy : L.textSub} />
              <Text style={[dm.actionLabel, { color: canWaitlist ? L.navy : L.textSub }]}>Waitlist</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[dm.actionBtn, !canNoShow && dm.actionBtnDisabled]}
              activeOpacity={canNoShow ? 0.8 : 1}
              onPress={canNoShow ? () => doAction(
                () => markNoShow(reg.id),
                `Mark ${reg.playerName} as no-show?`,
              ) : undefined}
            >
              <Ionicons name="close-circle-outline" size={18} color={canNoShow ? L.gold : L.textSub} />
              <Text style={[dm.actionLabel, { color: canNoShow ? L.gold : L.textSub }]}>No Show</Text>
            </TouchableOpacity>

            {reg.status === 'waitlisted' && (
              <TouchableOpacity
                style={dm.actionBtn}
                activeOpacity={0.8}
                onPress={() => doAction(() => restoreFromWaitlist(reg.id))}
              >
                <Ionicons name="arrow-up-circle-outline" size={18} color={L.navy} />
                <Text style={[dm.actionLabel, { color: L.navy }]}>Restore</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* ── Undo / restore actions ── */}
          {(reg.canUndoCheckIn || reg.canRestoreNoShow || reg.canRestoreCancelled) && (
            <View style={dm.undoSection}>
              <View style={dm.undoSectionHeader}>
                <Ionicons name="arrow-undo-outline" size={13} color={L.gold} />
                <Text style={dm.undoSectionTitle}>CORRECTIONS</Text>
              </View>
              {reg.canUndoCheckIn && (
                <TouchableOpacity
                  style={dm.undoBtn}
                  activeOpacity={0.8}
                  onPress={() => doAction(
                    () => undoCheckIn(reg.id),
                    `Undo check-in for ${reg.playerName}? They will return to Registered.`,
                  )}
                >
                  <Ionicons name="arrow-undo-circle-outline" size={18} color={L.gold} />
                  <Text style={dm.undoBtnText}>Undo Check-In</Text>
                </TouchableOpacity>
              )}
              {reg.canRestoreNoShow && (
                <TouchableOpacity
                  style={dm.undoBtn}
                  activeOpacity={0.8}
                  onPress={() => doAction(
                    () => restoreNoShow(reg.id),
                    `Restore ${reg.playerName} from No Show? They will return to Registered.`,
                  )}
                >
                  <Ionicons name="arrow-undo-circle-outline" size={18} color={L.gold} />
                  <Text style={dm.undoBtnText}>Restore No-Show</Text>
                </TouchableOpacity>
              )}
              {reg.canRestoreCancelled && (
                <TouchableOpacity
                  style={dm.undoBtn}
                  activeOpacity={0.8}
                  onPress={() => doAction(
                    () => restoreCancelled(reg.id),
                    `Restore ${reg.playerName}'s cancelled registration? They will return to Registered.`,
                  )}
                >
                  <Ionicons name="refresh-circle-outline" size={18} color={L.success} />
                  <Text style={[dm.undoBtnText, { color: L.success }]}>Restore Registration</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {reg.playerUserId && (
            <TouchableOpacity
              style={[dm.msgPlayerBtn, messagingPlayer && dm.actionBtnDisabled]}
              activeOpacity={0.8}
              disabled={messagingPlayer}
              onPress={() => onMessagePlayer(reg.playerUserId!)}
            >
              {messagingPlayer
                ? <ActivityIndicator size="small" color={L.navy} />
                : <Ionicons name="chatbubble-outline" size={16} color={L.navy} />}
              <Text style={dm.msgPlayerBtnText}>Message Player</Text>
            </TouchableOpacity>
          )}

          {!reg.canRestoreCancelled && (
            <TouchableOpacity
              style={[dm.cancelBtn, !canCancel && dm.actionBtnDisabled]}
              activeOpacity={canCancel ? 0.8 : 1}
              onPress={canCancel ? () => doAction(
                // cancelRegistration now goes through the cancel-registration
                // edge function, which also refunds and promotes off the
                // waitlist. It reports failure instead of throwing, so surface
                // it here — doAction only knows how to await a void promise,
                // and a director silently failing to cancel someone looks
                // exactly like success.
                async () => {
                  const result = await cancelRegistration(reg.id);
                  if (!result.cancelled) {
                    Alert.alert(
                      'Could not cancel',
                      result.error === 'not_authorized'
                        ? 'You are not able to cancel this registration.'
                        : 'Something went wrong. Please try again.',
                    );
                    return;
                  }
                  if (result.refundStatus === 'submitted') {
                    Alert.alert('Registration cancelled', `$${(result.refundedCents / 100).toFixed(2)} has been refunded to the player's original payment method.`);
                  } else if (result.refundStatus === 'failed') {
                    Alert.alert('Registration cancelled', 'The refund could not be processed automatically and needs manual follow-up.');
                  }
                },
                `Cancel ${reg.playerName}'s registration? This cannot be undone.`,
              ) : undefined}
            >
              <Ionicons name="trash-outline" size={16} color={L.danger} />
              <Text style={dm.cancelBtnText}>Cancel Registration</Text>
            </TouchableOpacity>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const dm = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(10,18,40,0.50)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: L.bg,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: L.border,
    alignSelf: 'center', marginVertical: 12,
  },

  playerRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingHorizontal: 20, paddingBottom: 16,
  },
  avatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: L.navy, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarText: { color: L.bg, fontSize: 18, fontWeight: '800' },
  playerName: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800', marginBottom: 3 },
  partnerLine: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', marginBottom: 3 },
  divLine: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500' },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: L.border },

  feesRow: { flexDirection: 'row', paddingVertical: 4 },
  feeCell: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  feeDiv: { width: StyleSheet.hairlineWidth, backgroundColor: L.border },
  feeCellLabel: { color: L.textSub, fontSize: 10, fontWeight: '600', marginBottom: 4 },
  feeCellValue: { color: L.navy,    fontSize: text.rowValue.size, fontWeight: '800' },

  actionsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10,
    paddingHorizontal: 16, paddingVertical: 16,
  },
  actionBtn: {
    flex: 1, minWidth: '28%',
    alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: L.page, borderWidth: 1, borderColor: L.border,
    borderRadius: shape.cta, paddingVertical: 14,
  },
  actionBtnGreen: { borderColor: 'rgba(34,197,94,0.35)', backgroundColor: L.successBg },
  actionBtnDisabled: { opacity: 0.35 },
  actionLabel: { fontSize: text.action.size, fontWeight: '800' },

  msgPlayerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 8,
    borderWidth: 1.5, borderColor: L.gold, borderRadius: shape.cta,
    paddingVertical: 13, backgroundColor: L.goldLight,
  },
  msgPlayerBtnText: { color: L.navy, fontSize: text.action.size, fontWeight: '800' },

  cancelBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 8,
    borderWidth: 1.5, borderColor: 'rgba(239,68,68,0.35)', borderRadius: shape.cta,
    paddingVertical: 13, backgroundColor: L.dangerBg,
  },
  cancelBtnText: { color: L.danger, fontSize: text.action.size, fontWeight: '800' },

  undoSection: {
    marginHorizontal: 16, marginBottom: 10,
    borderWidth: 1, borderColor: L.goldBorder,
    borderRadius: shape.card, overflow: 'hidden',
    backgroundColor: L.goldLight,
  },
  undoSectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.goldBorder,
  },
  undoSectionTitle: {
    color: L.gold, fontSize: 10, fontWeight: '900', letterSpacing: 0.6,
  },
  undoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: L.goldBorder,
  },
  undoBtnText: { color: L.gold, fontSize: text.action.size, fontWeight: '800', flex: 1 },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

function DirectorWorkspaceScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();

  const [tournament, setTournament]         = useState<Tournament | null>(null);
  const [tab, setTab]                       = useState<FilterTab>('all');
  const [divisionFilter, setDivisionFilter] = useState<string | null>(null);
  const [selected, setSelected]             = useState<DirectorRegistration | null>(null);
  const [messagingPlayer, setMessagingPlayer] = useState(false);
  const [regs, setRegs]                     = useState<DirectorRegistration[]>([]);
  const [cancelledRegs, setCancelledRegs]   = useState<DirectorRegistration[]>([]);
  const [metrics, setMetrics]               = useState<TournamentMetrics>({ total:0,registered:0,checkedIn:0,waitlisted:0,noShow:0,cancelled:0,revenueCents:0,outstandingCents:0 });
  const [divMetrics, setDivMetrics]         = useState<DivisionMetrics[]>([]);
  const [loading, setLoading]               = useState(true);

  const refresh = useCallback(async () => {
    const [t, divs, allRegs] = await Promise.all([
      fetchTournamentById(id),
      fetchDivisionsForTournament(id),
      fetchTournamentRegistrations(id),
    ]);
    setTournament(t);
    const active    = allRegs.filter(r => r.status !== 'cancelled');
    const cancelled = allRegs.filter(r => r.status === 'cancelled');
    setRegs(active.map(toDirector));
    setCancelledRegs(cancelled.map(toDirector));
    setMetrics(calcMetrics(allRegs));
    setDivMetrics(calcDivMetrics(allRegs, divs));
    setSelected(null);
    setLoading(false);
  }, [id]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const openPlayerDM = useCallback(async (playerUserId: string) => {
    if (!user) {
      Alert.alert('Sign in required', 'Please sign in to send messages.');
      return;
    }
    if (user.id === playerUserId) return;
    setMessagingPlayer(true);
    try {
      const convId = await getOrCreateConversation(user.id, playerUserId);
      setSelected(null);
      router.push(`/conversation/${convId}` as never);
    } catch (e: unknown) {
      Alert.alert('Could not open chat', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setMessagingPlayer(false);
    }
  }, [user]);

  const isDivisionsTab = tab === 'divisions';

  // Filter registrations by active division filter, then by status tab
  const baseRegs = divisionFilter
    ? regs.filter(r => r.divisionId === divisionFilter)
    : regs;

  const baseCancelledRegs = divisionFilter
    ? cancelledRegs.filter(r => r.divisionId === divisionFilter)
    : cancelledRegs;

  const filtered =
    tab === 'cancelled'              ? baseCancelledRegs :
    tab === 'all' || isDivisionsTab  ? baseRegs          :
    baseRegs.filter(r => r.status === tab);

  const activeDivMetrics = divMetrics.find(d => d.divisionId === divisionFilter);
  const filterLabel = activeDivMetrics
    ? `${activeDivMetrics.divisionName} ${activeDivMetrics.level}`
    : null;

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.page, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.gold} />
      </View>
    );
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
          <Text style={s.headerTitle} numberOfLines={1}>{tournament?.name ?? '...'}</Text>
          <Text style={s.headerSub}>Director Workspace</Text>
        </View>
        <TouchableOpacity
          style={s.cmdCenterBtn}
          activeOpacity={0.8}
          onPress={() => router.push(`/tournament/${id}/command-center` as never)}
        >
          <Ionicons name="grid-outline" size={14} color={L.navy} />
          <Text style={s.cmdCenterBtnText}>Center</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.checkInBtn}
          activeOpacity={0.85}
          onPress={() => router.push(`/tournament/${id}/check-in` as never)}
        >
          <Ionicons name="scan-outline" size={16} color={L.bg} />
          <Text style={s.checkInBtnText}>Check In</Text>
        </TouchableOpacity>
      </View>

      {/* ── Metrics strip ── */}
      <View style={s.metrics}>
        <MetricTile label="TOTAL"      value={String(metrics.total)}      accent />
        <MetricTile label="CHECKED IN" value={String(metrics.checkedIn)}  />
        <MetricTile label="WAITLISTED" value={String(metrics.waitlisted)} />
        <MetricTile label="REVENUE"    value={fmt(metrics.revenueCents)}  />
      </View>

      {/* ── Outstanding balance note ── */}
      {metrics.outstandingCents > 0 && (
        <View style={s.outstandingBar}>
          <Ionicons name="alert-circle-outline" size={14} color={L.gold} />
          <Text style={s.outstandingText}>
            {fmt(metrics.outstandingCents)} outstanding balance
          </Text>
        </View>
      )}

      {/* ── Active division filter banner ── */}
      {divisionFilter !== null && (
        <View style={s.filterBanner}>
          <Ionicons name="filter" size={13} color={L.navy} />
          <Text style={s.filterBannerText} numberOfLines={1}>{filterLabel}</Text>
          <TouchableOpacity
            style={s.filterClear}
            activeOpacity={0.7}
            onPress={() => setDivisionFilter(null)}
          >
            <Ionicons name="close-circle" size={15} color={L.textSub} />
            <Text style={s.filterClearText}>Show All</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Filter tabs ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.tabScroll}
        contentContainerStyle={s.tabRow}
      >
        {TABS.map(t => {
          const count =
            t.key === 'all'        ? metrics.total      :
            t.key === 'registered' ? metrics.registered :
            t.key === 'checked_in' ? metrics.checkedIn  :
            t.key === 'waitlisted' ? metrics.waitlisted :
            t.key === 'no_show'    ? metrics.noShow     :
            t.key === 'cancelled'  ? metrics.cancelled  :
                                     divMetrics.length;
          const active = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[s.tab, active && s.tabActive]}
              activeOpacity={0.7}
              onPress={() => setTab(t.key)}
            >
              <Text style={[s.tabLabel, active && s.tabLabelActive]}>{t.label}</Text>
              <View style={[s.tabBadge, active && s.tabBadgeActive]}>
                <Text style={[s.tabBadgeText, active && s.tabBadgeTextActive]}>{count}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Content ── */}
      {isDivisionsTab ? (
        divMetrics.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="layers-outline" size={48} color={L.textSub} />
            <Text style={s.emptyTitle}>No divisions found</Text>
            <Text style={s.emptySub}>Divisions will appear once configured.</Text>
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[s.divList, { paddingBottom: insets.bottom + 24 }]}
          >
            {divMetrics.map(dm2 => (
              <DivisionCapacityCard
                key={dm2.divisionId}
                metrics={dm2}
                bracketReady={hasBracket(id, dm2.divisionId)}
                onPress={() => {
                  setDivisionFilter(dm2.divisionId);
                  setTab('all');
                }}
              />
            ))}
          </ScrollView>
        )
      ) : (
        filtered.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="people-outline" size={48} color={L.textSub} />
            <Text style={s.emptyTitle}>
              {regs.length === 0 ? 'No registrations yet' : 'No players in this category'}
            </Text>
            <Text style={s.emptySub}>
              {regs.length === 0
                ? 'Players will appear here once they register.'
                : 'Switch to another tab to see players.'}
            </Text>
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          >
            {filtered.map(reg => (
              <RegRow key={reg.id} reg={reg} onPress={() => setSelected(reg)} />
            ))}
          </ScrollView>
        )
      )}

      {/* ── Detail modal ── */}
      {selected && (
        <DetailModal
          reg={selected}
          tournamentId={id}
          onClose={() => setSelected(null)}
          onAction={refresh}
          bottomInset={insets.bottom}
          userId={user?.id}
          onMessagePlayer={openPlayerDM}
          messagingPlayer={messagingPlayer}
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
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: L.bg,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800' },
  headerSub: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', marginTop: 1 },
  cmdCenterBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: L.border, borderRadius: shape.cta,
    paddingHorizontal: 9, paddingVertical: 7,
  },
  cmdCenterBtnText: { color: L.navy, fontSize: text.action.size, fontWeight: '800' },

  checkInBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: L.navy, borderRadius: shape.cta,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  checkInBtnText: { color: L.bg, fontSize: text.action.size, fontWeight: '800' },

  metrics: { flexDirection: 'row', gap: 8, padding: 12, paddingBottom: 8 },

  outstandingBar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginHorizontal: 12, marginBottom: 8,
    backgroundColor: L.goldLight, borderWidth: 1, borderColor: L.goldBorder,
    borderRadius: shape.panel, paddingHorizontal: 12, paddingVertical: 8,
  },
  outstandingText: { color: L.text, fontSize: text.caption.size, fontWeight: '500', flex: 1 },

  filterBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginHorizontal: 12, marginBottom: 6,
    backgroundColor: L.bg, borderWidth: 1, borderColor: L.goldBorder,
    borderRadius: shape.panel, paddingHorizontal: 12, paddingVertical: 8,
  },
  filterBannerText: { flex: 1, color: L.navy, fontSize: text.action.size, fontWeight: '800' },
  filterClear: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  filterClearText: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500' },

  tabScroll: { maxHeight: 48, flexGrow: 0 },
  tabRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, gap: 6, paddingVertical: 6,
  },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: shape.pill, borderWidth: 1, borderColor: L.border,
    backgroundColor: L.bg,
  },
  tabActive: { backgroundColor: L.navy, borderColor: L.navy },
  tabLabel: { color: L.textSub, fontSize: text.controlLabel.size, fontWeight: '700' },
  tabLabelActive: { color: L.bg },
  tabBadge: {
    backgroundColor: L.page, borderRadius: shape.cta,
    paddingHorizontal: 6, paddingVertical: 1,
  },
  tabBadgeActive: { backgroundColor: 'rgba(255,255,255,0.20)' },
  tabBadgeText: { color: L.textSub, fontSize: text.cardLabel.size, fontWeight: '800', letterSpacing: text.cardLabel.letterSpacing },
  tabBadgeTextActive: { color: L.bg },

  divList: { padding: 12 },

  empty: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 40, gap: 12,
  },
  emptyTitle: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800' },
  emptySub: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', textAlign: 'center', lineHeight: 22 },
});

// Director-only route. The screen body above is mounted only after
// DirectorOnly confirms the signed-in user directs this tournament, so its
// effects and fetches never run for anyone else.
export default function DirectorWorkspaceScreenRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <DirectorOnly tournamentId={id}>
      <DirectorWorkspaceScreen />
    </DirectorOnly>
  );
}
