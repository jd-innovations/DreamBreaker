import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, Alert, Share, Dimensions, ActivityIndicator,
  Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing, radius, iconCircle } from '@/theme';
import { useSession } from '@/hooks/useSession';
import { StatusChip } from '@/components/StatusChip';
import { PickleballIcon, JoinCelebration } from '@/components';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SecondaryButton } from '@/components/SecondaryButton';
import {
  fetchPlayEventWithOrganizer, fetchPlayParticipants, fetchPublicPlayParticipantCount, cancelPlayEvent, completePlayEvent,
  removePlayParticipant, addPlayParticipant, joinEventErrorMessage, updatePlayEvent,
  updatePlayEventStatus,
  type PlayEvent, type OrganizerProfile, type PlayParticipant,
} from '@/lib/supabase/playEvents';
import { getCurrentGame, updateStatus, type QuickGame } from '@/lib/quickGameStore';
import { getRosterCount } from '@/lib/quickGameRosterStore';
import { fetchFacilityById, type FacilityDetail } from '@/lib/supabase/facilities';
import { createCommunityShareMessage } from '@/lib/communityShare';
import { FacilityCard } from '@/components/FacilityCard';
import { VenueMapCard } from '@/components/VenueMapCard';

// ─── Constants ──────────────────────────────────────────────────────────────────

const { width: SW } = Dimensions.get('window');
const HERO_H = Math.round((SW - spacing.screenH * 2) * (9 / 16));

const FALLBACK_PHOTO =
  'https://images.unsplash.com/photo-1564977695759-da1be1ceb25c?w=800&h=450&fit=crop&q=80';
const HOST_AVATAR =
  'https://images.unsplash.com/photo-1607990281513-2c110a25bd8c?w=120&h=120&fit=crop&q=80';

// ─── Theme alias ────────────────────────────────────────────────────────────────

const L = {
  navy:       colors.navy,
  gold:       colors.gold,
  goldBg:     colors.goldBg,
  goldLight:  colors.goldLight,
  goldBorder: colors.goldBorder,
  text:       colors.text,
  textSub:    colors.textSub,
  bg:         colors.bg,
  page:       colors.page,
  border:     colors.border,
  white:      colors.white,
  success:    colors.success,
  successBg:  colors.successBg,
  danger:     colors.danger,
  dangerBg:   colors.dangerBg,
};

// ─── Helpers ────────────────────────────────────────────────────────────────────

function comingSoon(feature: string) {
  Alert.alert(feature, 'Coming soon — this feature is on the way.', [{ text: 'Got It' }]);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

function ActionRow({
  icon, label, sub, onPress, last = false, disabled = false, disabledSub,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sub: string;
  onPress?: () => void;
  last?: boolean;
  disabled?: boolean;
  disabledSub?: string;
}) {
  return (
    <TouchableOpacity
      style={[ar.row, !last && ar.border, disabled && ar.rowDisabled]}
      onPress={disabled ? undefined : onPress}
      activeOpacity={disabled ? 1 : 0.75}
      disabled={disabled}
    >
      <View style={[ar.iconWrap, disabled && ar.iconWrapDisabled]}>
        <Ionicons name={icon} size={19} color={disabled ? L.textSub : L.gold} />
      </View>
      <View style={ar.body}>
        <Text style={[ar.label, disabled && ar.labelDisabled]}>{label}</Text>
        <Text style={ar.sub}>{disabled && disabledSub ? disabledSub : sub}</Text>
      </View>
      {!disabled && <Ionicons name="chevron-forward" size={17} color={L.textSub} />}
    </TouchableOpacity>
  );
}

const ar = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: spacing.lg, paddingVertical: 13,
  },
  border: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border },
  iconWrap: {
    width: iconCircle.small, height: iconCircle.small,
    borderRadius: iconCircle.small / 2,
    backgroundColor: L.goldBg,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  body:  { flex: 1 },
  label: { fontSize: 14, fontWeight: '700', color: L.navy },
  sub:   { fontSize: 12, color: L.textSub, marginTop: 1 },
  rowDisabled:      { opacity: 0.5 },
  iconWrapDisabled: { backgroundColor: L.page },
  labelDisabled:    { color: L.textSub },
});

/** Mock map tile — placeholder for a real map integration */
function MockMapTile({ location }: { location: string }) {
  return (
    <TouchableOpacity style={mm.root} activeOpacity={0.85}>
      {/* Grid roads */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#E8EDF5' }]} />
      {[0.25, 0.55, 0.80].map(y => (
        <View key={`h${y}`} style={[mm.road, { top: `${y * 100}%` as any, left: 0, right: 0, height: 5 }]} />
      ))}
      {[0.20, 0.50, 0.75].map(x => (
        <View key={`v${x}`} style={[mm.road, { left: `${x * 100}%` as any, top: 0, bottom: 0, width: 4 }]} />
      ))}
      {/* Green area */}
      <View style={[mm.green, { width: 80, height: 40, top: 10, left: 10 }]} />
      {/* Court pin */}
      <View style={mm.pinWrap}>
        <View style={mm.pin}>
          <PickleballIcon size={13} color={L.white} />
        </View>
        <View style={mm.pinTail} />
      </View>
      {/* Directions button */}
      <View style={mm.directions}>
        <Ionicons name="navigate-outline" size={13} color={L.navy} />
        <Text style={mm.directionsText}>Directions</Text>
      </View>
    </TouchableOpacity>
  );
}

const mm = StyleSheet.create({
  root: {
    height: 90, borderRadius: radius.sm,
    overflow: 'hidden', marginTop: 10,
    borderWidth: 1, borderColor: L.border,
  },
  road:  { position: 'absolute', backgroundColor: '#FFFFFF' },
  green: { position: 'absolute', backgroundColor: '#D4EBD4', borderRadius: 8 },
  pinWrap: {
    position: 'absolute', alignItems: 'center',
    left: '48%', top: '15%',
  },
  pin: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: L.navy,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25, shadowRadius: 4, elevation: 4,
  },
  pinTail: {
    width: 0, height: 0,
    borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 7,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    borderTopColor: L.navy, marginTop: -1,
  },
  directions: {
    position: 'absolute', bottom: 8, right: 8,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: L.white,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: L.border,
  },
  directionsText: { fontSize: 11, fontWeight: '700', color: L.navy },
});

