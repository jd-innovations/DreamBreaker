import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors } from '@/theme';
import { useSession } from '@/hooks/useSession';
import {
  fetchStoryCategories,
  markStoryViewed,
  type StoryCategory,
  type StoryCategoryKey,
} from '@/lib/storyService';

export default function StoryViewerScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useSession();
  const { category: categoryKey } = useLocalSearchParams<{ category: StoryCategoryKey }>();

  const [category, setCategory] = useState<StoryCategory | null>(null);
  const [loading, setLoading] = useState(true);
  const [storyIndex, setStoryIndex] = useState(0);
  const [slideIndex, setSlideIndex] = useState(0);

  useEffect(() => {
    if (!user?.id || !categoryKey) return;
    let cancelled = false;
    (async () => {
      try {
        const categories = await fetchStoryCategories(user.id);
        if (cancelled) return;
        setCategory(categories.find((c) => c.key === categoryKey) ?? null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, categoryKey]);

  const stories = category?.stories ?? [];
  const story = stories[storyIndex];
  const slide = story?.slides[slideIndex];

  const advanceStory = useCallback((direction: 1 | -1) => {
    if (!user?.id || !story) return;
    if (direction === 1) markStoryViewed(story.id, user.id);
    setStoryIndex((i) => {
      const next = i + direction;
      if (next < 0) return i;
      if (next >= stories.length) {
        router.back();
        return i;
      }
      return next;
    });
    setSlideIndex(0);
  }, [user?.id, story, stories.length, router]);

  function handleTap(side: 'left' | 'right') {
    if (!story) return;
    if (side === 'right') {
      if (slideIndex < story.slides.length - 1) {
        setSlideIndex((i) => i + 1);
      } else {
        advanceStory(1);
      }
    } else {
      if (slideIndex > 0) {
        setSlideIndex((i) => i - 1);
      } else {
        advanceStory(-1);
      }
    }
  }

  function handleClose() {
    if (user?.id && story) markStoryViewed(story.id, user.id);
    router.back();
  }

  function handleCta() {
    if (!story?.ctaRoute) return;
    if (user?.id) markStoryViewed(story.id, user.id);
    router.push(story.ctaRoute as never);
  }

  if (loading) {
    return (
      <View style={[v.root, v.center]}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color={colors.gold} />
      </View>
    );
  }

  if (!story || !slide) {
    return (
      <View style={[v.root, v.center]}>
        <StatusBar style="light" />
        <Text style={v.headline}>Nothing to show here yet.</Text>
        <Pressable onPress={() => router.back()} style={[v.closeBtn, { top: insets.top + 12 }]}>
          <Ionicons name="close" size={28} color="#FFFFFF" />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={v.root}>
      <StatusBar style="light" />

      {/* Progress bars — one segment per slide in the current story. */}
      <View style={[v.progressRow, { top: insets.top + 10 }]}>
        {story.slides.map((_, i) => (
          <View key={i} style={v.progressTrack}>
            <View style={[v.progressFill, { opacity: i <= slideIndex ? 1 : 0.25 }]} />
          </View>
        ))}
      </View>

      <Pressable style={[v.closeBtn, { top: insets.top + 20 }]} onPress={handleClose} hitSlop={12}>
        <Ionicons name="close" size={28} color="#FFFFFF" />
      </Pressable>

      {/* Tap zones for prev/next — left third goes back, right two-thirds advances. */}
      <View style={v.tapZones} pointerEvents="box-none">
        <Pressable style={{ flex: 1 }} onPress={() => handleTap('left')} />
        <Pressable style={{ flex: 2 }} onPress={() => handleTap('right')} />
      </View>

      <View style={v.content}>
        {slide.subheadline && <Text style={v.subheadline}>{slide.subheadline}</Text>}
        <Text style={v.headline}>{slide.headline}</Text>
        {slide.body && <Text style={v.body}>{slide.body}</Text>}
        {slide.metadata && <Text style={v.metadata}>{slide.metadata}</Text>}
      </View>

      {story.ctaLabel && story.ctaRoute && (
        <Pressable style={[v.ctaBtn, { bottom: insets.bottom + 24 }]} onPress={handleCta}>
          <Text style={v.ctaText}>{story.ctaLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const v = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.navy },
  center: { alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 32 },
  progressRow: {
    position: 'absolute', left: 12, right: 12, flexDirection: 'row', gap: 6, zIndex: 10,
  },
  progressTrack: {
    flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden',
  },
  progressFill: { flex: 1, backgroundColor: colors.gold },
  closeBtn: { position: 'absolute', right: 16, zIndex: 10, padding: 4 },
  tapZones: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, flexDirection: 'row' },
  content: {
    flex: 1, alignItems: 'flex-start', justifyContent: 'center',
    paddingHorizontal: 28, gap: 14,
  },
  subheadline: { color: colors.gold, fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
  headline: { color: '#FFFFFF', fontSize: 32, fontWeight: '800', lineHeight: 38 },
  body: { color: 'rgba(255,255,255,0.85)', fontSize: 19, fontWeight: '500', lineHeight: 26 },
  metadata: { color: 'rgba(255,255,255,0.6)', fontSize: 16, fontWeight: '600' },
  ctaBtn: {
    position: 'absolute', left: 24, right: 24,
    backgroundColor: colors.gold, borderRadius: 16,
    paddingVertical: 16, alignItems: 'center',
  },
  ctaText: { color: colors.navy, fontSize: 17, fontWeight: '800' },
});
