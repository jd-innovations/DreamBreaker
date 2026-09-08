// Three-snap-point (collapsed/half/full) draggable bottom sheet. Every sheet in
// the app so far (marketplace.tsx's FilterSheet/ReportSheet, nearby.tsx's
// FacilityBottomSheet) is a single-position slide-up panel built by hand with
// an Animated.Value + PanResponder; this generalizes that same primitive to
// three drag-snappable heights for Marketplace Listing Detail, which is the
// first screen that needs progressive disclosure rather than open/closed.
import React, { useRef, useState, useCallback } from 'react';
import { Animated, PanResponder, StyleSheet, View, Dimensions } from 'react-native';

export type SheetSnap = 'collapsed' | 'half' | 'full';

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
  renderFull?: () => React.ReactNode;
};

const { height: SCREEN_H } = Dimensions.get('window');
const VELOCITY_THRESH = 0.5;

export function DraggableSheet({
  snap, onSnapChange, collapsedHeight, halfHeight, fullHeight = SCREEN_H * 0.92,
  bottomInset = 0, collapsedBackgroundColor = '#FFFFFF', renderCollapsed, renderHalf, renderFull,
}: Props) {
  const heights: Record<SheetSnap, number> = { collapsed: collapsedHeight, half: halfHeight, full: fullHeight };
  const order: SheetSnap[] = ['collapsed', 'half', 'full'];

  // Current animated height of the sheet (drives the container's actual size,
  // not a translateY — simpler to reason about with content that changes
  // per snap point).
  const height = useRef(new Animated.Value(heights[snap])).current;
  const dragStartHeight = useRef(heights[snap]);
  const [renderedSnap, setRenderedSnap] = useState<SheetSnap>(snap);

  const animateTo = useCallback((target: SheetSnap) => {
    setRenderedSnap(target);
    Animated.spring(height, { toValue: heights[target], bounciness: 4, speed: 14, useNativeDriver: false }).start();
    onSnapChange(target);
  }, [height, onSnapChange, heights]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > 6,
      onPanResponderGrant: () => {
        dragStartHeight.current = heights[renderedSnap];
      },
      onPanResponderMove: (_, gs) => {
        const next = dragStartHeight.current - gs.dy;
        height.setValue(Math.max(heights.collapsed * 0.6, Math.min(heights.full, next)));
      },
      onPanResponderRelease: (_, gs) => {
        const current = dragStartHeight.current - gs.dy;
        const idx = order.indexOf(renderedSnap);

        let target: SheetSnap;
        if (gs.vy < -VELOCITY_THRESH && idx < order.length - 1) target = order[idx + 1];
        else if (gs.vy > VELOCITY_THRESH && idx > 0) target = order[idx - 1];
        else {
          // Snap to whichever defined height is nearest the drag's resting point.
          target = order.reduce((closest, s) =>
            Math.abs(heights[s] - current) < Math.abs(heights[closest] - current) ? s : closest,
            order[0]);
        }
        animateTo(target);
      },
    }),
  ).current;

  // External snap changes (e.g. tapping "Make Offer" scrolls to collapsed), and
  // re-settle to the current snap's height if that height itself changes (e.g.
  // Listing Detail measuring its collapsed content after first paint).
  React.useEffect(() => {
    animateTo(snap);
  }, [snap, collapsedHeight, halfHeight, fullHeight]); // eslint-disable-line react-hooks/exhaustive-deps

  const content = renderedSnap === 'full' && renderFull ? renderFull()
    : renderedSnap === 'half' && renderHalf ? renderHalf()
    : renderCollapsed();

  const backgroundColor = renderedSnap === 'collapsed' ? collapsedBackgroundColor : '#FFFFFF';

  return (
    <Animated.View style={[styles.sheet, { height, paddingBottom: bottomInset, backgroundColor }]}>
      <View {...panResponder.panHandlers} style={styles.handleZone}>
        <View style={styles.handle} />
      </View>
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
  handleZone: { alignItems: 'center', paddingTop: 10, paddingBottom: 6 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E0E8F5' },
  body: { flex: 1, paddingHorizontal: 20 },
});
