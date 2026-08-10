import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { goBack } from '@/lib/navigation';
import { colors, radius } from '@/theme';
import { StatusChip } from '@/components';
import { getPlayerRegStatusInfo } from '@/lib/tournamentStatus';
import type { HeldSpot } from '@/lib/tournamentStore';
import type { TournamentRegistration } from '@/lib/registrationStore';
import { useSession } from '@/hooks/useSession';
import { useTournamentBookmarks } from '@/hooks/useTournamentBookmarks';
import {
  fetchPlayerHolds,
  fetchPlayerRegistrations,
  cancelRegistration as cancelRegistrationSB,
  cancelHold as cancelHoldSB,
} from '@/lib/supabase/registrations';
import { fetchBookmarkedTournaments, type BookmarkedTournament } from '@/lib/supabase/tournamentBookmarks';

const L = {
  bg:        colors.bg,
  page:      colors.page,
  navy:      colors.navy,
  gold:      colors.gold,
  goldBg:    colors.goldBg,
  goldLight: colors.goldLight,
  text:      colors.text,
  textSub:   colors.textSub,
  border:    colors.border,
  success:   colors.success,
  successBg: colors.successBg,
  danger:    colors.danger,
  dangerBg:  colors.dangerBg,
};

function fmt(cents: number) { return `$${Math.round(cents / 100)}`; }

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1)  return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

// ─── Registered Card ──────────────────────────────────────────────────────────

