// Three-snap-point (collapsed/half/full) draggable bottom sheet. Every sheet in
// the app so far (marketplace.tsx's FilterSheet/ReportSheet, nearby.tsx's
// FacilityBottomSheet) is a single-position slide-up panel built by hand with
// an Animated.Value + PanResponder; this generalizes that same primitive to
// three drag-snappable heights for Marketplace Listing Detail, which is the
// first screen that needs progressive disclosure rather than open/closed.
//
// Reworked 2026-11-06 after "hard to close and expand":
// - The PanResponder is created once, so it read the snap and heights from the
//   first render forever. A drag on the half sheet started from the collapsed
//   height and could not step down. Live values now come from refs.
// - The whole sheet drags, not just a 20pt handle. Vertical moves are claimed
//   in the capture phase, so taps on buttons inside still work, and a drag that
//   starts on a button becomes a sheet drag.
// - In `full`, the content scrolls; a pull down only moves the sheet once that
//   scroll is at the top (renderFull gets the scroll props that make this work).
// - The handle is a button: tap steps collapsed → half, half/full → one down.
// Built on PanResponder + Animated on purpose: no new native dependency, so it
// ships over the air.
import React, { useRef, useState, useCallback } from 'react';
import {
  Animated, PanResponder, StyleSheet, View, Dimensions, Pressable,
  type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';

export type SheetSnap = 'collapsed' | 'half' | 'full';

/** Spread onto the ScrollView inside renderFull so a pull-down at the top moves the sheet. */
export type SheetScrollProps = {
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle: number;
  bounces: boolean;
};

type Props = {
  snap: SheetSnap;
  onSnapChange: (snap: SheetSnap) => void;
  collapsedHeight: number;
  halfHeight: number;
  fullHeight?: number; // defaults to ~92% of screen height
  bottomInset?: number;
  // Collapsed defaults to solid white; pass an rgba string (e.g. an image-backed
  // Listing Detail wanting to see the photo through the card) to make only the
  // collapsed stage translucent. Half/full are always solid — they're where
  // scrollable text needs to stay legible regardless of what's behind them.
  collapsedBackgroundColor?: string;
  renderCollapsed: () => React.ReactNode;
  renderHalf?: () => React.ReactNode;
  renderFull?: (scrollProps: SheetScrollProps) => React.ReactNode;
};

const { height: SCREEN_H } = Dimensions.get('window');
const VELOCITY_THRESH = 0.5;
const ORDER: SheetSnap[] = ['collapsed', 'half', 'full'];

/** A move counts as a sheet drag once it is clearly vertical. */
function isVerticalDrag(dx: number, dy: number): boolean {
  return Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx) * 1.2;
}

