import React from 'react';
import { View, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, PROVIDER_DEFAULT } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tabBarClearance } from '@/constants/tabBar';
import { colors } from '@/theme';
import { gameTypePillStyle } from '@/lib/supabase/playEvents';
import type { ExploreMapProps, MapPinLike } from './ExploreMap.types';

const L = { gold: colors.gold, navy: colors.navy, white: colors.white };

// Google Maps on iOS needs its own native SDK pod (GoogleMaps) linked into
// the Xcode project ("AirGoogleMaps dir must be added to your xcode
// project") -- not wired into this app's current native build. Apple's own
// MapKit provider needs no extra native SDK/config and just works, so iOS
// uses it instead; Android keeps Google Maps (already configured via
// android.config.googleMaps.apiKey in app.config.js). Google Places/facility
// search data is unaffected either way -- this only changes which map
// renderer draws the tiles/markers.
const MAP_PROVIDER = Platform.OS === 'ios' ? PROVIDER_DEFAULT : PROVIDER_GOOGLE;

// Markers were previously a custom View tree (circle + icon + halo) rendered
// as <Marker>'s React children. Confirmed on-device (2026-09-07) that this is
// exactly the incompatibility documented in react-native-maps#5378: Fabric's
// InteropLayer does not support a custom component with custom child
// components inside a Marker, and it crashed (SIGABRT, ObjC exception during
// RCTMountingManager's mountChildComponentView) reliably on tap-to-navigate.
// A markers-with-no-children diagnostic build reproduced the same tap
// sequence with zero crashes, confirming the cause.
//
// Fixed by using react-native-maps' native `pinColor` prop instead — the
// standard pin shape, tinted per category, with NO React children at all.
// This is the library's own native rendering path, not the broken
// custom-component one. tracksViewChanges (and the timer/forceStatic
// machinery that used to manage it) is gone with it: that prop only matters
// for a custom view that needs re-rasterizing, and the native pin has no such
// JS-driven snapshot to manage.
//
// Follow-up (not done here, tracked separately): closer visual fidelity via
// <Marker image={require(...)} /> — the native `image` prop, not a child
// <Image>. A child <Image> is still a React child inside <Marker> and stays
// on the same broken Fabric path; `image` passes an asset as a prop with no
// child view at all, which is the actually-safe way to customize marker
// artwork under Fabric.
function pinColorFor(pin: MapPinLike): string {
  // An explicit colour wins — Marketplace uses it for price bands. Everything
  // below is the original category behaviour, unchanged.
  if (pin.color) return pin.color;
  const gameType = pin.category === 'community' && pin.eventType ? gameTypePillStyle(pin.eventType) : null;
  return gameType ? gameType.bg : (pin.category === 'community' ? L.gold : L.navy);
}

export function ExploreMap({
  pins, selectedId, onSelectPin, region, onRegionChangeComplete, onLocate, onMapPress, overlay,
}: ExploreMapProps) {
  const mapRef = React.useRef<MapView | null>(null);
  const initialRegion = React.useRef(region).current;
  const insets = useSafeAreaInsets();
  const barClearance = tabBarClearance(insets.bottom);

  // The camera is uncontrolled: `region` is only a target we animate to when the
  // caller hands us a new one. Passing it as MapView's `region` prop instead
  // would re-apply the camera on every render and fight the user's panning.
  React.useEffect(() => {
    if (region === initialRegion) return;
    mapRef.current?.animateToRegion(region, 350);
  }, [region, initialRegion]);

  return (
    <View style={mp.root}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={MAP_PROVIDER}
        initialRegion={initialRegion}
        onRegionChangeComplete={onRegionChangeComplete}
        // A tap on a marker also delivers MapView's own onPress on iOS, so a
        // naive handler here clears the selection in the very same tap that set
        // it -- the card would never appear. react-native-maps tags that case,
        // so only a genuine map-background press dismisses.
        onPress={onMapPress ? (e) => {
          if (e.nativeEvent?.action !== 'marker-press') onMapPress();
        } : undefined}
        showsUserLocation
        showsMyLocationButton={false}
        toolbarEnabled={false}
        mapPadding={{ top: 16, right: 16, bottom: barClearance + 110, left: 16 }}
      >
        {pins.map(pin => (
          <Marker
            key={pin.id}
            coordinate={{ latitude: pin.latitude, longitude: pin.longitude }}
            onPress={() => onSelectPin(pin.id)}
            pinColor={pinColorFor(pin)}
            opacity={selectedId === pin.id ? 1 : 0.9}
          />
        ))}
      </MapView>

      {overlay}

      <TouchableOpacity
        style={[mp.gpsBtn, { bottom: barClearance + 20 }]}
        onPress={onLocate}
        activeOpacity={0.85}
      >
        <Ionicons name="locate" size={20} color={L.navy} />
      </TouchableOpacity>
    </View>
  );
}

const mp = StyleSheet.create({
  root:  { flex: 1, position: 'relative', overflow: 'hidden' },
  gpsBtn: {
    position: 'absolute', right: 16,
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: L.white, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14, shadowRadius: 6, elevation: 5,
  },
});
