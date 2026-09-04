import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { colors } from '@/theme';
import { goBack } from '@/lib/navigation';
import { haptics } from '@/lib/haptics';
import { classifyQrPayload, type QrClassification } from '@/lib/qrPayload';
import { QRScanner, type QRScannerHandle } from '@/components';

// Phase 5 scanner-foundation proof screen (QR_CAMERA_PHASE5.md Step 11).
// Proves permission -> camera -> QR decode -> classify -> success/error UI
// on a physical device without any business mutation. Not linked from
// product navigation; reached directly for manual testing, same as
// design-lab.

type ResultState =
  | { kind: 'scanning' }
  | { kind: 'result'; classification: QrClassification; raw: string };

function resultCopy(classification: QrClassification): { icon: keyof typeof Ionicons.glyphMap; tone: 'success' | 'info' | 'error'; title: string; body: string } {
  switch (classification.kind) {
    case 'dev_test':
      return { icon: 'checkmark-circle', tone: 'success', title: 'QR Recognized', body: 'Development test payload decoded successfully. Scanner pipeline is working end-to-end.' };
    case 'app_link':
      return { icon: 'checkmark-circle', tone: 'success', title: 'QR Recognized', body: `Matches a supported pickleballapp link (${classification.destination.type}). No navigation performed from this test screen.` };
    case 'scan_token':
      return { icon: 'information-circle', tone: 'info', title: 'Recognized Format', body: 'This is a valid pickleballapp scan-token shape, but no redemption/check-in backend is wired up yet in Phase 5.' };
    case 'unsupported':
      return { icon: 'alert-circle', tone: 'error', title: 'Unsupported QR', body: "This code isn't a recognized pickleballapp QR. No action was taken." };
  }
}

export default function DevQrScanScreen() {
  const scannerRef = useRef<QRScannerHandle>(null);
  const [state, setState] = useState<ResultState>({ kind: 'scanning' });

  const handleScanned = useCallback((raw: string) => {
    const classification = classifyQrPayload(raw);
    if (classification.kind === 'unsupported') {
      haptics.error();
    } else {
      haptics.success();
    }
    setState({ kind: 'result', classification, raw });
  }, []);

  const handleScanAgain = useCallback(() => {
    setState({ kind: 'scanning' });
    scannerRef.current?.resume();
  }, []);

  return (
    <View style={s.root}>
      <StatusBar style="light" />

      {state.kind === 'scanning' ? (
        <QRScanner ref={scannerRef} onScanned={handleScanned} onClose={() => goBack()} />
      ) : (
        <ResultView
          classification={state.classification}
          raw={state.raw}
          onScanAgain={handleScanAgain}
          onClose={() => goBack()}
        />
      )}
    </View>
  );
}

function ResultView({
  classification, raw, onScanAgain, onClose,
}: {
  classification: QrClassification;
  raw: string;
  onScanAgain: () => void;
  onClose: () => void;
}) {
  const { icon, tone, title, body } = resultCopy(classification);
  const toneColor = tone === 'success' ? colors.success : tone === 'error' ? colors.danger : colors.gold;

  return (
    <View style={[s.root, s.centered]}>
      <View style={[s.resultIcon, { backgroundColor: `${toneColor}22` }]}>
        <Ionicons name={icon} size={40} color={toneColor} />
      </View>
      <Text style={s.resultTitle}>{title}</Text>
      <Text style={s.resultBody}>{body}</Text>
      <Text style={s.rawLabel} numberOfLines={2}>{raw}</Text>

      <TouchableOpacity
        style={s.primaryBtn}
        activeOpacity={0.85}
        onPress={onScanAgain}
        accessibilityRole="button"
        accessibilityLabel="Scan Again"
      >
        <Text style={s.primaryBtnText}>Scan Again</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={s.secondaryBtn}
        activeOpacity={0.7}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
      >
        <Text style={s.secondaryBtnText}>Close</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.navy },
  centered: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },

  resultIcon: {
    width: 84, height: 84, borderRadius: 42,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  resultTitle: { color: colors.white, fontSize: 20, fontWeight: '800', marginBottom: 10, textAlign: 'center' },
  resultBody: { color: 'rgba(255,255,255,0.75)', fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: 16 },
  rawLabel: {
    color: 'rgba(255,255,255,0.45)', fontSize: 12, textAlign: 'center', marginBottom: 28,
    fontFamily: 'monospace',
  },

  primaryBtn: {
    backgroundColor: colors.gold, borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 32, marginBottom: 12, minWidth: 200, alignItems: 'center',
  },
  primaryBtnText: { color: colors.navy, fontSize: 15, fontWeight: '800' },
  secondaryBtn: { paddingVertical: 8, paddingHorizontal: 16 },
  secondaryBtnText: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '600' },
});
