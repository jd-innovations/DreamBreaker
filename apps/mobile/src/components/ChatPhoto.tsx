import React, { useState } from 'react';
import { Image, Pressable } from 'react-native';
import type { StyleProp, ImageStyle } from 'react-native';
import { clampAspect } from '@/lib/photoViewer';

// ─── Chat photo sizing ────────────────────────────────────────────────────────
//
// Chat photos used to be forced SQUARES — SW*0.55 in conversations, a hardcoded
// 200 in support threads — so every portrait shot arrived centre-cropped: the
// one shape a phone screenshot is least likely to be. A bubble now takes the
// photo's own aspect ratio, clamped.
//
// Tighter bounds than the group feed's 0.85-2.2. A bubble is ~206pt wide on a
// 375pt screen, so 0.74 draws about 279pt tall and 1.7 about 121pt: readable at
// a glance without pushing the rest of the conversation off screen. Shapes
// outside the range are still cropped here and whole in the viewer, which
// renders `contain`.
const MIN_CHAT_ASPECT = 0.74;
const MAX_CHAT_ASPECT = 1.7;
const DEFAULT_CHAT_ASPECT = 1;

export type ChatPhotoProps = {
  uri: string;
  /** Must NOT set a height — aspectRatio supplies it once the image loads. */
  style: StyleProp<ImageStyle>;
  /**
   * Omit when the enclosing bubble already handles touches (conversations put
   * onLongPress-to-react there, and nesting a pressable inside it would make
   * the two compete, differently on Android). Pass it where the bubble is an
   * inert View, as in support threads.
   */
  onPress?: () => void;
  accessibilityLabel?: string;
};

/**
 * A photo inside a chat bubble, sized to its own shape.
 *
 * A component rather than a helper because each message needs its own measured
 * aspect ratio and messages render in a map, so the state cannot live in the
 * screen.
 */
export function ChatPhoto({ uri, style, onPress, accessibilityLabel }: ChatPhotoProps) {
  const [aspect, setAspect] = useState(DEFAULT_CHAT_ASPECT);

  const image = (
    <Image
      source={{ uri }}
      style={[style, { aspectRatio: aspect }]}
      resizeMode="cover"
      onLoad={(e) => {
        const src = e.nativeEvent.source;
        if (src?.width && src?.height) {
          setAspect(clampAspect(src.width / src.height, MIN_CHAT_ASPECT, MAX_CHAT_ASPECT, DEFAULT_CHAT_ASPECT));
        }
      }}
    />
  );

  if (!onPress) return image;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="imagebutton"
      accessibilityLabel={accessibilityLabel ?? 'Open photo full screen'}
    >
      {image}
    </Pressable>
  );
}

export default ChatPhoto;
