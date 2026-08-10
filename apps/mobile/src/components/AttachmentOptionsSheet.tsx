import React, { useRef } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/theme';

export function AttachmentOptionsSheet({
  visible, onClose, onTakePhoto, onChooseLibrary, onChooseFile,
}: {
  visible: boolean;
  onClose: () => void;
  onTakePhoto: () => void;
  onChooseLibrary: () => void;
  onChooseFile: () => void;
}) {
  const pendingAction = useRef<null | (() => void)>(null);

  // iOS only allows one modal presentation at a time — launching a native
  // picker (camera/library/document) while this <Modal> is still animating
  // out silently no-ops. So on iOS we stash the chosen action and run it
  // from the Modal's onDismiss (fires only after the sheet is fully gone),
  // which is deterministic rather than a guessed timeout. Android has no such
  // restriction and doesn't fire onDismiss, so we just run it after close.
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
          <Row icon="camera-outline" label="Take Photo" onPress={() => select(onTakePhoto)} />
          <View style={styles.divider} />
          <Row icon="images-outline" label="Photo Library" onPress={() => select(onChooseLibrary)} />
          <View style={styles.divider} />
          <Row icon="document-attach-outline" label="Choose File" onPress={() => select(onChooseFile)} />
          <Pressable style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Row({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <Ionicons name={icon} size={22} color={colors.navy} />
      <Text style={styles.rowLabel}>{label}</Text>
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
