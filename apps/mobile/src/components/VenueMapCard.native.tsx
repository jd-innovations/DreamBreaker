import React from 'react';
import { StyleSheet, Platform } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, PROVIDER_DEFAULT } from 'react-native-maps';
import type { VenueMapCardProps } from './VenueMapCard.types';

// See ExploreMap.native.tsx for why iOS uses Apple's MapKit provider instead
// of Google here: Google Maps on iOS needs a native SDK pod not wired into
// this app's current build ("AirGoogleMaps dir must be added"), while Apple's
// provider needs no extra native config.
const MAP_PROVIDER = Platform.OS === 'ios' ? PROVIDER_DEFAULT : PROVIDER_GOOGLE;

export function VenueMapCard({ latitude, longitude, name }: VenueMapCardProps) {
  return (
    <MapView
      style={StyleSheet.absoluteFill}
      provider={MAP_PROVIDER}
      initialRegion={{
        latitude, longitude,
        latitudeDelta: 0.02, longitudeDelta: 0.02,
      }}
      scrollEnabled={false}
      zoomEnabled={false}
      pitchEnabled={false}
      rotateEnabled={false}
    >
      <Marker coordinate={{ latitude, longitude }} title={name} />
    </MapView>
  );
}
