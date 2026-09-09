// SPIKE — MARKETPLACE_MAP_AUDIT.md (v3) §5.1. THROWAWAY. Do not merge.
//
// Question this answers: can a price badge be an absolutely-positioned RN View
// projected over MapView, instead of a <Marker> child? Marker children are the
// documented Fabric crash (react-native-maps#5378, fixed 2026-09-07), so the
// three-tier marker hierarchy needs a path that puts NOTHING inside <Marker>.
//
// HOW THIS MEASURES DRIFT INSTEAD OF ASKING YOU TO EYEBALL IT
// -----------------------------------------------------------
// react-native-maps exposes the SDK's own projection: mapRef.pointForCoordinate().
// That is ground truth. The badge is positioned by our pure math
// (lib/spike/mapProjection.ts); the HUD compares it against pointForCoordinate
// and reports the live and worst-seen pixel delta. So "does it drift?" becomes a
// number you read off the screen rather than a judgement call.
//
// The native <Marker pinColor> underneath is the second control: if the gold
// badge and the pin ever visually separate, the projection is wrong regardless
// of what the HUD says.
//
// WHAT THIS CANNOT ANSWER: smoothness. Frame pacing during a pinch is a device
// property. Read MAX delta after gesturing, and watch whether the badge lags
// the pin mid-pinch.

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, LayoutChangeEvent } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, PROVIDER_DEFAULT } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import {
  projectToScreen,
  isWithinViewport,
  type Region,
  type MapPadding,
  type ScreenPoint,
} from '@/lib/spike/mapProjection';

// Same per-platform choice as ExploreMap / VenueMapCard. Not a migration.
const MAP_PROVIDER = Platform.OS === 'ios' ? PROVIDER_DEFAULT : PROVIDER_GOOGLE;
const PROVIDER_LABEL = Platform.OS === 'ios' ? 'Apple MapKit (iOS)' : 'Google Maps (Android)';

// Lakewood Ranch — FALLBACK_LOCATION.
const LISTING = { latitude: 27.4496, longitude: -82.3787 };
const INITIAL_REGION: Region = {
  ...LISTING,
  latitudeDelta: 0.0922,
  longitudeDelta: 0.0421,
};

