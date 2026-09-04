import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { text } from '@shared/tokens';
import type { ExploreMapProps } from './ExploreMap.types';

// react-native-maps has no web support — this stub keeps the web preview
// bundle-able while the native build still renders the real map.
const L = { gold: colors.gold, navy: colors.navy, white: colors.white, textSub: colors.textSub, page: colors.page };

export function ExploreMap({ pins, selectedId: _selectedId, onSelectPin: _onSelectPin, onLocate }: ExploreMapProps) {
  return (
    <View style={s.root}>
      <View style={s.placeholder}>
        <Ionicons name="map-outline" size={40} color={L.textSub} />
        <Text style={s.text}>
          Map view isn't available in the web preview.{'\n'}
          {pins.length} pin{pins.length === 1 ? '' : 's'} nearby — use the list below.
        </Text>
      </View>
      <TouchableOpacity style={s.gpsBtn} onPress={onLocate} activeOpacity={0.85}>
        <Ionicons name="locate" size={20} color={L.navy} />
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, position: 'relative', overflow: 'hidden', backgroundColor: L.page },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  text: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', textAlign: 'center', lineHeight: 19 },
  gpsBtn: {
    position: 'absolute', bottom: 116, right: 16,
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: L.white, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14, shadowRadius: 6, elevation: 5,
  },
});
