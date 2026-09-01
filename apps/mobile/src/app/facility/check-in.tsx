import React, { useCallback, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { colors, radius, spacing, typography } from '@/theme';
import { goBack } from '@/lib/navigation';
import { haptics } from '@/lib/haptics';
import { isOnlineNow } from '@/lib/network';
import { QRScanner, type QRScannerHandle } from '@/components';
import { checkInReservation, type CheckInResult } from '@/lib/supabase/reservationCheckIn';

// Facility Marketplace Phase 5 — the front desk checks a player in.
//
// Same shape as the coach redeem screen, and deliberately not the same
// meaning: this records ATTENDANCE. Payout eligibility is the slot elapsing
// (v_facility_payable_reservations), so a no-show still pays the facility and
// no venue can withhold its own revenue by declining to scan.
//
// The screen decides nothing. check_in_reservation() owns the staff check, the
// confirmed-status check and the timing window — a client that decided any of
// those is a client that can be lied to.

type Mode = 'scan' | 'manual';

// Same alphabet the code generator uses: no I, L, O, 0 or 1.
const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

export default function FacilityCheckInScreen() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('scan');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheckInResult | null>(null);
  const scannerRef = useRef<QRScannerHandle>(null);

  const submit = useCallback(async (value: string, method: 'qr' | 'manual') => {
    if (busy) return;
    setBusy(true);
    try {
      if (!(await isOnlineNow())) {
        haptics.warning();
        Alert.alert('Offline', 'Check-in needs a connection. Try again in a moment.', [
          { text: 'OK', onPress: () => scannerRef.current?.resume() },
        ]);
        return;
      }

      const res = await checkInReservation(value, method);
      if (!res.ok) {
        haptics.error();
        Alert.alert('Not checked in', res.message, [
          { text: 'OK', onPress: () => scannerRef.current?.resume() },
        ]);
        return;
      }

      haptics.success();
      setResult(res.result);
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const onScanned = useCallback((raw: string) => {
    // A booking code is plain text, not a URL, so there is no scan-token shape
    // to classify. Checked locally against the known alphabet so an unrelated
    // QR is rejected here rather than sent to the server to be looked up.
    const candidate = raw.trim().toUpperCase();
    if (!CODE_RE.test(candidate)) {
      haptics.warning();
      Alert.alert(
        'Not a booking code',
        'Ask the player to open their booking in the app and show the check-in code.',
        [{ text: 'OK', onPress: () => scannerRef.current?.resume() }],
      );
      return;
    }
    void submit(candidate, 'qr');
  }, [submit]);

  // ── Checked in ────────────────────────────────────────────────────────────
  if (result) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <View style={s.successWrap}>
          <View style={s.successIcon}>
            <Ionicons name="checkmark" size={44} color={colors.white} />
          </View>
          <Text style={s.successTitle}>
            {result.alreadyCheckedIn ? 'Already checked in' : 'Checked in'}
          </Text>
          <Text style={s.successPlayer}>{result.playerName ?? 'Player'}</Text>
          <Text style={s.successAsset}>{result.assetName ?? 'Court'}</Text>
          {result.alreadyCheckedIn && (
            <Text style={s.successNote}>
              This booking was already checked in. Nothing has changed.
            </Text>
          )}

          <TouchableOpacity
            style={s.againBtn}
            activeOpacity={0.85}
            onPress={() => { setResult(null); setCode(''); scannerRef.current?.resume(); }}
          >
            <Text style={s.againBtnText}>Check in another</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.doneBtn} onPress={() => goBack('/facility/manage')} activeOpacity={0.75}>
            <Text style={s.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <StatusBar style={mode === 'scan' ? 'light' : 'dark'} />

      {mode === 'scan' ? (
        <QRScanner
          ref={scannerRef}
          onScanned={onScanned}
          onClose={() => goBack('/facility/manage')}
          instruction="Scan the player's check-in code"
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingTop: insets.top + spacing.xxl, gap: spacing.lg }}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity style={s.back} onPress={() => goBack('/facility/manage')} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={24} color={colors.navy} />
          </TouchableOpacity>

          <Text style={s.manualTitle}>Enter the code</Text>
          <Text style={s.manualBody}>
            Six characters, from the player&rsquo;s booking screen.
          </Text>

          <TextInput
            style={s.codeInput}
            value={code}
            onChangeText={t => setCode(t.toUpperCase())}
            placeholder="ABC234"
            placeholderTextColor={colors.textSub}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
            editable={!busy}
          />

          <TouchableOpacity
            style={[s.submitBtn, (busy || code.length !== 6) && s.submitDisabled]}
            disabled={busy || code.length !== 6}
            activeOpacity={0.85}
            onPress={() => submit(code, 'manual')}
          >
            {busy
              ? <ActivityIndicator size="small" color={colors.white} />
              : <Text style={s.submitText}>Check In</Text>}
          </TouchableOpacity>
        </ScrollView>
      )}

      <View style={[s.modeBar, { paddingBottom: insets.bottom + spacing.md }]}>
        <TouchableOpacity
          style={[s.modeBtn, mode === 'scan' && s.modeBtnOn]}
          onPress={() => setMode('scan')}
          activeOpacity={0.85}
        >
          <Ionicons name="qr-code-outline" size={18} color={mode === 'scan' ? colors.navy : colors.textSub} />
          <Text style={[s.modeText, mode === 'scan' && s.modeTextOn]}>Scan</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.modeBtn, mode === 'manual' && s.modeBtnOn]}
          onPress={() => setMode('manual')}
          activeOpacity={0.85}
        >
          <Ionicons name="keypad-outline" size={18} color={mode === 'manual' ? colors.navy : colors.textSub} />
          <Text style={[s.modeText, mode === 'manual' && s.modeTextOn]}>Enter code</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.page },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },

  manualTitle: { color: colors.navy, fontSize: 22, fontWeight: '900' },
  manualBody:  { color: colors.textSub, ...typography.body, lineHeight: 21 },
  codeInput: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.card,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.bg,
    color: colors.navy, fontSize: 30, fontWeight: '900', letterSpacing: 6, textAlign: 'center',
  },
  submitBtn: {
    backgroundColor: colors.navy, borderRadius: 30, paddingVertical: 15,
    alignItems: 'center', justifyContent: 'center', minHeight: 52,
  },
  submitDisabled: { opacity: 0.4 },
  submitText: { color: colors.white, fontSize: 16, fontWeight: '800' },

  modeBar: {
    flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md,
    backgroundColor: colors.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  modeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, paddingVertical: spacing.md, borderRadius: radius.button,
    borderWidth: 1.5, borderColor: colors.border,
  },
  modeBtnOn:  { borderColor: colors.gold, backgroundColor: colors.goldBg },
  modeText:   { color: colors.textSub, fontSize: 14, fontWeight: '700' },
  modeTextOn: { color: colors.navy, fontWeight: '800' },

  successWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  successIcon: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: colors.success,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm,
  },
  successTitle:  { color: colors.navy, fontSize: 24, fontWeight: '900' },
  successPlayer: { color: colors.navy, ...typography.sectionTitle },
  successAsset:  { color: colors.textSub, ...typography.body },
  successNote:   { color: colors.textSub, ...typography.metadata, textAlign: 'center' },
  againBtn: {
    marginTop: spacing.xl, backgroundColor: colors.navy, borderRadius: 30,
    paddingVertical: 15, paddingHorizontal: spacing.xxxl, minHeight: 52, justifyContent: 'center',
  },
  againBtnText: { color: colors.white, fontSize: 16, fontWeight: '800' },
  doneBtn: { marginTop: spacing.sm, paddingVertical: spacing.md, paddingHorizontal: spacing.xxl },
  doneBtnText: { color: colors.textSub, fontSize: 15, fontWeight: '700' },
});
