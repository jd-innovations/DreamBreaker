import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { useSession } from '@/hooks/useSession';
import { getRegistrationAvailability } from '@/lib/registrationGate';
import { fetchTournamentById } from '@/lib/supabase/tournaments';
import { fetchDivisionsForTournament } from '@/lib/supabase/divisions';
import { fetchPlayerHolds, fetchPlayerRegistrations, isPlayerHeld, isPlayerRegistered } from '@/lib/supabase/registrations';
import { effectiveEntryFeeCents } from '@/lib/tournamentFees';
import type { Tournament } from '@/lib/tournamentTypes';
import type { DivisionData } from '@/data/divisions';

type Intent = 'hold' | 'register';

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

function fmt(cents: number) { return `$${Math.round(cents / 100)}`; }

function eventTypeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (/mixed/i.test(lower)) return 'Mixed Doubles';
  if (/doubles/i.test(lower)) return "Doubles";
  if (/singles/i.test(lower)) return "Singles";
  return 'Open';
}

type DivStatus = 'available' | 'held' | 'registered' | 'waitlist' | 'locked';

function DivisionOption({
  name, level, eventType, registered, capacity, status, selected, onPress,
}: {
  name: string; level: string; eventType: string;
  registered: number; capacity: number;
  status: DivStatus; selected: boolean;
  onPress: () => void;
}) {
  const spotsLeft  = capacity - registered;
  const pct        = Math.min(100, Math.round((registered / capacity) * 100));
  const isDisabled = status === 'registered' || status === 'waitlist' || status === 'locked';

  const borderColor = selected
    ? L.gold
    : status === 'held'       ? L.gold
    : status === 'registered' ? L.success
    : L.border;

  const bg = selected
    ? L.goldBg
    : status === 'held'       ? L.goldBg
    : status === 'registered' ? L.successBg
    : L.bg;

  const badgeText =
    status === 'registered' ? 'Registered ✓' :
    status === 'held'       ? 'Spot Held ✓'  :
    status === 'waitlist'   ? 'Waitlist Only' :
    status === 'locked'     ? 'Not Available' :
    selected                ? 'Selected'      : 'Available';

  const badgeColor =
    status === 'registered' ? L.success :
    status === 'held'       ? L.gold    :
    status === 'waitlist'   ? L.danger  :
    status === 'locked'     ? L.textSub :
    selected                ? L.gold    : L.success;

  const badgeBg =
    status === 'registered' ? L.successBg :
    status === 'held'       ? L.goldBg    :
    status === 'waitlist'   ? L.dangerBg  :
    status === 'locked'     ? L.page      :
    selected                ? L.goldBg    : L.successBg;

  return (
    <TouchableOpacity
      style={[
        dv.card,
        { backgroundColor: bg, borderColor },
        selected && dv.cardSelected,
        isDisabled && dv.cardDisabled,
      ]}
      activeOpacity={isDisabled ? 1 : 0.8}
      onPress={isDisabled ? undefined : onPress}
    >
      {/* ── Left ── */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={dv.nameRow}>
          <Text style={dv.divName} numberOfLines={1}>{name}</Text>
          <View style={[dv.badge, { backgroundColor: badgeBg }]}>
            <Text style={[dv.badgeText, { color: badgeColor }]}>{badgeText}</Text>
          </View>
        </View>

        <View style={dv.metaRow}>
          <View style={[dv.levelChip, { borderColor: L.navy }]}>
            <Text style={dv.levelChipText}>{level}</Text>
          </View>
          <Text style={dv.eventType}>{eventType}</Text>
        </View>

        {/* Fill bar */}
        <View style={dv.fillRow}>
          <View style={dv.fillTrack}>
            <View style={[dv.fillBar, {
              width: `${pct}%` as `${number}%`,
              backgroundColor: pct >= 90 ? L.danger : pct >= 70 ? L.gold : L.success,
            }]} />
          </View>
          <Text style={dv.fillLabel}>
            {status === 'waitlist' ? 'Full' : `${spotsLeft} left`}
          </Text>
        </View>

        <Text style={dv.regCount}>{registered} / {capacity} registered</Text>
      </View>

      {/* ── Right ── */}
      {!isDisabled && (
        <View style={[dv.selectCircle, selected && dv.selectCircleActive]}>
          {selected && <Ionicons name="checkmark" size={16} color={L.bg} />}
        </View>
      )}
    </TouchableOpacity>
  );
}

const dv = StyleSheet.create({
  card: {
    borderWidth: 1.5, borderRadius: shape.card,
    padding: 14, marginBottom: 10, flexDirection: 'row',
    alignItems: 'center', gap: 12,
  },
  cardSelected: {
    shadowColor: L.gold, shadowOpacity: 0.20,
    shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 3,
  },
  cardDisabled: { opacity: 0.65 },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 },
  divName: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800', flex: 1 },
  badge: { borderRadius: shape.cta, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0 },
  badgeText: { fontSize: text.cardLabel.size, fontWeight: '800', letterSpacing: text.cardLabel.letterSpacing },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  levelChip: { borderWidth: 1, borderRadius: shape.badge, paddingHorizontal: 6, paddingVertical: 2 },
  levelChipText: { color: L.navy, fontSize: text.cardLabel.size, fontWeight: '800', letterSpacing: text.cardLabel.letterSpacing },
  eventType: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500' },
  fillRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  fillTrack: { flex: 1, height: 4, backgroundColor: L.page, borderRadius: 2, overflow: 'hidden' },
  fillBar: { height: '100%', borderRadius: 2 },
  fillLabel: { color: L.textSub, fontSize: text.microLabel.size, fontWeight: '700', width: 38, textAlign: 'right' },
  regCount: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500' },
  selectCircle: {
    width: 26, height: 26, borderRadius: 13, flexShrink: 0,
    borderWidth: 2, borderColor: L.border,
    alignItems: 'center', justifyContent: 'center',
  },
  selectCircleActive: { backgroundColor: L.gold, borderColor: L.gold },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function SelectDivisionScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const { id, intent: intentParam } = useLocalSearchParams<{ id: string; intent: string }>();
  const intent: Intent = intentParam === 'register' ? 'register' : 'hold';

  const [tournament, setTournament]   = useState<Tournament | null>(null);
  const [divisions, setDivisions]     = useState<DivisionData[]>([]);
  const [loading, setLoading]         = useState(true);
  const [selectedId, setSelectedId]   = useState<string | null>(null);
  const [heldDivisionId, setHeldDivisionId] = useState<string | null>(null);
  const [regDivIds, setRegDivIds]           = useState<Set<string>>(new Set());
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const alreadyHeld = heldDivisionId != null;

  useFocusEffect(useCallback(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const [t, divs] = await Promise.all([
        fetchTournamentById(id),
        fetchDivisionsForTournament(id),
      ]);
      if (!active) return;
      setTournament(t);
      setDivisions(divs);

      if (user?.id) {
        const [holds, regs] = await Promise.all([
          fetchPlayerHolds(user.id),
          fetchPlayerRegistrations(user.id),
        ]);
        if (!active) return;
        const held = holds.find(h => h.tournamentId === id);
        setHeldDivisionId(held?.divisionId ?? null);
        setRegDivIds(new Set(regs.filter(r => r.tournamentId === id).map(r => r.divisionId)));
        setAlreadyRegistered(regs.some(r => r.tournamentId === id));
        if (intent === 'register' && held) setSelectedId(held.divisionId);
      }
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [id, user?.id, intent]));

  // Per-division status
  function getDivStatus(divId: string): DivStatus {
    if (regDivIds.has(divId)) return 'registered';
    if (heldDivisionId === divId) return 'held';
    // If already held a DIFFERENT division, lock other divisions
    if (heldDivisionId && heldDivisionId !== divId) return 'locked';
    // If already registered in ANY division of this tournament, lock others
    if (alreadyRegistered) return 'locked';
    const div = divisions.find(d => d.id === divId);
    if (!div || div.status !== 'open') return 'waitlist';
    return 'available';
  }

  function handleSelect(divId: string) {
    const st = getDivStatus(divId);
    if (st === 'locked' || st === 'waitlist' || st === 'registered') return;
    if (selectedId === divId) {
      setSelectedId(null);
    } else {
      setSelectedId(divId);
    }
  }

  function handleContinue() {
    if (!selectedId) return;
    const selectedDiv = divisions.find(d => d.id === selectedId);
    if (!selectedDiv) return;

    if (tournament) {
      const regAvailability = getRegistrationAvailability(tournament);
      if (!regAvailability.available) {
        Alert.alert('Registration Unavailable', regAvailability.label);
        return;
      }
    }

    if (intent === 'hold') {
      if (alreadyRegistered) {
        Alert.alert('Already Registered', 'You are already registered for this tournament.');
        return;
      }
      if (alreadyHeld && heldDivisionId !== selectedId) {
        Alert.alert('Hold Exists', 'You already have a hold on a different division. Complete or cancel that registration first.');
        return;
      }
      if (heldDivisionId === selectedId) {
        Alert.alert('Already Held', 'You already have a hold on this division.');
        return;
      }
      router.push({
        pathname: `/tournament/${id}/hold-confirm` as never,
        params: { divisionId: selectedId },
      } as never);
      return;
    }

    // intent === 'register'
    if (alreadyRegistered && regDivIds.has(selectedId)) {
      Alert.alert('Already Registered', 'You are already registered for this division.');
      return;
    }
    if (alreadyRegistered) {
      Alert.alert('Already Registered', 'You are already registered for this tournament.');
      return;
    }
    router.push({
      pathname: `/tournament/${id}/register` as never,
      params: {
        tournamentName:   tournament?.name ?? '',
        divisionId:       selectedId,
        divisionName:     selectedDiv.name,
        divisionLevel:    selectedDiv.level,
        holdAmountCents:  String(tournament?.holdFeeCents ?? 0),
        // The chosen division's fee, not the tournament base fee — this is the
        // number the register screen quotes and the server will charge.
        entryAmountCents: String(effectiveEntryFeeCents(selectedDiv.entryFeeCents, tournament?.entryFeeCents)),
        date:             tournament?.date ?? '',
        venue:            tournament?.venue ?? '',
        city:             tournament?.city ?? '',
        state:            tournament?.state ?? '',
      },
    } as never);
  }

  const canContinue = selectedId !== null && (() => {
    const st = getDivStatus(selectedId);
    return st === 'available' || st === 'held';
  })();

  const intentLabel   = intent === 'hold' ? 'Hold My Spot'        : 'Complete Registration';
  const intentIcon    = intent === 'hold' ? 'shield-checkmark-outline' : 'checkmark-circle-outline';
  const continueLabel = intent === 'hold' ? `Hold for ${fmt(tournament?.holdFeeCents ?? 0)}` : 'Continue to Register';

  // Banner shown when: intent=hold + already held, or intent=register + already registered
  const infoBanner: string | null =
    intent === 'register' && alreadyHeld && heldDivisionId
      ? `You have a held spot. Complete your registration for that division.`
    : intent === 'hold' && alreadyHeld
      ? `You already have a hold. Complete your current registration to free up a new hold slot.`
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
          <Text style={s.headerTitle}>{intentLabel}</Text>
          <Text style={s.headerSub} numberOfLines={1}>{tournament?.name ?? '...'}</Text>
        </View>
        <Ionicons name={intentIcon as never} size={22} color={L.gold} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 120 }]}
      >
        {/* Registration gate banner */}
        {tournament && (() => {
          const ra = getRegistrationAvailability(tournament);
          if (ra.available) return null;
          return (
            <View style={s.regGateBanner}>
              <Ionicons
                name={ra.reason === 'not_open_yet' ? 'time-outline' : 'lock-closed-outline'}
                size={18}
                color={L.navy}
              />
              <Text style={s.regGateBannerText}>{ra.label}</Text>
            </View>
          );
        })()}

        {/* Info banner */}
        {infoBanner && (
          <View style={s.infoBanner}>
            <Ionicons name="information-circle-outline" size={18} color={L.gold} />
            <Text style={s.infoBannerText}>{infoBanner}</Text>
          </View>
        )}

        {/* Section header */}
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>SELECT A DIVISION</Text>
          <Text style={s.sectionSub}>{divisions.length} available</Text>
        </View>

        {divisions.length === 0 ? (
          <View style={s.emptyCard}>
            <Ionicons name="trophy-outline" size={36} color={L.textSub} />
            <Text style={s.emptyText}>No divisions available for this tournament</Text>
          </View>
        ) : (
          divisions.map(d => (
            <DivisionOption
              key={d.id}
              name={d.name}
              level={d.level}
              eventType={eventTypeFromName(d.name)}
              registered={d.registered}
              capacity={d.capacity}
              status={getDivStatus(d.id)}
              selected={selectedId === d.id}
              onPress={() => handleSelect(d.id)}
            />
          ))
        )}
      </ScrollView>

      {/* ── Sticky footer ── */}
      <View style={[s.footer, { paddingBottom: insets.bottom + 16 }]}>
        {selectedId && (() => {
          const div = divisions.find(d => d.id === selectedId);
          if (!div) return null;
          return (
            <View style={s.selectedSummary}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.selectedLabel}>Selected</Text>
                <Text style={s.selectedName} numberOfLines={1}>{div.name} · {div.level}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedId(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={22} color={L.textSub} />
              </TouchableOpacity>
            </View>
          );
        })()}
        <TouchableOpacity
          style={[s.continueBtn, !canContinue && s.continueBtnDisabled]}
          activeOpacity={canContinue ? 0.85 : 1}
          onPress={canContinue ? handleContinue : undefined}
        >
          <Text style={[s.continueBtnText, !canContinue && s.continueBtnTextDisabled]}>
            {canContinue ? continueLabel : 'Select a Division'}
          </Text>
          {canContinue && <Ionicons name="arrow-forward" size={18} color={L.bg} />}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },
  scroll: { paddingHorizontal: 16, paddingTop: 16 },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: L.bg,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800' },
  headerSub: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', marginTop: 1 },

  regGateBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: L.page, borderWidth: 1, borderColor: L.border,
    borderRadius: shape.panel, padding: 14, marginBottom: 12,
  },
  regGateBannerText: { color: L.navy, fontSize: text.rowTitle.size, fontWeight: '700', flex: 1 },

  infoBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: L.goldLight, borderWidth: 1, borderColor: L.goldBorder,
    borderRadius: shape.panel, padding: 14, marginBottom: 16,
  },
  infoBannerText: { color: L.navy, fontSize: text.caption.size, lineHeight: 19, flex: 1, fontWeight: '500' },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12,
  },
  sectionTitle: { color: L.navy, fontSize: text.sectionLabel.size, fontWeight: '800', letterSpacing: text.sectionLabel.letterSpacing },
  sectionSub: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500' },

  emptyCard: {
    backgroundColor: L.bg, borderWidth: 1, borderColor: L.border,
    borderRadius: shape.card, padding: 32, alignItems: 'center', gap: 12,
  },
  emptyText: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', textAlign: 'center' },

  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: L.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: L.border,
    paddingHorizontal: 16, paddingTop: 14,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: -2 },
    elevation: 6,
  },
  selectedSummary: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: L.goldBg, borderRadius: shape.cta, borderWidth: 1, borderColor: L.goldBorder,
    paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10,
  },
  selectedLabel: { color: L.textSub, fontSize: text.microLabel.size, fontWeight: '700', letterSpacing: 0.4 },
  selectedName: { color: L.navy, fontSize: text.rowTitle.size, fontWeight: '700' },

  continueBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: L.navy, borderRadius: shape.cta, paddingVertical: 16,
  },
  continueBtnDisabled: { backgroundColor: L.border },
  continueBtnText: { color: L.bg, fontSize: text.actionLarge.size, fontWeight: '800' },
  continueBtnTextDisabled: { color: L.textSub },
});
