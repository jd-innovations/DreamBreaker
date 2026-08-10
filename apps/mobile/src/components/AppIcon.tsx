import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import type { StyleProp, ViewStyle, TextStyle } from 'react-native';
import { PickleballIcon } from './PickleballIcon';

type IoniconName = keyof typeof Ionicons.glyphMap;

// Extends Ionicons glyph names with the real pickleball mark for call sites
// that pick an icon name from data/config rather than rendering <Ionicons>
// directly.
export type AppIconName = IoniconName | 'pickleball';

export function AppIcon({
  name, size = 24, color = '#000000', style,
}: {
  name: AppIconName;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle | TextStyle>;
}) {
  if (name === 'pickleball') {
    return <PickleballIcon size={size} color={color} style={style as StyleProp<ViewStyle>} />;
  }
  return <Ionicons name={name} size={size} color={color} style={style as StyleProp<TextStyle>} />;
}
