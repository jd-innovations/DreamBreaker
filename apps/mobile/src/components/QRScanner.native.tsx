import React, { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';
import type { QRScannerHandle, QRScannerProps } from './QRScanner.types';

const L = {
  navy:    colors.navy,
  gold:    colors.gold,
  white:   colors.white,
  text:    colors.text,
  textSub: colors.textSub,
};

const FRAME_SIZE = 250;

export const QRScanner = forwardRef<QRScannerHandle, QRScannerProps>(function QRScanner(
  { onScanned, onClose, instruction = 'Position the QR code inside the frame' },
  ref,
) {
  const [permission, requestPermission] = useCameraPermissions();
  const [torchOn, setTorchOn] = useState(false);

  // A ref, not state: the barcode callback can fire multiple times per
  // render while the same code stays in frame, and this must block every
  // call after the first synchronously -- a state-based lock re-renders
  // async and can't guarantee that.
  const lockedRef = useRef(false);

  useImperativeHandle(ref, () => ({
    resume() { lockedRef.current = false; },
  }), []);

  const handleBarcodeScanned = useCallback((result: BarcodeScanningResult) => {
    if (lockedRef.current) return;
    if (result.type !== 'qr') return; // defensive -- barcodeScannerSettings already restricts to qr
    lockedRef.current = true;
    onScanned(result.data);
  }, [onScanned]);

  // ── Permission not yet checked ──────────────────────────────────────────
  if (!permission) {
    return (
      <View style={[s.root, s.centered]}>
        <ActivityIndicator size="large" color={L.gold} />
      </View>
    );
  }

  // ── Permission not determined yet: app-owned explanation before the
  // native prompt, per Phase 5 Step 6. ───────────────────────────────────
  if (!permission.granted && permission.status === 'undetermined') {
    return (
      <View style={[s.root, s.centered, s.permissionPad]}>
        <View style={s.permissionIcon}>
          <Ionicons name="qr-code-outline" size={34} color={L.gold} />
        </View>
        <Text style={s.permissionTitle}>Camera Access Needed</Text>
        <Text style={s.permissionBody}>
          Allow Pickleball App to use your camera to scan QR codes for check-in and redemption.
        </Text>
        <TouchableOpacity
          style={s.primaryBtn}
          activeOpacity={0.85}
          onPress={() => requestPermission()}
          accessibilityRole="button"
          accessibilityLabel="Allow Camera"
        >
          <Text style={s.primaryBtnText}>Allow Camera</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.secondaryBtn}
          activeOpacity={0.7}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Text style={s.secondaryBtnText}>Not Now</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Denied: a clear, non-repeating state. iOS never re-prompts natively
  // once denied, so this always offers Settings rather than looping the
  // native dialog (Step 6: "Do not continuously reprompt"). ─────────────
  if (!permission.granted) {
    return (
      <View style={[s.root, s.centered, s.permissionPad]}>
        <View style={s.permissionIcon}>
          <Ionicons name="camera-outline" size={34} color={colors.danger} />
        </View>
        <Text style={s.permissionTitle}>Camera Access Required</Text>
        <Text style={s.permissionBody}>
          QR scanning needs camera access. Enable it in Settings to scan check-in and redemption codes.
        </Text>
        <TouchableOpacity
          style={s.primaryBtn}
          activeOpacity={0.85}
          onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())}
          accessibilityRole="button"
          accessibilityLabel={permission.canAskAgain ? 'Allow Camera' : 'Open Settings'}
        >
          <Text style={s.primaryBtnText}>{permission.canAskAgain ? 'Allow Camera' : 'Open Settings'}</Text>
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

  // ── Granted: camera + scan overlay ──────────────────────────────────────
  return (
    <View style={s.root}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torchOn}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={handleBarcodeScanned}
      />

      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <View style={s.dim} />
        <View style={s.frameRow}>
          <View style={s.dim} />
          <View style={s.frame} />
          <View style={s.dim} />
        </View>
        <View style={[s.dim, s.bottomArea]}>
          <Text style={s.instruction}>{instruction}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={s.closeBtn}
        activeOpacity={0.7}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
      >
        <Ionicons name="close" size={22} color={L.white} />
      </TouchableOpacity>

      <TouchableOpacity
        style={s.torchBtn}
        activeOpacity={0.7}
        onPress={() => setTorchOn(v => !v)}
        accessibilityRole="button"
        accessibilityLabel={torchOn ? 'Turn off flashlight' : 'Turn on flashlight'}
      >
        <Ionicons name={torchOn ? 'flash' : 'flash-outline'} size={20} color={L.white} />
      </TouchableOpacity>
    </View>
  );
});

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.navy },
  centered: { alignItems: 'center', justifyContent: 'center' },

  permissionPad: { paddingHorizontal: 32, gap: 4 },
  permissionIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  permissionTitle: { color: L.white, fontSize: 18, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  permissionBody: { color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: 24 },
  primaryBtn: {
    backgroundColor: L.gold, borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 32, marginBottom: 12, minWidth: 200, alignItems: 'center',
  },
  primaryBtnText: { color: L.navy, fontSize: 15, fontWeight: '800' },
  secondaryBtn: { paddingVertical: 8, paddingHorizontal: 16 },
  secondaryBtnText: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '600' },

  dim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  frameRow: { flexDirection: 'row', height: FRAME_SIZE },
  frame: {
    width: FRAME_SIZE, height: FRAME_SIZE,
    borderWidth: 2, borderColor: L.gold, borderRadius: 20,
    backgroundColor: 'transparent',
  },
  bottomArea: { alignItems: 'center', paddingTop: 24 },
  instruction: { color: L.white, fontSize: 14, fontWeight: '600', textAlign: 'center', paddingHorizontal: 32 },

  closeBtn: {
    position: 'absolute', top: 56, left: 20,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center',
  },
  torchBtn: {
    position: 'absolute', top: 56, right: 20,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center',
  },
});