function RegistrationCard({ reg, onCancel }: { reg: TournamentRegistration; onCancel: () => void }) {
  function handleCancel() {
    Alert.alert(
      'Cancel Registration',
      `Cancel your registration for ${reg.divisionName} ${reg.divisionLevel} at ${reg.tournamentName}? Note: cancellation policy applies.`,
      [
        { text: 'Keep Registration', style: 'cancel' },
        { text: 'Cancel Registration', style: 'destructive', onPress: onCancel },
      ],
    );
  }

  return (
    <View style={c.card}>
      {/* ── Header ── */}
      <View style={c.cardHeader}>
        <View style={c.logoBox}>
          <Ionicons name="trophy-outline" size={22} color={L.gold} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={c.tournamentName} numberOfLines={1}>{reg.tournamentName}</Text>
          <Text style={c.divisionLine}>{reg.divisionName}  •  {reg.divisionLevel}</Text>
          {reg.partnerStatus === 'selected' && reg.partnerName ? (
            <View style={c.partnerRow}>
              <Ionicons name="person-outline" size={11} color={L.textSub} />
              <Text style={c.partnerText} numberOfLines={1}>w/ {reg.partnerName}</Text>
            </View>
          ) : reg.partnerStatus === 'choose_later' ? (
            <View style={c.partnerRow}>
              <Ionicons name="time-outline" size={11} color={L.textSub} />
              <Text style={c.partnerText}>Partner: Choose Later</Text>
            </View>
          ) : null}
        </View>
        <StatusChip
          label={getPlayerRegStatusInfo(
            reg.status === 'checked_in' ? 'checked_in'
            : reg.status === 'waitlisted' ? 'waitlisted'
            : 'registered',
          ).label}
          variant={getPlayerRegStatusInfo(
            reg.status === 'checked_in' ? 'checked_in'
            : reg.status === 'waitlisted' ? 'waitlisted'
            : 'registered',
          ).variant}
        />
      </View>

      {/* ── Meta ── */}
      <View style={c.metaRow}>
        <Ionicons name="calendar-outline" size={13} color={L.textSub} />
        <Text style={c.metaText}>{reg.date}</Text>
        <Ionicons name="location-outline" size={13} color={L.textSub} />
        <Text style={c.metaText} numberOfLines={1}>{reg.city ? `${reg.venue}, ${reg.city}` : reg.venue}</Text>
      </View>

      {/* ── Fees ── */}
      <View style={c.feesRow}>
        <View style={c.feeCell}>
          <Text style={c.feeCellLabel}>Paid</Text>
          <Text style={c.feeCellValue}>{fmt(reg.amountPaid)}</Text>
        </View>
        <View style={c.feeDivider} />
        <View style={c.feeCell}>
          <Text style={c.feeCellLabel}>Balance Due</Text>
          <Text style={[c.feeCellValue, reg.balanceDue === 0 && { color: L.success }]}>
            {reg.balanceDue > 0 ? fmt(reg.balanceDue) : 'Paid'}
          </Text>
        </View>
        <View style={c.feeDivider} />
        <View style={c.feeCell}>
          <Text style={c.feeCellLabel}>Registered</Text>
          <Text style={c.feeCellValue}>{relativeDate(reg.registrationDate)}</Text>
        </View>
      </View>

      {/* ── Actions ── */}
      <View style={c.actions}>
        <TouchableOpacity
          style={c.viewBtn}
          activeOpacity={0.75}
          onPress={() => router.push(`/tournament/${reg.tournamentId}` as never)}
        >
          <Ionicons name="eye-outline" size={15} color={L.navy} />
          <Text style={c.viewBtnText}>View</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={c.cancelBtn}
          activeOpacity={0.75}
          onPress={handleCancel}
        >
          <Ionicons name="close-outline" size={16} color={L.danger} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Held Spot Card ───────────────────────────────────────────────────────────

function HeldSpotCard({ spot, onRefresh }: { spot: HeldSpot; onRefresh: () => void }) {
  const balance = spot.entryAmountCents - spot.holdAmountCents;

  function handleCancel() {
    Alert.alert(
      'Cancel Hold',
      `Cancel your hold on ${spot.divisionName} ${spot.divisionLevel} at ${spot.tournamentName}? Your ${fmt(spot.holdAmountCents)} deposit is non-refundable.`,
      [
        { text: 'Keep Hold', style: 'cancel' },
        {
          text: 'Cancel Hold', style: 'destructive',
          onPress: () => { cancelHoldSB(spot.id).then(() => onRefresh()); },
        },
      ],
    );
  }

  return (
    <View style={c.card}>
      {/* ── Header ── */}
      <View style={c.cardHeader}>
        <View style={c.logoBox}>
          <Ionicons name="trophy-outline" size={22} color={L.gold} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={c.tournamentName} numberOfLines={1}>{spot.tournamentName}</Text>
          <Text style={c.divisionLine}>{spot.divisionName}  •  {spot.divisionLevel}</Text>
        </View>
        <StatusChip
          label={getPlayerRegStatusInfo('held').label}
          variant={getPlayerRegStatusInfo('held').variant}
        />
      </View>

      {/* ── Meta ── */}
      <View style={c.metaRow}>
        <Ionicons name="calendar-outline" size={13} color={L.textSub} />
        <Text style={c.metaText}>{spot.date}</Text>
        <Ionicons name="location-outline" size={13} color={L.textSub} />
        <Text style={c.metaText} numberOfLines={1}>{spot.city ? `${spot.venue}, ${spot.city}` : spot.venue}</Text>
      </View>

      {/* ── Fees ── */}
      <View style={c.feesRow}>
        <View style={c.feeCell}>
          <Text style={c.feeCellLabel}>Deposit Paid</Text>
          <Text style={c.feeCellValue}>{fmt(spot.holdAmountCents)}</Text>
        </View>
        <View style={c.feeDivider} />
        <View style={c.feeCell}>
          <Text style={c.feeCellLabel}>Balance Due</Text>
          <Text style={[c.feeCellValue, { color: L.navy }]}>{fmt(balance)}</Text>
        </View>
        <View style={c.feeDivider} />
        <View style={c.feeCell}>
          <Text style={c.feeCellLabel}>Held</Text>
          <Text style={c.feeCellValue}>{relativeDate(spot.heldAt)}</Text>
        </View>
      </View>

      {/* ── Actions ── */}
      <View style={c.actions}>
        <TouchableOpacity
          style={c.viewBtn}
          activeOpacity={0.75}
          onPress={() => router.push(`/tournament/${spot.tournamentId}` as never)}
        >
          <Ionicons name="eye-outline" size={15} color={L.navy} />
          <Text style={c.viewBtnText}>View</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={c.registerBtn}
          activeOpacity={0.85}
          onPress={() => router.push({
            pathname: `/tournament/${spot.tournamentId}/register` as never,
            params: {
              tournamentName:   spot.tournamentName,
              divisionId:       spot.divisionId,
              divisionName:     spot.divisionName,
              divisionLevel:    spot.divisionLevel,
              holdAmountCents:  String(spot.holdAmountCents),
              entryAmountCents: String(spot.entryAmountCents),
              date:             spot.date,
              venue:            spot.venue,
              city:             spot.city,
              state:            spot.state,
            },
          } as never)}
        >
          <Text style={c.registerBtnText}>Complete Registration</Text>
          <Ionicons name="arrow-forward" size={14} color={L.bg} />
        </TouchableOpacity>

        <TouchableOpacity style={c.cancelBtn} activeOpacity={0.75} onPress={handleCancel}>
          <Ionicons name="close-outline" size={16} color={L.danger} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Saved Tournament Card ────────────────────────────────────────────────────

function SavedTournamentCard({ tournament, onUnsave }: { tournament: BookmarkedTournament; onUnsave: () => void }) {
  const location = [tournament.venue_name, tournament.city].filter(Boolean).join(', ');
  return (
    <View style={c.card}>
      <View style={c.cardHeader}>
        <View style={c.logoBox}>
          <Ionicons name="bookmark" size={20} color={L.gold} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={c.tournamentName} numberOfLines={1}>{tournament.name}</Text>
          {!!location && <Text style={c.divisionLine} numberOfLines={1}>{location}</Text>}
        </View>
      </View>

      <View style={c.metaRow}>
        {!!tournament.event_date && (
          <>
            <Ionicons name="calendar-outline" size={13} color={L.textSub} />
            <Text style={c.metaText}>{tournament.event_date}</Text>
          </>
        )}
      </View>

      <View style={c.actions}>
        <TouchableOpacity
          style={c.viewBtn}
          activeOpacity={0.75}
          onPress={() => router.push(`/tournament/${tournament.id}` as never)}
        >
          <Ionicons name="eye-outline" size={15} color={L.navy} />
          <Text style={c.viewBtnText}>View</Text>
        </TouchableOpacity>

        <TouchableOpacity style={c.cancelBtn} activeOpacity={0.75} onPress={onUnsave}>
          <Ionicons name="bookmark-outline" size={16} color={L.danger} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Shared card styles ───────────────────────────────────────────────────────

const c = StyleSheet.create({
  card: {
    backgroundColor: L.bg, borderRadius: radius.card,
    borderWidth: 1, borderColor: L.border,
    marginBottom: 12, overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, paddingBottom: 10,
  },
  logoBox: {
    width: 48, height: 48, borderRadius: 12,
    backgroundColor: L.goldBg, alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  tournamentName: { color: L.navy, fontSize: 18, fontWeight: '800', marginBottom: 2 },
  divisionLine:   { color: L.textSub, fontSize: 12, fontWeight: '500' },
  partnerRow:     { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  partnerText:    { color: L.textSub, fontSize: 11 },

  heldBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: L.successBg, borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  heldBadgeText: { color: L.success, fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },

  registeredBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: L.successBg, borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  registeredBadgeText: { color: L.success, fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },

  metaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap',
    paddingHorizontal: 14, paddingBottom: 12,
  },
  metaText: { color: L.textSub, fontSize: 12 },

  feesRow: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: L.border,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
    backgroundColor: L.page,
  },
  feeCell:      { flex: 1, alignItems: 'center', paddingVertical: 12, gap: 3 },
  feeDivider:   { width: StyleSheet.hairlineWidth, backgroundColor: L.border },
  feeCellLabel: { color: L.textSub, fontSize: 10, fontWeight: '600' },
  feeCellValue: { color: L.navy,    fontSize: 14, fontWeight: '800' },

  actions: { flexDirection: 'row', gap: 8, padding: 12, alignItems: 'center' },

  viewBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1.5, borderColor: L.border, borderRadius: 10,
    paddingVertical: 9, paddingHorizontal: 14,
  },
  viewBtnText: { color: L.navy, fontSize: 13, fontWeight: '700' },

  registerBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: L.navy, borderRadius: 10, paddingVertical: 10,
  },
  registerBtnText: { color: L.bg, fontSize: 13, fontWeight: '700' },

  cancelBtn: {
    width: 38, height: 38, borderRadius: 10,
    borderWidth: 1.5, borderColor: L.dangerBg,
    alignItems: 'center', justifyContent: 'center',
  },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function MyTournamentsScreen() {
  const insets = useSafeAreaInsets();
  const { user, loading: authLoading } = useSession();
  const [held, setHeld]             = useState<HeldSpot[]>([]);
  const [registered, setRegistered] = useState<TournamentRegistration[]>([]);
  const [saved, setSaved]           = useState<BookmarkedTournament[]>([]);
  const [loading, setLoading]       = useState(true);
  const { toggleBookmark } = useTournamentBookmarks();

  useEffect(() => {
    if (!authLoading && !user) router.replace('/sign-in' as never);
  }, [user, authLoading]);

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const [holds, regs, savedTournaments] = await Promise.all([
      fetchPlayerHolds(user.id),
      fetchPlayerRegistrations(user.id),
      fetchBookmarkedTournaments(user.id),
    ]);
    setHeld(holds);
    setRegistered(regs.filter(r => r.status !== 'cancelled'));
    setSaved(savedTournaments);
    setLoading(false);
  }, [user?.id]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.page, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.gold} />
      </View>
    );
  }

  const isEmpty = held.length === 0 && registered.length === 0 && saved.length === 0;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={L.navy} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>My Tournaments</Text>
        <View style={{ width: 40 }} />
      </View>

      {isEmpty ? (
        <View style={s.empty}>
          <Ionicons name="trophy-outline" size={52} color={L.textSub} />
          <Text style={s.emptyTitle}>No tournaments yet</Text>
          <Text style={s.emptySub}>
            Browse tournaments and tap "Hold My Spot" to secure your place.
          </Text>
          <TouchableOpacity
            style={s.browseBtn}
            activeOpacity={0.85}
            onPress={() => router.push('/(tabs)/tournaments' as never)}
          >
            <Text style={s.browseBtnText}>Browse Tournaments</Text>
            <Ionicons name="arrow-forward" size={16} color={L.bg} />
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 24 }]}
        >
          {registered.length > 0 && (
            <>
              <Text style={s.sectionLabel}>REGISTERED  •  {registered.length}</Text>
              {registered.map(reg => (
                <RegistrationCard
                  key={reg.id}
                  reg={reg}
                  onCancel={() => { cancelRegistrationSB(reg.id).then(() => refresh()); }}
                />
              ))}
            </>
          )}

          {held.length > 0 && (
            <>
              <Text style={[s.sectionLabel, registered.length > 0 && { marginTop: 8 }]}>
                HELD SPOTS  •  {held.length}
              </Text>
              {held.map(spot => (
                <HeldSpotCard key={spot.id} spot={spot} onRefresh={refresh} />
              ))}
            </>
          )}

          {saved.length > 0 && (
            <>
              <Text style={[s.sectionLabel, (registered.length > 0 || held.length > 0) && { marginTop: 8 }]}>
                SAVED  •  {saved.length}
              </Text>
              {saved.map(t => (
                <SavedTournamentCard
                  key={t.id}
                  tournament={t}
                  onUnsave={() => { toggleBookmark(t.id); setSaved(prev => prev.filter(x => x.id !== t.id)); }}
                />
              ))}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: L.bg,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  backBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: L.navy, fontSize: 17, fontWeight: '800' },

  list:         { paddingHorizontal: 16, paddingTop: 16 },
  sectionLabel: { color: L.textSub, fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginBottom: 12 },

  empty: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 40, gap: 12,
  },
  emptyTitle: { color: L.navy, fontSize: 20, fontWeight: '800' },
  emptySub:   { color: L.textSub, fontSize: 14, textAlign: 'center', lineHeight: 22 },
  browseBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: L.navy, borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 24, marginTop: 8,
  },
  browseBtnText: { color: L.bg, fontSize: 15, fontWeight: '700' },
});
