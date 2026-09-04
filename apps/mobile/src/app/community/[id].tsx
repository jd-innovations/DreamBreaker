import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
  Modal, Pressable, Alert, Linking, Animated, Share,
  type NativeSyntheticEvent, type NativeScrollEvent,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { createCommunityShareMessage } from '@/lib/communityShare';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing } from '@/theme';
import { ErrorState } from '@/components/states/ScreenState';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { goBack } from '@/lib/navigation';
import { supabase } from '@/lib/supabase';
import { platformAlert } from '@/lib/platformAlert';
import { eventCoverUri } from '@/lib/eventCover';
import { AppIcon, PickleballIcon, JoinCelebration, Avatar, ManageEventSheet, AddToCalendarButton, type AppIconName } from '@/components';
import { appLinks } from '@/lib/appLinks';
import { withLink, type CalendarEventInput } from '@/lib/calendarEvents';
import {
  getOrCreateConversation,
  getOrCreatePlayEventConversation,
  fetchMessages,
  sendMessage as sendChatMessage,
  subscribeToConversation,
  markConversationRead,
  type Message,
} from '@/lib/conversationService';
import {
  fetchPlayEventWithOrganizer, fetchPlayParticipants, fetchMyPlayParticipant, claimGuestParticipants, addPlayParticipant,
  removePlayParticipant, cancelPlayEvent,
  joinEventErrorMessage, skillLabel,
  type PlayEventWithOrganizer,
} from '@/lib/supabase/playEvents';
import { fetchEventWeather, type EventWeatherResult } from '@/lib/supabase/weather';
import { EventWeatherCard } from '@/components/EventWeatherCard';
import { fetchFacilityById, type FacilityDetail } from '@/lib/supabase/facilities';
import { VenueMapCard } from '@/components/VenueMapCard';
import { useSession } from '@/hooks/useSession';
import { useSupportContext } from '@/lib/support/supportContext';

