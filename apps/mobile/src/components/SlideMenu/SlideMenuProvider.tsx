import React, { createContext, useCallback, useContext, useState } from 'react';
import { Dimensions, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { useUnreadCounts } from '@/hooks/useUnreadCounts';
import { useQuickActionsOrder } from '@/hooks/useQuickActionsOrder';
import { QUICK_ACTIONS } from '@/constants/quickActions';
import { isFeatureEnabled, type FeatureKey } from '@/lib/featureFlags';
import { AppIcon } from '@/components/AppIcon';
import { haptics } from '@/lib/haptics';

const LOGO = require('../../../assets/images/pba-logo-cropped.png');

const { width: SCREEN_W } = Dimensions.get('window');
const PANEL_WIDTH = Math.min(400, SCREEN_W * 0.94);

type IconName = keyof typeof Ionicons.glyphMap;

type NavItem = { label: string; icon: IconName; href: string; feature?: FeatureKey };

const PRIMARY_NAV: NavItem[] = [
  { label: 'Home', icon: 'home', href: '/(tabs)' },
  { label: 'Nearby', icon: 'location', href: '/(tabs)/nearby' },
  { label: 'Events', icon: 'calendar', href: '/(tabs)/games' },
  { label: 'Groups', icon: 'people', href: '/(tabs)/partner' },
  { label: 'Partner Finder', icon: 'person-add', href: '/(tabs)/finder' },
];

// Entries carrying a `feature` key only render where that feature is in this
// build's beta scope (see BETA_SCOPE.md).
const ALL_MORE_NAV: NavItem[] = [
  { label: 'Profile', icon: 'person-outline', href: '/(tabs)/profile' },
  { label: 'Marketplace', icon: 'storefront-outline', href: '/(tabs)/marketplace' },
  { label: 'Chat', icon: 'chatbubble-outline', href: '/(tabs)/chat' },
  { label: 'Tournaments', icon: 'trophy-outline', href: '/(tabs)/tournaments' },
  { label: 'Stats', icon: 'stats-chart-outline', href: '/(tabs)/stats', feature: 'myStats' },
];

const MORE_NAV: NavItem[] = ALL_MORE_NAV.filter(
  (item) => !item.feature || isFeatureEnabled(item.feature)
);

type AccordionItem = { label: string; href: string };
type AccordionSection = { id: string; label: string; icon: IconName; items: AccordionItem[] };

const ACCORDION_SECTIONS: AccordionSection[] = [
  {
    id: 'help',
    label: 'Help & Support',
    icon: 'help-circle-outline',
    items: [{ label: 'Help Center', href: '/help-support' }],
  },
  {
    id: 'settings',
    label: 'Settings & Privacy',
    icon: 'settings-outline',
    items: [
      { label: 'Account Settings', href: '/account-settings' },
      { label: 'Notifications', href: '/notifications-settings' },
      { label: 'Payments', href: '/payments-settings' },
      { label: 'Membership', href: '/membership-settings' },
      { label: 'Location', href: '/location-settings' },
      { label: 'Communication', href: '/communication-settings' },
      { label: 'Permissions', href: '/permissions-settings' },
      { label: 'Rating', href: '/rating-settings' },
    ],
  },
];

export type RecentItem = { id: string; label: string; subtitle?: string; href: string };

type SlideMenuContextValue = {
  open: () => void;
  close: () => void;
  isOpen: boolean;
  setRecentItems: (items: RecentItem[]) => void;
  // Lets a screen disable the edge swipe-to-open gesture while focused, so its
  // own horizontal gestures (e.g. Partner Finder / Marketplace card swipes,
  // which use RN PanResponder) aren't hijacked by the menu's RNGH pan.
  setSwipeEnabled: (enabled: boolean) => void;
  // Lets a full-screen immersive screen (e.g. Partner Finder) hide the floating
  // hamburger trigger while focused so it doesn't distract or collide with the
  // screen's own top controls. Restored on blur.
  setTriggerVisible: (visible: boolean) => void;
};

const SlideMenuContext = createContext<SlideMenuContextValue | null>(null);

/**
 * A no-op menu, used when a consumer renders outside the provider.
 *
 * This used to `throw`. That looked like good hygiene and was in fact a
 * crash generator: SlideMenuProvider is mounted only in `(tabs)/_layout.tsx`,
 * eight tab screens call this hook, and sixteen places OUTSIDE `(tabs)`
 * navigate into them (`grep "push('/(tabs)/"`). Whenever such a navigation
 * renders the screen without the tab layout, the throw happened during render
 * and took the whole app down.
 *
 * NOT prompted by a confirmed crash. It was found while investigating one —
 * a production crash on "Find Partner" during tournament registration, which
 * is `router.push('/(tabs)/finder')` from a root-stack route. That crash turned
 * out to be EXC_BAD_ACCESS inside Hermes, a native fault, not this throw. The
 * hazard here is real and separate: it is latent, and worth removing on its own
 * terms rather than because it explained that particular crash.
 *
 * Degrading is the right behaviour. A screen rendered outside the menu simply
 * has no menu; the edge-swipe and the floating trigger belong to a chrome that
 * is not on screen, so doing nothing is correct rather than merely safe. What
 * is NOT correct is killing the app over missing chrome.
 */
const NOOP_MENU: SlideMenuContextValue = {
  open: () => {},
  close: () => {},
  isOpen: false,
  setRecentItems: () => {},
  setSwipeEnabled: () => {},
  setTriggerVisible: () => {},
};

export function useSlideMenu() {
  const ctx = useContext(SlideMenuContext);
  if (!ctx) {
    // Still visible while developing — the navigation that led here is usually
    // worth fixing too — but never fatal.
    if (__DEV__) {
      console.warn(
        '[SlideMenu] useSlideMenu() called outside SlideMenuProvider. Falling back ' +
          'to a no-op menu. This screen was probably reached by pushing a (tabs) ' +
          'route from outside the tab layout.',
      );
    }
    return NOOP_MENU;
  }
  return ctx;
}

function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{count > 9 ? '9+' : count}</Text>
    </View>
  );
}

