import React from 'react';
import { View, Text, StyleSheet, Modal, Pressable, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';

// The centred explainer dialog: gold icon, title, body, optional footnote,
// single dismiss button.
//
// Extracted from tournament/[id].tsx, where it explained "Hold My Spot" and
// existed as inline JSX plus a local stylesheet. It is the right register for
// explaining a term the user tapped a ⓘ about — an explainer, not a warning
// and not a decision — so it belongs somewhere a second screen can reach.
//
// Deliberately dumb: strings and a visibility flag. No screen-specific
// branching, so the coach profile's "not yet verified" and the tournament's
// deposit explanation are the same component with different words.

type Props = {
  visible: boolean;
  onClose: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  /** Secondary line under a divider. Omitted entirely when absent. */
  footer?: string;
  dismissLabel?: string;
};

export function InfoTooltip({
  visible, onClose, icon = 'information-circle-outline', title, body, footer, dismissLabel = 'Done',
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* Tapping the backdrop dismisses; the inner Pressable stops that
          propagating so a tap on the card itself does not close it. */}
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.card} onPress={() => {}}>
          <View style={s.iconRow}>
            <View style={s.iconCircle}>
              <Ionicons name={icon} size={26} color={colors.gold} />
            </View>
          </View>

          <Text style={s.title}>{title}</Text>
          <Text style={s.body}>{body}</Text>

          {footer ? (
            <>
              <View style={s.divider} />
              <Text style={s.footer}>{footer}</Text>
            </>
          ) : (
            <View style={{ height: 20 }} />
          )}

          <TouchableOpacity style={s.doneBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={s.doneBtnText}>{dismissLabel}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(10,18,40,0.55)',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32,
  },
  card: {
    width: '100%', backgroundColor: colors.bg,
    borderRadius: shape.card, padding: 24,
    shadowColor: '#000', shadowOpacity: 0.18,
    shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  iconRow: { alignItems: 'center', marginBottom: 14 },
  iconCircle: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.goldLight,
    alignItems: 'center', justifyContent: 'center',
  },
  title: {
    fontSize: text.modalTitle.size, fontWeight: '900', color: colors.navy,
    textAlign: 'center', marginBottom: 12,
  },
  body: {
    fontSize: text.body.size, color: colors.text, lineHeight: 22,
    textAlign: 'center', fontWeight: '500',
  },
  divider: {
    height: StyleSheet.hairlineWidth, backgroundColor: colors.border,
    marginVertical: 16,
  },
  footer: {
    fontSize: text.caption.size, color: colors.textSub, lineHeight: 19,
    textAlign: 'center', fontWeight: '500', marginBottom: 20,
  },
  doneBtn: {
    backgroundColor: colors.gold, borderRadius: shape.cta,
    paddingVertical: 14, alignItems: 'center',
  },
  doneBtnText: { color: '#FFFFFF', fontSize: text.actionLarge.size, fontWeight: '800' },
});
