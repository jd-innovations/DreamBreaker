import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams } from 'expo-router';
import { colors } from '@/theme';
import { goBack } from '@/lib/navigation';
import { haptics } from '@/lib/haptics';
import { classifyQrPayload } from '@/lib/qrPayload';
import { checkInRegistration, type CheckInResult } from '@/lib/supabase/registrations';
import { QRScanner, type QRScannerHandle } from '@/components';

// Director-facing tournament check-in scanner (Phase 5.1). Reuses the
// generic Phase 5 QRScanner and qrPayload classifier as-is -- this screen
// only adds tournament-check-in-specific interpretation of a `scan_token`
// classification. Any other classification (dev_test, app_link,
// unsupported) is treated as an invalid QR *for this operation* and never
// triggers navigation or a server call -- a check-in scanner stays scoped
// to check-in (Step 8).
//
// The QR is never trusted as authorization. checkInRegistration() is the
// single server-authoritative mutation (also used by the manual "Check In"
// button in check-in.tsx) -- this screen only decodes a credential and
// reports whatever the server says.

type ScanOutcome = CheckInResult | { result: 'invalid_qr' | 'network_error' };

type ScreenState =
  | { kind: 'scanning' }
  | { kind: 'checking' }
  | { kind: 'result'; outcome: ScanOutcome };

function resultCopy(outcome: ScanOutcome): {
  icon: keyof typeof Ionicons.glyphMap; tone: 'success' | 'warning' | 'error'; title: string; body: string;
} {
  switch (outcome.result) {
    case 'success': {
      const o = outcome as CheckInResult;
      return {
        icon: 'checkmark-circle', tone: 'success', title: 'Player Checked In',
        body: [o.playerName, o.divisionName].filter(Boolean).join('  •  ') || 'Check-in confirmed.',
      };
    }
    case 'already_checked_in': {
      const o = outcome as CheckInResult;
      const when = o.checkedInAt ? new Date(o.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;
      return {
        icon: 'information-circle', tone: 'warning', title: 'Already Checked In',
        body: [o.playerName, when ? `at ${when}` : null].filter(Boolean).join('  •  ') || 'This player is already checked in.',
      };
    }
    case 'wrong_tournament':
      return { icon: 'alert-circle', tone: 'error', title: 'Wrong Tournament', body: 'This registration belongs to a different tournament.' };
    case 'unauthorized':
      return { icon: 'lock-closed', tone: 'error', title: 'Not Authorized', body: "You're not authorized to check players into this tournament." };
    case 'ineligible': {
      const o = outcome as CheckInResult;
      return { icon: 'alert-circle', tone: 'error', title: 'Not Eligible', body: `This registration isn't eligible for check-in${o.reason ? ` (status: ${o.reason})` : ''}.` };
    }
    case 'not_found':
      return { icon: 'alert-circle', tone: 'error', title: 'Registration Not Found', body: 'This QR code doesn’t match a known registration.' };
    case 'network_error':
      return { icon: 'cloud-offline', tone: 'error', title: 'Network Error', body: 'Could not reach the server. Check your connection and try again.' };
    case 'invalid_qr':
    default:
      return { icon: 'alert-circle', tone: 'error', title: 'Unsupported QR', body: "This isn't a tournament check-in code." };
  }
}

export default function CheckInScanScreen() {
  const { id: tournamentId } = useLocalSearchParams<{ id: string }>();
  const scannerRef = useRef<QRScannerHandle>(null);
  const [state, setState] = useState<ScreenState>({ kind: 'scanning' });

  const handleScanned = useCallback(async (raw: string) => {
    const classification = classifyQrPayload(raw);

    if (classification.kind !== 'scan_token') {
      haptics.error();
      setState({ kind: 'result', outcome: { result: 'invalid_qr' } });
      return;
    }

    setState({ kind: 'checking' });
    try {
      const outcome = await checkInRegistration(classification.token, tournamentId);
      if (outcome.result === 'success') haptics.success();
      else if (outcome.result === 'already_checked_in') haptics.warning();
      else haptics.error();
      setState({ kind: 'result', outcome });
    } catch {
      haptics.error();
      setState({ kind: 'result', outcome: { result: 'network_error' } });
    }
  }, [tournamentId]);

  const handleScanNext = useCallback(() => {
    setState({ kind: 'scanning' });
    scannerRef.current?.resume();
  }, []);

  return (
    <View style={s.root}>
      <StatusBar style="light" />

      {state.kind === 'scanning' || state.kind === 'checking' ? (
        <>
          <QRScanner
            ref={scannerRef}
            onScanned={handleScanned}
            onClose={() => goBack()}
            instruction="Position the player's check-in QR inside the frame"
          />
          {state.kind === 'checking' && (
            <View style={s.checkingOverlay} pointerEvents="none">
              <Text style={s.checkingText}>Checking in…</Text>
            </View>
          )}
        </>
      ) : (
        <ResultView
          outcome={state.outcome}
          onScanNext={handleScanNext}
          onClose={() => goBack()}
        />
      )}
    </View>
  );
}

function ResultView({
  outcome, onScanNext, onClose,
}: {
  outcome: ScanOutcome;
  onScanNext: () => void;
  onClose: () => void;
}) {
  const { icon, tone, title, body } = resultCopy(outcome);
  const toneColor = tone === 'success' ? colors.success : tone === 'error' ? colors.danger : colors.gold;

  return (
    <View style={[s.root, s.centered]}>
      <View style={[s.resultIcon, { backgroundColor: `${toneColor}22` }]}>
        <Ionicons name={icon} size={40} color={toneColor} />
      </View>
      <Text style={s.resultTitle}>{title}</Text>
      <Text style={s.resultBody}>{body}</Text>

      <TouchableOpacity
        style={s.primaryBtn}
        activeOpacity={0.85}
        onPress={onScanNext}
        accessibilityRole="button"
        accessibilityLabel="Scan Next Player"
      >
        <Text style={s.primaryBtnText}>Scan Next Player</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={s.secondaryBtn}
        activeOpacity={0.7}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
      >
        <Text style={s.secondaryBtnText}>Done</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.navy },
  centered: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },

  checkingOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0,
    alignItems: 'center', paddingTop: 120,
  },
  checkingText: {
    color: '#FFFFFF', fontSize: 14, fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 8, overflow: 'hidden',
  },

  resultIcon: {
    width: 84, height: 84, borderRadius: 42,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  resultTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginBottom: 10, textAlign: 'center' },
  resultBody: { color: 'rgba(255,255,255,0.75)', fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: 28 },

  primaryBtn: {
    backgroundColor: colors.gold, borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 32, marginBottom: 12, minWidth: 220, alignItems: 'center',
  },
  primaryBtnText: { color: colors.navy, fontSize: 15, fontWeight: '800' },
  secondaryBtn: { paddingVertical: 8, paddingHorizontal: 16 },
  secondaryBtnText: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '600' },
});
