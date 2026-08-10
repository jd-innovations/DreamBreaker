import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';
import type { VenueMapCardProps } from './VenueMapCard.types';

// react-native-maps has no web support — this stub keeps the web preview
// bundle-able while the native build still renders the real map.
export function VenueMapCard({ name }: VenueMapCardProps) {
  return (
    <View style={s.root}>
      <Ionicons name="map-outline" size={32} color={colors.textSub} />
      <Text style={s.text}>Map preview isn't available on web.{'\n'}{name}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.page, gap: 8, padding: 24,
  },
  text: { color: colors.textSub, fontSize: 13, textAlign: 'center', lineHeight: 19 },
});
