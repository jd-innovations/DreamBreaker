import React from 'react';
import { Linking, Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@/theme';

// Renders a tappable filename row for a non-image ('file') message
// attachment. `onDark` matches it to the sent-bubble (navy) vs
// received-bubble (light) background it's placed on.
export function FileAttachmentRow({
  url, name, onDark = false,
}: {
  url: string;
  name: string | null;
  onDark?: boolean;
}) {
  return (
    <Pressable style={styles.row} onPress={() => Linking.openURL(url)}>
      <Ionicons name="document-outline" size={20} color={onDark ? colors.white : colors.navy} />
      <Text style={[styles.name, onDark && styles.nameOnDark]} numberOfLines={1}>
        {name ?? 'File'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: 200,
  },
  name: { fontSize: 14, fontWeight: '600', color: colors.navy },
  nameOnDark: { color: colors.white },
});