export function SlideMenuProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { unreadNotifications } = useUnreadCounts();
  const { items: quickActions } = useQuickActionsOrder(QUICK_ACTIONS);
  const [isOpen, setIsOpen] = useState(false);
  const [swipeEnabled, setSwipeEnabled] = useState(true);
  const [triggerVisible, setTriggerVisible] = useState(true);
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);
  const [showMore, setShowMore] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const progress = useSharedValue(0); // 0 = closed, 1 = open

  const open = useCallback(() => {
    haptics.light();
    setIsOpen(true);
    progress.value = withSpring(1, { damping: 22, stiffness: 210 });
  }, [progress]);

  const close = useCallback(() => {
    progress.value = withTiming(0, { duration: 220 }, (finished) => {
      if (finished) runOnJS(setIsOpen)(false);
    });
  }, [progress]);

  const navigate = useCallback(
    (href: string) => {
      close();
      router.push(href as never);
    },
    [close, router]
  );

  const toggleSection = useCallback((id: string) => {
    setExpandedSection((current) => (current === id ? null : id));
  }, []);

  const pan = Gesture.Pan()
    // Disabled while a screen opts out (keeps the pan active when the menu is
    // already open so swipe-to-close still works).
    .enabled(swipeEnabled || isOpen)
    .activeOffsetX([-15, 15])
    .onUpdate((e) => {
      const next = isOpen ? 1 + e.translationX / PANEL_WIDTH : e.translationX / PANEL_WIDTH;
      progress.value = Math.min(1, Math.max(0, next));
    })
    .onEnd((e) => {
      const shouldOpen = progress.value > 0.5 || e.velocityX > 500;
      if (shouldOpen) {
        runOnJS(setIsOpen)(true);
        progress.value = withSpring(1, { damping: 22, stiffness: 210 });
      } else {
        progress.value = withTiming(0, { duration: 220 }, (finished) => {
          if (finished) runOnJS(setIsOpen)(false);
        });
      }
    });

  const backgroundStyle = useAnimatedStyle(() => {
    const scale = interpolate(progress.value, [0, 1], [1, 0.88], Extrapolation.CLAMP);
    const translateX = interpolate(progress.value, [0, 1], [0, PANEL_WIDTH * 0.86], Extrapolation.CLAMP);
    const borderRadiusValue = interpolate(progress.value, [0, 1], [0, 24], Extrapolation.CLAMP);
    return {
      transform: [{ translateX }, { scale }],
      borderRadius: borderRadiusValue,
    };
  });

  const panelStyle = useAnimatedStyle(() => {
    const translateX = interpolate(progress.value, [0, 1], [-PANEL_WIDTH, 0], Extrapolation.CLAMP);
    return { transform: [{ translateX }] };
  });

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1], Extrapolation.CLAMP),
  }));

  return (
    <SlideMenuContext.Provider value={{ open, close, isOpen, setRecentItems, setSwipeEnabled, setTriggerVisible }}>
      <GestureDetector gesture={pan}>
        <View style={StyleSheet.absoluteFill}>
          <Animated.View style={[styles.background, backgroundStyle]}>
            {children}
            {isOpen && (
              <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}>
                <Pressable style={StyleSheet.absoluteFill} onPress={close} />
              </Animated.View>
            )}
          </Animated.View>

          {!isOpen && triggerVisible && (
            // top matches AppHeader's `paddingTop: insets.top + 4` so this
            // icon's vertical center lines up with the header's icon row.
            <Pressable onPress={open} hitSlop={12} style={[styles.trigger, { top: insets.top + 4 }]}>
              <Ionicons name="menu" size={32} color={colors.text} />
            </Pressable>
          )}

          <Animated.View style={[styles.panel, { width: PANEL_WIDTH }, panelStyle]}>
            <BlurView intensity={50} tint="light" style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, styles.panelTint]} />
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                paddingTop: insets.top + spacing.md,
                paddingBottom: spacing.xxl,
              }}
            >
              {/* Header: logo + notifications */}
              <View style={styles.profileRow}>
                <Image source={LOGO} style={styles.logo} resizeMode="contain" />
                <Pressable
                  hitSlop={8}
                  style={styles.iconBtn}
                  onPress={() => navigate('/invites')}
                >
                  <Ionicons name="notifications-outline" size={34} color={colors.white} />
                  <CountBadge count={unreadNotifications} />
                </Pressable>
              </View>

              {/* Shortcuts — mirrors the Home screen's Quick Actions row, same data + order */}
              <Text style={styles.sectionHeader}>QUICK ACTIONS</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.shortcutsRow}
              >
                {quickActions.map((item) => (
                  <Pressable
                    key={item.id}
                    disabled={!item.route}
                    onPress={() => item.route && navigate(item.route)}
                    style={({ pressed }) => [styles.shortcutTile, pressed && { opacity: 0.7 }]}
                  >
                    <View style={[styles.shortcutIcon, item.active && styles.shortcutIconActive]}>
                      <AppIcon name={item.icon} size={26} color={item.active ? colors.gold : colors.white} />
                    </View>
                    <Text style={styles.shortcutLabel} numberOfLines={2}>
                      {item.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              <View style={styles.divider} />

              {/* Primary nav */}
              <View style={styles.section}>
                {PRIMARY_NAV.map((item) => (
                  <Pressable
                    key={item.href}
                    onPress={() => navigate(item.href)}
                    style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                  >
                    <Ionicons name={item.icon} size={24} color={colors.gold} style={styles.rowIcon} />
                    <Text style={styles.rowLabel}>{item.label}</Text>
                  </Pressable>
                ))}

                {showMore &&
                  MORE_NAV.map((item) => (
                    <Pressable
                      key={item.href}
                      onPress={() => navigate(item.href)}
                      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                    >
                      <Ionicons name={item.icon} size={24} color={colors.gold} style={styles.rowIcon} />
                      <Text style={styles.rowLabel}>{item.label}</Text>
                    </Pressable>
                  ))}

                <Pressable
                  onPress={() => setShowMore((v) => !v)}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                >
                  <View style={styles.seeMoreIcon}>
                    <Ionicons name={showMore ? 'chevron-up' : 'chevron-down'} size={18} color={colors.navy} />
                  </View>
                  <Text style={styles.rowLabel}>{showMore ? 'See less' : 'See more'}</Text>
                </Pressable>
              </View>

              {/* Recents */}
              <Text style={styles.sectionHeader}>RECENTS</Text>
              <View style={styles.section}>
                {recentItems.length === 0 ? (
                  <Text style={styles.emptyText}>No recent activity</Text>
                ) : (
                  recentItems.map((item) => (
                    <Pressable
                      key={item.id}
                      onPress={() => navigate(item.href)}
                      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowLabel} numberOfLines={1}>
                          {item.label}
                        </Text>
                        {item.subtitle ? (
                          <Text style={styles.rowSubtitle} numberOfLines={1}>
                            {item.subtitle}
                          </Text>
                        ) : null}
                      </View>
                    </Pressable>
                  ))
                )}
              </View>

              <View style={styles.divider} />

              {/* Collapsible account sections */}
              <View style={styles.section}>
                {ACCORDION_SECTIONS.map((section) => {
                  const expanded = expandedSection === section.id;
                  return (
                    <View key={section.id}>
                      <Pressable
                        onPress={() => toggleSection(section.id)}
                        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                      >
                        <Ionicons name={section.icon} size={24} color={colors.gold} style={styles.rowIcon} />
                        <Text style={[styles.rowLabel, { flex: 1 }]}>{section.label}</Text>
                        <Ionicons
                          name={expanded ? 'chevron-up' : 'chevron-down'}
                          size={18}
                          color={colors.textSub}
                        />
                      </Pressable>
                      {expanded &&
                        section.items.map((sub) => (
                          <Pressable
                            key={sub.href}
                            onPress={() => navigate(sub.href)}
                            style={({ pressed }) => [styles.subRow, pressed && styles.rowPressed]}
                          >
                            <Text style={styles.subRowLabel}>{sub.label}</Text>
                          </Pressable>
                        ))}
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </Animated.View>
        </View>
      </GestureDetector>
    </SlideMenuContext.Provider>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: colors.bg,
    overflow: 'hidden',
  },
  scrim: {
    backgroundColor: 'rgba(10,18,40,0.35)',
  },
  trigger: {
    position: 'absolute',
    left: spacing.lg,
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
  },
  panelTint: {
    backgroundColor: 'rgba(10,18,40,0.45)',
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  logo: {
    width: 200,
    height: 40,
  },
  iconBtn: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    marginBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  sectionHeader: {
    color: colors.textSub,
    fontSize: text.sectionLabel.size,
    fontWeight: '800',
    letterSpacing: text.sectionLabel.letterSpacing,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  shortcutsRow: {
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
    marginBottom: spacing.xxl,
  },
  shortcutTile: {
    width: 76,
    alignItems: 'center',
  },
  shortcutIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  shortcutIconActive: {
    borderColor: colors.gold,
    backgroundColor: colors.goldBg,
  },
  shortcutLabel: {
    color: colors.white,
    textAlign: 'center',
    fontSize: text.caption.size, fontWeight: '500',
    lineHeight: 17,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    borderRadius: shape.cta,
    paddingHorizontal: spacing.sm,
  },
  rowPressed: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  rowIcon: {
    marginRight: spacing.lg,
  },
  rowLabel: {
    color: colors.white,
    fontSize: text.body.size,
    fontWeight: '500',
  },
  rowSubtitle: {
    color: colors.textSub,
    fontSize: text.caption.size, fontWeight: '500',
    marginTop: 3,
  },
  emptyText: {
    color: colors.textSub,
    fontSize: text.caption.size, fontWeight: '500',
    paddingHorizontal: spacing.sm,
  },
  seeMoreIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.lg,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  subRow: {
    paddingVertical: spacing.md,
    paddingLeft: spacing.lg + 24 + spacing.lg,
    paddingRight: spacing.sm,
    borderRadius: shape.cta,
  },
  subRowLabel: {
    color: colors.textSub,
    fontSize: text.body.size, fontWeight: '500',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: shape.badge,
    paddingHorizontal: 3,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.navy,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
});