export default function SpikeMarkerOverlayScreen() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView | null>(null);

  const [region, setRegion] = useState<Region>(INITIAL_REGION);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [selected, setSelected] = useState(false);
  const [tapCount, setTapCount] = useState(0);
  const [sdkPoint, setSdkPoint] = useState<ScreenPoint | null>(null);
  const [maxDelta, setMaxDelta] = useState(0);
  const [regionEvents, setRegionEvents] = useState(0);
  // First run showed x exact and y off by 20-28px -- a one-axis systematic
  // error, and mapPadding is the only asymmetric input (left/right both 16 and
  // cancel; top 16 vs bottom ~144 do not). This toggle settles whether padding
  // is the cause in one run instead of guessing at the model.
  const [padded, setPadded] = useState(true);

  // The real ExploreMap padding, so the projection is exercised against the
  // values Nearby actually uses rather than a convenient zero.
  const padding: MapPadding = useMemo(
    () => (padded
      ? { top: 16, right: 16, bottom: insets.bottom + 110, left: 16 }
      : { top: 0, right: 0, bottom: 0, left: 0 }),
    [insets.bottom, padded],
  );

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setViewport({ width, height });
  }, []);

  // Continuous, so the badge tracks DURING a gesture rather than snapping at
  // the end. This is the expensive path the audit warned about — if it stutters,
  // that is the finding.
  const onRegionChange = useCallback((next: Region) => {
    setRegion(next);
    setRegionEvents((n) => n + 1);
  }, []);

  // Ground truth, sampled only when the camera settles (it is a bridge call).
  const onRegionChangeComplete = useCallback(
    async (next: Region) => {
      setRegion(next);
      try {
        const p = await mapRef.current?.pointForCoordinate(LISTING);
        if (!p) return;
        setSdkPoint(p);
        const mine = projectToScreen(LISTING, next, viewport, padding);
        const d = Math.hypot(mine.x - p.x, mine.y - p.y);
        setMaxDelta((m) => (d > m ? d : m));
      } catch {
        // pointForCoordinate unavailable — HUD just shows no ground truth.
      }
    },
    [viewport, padding],
  );

  const badgePoint = projectToScreen(LISTING, region, viewport, padding);
  const badgeVisible = viewport.width > 0 && isWithinViewport(badgePoint, viewport);
  const liveDelta = sdkPoint ? Math.hypot(badgePoint.x - sdkPoint.x, badgePoint.y - sdkPoint.y) : null;

  const recenter = useCallback(() => {
    mapRef.current?.animateToRegion(INITIAL_REGION, 350);
  }, []);

  return (
    <View style={s.root} onLayout={onLayout}>
      <Stack.Screen options={{ title: 'Marker overlay spike', headerShown: true }} />

      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={MAP_PROVIDER}
        initialRegion={INITIAL_REGION}
        onRegionChange={onRegionChange}
        onRegionChangeComplete={onRegionChangeComplete}
        mapPadding={padding}
        // Gate requirement: pitch and rotation OFF. A rotated or pitched camera
        // is not a 2D Mercator rect and this projection would be wrong.
        pitchEnabled={false}
        rotateEnabled={false}
        showsUserLocation={false}
        toolbarEnabled={false}
      >
        {/* CONTROL PIN. Native rendering, pinColor prop, ZERO React children —
            the only Marker shape proven safe under Fabric. If the badge and this
            pin ever separate on screen, the projection is wrong. */}
        <Marker coordinate={LISTING} pinColor="#0A1228" />
      </MapView>

      {/* THE BADGE. An ordinary absolutely-positioned View, sibling to MapView,
          never a Marker child. This is the whole point of the spike. */}
      {badgeVisible && (
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => {
            setSelected((v) => !v);
            setTapCount((n) => n + 1);
          }}
          style={[
            s.badge,
            selected && s.badgeSelected,
            // Centred horizontally on the point; bottom edge sits on it, like a
            // pin tip.
            { left: badgePoint.x - 34, top: badgePoint.y - 34 },
          ]}
        >
          <Text style={[s.badgeText, selected && s.badgeTextSelected]}>$145</Text>
        </TouchableOpacity>
      )}

      {/* Header is shown for this route (registered in _layout), so the HUD sits
          just below it rather than offsetting by the raw safe-area inset. */}
      <View style={[s.hud, { top: 8 }]} pointerEvents="box-none">
        <Text style={s.hudTitle}>{PROVIDER_LABEL}</Text>
        <Text style={s.hudRow}>
          badge  x {badgePoint.x.toFixed(1)}  y {badgePoint.y.toFixed(1)}
        </Text>
        <Text style={s.hudRow}>
          sdk    {sdkPoint ? `x ${sdkPoint.x.toFixed(1)}  y ${sdkPoint.y.toFixed(1)}` : '(pan once)'}
        </Text>
        <Text style={[s.hudRow, maxDelta > 2 && s.hudBad]}>
          delta  live {liveDelta == null ? '—' : `${liveDelta.toFixed(2)}px`}   MAX{' '}
          {maxDelta.toFixed(2)}px
        </Text>
        <Text style={s.hudRow}>
          region events {regionEvents}   taps {tapCount}   selected {String(selected)}
        </Text>
        <Text style={s.hudRow}>
          mapPadding {padded ? `ON (top 16 / bottom ${Math.round(insets.bottom + 110)})` : 'OFF'}
        </Text>
        <Text style={s.hudDim}>PASS: MAX delta stays under ~2px after gesturing.</Text>
      </View>

      <View style={[s.actions, { bottom: insets.bottom + 24 }]}>
        <TouchableOpacity style={s.btn} onPress={recenter}>
          <Text style={s.btnText}>Recenter</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.btn}
          onPress={() => {
            setMaxDelta(0);
            setRegionEvents(0);
          }}
        >
          <Text style={s.btnText}>Reset stats</Text>
        </TouchableOpacity>
        {/* Navigation test: the original Fabric crash fired on tap-to-navigate.
            Go and come back, then confirm the badge is present and not stale. */}
        <TouchableOpacity
          style={s.btn}
          onPress={() => { setPadded((v) => !v); setMaxDelta(0); setSdkPoint(null); }}
        >
          <Text style={s.btnText}>{padded ? 'Padding OFF' : 'Padding ON'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.btn} onPress={() => router.push('/location-settings')}>
          <Text style={s.btnText}>Away</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, position: 'relative', overflow: 'hidden' },
  badge: {
    position: 'absolute',
    width: 68,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#C9A84C',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  badgeSelected: { backgroundColor: '#0A1228', transform: [{ scale: 1.12 }] },
  badgeText: { color: '#0A1228', fontWeight: '800', fontSize: 15 },
  badgeTextSelected: { color: '#C9A84C' },
  hud: {
    position: 'absolute',
    left: 12,
    right: 12,
    backgroundColor: 'rgba(10,18,40,0.86)',
    borderRadius: 8,
    padding: 10,
    gap: 2,
  },
  hudTitle: { color: '#C9A84C', fontWeight: '800', fontSize: 12, marginBottom: 2 },
  hudRow: { color: '#E6ECF8', fontSize: 11, fontVariant: ['tabular-nums'] },
  hudBad: { color: '#F08A92', fontWeight: '700' },
  hudDim: { color: '#8A9DC0', fontSize: 10, marginTop: 4 },
  actions: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', gap: 8 },
  btn: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 4,
  },
  btnText: { color: '#0A1228', fontWeight: '700', fontSize: 13 },
});
