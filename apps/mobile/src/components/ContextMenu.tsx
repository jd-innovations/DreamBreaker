// Overflow menu.
//
// Extracted from groups/[id].tsx, where it was defined inline and so could not
// be used by the other screens that wanted one.
//
// On iOS it presents the REAL system action sheet. That is not cosmetic:
// ActionSheetIOS gets the platform's blur, spacing, Dynamic Type, VoiceOver
// ordering, the red destructive treatment, and the swipe-to-dismiss users
// already expect — none of which a hand-drawn popover reproduces, and all of
// which it has to keep reproducing as iOS changes.
//
// Android has no equivalent primitive in React Native, so it keeps the popover.
// Both platforms therefore look native rather than both looking like neither.
//
// NOT the long-press context menu (UIContextMenuInteraction) with a blurred
// preview of the pressed item — that needs a native module and therefore a new
// build. This is the part that works today with no build, and it is the right
// control for a "more options" button regardless.

import { useCallback, useRef, useState } from "react";
import {
  ActionSheetIOS,
  Animated,
  Easing,
  Platform,
  Text,
  TouchableOpacity,
  View,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors as L } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { text } from '@shared/tokens';

export type MenuItem = { icon: string; label: string; danger?: boolean };

/**
 * Presents `items` and calls `onSelect` with the chosen label.
 *
 * iOS returns immediately after presenting the system sheet; `visible` stays
 * false there, so callers must not gate the sheet on it. The popover fields are
 * only meaningful on Android.
 */
export function useContextMenu() {
  const anim = useRef(new Animated.Value(0)).current;
  const [visible, setVisible] = useState(false);

  const close = useCallback(
    (cb?: () => void) => {
      Animated.timing(anim, {
        toValue: 0,
        duration: 120,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        setVisible(false);
        cb?.();
      });
    },
    [anim],
  );

  const openPopover = useCallback(() => {
    setVisible(true);
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: 160,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [anim]);

  /** iOS: system sheet. Android: animated popover. */
  const present = useCallback(
    (items: MenuItem[], onSelect: (label: string) => void) => {
      if (Platform.OS !== "ios") {
        openPopover();
        return;
      }
      const labels = items.map((i) => i.label);
      const destructiveButtonIndex = items.findIndex((i) => i.danger);
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...labels, "Cancel"],
          cancelButtonIndex: labels.length,
          ...(destructiveButtonIndex >= 0 ? { destructiveButtonIndex } : {}),
          userInterfaceStyle: "light",
        },
        (index) => {
          if (index === labels.length) return; // Cancel
          onSelect(labels[index]);
        },
      );
    },
    [openPopover],
  );

  return {
    visible,
    present,
    close,
    opacity: anim,
    scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }),
  };
}

export function ContextMenu({
  items,
  top,
  right,
  opacity,
  scale,
  caretRight = 13,
  onItemPress,
}: {
  items: MenuItem[];
  top: number;
  right: number;
  opacity: Animated.Value | Animated.AnimatedInterpolation<number>;
  scale: Animated.AnimatedInterpolation<number>;
  caretRight?: number;
  onItemPress?: (label: string) => void;
}) {
  const mainItems = items.filter((i) => !i.danger);
  const dangerItems = items.filter((i) => i.danger);

  return (
    <Animated.View style={[cm.popover, { top, right, opacity, transform: [{ scale }] }]}>
      <View style={[cm.caret, { right: caretRight }]} />

      {mainItems.map((item, i) => (
        <TouchableOpacity
          key={item.label}
          style={[cm.row, i === 0 && cm.rowFirst]}
          onPress={() => onItemPress?.(item.label)}
          activeOpacity={0.7}
        >
          <View style={cm.iconWrap}>
            <Ionicons name={item.icon as never} size={17} color={L.navy} />
          </View>
          <Text style={cm.label}>{item.label}</Text>
        </TouchableOpacity>
      ))}

      {dangerItems.length > 0 && (
        <>
          <View style={cm.divider} />
          {dangerItems.map((item) => (
            <TouchableOpacity
              key={item.label}
              style={[cm.row, cm.rowLast]}
              onPress={() => onItemPress?.(item.label)}
              activeOpacity={0.7}
            >
              <View style={[cm.iconWrap, cm.iconWrapDanger]}>
                <Ionicons name={item.icon as never} size={17} color={L.danger} />
              </View>
              <Text style={[cm.label, cm.labelDanger]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </>
      )}
    </Animated.View>
  );
}

const cm = StyleSheet.create({
  popover: {
    position: 'absolute',
    width: 252,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingVertical: 5,
    zIndex: 41,
    shadowColor: '#000',
    shadowOpacity: 0.13,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 16,
  },
  caret: {
    position: 'absolute', top: -7,
    width: 0, height: 0,
    borderLeftWidth: 6, borderRightWidth: 6, borderBottomWidth: 8,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    borderBottomColor: '#FFFFFF',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 8, marginHorizontal: 5,
    borderRadius: 11, height: 50,
  },
  rowFirst: { marginTop: 4 },
  rowLast: { marginBottom: 4 },
  iconWrap: {
    width: 32, height: 32, borderRadius: 9,
    backgroundColor: '#F3F6FC',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  iconWrapDanger: { backgroundColor: L.dangerBg },
  label: { color: L.navy, fontSize: text.rowTitle.size, fontWeight: '700' },
  labelDanger: { color: L.danger },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: L.border,
    marginHorizontal: 10, marginVertical: 3,
  },
});
