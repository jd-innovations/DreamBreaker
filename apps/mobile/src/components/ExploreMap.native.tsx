import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tabBarClearance } from '@/constants/tabBar';
import { colors } from '@/theme';
import { gameTypePillStyle } from '@/lib/supabase/playEvents';
import { AppIcon, type AppIconName } from './AppIcon';
import type { ExploreMapProps, MapPinLike } from './ExploreMap.types';

const L = { gold: colors.gold, navy: colors.navy, white: colors.white };

// Halo (selected-state glow) rgba equivalents for each pin color — kept as a
// flat lookup rather than deriving from hex since there are only ever 4 colors.
const HALO_BY_COLOR: Record<string, string> = {
  [L.gold]:  'rgba(201,168,76,0.18)',
  [L.navy]:  'rgba(10,18,40,0.12)',
  '#2563EB': 'rgba(37,99,235,0.18)',  // round robin
  '#DC2626': 'rgba(220,38,38,0.18)',  // mini tournament
};

function MapPin({ pin, selected }: { pin: MapPinLike; selected: boolean }) {
  const gameType = pin.category === 'community' && pin.eventType ? gameTypePillStyle(pin.eventType) : null;
  const pinColor = gameType ? gameType.bg : (pin.category === 'community' ? L.gold : L.navy);
  const haloColor = HALO_BY_COLOR[pinColor] ?? 'rgba(10,18,40,0.12)';
  const iconName: AppIconName =
    pin.category === 'community' ? 'people' : pin.category === 'tournament' ? 'trophy' : 'pickleball';
  // Pickleball glyph reads small at the default 17px — scale it up well
  // past 2x to compensate for the padded SVG viewBox, keeping the 40x40
  // pinHead circle unchanged so the marker itself doesn't grow.
  const iconSize = iconName === 'pickleball' ? 42 : 17;

  return (
    <View style={mp.pinWrap}>
      {selected && <View style={[mp.halo, { backgroundColor: haloColor }]} />}
      <View style={[mp.pinHead, { backgroundColor: pinColor }]}>
        <AppIcon name={iconName} size={iconSize} color={L.white} />
      </View>
      <View style={[mp.pinTail, { borderTopColor: pinColor }]} />
    </View>
  );
}

export function ExploreMap({
  pins, selectedId, onSelectPin, region, onRegionChangeComplete, onLocate,
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
        provider={PROVIDER_GOOGLE}
        initialRegion={initialRegion}
        onRegionChangeComplete={onRegionChangeComplete}
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
            anchor={{ x: 0.5, y: 1 }}
            // Custom marker views default to tracksViewChanges=true, which
            // keeps re-rasterizing every marker on every frame — with many
            // pins this shows up as a visible fade/flicker as they load.
            // Only the selected pin needs live re-rendering (for its halo).
            tracksViewChanges={selectedId === pin.id}
          >
            <MapPin pin={pin} selected={selectedId === pin.id} />
          </Marker>
        ))}
      </MapView>

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
  pinWrap:  { alignItems: 'center', width: 44 },
  halo: {
    position: 'absolute',
    width: 64, height: 64, borderRadius: 32,
    top: -12, left: -10,
  },
  pinHead: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18, shadowRadius: 4, elevation: 4,
  },
  pinTail: {
    width: 0, height: 0,
    borderLeftWidth: 7, borderRightWidth: 7, borderTopWidth: 10,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    marginTop: -1,
  },
  gpsBtn: {
    position: 'absolute', right: 16,
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: L.white, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14, shadowRadius: 6, elevation: 5,
  },
});
