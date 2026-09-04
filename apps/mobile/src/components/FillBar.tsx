import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { text } from '@shared/tokens';

type Props = {
  /** Spots taken. */
  filled: number;
  /** Total spots. A zero or negative capacity renders an empty track. */
  capacity: number;
  /**
   * Show the trailing "N left" / "WAITLIST" label. Off where the surrounding
   * card already states the same numbers.
   */
  showLabel?: boolean;
  /**
   * Force the "WAITLIST" label. Kept as an explicit flag rather than inferred
   * from spotsLeft === 0, because a tournament can be status 'full' while
   * draw_size - spots_filled is still positive; the caller's status is the
   * authority on that, not the arithmetic.
   */
  waitlist?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Registration fill bar.
 *
 * Extracted from the tournaments list card, which was the better of two
 * divergent copies — the community event screen has its own 6pt flat-coloured
 * version. This one keeps the colour thresholds, which are the point: a bar
 * that turns gold and then red carries urgency that a percentage does not.
 *
 * The percentage is clamped rather than trusted. spots_filled is maintained by
 * registration writes and can exceed draw_size (an over-filled division, a
 * director adding registrations past capacity), and an unclamped width above
 * 100% overflows the track.
 */
export function FillBar({ filled, capacity, showLabel = false, waitlist = false, style }: Props) {
  const safeCapacity = capacity > 0 ? capacity : 0;
  const pct = safeCapacity > 0
    ? Math.min(100, Math.max(0, Math.round((filled / safeCapacity) * 100)))
    : 0;
  const spotsLeft = Math.max(0, safeCapacity - filled);

  return (
    <View style={[s.row, style]}>
      <View style={s.track}>
        <View
          style={[
            s.bar,
            {
              width: `${pct}%` as `${number}%`,
              backgroundColor: pct >= 90 ? colors.danger : pct >= 70 ? colors.gold : colors.success,
            },
          ]}
        />
      </View>
      {showLabel && (
        <Text style={s.label}>{waitlist ? 'WAITLIST' : `${spotsLeft} left`}</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  track: { flex: 1, height: 4, backgroundColor: colors.page, borderRadius: 2, overflow: 'hidden' },
  bar: { height: '100%', borderRadius: 2 },
  label: { color: colors.textSub, fontSize: text.microLabel.size, fontWeight: '700' },
});
