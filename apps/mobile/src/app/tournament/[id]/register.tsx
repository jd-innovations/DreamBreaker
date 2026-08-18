import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors, radius } from '@/theme';
import { PrimaryButton, SecondaryButton } from '@/components';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { requireAuth } from '@/lib/authGuard';
import { getRegistrationAvailability } from '@/lib/registrationGate';
import { fetchTournamentById } from '@/lib/supabase/tournaments';
import {
  isPlayerRegistered,
  fetchPlayerHolds,
  createRegistration,
} from '@/lib/supabase/registrations';
import { useTournamentEntryPayment } from '@/lib/payments/useTournamentEntryPayment';
import type { Tournament } from '@/lib/tournamentTypes';

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
};

function fmt(cents: number) { return `$${Math.round(cents / 100)}`; }

type Connection = {
  id: string;
  player: { id: string; name: string; dupr: number; location: string; photoUri?: string };
  connectedAt: string;
};

// Real mutual partner-finder connections, mirroring match/connections.tsx's fetchMatches.
async function fetchRealConnections(uid: string): Promise<Connection[]> {
  const { data: matches } = await supabase
    .from('partner_matches')
    .select('id, user_a, user_b, matched_at')
    .or(`user_a.eq.${uid},user_b.eq.${uid}`)
    .order('matched_at', { ascending: false });

  if (!matches || matches.length === 0) return [];

  const otherIds = matches.map(m => (m.user_a === uid ? m.user_b : m.user_a));
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, dupr, self_rating, location_city, location_state')
    .in('id', otherIds);

  const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]));

  return matches
    .map((m): Connection | null => {
      const otherId = m.user_a === uid ? m.user_b : m.user_a;
      const p = profileMap[otherId];
      if (!p) return null;
      return {
        id: m.id,
        player: {
          id: p.id,
          name: p.full_name,
          dupr: p.dupr ?? (p.self_rating ? parseFloat(p.self_rating) : 0),
          location: [p.location_city, p.location_state].filter(Boolean).join(', ') || 'Unknown',
          photoUri: p.avatar_url ?? undefined,
        },
        connectedAt: m.matched_at,
      };
    })
    .filter((c): c is Connection => c !== null);
}

function requiresPartner(divisionName: string): boolean {
  return /doubles|mixed/i.test(divisionName);
}

type PartnerChoice = 'choose_later' | 'select_connection' | 'find';

// ─── Connection Row ───────────────────────────────────────────────────────────

function ConnectionRow({
  conn,
  selected,
  onPress,
}: {
  conn: Connection;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[cr.row, selected && cr.rowSelected]}
      activeOpacity={0.75}
      onPress={onPress}
    >
      {conn.player.photoUri ? (
        <Image source={{ uri: conn.player.photoUri }} style={cr.avatar} />
      ) : (
        <View style={[cr.avatar, cr.avatarFallback]}>
          <Text style={cr.avatarText}>{conn.player.name.charAt(0)}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={cr.name} numberOfLines={1}>{conn.player.name}</Text>
        <Text style={cr.sub}>{conn.player.dupr} DUPR  ·  {conn.player.location}</Text>
      </View>
      <View style={[cr.radio, selected && cr.radioSelected]}>
        {selected && <View style={cr.radioDot} />}
      </View>
    </TouchableOpacity>
  );
}

const cr = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: L.border,
  },
  rowSelected: { backgroundColor: L.goldLight },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarFallback: {
    backgroundColor: L.goldBg, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: L.navy, fontSize: 16, fontWeight: '800' },
  name: { color: L.navy, fontSize: 14, fontWeight: '700', marginBottom: 2 },
  sub:  { color: L.textSub, fontSize: 12 },
  radio: {
    width: 20, height: 20, borderRadius: 10, flexShrink: 0,
    borderWidth: 2, borderColor: L.border,
    alignItems: 'center', justifyContent: 'center',
  },
  radioSelected: { borderColor: L.navy },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: L.navy },
});

// ─── Option Card ─────────────────────────────────────────────────────────────

