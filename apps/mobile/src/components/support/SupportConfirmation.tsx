import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import type { SupportTicket } from '@/lib/supportTicketService';

export function SupportConfirmation({ ticket, onViewTicket }: { ticket: SupportTicket; onViewTicket: () => void }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.iconCircle}>
        <Ionicons name="checkmark" size={28} color={colors.gold} />
      </View>
      <Text style={styles.title}>We&apos;ve got it</Text>
      <Text style={styles.subject} numberOfLines={2}>{ticket.subject}</Text>
      <Text style={styles.footnote}>We typically reply within 24 hours.</Text>
      <Pressable style={styles.viewBtn} onPress={onViewTicket} accessibilityRole="button" accessibilityLabel="View ticket">
        <Text style={styles.viewBtnText}>View ticket</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: spacing.lg },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: { fontSize: text.titleSm.size, fontWeight: '800', color: colors.navy },
  subject: { fontSize: text.body.size, fontWeight: '500', color: colors.textSub, textAlign: 'center', marginTop: spacing.sm },
  footnote: { fontSize: text.caption.size, fontWeight: '500', color: colors.textSub, marginTop: spacing.md },
  viewBtn: {
    marginTop: spacing.lg,
    alignSelf: 'stretch',
    backgroundColor: colors.navy,
    borderRadius: shape.cta,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  viewBtnText: { color: colors.gold, fontSize: text.actionLarge.size, fontWeight: '800' },
});
