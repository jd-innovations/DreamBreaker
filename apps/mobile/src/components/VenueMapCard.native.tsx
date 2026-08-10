import React from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import type { VenueMapCardProps } from './VenueMapCard.types';

export function VenueMapCard({ latitude, longitude, name }: VenueMapCardProps) {
  return (
    <MapView
      style={StyleSheet.absoluteFill}
      provider={PROVIDER_GOOGLE}
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
