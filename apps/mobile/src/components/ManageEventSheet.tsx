import React, { useRef } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/theme';

export function ManageEventSheet({
  visible, onClose, onEdit, onCancelEvent,
}: {
  visible: boolean;
  onClose: () => void;
  onEdit: () => void;
  onCancelEvent: () => void;
}) {
  const pendingAction = useRef<null | (() => void)>(null);

  // Same iOS one-modal-at-a-time quirk as AttachmentOptionsSheet: Edit
  // navigates away from this screen while the sheet is still animating out,
  // so on iOS the action waits for onDismiss instead of a guessed timeout.
  function select(action: () => void) {
    if (Platform.OS === 'ios') {
      pendingAction.current = action;
      onClose();
    } else {
      onClose();
      action();
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      onDismiss={() => {
        const action = pendingAction.current;
        pendingAction.current = null;
        action?.();
      }}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.grabber} />
          <Row icon="create-outline" label="Edit Event" onPress={() => select(onEdit)} />
          <View style={styles.divider} />
          <Row icon="close-circle-outline" label="Cancel Event" destructive onPress={() => select(onCancelEvent)} />
          <Pressable style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelText}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Row({ icon, label, onPress, destructive }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; destructive?: boolean;
}) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <Ionicons name={icon} size={22} color={destructive ? colors.danger : colors.navy} />
      <Text style={[styles.rowLabel, destructive && { color: colors.danger }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(10,18,40,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.card + 8,
    borderTopRightRadius: radius.card + 8,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  grabber: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.md,
  },
  rowLabel: { fontSize: 16, fontWeight: '600', color: colors.navy },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  cancelBtn: {
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  cancelText: { fontSize: 16, fontWeight: '700', color: colors.textSub },
});
