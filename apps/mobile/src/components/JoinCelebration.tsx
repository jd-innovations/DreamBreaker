import React, { useEffect, useMemo } from 'react';
import { Dimensions, Modal, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withDelay, withSpring,
  withSequence, withRepeat, Easing, runOnJS,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { text } from '@shared/tokens';
import { PickleballIcon } from './PickleballIcon';
import { haptics } from '@/lib/haptics';

const { width: SW, height: SH } = Dimensions.get('window');
const BALL_COLORS = [colors.gold, colors.navy, '#FFFFFF'];

type JoinCelebrationProps = {
  visible: boolean;
  onDone: () => void;
  title?: string;
  subtitle?: string;
};

// One pickleball "confetti" piece: drops from above the screen, drifts side
// to side like it's clipping a breeze off the court, spins, and fades near
// the bottom. Every ball is staggered so it reads as a little celebratory
// flurry rather than a single synced drop.
function FallingBall({ index, total }: { index: number; total: number }) {
  const startX = useMemo(() => (SW / (total + 1)) * (index + 1) - 12, [index, total]);
  const size = useMemo(() => (16 + Math.random() * 14) * 1.25, []);
  const color = BALL_COLORS[index % BALL_COLORS.length];
  const delay = Math.floor(Math.random() * 350);
  const drift = 24 + Math.random() * 36;
  const duration = 1400 + Math.random() * 500;

  const translateY = useSharedValue(-40);
  const translateX = useSharedValue(0);
  const rotate = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(delay, withSequence(withTiming(1, { duration: 120 }), withTiming(1, { duration: duration - 300 }), withTiming(0, { duration: 180 })));
    translateY.value = withDelay(delay, withTiming(SH * 0.62, { duration, easing: Easing.out(Easing.quad) }));
    translateX.value = withDelay(delay, withRepeat(withSequence(
      withTiming(drift, { duration: duration / 4, easing: Easing.inOut(Easing.sin) }),
      withTiming(-drift, { duration: duration / 2, easing: Easing.inOut(Easing.sin) }),
      withTiming(0, { duration: duration / 4, easing: Easing.inOut(Easing.sin) }),
    ), 1));
    rotate.value = withDelay(delay, withTiming(360 * (Math.random() > 0.5 ? 1 : -1), { duration, easing: Easing.linear }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    position: 'absolute',
    left: startX,
    top: 0,
    opacity: opacity.value,
    transform: [
      { translateY: translateY.value },
      { translateX: translateX.value },
      { rotate: `${rotate.value}deg` },
    ],
  }));

  return (
    <Animated.View style={style}>
      <PickleballIcon size={size} color={color} />
    </Animated.View>
  );
}

export function JoinCelebration({
  visible, onDone, title = "You're In!", subtitle = 'Get your paddle ready 🏓',
}: JoinCelebrationProps) {
  const badgeScale = useSharedValue(0);
  const badgeRotate = useSharedValue(-8);

  useEffect(() => {
    if (!visible) return;
    haptics.success();
    badgeScale.value = withSequence(
      withSpring(1.15, { damping: 6, stiffness: 180 }),
      withSpring(1, { damping: 8 }),
    );
    badgeRotate.value = withSequence(
      withTiming(8, { duration: 120 }),
      withTiming(-4, { duration: 120 }),
      withTiming(0, { duration: 120 }),
    );
    const timer = setTimeout(() => runOnJS(onDone)(), 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: badgeScale.value }, { rotate: `${badgeRotate.value}deg` }],
  }));

  if (!visible) return null;

  const balls = Array.from({ length: 16 });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDone}>
      <View style={s.overlay} pointerEvents="none">
        {balls.map((_, i) => (
          <FallingBall key={i} index={i} total={balls.length} />
        ))}

        <View style={s.center}>
          <Animated.View style={[s.badge, badgeStyle]}>
            <PickleballIcon size={55} color={colors.navy} />
            <View style={s.checkBubble}>
              <Ionicons name="checkmark" size={16} color="#FFFFFF" />
            </View>
          </Animated.View>
          <Text style={s.title}>{title}</Text>
          <Text style={s.subtitle}>{subtitle}</Text>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(10,18,40,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  center: { alignItems: 'center', gap: 6 },
  badge: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: colors.goldLight, borderWidth: 2, borderColor: colors.gold,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  checkBubble: {
    position: 'absolute', bottom: -2, right: -2,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: colors.success, borderWidth: 2, borderColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { color: colors.navy, fontSize: text.cardTitle.size, fontWeight: '800' },
  subtitle: { color: colors.textSub, fontSize: text.rowTitle.size, fontWeight: '700' },
});
