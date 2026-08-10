import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '@/theme';
import type { MessageReaction } from '@/lib/messageReactions';

export function ReactionPills({
  reactions, currentUserId, onToggle, align = 'flex-start',
}: {
  reactions: MessageReaction[];
  currentUserId: string | undefined;
  onToggle: (emoji: string) => void;
  align?: 'flex-start' | 'flex-end';
}) {
  const groups = useMemo(() => {
    const byEmoji = new Map<string, MessageReaction[]>();
    for (const r of reactions) {
      const list = byEmoji.get(r.emoji) ?? [];
      list.push(r);
      byEmoji.set(r.emoji, list);
    }
    return [...byEmoji.entries()];
  }, [reactions]);

  if (groups.length === 0) return null;

  return (
    <View style={[styles.row, { justifyContent: align }]}>
      {groups.map(([emoji, list]) => {
        const mine = list.some((r) => r.user_id === currentUserId);
        return (
          <Pressable
            key={emoji}
            onPress={() => onToggle(emoji)}
            style={[styles.pill, mine && styles.pillMine]}
          >
            <Text style={styles.emoji}>{emoji}</Text>
            {list.length > 1 && <Text style={[styles.count, mine && styles.countMine]}>{list.length}</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: 2,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.chip,
    backgroundColor: colors.page,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillMine: {
    backgroundColor: colors.goldBg,
    borderColor: colors.goldBorder,
  },
  emoji: { fontSize: 13 },
  count: { fontSize: 11, fontWeight: '700', color: colors.textSub },
  countMine: { color: colors.gold },
});
