import React, { useState, useRef, useEffect } from 'react';
import { ScrollView, View, type StyleProp, type ViewStyle, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, runOnJS } from 'react-native-reanimated';

// Item pitch: qaItem width (68) + quickRow gap (8) — see index.tsx styles.
// Kept as a prop so this stays reusable if that layout ever changes.
export type DraggableItem = { id: string };

function DraggableCell<T extends DraggableItem>({
  item, pitch, onDrop, onPress, onDragStart, onDragEnd, renderItem,
}: {
  item: T;
  pitch: number;
  onDrop: (id: string, shift: number) => void;
  onPress: (item: T) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  renderItem: (item: T) => React.ReactNode;
}) {
  const translateX = useSharedValue(0);
  const scale = useSharedValue(1);
  const zIndex = useSharedValue(0);

  const pan = Gesture.Pan()
    .activateAfterLongPress(250)
    .onStart(() => {
      scale.value = withSpring(1.08);
      zIndex.value = 10;
      runOnJS(onDragStart)();
    })
    .onUpdate((e) => {
      translateX.value = e.translationX;
    })
    .onEnd((e) => {
      const shift = Math.round(e.translationX / pitch);
      translateX.value = withSpring(0);
      scale.value = withSpring(1);
      zIndex.value = 0;
      runOnJS(onDrop)(item.id, shift);
      runOnJS(onDragEnd)();
    });

  const tap = Gesture.Tap()
    .maxDuration(200)
    .onEnd(() => runOnJS(onPress)(item));

  // Race: a quick release resolves as a tap; holding past the tap window
  // (and the long-press threshold) lets the pan gesture take over as a drag.
  const composed = Gesture.Race(tap, pan);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { scale: scale.value }],
    zIndex: zIndex.value,
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={style}>
        {renderItem(item)}
      </Animated.View>
    </GestureDetector>
  );
}

export function DraggableQuickActions<T extends DraggableItem>({
  items,
  pitch,
  onReorder,
  onPressItem,
  renderItem,
  contentContainerStyle,
  style,
}: {
  items: T[];
  pitch: number;
  onReorder: (next: T[]) => void;
  onPressItem: (item: T) => void;
  renderItem: (item: T) => React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
}) {
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [containerWidth, setContainerWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const hintPlayed = useRef(false);

  const hasOverflow = contentWidth > containerWidth + 1;

  // Nudge scroll on every mount (screen focus / app launch), so a row with
  // more items than fit on screen doesn't read as "that's all of them."
  useEffect(() => {
    if (!hasOverflow || hintPlayed.current) return;
    hintPlayed.current = true;
    const t1 = setTimeout(() => {
      scrollRef.current?.scrollTo({ x: 40, animated: true });
      setTimeout(() => scrollRef.current?.scrollTo({ x: 0, animated: true }), 350);
    }, 400);
    return () => clearTimeout(t1);
  }, [hasOverflow]);

  const handleDrop = (id: string, shift: number) => {
    if (shift === 0) return;
    const currentIndex = items.findIndex(i => i.id === id);
    if (currentIndex === -1) return;
    const newIndex = Math.max(0, Math.min(items.length - 1, currentIndex + shift));
    if (newIndex === currentIndex) return;
    const next = [...items];
    const [moved] = next.splice(currentIndex, 1);
    next.splice(newIndex, 0, moved);
    onReorder(next);
  };

  return (
    <View style={style}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEnabled={scrollEnabled}
        contentContainerStyle={contentContainerStyle}
        onLayout={(e: LayoutChangeEvent) => setContainerWidth(e.nativeEvent.layout.width)}
        onContentSizeChange={(w: number) => setContentWidth(w)}
      >
        {items.map(item => (
          <DraggableCell
            key={item.id}
            item={item}
            pitch={pitch}
            onDrop={handleDrop}
            onPress={onPressItem}
            onDragStart={() => setScrollEnabled(false)}
            onDragEnd={() => setScrollEnabled(true)}
            renderItem={renderItem}
          />
        ))}
      </ScrollView>
    </View>
  );
}