// Theme-backed alias — brand values resolve from @/theme.
const L = {
  bg:          colors.bg,
  page:        colors.page,
  navy:        colors.navy,
  gold:        colors.gold,
  goldLight:   colors.goldLight,
  goldBg:      colors.goldBg,
  goldBorder:  colors.goldBorder,
  text:        colors.text,
  textSub:     colors.textSub,
  textMuted:   colors.textSub,
  border:      colors.border,
  green:       colors.success,
  greenBg:     colors.successBg,
  greenBorder: '#BBF7D0',
  danger:      colors.danger,
  dangerBg:    colors.dangerBg,
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Hero height drives both the layout and the scroll-zoom interpolation, so the
// two cannot drift apart. See s.hero and the heroScale interpolation.
const HERO_HEIGHT = 324;

// ─── Mock: events ─────────────────────────────────────────────────────────────

// Every route into this screen passes a UUID from the database: the home and
// nearby feeds, saved events, chat's relatedPlayEventId, a player's profile,
// and quick-game-created (which only navigates here when `isSupabase`).
//
// There was previously a table of four hardcoded demo events plus
// `const FALLBACK = EVENTS['1']`, and the render read
// `liveEvent ?? (EVENTS[id] ?? FALLBACK)`. So any id that was not a UUID --
// a stray deep link, a typo, a stale push payload -- rendered "Wednesday
// Round Robin" at Lakewood Ranch Courts, with a fictional organizer, invented
// weather, and six fake attendees, indistinguishable from a real event
// (item 6.1). Non-UUID ids are now treated as not found.
//
// EMPTY_EVENT exists only to satisfy the type between the hooks and the
// early return; it is never rendered, and it is deliberately blank rather
// than plausible so that a regression looks broken instead of looking real.
type EventShape = {
  id: string; name: string; badge: string; badgeGold: boolean;
  datetime: string; date: string; time: string; endTime: string;
  venue: string; address: string; city: string;
  players: number; maxPlayers: number; spots: number; pctFilled: number;
  heroPhoto: string;
  format: string; skillLevel: string; courtType: string; fee: string;
  organizer: { name: string; initials: string; bg: string; rating: string; events: number; userId: string | null; avatarUrl?: string | null };
  about: string;
  participants: { initials: string; bg: string }[];
  weather: { temp: number; high: number; low: number; condition: string; icon: string; wind: number; humidity: number; };
};

const EMPTY_EVENT: EventShape = {
  id: '', name: '', badge: '', badgeGold: false,
  datetime: '', date: '', time: '', endTime: '',
  venue: '', address: '', city: '',
  players: 0, maxPlayers: 0, spots: 0, pctFilled: 0,
  heroPhoto: '',
  format: '', skillLevel: '', courtType: '', fee: '',
  organizer: { name: '', initials: '', bg: L.navy, rating: '', events: 0, userId: null },
  about: '',
  participants: [],
  weather: { temp: 0, high: 0, low: 0, condition: '', icon: 'help-outline', wind: 0, humidity: 0 },
};


function fmtTime(t: string | null): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function computeEndTime(startTime: string | null, durationMinutes: number | null): string {
  if (!startTime || !durationMinutes) return '';
  const [h, m] = startTime.split(':').map(Number);
  const total = h * 60 + m + durationMinutes;
  const endH = Math.floor(total / 60) % 24;
  const endM = total % 60;
  return fmtTime(`${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`);
}

function fmtMsgTime(iso: string): string {
  const d = new Date(iso);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

function fmtShortDate(d: string): string {
  // d = 'YYYY-MM-DD'
  const dt = new Date(`${d}T12:00:00`);
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmtLongDate(d: string): string {
  const dt = new Date(`${d}T12:00:00`);
  return dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function eventTypeLabel(t: string): string {
  return t === 'round_robin' ? 'Round Robin'
    : t === 'open_play'     ? 'Open Play'
    : t === 'mixer'         ? 'Mixer'
    : t === 'ladder'        ? 'Ladder'
    : t === 'kings_court'   ? 'Kings Court'
    : t === 'clinic'        ? 'Clinic'
    : 'Community Play';
}

function mapPlayEvent(data: PlayEventWithOrganizer, participantCount: number): EventShape {
  const orgName = data.organizer?.full_name ?? 'Organizer';
  const initials = orgName.split(' ').filter(Boolean)
    .map(w => w[0]?.toUpperCase() ?? '').join('').slice(0, 2) || 'OR';
  const timeStr = fmtTime(data.start_time as string | null);
  const shortDate = fmtShortDate(data.event_date);
  const badge = data.status === 'open' ? 'OPEN'
    : data.status === 'full'        ? 'FULL'
    : data.status === 'in_progress' ? 'LIVE'
    : (data.status as string).toUpperCase();
  const maxPlayers = data.max_players ?? 0;
  return {
    id: data.id,
    name: data.name,
    badge,
    badgeGold: data.status === 'open',
    datetime: timeStr ? `${shortDate} • ${timeStr}` : shortDate,
    date: fmtLongDate(data.event_date),
    time: timeStr || '—',
    endTime: computeEndTime(data.start_time as string | null, data.duration_minutes ?? null),
    venue: data.venue_name ?? data.location ?? '',
    address: data.location ?? '',
    city: [data.city, data.state].filter(Boolean).join(', '),
    players: participantCount,
    maxPlayers,
    spots: Math.max(0, maxPlayers - participantCount),
    pctFilled: maxPlayers > 0 ? Math.round((participantCount / maxPlayers) * 100) : 0,
    heroPhoto: eventCoverUri(data.cover_url),
    format: eventTypeLabel(data.event_type),
    skillLevel: skillLabel(data.skill_min ?? null, data.skill_max ?? null),
    courtType: 'Outdoor',
    fee: 'Free',
    organizer: {
      name: orgName,
      initials,
      bg: L.navy,
      rating: '',
      events: 0,
      userId: data.organizer_id,
      avatarUrl: data.organizer?.avatar_url ?? null,
    },
    about: data.notes ?? '',
    participants: [],
    // Real weather is fetched separately into `weather` state; this field
    // used to carry the demo event's invented forecast on every live event.
    weather: EMPTY_EVENT.weather,
  };
}

// ─── Mock: accepted players ───────────────────────────────────────────────────

const INITIAL_ACCEPTED = [
  { id: 'a1', name: 'John D.',   initials: 'JD', bg: L.navy, rating: '4.1 DUPR', level: 'Competitive',  userId: null as string | null },
  { id: 'a2', name: 'Sarah M.',  initials: 'SM', bg: '#4A8C6F', rating: '3.8 DUPR', level: 'Competitive',  userId: null as string | null },
  { id: 'a3', name: 'Jake R.',   initials: 'JR', bg: '#3A6B9A', rating: '4.0 DUPR', level: 'Competitive',  userId: null as string | null },
  { id: 'a4', name: 'Maria K.',  initials: 'MK', bg: '#7A4F3A', rating: '3.6 DUPR', level: 'Recreational', userId: null as string | null },
  { id: 'a5', name: 'Luis P.',   initials: 'LP', bg: '#2D5A3D', rating: '3.9 DUPR', level: 'Competitive',  userId: null as string | null },
  { id: 'a6', name: 'Tara C.',   initials: 'TC', bg: '#5A3A7A', rating: '4.2 DUPR', level: 'Advanced',     userId: null as string | null },
];

const INITIAL_PENDING = [
  { id: 'p1', name: 'Brian T.',   initials: 'BT', bg: '#6B4A2D', invitedDate: 'May 18' },
  { id: 'p2', name: 'Jessica L.', initials: 'JL', bg: '#2D4A6B', invitedDate: 'May 18' },
  { id: 'p3', name: 'Chris P.',   initials: 'CP', bg: '#4A6B2D', invitedDate: 'May 18' },
];

// ─── Mock: chat messages ──────────────────────────────────────────────────────

const INITIAL_MESSAGES = [
  { id: 'm1', sender: 'Anna Rodriguez', initials: 'AR', bg: '#4A8C6F', time: '2:15 PM', message: 'Looking forward to another great round robin tonight! 🎾', isMe: false },
  { id: 'm2', sender: 'John D.',        initials: 'JD', bg: L.navy, time: '2:18 PM', message: 'Same! Will courts 3 and 4 be open again?', isMe: false },
  { id: 'm3', sender: 'Anna Rodriguez', initials: 'AR', bg: '#4A8C6F', time: '2:20 PM', message: 'Yes, all 4 courts reserved for us from 6 to 8:30 PM.', isMe: false },
  { id: 'm4', sender: 'Sarah M.',       initials: 'SM', bg: '#4A8C6F', time: '3:05 PM', message: "Can't wait! See everyone tonight 👋", isMe: false },
];

// ─── Participant roster helpers ───────────────────────────────────────────────

const PARTICIPANT_COLORS = [
  L.navy, '#4A8C6F', '#3A6B9A', '#7A4F3A',
  '#2D5A3D', '#5A3A7A', '#6B4A2D', '#2D4A6B',
];

type ParticipantRow = {
  id: string; name: string; initials: string; bg: string;
  rating: string; level: string; userId: string | null; isClaimed: boolean;
  avatarUrl: string | null; city: string;
};

function toParticipantRow(
  p: { id: string; first_name: string; last_initial: string | null; self_rating: string | null },
  idx: number,
  claimedBy: string | null,
  isClaimedBool: boolean,
  avatarUrl: string | null = null,
  city: string = '',
): ParticipantRow {
  const li = p.last_initial;
  const name = li ? `${p.first_name} ${li}.` : p.first_name;
  const initials = ((p.first_name[0] ?? '') + (li ?? '')).toUpperCase().slice(0, 2) || '??';
  return {
    id: p.id,
    name,
    initials,
    bg: PARTICIPANT_COLORS[idx % PARTICIPANT_COLORS.length],
    rating: p.self_rating ?? '',
    level: '',
    userId: claimedBy,
    isClaimed: isClaimedBool || !!claimedBy,
    avatarUrl,
    city,
  };
}

// ─── Info row (unchanged) ─────────────────────────────────────────────────────

function InfoRow({ icon, label, value, valueColor }: {
  icon: AppIconName; label: string; value: string; valueColor?: string;
}) {
  return (
    <View style={ir.row}>
      <View style={ir.iconWrap}>
        <AppIcon name={icon} size={18} color={L.gold} />
      </View>
      <View style={ir.text}>
        <Text style={ir.label}>{label}</Text>
        <Text style={[ir.value, valueColor ? { color: valueColor } : null]}>{value}</Text>
      </View>
    </View>
  );
}

const ir = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  iconWrap: { width: 36, height: 36, borderRadius: shape.cta, backgroundColor: L.goldLight, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  text: { flex: 1 },
  label: { color: L.textMuted, fontSize: 11, fontWeight: '600', letterSpacing: 0.3, marginBottom: spacing.xs },
  value: { color: L.navy, fontSize: text.rowTitle.size, fontWeight: '700', lineHeight: 20 },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

type Tab        = 'overview' | 'players' | 'chat';
type UserStatus = 'not_joined' | 'invited' | 'joined' | 'organizer';
type PlayerFilt = 'accepted' | 'pending' | 'waitlist';

const TAB_LABEL: Record<Tab, string> = {
  overview: 'Overview',
  players:  'Players',
  chat:     'Chat',
};

// Rendered twice: inline under the hero, and again in the pinned overlay that
// fades in once the inline one scrolls away. Shared so the two copies cannot
// drift apart.
function TabRow({ active, onSelect }: { active: Tab; onSelect: (t: Tab) => void }) {
  return (
    <View style={tb.bar}>
      {(['overview', 'players', 'chat'] as Tab[]).map(tab => (
        <TouchableOpacity
          key={tab}
          style={tb.tab}
          onPress={() => onSelect(tab)}
          activeOpacity={0.75}
        >
          <Text style={[tb.label, active === tab && tb.labelActive]}>
            {TAB_LABEL[tab]}
          </Text>
          {active === tab && <View style={tb.underline} />}
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function CommunityEventScreen() {
  const { id, tab: initialTabParam } = useLocalSearchParams<{ id: string; tab?: Tab }>();
  const insets   = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  // Drives the hero zoom. Native-driven, so the transform runs on the UI thread
  // and keeps up with the scroll even while JS is busy rendering the tabs.
  const scrollY = useRef(new Animated.Value(0)).current;

  // Scale only -- deliberately no translateY. Pulling down past the top (a
  // negative offset, iOS rubber-band) zooms in hard; scrolling up zooms gently
  // as the hero recedes, which is the only half Android sees since it has no
  // bounce by default. Staying at scale >= 1 means the image can never expose a
  // gap at the edges of the container, which a parallax translate would.
  const heroScale = scrollY.interpolate({
    inputRange:  [-HERO_HEIGHT, 0, HERO_HEIGHT],
    outputRange: [2, 1, 1.2],
    extrapolate: 'clamp',
  });

  // The inline tab bar starts at content y = HERO_HEIGHT, so it reaches the
  // bottom of the status bar once we have scrolled HERO_HEIGHT - insets.top.
  // That is the point the pinned copy has to be fully opaque, or the tabs
  // visibly disappear for a frame before the overlay catches up.
  const pinPoint = HERO_HEIGHT - insets.top;

  // A hard cut, not a cross-fade. At pinPoint the inline bar sits at exactly
  // insets.top -- the same pixels this overlay occupies -- so swapping between
  // two identical bars is invisible. Fading instead made the near-white bar
  // wash over the dark hero photo at partial opacity on the way in, which read
  // as a grey smear with two visible tab rows converging behind it.
  const stickyOpacity = scrollY.interpolate({
    inputRange:  [pinPoint - 1, pinPoint],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  // Opacity is native-driven, but pointerEvents is a JS prop, so the overlay
  // needs a JS-side flag too -- without it the invisible bar would swallow taps
  // across the top of the screen. Only set state on a threshold crossing rather
  // than every scroll frame.
  const [tabsPinned, setTabsPinned] = useState(false);

  const isUUID = UUID_RE.test(id as string ?? '');
  const [liveEvent,    setLiveEvent]    = useState<EventShape | null>(null);
  const [pageLoading,  setPageLoading]  = useState(isUUID);
  const [pageError,    setPageError]    = useState<string | null>(
    isUUID ? null : 'Event not found.'
  );
  const [weather,      setWeather]      = useState<EventWeatherResult | 'loading' | null>(null);
  const [facilityDetail, setFacilityDetail] = useState<FacilityDetail | null>(null);
  // Add to Calendar needs the raw event_date/start_time/duration_minutes —
  // the mapped EventShape above only carries pre-formatted display strings.
  const [rawPlayEvent, setRawPlayEvent] = useState<PlayEventWithOrganizer | null>(null);

  // Measured rather than hardcoded so the floating support button clears
  // this bar even if its height changes. The safe-area inset is subtracted
  // because the button applies that itself - reporting the raw height would
  // count it twice - and rounded because the support registry re-registers
  // on any change to the serialized context.
  const [barHeight, setBarHeight] = useState(0);

  useSupportContext({
    bottomClearance: barHeight,
    feature: 'community_play_event',
    entityType: 'community_play_event',
    entityId: id,
    entityLabel: liveEvent?.name,
  });

  useEffect(() => {
    if (!isUUID) return;
    let cancelled = false;
    (async () => {
      setPageLoading(true);
      setPageError(null);
      try {
        const [eventData, countResult] = await Promise.all([
          fetchPlayEventWithOrganizer(id as string),
          supabase
            .from('play_participants_public')
            .select('*', { count: 'exact', head: true })
            .eq('event_id', id),
        ]);
        if (cancelled) return;
        if (!eventData) { setPageError('Event not found.'); setPageLoading(false); return; }
        setLiveEvent(mapPlayEvent(eventData, countResult.count ?? 0));
        setRawPlayEvent(eventData);

        const lat = eventData.facility?.latitude != null ? Number(eventData.facility.latitude) : null;
        const lng = eventData.facility?.longitude != null ? Number(eventData.facility.longitude) : null;
        if (lat != null && lng != null && eventData.event_date) {
          setWeather('loading');
          fetchEventWeather(lat, lng, eventData.event_date)
            .then(res => { if (!cancelled) setWeather(res); })
            .catch(() => { if (!cancelled) setWeather({ available: false, reason: 'upstream_error' }); });
        } else {
          setWeather(null);
        }

        if (eventData.facility_id) {
          fetchFacilityById(eventData.facility_id)
            .then(f => { if (!cancelled) setFacilityDetail(f); })
            .catch(() => { if (!cancelled) setFacilityDetail(null); });
        } else {
          setFacilityDetail(null);
        }
      } catch (e: unknown) {
        if (!cancelled) setPageError(e instanceof Error ? e.message : 'Could not load event.');
      } finally {
        if (!cancelled) setPageLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, isUUID]);

  const event: EventShape = liveEvent ?? EMPTY_EVENT;

  // The share button in the hero rendered with no onPress - a dead control,
  // not a stubbed one, since nothing on this screen imported Share at all.
  // Uses rawPlayEvent (the unmapped row) because createCommunityShareMessage
  // takes a PlayEvent, and EventShape is this screen's own display shape.
  async function handleShare() {
    if (!rawPlayEvent) return;
    try {
      await Share.share({
        message: createCommunityShareMessage(rawPlayEvent),
        title: event.name,
      });
    } catch { /* user dismissed the sheet */ }
  }
  const isPastEvent = event.badge === 'COMPLETED' || event.badge === 'CANCELLED';

  // Add to Calendar: only for a real fetched event (not the mock fallback)
  // that isn't cancelled/completed (Step 21). event_date/start_time have no
  // stored timezone anywhere in play_events (see CALENDAR_INTEGRATION_PHASE6.md
  // audit) -- treated as the venue's local wall-clock time, the same
  // assumption this screen's own fmtLongDate/fmtTime helpers already make.
  let communityCalendarEvent: CalendarEventInput | null = null;
  if (rawPlayEvent && !isPastEvent) {
    const [h, min] = (rawPlayEvent.start_time ?? '').split(':').map(Number);
    const [y, mo, d] = rawPlayEvent.event_date.split('-').map(Number);
    const hasTime = rawPlayEvent.start_time != null && !Number.isNaN(h);
    const startDate = hasTime
      ? new Date(y, mo - 1, d, h, min || 0)
      : new Date(y, mo - 1, d);
    const endDate = hasTime && rawPlayEvent.duration_minutes
      ? new Date(startDate.getTime() + rawPlayEvent.duration_minutes * 60_000)
      : undefined;
    const facilityLines = facilityDetail
      ? [facilityDetail.address, facilityDetail.address_line_2, [facilityDetail.city, facilityDetail.state, facilityDetail.postal_code].filter(Boolean).join(', ')]
        .filter((p): p is string => !!p)
      : [];
    const locationName = rawPlayEvent.venue_name ?? rawPlayEvent.location ?? '';
    communityCalendarEvent = {
      title: `Pickleball — ${eventTypeLabel(rawPlayEvent.event_type)}${locationName ? ` at ${locationName}` : ''}`,
      startDate,
      endDate,
      allDay: !hasTime,
      location: [locationName, ...facilityLines].join('\n'),
      notes: withLink(eventTypeLabel(rawPlayEvent.event_type), appLinks.communityEvent(rawPlayEvent.id)),
    };
  }

  const [saved,        setSaved]        = useState(false);
  const [activeTab,    setActiveTab]    = useState<Tab>(
    initialTabParam === 'chat' || initialTabParam === 'players' ? initialTabParam : 'overview',
  );
  const [userStatus,   setUserStatus]   = useState<UserStatus>('not_joined');
  const [playerFilt,   setPlayerFilt]   = useState<PlayerFilt>('accepted');
  const [chatMsg,      setChatMsg]      = useState('');
  const [messages,     setMessages]     = useState(INITIAL_MESSAGES);
  const [realMessages, setRealMessages] = useState<Message[]>([]);
  const [convId,       setConvId]       = useState<string | null>(null);
  const [chatLoading,  setChatLoading]  = useState(false);
  const [chatError,    setChatError]    = useState<string | null>(null);
  const [sending,      setSending]      = useState(false);
  const [accepted,     setAccepted]     = useState(INITIAL_ACCEPTED);
  const [pending,      setPending]      = useState(INITIAL_PENDING);
  // Was FALLBACK.players / FALLBACK.spots -- a real event flashed the demo
  // event's "12 players, 4 spots" until its own counts loaded.
  const [joinedCount,  setJoinedCount]  = useState(0);
  const [spotsLeft,    setSpotsLeft]    = useState(0);
  const [msgingId,       setMsgingId]       = useState<string | null>(null);
  const [joiningEvent,   setJoiningEvent]   = useState(false);
  const [showGuestForm,  setShowGuestForm]  = useState(false);
  const [guestName,      setGuestName]      = useState('');
  const [guestInitial,   setGuestInitial]   = useState('');
  const [guestEmail,     setGuestEmail]     = useState('');
  const [guestJoining,   setGuestJoining]   = useState(false);
  const [myParticipantId, setMyParticipantId] = useState<string | null>(null);
  const [leaving,          setLeaving]        = useState(false);
  const [showCelebration,  setShowCelebration] = useState(false);
  const [showManageSheet,  setShowManageSheet] = useState(false);
  const [cancelling,       setCancelling]      = useState(false);

  const isChatTab = activeTab === 'chat';
  const scrollBottomPadding = insets.bottom + (isChatTab ? 180 : 100);

  useEffect(() => {
    if (!isChatTab) return;
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 80);
    return () => clearTimeout(timer);
  }, [isChatTab, messages.length, realMessages.length]);

  // Sync count/spots when real event data arrives
  useEffect(() => {
    if (liveEvent) {
      setJoinedCount(liveEvent.players);
      setSpotsLeft(liveEvent.spots);
    }
  }, [liveEvent]);

  const { user } = useSession();

  // Auto-detect organizer/member status for UUID events.
  useEffect(() => {
    if (!isUUID || !liveEvent) return;
    if (!user) {
      setUserStatus('not_joined');
      return;
    }
    if (user.id === liveEvent.organizer.userId) {
      setUserStatus('organizer');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        if (user.email) await claimGuestParticipants(user.id, user.email);
        const mine = await fetchMyPlayParticipant(id as string, user.id);
        if (!cancelled) {
          setUserStatus(mine ? 'joined' : 'not_joined');
          setMyParticipantId(mine?.id ?? null);
        }
      } catch {
        if (!cancelled) setUserStatus('not_joined');
      }
    })();
    return () => { cancelled = true; };
  }, [id, isUUID, liveEvent, user]);

  const [liveParticipants,    setLiveParticipants]    = useState<ParticipantRow[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [participantsError,   setParticipantsError]   = useState<string | null>(null);

  useEffect(() => {
    if (!isUUID || !liveEvent) return;
    const isOrg = !!user && user.id === liveEvent.organizer.userId;
    let cancelled = false;
    (async () => {
      setParticipantsLoading(true);
      setParticipantsError(null);
      try {
        let rows: ParticipantRow[];
        if (isOrg) {
          const full = await fetchPlayParticipants(id as string);
          rows = full.map((p, i) => toParticipantRow(
            { ...p, self_rating: p.self_rating ?? p.profile?.self_rating ?? null },
            i, p.claimed_by, !!p.claimed_by, p.profile?.avatar_url ?? null,
            [p.profile?.location_city, p.profile?.location_state].filter(Boolean).join(', '),
          ));
        } else {
          // play_participants_public (anon + authenticated) omits claimed_by
          // to keep event attendance unscrapeable by anonymous browsers.
          // Signed-in viewers get play_participants_authenticated instead,
          // which includes claimed_by so their taps can open real profiles.
          const table = user ? 'play_participants_authenticated' : 'play_participants_public';
          const { data, error } = await (supabase as any)
            .from(table)
            .select('*')
            .eq('event_id', id)
            .order('created_at', { ascending: true });
          if (error) throw error;
          rows = (data ?? []).map((p: any, i: number) =>
            toParticipantRow(
              { id: p.id ?? '', first_name: p.first_name ?? '', last_initial: p.last_initial, self_rating: p.self_rating ?? p.profile_self_rating },
              i, p.claimed_by ?? null, (p.is_claimed as boolean) ?? false, p.avatar_url ?? null,
              [p.location_city, p.location_state].filter(Boolean).join(', '),
            ),
          );
        }
        if (!cancelled) setLiveParticipants(rows);
      } catch (e: unknown) {
        if (!cancelled) setParticipantsError(e instanceof Error ? e.message : 'Could not load players.');
      } finally {
        if (!cancelled) setParticipantsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, isUUID, liveEvent, user]);

  const IS_ORGANIZER = userStatus === 'organizer';
  // Any joined participant — not just the organizer — can invite other real
  // players to a Community Play event.
  const CAN_INVITE = userStatus === 'organizer' || userStatus === 'joined';

  // Load the real contextual conversation for UUID events when the Chat tab opens.
  useEffect(() => {
    if (!isUUID || !isChatTab || !user || !liveEvent) return;
    let cancelled = false;
    (async () => {
      setChatLoading(true);
      setChatError(null);
      try {
        const cid = await getOrCreatePlayEventConversation(id as string, user.id);
        if (cancelled) return;
        setConvId(cid);
        const msgs = await fetchMessages(cid);
        if (!cancelled) setRealMessages(msgs);
        await markConversationRead(cid, user.id);
      } catch (e: unknown) {
        if (!cancelled) setChatError(e instanceof Error ? e.message : 'Could not load chat.');
      } finally {
        if (!cancelled) setChatLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isUUID, isChatTab, user, liveEvent, id]);

  // Live-append messages posted by other participants while the Chat tab is open.
  useEffect(() => {
    if (!isUUID || !isChatTab || !user || !convId) return;
    const unsubscribe = subscribeToConversation(convId, (msg) => {
      setRealMessages(prev => (prev.some(m => m.id === msg.id) ? prev : [...prev, msg]));
      if (msg.sender_id !== user.id) markConversationRead(convId, user.id);
    });
    return unsubscribe;
  }, [isUUID, isChatTab, user, convId]);

  // Resolve a sender_id to display name/initials/colour from known participants.
  const senderMeta = useCallback((senderId: string) => {
    if (user && senderId === user.id) return { name: 'You', initials: 'ME', bg: L.gold };
    if (liveEvent && senderId === liveEvent.organizer.userId) {
      return { name: liveEvent.organizer.name, initials: liveEvent.organizer.initials, bg: L.navy };
    }
    const p = liveParticipants.find(lp => lp.userId === senderId);
    if (p) return { name: p.name, initials: p.initials, bg: p.bg };
    return { name: 'Player', initials: '··', bg: L.textMuted };
  }, [user, liveEvent, liveParticipants]);

  // Unified render shape: real DB messages for UUID events, mock list otherwise.
  const chatMessages = isUUID
    ? realMessages.map(m => {
        const meta = senderMeta(m.sender_id);
        return {
          id: m.id,
          sender: meta.name,
          initials: meta.initials,
          bg: meta.bg,
          time: fmtMsgTime(m.created_at),
          message: m.body,
          isMe: !!user && m.sender_id === user.id,
        };
      })
    : messages;

  const openDM = useCallback(async (targetUserId: string, key: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      platformAlert('Sign in required', 'Please sign in to send messages.');
      return;
    }
    if (user.id === targetUserId) return;
    setMsgingId(key);
    try {
      const convId = await getOrCreateConversation(user.id, targetUserId);
      router.push(`/conversation/${convId}` as never);
    } catch (e: unknown) {
      platformAlert('Could not open chat', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setMsgingId(null);
    }
  }, []);
  const fillColor = event.badgeGold ? L.gold : L.green;
  const fillBg    = event.badgeGold ? L.goldLight : L.greenBg;

  async function submitGuestJoin() {
    const firstName = guestName.trim();
    const lastInit  = guestInitial.trim().slice(0, 1);
    const email     = guestEmail.trim().toLowerCase();
    if (!firstName) { platformAlert('Required', 'Please enter your first name.'); return; }
    if (!email || !email.includes('@')) { platformAlert('Required', 'Please enter a valid email.'); return; }
    setGuestJoining(true);
    try {
      await addPlayParticipant({
        event_id:    id as string,
        first_name:  firstName,
        email,
        last_initial: lastInit || null,
      });
      setShowGuestForm(false);
      setGuestName(''); setGuestInitial(''); setGuestEmail('');
      setUserStatus('joined');
      setShowCelebration(true);
      await refetchAfterJoin();
    } catch (e: unknown) {
      platformAlert('Could not join', joinEventErrorMessage(e));
    } finally {
      setGuestJoining(false);
    }
  }



  // ── Actions ─────────────────────────────────────────────────────────────────

  async function refetchAfterJoin() {
    try {
      const [eventData, countResult] = await Promise.all([
        fetchPlayEventWithOrganizer(id as string),
        supabase
          .from('play_participants_public')
          .select('*', { count: 'exact', head: true })
          .eq('event_id', id),
      ]);
      if (eventData) {
        const updated = mapPlayEvent(eventData, countResult.count ?? 0);
        setLiveEvent(updated);
        setRawPlayEvent(eventData);
        setJoinedCount(updated.players);
        setSpotsLeft(updated.spots);
      }
      const { data } = await supabase
        .from('play_participants_public')
        .select('*')
        .eq('event_id', id)
        .order('created_at', { ascending: true });
      setLiveParticipants(
        (data ?? []).map((p, i) =>
          toParticipantRow(
            { id: p.id ?? '', first_name: p.first_name ?? '', last_initial: p.last_initial, self_rating: p.self_rating ?? p.profile_self_rating },
            i, null, (p.is_claimed as boolean) ?? false, p.avatar_url ?? null,
            [p.location_city, p.location_state].filter(Boolean).join(', '),
          ),
        ),
      );
    } catch {
      // non-fatal — UI shows stale count, participant list refreshes on next focus
    }
  }

  async function doLeaveEvent() {
    if (!myParticipantId) return;
    setLeaving(true);
    try {
      await removePlayParticipant(myParticipantId);
      setUserStatus('not_joined');
      setMyParticipantId(null);
      await refetchAfterJoin();
    } catch {
      platformAlert('Could not leave', 'Please try again.');
    } finally {
      setLeaving(false);
    }
  }

  function handleLeaveEvent() {
    if (!myParticipantId) return;
    if (Platform.OS === 'web') {
      if (window.confirm('Leave this event? You will be removed from the roster.')) doLeaveEvent();
      return;
    }
    Alert.alert(
      'Leave Event?',
      'You will be removed from the roster. The organizer will not be notified.',
      [
        { text: 'Stay', style: 'cancel' },
        { text: 'Leave Event', style: 'destructive', onPress: doLeaveEvent },
      ],
    );
  }

  async function doCancelEvent() {
    setCancelling(true);
    try {
      await cancelPlayEvent(id as string);
      await refetchAfterJoin();
    } catch (e: unknown) {
      platformAlert('Could not cancel event', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setCancelling(false);
    }
  }

  function handleCancelEvent() {
    if (Platform.OS === 'web') {
      if (window.confirm('Cancel this event? Players will see it as cancelled; nothing is deleted.')) doCancelEvent();
      return;
    }
    Alert.alert(
      'Cancel Event?',
      'Players will be notified this event is cancelled and it will move to your past events. Nothing is deleted.',
      [
        { text: 'Keep Event', style: 'cancel' },
        { text: 'Cancel Event', style: 'destructive', onPress: doCancelEvent },
      ],
    );
  }

  async function handleCTAPress() {
    if (isUUID && userStatus === 'not_joined') {
      if (!user) {
        setShowGuestForm(true);
        return;
      }
      if (joiningEvent) return;
      setJoiningEvent(true);
      try {
        // Fetch profile for real name + email
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', user.id)
          .single();
        const fullName: string = profile?.full_name ?? user.email ?? 'Player';
        const email: string    = (profile?.email ?? user.email ?? '').trim();
        if (!email) {
          platformAlert('Email required', 'Please add an email address to your profile before joining.');
          return;
        }
        const firstName        = fullName.split(' ')[0] ?? fullName;
        const lastInitial      = fullName.split(' ')[1]?.[0] ?? null;
        await addPlayParticipant({
          event_id:    id as string,
          first_name:  firstName,
          email,
          last_initial: lastInitial,
          claimed_by:  user.id,
        });
        setUserStatus('joined');
        setShowCelebration(true);
        await refetchAfterJoin();
      } catch (e: unknown) {
        platformAlert('Could not join', joinEventErrorMessage(e));
      } finally {
        setJoiningEvent(false);
      }
      return;
    }

    // Mock / non-UUID path — unchanged
    if (userStatus === 'not_joined') {
      setUserStatus('joined');
      setShowCelebration(true);
      setJoinedCount(c => c + 1);
      setSpotsLeft(s => s - 1);
      setAccepted(prev => [
        ...prev,
        { id: 'me', name: 'You', initials: 'ME', bg: L.gold, rating: '3.5 DUPR', level: 'Recreational', userId: null },
      ]);
    } else if (userStatus === 'invited') {
      setUserStatus('joined');
      setShowCelebration(true);
      setJoinedCount(c => c + 1);
      setSpotsLeft(s => s - 1);
      setAccepted(prev => [
        ...prev,
        { id: 'me', name: 'You', initials: 'ME', bg: L.gold, rating: '3.5 DUPR', level: 'Recreational', userId: null },
      ]);
      setPending(prev => prev.filter(p => p.id !== 'me-pending'));
      setMessages(prev => [...prev, {
        id: `sys-${Date.now()}`, sender: 'You', initials: 'ME', bg: L.gold,
        time: 'Just now', message: 'Just accepted the invite! Looking forward to playing 🎾', isMe: true,
      }]);
    } else if (userStatus === 'joined') {
      setActiveTab('players');
    } else if (userStatus === 'organizer') {
      setShowManageSheet(true);
    }
  }

  async function sendMessage() {
    const body = chatMsg.trim();
    if (!body) return;

    // Real contextual conversation for UUID events.
    if (isUUID) {
      if (!user) { platformAlert('Sign in required', 'Please sign in to send messages.'); return; }
      if (!convId || sending) return;
      setSending(true);
      setChatMsg('');
      try {
        const saved = await sendChatMessage(convId, user.id, body);
        setRealMessages(prev => (prev.some(m => m.id === saved.id) ? prev : [...prev, saved]));
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
      } catch (e: unknown) {
        setChatMsg(body); // restore so the user doesn't lose their text
        platformAlert('Could not send', e instanceof Error ? e.message : 'Please try again.');
      } finally {
        setSending(false);
      }
      return;
    }

    // Mock path (non-UUID demo events) — unchanged behaviour.
    setMessages(prev => [...prev, {
      id: `m${Date.now()}`, sender: 'You', initials: 'ME', bg: L.gold,
      time: 'Just now', message: body, isMe: true,
    }]);
    setChatMsg('');
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  }

  // ── Tab bar ──────────────────────────────────────────────────────────────────

  // ── Overview content (existing, unchanged) ────────────────────────────────

  function OverviewContent() {
    const venueName    = facilityDetail?.name ?? event.venue;
    const venueAddress = facilityDetail ? facilityDetail.address : event.address;
    const venueCity     = facilityDetail
      ? [facilityDetail.city, facilityDetail.state].filter(Boolean).join(', ')
      : event.city;
    // Avoid duplicating the city when the address string already contains it
    // (the free-text `location` field sometimes already embeds "City, ST").
    const venueCityLine = venueAddress && venueCity && venueAddress.includes(venueCity) ? '' : venueCity;
    const venueDetail = [venueAddress, venueCityLine].filter(Boolean).join(', ');

    return (
      <>
        {/* Bracket - mini tournaments only.
            Added because the Events tab now opens this screen instead of
            mini-tournament-created, which was the only detail screen linking
            to the bracket. The route already existed; nothing pointed here. */}
        {rawPlayEvent?.event_type === 'mini_tournament' && (
          <TouchableOpacity
            style={s.bracketBanner}
            activeOpacity={0.8}
            onPress={() => router.push(`/mini-tournament/${event.id}/bracket` as never)}
          >
            <Ionicons name="git-network-outline" size={16} color={L.gold} />
            <Text style={s.bracketBannerText}>View Bracket</Text>
            <Ionicons name="chevron-forward" size={14} color={L.textSub} />
          </TouchableOpacity>
        )}

        {/* Stat pills + fill bar */}
        <View style={s.statPills}>
          <View style={s.statPill}>
            <Ionicons name="time-outline" size={13} color={L.gold} />
            <Text style={s.statPillText}>{event.time}</Text>
          </View>
          <View style={s.statPill}>
            <Ionicons name="speedometer-outline" size={13} color={L.gold} />
            <Text style={s.statPillText}>{event.skillLevel}</Text>
          </View>
          <View style={[s.statPill, { borderColor: fillColor, backgroundColor: fillBg }]}>
            <Text style={[s.statPillText, { color: fillColor, fontWeight: '800' }]}>
              {spotsLeft} spots left
            </Text>
          </View>
        </View>

        <View style={s.fillBarRow}>
          <View style={s.fillBarBg}>
            <View style={[s.fillBarFill, { width: `${Math.round((joinedCount / event.maxPlayers) * 100)}%` as never, backgroundColor: fillColor }]} />
          </View>
          <Text style={s.fillPct}>{Math.round((joinedCount / event.maxPlayers) * 100)}% filled</Text>
        </View>

        {/* About */}
        <Text style={[s.sectionTitle, s.sectionTitleUpper]}>About This Event</Text>
        <Text style={s.aboutText}>{event.about}</Text>

        {/* Weather */}
        {weather != null && (
          <>
            <Text style={[s.sectionTitle, s.sectionTitleUpper]}>Weather on Event Day</Text>
            <EventWeatherCard style={{ marginBottom: spacing.xxl }} w={weather} locationLabel={venueCity || undefined} />
          </>
        )}

        {/* Event details */}
        <Text style={[s.sectionTitle, s.sectionTitleUpper]}>Event Details</Text>
        <View style={s.detailsCard}>
          <InfoRow icon="calendar-outline"   label="DATE"        value={event.date} />
          <View style={s.divider} />
          <InfoRow icon="time-outline"       label="TIME"        value={event.endTime ? `${event.time} – ${event.endTime}` : event.time} />
          <View style={s.divider} />
          <View style={ir.row}>
            <View style={ir.iconWrap}>
              <AppIcon name="location-outline" size={18} color={L.gold} />
            </View>
            <View style={ir.text}>
              <Text style={ir.label}>VENUE</Text>
              <TouchableOpacity
                disabled={!facilityDetail}
                onPress={() => facilityDetail && router.push(`/facility/${facilityDetail.id}` as never)}
              >
                <Text style={[ir.value, facilityDetail && { color: L.gold, textDecorationLine: 'underline' }]}>
                  {venueName}
                </Text>
              </TouchableOpacity>
              {venueDetail ? <Text style={ir.value}>{venueDetail}</Text> : null}
            </View>
          </View>
          <View style={s.divider} />
          <InfoRow icon="pickleball" label="FORMAT"      value={event.format} />
          <View style={s.divider} />
          <InfoRow icon="speedometer-outline"  label="SKILL LEVEL" value={event.skillLevel} />
          <View style={s.divider} />
          <InfoRow icon="grid-outline"       label="COURT TYPE"  value={event.courtType} />
          <View style={s.divider} />
          <InfoRow icon="cash-outline"       label="ENTRY FEE"   value={event.fee}
            valueColor={event.fee === 'Free' ? L.green : L.text} />
        </View>

        {/* Players joined preview */}
        <Text style={[s.sectionTitle, s.sectionTitleUpper]}>Players Joined</Text>
        {(() => {
          const previewParticipants = isUUID ? liveParticipants.slice(0, 6) : event.participants;
          return (
            <View style={s.playersRow}>
              {previewParticipants.map((p, i) => (
                <View key={isUUID ? (p as ParticipantRow).id : i} style={[s.playerAvatarWrap, { zIndex: previewParticipants.length - i }]}>
                  <Avatar uri={isUUID ? (p as ParticipantRow).avatarUrl : null} initials={p.initials} bg={p.bg} size={33} />
                </View>
              ))}
              {joinedCount > previewParticipants.length && (
                <View style={[s.playerAvatarWrap, s.playerMore]}>
                  <Text style={s.playerMoreText}>+{joinedCount - previewParticipants.length}</Text>
                </View>
              )}
              <Text style={s.playersLabel}>{joinedCount} players registered</Text>
            </View>
          );
        })()}

        {/* Organizer */}
        <Text style={[s.sectionTitle, s.sectionTitleUpper]}>Organizer</Text>
        <View style={s.organizerCard}>
          <Avatar uri={event.organizer.avatarUrl} initials={event.organizer.initials} bg={event.organizer.bg} size={48} />
          <View style={s.orgInfo}>
            <Text style={s.orgName}>{event.organizer.name}</Text>
            <View style={s.orgMeta}>
              <Ionicons name="trophy-outline" size={12} color={L.textMuted} />
              <Text style={s.orgMetaText}>{event.organizer.rating}</Text>
              <Text style={s.orgDot}>·</Text>
              <Text style={s.orgMetaText}>{event.organizer.events} events hosted</Text>
            </View>
          </View>
          <TouchableOpacity style={s.followBtn}>
            <Text style={s.followBtnText}>Follow</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={s.msgOrgBtn}
          activeOpacity={0.8}
          disabled={msgingId === 'organizer'}
          onPress={() => {
            if (event.organizer.userId) {
              openDM(event.organizer.userId, 'organizer');
            } else {
              platformAlert('Organizer unavailable', 'This event has no organizer set up for messaging yet.');
            }
          }}
        >
          {msgingId === 'organizer'
            ? <ActivityIndicator size="small" color={L.navy} />
            : <Ionicons name="chatbubble-outline" size={15} color={L.navy} />}
          <Text style={s.msgOrgText}>Message Organizer</Text>
        </TouchableOpacity>

        {/* Location */}
        <Text style={[s.sectionTitle, s.sectionTitleUpper]}>Location</Text>
        <View style={s.locationCard}>
          <View style={s.mapPlaceholder}>
            {facilityDetail ? (
              <VenueMapCard
                latitude={Number(facilityDetail.latitude)}
                longitude={Number(facilityDetail.longitude)}
                name={facilityDetail.name}
              />
            ) : (
              <>
                <Ionicons name="map-outline" size={36} color={L.textMuted} />
                <Text style={s.mapText}>Map preview</Text>
              </>
            )}
          </View>
          <View style={s.locationInfo}>
            <View style={s.locationTitleRow}>
              <Text style={s.locationVenue}>{facilityDetail?.name ?? event.venue}</Text>
              {facilityDetail?.verified && (
                <View style={s.locationVerifiedBadge}>
                  <Ionicons name="shield-checkmark" size={11} color="#2563EB" />
                  <Text style={s.locationVerifiedText}>VERIFIED</Text>
                </View>
              )}
            </View>
            {facilityDetail ? (
              <>
                <Text style={s.locationAddr}>{facilityDetail.address}</Text>
                <Text style={s.locationAddr}>{[facilityDetail.city, facilityDetail.state].filter(Boolean).join(', ')}</Text>
              </>
            ) : (
              <>
                <Text style={s.locationAddr}>{event.address}</Text>
                {event.city !== event.address && <Text style={s.locationAddr}>{event.city}</Text>}
              </>
            )}
            <View style={s.locationBtnRow}>
              <TouchableOpacity
                style={s.directionsBtn}
                onPress={() => {
                  const q = encodeURIComponent(
                    facilityDetail
                      ? `${facilityDetail.address}, ${facilityDetail.city}, ${facilityDetail.state}`
                      : `${event.address}, ${event.city}`,
                  );
                  Linking.openURL(`https://maps.apple.com/?q=${q}`).catch(() =>
                    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`),
                  );
                }}
              >
                <Ionicons name="navigate-outline" size={14} color={L.gold} />
                <Text style={s.directionsBtnText}>Get Directions</Text>
              </TouchableOpacity>
              {facilityDetail && (
                <TouchableOpacity
                  style={s.viewFacilityBtn}
                  onPress={() => router.push(`/facility/${facilityDetail.id}` as never)}
                >
                  <Ionicons name="business-outline" size={14} color={L.gold} />
                  <Text style={s.viewFacilityBtnText}>View Facility</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </>
    );
  }

  // ── Players tab ───────────────────────────────────────────────────────────

  function PlayersContent() {
    const displayParticipants = isUUID ? liveParticipants : accepted;
    const TOTAL_ACCEPTED = isUUID ? event.players : accepted.length + 6;
    const TOTAL_PENDING  = pending.length;

    return (
      <>
        {/* Segmented control */}
        <View style={pl.segWrap}>
          {([
            { key: 'accepted',  label: `Accepted (${TOTAL_ACCEPTED})` },
            { key: 'pending',   label: `Pending (${TOTAL_PENDING})` },
            { key: 'waitlist',  label: 'Waitlist (0)' },
          ] as { key: PlayerFilt; label: string }[]).map(seg => (
            <TouchableOpacity
              key={seg.key}
              style={[pl.seg, playerFilt === seg.key && pl.segActive]}
              onPress={() => setPlayerFilt(seg.key)}
              activeOpacity={0.75}
            >
              <Text style={[pl.segLabel, playerFilt === seg.key && pl.segLabelActive]}>
                {seg.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Organizer card */}
        <Text style={s.sectionTitle}>Organizer</Text>
        <View style={pl.orgRow}>
          <Avatar uri={event.organizer.avatarUrl} initials={event.organizer.initials} bg={event.organizer.bg} size={48} />
          <View style={s.orgInfo}>
            <View style={pl.orgNameRow}>
              <Text style={s.orgName}>{event.organizer.name}</Text>
              <View style={pl.orgBadge}>
                <Text style={pl.orgBadgeText}>Organizer</Text>
              </View>
            </View>
            <View style={s.orgMeta}>
              <Ionicons name="trophy-outline" size={12} color={L.textMuted} />
              <Text style={s.orgMetaText}>{event.organizer.rating}</Text>
              <Text style={s.orgDot}>·</Text>
              <Text style={s.orgMetaText}>{event.organizer.events} events hosted</Text>
            </View>
          </View>
        </View>

        {/* Accepted list */}
        {playerFilt === 'accepted' && (
          <>
            <View style={pl.sectionHeader}>
              <Text style={s.sectionTitle}>Accepted Players</Text>
              <TouchableOpacity style={pl.viewAllBtn} activeOpacity={0.75}>
                <Text style={pl.viewAllText}>View All</Text>
                <Ionicons name="chevron-forward" size={14} color={L.gold} />
              </TouchableOpacity>
            </View>
            {participantsLoading && isUUID ? (
              <View style={[pl.listCard, pl.emptyWrap]}>
                <ActivityIndicator size="small" color={L.gold} />
              </View>
            ) : participantsError && isUUID ? (
              <View style={[pl.listCard, pl.emptyWrap]}>
                <Text style={pl.emptyText}>{participantsError}</Text>
              </View>
            ) : (
              <View style={pl.listCard}>
                {displayParticipants.length === 0 ? (
                  <View style={pl.emptyWrap}>
                    <Text style={pl.emptyText}>No players yet</Text>
                  </View>
                ) : displayParticipants.map((player, idx) => {
                  const pr = player as ParticipantRow;
                  return (
                    <View key={player.id}>
                      {idx > 0 && <View style={s.divider} />}
                      <TouchableOpacity
                        style={pl.playerRow}
                        activeOpacity={0.75}
                        disabled={!player.userId}
                        onPress={() => {
                          if (!player.userId) return;
                          router.push({
                            pathname: '/players/[id]' as never,
                            params: { id: player.userId },
                          } as never);
                        }}
                      >
                        <Avatar uri={pr.avatarUrl ?? null} initials={player.initials} bg={player.bg} size={42} />
                        <View style={pl.playerInfo}>
                          <View style={pl.playerNameRow}>
                            <Text style={pl.playerName}>{player.name}</Text>
                            {!!player.rating && <Text style={pl.playerRating}>{player.rating}</Text>}
                          </View>
                          {!!pr.city && <Text style={pl.playerMeta}>{pr.city}</Text>}
                        </View>
                        {player.userId ? (
                          <TouchableOpacity
                            style={pl.msgBtn}
                            activeOpacity={0.75}
                            disabled={msgingId === player.userId}
                            onPress={() => openDM(player.userId!, player.userId!)}
                          >
                            {msgingId === player.userId
                              ? <ActivityIndicator size="small" color={L.navy} />
                              : <Ionicons name="chatbubble-outline" size={16} color={L.navy} />}
                          </TouchableOpacity>
                        ) : isUUID && !pr.isClaimed ? (
                          <View style={pl.acceptedChip}>
                            <Ionicons name="person-outline" size={14} color={L.textMuted} />
                            <Text style={[pl.acceptedText, { color: L.textMuted }]}>Guest</Text>
                          </View>
                        ) : (
                          <View style={pl.acceptedChip}>
                            <Ionicons name="checkmark-circle" size={14} color={L.green} />
                            <Text style={pl.acceptedText}>Accepted</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}

        {/* Pending list */}
        {playerFilt === 'pending' && (
          <>
            <Text style={s.sectionTitle}>Pending Invites</Text>
            <View style={pl.listCard}>
              {pending.length === 0 ? (
                <View style={pl.emptyWrap}>
                  <Text style={pl.emptyText}>No pending invites</Text>
                </View>
              ) : pending.map((player, idx) => (
                <View key={player.id}>
                  {idx > 0 && <View style={s.divider} />}
                  <View style={pl.playerRow}>
                    <View style={[pl.avatar, { backgroundColor: player.bg }]}>
                      <Text style={pl.avatarText}>{player.initials}</Text>
                    </View>
                    <View style={pl.playerInfo}>
                      <Text style={pl.playerName}>{player.name}</Text>
                      <Text style={pl.playerMeta}>Invited {player.invitedDate}</Text>
                    </View>
                    <View style={pl.pendingChip}>
                      <Text style={pl.pendingText}>Pending</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Waitlist */}
        {playerFilt === 'waitlist' && (
          <>
            <Text style={s.sectionTitle}>Waitlist</Text>
            <View style={[pl.listCard, pl.emptyWrap]}>
              <Ionicons name="time-outline" size={28} color={L.textMuted} />
              <Text style={pl.emptyText}>No one on the waitlist</Text>
            </View>
          </>
        )}

        {/* Invite — organizer or any joined participant */}
        {CAN_INVITE && (
          <>
            {isPastEvent && (
              <View style={pl.pastNotice}>
                <Ionicons name="time-outline" size={13} color={L.textMuted} />
                <Text style={pl.pastNoticeText}>
                  {event.badge === 'CANCELLED' ? 'This event was cancelled — invites are closed.' : 'This event has ended — invites are closed.'}
                </Text>
              </View>
            )}
            <TouchableOpacity
              style={[pl.inviteBtn, isPastEvent && pl.inviteBtnDisabled]}
              activeOpacity={isPastEvent ? 1 : 0.85}
              disabled={isPastEvent}
              onPress={isPastEvent ? undefined : () => router.push({
                pathname: '/community/[id]/invite-players' as never,
                params: { id },
              } as never)}
            >
              <Ionicons name="person-add-outline" size={18} color={isPastEvent ? L.textMuted : L.navy} />
              <Text style={[pl.inviteBtnText, isPastEvent && pl.inviteBtnTextDisabled]}>Invite Players</Text>
            </TouchableOpacity>
          </>
        )}
      </>
    );
  }

  // ── Chat tab ──────────────────────────────────────────────────────────────

  function ChatContent() {
    const memberCount = isUUID ? (liveParticipants.length || event.players) : accepted.length + 1;
    const hasEnoughPlayers = accepted.length >= 1; // mock: >1 accepted total (organizer + 1)

    return (
      <>
        {/* Chat header */}
        <View style={ch.header}>
          <View style={ch.headerLeft}>
            <Text style={ch.headerTitle}>{event.name}</Text>
            <Text style={ch.headerSub}>{memberCount} Members</Text>
          </View>
          <Ionicons name="chatbubbles-outline" size={22} color={L.textMuted} />
        </View>

        {isUUID && chatLoading && chatMessages.length === 0 ? (
          <View style={ch.emptyWrap}>
            <ActivityIndicator size="small" color={L.gold} />
          </View>
        ) : isUUID && chatError ? (
          <View style={ch.emptyWrap}>
            <Ionicons name="alert-circle-outline" size={36} color={L.textMuted} />
            <Text style={ch.emptyText}>{chatError}</Text>
          </View>
        ) : !isUUID && !hasEnoughPlayers ? (
          <View style={ch.emptyWrap}>
            <Ionicons name="chatbubble-ellipses-outline" size={36} color={L.textMuted} />
            <Text style={ch.emptyText}>Chat becomes available once another player joins.</Text>
          </View>
        ) : chatMessages.length === 0 ? (
          <View style={ch.emptyWrap}>
            <Ionicons name="chatbubble-ellipses-outline" size={36} color={L.textMuted} />
            <Text style={ch.emptyText}>No messages yet. Say hello! 👋</Text>
          </View>
        ) : (
          <View style={ch.messagesList}>
            {chatMessages.map((msg, idx) => {
              const showSender = !msg.isMe && (idx === 0 || chatMessages[idx - 1].sender !== msg.sender);
              return (
                <View key={msg.id} style={[ch.msgWrap, msg.isMe && ch.msgWrapMe]}>
                  {/* Avatar — only for others, only when sender changes */}
                  {!msg.isMe && (
                    <View style={[ch.avatar, showSender ? { backgroundColor: msg.bg } : ch.avatarHidden]}>
                      {showSender && <Text style={ch.avatarText}>{msg.initials}</Text>}
                    </View>
                  )}
                  <View style={[ch.bubble, msg.isMe ? ch.bubbleMe : ch.bubbleThem]}>
                    {showSender && !msg.isMe && (
                      <Text style={ch.senderName}>{msg.sender}</Text>
                    )}
                    <Text style={[ch.messageText, msg.isMe && ch.messageTextMe]}>
                      {msg.message}
                    </Text>
                    <Text style={[ch.timestamp, msg.isMe && ch.timestampMe]}>{msg.time}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </>
    );
  }

  // ── Bottom bar content ────────────────────────────────────────────────────

  function renderBottomContent() {
    if (activeTab === 'chat') {
      return (
        <>
          <TextInput
            style={s.chatInput}
            value={chatMsg}
            onChangeText={setChatMsg}
            placeholder="Message the group…"
            placeholderTextColor={L.textMuted}
            returnKeyType="send"
            onSubmitEditing={sendMessage}
            onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80)}
            multiline={false}
          />
          <TouchableOpacity
            style={[s.sendBtn, (!chatMsg.trim() || sending) && s.sendBtnDisabled]}
            onPress={sendMessage}
            activeOpacity={0.85}
            disabled={!chatMsg.trim() || sending}
          >
            {sending
              ? <ActivityIndicator size="small" color={colors.white} />
              : <Ionicons name="send" size={16} color={colors.white} />}
          </TouchableOpacity>
        </>
      );
    }

    switch (userStatus) {
      case 'not_joined':
        return (
          <>
            <View>
              <Text style={s.bottomSpots}>{spotsLeft} spots left</Text>
              <Text style={s.bottomPlayers}>{joinedCount}/{event.maxPlayers} players joined</Text>
            </View>
            <TouchableOpacity
              style={[s.joinBtn, joiningEvent && { opacity: 0.6 }]}
              onPress={handleCTAPress}
              activeOpacity={0.88}
              disabled={joiningEvent}
            >
              {joiningEvent
                ? <ActivityIndicator size="small" color={L.navy} />
                : <PickleballIcon size={18} color={L.navy} />}
              <Text style={s.joinBtnText}>{joiningEvent ? 'Joining…' : 'Join Event'}</Text>
            </TouchableOpacity>
          </>
        );
      case 'invited':
        return (
          <>
            <View>
              <Text style={s.bottomSpots}>You're invited!</Text>
              <Text style={s.bottomPlayers}>{joinedCount}/{event.maxPlayers} players joined</Text>
            </View>
            <TouchableOpacity style={s.joinBtn} onPress={handleCTAPress} activeOpacity={0.88}>
              <Ionicons name="checkmark-circle-outline" size={18} color={L.navy} />
              <Text style={s.joinBtnText}>Accept Invite</Text>
            </TouchableOpacity>
          </>
        );
      case 'joined':
        return (
          <View style={s.joinedRow}>
            <View style={s.joinedStatus}>
              <View style={s.joinedCheck}>
                <Ionicons name="checkmark" size={14} color={L.green} />
              </View>
              <View>
                <Text style={s.joinedLabel}>You're In! ✓</Text>
                <Text style={s.joinedSub}>{joinedCount}/{event.maxPlayers} attending</Text>
              </View>
            </View>
            <View style={s.joinedActions}>
              <TouchableOpacity
                style={[s.joinBtn, { flex: 1, justifyContent: 'center', backgroundColor: L.greenBg, borderWidth: 1.5, borderColor: L.green }]}
                onPress={handleCTAPress}
                activeOpacity={0.85}
              >
                <Ionicons name="people-outline" size={18} color={L.green} />
                <Text style={[s.joinBtnText, { color: L.green }]}>View Players</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.leaveBtn}
                onPress={handleLeaveEvent}
                activeOpacity={0.75}
                disabled={leaving}
              >
                {leaving ? (
                  <ActivityIndicator size="small" color={L.danger} />
                ) : (
                  <>
                    <Ionicons name="exit-outline" size={18} color={L.danger} />
                    <Text style={s.leaveBtnText}>Leave</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        );
      case 'organizer':
        return (
          <>
            <View>
              <Text style={s.bottomSpots}>Organizing</Text>
              <Text style={s.bottomPlayers}>{joinedCount}/{event.maxPlayers} players joined</Text>
            </View>
            <TouchableOpacity style={s.joinBtn} onPress={handleCTAPress} activeOpacity={0.88}>
              <Ionicons name="settings-outline" size={18} color={L.navy} />
              <Text style={s.joinBtnText}>Manage Event</Text>
            </TouchableOpacity>
          </>
        );
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (pageLoading) {
    return (
      <View style={[s.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color={L.gold} />
      </View>
    );
  }

  if (pageError) {
    return (
      <View style={[s.root, { alignItems: 'center', justifyContent: 'center', padding: spacing.xxxl }]}>
        <StatusBar style="light" />
        <ErrorState
          title={pageError}
          inline
          action={{ label: 'Go Back', onPress: () => goBack() }}
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={s.root}
      // Android uses softwareKeyboardLayoutMode "pan" (app.json); let the OS pan the
      // focused chat input into view. 'height' fights pan mode and hides the input.
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <StatusBar style="light" />

      <Animated.ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: scrollBottomPadding }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          {
            useNativeDriver: true,
            listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
              const pinned = e.nativeEvent.contentOffset.y >= pinPoint;
              setTabsPinned(prev => (prev === pinned ? prev : pinned));
            },
          },
        )}
      >
        {/* ── HERO (preserved) ── */}
        <View style={s.hero}>
          <Animated.Image
            source={{ uri: event.heroPhoto }}
            style={[StyleSheet.absoluteFill, { transform: [{ scale: heroScale }] }]}
            resizeMode="cover"
          />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]} />
          <LinearGradient
            colors={['rgba(0,0,0,0.22)', 'rgba(0,0,0,0.05)', 'rgba(0,0,0,0.70)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={[s.topControls, { marginTop: insets.top + 8 }]}>
            <TouchableOpacity style={s.circleBtn} onPress={() => goBack()} activeOpacity={0.85}>
              <Ionicons name="chevron-back" size={20} color={colors.white} />
            </TouchableOpacity>
            <View style={s.topRight}>
              <TouchableOpacity style={s.circleBtn} activeOpacity={0.85} onPress={handleShare}>
                <Ionicons name="share-outline" size={20} color={colors.white} />
              </TouchableOpacity>
              <TouchableOpacity style={s.circleBtn} onPress={() => setSaved(v => !v)} activeOpacity={0.85}>
                <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={20} color={saved ? L.gold : colors.white} />
              </TouchableOpacity>
              {communityCalendarEvent && (
                <AddToCalendarButton
                  event={communityCalendarEvent}
                  variant="icon"
                  style={s.circleBtn}
                  iconColor={colors.white}
                />
              )}
              {IS_ORGANIZER && (
                <TouchableOpacity style={s.circleBtn} onPress={() => setShowManageSheet(true)} activeOpacity={0.85} disabled={cancelling}>
                  {cancelling
                    ? <ActivityIndicator size="small" color={colors.white} />
                    : <Ionicons name="ellipsis-horizontal" size={20} color={colors.white} />}
                </TouchableOpacity>
              )}
            </View>
          </View>
          <View style={s.heroContent}>
            <View style={[s.badge, { backgroundColor: fillColor }]}>
              <Text style={[s.badgeText, { color: event.badgeGold ? L.navy : colors.white }]}>{event.badge}</Text>
            </View>
            <Text style={s.heroTitle}>{event.name}</Text>
            <View style={s.heroMeta}>
              <Ionicons name="calendar-outline" size={13} color="rgba(255,255,255,0.85)" />
              <Text style={s.heroMetaText}>{event.date}</Text>
            </View>
            <View style={s.heroMeta}>
              <Ionicons name="location-outline" size={13} color="rgba(255,255,255,0.85)" />
              <Text style={s.heroMetaText}>{event.venue}</Text>
            </View>
            {event.city ? (
              <Text style={[s.heroMetaText, s.heroMetaSubline]}>{event.city}</Text>
            ) : null}
          </View>
        </View>

        {/* ── TAB BAR ── */}
        <TabRow active={activeTab} onSelect={setActiveTab} />

        {/* ── TAB CONTENT ── */}
        <View style={s.content}>
          {activeTab === 'overview' && <OverviewContent />}
          {activeTab === 'players' && <PlayersContent />}
          {activeTab === 'chat'    && <ChatContent />}
        </View>
      </Animated.ScrollView>

      {/* ── PINNED TAB BAR ──
          A sibling of the ScrollView, so content scrolls underneath it. Fades
          in as the inline copy above reaches the status bar. paddingTop carries
          the same opaque background up behind the notch, otherwise content
          would show through above the tabs. */}
      <Animated.View
        pointerEvents={tabsPinned ? 'auto' : 'none'}
        style={[s.stickyTabs, { paddingTop: insets.top, opacity: stickyOpacity }]}
      >
        <TabRow active={activeTab} onSelect={setActiveTab} />
      </Animated.View>

      {/* ── FIXED BOTTOM BAR ── */}
      <View
        style={[s.bottomBar, { paddingBottom: insets.bottom + 12 }]}
        onLayout={e => {
          const h = Math.round(Math.max(0, e.nativeEvent.layout.height - insets.bottom));
          setBarHeight(prev => (prev === h ? prev : h));
        }}
      >
        {renderBottomContent()}
      </View>

      <Modal visible={showGuestForm} animationType="slide" transparent onRequestClose={() => setShowGuestForm(false)}>
        <Pressable style={gf.backdrop} onPress={() => setShowGuestForm(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%' }}>
            <Pressable style={[gf.sheet, { paddingBottom: insets.bottom + 24 }]} onPress={() => {}}>
              <View style={gf.handle} />
              <Text style={gf.title}>Join as Guest</Text>
              <Text style={gf.sub}>You can claim this spot when you create an account.</Text>
              <View style={gf.fieldWrap}>
                <Text style={gf.label}>First Name *</Text>
                <TextInput
                  style={gf.input}
                  placeholder="First name"
                  placeholderTextColor={L.textMuted}
                  value={guestName}
                  onChangeText={setGuestName}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>
              <View style={gf.fieldWrap}>
                <Text style={gf.label}>Last Initial</Text>
                <TextInput
                  style={gf.input}
                  placeholder="e.g. D"
                  placeholderTextColor={L.textMuted}
                  value={guestInitial}
                  onChangeText={v => setGuestInitial(v.slice(0, 1).toUpperCase())}
                  autoCapitalize="characters"
                  maxLength={1}
                  returnKeyType="next"
                />
              </View>
              <View style={gf.fieldWrap}>
                <Text style={gf.label}>Email *</Text>
                <TextInput
                  style={gf.input}
                  placeholder="your@email.com"
                  placeholderTextColor={L.textMuted}
                  value={guestEmail}
                  onChangeText={setGuestEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  returnKeyType="done"
                  onSubmitEditing={submitGuestJoin}
                />
              </View>
              <TouchableOpacity
                style={[gf.submitBtn, guestJoining && { opacity: 0.6 }]}
                activeOpacity={0.85}
                disabled={guestJoining}
                onPress={submitGuestJoin}
              >
                {guestJoining
                  ? <ActivityIndicator size="small" color={L.navy} />
                  : <PickleballIcon size={18} color={L.navy} />}
                <Text style={gf.submitText}>{guestJoining ? 'Joining…' : 'Join as Guest'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={gf.signInLink} onPress={() => { setShowGuestForm(false); router.push('/auth/login' as never); }}>
                <Text style={gf.signInText}>Have an account? Sign in</Text>
              </TouchableOpacity>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      <JoinCelebration
        visible={showCelebration}
        onDone={() => setShowCelebration(false)}
      />

      <ManageEventSheet
        visible={showManageSheet}
        onClose={() => setShowManageSheet(false)}
        onEdit={() => router.push(`/community/${id}/edit` as never)}
        onCancelEvent={handleCancelEvent}
      />
    </KeyboardAvoidingView>
  );
}

// ─── Tab bar styles ───────────────────────────────────────────────────────────

const tb = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: L.bg,
    borderBottomWidth: 1,
    borderBottomColor: L.border,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    position: 'relative',
  },
  label: {
    color: L.textMuted,
    fontSize: text.controlLabel.size,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  labelActive: {
    color: L.navy,
    fontWeight: '700',
  },
  underline: {
    position: 'absolute',
    bottom: 0,
    left: '25%',
    right: '25%',
    height: 2.5,
    borderRadius: 2,
    backgroundColor: L.gold,
  },
});

// ─── Players tab styles ───────────────────────────────────────────────────────

const pl = StyleSheet.create({
  segWrap: {
    flexDirection: 'row',
    backgroundColor: '#EEF2F9',
    borderRadius: shape.panel,
    padding: spacing.xs,
    marginBottom: spacing.xxl,
  },
  seg: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: shape.cta,
  },
  segActive: {
    backgroundColor: L.bg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  segLabel: {
    fontSize: text.controlLabel.size,
    fontWeight: '700',
    color: L.textMuted,
  },
  segLabelActive: {
    color: L.navy,
    fontWeight: '700',
  },

  orgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: L.bg,
    borderWidth: 1,
    borderColor: L.border,
    borderRadius: shape.card,
    padding: spacing.md,
    marginBottom: spacing.xxl,
  },
  orgNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  orgBadge: {
    backgroundColor: L.goldLight,
    borderWidth: 1,
    borderColor: L.gold,
    borderRadius: shape.badge,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  orgBadgeText: {
    color: L.gold,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  viewAllText: {
    color: L.gold,
    fontSize: text.link.size,
    fontWeight: '700',
  },

  listCard: {
    backgroundColor: L.bg,
    borderWidth: 1,
    borderColor: L.border,
    borderRadius: shape.card,
    overflow: 'hidden',
    marginBottom: spacing.xxl,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '800',
  },
  playerInfo: { flex: 1 },
  playerNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  playerName: { color: L.navy, fontSize: text.body.size, fontWeight: '500' },
  playerRating: { color: L.gold, fontSize: text.chipValue.size, fontWeight: '800' },
  playerMeta: { color: L.textMuted, fontSize: text.caption.size, fontWeight: '500' },

  acceptedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: L.greenBg,
    borderWidth: 1,
    borderColor: L.greenBorder,
    borderRadius: shape.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  acceptedText: { color: L.green, fontSize: 11, fontWeight: '700' },

  msgBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: L.goldLight, borderWidth: 1, borderColor: L.gold,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },

  pendingChip: {
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: shape.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  pendingText: { color: '#EA580C', fontSize: 11, fontWeight: '700' },

  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxxl,
    gap: spacing.sm,
  },
  emptyText: { color: L.textMuted, fontSize: text.body.size, fontWeight: '500', textAlign: 'center' },

  inviteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: L.gold,
    borderRadius: shape.cta,
    paddingVertical: spacing.md,
    backgroundColor: L.bg,
    marginBottom: spacing.sm,
  },
  inviteBtnText: { color: L.navy, fontSize: text.actionLarge.size, fontWeight: '800' },
  inviteBtnDisabled: { opacity: 0.5, borderColor: L.border },
  inviteBtnTextDisabled: { color: L.textMuted },
  pastNotice: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  pastNoticeText: { fontSize: text.caption.size, fontWeight: '500', color: L.textMuted, flex: 1 },
});

// ─── Chat tab styles ──────────────────────────────────────────────────────────

const gf = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(10,18,40,0.50)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: L.bg,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: spacing.xxl, paddingTop: 0,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: L.border,
    alignSelf: 'center', marginVertical: spacing.md,
  },
  title: { color: L.navy, fontSize: text.modalTitle.size, fontWeight: '900', marginBottom: spacing.xs },
  sub: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', marginBottom: spacing.xl },
  fieldWrap: { marginBottom: spacing.md },
  label: { color: L.textMuted, fontSize: 11, fontWeight: '600', letterSpacing: 0.3, marginBottom: spacing.xs },
  input: {
    borderWidth: 1, borderColor: L.border, borderRadius: shape.panel,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    fontSize: text.body.size, fontWeight: '500', color: L.navy, backgroundColor: L.bg,
  },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: L.gold, borderRadius: shape.cta, paddingVertical: spacing.md, marginTop: spacing.xs,
  },
  submitText: { color: L.navy, fontSize: text.actionLarge.size, fontWeight: '800' },
  signInLink: { alignItems: 'center', marginTop: spacing.lg },
  signInText: { color: L.gold, fontSize: text.caption.size, fontWeight: '500' },
});

const ch = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: L.border,
  },
  headerLeft: {},
  headerTitle: { color: L.navy, fontSize: text.sectionTitle.size, fontWeight: '900' },
  headerSub: { color: L.textMuted, fontSize: text.caption.size, fontWeight: '500', marginTop: spacing.xs },

  emptyWrap: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
    gap: spacing.md,
  },
  emptyText: {
    color: L.textMuted,
    fontSize: text.body.size,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 220,
  },

  messagesList: { gap: spacing.md },

  msgWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  msgWrapMe: {
    flexDirection: 'row-reverse',
  },

  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarHidden: {
    backgroundColor: 'transparent',
  },
  avatarText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '800',
  },

  bubble: {
    maxWidth: '74%',
    borderRadius: shape.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  bubbleThem: {
    backgroundColor: L.bg,
    borderWidth: 1,
    borderColor: L.border,
    borderBottomLeftRadius: 4,
  },
  bubbleMe: {
    backgroundColor: L.navy,
    borderBottomRightRadius: 4,
  },

  senderName: {
    color: L.gold,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  messageText: {
    color: L.navy,
    fontSize: text.body.size,
    lineHeight: 20,
    fontWeight: '500',
  },
  messageTextMe: {
    color: colors.white,
  },
  timestamp: {
    color: L.textMuted,
    fontSize: 10,
    fontWeight: '500',
    marginTop: spacing.xs,
  },
  timestampMe: {
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'right',
  },
});

// ─── Main screen styles ───────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },

  // Pinned tab bar. Opaque so the content passing underneath does not show
  // through, and elevated so Android keeps it above the ScrollView.
  stickyTabs: {
    position: 'absolute', top: 0, left: 0, right: 0,
    backgroundColor: L.bg,
    zIndex: 20, elevation: 4,
  },

  // Hero
  // 324, not 300: heroContent is bottom-anchored, so a two-line event name
  // grows the stack upward until the status badge collides with the back
  // chevron (which sits at insets.top + 8). The extra height lowers the whole
  // text block instead of shrinking the title.
  // overflow hidden clips the scroll-zoom: the image scales up to 2x on pull,
  // and without this it would paint over the tab bar below.
  hero: { height: HERO_HEIGHT, position: 'relative', overflow: 'hidden' },
  topControls: {
    position: 'absolute', left: spacing.screenH, right: spacing.screenH,
    flexDirection: 'row', justifyContent: 'space-between', zIndex: 10,
  },
  topRight: { flexDirection: 'row', gap: spacing.sm },
  circleBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.38)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroContent: { position: 'absolute', bottom: 0, left: spacing.screenH, right: spacing.screenH, paddingBottom: spacing.xl },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start',
    borderRadius: 8, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, marginBottom: spacing.sm,
  },
  badgeText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  heroTitle: { color: colors.white, fontSize: 32, fontWeight: '800', lineHeight: 36, marginBottom: spacing.sm, textTransform: 'uppercase' },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  heroMetaText: { color: 'rgba(255,255,255,0.88)', fontSize: text.caption.size, fontWeight: '500' },
  heroMetaSubline: { marginLeft: 17, marginBottom: spacing.xs },

  // Content
  content: { paddingHorizontal: spacing.screenH, paddingTop: spacing.xl },

  // Stat pills
  bracketBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderColor: L.gold, borderRadius: shape.cta,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  bracketBannerText: { flex: 1, color: L.navy, fontSize: text.rowValue.size, fontWeight: '800' },
  statPills: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', marginBottom: spacing.md, justifyContent: 'center' },
  statPill: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    borderWidth: 1, borderColor: L.border, borderRadius: shape.pill,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs, backgroundColor: L.bg,
  },
  statPillText: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500' },

  // Fill bar
  fillBarRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xxl },
  fillBarBg: { flex: 1, height: 6, borderRadius: 3, backgroundColor: L.border },
  fillBarFill: { height: 6, borderRadius: 3 },
  fillPct: { color: L.textMuted, fontSize: text.caption.size, fontWeight: '500' },

  // Section title
  // Matches the tournament detail screen's sectionTitle (13 / 900 / 0.8) so
  // headings read the same across both screens. Margins are this screen's own.
  sectionTitle: { color: L.navy, fontSize: text.sectionLabel.size, fontWeight: '800', letterSpacing: text.sectionLabel.letterSpacing, marginBottom: spacing.md, marginTop: spacing.xs },
  // Overview-tab headings only. sectionTitle is shared with the Players tab
  // (Accepted Players, Pending Invites, Waitlist), which stays title case.
  sectionTitleUpper: { textTransform: 'uppercase' as const },

  // Organizer
  organizerCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: L.bg, borderWidth: 1, borderColor: L.border, borderRadius: shape.card,
    padding: spacing.md, marginBottom: spacing.xxl,
  },
  orgInfo: { flex: 1 },
  orgName: { color: L.navy, fontSize: text.body.size, fontWeight: '500', marginBottom: spacing.xs },
  orgMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  orgMetaText: { color: L.textMuted, fontSize: text.caption.size, fontWeight: '500' },
  orgDot: { color: L.textMuted, fontSize: text.caption.size, fontWeight: '500' },
  followBtn: {
    borderWidth: 1.5, borderColor: L.gold, borderRadius: shape.cta,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  followBtnText: { color: L.gold, fontSize: text.action.size, fontWeight: '800' },

  msgOrgBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    marginTop: spacing.md,
    marginBottom: spacing.xxl,
    borderWidth: 1.5, borderColor: L.gold, borderRadius: shape.cta,
    paddingVertical: spacing.sm, backgroundColor: L.page,
  },
  msgOrgText: { color: L.navy, fontSize: text.rowTitle.size, fontWeight: '700' },

  // About
  // Matches the tournament detail screen's `description` (text / 14 / 22 / 400).
  // Only the colour differed — this was textSub, which read as muted next to
  // the tournament copy. paddingHorizontal is deliberately not copied across:
  // that screen's description sits in an unpadded container, this one doesn't.
  aboutText: { color: L.text, fontSize: text.body.size, lineHeight: 22, fontWeight: '500', marginBottom: spacing.xxl },

  // Details card
  detailsCard: {
    backgroundColor: L.bg, borderWidth: 1, borderColor: L.border,
    borderRadius: shape.card, overflow: 'hidden', marginBottom: spacing.xxl,
  },
  divider: { height: 1, backgroundColor: L.border },

  // Players preview
  playersRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xxl },
  playerAvatarWrap: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, borderColor: L.page, marginRight: -8,
  },
  playerMore: { backgroundColor: L.border },
  playerMoreText: { color: L.textSub, fontSize: 11, fontWeight: '800' },
  playersLabel: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', marginLeft: spacing.xl },

  // Location
  locationCard: {
    backgroundColor: L.bg, borderWidth: 1, borderColor: L.border,
    borderRadius: shape.card, overflow: 'hidden', marginBottom: spacing.xxl,
  },
  mapPlaceholder: {
    height: 130, backgroundColor: '#F0F4FA',
    alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
  },
  mapText: { color: L.textMuted, fontSize: text.caption.size, fontWeight: '500' },
  locationInfo: { padding: spacing.md, gap: spacing.xs },
  locationTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  locationVenue: { color: L.navy, fontSize: text.body.size, fontWeight: '500' },
  locationVerifiedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: '#DBEAFE', borderRadius: shape.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
  },
  locationVerifiedText: { fontSize: 9, fontWeight: '800', color: '#2563EB', letterSpacing: 0.4 },
  locationAddr: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500' },
  locationBtnRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, justifyContent: 'center' },
  directionsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    borderWidth: 1.5, borderColor: L.gold, borderRadius: shape.cta, alignSelf: 'flex-start',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  directionsBtnText: { color: L.gold, fontSize: text.action.size, fontWeight: '800' },
  viewFacilityBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    borderWidth: 1.5, borderColor: L.gold, borderRadius: shape.cta, alignSelf: 'flex-start',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  viewFacilityBtnText: { color: L.gold, fontSize: text.action.size, fontWeight: '800' },

  // Joined state — stacked so the status message always gets full width
  // (a single row was squeezing it against the action buttons and truncating it).
  joinedRow: { flex: 1, gap: spacing.sm },
  joinedStatus: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  joinedCheck: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: L.greenBg, borderWidth: 1.5, borderColor: L.green,
    alignItems: 'center', justifyContent: 'center',
  },
  joinedLabel: { color: L.navy, fontSize: text.body.size, fontWeight: '500' },
  joinedSub: { color: L.textMuted, fontSize: text.caption.size, fontWeight: '500', marginTop: spacing.xs },
  joinedActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },

  // Bottom bar
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: L.bg, paddingHorizontal: spacing.screenH, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: L.border,
    gap: spacing.sm,
  },
  bottomSpots: { color: L.navy, fontSize: text.body.size, fontWeight: '500' },
  bottomPlayers: { color: L.textMuted, fontSize: text.caption.size, fontWeight: '500' },
  joinBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: L.gold, borderRadius: shape.cta,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
  },
  joinBtnText: { color: L.navy, fontSize: text.actionLarge.size, fontWeight: '800' },
  viewPlayersBtn: { flexShrink: 1, paddingHorizontal: spacing.md },
  leaveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    borderRadius: shape.cta, paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderWidth: 1.5, borderColor: L.danger, backgroundColor: L.dangerBg,
  },
  leaveBtnText: { color: L.danger, fontSize: text.rowValue.size, fontWeight: '800' },

  // Chat input (in bottom bar when on chat tab)
  chatInput: {
    flex: 1,
    backgroundColor: L.page,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: L.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    fontSize: text.body.size, fontWeight: '500',
    color: L.navy,
    maxHeight: 42,
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: L.navy,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  sendBtnDisabled: {
    backgroundColor: L.textMuted,
  },
});
