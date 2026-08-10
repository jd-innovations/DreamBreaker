import React from 'react';
import {
  View, Text, StyleSheet, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors, radius } from '@/theme';
import { PrimaryButton, SecondaryButton } from '@/components';

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
};

function fmt(cents: number) { return `$${Math.round(cents / 100)}`; }

function Row({ icon, label, value, last }: {
  icon: string; label: string; value: string; last?: boolean;
}) {
  return (
    <>
      <View style={s.row}>
        <Ionicons name={icon as never} size={16} color={L.textSub} style={{ marginTop: 1 }} />
        <View style={{ flex: 1 }}>
          <Text style={s.rowLabel}>{label}</Text>
          <Text style={s.rowValue}>{value}</Text>
        </View>
      </View>
      {!last && <View style={s.divider} />}
    </>
  );
}

export default function RegistrationSuccessScreen() {
  const insets = useSafeAreaInsets();
  const p = useLocalSearchParams<{
    id: string;
    tournamentName: string;
    divisionName: string;
    divisionLevel: string;
    holdAmountCents: string;
    entryAmountCents: string;
    date: string;
    venue: string;
    city: string;
    state: string;
    partnerName?: string;
    partnerStatus?: string;
  }>();

  const tournamentName = p.tournamentName ?? 'Tournament';
  const divisionName   = p.divisionName   ?? 'Division';
  const divisionLevel  = p.divisionLevel  ?? '';
  const holdCents      = parseInt(p.holdAmountCents  ?? '0', 10);
  const entryCents     = parseInt(p.entryAmountCents ?? '0', 10);
  const date           = p.date  ?? '—';
  const venue          = p.venue ?? '—';
  const city           = p.city  ?? '';
  const state          = p.state ?? '';
  const partnerName    = p.partnerName   ?? '';
  const partnerStatus  = p.partnerStatus ?? '';
  const balanceCents   = entryCents - holdCents;
  const location       = city ? `${venue}, ${city} ${state}` : venue;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
      >
        {/* ── Hero ── */}
        <View style={s.hero}>
          <View style={s.iconCircle}>
            <Ionicons name="checkmark" size={48} color={L.gold} />
          </View>
          <Text style={s.title}>Registration{'\n'}Complete!</Text>
          <Text style={s.subtitle}>
            You're registered for{'\n'}
            <Text style={s.subtitleBold}>{tournamentName}</Text>
          </Text>

          <View style={s.statusPill}>
            <Ionicons name="shield-checkmark" size={14} color={L.success} />
            <Text style={s.statusText}>Registered</Text>
          </View>
        </View>

        {/* ── Registration summary ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>{tournamentName}</Text>
          <View style={s.divider} />
          <Row icon="trophy-outline"   label="Division"      value={`${divisionName}  •  ${divisionLevel}`} />
          <View style={s.divider} />
          <Row icon="calendar-outline" label="Date"          value={date} />
          <View style={s.divider} />
          <Row icon="location-outline" label="Venue"         value={location} />
          <View style={s.divider} />
          <Row icon="cash-outline"     label="Deposit Paid"  value={fmt(holdCents)} />
          <View style={s.divider} />
          <Row
            icon="card-outline"
            label="Balance Due"
            value={balanceCents > 0 ? fmt(balanceCents) : 'Paid in Full'}
            last={partnerStatus !== 'selected' && partnerStatus !== 'choose_later'}
          />
          {partnerStatus === 'selected' && !!partnerName && (
            <>
              <View style={s.divider} />
              <Row icon="person-outline" label="Partner" value={partnerName} last />
            </>
          )}
          {partnerStatus === 'choose_later' && (
            <>
              <View style={s.divider} />
              <Row icon="time-outline" label="Partner" value="Choose Later" last />
            </>
          )}
        </View>

        {/* ── Balance reminder ── */}
        {balanceCents > 0 && (
          <View style={s.reminder}>
            <Ionicons name="time-outline" size={16} color={L.gold} style={{ flexShrink: 0, marginTop: 1 }} />
            <Text style={s.reminderText}>
              Your {fmt(balanceCents)} balance is due before the registration deadline. We'll send a reminder.
            </Text>
          </View>
        )}

        {/* ── CTAs ── */}
        <PrimaryButton
          label="View My Tournaments"
          onPress={() => router.replace('/my-tournaments' as never)}
          style={{ marginBottom: 12 }}
        />
        <SecondaryButton
          label="Back to Tournament"
          onPress={() => router.replace(`/tournament/${p.id}` as never)}
          style={{ marginBottom: 12 }}
        />
        <SecondaryButton
          label="Browse More Tournaments"
          onPress={() => router.replace('/(tabs)/tournaments' as never)}
        />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: L.bg },
  scroll: { paddingHorizontal: 24, paddingTop: 40, alignItems: 'stretch' },

  hero: { alignItems: 'center', marginBottom: 32 },
  iconCircle: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: L.goldBg,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
    shadowColor: L.gold, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22, shadowRadius: 16, elevation: 8,
  },
  title: {
    color: L.navy, fontSize: 30, fontWeight: '900', letterSpacing: 0.2,
    marginBottom: 10, textAlign: 'center', lineHeight: 36,
  },
  subtitle:     { color: L.textSub, fontSize: 16, textAlign: 'center', lineHeight: 24, marginBottom: 14 },
  subtitleBold: { color: L.navy, fontWeight: '800' },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: L.successBg, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 6,
  },
  statusText: { color: L.success, fontSize: 14, fontWeight: '800' },

  card: {
    borderWidth: 1, borderColor: L.border, borderRadius: radius.card,
    backgroundColor: L.bg, marginBottom: 16, overflow: 'hidden',
  },
  cardTitle: {
    color: L.navy, fontSize: 16, fontWeight: '800',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: L.border },

  row:      { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 16, paddingVertical: 13 },
  rowLabel: { color: L.textSub, fontSize: 11, fontWeight: '600', marginBottom: 2 },
  rowValue: { color: L.navy,    fontSize: 14, fontWeight: '700' },

  reminder: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: L.goldLight, borderWidth: 1, borderColor: '#E8C97A',
    borderRadius: radius.card, padding: 14, marginBottom: 28,
  },
  reminderText: { color: L.text, fontSize: 13, lineHeight: 19, flex: 1 },
});
