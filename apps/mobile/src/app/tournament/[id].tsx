import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Dimensions, Image, Modal, Pressable, Alert, ActivityIndicator,
  LayoutAnimation, Platform, UIManager, Share, Animated,
} from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { goBack } from '@/lib/navigation';
import { isTournamentCompleted, getAllBrackets } from '@/lib/directorBracketStore';
import { isTournamentCompleted as fetchHasPublishedResults } from '@/lib/supabase/brackets';
import { StatusChip, AddToCalendarButton } from '@/components';
import { InfoTooltip } from '@/components/InfoTooltip';
import type { CalendarEventInput } from '@/lib/calendarEvents';
import { withLink } from '@/lib/calendarEvents';
import {
  getTournamentStatus,
  getPlayerRegistrationStatus,
  getTournamentStatusInfo,
  getPlayerRegStatusInfo,
  type TournamentStatusKey,
  type PlayerRegStatusKey,
} from '@/lib/tournamentStatus';
import { useSession } from '@/hooks/useSession';
import { useTournamentBookmarks } from '@/hooks/useTournamentBookmarks';
import { getRegistrationAvailability } from '@/lib/registrationGate';
import { balanceDueCents, effectiveEntryFeeCents } from '@/lib/tournamentFees';
import { fetchTournamentById } from '@/lib/supabase/tournaments';
import { fetchDivisionsForTournament } from '@/lib/supabase/divisions';
import { fetchPlayerHolds, fetchPlayerRegistrations } from '@/lib/supabase/registrations';
import { fetchFacilityById, facilityAccessType, type FacilityDetail } from '@/lib/supabase/facilities';
import LocationCard from '@/components/LocationCard';
import { resolveAmenities } from '@/lib/tournamentAmenities';
import { fetchDirectorStats, type DirectorStats } from '@/lib/supabase/directorStats';
import { fetchProfile, type UserProfile } from '@/lib/services/profile';
import { supabase } from '@/lib/supabase';
import { getOrCreateConversation } from '@/lib/conversationService';
import { useSupportContext } from '@/lib/support/supportContext';
import { appLinks } from '@/lib/appLinks';
import type { Tournament } from '@/lib/tournamentTypes';
import type { DivisionData } from '@/data/divisions';

const { width: SW, height: SH } = Dimensions.get('window');
const HERO_H = SH * 0.44;

// Old-architecture Android needs this opt-in for LayoutAnimation; harmless no-op elsewhere.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Theme-backed alias — brand values resolve from @/theme.
const L = {
  bg:        colors.bg,
  page:      colors.page,
  navy:      colors.navy,
  gold:      colors.gold,
  goldLight: colors.goldLight,
  text:      colors.text,
  textSub:   colors.textSub,
  textMuted: colors.textSub,
  border:    colors.border,
  green:     colors.success,
  greenBg:   colors.successBg,
  red:       colors.danger,
  redBg:     colors.dangerBg,
};

const HERO_PHOTO     = 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800&h=600&fit=crop&q=80';
const DIRECTOR_PHOTO = 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&h=200&fit=crop&q=80';

// ─── Mock data ────────────────────────────────────────────────────────────────
// DIVISIONS imported from @/data/divisions — kept here as a shaped alias so
// DivisionRow props remain unchanged.

// Labels are deliberately short enough to stay on one line each at this width —
// the compact single-row strip below depends on it. Longer copy ("USAP
// Approved", "For All Players") wraps to two lines and makes the row ragged.
function splitHeroName(name: string): [string, string] {
  const idx = name.lastIndexOf(' ');
  if (idx === -1) return ['', name.toUpperCase()];
  return [name.slice(0, idx).toUpperCase(), name.slice(idx + 1).toUpperCase()];
}

function fmt(cents: number) { return `$${Math.round(cents / 100)}`; }

function fmtHeroDate(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    if (!y || !m || !d) return dateStr;
    return new Date(y, m - 1, d).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

// registrationOpensAt/registrationClosesAt come back as full timestamptz
// strings — format both the date and local time (with zone abbreviation)
// for the Registration & Fees card. Returns null for an unset date so the
// caller can show a sensible fallback instead of "Invalid Date".
function fmtRegDateTime(iso: string | null | undefined): { date: string; time: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return {
    date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }),
  };
}

