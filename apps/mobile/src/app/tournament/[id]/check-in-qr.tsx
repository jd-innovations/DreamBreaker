import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import QRCode from 'react-native-qrcode-svg';
import { colors, radius } from '@/theme';
import { goBack } from '@/lib/navigation';
import { buildScanTokenUrl } from '@/lib/qrPayload';
import { fetchRegistrationById } from '@/lib/supabase/registrations';
import type { TournamentRegistration } from '@/lib/registrationStore';

const L = {
  bg:        colors.bg,
  page:      colors.page,
  navy:      colors.navy,
  gold:      colors.gold,
  goldLight: colors.goldLight,
  text:      colors.text,
  textSub:   colors.textSub,
  border:    colors.border,
  success:   colors.success,
  successBg: colors.successBg,
};

// The QR displays only the registration's own already-opaque, non-sequential
// id (see check_in_registration() migration's header comment for why no
// separate token was needed). A screenshot of this code does not create an
// authorization vulnerability: it identifies the registration only -- the
// scanning director must be authenticated/authorized for this exact
// tournament, and the server independently re-checks current registration
// status and rejects an already-used code. See
// TOURNAMENT_QR_CHECKIN_PHASE5_1.md "Player QR Refresh / Screenshot
// Behavior" for the full security assumption. No rotating/expiring code is
// implemented here.

export default function CheckInQrScreen() {
  const insets = useSafeAreaInsets();
  const { registrationId } = useLocalSearchParams<{ id: string; registrationId: string }>();

  const [reg, setReg]         = useState<TournamentRegistration | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!registrationId) return;
    setLoading(true);
    const row = await fetchRegistrationById(registrationId);
    setReg(row);
    setLoading(false);
  }, [registrationId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { load(); }, [load]);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={L.navy} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Check-In QR</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={L.gold} />
        </View>
      ) : !reg ? (
        <View style={s.centered}>
          <Ionicons name="alert-circle-outline" size={36} color={L.textSub} />
          <Text style={s.emptyText}>This registration isn&apos;t available.</Text>
        </View>
      ) : (
        <View style={s.content}>
          <View style={s.card}>
            <Text style={s.tournamentName} numberOfLines={2}>{reg.tournamentName}</Text>
            <Text style={s.divisionLine}>{reg.divisionName}  •  {reg.divisionLevel}</Text>

            {reg.status === 'checked_in' && (
              <View style={s.checkedInPill}>
                <Ionicons name="checkmark-circle" size={14} color={L.success} />
                <Text style={s.checkedInText}>Already Checked In</Text>
              </View>
            )}

            <View style={s.qrFrame}>
              <QRCode value={buildScanTokenUrl(reg.id)} size={220} color={L.navy} backgroundColor="#FFFFFF" />
            </View>

            <Text style={s.playerName}>{reg.playerName}</Text>
            <Text style={s.instruction}>Show this QR code to the tournament director at check-in.</Text>
          </View>
        </View>
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

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 32 },
  emptyText: { color: L.textSub, fontSize: 14, textAlign: 'center' },

  content: { flex: 1, padding: 20, justifyContent: 'center' },
  card: {
    backgroundColor: L.bg, borderRadius: radius.card,
    borderWidth: 1, borderColor: L.border,
    paddingVertical: 28, paddingHorizontal: 24,
    alignItems: 'center', gap: 6,
  },
  tournamentName: { color: L.navy, fontSize: 19, fontWeight: '800', textAlign: 'center' },
  divisionLine:   { color: L.textSub, fontSize: 13, fontWeight: '500', marginBottom: 8 },

  checkedInPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: L.successBg, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5, marginBottom: 8,
  },
  checkedInText: { color: L.success, fontSize: 12, fontWeight: '700' },

  qrFrame: {
    padding: 16, backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: L.border, borderRadius: 16,
    marginVertical: 12,
  },

  playerName:  { color: L.navy, fontSize: 15, fontWeight: '700', marginTop: 4 },
  instruction: { color: L.textSub, fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 19 },
});