// ─── Screen ─────────────────────────────────────────────────────────────────────

// ─── Adapters ─────────────────────────────────────────────────────────────────
// Map PlayEvent (Supabase) → display shape used by this screen

function skillLabel(min: number | null, max: number | null): string {
  if (min == null) return '—';
  if (max == null) return `${min}+`;
  return `${min} – ${max}`;
}

function playEventToDisplay(e: PlayEvent) {
  // start_time is stored as "HH:MM:SS" (time only) — combine with date for valid ISO
  const startTime = e.start_time
    ? `${e.event_date}T${e.start_time}`
    : e.event_date;
  return {
    id:           e.id,
    title:        e.name,
    imageUri:     e.cover_url ?? FALLBACK_PHOTO,
    date:         e.event_date,
    startTime,
    locationName: e.venue_name ?? e.location,
    skillRange:   skillLabel(e.skill_min, e.skill_max),
    playersNeeded: e.max_players,
    status:       e.status,
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function QuickGameCreatedScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isSupabase = !!id && UUID_RE.test(id);

  // Supabase-backed path: id param present → fetch from DB (with organizer profile join)
  const [event,      setEvent]      = useState<PlayEvent | null>(null);
  const [organizer,  setOrganizer]  = useState<OrganizerProfile | null>(null);
  const [loadingEvt, setLoadingEvt] = useState(!!id);
  const [notFound,   setNotFound]   = useState(false);
  const [facility,   setFacility]   = useState<FacilityDetail | null>(null);
  // Hero scrolls away with the content now; flip the status bar + persistent
  // back button once the (dark) hero has scrolled mostly past the safe area.
  const [heroScrolledPast, setHeroScrolledPast] = useState(false);

  // Edit modal state
  const [editOpen,    setEditOpen]    = useState(false);
  const [editSaving,  setEditSaving]  = useState(false);
  const [editName,    setEditName]    = useState('');
  const [editDate,    setEditDate]    = useState('');
  const [editTime,    setEditTime]    = useState('');
  const [editMax,     setEditMax]     = useState('');
  const [editVenue,   setEditVenue]   = useState('');
  const [editNotes,   setEditNotes]   = useState('');

  useEffect(() => {
    if (!id) return;
    setLoadingEvt(true);
    fetchPlayEventWithOrganizer(id)
      .then(data => {
        if (!data) { setNotFound(true); return; }
        setEvent(data);
        setOrganizer(data.organizer ?? null);
        if (data.facility_id) {
          fetchFacilityById(data.facility_id).then(f => setFacility(f)).catch(() => {});
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoadingEvt(false));
  }, [id]);

  // Legacy local-store fallback (used only if no id param)
  const localGame = getCurrentGame();
  const localFallback: ReturnType<typeof playEventToDisplay> = localGame
    ? {
        id:            localGame.id,
        title:         localGame.title,
        imageUri:      localGame.imageUri ?? FALLBACK_PHOTO,
        date:          localGame.date,
        startTime:     localGame.startTime,
        locationName:  localGame.locationName,
        skillRange:    localGame.skillRange,
        playersNeeded: localGame.playersNeeded,
        status:        localGame.status,
      }
    : {
        id: 'demo', title: 'Thursday Open Play', imageUri: FALLBACK_PHOTO,
        date: new Date().toISOString(), startTime: new Date().toISOString(),
        locationName: 'Lakewood Ranch Courts', skillRange: '3.5 – 4.0',
        playersNeeded: 4, status: 'open' as const,
      };

  const g = id && event ? playEventToDisplay(event) : localFallback;
  const isCompleted = g.status === 'completed';
  const isCancelled = g.status === 'cancelled';
  const isPastEvent = isCompleted || isCancelled;

  // Supabase events: organizer is auto-added as first participant, start at 1.
  // Local/demo events: read from quickGameRosterStore (organizer not tracked there).
  const [rosterCount, setRosterCount] = useState(() => isSupabase ? 1 : getRosterCount(g.id));
  const [showCelebration, setShowCelebration] = useState(false);
  const [participants, setParticipants] = useState<PlayParticipant[]>([]);

  useFocusEffect(useCallback(() => {
    if (isSupabase) {
      Promise.all([
        fetchPlayParticipants(id!),
        fetchPublicPlayParticipantCount(id!),
      ])
        .then(([rows, count]) => { setRosterCount(count); setParticipants(rows); })
        .catch(() => { /* keep last count */ });
    } else {
      setRosterCount(getRosterCount(g.id));
    }
  }, [id, isSupabase, g.id]));

  const myParticipant = isSupabase && user?.id
    ? participants.find(p => p.claimed_by === user.id) ?? null
    : null;
  const isOrganizer = isSupabase && !!user?.id && event?.organizer_id === user.id;
  const canLeave = !!myParticipant && !isOrganizer &&
    (g.status === 'open' || g.status === 'full');
  const canJoin = isSupabase && !!user?.id && !myParticipant && !isOrganizer &&
    event?.status === 'open' && rosterCount < (event?.max_players ?? 0);

  // Loading state while fetching Supabase event
  if (loadingEvt) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.page }}>
        <ActivityIndicator size="large" color={colors.gold} />
        <Text style={{ marginTop: 12, fontSize: 14, color: colors.textSub }}>Loading your game…</Text>
      </View>
    );
  }

  // Not found
  if (id && notFound) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.page, padding: 32 }}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.danger} />
        <Text style={{ fontSize: 18, fontWeight: '800', color: colors.navy, marginTop: 16, textAlign: 'center' }}>
          Game not found
        </Text>
        <Text style={{ fontSize: 14, color: colors.textSub, marginTop: 8, textAlign: 'center' }}>
          This game may have been removed or the link is invalid.
        </Text>
        <TouchableOpacity onPress={() => router.replace('/(tabs)/games' as never)} style={{ marginTop: 24 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.gold }}>Go to My Games</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Supabase events: organizer is auto-added as participant so rosterCount already includes them.
  // Local/demo events: +1 for the host since they are not in the local roster store.
  const totalPlayers = isSupabase ? rosterCount : rosterCount + 1;
  const spotsLeft = Math.max(g.playersNeeded - totalPlayers, 0);

  function handleOpenEdit() {
    if (!event) return;
    setEditName(event.name ?? '');
    setEditDate(event.event_date ?? '');
    setEditTime(event.start_time ? event.start_time.slice(0, 5) : '');
    setEditMax(String(event.max_players ?? ''));
    setEditVenue(event.venue_name ?? event.location ?? '');
    setEditNotes(event.notes ?? '');
    setEditOpen(true);
  }

  async function handleSaveEdit() {
    if (!id || !event) return;
    const newMax = parseInt(editMax, 10);
    if (isNaN(newMax) || newMax < 2) {
      Alert.alert('Invalid', 'Max players must be at least 2.'); return;
    }
    if (newMax < rosterCount) {
      Alert.alert('Invalid', `Max players cannot be less than current roster (${rosterCount}).`); return;
    }
    const trimName = editName.trim();
    if (!trimName) {
      Alert.alert('Invalid', 'Game name cannot be empty.'); return;
    }
    setEditSaving(true);
    try {
      const updated = await updatePlayEvent(id, {
        name:        trimName,
        event_date:  editDate || undefined,
        start_time:  editTime ? `${editTime}:00` : null,
        max_players: newMax,
        venue_name:  editVenue.trim() || null,
        notes:       editNotes.trim() || null,
      });
      setEvent(updated);
      setEditOpen(false);
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? '';
      if (msg === 'not_authenticated') Alert.alert('Error', 'You must be signed in to edit this game.');
      else if (msg === 'not_organizer') Alert.alert('Error', 'Only the organizer can edit this game.');
      else if (msg === 'event_not_open') Alert.alert('Error', 'Only open games can be edited.');
      else if (msg === 'below_participant_count') Alert.alert('Invalid', `Max players cannot be less than current roster (${rosterCount}).`);
      else Alert.alert('Error', 'Could not save changes. Please try again.');
    } finally {
      setEditSaving(false);
    }
  }

  async function handleInvite() {
    if (isSupabase && event && isOrganizer &&
        event.status !== 'completed' && event.status !== 'cancelled') {
      return handleShare();
    }
    comingSoon('Invite Players');
  }

  async function handleShare() {
    try {
      const message = isSupabase && event
        ? createCommunityShareMessage(event)
        : `Join my pickleball game "${g.title}" on DreamBreaker!\n${fmtDate(g.date)} at ${fmtTime(g.startTime)} — ${g.locationName}`;
      await Share.share({ message, title: g.title });
    } catch { /* dismissed */ }
  }

  async function handleJoin() {
    if (!user || !id) return;
    const firstName = (user.user_metadata?.full_name as string | undefined)?.split(' ')[0]
      ?? (user.user_metadata?.name as string | undefined)?.split(' ')[0]
      ?? user.email?.split('@')[0]
      ?? 'Player';
    try {
      await addPlayParticipant({
        event_id:          id,
        first_name:        firstName,
        email:             user.email ?? '',
        claimed_by:        user.id,
        added_by_organizer: false,
      });
      const [rows, count] = await Promise.all([
        fetchPlayParticipants(id),
        fetchPublicPlayParticipantCount(id),
      ]);
      setParticipants(rows);
      setRosterCount(count);
      setShowCelebration(true);
    } catch (err) {
      Alert.alert('Error', joinEventErrorMessage(err));
    }
  }

  function handleLeave() {
    if (!myParticipant) return;
    Alert.alert(
      'Leave Game?',
      'You will be removed from the roster. The organizer will not be notified.',
      [
        { text: 'Stay', style: 'cancel' },
        {
          text: 'Leave Game',
          style: 'destructive',
          onPress: async () => {
            try {
              await removePlayParticipant(myParticipant.id);
              const [rows, count] = await Promise.all([
                fetchPlayParticipants(id!),
                fetchPublicPlayParticipantCount(id!),
              ]);
              setParticipants(rows);
              setRosterCount(count);
            } catch {
              Alert.alert('Error', 'Could not leave the game. Please try again.');
            }
          },
        },
      ],
    );
  }

  function handleCloseGame() {
    Alert.alert(
      'Close this Quick Game?',
      'Players will no longer be able to join.',
      [
        { text: 'Keep Open', style: 'cancel' },
        {
          text: 'Close Game',
          style: 'destructive',
          onPress: async () => {
            try {
              const updated = await updatePlayEventStatus(id!, 'closed');
              setEvent(updated);
              Alert.alert('Game Closed', 'The game is now closed to new players.');
            } catch {
              Alert.alert('Error', 'Could not close the game. Please try again.');
            }
          },
        },
      ],
    );
  }

  function handleReopenGame() {
    Alert.alert(
      'Reopen this Quick Game?',
      'Players will be able to join again if spots are available.',
      [
        { text: 'Keep Closed', style: 'cancel' },
        {
          text: 'Reopen Game',
          onPress: async () => {
            try {
              const updated = await updatePlayEventStatus(id!, 'open');
              setEvent(updated);
              Alert.alert('Game Reopened', 'The game is open for new players.');
            } catch (err) {
              const msg = (err as { message?: string })?.message ?? '';
              if (msg === 'reopen_at_capacity')
                Alert.alert('Cannot Reopen', 'The roster is already full. Increase max players before reopening.');
              else Alert.alert('Error', 'Could not reopen the game. Please try again.');
            }
          },
        },
      ],
    );
  }

  function handleMarkComplete() {
    Alert.alert(
      'Mark this Quick Game complete?',
      'Players will no longer be able to join or edit participation.',
      [
        { text: 'Keep Active', style: 'cancel' },
        {
          text: 'Mark Complete',
          onPress: async () => {
            try {
              const updated = await completePlayEvent(id!);
              setEvent(updated);
              Alert.alert('Game Complete', 'The game has been marked as completed.');
            } catch (err) {
              const msg = (err as { message?: string })?.message ?? '';
              if (msg === 'not_organizer') Alert.alert('Error', 'Only the organizer can complete this game.');
              else if (msg === 'status_not_completable') Alert.alert('Error', 'This game cannot be marked complete in its current state.');
              else Alert.alert('Error', 'Could not complete the game. Please try again.');
            }
          },
        },
      ],
    );
  }

  function handleCancelGame() {
    if (isSupabase && !user?.id) {
      Alert.alert('Sign in required', 'You must be signed in to cancel a game.');
      return;
    }

    Alert.alert(
      'Cancel this Quick Game?',
      'This action cannot be undone.',
      [
        { text: 'Keep Game', style: 'cancel' },
        {
          text: 'Cancel Game',
          style: 'destructive',
          onPress: async () => {
            if (!isSupabase) {
              updateStatus('cancelled');
              router.back();
              return;
            }
            try {
              await cancelPlayEvent(id!);
              Alert.alert('Game Cancelled', 'The game has been removed.');
              router.replace('/(tabs)/games' as never);
            } catch (err) {
              const msg = (err as { message?: string })?.message ?? '';
              if (msg === 'not_organizer') Alert.alert('Error', 'Only the organizer can cancel this game.');
              else if (msg === 'event_not_open') Alert.alert('Error', 'Only open games can be cancelled.');
              else Alert.alert('Error', 'Could not cancel the game. Please try again.');
            }
          },
        },
      ],
    );
  }

  const heroScrollThreshold = Math.round(SW * 0.72) - insets.top - 80;

  return (
    <View style={s.root}>
      <StatusBar style={heroScrolledPast ? 'dark' : 'light'} />

      {/* Persistent back button — stays fixed on top regardless of scroll,
          since the hero (and its own nav row) now scrolls away with content. */}
      <TouchableOpacity
        style={[s.floatingBack, { top: insets.top + 6 }]}
        onPress={() => router.replace('/(tabs)/games' as never)}
        activeOpacity={0.8}
      >
        <Ionicons name="chevron-back" size={22} color={heroScrolledPast ? L.navy : L.white} />
      </TouchableOpacity>

      {/* ── SCROLL ── */}
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        onScroll={e => setHeroScrolledPast(e.nativeEvent.contentOffset.y > heroScrollThreshold)}
        scrollEventThrottle={16}
      >
        {/* ── FULL-BLEED HERO — scrolls away with the rest of the content ── */}
        <View style={s.hero}>
          <Image
            source={{ uri: g.imageUri || FALLBACK_PHOTO }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
          <LinearGradient
            colors={['rgba(0,0,0,0.25)', 'rgba(0,0,0,0.55)']}
            style={StyleSheet.absoluteFill}
          />

          {/* Floating nav buttons (share/bookmark only — back button is the
              persistent one rendered above, outside the scroll) */}
          <View style={[s.navRow, { paddingTop: insets.top + 6 }]}>
            <View style={s.navRight}>
              <TouchableOpacity style={s.navBtn} onPress={handleShare} activeOpacity={0.8}>
                <Ionicons name="share-outline" size={20} color={L.white} />
              </TouchableOpacity>
              <TouchableOpacity style={s.navBtn} activeOpacity={0.8}>
                <Ionicons name="bookmark-outline" size={20} color={L.white} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Title + meta overlay (badge stacks above the title in normal
              flow so a 2-line title can never overlap it) */}
          <View style={s.heroContent}>
            <View style={s.heroBadgeRow}>
              <View style={s.openBadge}>
                <Text style={s.openBadgeText}>{g.status?.toUpperCase() ?? 'OPEN'}</Text>
              </View>
            </View>
            <Text style={s.heroTitle} numberOfLines={2}>{g.title}</Text>
            <View style={s.heroMeta}>
              <Ionicons name="calendar-outline" size={14} color="rgba(255,255,255,0.85)" />
              <Text style={s.heroMetaText}>
                {fmtDate(g.date)}{g.startTime ? `, ${fmtTime(g.startTime)}` : ''}
              </Text>
            </View>
            <View style={s.heroMeta}>
              <Ionicons name="location-outline" size={14} color="rgba(255,255,255,0.85)" />
              <Text style={s.heroMetaText} numberOfLines={1}>{g.locationName}</Text>
            </View>
          </View>
        </View>


        {/* Map */}
        <View style={s.mapCard}>
          {facility ? (
            <View style={s.mapCardInner}>
              <VenueMapCard
                latitude={Number(facility.latitude)}
                longitude={Number(facility.longitude)}
                name={facility.name}
              />
            </View>
          ) : (
            <View style={s.mapMockWrap}>
              <MockMapTile location={g.locationName} />
            </View>
          )}
        </View>

        {/* Facility card — shown when event is linked to a verified facility */}
        {facility && <FacilityCard facility={facility} />}

        {/* 3 ── FILL STATUS ── */}
        <View style={s.fillCard}>
          <View style={s.fillLeft}>
            <View style={s.fillIconWrap}>
              <Ionicons name="people-outline" size={20} color={L.gold} />
            </View>
            <View>
              <Text style={s.fillTitle}>Looking for {spotsLeft} More Player{spotsLeft !== 1 ? 's' : ''}</Text>
              <Text style={s.fillSub}>
                {totalPlayers} of {g.playersNeeded} joined
                {'  '}
                <Text style={s.fillSpots}>{spotsLeft} spots left</Text>
              </Text>
            </View>
          </View>
          {/* Dot indicators */}
          <View style={s.fillDots}>
            {Array.from({ length: g.playersNeeded }).map((_, i) => (
              <View
                key={i}
                style={[s.fillDot, i < totalPlayers ? s.fillDotFilled : s.fillDotEmpty]}
              />
            ))}
          </View>
        </View>

        {/* 4 ── PRIMARY ACQUISITION ACTIONS ── */}
        <View style={s.acqCard}>
          {isPastEvent && (
            <View style={s.pastNotice}>
              <Ionicons name="time-outline" size={13} color={L.textSub} />
              <Text style={s.pastNoticeText}>
                {isCancelled ? 'This game was cancelled — invites are closed.' : 'This game has ended — invites are closed.'}
              </Text>
            </View>
          )}
          <PrimaryButton
            label="Share Invite Link"
            icon="share-outline"
            onPress={handleShare}
            style={s.acqPrimary}
            disabled={isPastEvent}
          />
          <SecondaryButton
            label="Invite Friends"
            icon="person-add-outline"
            style={s.acqSecondary}
            onPress={handleInvite}
            disabled={isPastEvent}
          />
          <TouchableOpacity
            style={[s.nearbyBtn, isPastEvent && s.nearbyBtnDisabled]}
            activeOpacity={isPastEvent ? 1 : 0.8}
            onPress={isPastEvent ? undefined : () => router.push('/(tabs)/finder' as never)}
            disabled={isPastEvent}
          >
            <View style={s.nearbyIconWrap}>
              <Ionicons name="search-outline" size={17} color={isPastEvent ? L.textSub : L.gold} />
            </View>
            <View style={s.nearbyBody}>
              <Text style={[s.nearbyLabel, isPastEvent && s.nearbyLabelDisabled]}>Find {g.skillRange} Players Nearby</Text>
              <Text style={s.nearbySub}>Discover compatible players close to the court</Text>
            </View>
            {!isPastEvent && <Ionicons name="chevron-forward" size={16} color={L.textSub} />}
          </TouchableOpacity>
        </View>

        {/* 5 ── COMPACT PLAYERS ROSTER ── */}
        <View style={s.card}>
          <View style={s.rosterHeader}>
            <View style={s.rosterLeft}>
              <Ionicons name="people-outline" size={15} color={L.navy} />
              <Text style={s.rosterTitle}>Players ({totalPlayers}/{g.playersNeeded})</Text>
            </View>
            <TouchableOpacity style={s.viewAllBtn} activeOpacity={0.7} onPress={() => router.push(`/quick-game/${g.id}/roster` as never)}>
              <Text style={s.viewAllText}>View Full Roster</Text>
              <Ionicons name="chevron-forward" size={13} color={L.gold} />
            </TouchableOpacity>
          </View>

          {/* Host row */}
          <View style={[s.playerRow, s.playerRowBorder]}>
            <View style={s.avatarWrap}>
              {organizer?.avatar_url ? (
                <Image source={{ uri: organizer.avatar_url }} style={s.avatar} />
              ) : (
                <View style={[s.avatar, s.avatarFallback]}>
                  <Ionicons name="person" size={20} color={L.textSub} />
                </View>
              )}
              <View style={s.crownBadge}>
                <Ionicons name="star" size={8} color={L.white} />
              </View>
            </View>
            <View style={s.playerBody}>
              <Text style={s.playerName}>
                {organizer?.full_name ?? 'You'} <Text style={s.playerSub}>(Host)</Text>
              </Text>
              {organizer?.handle ? (
                <Text style={s.playerLevel}>@{organizer.handle}</Text>
              ) : (
                <Text style={s.playerLevel}>{g.skillRange} Level</Text>
              )}
            </View>
            <StatusChip label="Host" variant="green" />
          </View>

          {/* Joined players */}
          {isSupabase && participants.map((p) => {
            const initials = (p.first_name.charAt(0) + (p.last_initial ?? '')).toUpperCase();
            const displayName = p.last_initial ? `${p.first_name} ${p.last_initial}.` : p.first_name;
            return (
              <View key={p.id} style={[s.playerRow, s.playerRowBorder]}>
                <View style={s.avatarWrap}>
                  <View style={[s.avatar, s.avatarFallback]}>
                    <Text style={{ color: L.textSub, fontWeight: '800' }}>{initials}</Text>
                  </View>
                </View>
                <View style={s.playerBody}>
                  <Text style={s.playerName}>{displayName}</Text>
                  <Text style={s.playerLevel}>
                    {p.self_rating ? `Self Rating ${p.self_rating}` : `${g.skillRange} Level`}
                  </Text>
                </View>
                <StatusChip label="Joined" variant="green" />
              </View>
            );
          })}

          {/* Collapsed open spots */}
          {spotsLeft > 0 && (
            <TouchableOpacity style={s.openSpotsRow} activeOpacity={0.75} onPress={() => router.push(`/quick-game/${g.id}/roster` as never)}>
              <View style={s.openAvatarGroup}>
                {Array.from({ length: Math.min(spotsLeft, 3) }).map((_, i) => (
                  <View key={i} style={[s.openAvatarCircle, { marginLeft: i > 0 ? -10 : 0, zIndex: 3 - i }]}>
                    <Ionicons name="person-add-outline" size={13} color={L.textSub} />
                  </View>
                ))}
              </View>
              <Text style={s.openSpotsText}>+{spotsLeft} Open Spots</Text>
              <Ionicons name="chevron-forward" size={15} color={L.textSub} style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>
          )}
        </View>

        {/* 6 ── GAME CHAT ── */}
        <View style={s.card}>
          <View style={s.chatHeader}>
            <View style={s.chatIconWrap}>
              <Ionicons name="chatbubble-outline" size={17} color={L.gold} />
            </View>
            <View style={s.chatHeaderText}>
              <Text style={s.chatTitle}>Game Chat</Text>
              <Text style={s.chatSub}>Message players in this game</Text>
            </View>
          </View>
          {/* Empty state — no players yet */}
          {isSupabase && totalPlayers < 2 ? (
            <View style={s.chatEmpty}>
              <Ionicons name="chatbubbles-outline" size={28} color={L.border} />
              <Text style={s.chatEmptyText}>Chat becomes active when another player joins.</Text>
            </View>
          ) : null}
          <TouchableOpacity
            style={s.chatCta}
            activeOpacity={0.8}
            onPress={() => isSupabase
              ? router.push({ pathname: '/community/[id]', params: { id: g.id, tab: 'chat' } } as never)
              : comingSoon('Game Chat')
            }
          >
            <Text style={s.chatCtaText}>Open Chat</Text>
            <Ionicons name="chevron-forward" size={15} color={L.gold} />
          </TouchableOpacity>
        </View>

        {/* 7 ── MANAGEMENT ACTIONS ── */}
        <View style={[s.card, { padding: 0 }]}>
          <ActionRow
            icon="person-add-outline"
            label="Invite Players"
            sub="Invite friends or find nearby players"
            onPress={() => router.push({
              pathname: '/community/[id]/invite-players' as never,
              params: { id: g.id },
            } as never)}
            disabled={isPastEvent}
            disabledSub="This game has ended"
          />
          <ActionRow
            icon="people-outline"
            label="View Players"
            sub="See who's joined and spots left"
            onPress={() => router.push(`/quick-game/${g.id}/roster` as never)}
          />
          <ActionRow
            icon="settings-outline"
            label="Game Settings"
            sub="Edit game details, time, or skill level"
            last
            onPress={isOrganizer && event?.status === 'open'
              ? handleOpenEdit
              : () => comingSoon('Game Settings')}
          />
        </View>

        {/* JOIN GAME — logged-in, not participant, not organizer, open + space */}
        {canJoin && (
          <TouchableOpacity style={s.joinCard} onPress={handleJoin} activeOpacity={0.8}>
            <View style={s.joinIconWrap}>
              <Ionicons name="enter-outline" size={18} color={L.gold} />
            </View>
            <View style={s.cancelBody}>
              <Text style={s.joinTitle}>Join Game</Text>
              <Text style={s.joinSub}>Add yourself to the roster.</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={L.gold} />
          </TouchableOpacity>
        )}

        {/* LEAVE GAME — participant + not organizer + active only */}
        {canLeave && (
          <TouchableOpacity style={s.leaveCard} onPress={handleLeave} activeOpacity={0.8}>
            <View style={s.leaveIconWrap}>
              <Ionicons name="exit-outline" size={18} color={L.danger} />
            </View>
            <View style={s.cancelBody}>
              <Text style={s.leaveTitle}>Leave Game</Text>
              <Text style={s.leaveSub}>Remove yourself from the roster.</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={L.danger} />
          </TouchableOpacity>
        )}

        {/* GAME MANAGEMENT — header shown once above whichever of the three
            organizer actions below actually render */}
        {isOrganizer && (event?.status === 'open' || event?.status === 'full' || event?.status === 'in_progress') && (
          <Text style={s.mgmtSectionLabel}>Game Management</Text>
        )}

        {/* CLOSE GAME — organizer + Supabase + status open only */}
        {isOrganizer && event?.status === 'open' && (
          <TouchableOpacity style={s.completeCard} onPress={handleCloseGame} activeOpacity={0.8}>
            <View style={s.completeIconWrap}>
              <Ionicons name="lock-closed-outline" size={18} color={L.success} />
            </View>
            <View style={s.cancelBody}>
              <Text style={s.completeTitle}>Close Game</Text>
              <Text style={s.completeSub}>Stop accepting new players.</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={L.success} />
          </TouchableOpacity>
        )}

        {/* REOPEN GAME — organizer + Supabase + status full (closed) only */}
        {isOrganizer && event?.status === 'full' && (
          <TouchableOpacity style={s.completeCard} onPress={handleReopenGame} activeOpacity={0.8}>
            <View style={s.completeIconWrap}>
              <Ionicons name="lock-open-outline" size={18} color={L.success} />
            </View>
            <View style={s.cancelBody}>
              <Text style={s.completeTitle}>Reopen Game</Text>
              <Text style={s.completeSub}>Allow players to join again.</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={L.success} />
          </TouchableOpacity>
        )}

        {/* MARK COMPLETE ── organizer + open/full/in_progress only */}
        {isOrganizer && (event?.status === 'open' || event?.status === 'full' || event?.status === 'in_progress') && (
          <TouchableOpacity style={s.completeCard} onPress={handleMarkComplete} activeOpacity={0.8}>
            <View style={s.completeIconWrap}>
              <Ionicons name="checkmark-circle-outline" size={18} color={L.success} />
            </View>
            <View style={s.cancelBody}>
              <Text style={s.completeTitle}>Mark Game as Complete</Text>
              <Text style={s.completeSub}>Close the game and archive results.</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={L.success} />
          </TouchableOpacity>
        )}

        {/* DANGER ZONE — organizer + open only */}
        {(isOrganizer && event?.status === 'open' || !isSupabase) && (
        <Text style={s.dangerSectionLabel}>Danger Zone</Text>
        )}

        {/* CANCEL GAME — organizer + open only */}
        {(isOrganizer && event?.status === 'open' || !isSupabase) && (
        <TouchableOpacity style={s.cancelCard} onPress={handleCancelGame} activeOpacity={0.8}>
          <View style={s.cancelIconWrap}>
            <Ionicons name="trash-outline" size={18} color={L.danger} />
          </View>
          <View style={s.cancelBody}>
            <Text style={s.cancelTitle}>Cancel Game</Text>
            <Text style={s.cancelSub}>This will remove the game for everyone.</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.danger} />
        </TouchableOpacity>
        )}

      </ScrollView>

      {/* EDIT MODAL — organizer only, open events */}
      <Modal visible={editOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditOpen(false)}>
        <KeyboardAvoidingView style={s.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.modalHeader}>
            <TouchableOpacity onPress={() => setEditOpen(false)} hitSlop={12}>
              <Text style={s.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={s.modalTitle}>Edit Game</Text>
            <TouchableOpacity onPress={handleSaveEdit} disabled={editSaving} hitSlop={12}>
              <Text style={[s.modalSave, editSaving && { opacity: 0.4 }]}>Save</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={s.modalScroll} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <Text style={s.fieldLabel}>Game Name</Text>
            <TextInput style={s.fieldInput} value={editName} onChangeText={setEditName} placeholder="e.g. Saturday Morning Game" placeholderTextColor={L.textSub} />

            <Text style={s.fieldLabel}>Date (YYYY-MM-DD)</Text>
            <TextInput style={s.fieldInput} value={editDate} onChangeText={setEditDate} placeholder="2026-07-04" placeholderTextColor={L.textSub} keyboardType="numbers-and-punctuation" />

            <Text style={s.fieldLabel}>Start Time (HH:MM)</Text>
            <TextInput style={s.fieldInput} value={editTime} onChangeText={setEditTime} placeholder="09:00" placeholderTextColor={L.textSub} keyboardType="numbers-and-punctuation" />

            <Text style={s.fieldLabel}>Max Players</Text>
            <TextInput style={s.fieldInput} value={editMax} onChangeText={setEditMax} keyboardType="number-pad" placeholder="8" placeholderTextColor={L.textSub} />

            <Text style={s.fieldLabel}>Location / Venue</Text>
            <TextInput style={s.fieldInput} value={editVenue} onChangeText={setEditVenue} placeholder="Court name or address" placeholderTextColor={L.textSub} />

            <Text style={s.fieldLabel}>Notes (optional)</Text>
            <TextInput style={[s.fieldInput, s.fieldTextarea]} value={editNotes} onChangeText={setEditNotes} placeholder="Any extra info for players…" placeholderTextColor={L.textSub} multiline numberOfLines={3} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <JoinCelebration
        visible={showCelebration}
        onDone={() => setShowCelebration(false)}
      />
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },

  // Full-bleed hero — lives inside the ScrollView now, so it bleeds past
  // the scroll's horizontal padding the same way mapCard does below.
  hero: {
    height: Math.round(SW * 0.72),
    position: 'relative',
    backgroundColor: L.navy,
    marginHorizontal: -spacing.screenH,
  },
  navRow: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
  },
  navBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
  navRight: { flexDirection: 'row', gap: 10 },
  floatingBack: {
    position: 'absolute', left: 16, zIndex: 10, elevation: 10,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 4,
  },

  heroBadgeRow: {
    marginBottom: 10,
  },
  openBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: L.gold,
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6,
  },
  openBadgeText: { fontSize: 13, fontWeight: '800', color: L.navy, letterSpacing: 0.5 },

  heroContent: {
    position: 'absolute', bottom: 20, left: 20, right: 20, gap: 4,
  },
  heroTitle: {
    color: L.white, fontSize: 32, fontWeight: '800',
    marginBottom: 4,
    textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroMetaText: { fontSize: 14, color: 'rgba(255,255,255,0.9)', fontWeight: '500' },

  // Scroll
  scroll: { paddingHorizontal: spacing.screenH, paddingTop: spacing.md, gap: 12 },

  // Map card (replaces summaryCard) — bleeds past the scroll's horizontal
  // padding so it reads wider than the cards below it, per design ask.
  mapCard: {
    backgroundColor: L.bg,
    borderRadius: radius.card,
    borderWidth: 1, borderColor: L.border,
    overflow: 'hidden',
    marginHorizontal: -spacing.screenH,
  },
  mapCardInner: { height: 160 },
  mapMockWrap:  { padding: spacing.md },

  // 3 — Fill status
  fillCard: {
    backgroundColor: L.goldLight,
    borderRadius: radius.card,
    borderWidth: 1, borderColor: L.goldBorder,
    padding: spacing.md,
    gap: 10,
  },
  fillLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fillIconWrap: {
    width: iconCircle.small, height: iconCircle.small,
    borderRadius: iconCircle.small / 2,
    backgroundColor: L.goldBg,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  fillTitle:  { fontSize: 14, fontWeight: '800', color: L.navy },
  fillSub:    { fontSize: 12, color: L.textSub, marginTop: 2 },
  fillSpots:  { fontWeight: '700', color: L.success },
  fillDots:   { flexDirection: 'row', gap: 6, paddingLeft: iconCircle.small + 10 },
  fillDot:    { width: 28, height: 6, borderRadius: 3 },
  fillDotFilled: { backgroundColor: L.gold },
  fillDotEmpty:  { backgroundColor: L.border },

  // 4 — Acquisition actions
  acqCard: {
    backgroundColor: L.bg,
    borderRadius: radius.card,
    borderWidth: 1, borderColor: L.border,
    padding: spacing.md,
    gap: 10,
  },
  acqPrimary:   { /* uses PrimaryButton default */ },
  acqSecondary: { /* uses SecondaryButton default */ },
  nearbyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: L.border,
    marginTop: 2,
  },
  nearbyIconWrap: {
    width: iconCircle.small, height: iconCircle.small,
    borderRadius: iconCircle.small / 2,
    backgroundColor: L.goldBg,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  nearbyBody:  { flex: 1 },
  nearbyLabel: { fontSize: 14, fontWeight: '700', color: L.navy },
  nearbyLabelDisabled: { color: L.textSub },
  nearbySub:   { fontSize: 11, color: L.textSub, marginTop: 1 },
  nearbyBtnDisabled: { opacity: 0.6 },
  pastNotice: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingBottom: 4,
  },
  pastNoticeText: { fontSize: 12, color: L.textSub, flex: 1 },

  // 5 — Players
  card: {
    backgroundColor: L.bg,
    borderRadius: radius.card,
    borderWidth: 1, borderColor: L.border,
    padding: spacing.md,
    overflow: 'hidden',
  },
  rosterHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12,
  },
  rosterLeft:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rosterTitle:   { fontSize: 14, fontWeight: '800', color: L.navy },
  viewAllBtn:    { flexDirection: 'row', alignItems: 'center', gap: 2 },
  viewAllText:   { fontSize: 12, fontWeight: '700', color: L.gold },

  playerRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  playerRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border },

  avatarWrap: { position: 'relative', flexShrink: 0 },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 1.5, borderColor: L.gold,
  },
  avatarFallback: {
    backgroundColor: L.bg, alignItems: 'center', justifyContent: 'center',
  },
  crownBadge: {
    position: 'absolute', bottom: -2, right: -2,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: L.gold,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: L.white,
  },
  playerBody:  { flex: 1 },
  playerName:  { fontSize: 14, fontWeight: '700', color: L.navy },
  playerSub:   { fontSize: 13, fontWeight: '400', color: L.textSub },
  playerLevel: { fontSize: 12, color: L.textSub, marginTop: 1 },

  openSpotsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 10,
  },
  openAvatarGroup: { flexDirection: 'row' },
  openAvatarCircle: {
    width: 34, height: 34, borderRadius: 17,
    borderWidth: 1.5, borderColor: L.border, borderStyle: 'dashed',
    backgroundColor: L.page,
    alignItems: 'center', justifyContent: 'center',
  },
  openSpotsText: { fontSize: 13, fontWeight: '600', color: L.textSub },

  // 6 — Chat
  chatHeader:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  chatIconWrap: {
    width: iconCircle.small, height: iconCircle.small,
    borderRadius: iconCircle.small / 2,
    backgroundColor: L.goldBg,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  chatHeaderText: { flex: 1 },
  chatTitle:      { fontSize: 14, fontWeight: '800', color: L.navy },
  chatSub:        { fontSize: 12, color: L.textSub, marginTop: 1 },
  chatEmpty: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: L.page, borderRadius: radius.sm,
    padding: 12, marginBottom: 10,
  },
  chatEmptyText: { fontSize: 12, color: L.textSub, flex: 1, lineHeight: 17 },
  chatCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    borderWidth: 1.5, borderColor: L.goldBorder,
    borderRadius: radius.sm, paddingVertical: 10,
  },
  chatCtaText: { fontSize: 13, fontWeight: '700', color: L.navy },

  // 8 — Cancel
  joinCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: L.bg,
    borderRadius: radius.card,
    borderWidth: 1.5, borderColor: L.gold,
    padding: spacing.md,
  },
  joinIconWrap: {
    width: iconCircle.small, height: iconCircle.small,
    borderRadius: iconCircle.small / 2,
    backgroundColor: colors.goldBg,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  joinTitle: { fontSize: 14, fontWeight: '700', color: L.gold },
  joinSub:   { fontSize: 12, color: L.gold, opacity: 0.7, marginTop: 1 },

  leaveCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: L.dangerBg,
    borderRadius: radius.card,
    borderWidth: 1.5, borderColor: L.danger,
    padding: spacing.md,
  },
  leaveIconWrap: {
    width: iconCircle.small, height: iconCircle.small,
    borderRadius: iconCircle.small / 2,
    backgroundColor: colors.bg,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  leaveTitle: { fontSize: 14, fontWeight: '700', color: L.danger },
  leaveSub:   { fontSize: 12, color: L.danger, opacity: 0.7, marginTop: 1 },

  completeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: L.bg,
    borderRadius: radius.card,
    borderWidth: 1.5, borderColor: colors.success,
    padding: spacing.md,
  },
  completeIconWrap: {
    width: iconCircle.small, height: iconCircle.small,
    borderRadius: iconCircle.small / 2,
    backgroundColor: colors.successBg,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  completeTitle: { fontSize: 14, fontWeight: '700', color: colors.success },
  completeSub:   { fontSize: 12, color: colors.success, opacity: 0.7, marginTop: 1 },

  cancelCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: L.bg,
    borderRadius: radius.card,
    borderWidth: 1.5, borderColor: colors.danger,
    padding: spacing.md,
  },
  cancelIconWrap: {
    width: iconCircle.small, height: iconCircle.small,
    borderRadius: iconCircle.small / 2,
    backgroundColor: colors.dangerBg,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  cancelBody:  { flex: 1 },
  cancelTitle: { fontSize: 14, fontWeight: '700', color: colors.danger },
  cancelSub:   { fontSize: 12, color: colors.danger, opacity: 0.7, marginTop: 1 },

  // CTA section headers
  mgmtSectionLabel: {
    fontSize: 11, fontWeight: '800', color: L.textSub, letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 20, marginBottom: 8,
  },
  dangerSectionLabel: {
    fontSize: 11, fontWeight: '800', color: colors.danger, letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 20, marginBottom: 8,
  },

  // Edit modal
  modalRoot:   { flex: 1, backgroundColor: L.page },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: L.border },
  modalTitle:  { fontSize: 16, fontWeight: '700', color: L.navy },
  modalCancel: { fontSize: 15, color: L.textSub },
  modalSave:   { fontSize: 15, fontWeight: '700', color: L.gold },
  modalScroll: { flex: 1, paddingHorizontal: 20, paddingTop: 20 },
  fieldLabel:  { fontSize: 12, fontWeight: '700', color: L.textSub, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6, marginTop: 16 },
  fieldInput:  { backgroundColor: L.bg, borderWidth: 1, borderColor: L.border, borderRadius: radius.card, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: L.navy },
  fieldTextarea: { minHeight: 80, textAlignVertical: 'top' },
});