// Splits "Mixed Doubles" → ["Mixed", "Doubles"], "Men's Doubles" → ["Men's", "Doubles"]
function splitDivisionName(name: string): [string, string] {
  const idx = name.lastIndexOf(' ');
  if (idx === -1) return [name, ''];
  return [name.slice(0, idx), name.slice(idx + 1)];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

type DivDisplayStatus = 'available' | 'waitlist' | 'held' | 'registered';

function DivisionRow({
  d, displayStatus, pastEvent, onPress,
}: {
  d: DivisionData;
  displayStatus?: DivDisplayStatus;
  pastEvent?: boolean;
  onPress?: () => void;
}) {
  const status: DivDisplayStatus = displayStatus ?? (d.status as DivDisplayStatus);
  // A past/completed tournament has nothing left to hold or register for —
  // grey the pill out regardless of what it would otherwise show, except
  // "Registered" which stays as a settled, positive outcome.
  const isPastInactive = !!pastEvent && status !== 'registered';
  const isDisabled = status === 'registered' || isPastInactive;
  const [nameLine1, nameLine2] = splitDivisionName(d.name);

  const pillStyle = isPastInactive ? [dr.statusBadge, dr.statusPast] :
    status === 'registered' ? [dr.statusBadge, dr.statusRegistered] :
    status === 'held'       ? [dr.statusBadge, dr.statusHeld]       :
    status === 'available'  ? [dr.statusBadge, dr.statusAvail]      :
                              [dr.statusBadge, dr.statusWait];

  const pillTextStyle = isPastInactive ? dr.statusTextPast :
    status === 'registered' ? dr.statusTextRegistered :
    status === 'held'       ? dr.statusTextHeld       :
    status === 'available'  ? dr.statusTextAvail      :
                              dr.statusTextWait;

  const pillText = isPastInactive ? 'Closed' :
    status === 'registered' ? 'Registered ✓' :
    status === 'held'       ? 'Held ✓'        :
    status === 'available'  ? 'Hold My Spot'  :
                              'Waitlist Only';

  const subText = isPastInactive ? 'Tournament Completed' :
    status === 'registered' ? "You're Registered" :
    status === 'held'       ? 'Tap to Register'   :
    status === 'available'  ? 'Spots Available'   :
                              'Join Waitlist';

  return (
    <TouchableOpacity
      style={dr.row}
      activeOpacity={isDisabled ? 1 : 0.75}
      onPress={isDisabled ? undefined : onPress}
    >
      {/* COL 1 — name + dates */}
      <View style={dr.center}>
        <Text style={dr.nameLine}>{nameLine1}</Text>
        {nameLine2 ? <Text style={dr.nameLine}>{nameLine2}</Text> : null}
        <Text style={dr.dates}>{d.dates}</Text>
      </View>

      {/* COL 2 — rating badge (top) + count + label */}
      <View style={dr.countCol}>
        <View style={[dr.levelBadge, { backgroundColor: d.levelNavy ? L.navy : '#3A5070' }]}>
          <Text style={dr.levelText}>{d.level}</Text>
        </View>
        <Text style={[dr.countNum, status === 'waitlist' && { color: L.red }]}>
          {d.registered} / {d.capacity}
        </Text>
        <Text style={dr.countLabel}>Registered</Text>
      </View>

      {/* COL 3 — status pill + sub + chevron */}
      <View style={dr.statusCol}>
        <View style={pillStyle}>
          <Text style={[dr.statusText, pillTextStyle]}>{pillText}</Text>
        </View>
        <Text style={[dr.statusSub, status === 'waitlist' && { color: L.red }]}>
          {subText}
        </Text>
        {!isDisabled && (
          <Ionicons name="chevron-forward" size={14} color={L.textMuted} style={{ marginTop: 2 }} />
        )}
      </View>
    </TouchableOpacity>
  );
}

const dr = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 16, gap: 10,
    borderBottomWidth: 1, borderBottomColor: L.border,
  },
  center: { flex: 1, minWidth: 0 },
  nameLine: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800', lineHeight: 20 },
  dates: { color: L.textMuted, fontSize: text.caption.size, fontWeight: '500', marginTop: 4 },

  // Col 2 — badge stacked above count
  countCol: {
    alignItems: 'center', flexShrink: 0, minWidth: 60, gap: 3,
  },
  levelBadge: {
    borderRadius: shape.badge, paddingHorizontal: 8, paddingVertical: 2,
  },
  levelText: { color: '#FFFFFF', fontSize: text.chipValue.size, fontWeight: '800' },
  countNum: { color: L.navy, fontSize: text.rowValue.size, fontWeight: '800' },
  countLabel: { color: L.textMuted, fontSize: 10 },

  // Col 3 — status pill + sub + chevron stacked
  statusCol: { alignItems: 'center', flexShrink: 0, minWidth: 88, gap: 2 },
  statusBadge: {
    borderWidth: 1.5, borderRadius: shape.pill,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  statusAvail: { borderColor: L.green, backgroundColor: L.greenBg },
  statusWait: { borderColor: L.red,   backgroundColor: L.redBg   },
  statusHeld: { borderColor: L.gold,  backgroundColor: L.goldLight },
  statusRegistered: { borderColor: L.green, backgroundColor: L.greenBg  },
  statusPast: { borderColor: L.border, backgroundColor: L.page   },
  statusText: { fontSize: text.cardLabel.size, fontWeight: '800', letterSpacing: text.cardLabel.letterSpacing },
  statusTextAvail: { color: L.green },
  statusTextWait: { color: L.red   },
  statusTextHeld: { color: L.gold  },
  statusTextRegistered: { color: L.green },
  statusTextPast: { color: L.textMuted },
  statusSub: { color: L.textMuted, fontSize: 10, fontWeight: '500' },
});

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function TournamentDetail() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const { isBookmarked, toggleBookmark } = useTournamentBookmarks();
  const [holdTooltip, setHoldTooltip] = useState(false);
  const [heldDivIds, setHeldDivIds] = useState<Set<string>>(new Set());
  const [regDivIds, setRegDivIds]   = useState<Set<string>>(new Set());
  const [heldSpots, setHeldSpots]   = useState<import('@/lib/tournamentStore').HeldSpot[]>([]);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [divisions, setDivisions]   = useState<DivisionData[]>([]);
  const [loading, setLoading]       = useState(true);
  const { id } = useLocalSearchParams<{ id: string }>();

  // Measured, not hardcoded: this bar's height changes when the CTA stack
  // expands, so a constant would be wrong in one of the two states. Rounded
  // because the support registry re-registers on any change to the
  // serialized context, and a fractional height would churn every layout pass.
  const [ctaBarHeight, setCtaBarHeight] = useState(0);

  useSupportContext({
    feature: 'tournament',
    entityType: 'tournament',
    entityId: id,
    entityLabel: tournament?.name,
    bottomClearance: ctaBarHeight,
  });

  // Unknown keys are dropped and the list is capped at three, so a row written
  // by a newer build renders fewer chips here rather than breaking the strip.
  const amenities = resolveAmenities(tournament?.amenities);

  // Both the host card and the director sheet rendered this strip, each with
  // its own copy of the same hardcoded numbers — fixing only the visible one
  // would have left the other lying. One component now, so they cannot drift.
  function DirectorStatsRow() {
    if (!directorStats) return null;
    const { playersServed, tournamentsHosted } = directorStats;
    // A director with no history yet gets no strip, rather than a row of
    // zeroes presented as achievement.
    if (playersServed === 0 && tournamentsHosted === 0) return null;
    return (
      <>
        <View style={s.hostStat}>
          <Ionicons name="people-outline" size={22} color={L.textSub} />
          <Text style={s.hostStatNum}>{playersServed.toLocaleString()}</Text>
          <Text style={s.hostStatLabel}>{playersServed === 1 ? 'Player' : 'Players'}{'\n'}Served</Text>
        </View>
        <View style={s.hostStat}>
          <Ionicons name="calendar-outline" size={22} color={L.textSub} />
          <Text style={s.hostStatNum}>{tournamentsHosted.toLocaleString()}</Text>
          <Text style={s.hostStatLabel}>{tournamentsHosted === 1 ? 'Tournament' : 'Tournaments'}{'\n'}Hosted</Text>
        </View>
      </>
    );
  }

  const heroLine1 = tournament ? splitHeroName(tournament.name)[0] : '';
  const heroLine2 = tournament ? splitHeroName(tournament.name)[1] : '';

  const anyHeld       = heldDivIds.size > 0;
  const anyRegistered = regDivIds.size > 0;

  // Entry fee is charged PER PLAYER, in every format. On a doubles/mixed team
  // each player owes this amount individually and pays it separately (see
  // supabase/migrations/20260817010000_registration_team_payment_groups.sql),
  // so a pair pays this twice in total.
  //
  // This previously read "Team" for any tournament with a doubles division,
  // which described the opposite of what the server charges: a player saw
  // "$50 / Team" and was then charged $50 on their own.
  const entryUnitLabel = 'Player';

  const [tournamentStatusKey, setTournamentStatusKey] = useState<TournamentStatusKey>('open');
  const [playerRegStatus, setPlayerRegStatus] = useState<PlayerRegStatusKey | null>(null);
  const [hasBrackets, setHasBrackets] = useState(false);
  const [resultsAvailable, setResultsAvailable] = useState(false);
  const [facility, setFacility] = useState<FacilityDetail | null>(null);
  const [directorUserId, setDirectorUserId] = useState<string | null>(null);
  const [directorProfile, setDirectorProfile] = useState<UserProfile | null>(null);
  const [directorStats, setDirectorStats] = useState<DirectorStats | null>(null);
  const [msgingDirector, setMsgingDirector] = useState(false);
  const [directorModalVisible, setDirectorModalVisible] = useState(false);

  // CTA stack starts collapsed (Register Now only); scrolling up expands it
  // to all 3 actions, scrolling down collapses it back to just Register Now.
  // Animated with LayoutAnimation so the extra buttons ease in/out instead of
  // popping in abruptly.
  const [ctasExpanded, setCtasExpanded] = useState(false);
  const ctasExpandedRef = React.useRef(false);
  const lastScrollY = React.useRef(0);
  const setCtasExpandedAnimated = useCallback((next: boolean) => {
    if (ctasExpandedRef.current === next) return;
    ctasExpandedRef.current = next;
    LayoutAnimation.configureNext(LayoutAnimation.create(
      220,
      LayoutAnimation.Types.easeInEaseOut,
      LayoutAnimation.Properties.opacity,
    ));
    setCtasExpanded(next);
  }, []);
  // Hero pull-zoom, ported from community/[id].tsx. Native-driven so the
  // transform runs on the UI thread and keeps up even while JS is busy.
  const scrollY = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);
  const sheetY = useRef(0);
  const locationY = useRef(0);
  const scrollToLocation = () => {
    scrollRef.current?.scrollTo({ y: Math.max(0, sheetY.current + locationY.current - 12), animated: true });
  };

  // Scale only — deliberately no translateY. Pulling down past the top (a
  // negative offset, iOS rubber-band) zooms in hard; scrolling up zooms gently
  // as the hero recedes, which is the only half Android sees since it has no
  // bounce by default. Staying at scale >= 1 means the image can never expose a
  // gap at the edges, which a parallax translate would. s.hero already has
  // overflow: 'hidden', so the scaled image is clipped to the hero.
  const heroScale = scrollY.interpolate({
    inputRange:  [-HERO_H, 0, HERO_H],
    outputRange: [2, 1, 1.2],
    extrapolate: 'clamp',
  });

  const onCtaScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    const y = e.nativeEvent.contentOffset.y;
    const dy = y - lastScrollY.current;
    if (dy > 6) setCtasExpandedAnimated(true);
    else if (dy < -6) setCtasExpandedAnimated(false);
    lastScrollY.current = y;
  }, [setCtasExpandedAnimated]);

  // Named because two sections depend on it: the workspace banner and the
  // empty About prompt.
  const isThisDirector = !!user && user.id === directorUserId;

  const openDirectorDM = useCallback(async () => {
    if (!directorUserId) {
      Alert.alert('Director unavailable', 'This tournament has no director set up for messaging yet.');
      return;
    }
    if (!user) {
      Alert.alert('Sign in required', 'Please sign in to send messages.');
      return;
    }
    if (user.id === directorUserId) return;
    setMsgingDirector(true);
    try {
      const convId = await getOrCreateConversation(user.id, directorUserId);
      router.push(`/conversation/${convId}` as never);
    } catch (e: unknown) {
      Alert.alert('Could not open chat', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setMsgingDirector(false);
    }
  }, [directorUserId, user]);

  const handleShare = useCallback(async () => {
    if (!tournament) return;
    try {
      await Share.share({
        message: `Check out ${tournament.name} on Pickleball App: ${appLinks.tournament(tournament.id)}`,
      });
    } catch {
      // User cancelled or the native share sheet was unavailable.
    }
  }, [tournament]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      async function load() {
        setLoading(true);
        const [t, divs] = await Promise.all([
          fetchTournamentById(id),
          fetchDivisionsForTournament(id),
        ]);
        if (!active) return;
        setTournament(t);
        setDivisions(divs);
        if (t) setTournamentStatusKey(getTournamentStatus(t));
        setDirectorUserId(t?.directorId ?? null);
        setHasBrackets(getAllBrackets(id).length > 0);
        setResultsAvailable(false);
        fetchHasPublishedResults(id).then(r => { if (active) setResultsAvailable(r); }).catch(() => {});
        setFacility(null);
        if (t?.facilityId) {
          fetchFacilityById(t.facilityId).then(f => { if (active) setFacility(f); }).catch(() => {});
        }
        setDirectorProfile(null);
        setDirectorStats(null);
        if (t?.directorId) {
          fetchProfile(t.directorId).then(p => { if (active) setDirectorProfile(p); }).catch(() => {});
          fetchDirectorStats(t.directorId).then(st => { if (active) setDirectorStats(st); }).catch(() => {});
        }

        if (user?.id) {
          const [holds, regs] = await Promise.all([
            fetchPlayerHolds(user.id),
            fetchPlayerRegistrations(user.id),
          ]);
          if (!active) return;
          const myHolds = holds.filter(h => h.tournamentId === id);
          setHeldSpots(myHolds);
          setHeldDivIds(new Set(myHolds.map(h => h.divisionId)));
          setRegDivIds(new Set(regs.filter(r => r.tournamentId === id).map(r => r.divisionId)));
          const isReg = regs.some(r => r.tournamentId === id);
          const isHeld = holds.some(h => h.tournamentId === id);
          setPlayerRegStatus(isReg ? 'registered' : isHeld ? 'held' : null);
        }
        setLoading(false);
      }
      load();
      return () => { active = false; };
    }, [id, user?.id]),
  );

  if (loading || !tournament) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.page, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.gold} />
      </View>
    );
  }

  // Add to Calendar: tournaments only ever store a plain calendar date
  // (event_date) with no time-of-day and no timezone anywhere in the schema
  // (see CALENDAR_INTEGRATION_PHASE6.md audit) -- represented as an all-day
  // event rather than guessing a start time. Not offered for draft/pending
  // (not yet public), cancelled, or completed/past tournaments (Step 21).
  const canAddToCalendar = ['open', 'filling_fast', 'full'].includes(tournament.status);
  let tournamentCalendarEvent: CalendarEventInput | null = null;
  if (canAddToCalendar) {
    const [y, m, d] = tournament.eventDate.split('-').map(Number);
    const locationLines = [
      tournament.venue,
      tournament.venueAddress ?? undefined,
      [tournament.city, tournament.state, tournament.zipCode].filter(Boolean).join(', '),
    ].filter((p): p is string => !!p);
    const eventDay = new Date(y, (m ?? 1) - 1, d ?? 1);
    tournamentCalendarEvent = {
      title: tournament.name,
      startDate: eventDay,
      endDate: eventDay,
      allDay: true,
      location: locationLines.join('\n'),
      notes: withLink(undefined, appLinks.tournament(tournament.id)),
    };
  }

  return (
    <View style={s.root}>
      <StatusBar style="light" />

      {/* ── FLOATING TOP CONTROLS (over hero) ── */}
      <View style={[s.topControls, { top: insets.top + 8 }]} pointerEvents="box-none">
        <TouchableOpacity style={s.topCircle} onPress={() => goBack()} activeOpacity={0.8}>
          <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={s.topRight}>
          <TouchableOpacity
            style={s.topCircle}
            activeOpacity={0.8}
            onPress={handleShare}
          >
            <Ionicons name="share-outline" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity style={s.topCircle} onPress={() => toggleBookmark(id)} activeOpacity={0.8}>
            <Ionicons name={isBookmarked(id) ? 'heart' : 'heart-outline'} size={20} color={isBookmarked(id) ? '#FF6B6B' : '#FFFFFF'} />
          </TouchableOpacity>
          {tournamentCalendarEvent && (
            <AddToCalendarButton
              event={tournamentCalendarEvent}
              variant="icon"
              style={s.topCircle}
              iconColor="#FFFFFF"
            />
          )}
        </View>
      </View>

      {/* ── SCROLLABLE CONTENT ── */}
      <Animated.ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 250 }}
        scrollEventThrottle={16}
        // One handler drives both: the native driver moves the hero, and the
        // listener keeps the existing collapsing-CTA behaviour. Replacing
        // onCtaScroll outright would have silently disabled that.
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true, listener: onCtaScroll },
        )}
      >
        {/* HERO */}
        <View style={[s.hero, { height: HERO_H }]}>
          <Animated.Image
            source={{ uri: HERO_PHOTO }}
            style={[StyleSheet.absoluteFill, { transform: [{ scale: heroScale }] }]}
            resizeMode="cover"
          />
          <LinearGradient
            colors={['rgba(0,0,0,0.25)', 'rgba(0,0,0,0.10)', 'rgba(0,0,0,0.72)']}
            locations={[0, 0.4, 1]}
            style={StyleSheet.absoluteFill}
          />

          <View style={[s.heroContent, { paddingTop: insets.top + 60 }]}>
            {/* Title */}
            <Text style={s.heroLine1}>{heroLine1}</Text>
            <Text style={s.heroLine2}>{heroLine2}</Text>
            <View style={s.heroUnderline} />

            {/* Date pill */}
            <View style={s.datePill}>
              <Text style={s.datePillText}>{fmtHeroDate(tournament.eventDate)}</Text>
            </View>

            {/* Location */}
            <TouchableOpacity
              style={s.locationRow}
              activeOpacity={0.75}
              onPress={scrollToLocation}
            >
              <Ionicons name="location" size={14} color="rgba(255,255,255,0.9)" />
              <View>
                <Text style={s.locationName}>{tournament.venue}</Text>
                <Text style={s.locationCity}>{tournament.city}, {tournament.state}</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.6)" style={{ marginLeft: 2, marginTop: 2 }} />
            </TouchableOpacity>

          </View>
        </View>

        {/* WHITE CONTENT (overlaps hero) */}
        <View style={s.whiteSheet} onLayout={e => { sheetY.current = e.nativeEvent.layout.y; }}>

          {/* STATUS CHIPS */}
          <View style={s.statusRow}>
            {playerRegStatus && (
              <StatusChip
                label={getPlayerRegStatusInfo(playerRegStatus).label}
                variant={getPlayerRegStatusInfo(playerRegStatus).variant}
              />
            )}
            <StatusChip
              label={getTournamentStatusInfo(tournamentStatusKey).label}
              variant={getTournamentStatusInfo(tournamentStatusKey).variant}
            />
            {(tournament.skillMin !== 0 || tournament.skillMax !== 0) && (
              <StatusChip
                label={`${tournament.skillMin}–${tournament.skillMax}`}
                variant="green"
                icon="speedometer-outline"
              />
            )}
          </View>

          {/* ABOUT THIS EVENT
              Was a hardcoded paragraph about "3 days of competitive play in
              Sarasota" shown identically on every tournament, including ones in
              other states. tournaments.description is real and is null on most
              rows, so the section now renders only when there is something to
              say — or, for this tournament's own director, offers a prompt to
              write one. Showing invented copy under a confident heading is the
              pattern this app has been removing all week. */}
          {tournament.description ? (
            <View style={s.section}>
              <Text style={[s.sectionTitle, { marginBottom: 12 }]}>ABOUT THIS EVENT</Text>
              <Text style={s.description}>{tournament.description}</Text>
            </View>
          ) : isThisDirector ? (
            <View style={s.section}>
              <Text style={[s.sectionTitle, { marginBottom: 12 }]}>ABOUT THIS EVENT</Text>
              <TouchableOpacity
                style={s.aboutPrompt}
                activeOpacity={0.8}
                onPress={() => router.push(`/tournament/${tournament.id}/workspace` as never)}
                accessibilityRole="button"
                accessibilityLabel="Add a description for this tournament"
              >
                <Ionicons name="create-outline" size={16} color={L.gold} />
                <Text style={s.aboutPromptText}>
                  Add a description so players know what to expect — format, schedule, what to bring.
                </Text>
                <Ionicons name="chevron-forward" size={15} color={L.textMuted} />
              </TouchableOpacity>
            </View>
          ) : null}


          {/* VIEW BRACKETS BANNER — only when brackets have been generated */}
          {hasBrackets && (
            <TouchableOpacity
              style={s.bracketsBanner}
              activeOpacity={0.8}
              onPress={() => router.push(`/tournament/${tournament.id}/player-brackets` as never)}
            >
              <Ionicons name="git-branch-outline" size={15} color={L.navy} />
              <Text style={s.bracketsBannerText}>View Brackets</Text>
              <Ionicons name="chevron-forward" size={14} color={L.textSub} />
            </TouchableOpacity>
          )}

          {/* VIEW RESULTS BANNER — only when tournament is completed */}
          {isTournamentCompleted(tournament.id) && (
            <TouchableOpacity
              style={s.resultsBanner}
              activeOpacity={0.8}
              onPress={() => router.push(`/tournament/${tournament.id}/player-results` as never)}
            >
              <Ionicons name="trophy-outline" size={15} color={L.gold} />
              <Text style={s.resultsBannerText}>View Results</Text>
              <Ionicons name="chevron-forward" size={14} color={L.textSub} />
            </TouchableOpacity>
          )}

          {/* AMENITIES — up to three chips the director actually chose.
              Hidden entirely when none are set: an empty strip says nothing,
              and the invented copy this replaced said something untrue. */}
          {amenities.length > 0 && (
            <View style={s.amenitiesRow}>
              {amenities.map((a, i) => (
                <React.Fragment key={a.key}>
                  {i > 0 && <View style={s.amenityDivider} />}
                  <View style={s.amenityItem}>
                    <Ionicons name={a.icon} size={22} color={L.gold} />
                    <Text style={s.amenityTitle} numberOfLines={1}>{a.title}</Text>
                    <Text style={s.amenitySub} numberOfLines={1}>{a.sub}</Text>
                  </View>
                </React.Fragment>
              ))}
            </View>
          )}

          {/* DIVISIONS */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>DIVISIONS</Text>
              <View style={s.edtRow}>
                <Ionicons name="time-outline" size={13} color={L.textMuted} />
                <Text style={s.edtText}>All times in EDT</Text>
              </View>
            </View>

            {divisions.length === 0 ? (
              <View style={s.noDivisionsState}>
                <Ionicons name="layers-outline" size={28} color={L.textSub} />
                <Text style={s.noDivisionsText}>No divisions available yet.</Text>
                <Text style={s.noDivisionsSub}>Check back soon — divisions will appear once configured.</Text>
              </View>
            ) : (
              <View style={s.divisionsCard}>
                {divisions.map((d) => {
                  const regAvailability = getRegistrationAvailability(tournament);
                  const displayStatus: DivDisplayStatus =
                    regDivIds.has(d.id)  ? 'registered' :
                    heldDivIds.has(d.id) ? 'held'        :
                    d.status === 'open'  ? 'available'   : 'waitlist';

                  return (
                    <DivisionRow
                      key={d.id}
                      d={d}
                      displayStatus={displayStatus}
                      pastEvent={regAvailability.reason === 'completed'}
                      onPress={() => {
                        if (displayStatus === 'registered') return;
                        if (displayStatus === 'waitlist') {
                          Alert.alert('Waitlist Only', 'This division is full. Waitlist registration coming soon.');
                          return;
                        }
                        if (!regAvailability.available) {
                          Alert.alert('Registration Unavailable', regAvailability.label);
                          return;
                        }
                        if (displayStatus === 'held') {
                          router.push({
                            pathname: `/tournament/${tournament.id}/register` as never,
                            params: {
                              tournamentName:   tournament.name,
                              divisionId:       d.id,
                              divisionName:     d.name,
                              divisionLevel:    d.level,
                              holdAmountCents:  String(tournament.holdFeeCents),
                              // This division's fee, not the tournament base fee.
                              entryAmountCents: String(effectiveEntryFeeCents(d.entryFeeCents, tournament.entryFeeCents)),
                              date:             tournament.date,
                              venue:            tournament.venue,
                              city:             tournament.city,
                              state:            tournament.state,
                            },
                          } as never);
                          return;
                        }
                        router.push({
                          pathname: `/tournament/${tournament.id}/hold-confirm` as never,
                          params: { divisionId: d.id },
                        } as never);
                      }}
                    />
                  );
                })}
              </View>
            )}
          </View>

          {/* REGISTRATION & FEES */}
          <View style={s.section}>
            <Text style={[s.sectionTitle, { marginBottom: 12 }]}>REGISTRATION & FEES</Text>

            <View style={s.feesCard}>
              <View style={s.feesGrid}>
                <View style={s.feeRow}>
                  <Ionicons name="calendar-outline" size={20} color={L.textSub} style={s.feeIcon} />
                  <View style={s.feeTextCol}>
                    <Text style={s.feeLabel}>Registration Opens</Text>
                    {(() => {
                      const opens = fmtRegDateTime(tournament.registrationOpensAt);
                      return opens ? (
                        <Text style={s.feeValue}>{opens.date} <Text style={s.feeUnit}>{opens.time}</Text></Text>
                      ) : (
                        <Text style={s.feeValue}>Open now</Text>
                      );
                    })()}
                  </View>
                </View>
                <View style={s.feeRow}>
                  <Ionicons name="calendar-outline" size={20} color={L.textSub} style={s.feeIcon} />
                  <View style={s.feeTextCol}>
                    <Text style={s.feeLabel}>Registration Closes</Text>
                    {(() => {
                      const closes = fmtRegDateTime(tournament.registrationClosesAt);
                      return closes ? (
                        <Text style={s.feeValue}>{closes.date} <Text style={s.feeUnit}>{closes.time}</Text></Text>
                      ) : (
                        <Text style={s.feeValue}>Not set</Text>
                      );
                    })()}
                  </View>
                </View>
                <View style={s.feeRow}>
                  <Ionicons name="cash-outline" size={20} color={L.textSub} style={s.feeIcon} />
                  <View style={s.feeTextCol}>
                    <Text style={s.feeLabel}>Entry Fee</Text>
                    <Text style={s.feeValue}>{fmt(tournament.entryFeeCents)} <Text style={s.feeUnit}>/ {entryUnitLabel.toLowerCase()} · Per Division</Text></Text>
                  </View>
                </View>
                <View style={[s.feeRow, s.feeRowLast]}>
                  <Ionicons name="shield-outline" size={20} color={L.textSub} style={s.feeIcon} />
                  <View style={s.feeTextCol}>
                    <View style={s.feeSubRow}>
                      <Text style={s.feeLabel}>Hold My Spot</Text>
                      <TouchableOpacity
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        onPress={() => setHoldTooltip(true)}
                      >
                        <Ionicons name="information-circle-outline" size={13} color={L.gold} />
                      </TouchableOpacity>
                    </View>
                    <Text style={s.feeValue}>{fmt(tournament.holdFeeCents)} <Text style={s.feeUnit}>Applied to entry fee</Text></Text>
                  </View>
                </View>
              </View>

              <View style={s.feesNote}>
                {/* hand-left, not star: this note is about Hold My Spot, and a
                    star reads as a rating or a favourite rather than a hold. */}
                <Ionicons name="hand-left" size={14} color={L.gold} />
                <Text style={s.feesNoteText}>
                  Hold My Spot secures your place. Full balance due before registration closes.
                </Text>
                <TouchableOpacity onPress={() => Alert.alert('Hold My Spot', 'Reserve your place with a deposit. The deposit counts toward your entry fee and is non-refundable.')}>
                  <Text style={s.learnMore}>Learn More</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
          {/* HOST CARD */}
          <Text style={s.sectionTitleStandalone}>ORGANIZER</Text>
          <View style={s.hostCard}>
            <TouchableOpacity
              style={s.hostLeft}
              activeOpacity={0.75}
              onPress={() => setDirectorModalVisible(true)}
            >
              <Image source={{ uri: directorProfile?.avatar_url ?? DIRECTOR_PHOTO }} style={s.hostAvatar} />
              <View style={s.hostInfo}>
                <Text style={s.hostedBy}>Hosted by</Text>
                <View style={s.hostNameRow}>
                  <Text style={s.hostName}>{directorProfile?.full_name ?? 'Tournament Director'}</Text>
                  <Ionicons name="checkmark-circle" size={16} color="#3B82F6" style={{ marginLeft: 4 }} />
                </View>
                <View style={s.directorPill}>
                  <Ionicons name="sync-circle-outline" size={12} color={L.gold} />
                  <Text style={s.directorText}>DIRECTOR</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color={L.textMuted} style={{ alignSelf: 'center' }} />
            </TouchableOpacity>

            <TouchableOpacity
              style={s.msgDirectorBtn}
              activeOpacity={0.8}
              disabled={msgingDirector}
              onPress={openDirectorDM}
            >
              {msgingDirector
                ? <ActivityIndicator size="small" color={L.navy} />
                : <Ionicons name="chatbubble-outline" size={15} color={L.navy} />}
              <Text style={s.msgDirectorText}>Message Director</Text>
            </TouchableOpacity>

            {/* Real contextual tournament group chat — directors and registered/held players only */}
            {(playerRegStatus != null || (!!user && user.id === directorUserId)) && (
              <TouchableOpacity
                style={s.msgDirectorBtn}
                activeOpacity={0.8}
                onPress={() => router.push(`/conversation/tournament-${id}` as never)}
              >
                <Ionicons name="chatbubbles-outline" size={15} color={L.navy} />
                <Text style={s.msgDirectorText}>Tournament Chat</Text>
              </TouchableOpacity>
            )}

            {/* DIRECTOR BANNER — only this tournament's own director */}
            {isThisDirector && (
              <TouchableOpacity
                style={s.directorBanner}
                activeOpacity={0.8}
                onPress={() => router.push(`/tournament/${tournament.id}/workspace` as never)}
              >
                <Ionicons name="construct-outline" size={15} color={L.gold} />
                <Text style={s.directorBannerText}>Director: Manage Tournament</Text>
                <Ionicons name="chevron-forward" size={14} color={L.textSub} />
              </TouchableOpacity>
            )}

            <View style={s.hostDivider} />

            <View style={s.hostStats}>
              <DirectorStatsRow />
              <TouchableOpacity
                style={s.hostMore}
                onPress={() => setDirectorModalVisible(true)}
              >
                <Ionicons name="chevron-forward" size={20} color={L.textMuted} />
              </TouchableOpacity>
            </View>
          </View>

          {/* LOCATION */}
          <Text style={s.sectionTitleStandalone}>LOCATION</Text>
          {(() => {
            const access = facility ? facilityAccessType(facility) : null;
            const BADGE = {
              public: { label: 'Public',     bg: '#DCFCE7', color: '#16A34A' },
              membership: { label: 'Membership', bg: '#FEF9C3', color: '#CA8A04' },
              private: { label: 'Private',    bg: '#FEE2E2', color: '#DC2626' },
            }[access ?? 'public'];
            const cityState = [tournament.city, tournament.state].filter(Boolean).join(', ');
            return (
              <View style={s.locationWrap} onLayout={e => { locationY.current = e.nativeEvent.layout.y; }}>
                <LocationCard
                  name={facility?.name ?? tournament.venue}
                  addressLines={[facility?.address ?? tournament.venueAddress, cityState]}
                  latitude={facility?.latitude}
                  longitude={facility?.longitude}
                  verified={facility?.verified}
                  // Coordinates when we have them: an address string sends the
                  // maps app to whatever it geocodes, which for a court inside
                  // a park is the park entrance, not the court.
                  directionsQuery={
                    facility?.latitude != null && facility?.longitude != null
                      ? `${facility.latitude},${facility.longitude}`
                      : [facility?.address ?? tournament.venueAddress ?? tournament.venue, cityState]
                          .filter(Boolean).join(', ')
                  }
                  // Access and court count have no community-event equivalent,
                  // so they ride in the card's meta slot rather than being lost
                  // in the swap from the old compact row. Absent entirely when
                  // the tournament has no facility record to describe.
                  meta={facility ? (
                    <View style={fc.meta}>
                      <View style={[fc.accessBadge, { backgroundColor: BADGE.bg }]}>
                        <Text style={[fc.accessText, { color: BADGE.color }]}>{BADGE.label}</Text>
                      </View>
                      <Text style={fc.courts}>{facility.court_count} {facility.court_count === 1 ? 'Court' : 'Courts'}</Text>
                    </View>
                  ) : undefined}
                  onViewFacility={facility ? () => router.push(`/facility/${facility.id}` as never) : undefined}
                />
              </View>
            );
          })()}


        </View>
      </Animated.ScrollView>

      {/* ── HOLD MY SPOT TOOLTIP ── */}
      <InfoTooltip
        visible={holdTooltip}
        onClose={() => setHoldTooltip(false)}
        icon="shield-checkmark-outline"
        title="Hold My Spot"
        body={`Reserve your spot with a ${fmt(tournament.holdFeeCents)} deposit. The deposit is applied toward your entry fee and is non-refundable.`}
        footer="Full registration is still required before registration closes."
      />

      {/* ── DIRECTOR PROFILE SHEET ── */}
      <Modal
        visible={directorModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDirectorModalVisible(false)}
      >
        <Pressable style={sheet.backdrop} onPress={() => setDirectorModalVisible(false)}>
          <Pressable style={[sheet.card, { paddingBottom: insets.bottom + 16 }]} onPress={() => {}}>
            <View style={sheet.handle} />
            <View style={sheet.header}>
              <Text style={sheet.title}>Tournament Director</Text>
              <TouchableOpacity onPress={() => setDirectorModalVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={L.textSub} />
              </TouchableOpacity>
            </View>

            <View style={sheet.directorHeader}>
              <Image source={{ uri: directorProfile?.avatar_url ?? DIRECTOR_PHOTO }} style={sheet.directorAvatar} />
              <View style={{ flex: 1 }}>
                <View style={s.hostNameRow}>
                  <Text style={sheet.directorName}>{directorProfile?.full_name ?? 'Tournament Director'}</Text>
                  <Ionicons name="checkmark-circle" size={16} color="#3B82F6" style={{ marginLeft: 4 }} />
                </View>
                <View style={s.directorPill}>
                  <Ionicons name="sync-circle-outline" size={12} color={L.gold} />
                  <Text style={s.directorText}>DIRECTOR</Text>
                </View>
              </View>
            </View>

            {directorProfile?.bio && (
              <Text style={sheet.directorBio}>{directorProfile.bio}</Text>
            )}

            <View style={[s.hostStats, { paddingHorizontal: 0 }]}>
              <DirectorStatsRow />
            </View>

            <TouchableOpacity
              style={sheet.primaryBtn}
              activeOpacity={0.85}
              disabled={msgingDirector}
              onPress={() => { setDirectorModalVisible(false); openDirectorDM(); }}
            >
              {msgingDirector
                ? <ActivityIndicator size="small" color="#FFFFFF" />
                : <Ionicons name="chatbubble-outline" size={16} color="#FFFFFF" />}
              <Text style={sheet.primaryBtnText}>Message Director</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── FIXED BOTTOM BAR ── */}
      <View
        style={[s.bottomBar, { paddingBottom: insets.bottom + 12 }]}
        onLayout={e => {
          // The bar already includes the safe-area inset the button adds
          // itself, so report only the part above it — otherwise the inset
          // is counted twice and the button floats too high.
          const h = Math.round(Math.max(0, e.nativeEvent.layout.height - insets.bottom));
          setCtaBarHeight(prev => (prev === h ? prev : h));
        }}
      >
        <View style={s.ctaStack}>
          {/* Registration CTA (state-driven) */}
          {(() => {
            const regAvailability = getRegistrationAvailability(tournament);

            // If registration is not yet available due to opens_at, show a single banner row
            if (!regAvailability.available && !anyRegistered && !anyHeld) {
              return (
                <View style={s.regUnavailableRow}>
                  <Ionicons
                    name={regAvailability.reason === 'not_open_yet' ? 'time-outline' : 'lock-closed-outline'}
                    size={16}
                    color={L.textSub}
                  />
                  <Text style={s.regUnavailableText}>{regAvailability.label}</Text>
                </View>
              );
            }

            // A held-but-unregistered spot on a tournament that's no longer
            // available (e.g. completed) has nothing left to do — grey it out
            // instead of the normal gold "still active" hold styling.
            const heldGreyedOut = anyHeld && !anyRegistered && !regAvailability.available;

            return (
              <>
                {/* Register / complete / registered — top, primary */}
                {anyRegistered ? (
                  <View style={[s.registerBtn, s.registerBtnDone]}>
                    <Text style={s.registerBtnDoneLabel}>Registered ✓</Text>
                  </View>
                ) : anyHeld && !regAvailability.available ? (
                  <View style={[s.registerBtn, s.registerBtnDisabled]}>
                    <Text style={s.registerBtnDisabledLabel}>{regAvailability.label}</Text>
                  </View>
                ) : anyHeld ? (
                  <TouchableOpacity
                    style={[s.registerBtn, s.registerBtnComplete]}
                    activeOpacity={0.85}
                    onPress={() => {
                      const heldSpot = heldSpots[0];
                      if (!heldSpot) {
                        router.push({
                          pathname: `/tournament/${id}/select-division` as never,
                          params: { intent: 'register' },
                        } as never);
                        return;
                      }
                      router.push({
                        pathname: `/tournament/${id}/register` as never,
                        params: {
                          tournamentName:   tournament.name,
                          divisionId:       heldSpot.divisionId,
                          divisionName:     heldSpot.divisionName,
                          divisionLevel:    heldSpot.divisionLevel,
                          holdAmountCents:  String(heldSpot.holdAmountCents),
                          entryAmountCents: String(heldSpot.entryAmountCents),
                          date:             tournament.date,
                          venue:            tournament.venue,
                          city:             tournament.city,
                          state:            tournament.state,
                        },
                      } as never);
                    }}
                  >
                    <Text style={s.registerBtnLabel}>Complete Registration</Text>
                    <Text style={s.registerBtnSub}>
                      {fmt(heldSpots[0]
                        ? balanceDueCents(heldSpots[0].entryAmountCents, heldSpots[0].holdAmountCents)
                        : balanceDueCents(tournament.entryFeeCents, tournament.holdFeeCents))} Balance
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={s.registerBtn}
                    activeOpacity={0.85}
                    onPress={() => {
                      if (!regAvailability.available) {
                        Alert.alert('Registration Unavailable', regAvailability.label);
                        return;
                      }
                      router.push({
                        pathname: `/tournament/${tournament.id}/select-division` as never,
                        params: { intent: 'register' },
                      } as never);
                    }}
                  >
                    <Text style={s.registerBtnLabel}>Register Now</Text>
                    <Text style={s.registerBtnSub}>{fmt(tournament.entryFeeCents)} / {entryUnitLabel}</Text>
                  </TouchableOpacity>
                )}

                {/* Hold — middle, secondary. Collapsed by default; scroll up to reveal. */}
                {ctasExpanded && (
                <TouchableOpacity
                  style={[s.holdBtn, anyRegistered && s.holdBtnNav, heldGreyedOut && s.holdBtnDisabled]}
                  activeOpacity={0.85}
                  onPress={() => {
                    if (anyRegistered) { router.push('/my-tournaments' as never); return; }
                    if (!regAvailability.available) {
                      Alert.alert('Registration Unavailable', regAvailability.label);
                      return;
                    }
                    router.push({
                      pathname: `/tournament/${tournament.id}/select-division` as never,
                      params: { intent: 'hold' },
                    } as never);
                  }}
                >
                  <View style={s.holdBtnLabelRow}>
                    <Text style={[
                      s.holdBtnLabel,
                      anyRegistered && s.holdBtnNavLabel,
                      heldGreyedOut && s.holdBtnDisabledLabel,
                    ]}>
                      {anyRegistered ? 'View My Tournaments' : anyHeld ? 'Held ✓' : 'Hold My Spot'}
                    </Text>
                    {!anyRegistered && !anyHeld && (
                      <TouchableOpacity
                        onPress={() => setHoldTooltip(true)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
                        activeOpacity={0.6}
                      >
                        <Ionicons name="information-circle-outline" size={14} color={L.gold} />
                      </TouchableOpacity>
                    )}
                  </View>
                  {!anyRegistered && (
                    <Text style={[s.holdBtnSub, heldGreyedOut && s.holdBtnDisabledLabel]}>
                      {fmt(tournament.holdFeeCents)} Deposit
                    </Text>
                  )}
                </TouchableOpacity>
                )}
              </>
            );
          })()}

          {/* Save, or See Results once the tournament is over — bottom, tertiary. Collapsed by default; scroll up to reveal. */}
          {ctasExpanded && (
            getRegistrationAvailability(tournament).reason === 'completed' ? (
              <TouchableOpacity
                style={s.saveBtn}
                activeOpacity={resultsAvailable ? 0.75 : 1}
                disabled={!resultsAvailable}
                onPress={() => router.push(`/tournament/${tournament.id}/player-results` as never)}
              >
                <Ionicons name="trophy-outline" size={18} color={resultsAvailable ? L.navy : L.textMuted} />
                <Text style={[s.saveBtnText, !resultsAvailable && { color: L.textMuted }]}>
                  {resultsAvailable ? 'See Results' : 'Results Not Available Yet'}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={s.saveBtn} onPress={() => toggleBookmark(id)} activeOpacity={0.75}>
                <Ionicons name={isBookmarked(id) ? 'bookmark' : 'bookmark-outline'} size={18} color={isBookmarked(id) ? L.gold : L.navy} />
                <Text style={[s.saveBtnText, isBookmarked(id) && { color: L.gold }]}>
                  {isBookmarked(id) ? 'Saved' : 'Save Tournament'}
                </Text>
              </TouchableOpacity>
            )
          )}
        </View>
      </View>
    </View>
  );
}