export function DraggableSheet({
  snap, onSnapChange, collapsedHeight, halfHeight, fullHeight = SCREEN_H * 0.92,
  bottomInset = 0, collapsedBackgroundColor = '#FFFFFF', renderCollapsed, renderHalf, renderFull,
}: Props) {
  const heights: Record<SheetSnap, number> = { collapsed: collapsedHeight, half: halfHeight, full: fullHeight };
  const order = ORDER.filter((s) => s === 'collapsed' || (s === 'half' ? !!renderHalf : !!renderFull));

  // Current animated height of the sheet (drives the container's actual size,
  // not a translateY — simpler to reason about with content that changes
  // per snap point).
  const height = useRef(new Animated.Value(heights[snap])).current;
  const dragStartHeight = useRef(heights[snap]);
  const [renderedSnap, setRenderedSnap] = useState<SheetSnap>(snap);

  // Everything the once-created PanResponder reads, refreshed every render.
  const live = useRef({ snap: renderedSnap, heights, order, scrollY: 0, onSnapChange });
  live.current.snap = renderedSnap;
  live.current.heights = heights;
  live.current.order = order;
  live.current.onSnapChange = onSnapChange;

  const animateTo = useCallback((target: SheetSnap) => {
    live.current.snap = target;
    setRenderedSnap(target);
    Animated.spring(height, {
      toValue: live.current.heights[target], bounciness: 4, speed: 14, useNativeDriver: false,
    }).start();
    live.current.onSnapChange(target);
  }, [height]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponderCapture: (_, gs) => {
        if (!isVerticalDrag(gs.dx, gs.dy)) return false;
        const { snap: current, scrollY } = live.current;
        // In full the content scrolls; only a pull down from its top is ours.
        if (current === 'full') return gs.dy > 0 && scrollY <= 0;
        return true;
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        height.stopAnimation();
        dragStartHeight.current = live.current.heights[live.current.snap];
      },
      onPanResponderMove: (_, gs) => {
        const { heights: h } = live.current;
        const next = dragStartHeight.current - gs.dy;
        height.setValue(Math.max(h.collapsed * 0.6, Math.min(h.full, next)));
      },
      onPanResponderRelease: (_, gs) => {
        const { heights: h, order: o, snap: current } = live.current;
        const resting = dragStartHeight.current - gs.dy;
        const idx = o.indexOf(current);

        let target: SheetSnap;
        if (gs.vy < -VELOCITY_THRESH && idx < o.length - 1) target = o[idx + 1];
        else if (gs.vy > VELOCITY_THRESH && idx > 0) target = o[idx - 1];
        else {
          // Snap to whichever defined height is nearest the drag's resting point.
          target = o.reduce((closest, s) =>
            Math.abs(h[s] - resting) < Math.abs(h[closest] - resting) ? s : closest, o[0]);
        }
        animateTo(target);
      },
      onPanResponderTerminate: () => animateTo(live.current.snap),
    }),
  ).current;

  // External snap changes (e.g. tapping "Make Offer" scrolls to collapsed), and
  // re-settle to the current snap's height if that height itself changes (e.g.
  // Listing Detail measuring its collapsed content after first paint).
  React.useEffect(() => {
    animateTo(snap);
  }, [snap, collapsedHeight, halfHeight, fullHeight]); // eslint-disable-line react-hooks/exhaustive-deps

  const onHandlePress = () => {
    const idx = order.indexOf(renderedSnap);
    animateTo(renderedSnap === 'collapsed' ? order[Math.min(1, order.length - 1)] : order[Math.max(0, idx - 1)]);
  };

  const scrollProps: SheetScrollProps = {
    onScroll: (e) => { live.current.scrollY = e.nativeEvent.contentOffset.y; },
    scrollEventThrottle: 16,
    // A bounce at the top would eat the pull-down that should move the sheet.
    bounces: false,
  };

  const content = renderedSnap === 'full' && renderFull ? renderFull(scrollProps)
    : renderedSnap === 'half' && renderHalf ? renderHalf()
    : renderCollapsed();

  const backgroundColor = renderedSnap === 'collapsed' ? collapsedBackgroundColor : '#FFFFFF';

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[styles.sheet, { height, paddingBottom: bottomInset, backgroundColor }]}
    >
      <Pressable
        onPress={onHandlePress}
        style={styles.handleZone}
        hitSlop={{ left: 40, right: 40 }}
        accessibilityRole="button"
        accessibilityLabel={renderedSnap === 'collapsed' ? 'Show more details' : 'Show less'}
      >
        <View style={styles.handle} />
      </Pressable>
      <View style={styles.body}>{content}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 15,
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.12, shadowRadius: 16,
    elevation: 20, overflow: 'hidden',
  },
  // 32pt tall (plus the side hitSlop) instead of 20: the handle is now a tap
  // target as well as the obvious place to grab.
  handleZone: { alignItems: 'center', justifyContent: 'center', height: 32, alignSelf: 'center', width: 120 },
  handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: '#B8C4D9' },
  body: { flex: 1, paddingHorizontal: 20 },
});
