import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';
import type { QRScannerHandle, QRScannerProps } from './QRScanner.types';

// expo-camera's live scanning surface targets native (Phase 5 is an iOS
// scanner foundation) -- this stub keeps the web bundle build-safe without
// importing expo-camera on web at all, mirroring the ExploreMap.web.tsx
// pattern used for react-native-maps.
export const QRScanner = React.forwardRef<QRScannerHandle, QRScannerProps>(function QRScanner(
  { onClose },
  _ref,
) {
  return (
    <View style={s.root}>
      <Ionicons name="qr-code-outline" size={40} color="rgba(255,255,255,0.7)" />
      <Text style={s.text}>QR scanning isn&apos;t available in the web preview.</Text>
      <TouchableOpacity
        style={s.closeBtn}
        activeOpacity={0.85}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
      >
        <Text style={s.closeBtnText}>Close</Text>
      </TouchableOpacity>
    </View>
  );
});

const s = StyleSheet.create({
  root: {
    flex: 1, backgroundColor: colors.navy,
    alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32,
  },
  text: { color: 'rgba(255,255,255,0.7)', fontSize: 14, textAlign: 'center' },
  closeBtn: { backgroundColor: colors.gold, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 28 },
  closeBtnText: { color: colors.navy, fontSize: 14, fontWeight: '800' },
});