// ─── Facility card styles ──────────────────────────────────────────────────────

// What survives of the old compact facility row: the access badge and court
// count, which LocationCard has no opinion about and renders via `meta`.
const fc = StyleSheet.create({
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 },
  accessBadge: { borderRadius: shape.badge, paddingHorizontal: 7, paddingVertical: 2 },
  accessText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },
  courts: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500' },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.bg },

  // Floating top controls
  topControls: {
    position: 'absolute', left: 16, right: 16, zIndex: 20,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  topCircle: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.40)',
    alignItems: 'center', justifyContent: 'center',
  },
  topRight: { flexDirection: 'row', gap: 8 },

  // Hero
  hero: { width: '100%', overflow: 'hidden' },
  heroContent: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    justifyContent: 'flex-end',
    paddingBottom: spacing.xxxl + spacing.lg,
  },
  heroLine1: {
    color: '#FFFFFF', fontSize: text.heroTitle.size, fontWeight: '800', letterSpacing: 0.5,
  },
  heroLine2: {
    color: '#FFFFFF', fontSize: text.heroTitle.size, fontWeight: '800', letterSpacing: 0.5,
    marginBottom: 6,
  },
  heroUnderline: {
    width: 80, height: 3, backgroundColor: L.gold, borderRadius: 2, marginBottom: 16,
  },
  datePill: {
    alignSelf: 'flex-start',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: shape.badge, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, marginBottom: spacing.md,
  },
  datePillText: { color: '#FFFFFF', fontSize: text.chipValue.size, fontWeight: '800' },
  locationRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  locationName: { color: '#FFFFFF', fontSize: text.rowTitle.size, fontWeight: '700' },
  locationCity: { color: 'rgba(255,255,255,0.75)', fontSize: text.caption.size, fontWeight: '500' },
  statusRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14,
  },

  // White sheet
  whiteSheet: {
    backgroundColor: L.bg,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    marginTop: -24, paddingTop: 4,
    paddingBottom: 8,
  },

  // Host card
  hostCard: {
    marginHorizontal: 16, marginTop: 0, marginBottom: 18,
    borderRadius: shape.card, borderWidth: 1, borderColor: L.border,
    backgroundColor: L.bg,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  hostLeft: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    padding: 16,
  },
  hostAvatar: { width: 56, height: 56, borderRadius: 28, flexShrink: 0 },
  hostInfo: { flex: 1 },
  hostedBy: { color: L.textMuted, fontSize: text.caption.size, fontWeight: '500', marginBottom: 1 },
  hostNameRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  hostName: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800', textTransform: 'uppercase' },
  directorPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start',
    borderWidth: 1.5, borderColor: L.gold, borderRadius: shape.pill,
    paddingHorizontal: 10, paddingVertical: 3, marginBottom: 5,
  },
  directorText: { color: L.gold, fontSize: text.cardLabel.size, fontWeight: '800', letterSpacing: text.cardLabel.letterSpacing },

  hostDivider: { height: 1, backgroundColor: L.border, marginHorizontal: 16, marginTop: 14 },

  hostStats: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, gap: 4,
  },
  hostStat: { flex: 1, alignItems: 'center', gap: 4 },
  hostStatNum: { color: L.navy, fontSize: text.statValueSm.size, fontWeight: '900' },
  hostStatLabel: { color: L.textMuted, fontSize: 10, fontWeight: '500', textAlign: 'center', lineHeight: 14 },
  hostMore: { paddingLeft: 8 },

  msgDirectorBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginHorizontal: 16, marginTop: 14, marginBottom: 4,
    borderWidth: 1.5, borderColor: L.gold, borderRadius: shape.cta,
    paddingVertical: 10, backgroundColor: L.page,
  },
  msgDirectorText: { color: L.navy, fontSize: text.action.size, fontWeight: '800' },

  directorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    // marginTop matches the rhythm of the two buttons above it in the card's
    // CTA stack; without it the banner sat 4px under Tournament Chat.
    marginHorizontal: 16, marginTop: 10, marginBottom: 8,
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: L.goldLight, borderRadius: shape.panel,
    borderWidth: 1, borderColor: colors.goldBorder,
  },
  directorBannerText: { flex: 1, color: L.navy, fontSize: text.action.size, fontWeight: '800' },

  bracketsBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 8,
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: L.bg, borderRadius: shape.panel,
    borderWidth: 1, borderColor: L.border,
  },
  bracketsBannerText: { flex: 1, color: L.navy, fontSize: text.action.size, fontWeight: '800' },

  resultsBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 14,
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: L.goldLight, borderRadius: shape.panel,
    borderWidth: 1, borderColor: colors.goldBorder,
  },
  resultsBannerText: { flex: 1, color: L.navy, fontSize: text.action.size, fontWeight: '800' },

  // Description
  description: {
    color: L.text, fontSize: text.body.size, lineHeight: 22, fontWeight: '500',
    paddingHorizontal: 16, marginBottom: 18,
  },
  aboutPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: L.border,
    borderRadius: shape.panel,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  aboutPromptText: { flex: 1, color: L.textMuted, fontSize: text.caption.size, fontWeight: '500', lineHeight: 18 },

  // Amenities — one tinted strip with hairline dividers, rather than four
  // separate bordered cards. `alignItems: 'stretch'` is what lets the dividers
  // take their height from the row instead of needing a hardcoded one.
  amenitiesRow: {
    flexDirection: 'row', alignItems: 'stretch',
    marginHorizontal: 16, marginBottom: 24,
    borderRadius: shape.card,
    backgroundColor: L.page,
    paddingVertical: 14,
  },
  amenityItem: {
    flex: 1, alignItems: 'center', justifyContent: 'flex-start',
    gap: 5, paddingHorizontal: 4,
  },
  amenityDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: L.border,
    // Inset so the rule stops short of the strip's padding, matching the
    // reference where dividers span the content rather than the full height.
    marginVertical: 2,
  },
  amenityTitle: { color: L.navy,    fontSize: text.cardLabel.size, fontWeight: '800', letterSpacing: text.cardLabel.letterSpacing, textAlign: 'center' },
  amenitySub: { color: L.textMuted, fontSize: 10, textAlign: 'center' },

  // Section
  section: { marginBottom: 24, paddingHorizontal: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { color: L.navy, fontSize: text.sectionLabel.size, fontWeight: '800', letterSpacing: text.sectionLabel.letterSpacing },
  // For headings whose content is a card that carries its own horizontal
  // margin, so it cannot sit inside s.section without doubling the inset to 32.
  locationWrap: { marginHorizontal: 16, marginBottom: 18 },
  sectionTitleStandalone: {
    color: L.navy, fontSize: text.sectionLabel.size, fontWeight: '800', letterSpacing: text.sectionLabel.letterSpacing,
    paddingHorizontal: 16, marginBottom: 12,
  },
  edtRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  edtText: { color: L.textMuted, fontSize: text.caption.size, fontWeight: '500' },

  // Divisions card
  divisionsCard: {
    borderWidth: 1, borderColor: L.border, borderRadius: shape.card, overflow: 'hidden',
    backgroundColor: L.bg,
  },
  viewAllBtn: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6,
    paddingVertical: 14,
  },
  viewAllText: { color: L.navy, fontSize: text.link.size, fontWeight: '700' },

  noDivisionsState: {
    alignItems: 'center', gap: 6, paddingVertical: 28,
    backgroundColor: L.bg, borderRadius: shape.card, borderWidth: 1, borderColor: L.border,
  },
  noDivisionsText: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800' },
  noDivisionsSub: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', textAlign: 'center', paddingHorizontal: 24 },

  // Fees card
  feesCard: {
    borderWidth: 1, borderColor: L.border, borderRadius: shape.card, overflow: 'hidden',
    backgroundColor: L.bg,
  },
  feesGrid: {
    flexDirection: 'column',
  },
  feeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: L.border,
  },
  feeRowLast: { borderBottomWidth: 0 },
  feeIcon: { flexShrink: 0 },
  feeTextCol: { flex: 1, gap: 3 },
  feeLabel: { color: L.textMuted, fontSize: 10, fontWeight: '600', lineHeight: 14 },
  feeValue: { color: L.navy,     fontSize: text.rowValue.size, fontWeight: '800' },
  feeUnit: { fontSize: text.caption.size, fontWeight: '500', color: L.textMuted },
  feeSub: { color: L.textMuted, fontSize: 10 },
  feeSubRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },

  feesNote: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5,
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: L.goldLight,
  },
  feesNoteText: { color: L.text, fontSize: text.caption.size, fontWeight: '500', flex: 1 },
  learnMore: { color: L.gold, fontSize: text.link.size, fontWeight: '700' },

  // Bottom bar — 2-row layout
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: L.bg, borderTopWidth: 1, borderTopColor: L.border,
    paddingHorizontal: 16, paddingTop: 10,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: -3 },
    elevation: 8,
  },

  // Three equally-weighted stacked CTAs: Register, Hold, Save
  ctaStack: { gap: 10 },

  // Bottom — Save Tournament / See Results, same size/weight as the others
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderColor: L.border, borderRadius: shape.cta,
    minHeight: 56,
  },
  saveBtnText: { color: L.navy, fontSize: text.action.size, fontWeight: '800' },

  // Registration unavailable banner
  regUnavailableRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14,
  },
  regUnavailableText: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500' },

  // Middle — Hold, full width
  holdBtn: {
    alignItems: 'center',
    borderWidth: 1.5, borderColor: L.gold, borderRadius: shape.cta,
    paddingVertical: 12, paddingHorizontal: 8,
    minHeight: 56,
    justifyContent: 'center',
  },
  holdBtnNav: { borderColor: L.navy },
  holdBtnDisabled: { borderColor: L.border },
  holdBtnLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  holdBtnLabel: { color: L.gold,  fontSize: text.actionLarge.size, fontWeight: '800', textAlign: 'center' },
  holdBtnNavLabel: { color: L.navy },
  holdBtnDisabledLabel: { color: L.textMuted },
  holdBtnSub: { color: L.gold,  fontSize: text.caption.size, fontWeight: '500', textAlign: 'center', marginTop: 1 },

  registerBtn: {
    alignItems: 'center',
    backgroundColor: L.gold, borderRadius: shape.cta,
    paddingVertical: 12, paddingHorizontal: 8,
    minHeight: 56,
    justifyContent: 'center',
  },
  registerBtnLabel: { color: '#FFFFFF', fontSize: text.actionLarge.size, fontWeight: '800', textAlign: 'center' },
  registerBtnSub: { color: 'rgba(255,255,255,0.85)', fontSize: text.caption.size, fontWeight: '500', textAlign: 'center', marginTop: 1 },
  registerBtnComplete: { backgroundColor: L.navy },
  registerBtnDone: { backgroundColor: L.green, alignItems: 'center', justifyContent: 'center' },
  registerBtnDoneLabel: { color: '#FFFFFF', fontSize: text.actionLarge.size, fontWeight: '800', textAlign: 'center' },
  registerBtnDisabled: { backgroundColor: L.page, borderWidth: 1, borderColor: L.border, alignItems: 'center', justifyContent: 'center' },
  registerBtnDisabledLabel: { color: L.textMuted, fontSize: text.actionLarge.size, fontWeight: '800', textAlign: 'center' },
});

// ─── Tooltip styles ───────────────────────────────────────────────────────────


// ─── Bottom sheet styles (venue map / director profile) ───────────────────────

const sheet = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(10,18,40,0.55)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: L.bg,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 10,
    shadowColor: '#000', shadowOpacity: 0.18,
    shadowRadius: 20, shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: L.border, alignSelf: 'center', marginBottom: 16,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: { color: L.navy, fontSize: text.modalTitle.size, fontWeight: '900' },


  directorHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  directorAvatar: { width: 64, height: 64, borderRadius: 32 },
  directorName: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800', textTransform: 'uppercase' },
  directorBio: { color: L.text, fontSize: text.caption.size, fontWeight: '500', lineHeight: 20, marginBottom: 14 },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: L.navy, borderRadius: shape.cta,
    paddingVertical: 14, marginTop: 4,
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: text.actionLarge.size, fontWeight: '800' },
});
