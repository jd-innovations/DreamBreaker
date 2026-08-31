import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Alert, ActivityIndicator } from 'react-native';
import { Tabs, router, useFocusEffect } from 'expo-router';
import { useSlideMenu } from '@/components/SlideMenu';
import { useFinderCandidates, type FinderCandidate } from '@/lib/useFinderCandidates';
import { supabase } from '@/lib/supabase';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  Image,
  PanResponder,
  ScrollView,
  Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

const { width: SW, height: SH } = Dimensions.get('window');
const SHEET_HEIGHT  = 300;
const REPORT_HEIGHT = 430;
const SWIPE_THRESH  = SW * 0.34;
const VEL_THRESH    = 0.75;

const L = {
  bg:        '#FFFFFF',
  navy:      '#0A1228',
  gold:      '#C9A84C',
  text:      '#0A1228',
  textMuted: '#9AAABF',
  border:    '#E0E8F5',
  online:    '#34C759',
  danger:    '#E5343A',
};

const REPORT_REASONS = [
  { id: 'inappropriate', label: 'Inappropriate images',          icon: 'image-outline'       },
  { id: 'fake',          label: 'Fake or misleading profile',    icon: 'person-remove-outline'},
  { id: 'harassment',    label: 'Harassment or bullying',        icon: 'warning-outline'      },
  { id: 'spam',          label: 'Spam or bot activity',          icon: 'ban-outline'          },
  { id: 'other',         label: 'Other',                         icon: 'ellipsis-horizontal'  },
];

type Player = FinderCandidate;

// ─── Tag pill ─────────────────────────────────────────────────────────────────

function TagPill({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={tp.pill}>
      <Ionicons name={icon as never} size={12} color="rgba(255,255,255,0.85)" />
      <Text style={tp.label}>{label}</Text>
    </View>
  );
}
const tp = StyleSheet.create({
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  label: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },
});

// ─── Action button ────────────────────────────────────────────────────────────

function ActionBtn({ icon, label, onPress, filled }: {
  icon: string; label: string; onPress: () => void; filled: boolean;
}) {
  return (
    <TouchableOpacity style={ab.wrap} onPress={onPress} activeOpacity={0.75}>
      <View style={[ab.circle, filled && ab.circleFilled]}>
        <Ionicons name={icon as never} size={28} color={filled ? '#FFF' : label === 'Pass' ? '#9AAABF' : L.gold} />
      </View>
      <Text style={[ab.label, filled && ab.labelFilled]}>{label}</Text>
    </TouchableOpacity>
  );
}
const ab = StyleSheet.create({
  wrap:         { alignItems: 'center', gap: 8 },
  circle: {
    width: 70, height: 70, borderRadius: 35,
    backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#E0E8F5',
    alignItems: 'center', justifyContent: 'center',
  },
  circleFilled: { backgroundColor: L.gold, borderColor: L.gold },
  label:        { color: L.text, fontSize: 14, fontWeight: '600' },
  labelFilled:  { color: L.gold },
});

// ─── Main ─────────────────────────────────────────────────────────────────────

const MATCH_MENU = [
  { id: 'connections', icon: 'people-outline',     label: 'My Connections',      route: '/match/connections' },
  { id: 'saved',       icon: 'bookmark-outline',   label: 'Saved Players',       route: '/match/saved'       },
  { id: 'requests',    icon: 'person-add-outline', label: 'Match Requests',      route: '/match/requests'    },
  { id: 'prefs',       icon: 'options-outline',    label: 'Partner Preferences', route: '/match/preferences' },
];