function OptionCard({
  label,
  sublabel,
  icon,
  selected,
  onPress,
  children,
}: {
  label: string;
  sublabel?: string;
  icon: string;
  selected: boolean;
  onPress: () => void;
  children?: React.ReactNode;
}) {
  return (
    <View style={[oc.card, selected && oc.cardSelected]}>
      <TouchableOpacity
        style={oc.row}
        activeOpacity={0.75}
        onPress={onPress}
      >
        <View style={[oc.iconCircle, selected && oc.iconCircleSelected]}>
          <Ionicons name={icon as never} size={18} color={selected ? L.navy : L.textSub} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[oc.label, selected && oc.labelSelected]}>{label}</Text>
          {!!sublabel && <Text style={oc.sublabel} numberOfLines={1}>{sublabel}</Text>}
        </View>
        <View style={[oc.radio, selected && oc.radioSelected]}>
          {selected && <View style={oc.radioDot} />}
        </View>
      </TouchableOpacity>
      {children}
    </View>
  );
}

const oc = StyleSheet.create({
  card: {
    backgroundColor: L.bg, borderWidth: 1, borderColor: L.border,
    borderRadius: radius.card, marginBottom: 10, overflow: 'hidden',
  },
  cardSelected: { borderColor: L.navy },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 14,
  },
  iconCircle: {
    width: 36, height: 36, borderRadius: 18, flexShrink: 0,
    backgroundColor: L.page, alignItems: 'center', justifyContent: 'center',
  },
  iconCircleSelected: { backgroundColor: L.goldBg },
  label:         { color: L.textSub, fontSize: 14, fontWeight: '600' },
  labelSelected: { color: L.navy },
  sublabel:      { color: L.textSub, fontSize: 12, marginTop: 1 },
  radio: {
    width: 20, height: 20, borderRadius: 10, flexShrink: 0,
    borderWidth: 2, borderColor: L.border,
    alignItems: 'center', justifyContent: 'center',
  },
  radioSelected: { borderColor: L.navy },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: L.navy },
});

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function TournamentRegisterScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const { payTournamentEntry, payTournamentBalance, payTournamentTeamEntry } = useTournamentEntryPayment();
  const p = useLocalSearchParams<{
    id: string;
    tournamentName: string;
    divisionId: string;
    divisionName: string;
    divisionLevel: string;
    holdAmountCents: string;
    entryAmountCents: string;
    date: string;
    venue: string;
    city: string;
    state: string;
  }>();

  const tournamentId   = p.id              ?? '';
  const tournamentName = p.tournamentName  ?? 'Tournament';
  const divisionId     = p.divisionId      ?? '';
  const divisionName   = p.divisionName    ?? 'Division';
  const divisionLevel  = p.divisionLevel   ?? '';
  const holdCents      = parseInt(p.holdAmountCents  ?? '0', 10);
  const entryCents     = parseInt(p.entryAmountCents ?? '0', 10);
  const date           = p.date  ?? '—';
  const venue          = p.venue ?? '—';
  const city           = p.city  ?? '';
  const state          = p.state ?? '';
  const location       = city ? `${venue}, ${city} ${state}` : venue;

  const partnerRequired = requiresPartner(divisionName);
  const balanceCents    = entryCents - holdCents;

  const [connections,        setConnections]        = useState<Connection[]>([]);
  const [partnerChoice,      setPartnerChoice]      = useState<PartnerChoice>('choose_later');
  const [selectedConnection, setSelectedConnection] = useState<Connection | null>(null);
  const [agreed,             setAgreed]             = useState(false);
  const [submitting,         setSubmitting]         = useState(false);
  const [fetchedTournament,  setFetchedTournament]  = useState<Tournament | null>(null);

  useFocusEffect(useCallback(() => {
    let active = true;
    if (user?.id) {
      fetchRealConnections(user.id).then(conns => { if (active) setConnections(conns); }).catch(() => {});
    } else {
      setConnections([]);
    }
    fetchTournamentById(tournamentId).then(t => {
      if (!active) return;
      if (t) {
        setFetchedTournament(t);
        const ra = getRegistrationAvailability(t);
        if (!ra.available) {
          Alert.alert('Registration Unavailable', ra.label, [
            { text: 'OK', onPress: () => router.back() },
          ]);
        }
      }
    });
    return () => { active = false; };
  }, [tournamentId, user?.id]));

  function handleChoicePress(choice: PartnerChoice) {
    setPartnerChoice(choice);
    if (choice !== 'select_connection') setSelectedConnection(null);
    if (choice === 'find') {
      router.push('/(tabs)/finder' as never);
    }
  }

  function handleSubmit() {
    if (!agreed) {
      Alert.alert('Agreement Required', 'Please agree to the tournament policies.');
      return;
    }
    if (fetchedTournament) {
      const ra = getRegistrationAvailability(fetchedTournament);
      if (!ra.available) {
        Alert.alert('Registration Unavailable', ra.label);
        return;
      }
    }
    requireAuth(user?.id, async () => {
      setSubmitting(true);
      const alreadyReg = await isPlayerRegistered(tournamentId, user!.id);
      if (alreadyReg) {
        setSubmitting(false);
        Alert.alert('Already Registered', 'You are already registered for this tournament.');
        return;
      }

      const partner = partnerChoice === 'select_connection' ? selectedConnection : null;
      const partnerStatus = !partnerRequired
        ? 'none' as const
        : partnerChoice === 'select_connection' && selectedConnection
          ? 'selected' as const
          : 'choose_later' as const;

      const holds = await fetchPlayerHolds(user!.id);
      const existingHold = holds.find(h => h.tournamentId === tournamentId && h.divisionId === divisionId);

      let success = false;
      let teamGroupId = '';
      if (existingHold) {
        const result = await payTournamentBalance({
          registrationId: existingHold.id,
          tournamentId,
          playerId: user!.id,
          partnerId: partner?.player.id,
        });

        if (!result.ok) {
          setSubmitting(false);
          if (result.reason === 'canceled') return;
          Alert.alert('Payment Failed', 'We could not complete your balance payment. Please try again.');
          return;
        }
        success = true;
      } else if (entryCents === 0) {
        // Free entry — no payment involved, nothing to confirm.
        const reg = await createRegistration({
          tournamentId,
          divisionId,
          playerId:          user!.id,
          entryFeePaidCents: 0,
          needsPartner:      partnerRequired,
          partnerId:         partner?.player.id,
        });
        success = reg != null;
      } else if (partnerRequired && partner) {
        // Doubles/mixed with a named partner: each player owes their OWN
        // entry fee. This charges the initiating player for their share
        // only and leaves the partner an invite they pay separately — the
        // team is not confirmed until both have paid (see
        // supabase/functions/create-tournament-team-entry-payment-intent).
        const result = await payTournamentTeamEntry({
          tournamentId,
          divisionId,
          playerId:  user!.id,
          partnerId: partner.player.id,
        });

        if (!result.ok) {
          setSubmitting(false);
          if (result.reason === 'canceled') return;
          if (result.reason === 'already_registered') {
            Alert.alert('Already Registered', 'You are already registered for this tournament.');
            return;
          }
          if (result.reason === 'partner_already_registered') {
            Alert.alert(
              'Partner Unavailable',
              `${partner.player.name} is already registered for this tournament. Choose a different partner.`,
            );
            return;
          }
          Alert.alert('Payment Failed', 'We could not complete your payment. Please try again.');
          return;
        }
        teamGroupId = result.groupId;
        success = true;
      } else {
        // Paid entry: the client never declares payment success itself. It
        // only presents Stripe's PaymentSheet; the registration row is
        // created server-side, only after a webhook-confirmed PaymentIntent
        // (see supabase/functions/create-tournament-entry-payment-intent and
        // web/src/app/api/stripe/webhooks/route.ts).
        const result = await payTournamentEntry({
          tournamentId,
          divisionId,
          playerId:     user!.id,
          needsPartner: partnerRequired,
          partnerId:    partner?.player.id,
        });

        if (!result.ok) {
          setSubmitting(false);
          if (result.reason === 'canceled') return;
          if (result.reason === 'already_registered') {
            Alert.alert('Already Registered', 'You are already registered for this tournament.');
            return;
          }
          Alert.alert('Payment Failed', 'We could not complete your payment. Please try again.');
          return;
        }
        success = true;
      }

      setSubmitting(false);

      if (!success) {
        Alert.alert('Error', 'Failed to complete registration. Please try again.');
        return;
      }

      router.replace({
        pathname: `/tournament/${tournamentId}/registration-success` as never,
        params: {
          tournamentName,
        divisionName,
        divisionLevel,
        holdAmountCents:  String(holdCents),
        entryAmountCents: String(entryCents),
        date,
        venue,
        city,
        state,
        partnerName:   partner?.player.name ?? '',
        partnerStatus,
        // Set only on the per-player team path. The success screen uses it to
        // say "you're paid, your partner still owes" instead of implying the
        // whole team is in.
        teamGroupId,
        // Add to Calendar needs the raw event date (not the pre-formatted
        // `date` display string above) plus street address -- both already
        // loaded on fetchedTournament, so no extra fetch is needed. Omitted
        // if the tournament somehow hasn't loaded by submit time; the
        // registration-success screen treats a missing eventDate as "no
        // calendar CTA" rather than guessing.
        eventDate:    fetchedTournament?.eventDate ?? '',
        venueAddress: fetchedTournament?.venueAddress ?? '',
        zipCode:      fetchedTournament?.zipCode ?? '',
      },
    } as never);
    });
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={L.navy} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Complete Registration</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
      >
        {/* ── Tournament summary ── */}
        <View style={s.summaryCard}>
          <View style={s.summaryLogoCol}>
            <View style={s.summaryLogo}>
              <Ionicons name="trophy-outline" size={22} color={L.gold} />
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.summaryName}>{tournamentName}</Text>
            <Text style={s.summaryDiv}>{divisionName}  •  {divisionLevel}</Text>
            <View style={s.summaryMeta}>
              <Ionicons name="calendar-outline" size={12} color={L.textSub} />
              <Text style={s.summaryMetaText}>{date}</Text>
              <Ionicons name="location-outline" size={12} color={L.textSub} />
              <Text style={s.summaryMetaText} numberOfLines={1}>{location}</Text>
            </View>
          </View>
        </View>

        {/* ── Fees ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>FEES</Text>
          <View style={s.feesCard}>
            <View style={s.feeRow}>
              <Text style={s.feeLabel}>Entry Fee</Text>
              <Text style={s.feeValue}>{fmt(entryCents)}</Text>
            </View>
            <View style={[s.feeRow, s.feeRowBorder]}>
              <Text style={s.feeLabel}>Deposit Applied</Text>
              <Text style={[s.feeValue, { color: L.success }]}>−{fmt(holdCents)}</Text>
            </View>
            <View style={[s.feeRow, s.balanceRow]}>
              <Text style={s.balanceLabel}>Balance Due</Text>
              <Text style={s.balanceValue}>{fmt(balanceCents)}</Text>
            </View>
          </View>
        </View>

        {/* ── Partner section ── */}
        {partnerRequired && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>PARTNER</Text>

            <OptionCard
              label="No Partner / Choose Later"
              sublabel="You can assign a partner before the deadline"
              icon="time-outline"
              selected={partnerChoice === 'choose_later'}
              onPress={() => handleChoicePress('choose_later')}
            />

            <OptionCard
              label="Select Existing Connection"
              sublabel={
                selectedConnection
                  ? selectedConnection.player.name
                  : 'Choose from your connections'
              }
              icon="people-outline"
              selected={partnerChoice === 'select_connection'}
              onPress={() => handleChoicePress('select_connection')}
            >
              {partnerChoice === 'select_connection' && (
                connections.length > 0 ? (
                  connections.map(conn => (
                    <ConnectionRow
                      key={conn.id}
                      conn={conn}
                      selected={selectedConnection?.id === conn.id}
                      onPress={() => setSelectedConnection(
                        selectedConnection?.id === conn.id ? null : conn,
                      )}
                    />
                  ))
                ) : (
                  <View style={s.emptyConnections}>
                    <Ionicons name="person-add-outline" size={24} color={L.textSub} />
                    <Text style={s.emptyConnectionsText}>No accepted connections yet</Text>
                    <SecondaryButton
                      label="Find Partner"
                      onPress={() => router.push('/(tabs)/finder' as never)}
                      style={{ marginTop: 8, alignSelf: 'center' }}
                    />
                  </View>
                )
              )}
            </OptionCard>

            <OptionCard
              label="Find Partner"
              sublabel="Browse and connect with players"
              icon="search-outline"
              selected={partnerChoice === 'find'}
              onPress={() => handleChoicePress('find')}
            />
          </View>
        )}

        {/* ── Agreement ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>AGREEMENT</Text>
          <TouchableOpacity
            style={s.agreeRow}
            activeOpacity={0.75}
            onPress={() => setAgreed(v => !v)}
          >
            <View style={[s.checkbox, agreed && s.checkboxChecked]}>
              {agreed && <Ionicons name="checkmark" size={14} color={L.bg} />}
            </View>
            <Text style={s.agreeText}>
              I understand and agree to the tournament policies, including the non-refundable deposit policy and registration deadline.
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── CTA ── */}
        <PrimaryButton
          label={submitting ? 'Registering…' : 'Complete Registration'}
          onPress={handleSubmit}
        />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: L.page },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: L.bg,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  backBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: L.navy, fontSize: 17, fontWeight: '800' },

  scroll: { paddingHorizontal: 16, paddingTop: 20 },

  summaryCard: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    backgroundColor: L.bg, borderWidth: 1, borderColor: L.border,
    borderRadius: radius.card, padding: 14, marginBottom: 20,
  },
  summaryLogoCol: { flexShrink: 0 },
  summaryLogo: {
    width: 48, height: 48, borderRadius: 12,
    backgroundColor: L.goldBg, alignItems: 'center', justifyContent: 'center',
  },
  summaryName:     { color: L.navy, fontSize: 15, fontWeight: '800', marginBottom: 2 },
  summaryDiv:      { color: L.textSub, fontSize: 12, fontWeight: '600', marginBottom: 6 },
  summaryMeta:     { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  summaryMetaText: { color: L.textSub, fontSize: 11 },

  section:      { marginBottom: 20 },
  sectionTitle: { color: L.navy, fontSize: 11, fontWeight: '900', letterSpacing: 0.8, marginBottom: 10 },

  feesCard: {
    backgroundColor: L.bg, borderWidth: 1, borderColor: L.border,
    borderRadius: radius.card, overflow: 'hidden',
  },
  feeRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  feeRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: L.border },
  balanceRow: {
    borderTopWidth: 1, borderTopColor: L.border,
    backgroundColor: L.goldLight, paddingHorizontal: 16, paddingVertical: 14,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  feeLabel:    { color: L.textSub, fontSize: 14 },
  feeValue:    { color: L.navy,    fontSize: 14, fontWeight: '700' },
  balanceLabel:{ color: L.navy,    fontSize: 14, fontWeight: '700' },
  balanceValue:{ color: L.navy,    fontSize: 17, fontWeight: '900' },

  emptyConnections: {
    alignItems: 'center', paddingVertical: 20, paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: L.border,
  },
  emptyConnectionsText: { color: L.textSub, fontSize: 14, marginTop: 8, marginBottom: 4 },

  agreeRow: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    backgroundColor: L.bg, borderWidth: 1, borderColor: L.border,
    borderRadius: radius.card, padding: 16,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, flexShrink: 0,
    borderWidth: 2, borderColor: L.border,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: L.navy, borderColor: L.navy },
  agreeText: { color: L.text, fontSize: 13, lineHeight: 20, flex: 1 },
});
