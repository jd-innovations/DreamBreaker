import React, { useCallback, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { colors, radius } from '@/theme';
import { goBack } from '@/lib/navigation';
import { haptics } from '@/lib/haptics';
import { isOnlineNow } from '@/lib/network';
import { classifyQrPayload } from '@/lib/qrPayload';
import { QRScanner, type QRScannerHandle } from '@/components';
import { useSupportContext } from '@/lib/support/supportContext';
import {
  redeemVoucher, redemptionErrorMessage, type RedemptionSuccess,
} from '@/lib/coach/voucherRedemption';

// Coach Marketplace Phase 5 — the coach consumes a voucher.
//
// Reuses the existing scanner and the qrPayload classifier rather than adding a
// second camera pipeline. Voucher redemption is the first real consumer of the
// `/q/<token>` scan-token shape qrPayload.ts reserved and documented as having
// no domain that resolves it yet.
//
// The screen decides nothing. It sends a code and renders what
// redeem_coach_voucher() says — that RPC owns ownership, expiry, revocation,
// remaining balance and the row lock. A client that decided any of those would
// be a client that could be lied to.

const L = {
  navy: colors.navy, gold: colors.gold, text: colors.text, textSub: colors.textSub,
  border: colors.border, bg: colors.bg, page: colors.page,
  success: colors.success, successBg: colors.successBg, white: '#FFFFFF',
};

type Mode = 'scan' | 'manual';

export default function CoachRedeemScreen() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('scan');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<RedemptionSuccess | null>(null);
  const scannerRef = useRef<QRScannerHandle>(null);

  useSupportContext({ feature: 'coach_redeem' });

  const submit = useCallback(async (value: string, method: 'qr' | 'manual') => {
    if (busy) return;
    setBusy(true);
    try {
      if (!(await isOnlineNow())) {
        haptics.warning();
        Alert.alert('Offline', redemptionErrorMessage('offline'));
        scannerRef.current?.resume();
        return;
      }

      const res = await redeemVoucher(value, method);
      if (!res.ok) {
        haptics.error();
        Alert.alert('Not redeemed', redemptionErrorMessage(res.code), [
          { text: 'OK', onPress: () => scannerRef.current?.resume() },
        ]);
        return;
      }

      haptics.success();
      setSuccess(res.result);
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const onScanned = useCallback((raw: string) => {
    const classified = classifyQrPayload(raw);
    if (classified.kind !== 'scan_token') {
      haptics.warning();
      Alert.alert(
        'Not a voucher',
        "That code isn't a Pickleball App voucher. Ask the player to open the voucher in their Wallet.",
        [{ text: 'OK', onPress: () => scannerRef.current?.resume() }],
      );
      return;
    }
    void submit(classified.token, 'qr');
  }, [submit]);

  // ── Success ───────────────────────────────────────────────────────────────
  if (success) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <View style={s.successWrap}>
          <View style={s.successIcon}>
            <Ionicons name="checkmark" size={44} color={L.white} />
          </View>
          <Text style={s.successTitle}>Redeemed</Text>
          <Text style={s.successOffer}>{success.offerTitle}</Text>
          <Text style={s.successBuyer}>{success.buyerName}</Text>

          {success.totalRedemptions > 1 && (
            <Text style={s.successRemaining}>
              {success.remainingAfter} of {success.totalRedemptions} sessions remaining
            </Text>
          )}
          {success.fullyRedeemed && success.totalRedemptions > 1 && (
            <Text style={s.successNote}>This package is now fully used.</Text>
          )}

          <TouchableOpacity
            style={s.againBtn}
            activeOpacity={0.85}
            onPress={() => { setSuccess(null); setCode(''); scannerRef.current?.resume(); }}
          >
            <Text style={s.againBtnText}>Redeem another</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.doneBtn} onPress={() => goBack('/coach')} activeOpacity={0.75}>
            <Text style={s.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Scan ──────────────────────────────────────────────────────────────────
  if (mode === 'scan') {
    return (
      <View style={s.root}>
        <StatusBar style="light" />
        <QRScanner
          ref={scannerRef}
          onScanned={onScanned}
          onClose={() => goBack('/coach')}
          instruction="Scan the player's voucher QR code"
        />
        <TouchableOpacity
          style={[s.switchBtn, { bottom: insets.bottom + 28 }]}
          activeOpacity={0.85}
          onPress={() => setMode('manual')}
        >
          <Ionicons name="keypad-outline" size={16} color={L.navy} />
          <Text style={s.switchBtnText}>Enter code instead</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Manual ────────────────────────────────────────────────────────────────
  return (
    <View style={s.root}>
      <StatusBar style="dark" />
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={s.back} onPress={() => setMode('scan')} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={L.navy} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Enter Code</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
        <Text style={s.manualHint}>
          Ask the player to open the voucher in their Wallet and read you the 8-character code.
        </Text>

        <TextInput
          style={s.codeInput}
          value={code}
          // Upper-cased on the way in so the field matches the code as printed.
          // The server compares case-insensitively regardless, so this is a
          // display nicety, not the guard.
          onChangeText={t => setCode(t.toUpperCase().replace(/\s/g, ''))}
          placeholder="ABCD2345"
          placeholderTextColor={L.border}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={8}
          editable={!busy}
          returnKeyType="done"
          onSubmitEditing={() => code.length === 8 && submit(code, 'manual')}
        />

        <TouchableOpacity
          style={[s.redeemBtn, (code.length !== 8 || busy) && s.redeemBtnDisabled]}
          disabled={code.length !== 8 || busy}
          activeOpacity={0.85}
          onPress={() => submit(code, 'manual')}
        >
          {busy
            ? <ActivityIndicator size="small" color={L.white} />
            : <Text style={s.redeemBtnText}>Redeem</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={s.linkBtn} onPress={() => setMode('scan')} activeOpacity={0.75}>
          <Ionicons name="qr-code-outline" size={16} color={L.gold} />
          <Text style={s.linkBtnText}>Scan a QR code instead</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, backgroundColor: L.bg,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: L.navy, fontSize: 17, fontWeight: '800' },

  switchBtn: {
    position: 'absolute', alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: L.white, borderRadius: 30,
    paddingHorizontal: 20, paddingVertical: 12,
  },
  switchBtnText: { color: L.navy, fontSize: 14, fontWeight: '800' },

  manualHint: { color: L.textSub, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  codeInput: {
    borderWidth: 1.5, borderColor: L.border, borderRadius: radius.card,
    paddingVertical: 18, textAlign: 'center', backgroundColor: L.bg,
    color: L.navy, fontSize: 28, fontWeight: '900', letterSpacing: 6,
  },
  redeemBtn: {
    backgroundColor: L.navy, borderRadius: 30, paddingVertical: 15,
    alignItems: 'center', justifyContent: 'center', minHeight: 52,
  },
  redeemBtnDisabled: { opacity: 0.4 },
  redeemBtnText: { color: L.white, fontSize: 16, fontWeight: '800' },
  linkBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 },
  linkBtnText: { color: L.gold, fontSize: 14, fontWeight: '800' },

  successWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 32 },
  successIcon: {
    width: 84, height: 84, borderRadius: 42, backgroundColor: L.success,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  successTitle:     { color: L.navy, fontSize: 26, fontWeight: '900' },
  successOffer:     { color: L.text, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  successBuyer:     { color: L.textSub, fontSize: 14, fontWeight: '600' },
  successRemaining: { color: L.navy, fontSize: 14, fontWeight: '800', marginTop: 6 },
  successNote:      { color: L.textSub, fontSize: 12 },
  againBtn: {
    marginTop: 26, backgroundColor: L.navy, borderRadius: 30,
    paddingHorizontal: 30, paddingVertical: 14,
  },
  againBtnText: { color: L.white, fontSize: 15, fontWeight: '800' },
  doneBtn: { paddingVertical: 12 },
  doneBtnText: { color: L.textSub, fontSize: 14, fontWeight: '700' },
});