export default function PartnerFinderScreen() {
  const insets = useSafeAreaInsets();
  const { setSwipeEnabled, setTriggerVisible } = useSlideMenu();

  // Suspend the SlideMenu's swipe-to-open while this screen is focused so its
  // RNGH pan doesn't hijack the card's PanResponder swipe, and hide the floating
  // hamburger trigger so it doesn't distract or collide with the card's own top
  // controls. Both restored on blur.
  useFocusEffect(
    useCallback(() => {
      setSwipeEnabled(false);
      setTriggerVisible(false);
      return () => {
        setSwipeEnabled(true);
        setTriggerVisible(true);
      };
    }, [setSwipeEnabled, setTriggerVisible]),
  );

  const [idx, setIdx]                   = useState(0);
  const [photoIdx, setPhotoIdx]         = useState(0);
  const [passedIds, setPassedIds]       = useState<string[]>([]);
  const [connectedIds, setConnectedIds] = useState<string[]>([]);
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuAnim = useRef(new Animated.Value(0)).current;

  const { candidates, loading } = useFinderCandidates();
  const player = candidates.length > 0 ? candidates[idx % candidates.length] : null;

  // Live count of mutual matches — powers the badge on the Connections icon.
  // Refreshed whenever the Finder regains focus (e.g. after a new match).
  const [matchCount, setMatchCount] = useState(0);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { count } = await supabase
          .from('partner_matches')
          .select('id', { count: 'exact', head: true })
          .or(`user_a.eq.${user.id},user_b.eq.${user.id}`);
        if (active) setMatchCount(count ?? 0);
      })();
      return () => { active = false; };
    }, []),
  );

  // Current user id — fetched once, used for persisting likes/saves
  const userIdRef = useRef<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { userIdRef.current = data.user?.id ?? null; });
  }, []);

  // Stale-closure guards for PanResponder
  const anySheetOpenRef = useRef(false);
  const playerRef       = useRef<Player | null>(null);
  playerRef.current     = player;

  // ── Animations ────────────────────────────────────────────────────────────
  const pulseScale   = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.8)).current;
  const swipeX       = useRef(new Animated.Value(0)).current;
  const swipeOpacity = useRef(new Animated.Value(0.9)).current;
  const cardX        = useRef(new Animated.Value(0)).current;

  const cardRotation = cardX.interpolate({
    inputRange: [-SW / 2, 0, SW / 2],
    outputRange: ['-8deg', '0deg', '8deg'],
    extrapolate: 'clamp',
  });
  const passOpacity = cardX.interpolate({
    inputRange: [-SW * 0.28, -50],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const connectOpacity = cardX.interpolate({
    inputRange: [50, SW * 0.28],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  // ── Persist like or save; on 'like' check for mutual match ───────────────
  const persistLike = (toId: string, kind: 'like' | 'save', playerName: string) => {
    const fromId = userIdRef.current;
    if (!fromId) return;
    supabase
      .from('partner_likes')
      .upsert({ from_user_id: fromId, to_user_id: toId, kind })
      .then(({ error }) => {
        // supabase-js resolves on a database error rather than rejecting, so
        // without this the match lookup below runs as though the like landed.
        // Reachable since the blocking triggers (20260831050000).
        if (error) return;
        if (kind !== 'like') return;
        const a = fromId < toId ? fromId : toId;
        const b = fromId < toId ? toId   : fromId;
        supabase
          .from('partner_matches')
          .select('id')
          .eq('user_a', a)
          .eq('user_b', b)
          .maybeSingle()
          .then(({ data }) => {
            if (data) {
              Alert.alert("It's a Match!", `You and ${playerName} liked each other.`);
            }
          });
      });
  };

  // ── Swipe out ─────────────────────────────────────────────────────────────
  const swipeOut = (direction: 'left' | 'right') => {
    const p = playerRef.current;
    if (!p) return;
    Animated.timing(cardX, {
      toValue: direction === 'left' ? -SW * 1.5 : SW * 1.5,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      if (direction === 'left') {
        setPassedIds(prev => [...prev, p.id]);
      } else {
        setConnectedIds(prev => [...prev, p.id]);
        persistLike(p.id, 'like', p.name);
      }
      cardX.setValue(0);
      setIdx(i => i + 1);
      setPhotoIdx(0);
    });
  };

  // ── PanResponder ──────────────────────────────────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) =>
        !anySheetOpenRef.current &&
        Math.abs(gs.dx) > 8 &&
        Math.abs(gs.dx) > Math.abs(gs.dy),
      onPanResponderMove: (_, gs) => { cardX.setValue(gs.dx); },
      onPanResponderRelease: (_, gs) => {
        const { dx, vx } = gs;
        if      (dx < -SWIPE_THRESH || vx < -VEL_THRESH) swipeOut('left');
        else if (dx >  SWIPE_THRESH || vx >  VEL_THRESH) swipeOut('right');
        else Animated.spring(cardX, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  useEffect(() => {
    Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulseScale,   { toValue: 2.2, duration: 1400, useNativeDriver: true }),
          Animated.timing(pulseScale,   { toValue: 1,   duration: 1000, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(pulseOpacity, { toValue: 0,   duration: 1400, useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0.8, duration: 1000, useNativeDriver: true }),
        ]),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.delay(1400),
        Animated.parallel([
          Animated.timing(swipeX,       { toValue: -26, duration: 420, useNativeDriver: true }),
          Animated.timing(swipeOpacity, { toValue: 0.4, duration: 420, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(swipeX,       { toValue: 0,   duration: 300, useNativeDriver: true }),
          Animated.timing(swipeOpacity, { toValue: 0.9, duration: 300, useNativeDriver: true }),
        ]),
        Animated.delay(500),
        Animated.parallel([
          Animated.timing(swipeX,       { toValue: 26,  duration: 420, useNativeDriver: true }),
          Animated.timing(swipeOpacity, { toValue: 0.4, duration: 420, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(swipeX,       { toValue: 0,   duration: 300, useNativeDriver: true }),
          Animated.timing(swipeOpacity, { toValue: 0.9, duration: 300, useNativeDriver: true }),
        ]),
      ])
    ).start();
  }, []);

  // ── Info sheet ────────────────────────────────────────────────────────────
  const sheetY    = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const [sheetOpen, setSheetOpen] = useState(false);

  const openSheet = () => {
    setSheetOpen(true);
    anySheetOpenRef.current = true;
    Animated.spring(sheetY, { toValue: 0, bounciness: 3, speed: 14, useNativeDriver: true }).start();
  };
  const closeSheet = () => {
    Animated.timing(sheetY, { toValue: SHEET_HEIGHT, duration: 280, useNativeDriver: true })
      .start(() => {
        setSheetOpen(false);
        if (!reportOpenRef.current) anySheetOpenRef.current = false;
      });
  };

  // ── Report sheet ──────────────────────────────────────────────────────────
  const reportY    = useRef(new Animated.Value(REPORT_HEIGHT)).current;
  const [reportOpen, setReportOpen] = useState(false);
  const reportOpenRef = useRef(false);
  reportOpenRef.current = reportOpen;

  const openReport = () => {
    // Close info sheet first if open
    if (sheetOpen) closeSheet();
    setReportSubmitted(false);
    setSelectedReason(null);
    setReportOpen(true);
    anySheetOpenRef.current = true;
    Animated.spring(reportY, { toValue: 0, bounciness: 3, speed: 14, useNativeDriver: true }).start();
  };
  const closeReport = () => {
    Animated.timing(reportY, { toValue: REPORT_HEIGHT, duration: 280, useNativeDriver: true })
      .start(() => {
        setReportOpen(false);
        anySheetOpenRef.current = false;
      });
  };
  const submitReport = () => {
    if (!selectedReason) return;
    setReportSubmitted(true);
  };

  // ── Floating context menu ──────────────────────────────────────────────────
  const openMenu = () => {
    setMenuOpen(true);
    anySheetOpenRef.current = true;
    menuAnim.setValue(0);
    Animated.timing(menuAnim, {
      toValue: 1,
      duration: 160,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };
  const closeMenu = (cb?: () => void) => {
    Animated.timing(menuAnim, {
      toValue: 0,
      duration: 120,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setMenuOpen(false);
      anySheetOpenRef.current = false;
      cb?.();
    });
  };
  const menuOpacity = menuAnim;
  const menuScale   = menuAnim.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] });
  const backdropOpacity = menuAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.08] });

  const handlePass    = () => swipeOut('left');
  const handleConnect = () => { closeSheet(); swipeOut('right'); };

  if (loading) {
    return (
      <>
        <Tabs.Screen options={{ tabBarStyle: { display: 'none' } }} />
        <View style={[s.root, { alignItems: 'center', justifyContent: 'center' }]}>
          <ActivityIndicator size="large" color={L.gold} />
        </View>
      </>
    );
  }

  if (!player) {
    return (
      <>
        <Tabs.Screen options={{ tabBarStyle: { display: 'none' } }} />
        <View style={[s.root, { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }]}>
          <Text style={{ color: L.gold, fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 8 }}>
            No partners found
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, textAlign: 'center' }}>
            Check back later or update your preferences.
          </Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Tabs.Screen options={{ tabBarStyle: { display: 'none' } }} />
      <View style={s.root}>
      <StatusBar style="light" />

      {/* ── SWIPEABLE CARD ── */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { transform: [{ translateX: cardX }, { rotate: cardRotation }] },
        ]}
        {...panResponder.panHandlers}
      >
        {/* Photo */}
        <Image
          source={{ uri: player.photos[photoIdx] }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />

        {/* PASS badge */}
        <Animated.View style={[s.swipeBadge, s.passBadge, { opacity: passOpacity }]}>
          <Text style={s.passBadgeText}>PASS</Text>
        </Animated.View>

        {/* CONNECT badge */}
        <Animated.View style={[s.swipeBadge, s.connectBadge, { opacity: connectOpacity }]}>
          <Text style={s.connectBadgeText}>CONNECT</Text>
        </Animated.View>

        {/* Photo tap zones — left half = prev, right half = next */}
        <View style={s.tapZones} pointerEvents="box-none">
          <TouchableOpacity style={s.tapHalf} activeOpacity={1}
            onPress={() => setPhotoIdx(i => Math.max(0, i - 1))} />
          <TouchableOpacity style={s.tapHalf} activeOpacity={1}
            onPress={() => setPhotoIdx(i => Math.min(player.photos.length - 1, i + 1))} />
        </View>

        {/* Progress bar */}
        <View style={[s.progressRow, { top: insets.top + 10 }]}>
          {player.photos.map((_, i) => (
            <View key={i} style={[s.progressSeg, i === photoIdx && s.progressActive]} />
          ))}
        </View>

        {/* ── INFO CARD — extends to safe-area bottom ── */}
        <View
          style={[s.infoOverlay, { paddingBottom: 0 }]}
          pointerEvents="box-none"
        >
          <View style={[s.infoCard, { paddingBottom: insets.bottom + 14 }]} pointerEvents="box-none">

            {/* Animated swipe hint — inside card for darker backdrop */}
            <View style={s.swipeHintWrap} pointerEvents="none">
              <Animated.View style={[s.swipeHandRow, { transform: [{ translateX: swipeX }], opacity: swipeOpacity }]}>
                <Ionicons name="arrow-back"         size={13} color="rgba(255,255,255,0.65)" />
                <Ionicons name="hand-left-outline"  size={21} color="rgba(255,255,255,0.88)" />
                <Ionicons name="arrow-forward"      size={13} color="rgba(255,255,255,0.65)" />
              </Animated.View>
              <Text style={s.swipeHintText}>Swipe left to pass · right to connect</Text>
            </View>

            {/* Divider */}
            <View style={s.hintDivider} />

            {/* Name + verified + pulse */}
            <View style={s.nameRow}>
              <Text style={s.playerName}>{player.name}</Text>
              <Ionicons name="checkmark-circle" size={22} color={L.gold} style={{ marginLeft: 6, marginTop: 5 }} />
              <View style={s.pulseWrap}>
                <Animated.View style={[s.pulseRing, { transform: [{ scale: pulseScale }], opacity: pulseOpacity }]} />
                <View style={s.pulseDot} />
              </View>
            </View>

            {/* Compatibility */}
            <View style={[s.inlineRow, { marginBottom: 6 }]}>
              <Ionicons name="pulse-outline" size={12} color={L.gold} />
              <Text style={s.compatText}>{player.compatibility}% Match</Text>
            </View>

            {/* DUPR + Location */}
            <View style={s.metaRow}>
              <View style={s.inlineRow}>
                <Ionicons name="speedometer-outline" size={13} color={L.gold} />
                <Text style={s.duprText}>
                  {player.ratingType === 'none'
                    ? 'Unrated'
                    : `${player.dupr.toFixed(1)} ${player.ratingType === 'dupr' ? 'DUPR' : 'Self'}`}
                </Text>
              </View>
              <View style={s.metaDot} />
              <View style={s.inlineRow}>
                <Ionicons name="location-outline" size={12} color="rgba(255,255,255,0.70)" />
                <Text style={s.locationText}>
                  {player.location}{player.distance != null ? ` · ${player.distance} mi` : ''}
                </Text>
              </View>
            </View>

            {/* Looking for */}
            <View style={[s.inlineRow, { marginBottom: 8 }]}>
              <Text style={s.lookingLabel}>Looking for </Text>
              <Text style={s.lookingValue}>{player.lookingFor}</Text>
              <Text style={s.skillRange}> · {player.skillRange}</Text>
            </View>

            {/* Tags */}
            <View style={s.tagsRow}>
              {player.tags1.map(t => <TagPill key={t.label} icon={t.icon} label={t.label} />)}
            </View>

            {/* Info btn + photo counter */}
            <View style={s.cardBottom} pointerEvents="box-none">
              <TouchableOpacity
                style={s.infoBtn} onPress={openSheet} activeOpacity={0.8}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="information-circle" size={28} color="rgba(255,255,255,0.9)" />
              </TouchableOpacity>
              <View style={s.photoCount}>
                <Ionicons name="camera-outline" size={12} color="#FFF" />
                <Text style={s.photoCountText}>{photoIdx + 1}/{player.photos.length}</Text>
              </View>
            </View>
          </View>
        </View>
      </Animated.View>

      {/* ── PERSISTENT TOP BAR — stays fixed while cards swipe underneath ── */}
      <View style={[s.topControls, { top: insets.top + 36 }]} pointerEvents="box-none">
        <TouchableOpacity style={s.topBtn} onPress={() => router.back()}>
          <Ionicons name="close" size={20} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={s.topRight} pointerEvents="box-none">
          {/* Connections — primary payoff, badged with mutual-match count */}
          <TouchableOpacity style={s.topBtn} onPress={() => router.push('/match/connections')}>
            <Ionicons name="people" size={18} color="#FFFFFF" />
            {matchCount > 0 && (
              <View style={s.topBadge}>
                <Text style={s.topBadgeText}>{matchCount > 9 ? '9+' : matchCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          {/* Saved players */}
          <TouchableOpacity style={s.topBtn} onPress={() => router.push('/match/saved')}>
            <Ionicons name="bookmark" size={16} color="#FFFFFF" />
          </TouchableOpacity>
          {/* Incoming/outgoing requests */}
          <TouchableOpacity style={s.topBtn} onPress={() => router.push('/match/requests')}>
            <Ionicons name="person-add" size={16} color="#FFFFFF" />
          </TouchableOpacity>
          {/* Overflow — Preferences + Report */}
          <TouchableOpacity style={s.topBtn} onPress={openMenu}>
            <Ionicons name="ellipsis-horizontal" size={17} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── INFO SHEET (slides up) ── */}
      <Animated.View
        style={[s.sheet, { paddingBottom: insets.bottom + 8, transform: [{ translateY: sheetY }] }]}
      >
        <TouchableOpacity onPress={closeSheet} style={s.handleWrap} activeOpacity={0.7}>
          <View style={s.handle} />
        </TouchableOpacity>
        <View style={s.sheetHeaderRow}>
          <Text style={s.sheetTitle}>Interested in {player.name.split(' ')[0]}?</Text>
          <TouchableOpacity onPress={closeSheet} style={s.sheetCloseBtn} activeOpacity={0.7}>
            <Ionicons name="close" size={20} color={L.textMuted} />
          </TouchableOpacity>
        </View>
        <Text style={s.sheetSub}>Send a connect to start a conversation.</Text>
        <View style={s.actionRow}>
          <ActionBtn icon="close"        label="Pass"    onPress={handlePass}    filled={false} />
          <ActionBtn icon="star-outline" label="Save"    onPress={() => {
              if (!player) return;
              persistLike(player.id, 'save', player.name);
            }} filled={false} />
          <ActionBtn icon="heart"        label="Connect" onPress={handleConnect} filled={true}  />
        </View>
        <View style={s.sheetHintRow}>
          <Ionicons name="swap-horizontal-outline" size={14} color={L.textMuted} />
          <Text style={s.sheetHintLabel}>Swipe left to pass, right to connect</Text>
        </View>
      </Animated.View>

      {/* ── FLOATING CONTEXT MENU ── */}
      {menuOpen && (
        <>
          {/* Dim backdrop — tapping dismisses the menu */}
          <Animated.View
            style={[mm.backdrop, { opacity: backdropOpacity }]}
            pointerEvents="none"
          />
          <TouchableOpacity
            style={[StyleSheet.absoluteFill, { zIndex: 30 }]}
            activeOpacity={1}
            onPress={() => closeMenu()}
          />

          {/* Popover panel */}
          <Animated.View
            style={[
              mm.popover,
              {
                top: insets.top + 82,   // below the top controls row (36 offset + 36 btn + 10 gap)
                right: 16,
                opacity: menuOpacity,
                transform: [{ scale: menuScale }],
              },
            ]}
          >
            {/* Caret pointing up toward the ⋯ button */}
            <View style={mm.caret} />

            {/* Main nav items */}
            {MATCH_MENU.map((item, i) => (
              <TouchableOpacity
                key={item.id}
                style={[mm.row, i === 0 && mm.rowFirst]}
                onPress={() => closeMenu(() => router.push(item.route as never))}
                activeOpacity={0.7}
              >
                <View style={mm.iconWrap}>
                  <Ionicons name={item.icon as never} size={19} color={L.navy} />
                </View>
                <Text style={mm.rowLabel}>{item.label}</Text>
              </TouchableOpacity>
            ))}

            {/* Divider */}
            <View style={mm.divider} />

            {/* Danger: Report Profile */}
            <TouchableOpacity
              style={mm.row}
              onPress={() => closeMenu(openReport)}
              activeOpacity={0.7}
            >
              <View style={mm.iconWrap}>
                <Ionicons name="flag-outline" size={19} color={L.danger} />
              </View>
              <Text style={[mm.rowLabel, mm.rowLabelDanger]}>Report Profile</Text>
            </TouchableOpacity>
          </Animated.View>
        </>
      )}

      {/* ── REPORT SHEET (slides up) ── */}
      <Animated.View
        style={[s.reportSheet, { paddingBottom: insets.bottom + 8, transform: [{ translateY: reportY }] }]}
      >
        <TouchableOpacity onPress={closeReport} style={s.handleWrap} activeOpacity={0.7}>
          <View style={s.handle} />
        </TouchableOpacity>

        {reportSubmitted ? (
          /* ── Confirmation state ── */
          <View style={s.reportConfirm}>
            <View style={s.reportConfirmIcon}>
              <Ionicons name="checkmark-circle" size={52} color={L.gold} />
            </View>
            <Text style={s.reportConfirmTitle}>Report Submitted</Text>
            <Text style={s.reportConfirmSub}>
              Thank you. Our moderation team will review this profile within 24 hours.
            </Text>
            <TouchableOpacity style={s.reportDoneBtn} onPress={closeReport} activeOpacity={0.85}>
              <Text style={s.reportDoneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* ── Form state ── */
          <>
            <View style={s.reportHeader}>
              <View style={s.reportIconCircle}>
                <Ionicons name="flag" size={20} color={L.danger} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.reportTitle}>Report Profile</Text>
                <Text style={s.reportSub}>Help keep Pickleball App safe</Text>
              </View>
              <TouchableOpacity onPress={closeReport} style={s.reportCloseBtn} activeOpacity={0.7}>
                <Ionicons name="close" size={22} color={L.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={s.reasonList}>
              {REPORT_REASONS.map(r => {
                const selected = selectedReason === r.id;
                return (
                  <TouchableOpacity
                    key={r.id}
                    style={[s.reasonRow, selected && s.reasonRowSelected]}
                    onPress={() => setSelectedReason(r.id)}
                    activeOpacity={0.75}
                  >
                    <View style={[s.reasonIconWrap, selected && s.reasonIconSelected]}>
                      <Ionicons name={r.icon as never} size={16} color={selected ? '#FFF' : L.textMuted} />
                    </View>
                    <Text style={[s.reasonLabel, selected && s.reasonLabelSelected]}>{r.label}</Text>
                    {selected && (
                      <Ionicons name="checkmark-circle" size={18} color={L.navy} style={{ marginLeft: 'auto' }} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={[s.reportSubmitBtn, !selectedReason && s.reportSubmitBtnDisabled]}
              onPress={submitReport}
              activeOpacity={0.85}
              disabled={!selectedReason}
            >
              <Text style={s.reportSubmitText}>Submit Report</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={closeReport} activeOpacity={0.7} style={s.reportCancelWrap}>
              <Text style={s.reportCancelText}>Cancel</Text>
            </TouchableOpacity>
          </>
        )}
      </Animated.View>
    </View>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#111' },

  // Tap zones
  tapZones: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row', zIndex: 4 },
  tapHalf:  { flex: 1 },

  // Progress bar
  progressRow:    { position: 'absolute', left: 16, right: 16, flexDirection: 'row', gap: 4, zIndex: 10 },
  progressSeg:    { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.28)' },
  progressActive: { backgroundColor: L.gold },

  // Top controls
  topControls: {
    position: 'absolute', left: 16, right: 16,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', zIndex: 10,
  },
  topRight: { flexDirection: 'row', gap: 8 },
  topBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.38)',
    alignItems: 'center', justifyContent: 'center',
  },
  topBadge: {
    position: 'absolute', top: -4, right: -4,
    minWidth: 18, height: 18, borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: L.gold,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: L.navy,
  },
  topBadgeText: { color: L.navy, fontSize: 10, fontWeight: '800' },

  // Swipe badges
  swipeBadge: {
    position: 'absolute', top: SH * 0.14, zIndex: 12,
    paddingHorizontal: 18, paddingVertical: 10,
    borderRadius: 10, borderWidth: 3,
  },
  passBadge:        { left: 24,  borderColor: '#FF4D4D', transform: [{ rotate: '-15deg' }] },
  passBadgeText:    { color: '#FF4D4D', fontSize: 28, fontWeight: '900', letterSpacing: 2 },
  connectBadge:     { right: 24, borderColor: L.online,  transform: [{ rotate: '15deg'  }] },
  connectBadgeText: { color: L.online,  fontSize: 28, fontWeight: '900', letterSpacing: 2 },

  // Info overlay — anchored to bottom, no extra padding so card fills to edge
  infoOverlay: {
    position: 'absolute', bottom: -20, left: 0, right: 0,
    paddingHorizontal: 14, zIndex: 5,
  },

  // Card with 30% opacity — extends to safe-area bottom via dynamic paddingBottom
  infoCard: {
    backgroundColor: 'rgba(0,0,0,0.30)',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 16, paddingTop: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    borderBottomWidth: 0,
  },

  nameRow:    { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },
  playerName: { color: '#FFF', fontSize: 29, fontWeight: '900', letterSpacing: -0.5 },

  pulseWrap: { position: 'relative', width: 14, height: 14, marginLeft: 10, marginTop: 11 },
  pulseRing: { position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: L.online },
  pulseDot:  { width: 9, height: 9, borderRadius: 4.5, backgroundColor: L.online, margin: 2.5 },

  metaRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 },
  metaDot:   { width: 3, height: 3, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.35)' },
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },

  duprText:     { color: '#FFF',                      fontSize: 13, fontWeight: '700' },
  compatText:   { color: L.gold,                      fontSize: 12, fontWeight: '700' },
  locationText: { color: 'rgba(255,255,255,0.75)',    fontSize: 12, fontWeight: '500' },
  lookingLabel: { color: 'rgba(255,255,255,0.60)',    fontSize: 12, fontWeight: '400' },
  lookingValue: { color: '#FFF',                      fontSize: 12, fontWeight: '800' },
  skillRange:   { color: L.gold,                      fontSize: 12, fontWeight: '600' },
  tagsRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 10 },

  cardBottom:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  infoBtn:       { padding: 2 },
  photoCount: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 10,
    paddingHorizontal: 9, paddingVertical: 4,
  },
  photoCountText: { color: '#FFF', fontSize: 11, fontWeight: '700' },

  hintDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.10)', marginBottom: 10 },

  // Swipe hint — now inside card
  swipeHintWrap: { alignItems: 'center', gap: 5, paddingTop: 15, paddingBottom: 10 },
  swipeHandRow:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swipeHintText: { color: 'rgba(255,255,255,0.52)', fontSize: 11, fontWeight: '500', letterSpacing: 0.2 },

  // ── Shared sheet styles ───────────────────────────────────────────────────
  handleWrap: { alignItems: 'center', paddingVertical: 8 },
  handle:     { width: 40, height: 4, borderRadius: 2, backgroundColor: '#D0D8E8' },

  // Info sheet
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: SHEET_HEIGHT,
    backgroundColor: '#F8F9FC',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingTop: 10,
    zIndex: 20,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  sheetHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  sheetTitle:    { color: L.navy, fontSize: 20, fontWeight: '900', textAlign: 'center', flex: 1 },
  sheetCloseBtn: { position: 'absolute', right: 0, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  sheetSub:      { color: L.textMuted, fontSize: 14, textAlign: 'center', marginBottom: 20 },
  actionRow:     { flexDirection: 'row', justifyContent: 'center', gap: 28, marginBottom: 16 },
  sheetHintRow:  { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
  sheetHintLabel:{ color: L.textMuted, fontSize: 12 },

  // ── Report sheet ──────────────────────────────────────────────────────────
  reportSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: REPORT_HEIGHT,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 4,
    zIndex: 21,
    shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 24, shadowOffset: { width: 0, height: -4 },
    elevation: 14,
  },

  reportHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginBottom: 18, paddingTop: 4, justifyContent: 'space-between',
  },
  reportCloseBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  reportIconCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#FFF0F0',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#FFCCCC',
  },
  reportTitle: { color: L.navy, fontSize: 18, fontWeight: '900' },
  reportSub:   { color: L.textMuted, fontSize: 13, marginTop: 1 },

  reasonList: { gap: 6, marginBottom: 20 },
  reasonRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 11, paddingHorizontal: 14,
    borderRadius: 12, borderWidth: 1.5, borderColor: L.border,
    backgroundColor: '#FAFBFF',
  },
  reasonRowSelected: {
    borderColor: L.navy, backgroundColor: '#EEF1F8',
  },
  reasonIconWrap: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#EEF1F8',
    alignItems: 'center', justifyContent: 'center',
  },
  reasonIconSelected: { backgroundColor: L.navy },
  reasonLabel:        { color: L.text, fontSize: 14, fontWeight: '500', flex: 1 },
  reasonLabelSelected:{ fontWeight: '700' },

  reportSubmitBtn: {
    backgroundColor: L.navy, borderRadius: 14,
    paddingVertical: 15, alignItems: 'center', marginBottom: 10,
  },
  reportSubmitBtnDisabled: { opacity: 0.38 },
  reportSubmitText: { color: '#FFF', fontSize: 16, fontWeight: '800' },

  reportCancelWrap: { alignItems: 'center', paddingVertical: 6 },
  reportCancelText: { color: L.textMuted, fontSize: 14, fontWeight: '500' },

  // Confirmation
  reportConfirm:     { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 20 },
  reportConfirmIcon: { marginBottom: 14 },
  reportConfirmTitle:{ color: L.navy, fontSize: 22, fontWeight: '900', marginBottom: 8 },
  reportConfirmSub:  { color: L.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20, maxWidth: 280, marginBottom: 28 },
  reportDoneBtn: {
    backgroundColor: L.navy, borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 48,
  },
  reportDoneBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
});

const mm = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0A1228',
    zIndex: 30,
  },

  popover: {
    position: 'absolute',
    width: 248,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingVertical: 5,
    zIndex: 31,
    shadowColor: '#000',
    shadowOpacity: 0.13,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 16,
  },

  caret: {
    position: 'absolute',
    top: -7,
    right: 13,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#FFFFFF',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8,
    marginHorizontal: 5,
    borderRadius: 11,
    height: 50,
  },
  rowFirst: { marginTop: 4 },

  iconWrap: {
    width: 32, height: 32, borderRadius: 9,
    backgroundColor: '#F3F6FC',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  rowLabel:       { color: L.navy, fontSize: 14, fontWeight: '500', letterSpacing: 0 },
  rowLabelDanger: { color: L.danger },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: L.border,
    marginHorizontal: 10,
    marginVertical: 3,
  },
});
