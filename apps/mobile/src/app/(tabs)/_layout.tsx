import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { SlideMenuProvider } from '@/components/SlideMenu';
import { TAB_BAR_HEIGHT, TAB_BAR_MIN_GAP } from '@/constants/tabBar';
import { colors } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';

const ACTIVE = colors.navy;
const MUTED  = colors.textSub;

/**
 * The visible tabs, in bar order. Routes not listed here (the `href: null`
 * screens below) never render a cell.
 */
const TABS: { name: string; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { name: 'index',  label: 'Home',    icon: 'home' },
  { name: 'nearby', label: 'Nearby',  icon: 'location' },
  { name: 'games',  label: 'Events',  icon: 'calendar' },
  { name: 'finder', label: 'Partner', icon: 'people' },
  { name: 'profile', label: 'Profile', icon: 'person' },
];

/**
 * Custom floating tab bar. Replaces the built-in one so the active pill can wrap
 * both icon and label — the default bar sizes its icon slot independently and
 * clipped the taller pill.
 */
function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  // Partner Finder is a full-bleed swipe deck — the bar would sit on top of the
  // cards. The screen's own close button is the way out.
  if (state.routes[state.index]?.name === 'finder') return null;

  return (
    <View style={[s.bar, { bottom: Math.max(insets.bottom, TAB_BAR_MIN_GAP) }]}>
      {state.routes.map((route, index) => {
        const tab = TABS.find((t) => t.name === route.name);
        if (!tab) return null;

        const focused = state.index === index;
        const color = focused ? ACTIVE : MUTED;

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name as never);
          }
        };

        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={focused ? { selected: true } : {}}
            accessibilityLabel={tab.label}
            onPress={onPress}
            style={s.cell}
          >
            <View style={[s.pill, focused && s.pillActive]}>
              <Ionicons
                name={focused ? tab.icon : (`${tab.icon}-outline` as keyof typeof Ionicons.glyphMap)}
                size={23}
                color={color}
              />
              <Text numberOfLines={1} style={[s.label, { color }, focused && s.labelActive]}>
                {tab.label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabLayout() {
  return (
    <SlideMenuProvider>
      <Tabs
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{ headerShown: false }}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="nearby" />
        <Tabs.Screen name="games" />
        <Tabs.Screen name="finder" />
        <Tabs.Screen name="profile" />
        {/* Hidden routes */}
        <Tabs.Screen name="partner"     options={{ href: null }} />
        <Tabs.Screen name="marketplace" options={{ href: null }} />
        <Tabs.Screen name="chat"        options={{ href: null }} />
        <Tabs.Screen name="stats"       options={{ href: null }} />
        <Tabs.Screen name="tournaments" options={{ href: null }} />
        <Tabs.Screen name="landing"     options={{ href: null }} />
      </Tabs>
    </SlideMenuProvider>
  );
}

const s = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 12,
    right: 12,
    height: TAB_BAR_HEIGHT,
    borderRadius: TAB_BAR_HEIGHT / 2,
    backgroundColor: colors.bg,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    elevation: 8,
    shadowColor: '#0A1228',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
  },
  cell: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pill: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    paddingVertical: 7,
    borderRadius: shape.pill,
  },
  pillActive: { backgroundColor: colors.page },
  label: { fontSize: text.caption.size, fontWeight: '500', marginTop: 3 },
  labelActive: { fontWeight: '700' },
});
