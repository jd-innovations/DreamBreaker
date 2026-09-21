import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/navigation';
import { ProgressiveImageViewer } from '@/components/media/ProgressiveImageViewer';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { text } from '@shared/tokens';

/**
 * Full-screen photo viewer. Any screen with an image that deserves to be seen
 * whole routes here rather than growing its own lightbox.
 *
 * ── Why a route and not a <Modal> ───────────────────────────────────────────
 *
 * ProgressiveImageViewer's zoom and pan are react-native-gesture-handler
 * gestures, and RN's <Modal> renders its children in a SEPARATE native view
 * hierarchy. Gestures inside one are dead unless that subtree gets its own
 * GestureHandlerRootView, and this app mounts exactly one, at the root
 * (src/app/_layout.tsx). A route stays inside that tree, so the gestures work
 * with no special casing — and it matches how marketplace/[id].tsx already
 * consumes the same component.
 *
 * Registered in _layout.tsx as a fullScreenModal with a fade, mirroring
 * story/[category].
 *
 * ── Params ──────────────────────────────────────────────────────────────────
 *
 * urls   JSON array of image URLs, or a single bare URL for the common case.
 * index  Which one to open on. Out-of-range values clamp rather than throw:
 *        a caller whose list changed between render and tap should show the
 *        first photo, not a blank frame.
 * title  Optional caption shown bottom-centre (e.g. "3 of 12").
 */
export default function PhotoViewerScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ urls?: string; index?: string; title?: string }>();

  const photos = useMemo(() => {
    const raw = params.urls;
    if (!raw) return [];
    // A bare URL is not JSON. Accepting both keeps the common single-image
    // call site free of JSON.stringify ceremony.
    if (!raw.startsWith('[')) return [raw];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((u): u is string => typeof u === 'string' && !!u) : [];
    } catch {
      return [];
    }
  }, [params.urls]);

  const initialIndex = useMemo(() => {
    const n = Number.parseInt(params.index ?? '0', 10);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(photos.length - 1, n));
  }, [params.index, photos.length]);

  const [index, setIndex] = useState(initialIndex);

  if (photos.length === 0) {
    return (
      <View style={[s.root, s.empty]}>
        <StatusBar style="light" />
        <Ionicons name="image-outline" size={44} color="rgba(255,255,255,0.5)" />
        <Text style={s.emptyText}>This photo is no longer available.</Text>
        <TouchableOpacity style={s.emptyBtn} onPress={() => goBack()} activeOpacity={0.8}>
          <Text style={s.emptyBtnLabel}>CLOSE</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <StatusBar style="light" />
      <ProgressiveImageViewer
        photos={photos}
        index={index}
        onIndexChange={setIndex}
        topInset={insets.top}
      >
        <TouchableOpacity
          style={[s.closeBtn, { top: insets.top + 12 }]}
          onPress={() => goBack()}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Close photo"
        >
          <Ionicons name="close" size={20} color="#FFFFFF" />
        </TouchableOpacity>

        {/* Only worth showing when advancing is possible. With one photo the
            viewer's tap-to-advance is a no-op and a "1 of 1" counter is noise. */}
        {photos.length > 1 && (
          <View style={[s.counter, { bottom: insets.bottom + 20 }]} pointerEvents="none">
            <Text style={s.counterLabel}>{index + 1} of {photos.length}</Text>
          </View>
        )}

        {!!params.title && (
          <View style={[s.caption, { bottom: insets.bottom + (photos.length > 1 ? 58 : 20) }]} pointerEvents="none">
            <Text style={s.captionLabel} numberOfLines={2}>{params.title}</Text>
          </View>
        )}
      </ProgressiveImageViewer>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },

  closeBtn: {
    position: 'absolute', left: 16,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },

  counter: {
    position: 'absolute', alignSelf: 'center',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  counterLabel: {
    color: '#FFFFFF', fontSize: text.caption.size, fontWeight: '700',
    letterSpacing: 0.6,
  },

  caption: {
    position: 'absolute', alignSelf: 'center',
    maxWidth: '86%',
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  captionLabel: {
    color: '#FFFFFF', fontSize: text.caption.size, fontWeight: '600',
    textAlign: 'center', lineHeight: 18,
  },

  empty: { alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 40 },
  emptyText: {
    color: 'rgba(255,255,255,0.7)', fontSize: text.body.size, fontWeight: '500',
    textAlign: 'center',
  },
  emptyBtn: {
    marginTop: 6, paddingHorizontal: 22, height: 40, borderRadius: 999,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
  emptyBtnLabel: { color: '#FFFFFF', fontSize: text.caption.size, fontWeight: '800', letterSpacing: 1 },
});
