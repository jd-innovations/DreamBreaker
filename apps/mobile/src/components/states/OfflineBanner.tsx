import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/theme';
import { useNetworkStatus } from '@/lib/network';

/**
 * The app-wide "you are offline" strip (TODO1.1 item 5.4).
 *
 * Mounted once at the root so it covers every screen. Renders nothing at all
 * when online — no wrapper, no spacer — so it cannot shift a layout it is not
 * currently saying anything in.
 *
 * ── Why a banner and not a dialog ───────────────────────────────────────────
 *
 * Being offline is a condition, not an event. A modal would demand a dismissal
 * for something the user cannot fix by acknowledging it, and would have to be
 * re-shown every time they tried anything. A strip states the condition, stays
 * out of the way, and disappears by itself when the connection returns.
 *
 * ── What it deliberately does not do ────────────────────────────────────────
 *
 * It does not block interaction. Most of this app reads from a cache that is
 * still perfectly good offline, and covering the screen would take that away
 * for no benefit. The things that genuinely must not run offline — payments and
 * check-in — are guarded at the point of action, where the answer is current at
 * the moment of the tap rather than at the moment of a render.
 */
export function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const { isOnline } = useNetworkStatus();

  if (isOnline) return null;

  return (
    <View style={[s.wrap, { paddingTop: insets.top + 8 }]} accessibilityRole="alert">
      <Ionicons name="cloud-offline-outline" size={16} color="#FFFFFF" />
      <Text style={s.text} accessibilityLabel="You are offline. Some actions are unavailable.">
        You&apos;re offline — some actions are unavailable
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    // Above everything, including modals and the tab bar: a payment sheet that
    // is about to fail is exactly when this needs to be readable.
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: 8,
    paddingHorizontal: 16,
    backgroundColor: colors.danger,
  },
  text: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
});
