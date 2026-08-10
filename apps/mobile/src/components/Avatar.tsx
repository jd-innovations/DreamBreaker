import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { colors } from '@/theme';

export type AvatarProps = {
  uri: string | null | undefined;
  initials: string;
  bg: string;
  size?: number;
};

/**
 * Renders a profile photo when a URL is available, falling back to an
 * initials circle otherwise. Callers own border/margin/stacking styles on a
 * wrapping View — this component only owns the circle itself.
 */
export function Avatar({ uri, initials, bg, size = 40 }: AvatarProps) {
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    );
  }
  return (
    <View style={[styles.fallback, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
      <Text style={[styles.initials, { fontSize: size * 0.32 }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
  initials: { color: colors.white, fontWeight: '800' },
});
