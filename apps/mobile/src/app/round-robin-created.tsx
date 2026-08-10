import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, Alert, Share, Dimensions, Animated, Easing, ActivityIndicator,
  Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing, radius, iconCircle } from '@/theme';
import { StatusChip } from '@/components/StatusChip';
import { PrimaryButton } from '@/components/PrimaryButton';
import { PickleballIcon, JoinCelebration } from '@/components';
import { SecondaryButton } from '@/components/SecondaryButton';
import { useSession } from '@/hooks/useSession';
import { getRoundRobin, updateStatus, updateCurrentPlayers, type RoundRobin } from '@/lib/roundRobinStore';
import {
  hasSchedule, getSchedule, setSchedule,
  buildRRSchedule, type RRRound,
} from '@/lib/rrScheduleStore';
import { computeStandings, fmtDiff, type RRStanding } from '@/lib/rrStandings';
import { getRoster, getRosterCount, type RRPlayer } from '@/lib/rrRosterStore';
import {
  fetchPlayEventWithOrganizer, fetchPlayParticipants, fetchPublicPlayParticipantCount, cancelPlayEvent, completePlayEvent, skillLabel,
  removePlayParticipant, addPlayParticipant, joinEventErrorMessage, updatePlayEvent,
  type PlayEvent, type OrganizerProfile, type PlayParticipant,
} from '@/lib/supabase/playEvents';
import {
  generateRoundRobinSchedule, fetchRoundRobinMatches, deleteRoundRobinSchedule,
  sbMatchesToRRRounds, ScheduleExistsError,
} from '@/lib/supabase/roundRobin';
import { fetchFacilityById, type FacilityDetail } from '@/lib/supabase/facilities';
import { createCommunityShareMessage } from '@/lib/communityShare';
import { FacilityCard } from '@/components/FacilityCard';

// ─── Constants ──────────────────────────────────────────────────────────────────

const { width: SW } = Dimensions.get('window');

const FALLBACK_PHOTO =
  'https://images.unsplash.com/photo-1544717305-2782549b5136?w=800&h=450&fit=crop&q=80';

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

// ─── Context menu items ──────────────────────────────────────────────────────────

const MENU_ITEMS = [
  { id: 'share',     label: 'Share Event',      icon: 'share-outline' },
  { id: 'invite',    label: 'Invite Players',   icon: 'person-add-outline' },
  { id: 'duplicate', label: 'Duplicate Event',  icon: 'copy-outline' },
  { id: 'edit',      label: 'Edit Event',       icon: 'pencil-outline' },
];
const MENU_DANGER = { id: 'cancel', label: 'Cancel Round Robin', icon: 'trash-outline' };

// ─── Screen ─────────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Maps a Supabase PlayEvent → the RoundRobin shape used by this screen.
// Fields not stored in play_events (matchFormat, minPlayers, etc.) use sensible defaults.
function playEventToRR(e: PlayEvent): RoundRobin {
  const rrStatus: RoundRobin['status'] =
    e.status === 'cancelled' ? 'cancelled' :
    e.status === 'completed' ? 'completed' : 'open';

  return {
    id:              e.id,
    type:            'round_robin',
    title:           e.name,
    imageUri:        e.cover_url ?? FALLBACK_PHOTO,
    date:            e.event_date,
    startTime:       e.start_time ? `${e.event_date}T${e.start_time}` : e.event_date,
    duration:        '2 Hours',
    locationName:    e.location,
    locationAddress: e.venue_name ?? '',
    skillRange:      skillLabel(e.skill_min, e.skill_max),
    minPlayers:      4,
    maxPlayers:      e.max_players,
    currentPlayers:  0,
    matchFormat:     '1 Game to 11 (Win by 2)',
    matchesPerPlayer:'6 – 8 Matches',
    scoreRecording:  'Yes, track scores',
    visibility:      'public',
    notes:           e.notes ?? '',
    organizerId:     e.organizer_id,
    organizerName:   'You',
    status:          rrStatus,
    createdAt:       new Date().toISOString(),
  };
}

function comingSoon(feature: string) {
  Alert.alert(`${feature}`, 'Coming soon — this feature is on the way.', [{ text: 'Got It' }]);
}

export default function RoundRobinCreatedScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isSupabase = !!id && UUID_RE.test(id);

  // Supabase path: fetch event + organizer profile by UUID
  const [sbEvent,    setSbEvent]    = useState<PlayEvent | null>(null);
  const [organizer,  setOrganizer]  = useState<OrganizerProfile | null>(null);
  const [loadingEvt, setLoadingEvt] = useState(isSupabase);
  const [notFound,   setNotFound]   = useState(false);
  const [facility,   setFacility]   = useState<FacilityDetail | null>(null);

  // Edit modal state
  const [editOpen,   setEditOpen]   = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editName,   setEditName]   = useState('');
  const [editDate,   setEditDate]   = useState('');
  const [editTime,   setEditTime]   = useState('');
  const [editMax,    setEditMax]    = useState('');
  const [editVenue,  setEditVenue]  = useState('');
  const [editNotes,  setEditNotes]  = useState('');

  useEffect(() => {
    if (!isSupabase) return;
    setLoadingEvt(true);
    fetchPlayEventWithOrganizer(id!)
      .then(data => {
        if (!data) { setNotFound(true); return; }
        setSbEvent(data);
        setOrganizer(data.organizer ?? null);
        if (data.facility_id) {
          fetchFacilityById(data.facility_id).then(f => setFacility(f)).catch(() => {});
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoadingEvt(false));
  }, [id, isSupabase]);

  // Resolve display object: Supabase → adapter, else local store → fallback demo
  // Must be defined before any hooks that use g.id.
  const localRR = getRoundRobin();
  const g: RoundRobin = isSupabase && sbEvent
    ? playEventToRR(sbEvent)
    : localRR ?? {
        id: 'rr-demo',
        type: 'round_robin',
        title: 'Wednesday Round Robin',
        imageUri: FALLBACK_PHOTO,
        date: new Date().toISOString(),
        startTime: new Date().toISOString(),
        duration: '2 Hours',
        locationName: 'Lakewood Ranch Courts',
        locationAddress: '',
        skillRange: '3.5 – 4.0',
        minPlayers: 4,
        maxPlayers: 12,
        currentPlayers: 1,
        matchFormat: '1 Game to 11 (Win by 2)',
        matchesPerPlayer: '6 – 8 Matches',
        scoreRecording: 'Yes, track scores',
        visibility: 'public',
        notes: '',
        organizerId: 'me',
        organizerName: 'You',
        status: 'open',
        createdAt: new Date().toISOString(),
      };

  // ── Roster state ──
  // Supabase events: participant count fetched from DB (organizer already included).
  // Local events: from rrRosterStore + 1 for organizer.
  const [rosterCount, setRosterCount] = useState(() =>
    isSupabase ? 1 : getRosterCount(g.id) + 1,
  );
  const [showCelebration, setShowCelebration] = useState(false);
  const [participants, setParticipants] = useState<PlayParticipant[]>([]);
  const spotsLeft = Math.max(g.maxPlayers - rosterCount, 0);
  const isCompleted = g.status === 'completed';
  const isCancelled = g.status === 'cancelled';
  const isPastEvent = isCompleted || isCancelled;

  const myParticipant = isSupabase && user?.id
    ? participants.find(p => p.claimed_by === user.id) ?? null
    : null;
  const isOrganizer = isSupabase && !!user?.id && sbEvent?.organizer_id === user.id;
  const canLeave = !!myParticipant && !isOrganizer &&
    (sbEvent?.status === 'open' || sbEvent?.status === 'full');
  const canJoin = isSupabase && !!user?.id && !myParticipant && !isOrganizer &&
    sbEvent?.status === 'open' && rosterCount < (sbEvent?.max_players ?? 0);

  // ── Schedule state ──
  // Supabase path: sbRounds loaded from play_matches via fetchRoundRobinMatches.
  // Local path:    rounds from rrScheduleStore.
  const [sbRounds,       setSbRounds]       = useState<RRRound[]>([]);
  const [generatingSched, setGeneratingSched] = useState(false);
  const [scheduleExists, setScheduleExists] = useState(() =>
    isSupabase ? false : hasSchedule(g.id),
  );
  const [standings, setStandings] = useState<RRStanding[]>(() =>
    isSupabase ? [] : computeStandings(getSchedule(g.id) ?? []),
  );

  const scheduleRounds: RRRound[] = isSupabase
    ? sbRounds
    : (scheduleExists ? (getSchedule(g.id) ?? []) : []);
  const totalMatches   = scheduleRounds.reduce((acc, r) => acc + r.matches.length, 0);
  const hasLiveStandings = standings.some(s => s.matchesPlayed > 0);
  const topStandings   = standings.slice(0, 5);

  // Load Supabase schedule on mount (once sbEvent is available)
  useEffect(() => {
    if (!isSupabase) return;
    fetchRoundRobinMatches(id!)
      .then(rows => {
        const rounds = sbMatchesToRRRounds(rows);
        setSbRounds(rounds);
        setScheduleExists(rounds.length > 0);
        setStandings(computeStandings(rounds));
      })
      .catch(() => { /* keep empty state */ });
  }, [id, isSupabase]);

  useFocusEffect(useCallback(() => {
    if (isSupabase) {
      // Use id! (URL param) directly — always the real UUID even while sbEvent is
      // still loading. Using g.id would give 'rr-demo' initially → 0 rows.
      Promise.all([
        fetchPlayParticipants(id!),
        fetchPublicPlayParticipantCount(id!),
      ])
        .then(([rows, count]) => { setRosterCount(count); setParticipants(rows); })
        .catch(() => { /* keep last count */ });
      // Re-fetch schedule on focus (score entry may have updated it)
      fetchRoundRobinMatches(id!)
        .then(rows => {
          const rounds = sbMatchesToRRRounds(rows);
          setSbRounds(rounds);
          setScheduleExists(rounds.length > 0);
          setStandings(computeStandings(rounds));
        })
        .catch(() => {});
    } else {
      const count = getRosterCount(g.id);
      setRosterCount(count + 1); // +1 for organizer not in local store
      updateCurrentPlayers(count + 1);
      const rounds = getSchedule(g.id) ?? [];
      setScheduleExists(hasSchedule(g.id));
      setStandings(computeStandings(rounds));
    }
  }, [id, g.id, isSupabase]));

  // ── Context menu state ──
  const [menuOpen, setMenuOpen] = useState(false);
  const menuAnim = useRef(new Animated.Value(0)).current;

  const menuOpacity  = menuAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const menuScale    = menuAnim.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] });
  const backdropOpacity = menuAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.18] });

  function openMenu() {
    setMenuOpen(true);
    Animated.timing(menuAnim, {
      toValue: 1, duration: 160,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }

  function closeMenu(cb?: () => void) {
    Animated.timing(menuAnim, {
      toValue: 0, duration: 120,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setMenuOpen(false);
      cb?.();
    });
  }

  function handleMenuAction(id: string) {
    if (id === 'share') {
      closeMenu(handleShare);
    } else if (id === 'cancel') {
      closeMenu(handleCancelRR);
    } else if (id === 'invite') {
      closeMenu(handleInvite);
    } else if (id === 'duplicate') {
      closeMenu(() => comingSoon('Duplicate Event'));
    } else if (id === 'edit') {
      closeMenu(isOrganizer && sbEvent?.status === 'open' ? handleOpenEdit : () => comingSoon('Edit Event'));
    } else {
      closeMenu();
    }
  }

  // ── Actions ──

  function handleOpenEdit() {
    if (!sbEvent) return;
    setEditName(sbEvent.name ?? '');
    setEditDate(sbEvent.event_date ?? '');
    setEditTime(sbEvent.start_time ? sbEvent.start_time.slice(0, 5) : '');
    setEditMax(String(sbEvent.max_players ?? ''));
    setEditVenue(sbEvent.venue_name ?? sbEvent.location ?? '');
    setEditNotes(sbEvent.notes ?? '');
    setEditOpen(true);
  }

  async function handleSaveEdit() {
    if (!id || !sbEvent) return;
    const newMax = parseInt(editMax, 10);
    if (isNaN(newMax) || newMax < 2) {
      Alert.alert('Invalid', 'Max players must be at least 2.'); return;
    }
    if (newMax < rosterCount) {
      Alert.alert('Invalid', `Max players cannot be less than current roster (${rosterCount}).`); return;
    }
    const trimName = editName.trim();
    if (!trimName) {
      Alert.alert('Invalid', 'Event name cannot be empty.'); return;
    }
    setEditSaving(true);
    try {
      const updated = await updatePlayEvent(id, {
        name:       trimName,
        event_date: editDate || undefined,
        start_time: editTime ? `${editTime}:00` : null,
        max_players: newMax,
        venue_name: editVenue.trim() || null,
        notes:      editNotes.trim() || null,
      });
      setSbEvent(updated);
      setEditOpen(false);
      Alert.alert('Saved', 'Event details updated.');
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? '';
      if (msg === 'not_authenticated') Alert.alert('Error', 'You must be signed in to edit this event.');
      else if (msg === 'not_organizer') Alert.alert('Error', 'Only the organizer can edit this event.');
      else if (msg === 'event_not_open') Alert.alert('Error', 'Only open events can be edited.');
      else if (msg === 'below_participant_count') Alert.alert('Invalid', `Max players cannot be less than current roster (${rosterCount}).`);
      else Alert.alert('Error', 'Could not save changes. Please try again.');
    } finally {
      setEditSaving(false);
    }
  }

  async function handleInvite() {
    if (isSupabase) {
      router.push({
        pathname: '/community/[id]/invite-players' as never,
        params: { id: g.id },
      } as never);
      return;
    }
    comingSoon('Invite Players');
  }

  async function handleShare() {
    try {
      const message = isSupabase && sbEvent
        ? createCommunityShareMessage(sbEvent)
        : `Join my round robin "${g.title}" on DreamBreaker!\n${fmtDate(g.date)} at ${fmtTime(g.startTime)} — ${g.locationName}`;
      await Share.share({ message, title: g.title });
    } catch { /* dismissed */ }
  }

  async function handleGenerateMatches() {
    if (isSupabase) {
      // ── Supabase path ──
      setGeneratingSched(true);
      try {
        await generateRoundRobinSchedule(id!);
        // Fetch and apply the freshly generated schedule
        const rows   = await fetchRoundRobinMatches(id!);
        const rounds = sbMatchesToRRRounds(rows);
        setSbRounds(rounds);
        setScheduleExists(true);
        setStandings(computeStandings(rounds));
        router.push(`/round-robin/${id!}/schedule` as never);
      } catch (err) {
        if (err instanceof ScheduleExistsError) {
          // Prompt user to confirm regeneration
          Alert.alert(
            'Schedule Already Exists',
            'A schedule has already been generated. Do you want to delete it and regenerate?',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Regenerate',
                style: 'destructive',
                onPress: async () => {
                  setGeneratingSched(true);
                  try {
                    await deleteRoundRobinSchedule(id!);
                    await generateRoundRobinSchedule(id!);
                    const rows   = await fetchRoundRobinMatches(id!);
                    const rounds = sbMatchesToRRRounds(rows);
                    setSbRounds(rounds);
                    setScheduleExists(true);
                    setStandings(computeStandings(rounds));
                    router.push(`/round-robin/${id!}/schedule` as never);
                  } catch (e2) {
                    const msg = e2 instanceof Error ? e2.message : 'Please try again.';
                    Alert.alert('Could not regenerate', msg);
                  } finally {
                    setGeneratingSched(false);
                  }
                },
              },
            ],
          );
        } else {
          const msg = err instanceof Error ? err.message : 'Please try again.';
          Alert.alert('Could not generate schedule', msg);
        }
      } finally {
        setGeneratingSched(false);
      }
      return;
    }

    // ── Local path ──
    const rosterPlayers: RRPlayer[] = getRoster(g.id);
    if (rosterPlayers.length < 4) {
      Alert.alert(
        'Not Enough Players',
        `At least 4 players are required to generate a schedule. Add ${4 - rosterPlayers.length} more player${4 - rosterPlayers.length !== 1 ? 's' : ''} to the roster first.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Manage Roster', onPress: () => router.push(`/round-robin/${g.id}/roster` as never) },
        ],
      );
      return;
    }
    const participants = rosterPlayers.map(p => ({
      id:             p.id,
      name:           p.name,
      dupr:           p.dupr,
      avatarInitials: p.avatarInitials,
    }));
    const rounds = buildRRSchedule(participants);
    setSchedule(g.id, rounds);
    setScheduleExists(true);
    router.push(`/round-robin/${g.id}/schedule` as never);
  }

  async function handleJoin() {
    if (!user || !id) return;
    const firstName = (user.user_metadata?.full_name as string | undefined)?.split(' ')[0]
      ?? (user.user_metadata?.name as string | undefined)?.split(' ')[0]
      ?? user.email?.split('@')[0]
      ?? 'Player';
    try {
      await addPlayParticipant({
        event_id:           id,
        first_name:         firstName,
        email:              user.email ?? '',
        claimed_by:         user.id,
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
      'Leave Round Robin?',
      'You will be removed from the roster. The organizer will not be notified.',
      [
        { text: 'Stay', style: 'cancel' },
        {
          text: 'Leave',
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
              Alert.alert('Error', 'Could not leave the event. Please try again.');
            }
          },
        },
      ],
    );
  }

  function handleMarkComplete() {
    Alert.alert(
      'Mark Round Robin as Complete?',
      'This will close the event and move it to your completed events.',
      [
        { text: 'Not Yet', style: 'cancel' },
        {
          text: 'Mark Complete',
          onPress: async () => {
            try {
              await completePlayEvent(id!);
              setSbEvent(prev => prev ? { ...prev, status: 'completed' } : prev);
            } catch {
              Alert.alert('Error', 'Could not complete the event. Please try again.');
            }
          },
        },
      ],
    );
  }

  function handleCancelRR() {
    Alert.alert(
      'Cancel Round Robin?',
      'This action cannot be undone. All registered players will be notified.',
      [
        { text: 'Keep Event', style: 'cancel' },
        {
          text: 'Cancel Round Robin',
          style: 'destructive',
          onPress: async () => {
            if (isSupabase) {
              try { await cancelPlayEvent(g.id); } catch { /* non-fatal */ }
            } else {
              updateStatus('cancelled');
            }
            router.replace('/(tabs)/games' as never);
          },
        },
      ],
    );
  }

  if (loadingEvt) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.page }}>
        <ActivityIndicator size="large" color={colors.gold} />
        <Text style={{ marginTop: 12, fontSize: 14, color: colors.textSub }}>Loading your event…</Text>
      </View>
    );
  }

  if (isSupabase && notFound) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.page, padding: 32 }}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.danger} />
        <Text style={{ fontSize: 18, fontWeight: '800', color: colors.navy, marginTop: 16, textAlign: 'center' }}>
          Event not found
        </Text>
        <TouchableOpacity onPress={() => router.replace('/(tabs)/games' as never)} style={{ marginTop: 24 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.gold }}>Go to My Games</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <StatusBar style="light" />

      {/* ── FULL-BLEED HERO ── */}
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

        {/* Floating nav buttons */}
        <View style={[s.navRow, { paddingTop: insets.top + 6 }]}>
          <TouchableOpacity
            style={s.navBtn}
            onPress={() => router.replace('/(tabs)/games' as never)}
            activeOpacity={0.8}
          >
            <Ionicons name="chevron-back" size={22} color={L.white} />
          </TouchableOpacity>
          <View style={s.navRight}>
            <TouchableOpacity style={s.navBtn} onPress={handleShare} activeOpacity={0.8}>
              <Ionicons name="share-outline" size={20} color={L.white} />
            </TouchableOpacity>
            <TouchableOpacity style={s.navBtn} onPress={openMenu} activeOpacity={0.8}>
              <Ionicons name="ellipsis-horizontal" size={20} color={L.white} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Status badge */}
        <View style={s.heroBadgeRow}>
          <View style={s.openBadge}>
            <PickleballIcon size={13} color="#fff" />
            <Text style={s.openBadgeText}>{g.status?.toUpperCase() ?? 'OPEN'}</Text>
          </View>
        </View>

        {/* Title + meta overlay */}
        <View style={s.heroContent}>
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

      {/* ── SCROLL ── */}
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* Facility card */}
        {facility && <FacilityCard facility={facility} />}

        {/* 3 ── FILL STATUS ── */}
        <View style={s.fillCard}>
          <View style={s.fillLeft}>
            <View style={s.fillIconWrap}>
              <Ionicons name="people-outline" size={20} color={L.gold} />
            </View>
            <View>
              <Text style={s.fillTitle}>
                {rosterCount < g.minPlayers
                  ? `Need ${g.minPlayers - rosterCount} More to Start`
                  : spotsLeft === 0
                    ? 'Roster Full'
                    : `Looking for ${spotsLeft} More Player${spotsLeft !== 1 ? 's' : ''}`}
              </Text>
              <Text style={s.fillSub}>
                {rosterCount} of {g.maxPlayers} registered
                {'  '}
                <Text style={s.fillSpots}>{spotsLeft} spots left</Text>
              </Text>
            </View>
          </View>
          <View style={s.fillDots}>
            {Array.from({ length: Math.min(g.maxPlayers, 12) }).map((_, i) => (
              <View
                key={i}
                style={[
                  s.fillDot,
                  i < rosterCount      ? s.fillDotFilled :
                  i < g.minPlayers     ? s.fillDotMin    : s.fillDotEmpty,
                ]}
              />
            ))}
          </View>
          {g.maxPlayers > 12 && (
            <Text style={s.fillMore}>+{g.maxPlayers - 12} more spots</Text>
          )}
        </View>

        {/* 4 ── PLAYER ACQUISITION ── */}
        <View style={s.acqCard}>
          {isPastEvent && (
            <View style={s.pastNotice}>
              <Ionicons name="time-outline" size={13} color={L.textSub} />
              <Text style={s.pastNoticeText}>
                {isCancelled ? 'This round robin was cancelled — invites are closed.' : 'This round robin has ended — invites are closed.'}
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
            onPress={isPastEvent ? undefined : () => router.push('/(tabs)/finder' as never)}
            activeOpacity={isPastEvent ? 1 : 0.8}
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

        {/* 5 ── PLAYERS ROSTER ── */}
        <View style={s.card}>
          <View style={s.rosterHeader}>
            <View style={s.rosterLeft}>
              <Ionicons name="people-outline" size={15} color={L.navy} />
              <Text style={s.rosterTitle}>Players ({rosterCount}/{g.maxPlayers})</Text>
            </View>
            <TouchableOpacity style={s.viewAllBtn} onPress={() => router.push(`/round-robin/${g.id}/roster` as never)} activeOpacity={0.7}>
              <Text style={s.viewAllText}>View Full Roster</Text>
              <Ionicons name="chevron-forward" size={13} color={L.gold} />
            </TouchableOpacity>
          </View>

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
                {organizer?.full_name ?? g.organizerName ?? 'You'}{' '}
                <Text style={s.playerSub}>(Organizer)</Text>
              </Text>
              {organizer?.handle ? (
                <Text style={s.playerLevel}>@{organizer.handle}</Text>
              ) : (
                <Text style={s.playerLevel}>{g.skillRange} Level</Text>
              )}
            </View>
            <StatusChip label="Host" variant="green" />
          </View>

          <TouchableOpacity style={s.openSpotsRow} onPress={() => router.push(`/round-robin/${g.id}/roster` as never)} activeOpacity={0.75}>
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
        </View>

        {/* 6 ── GENERATE MATCHES ── */}
        <View style={s.generateCard}>
          <View style={s.generateHeader}>
            <View style={s.generateIconWrap}>
              <Ionicons name="shuffle-outline" size={20} color={L.gold} />
            </View>
            <View style={s.generateHeaderText}>
              <Text style={s.generateTitle}>Generate Match Schedule</Text>
              <Text style={s.generateSub}>Create matchups and court assignments for all players.</Text>
            </View>
          </View>
          <View style={s.generateMeta}>
            <View style={s.generateMetaItem}>
              <Ionicons name="people-outline" size={13} color={L.textSub} />
              <Text style={s.generateMetaText}>Min {g.minPlayers} players to generate</Text>
            </View>
            <View style={s.generateMetaItem}>
              <Ionicons name="repeat-outline" size={13} color={L.textSub} />
              <Text style={s.generateMetaText}>{g.matchesPerPlayer} per player</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[s.generateBtn, generatingSched && { opacity: 0.7 }]}
            onPress={handleGenerateMatches}
            activeOpacity={0.85}
            disabled={generatingSched}
          >
            {generatingSched
              ? <ActivityIndicator size="small" color={L.white} />
              : <>
                  <Ionicons name="shuffle-outline" size={17} color={L.white} />
                  <Text style={s.generateBtnText}>Generate Matches</Text>
                </>
            }
          </TouchableOpacity>
        </View>

        {/* 7 ── SCHEDULE ── */}
        <View style={s.card}>
          <View style={s.sectionHeader}>
            <View style={s.sectionIconWrap}>
              <Ionicons name="calendar-outline" size={17} color={L.gold} />
            </View>
            <View style={s.sectionHeaderText}>
              <Text style={s.sectionTitle}>Schedule</Text>
            </View>
            {scheduleExists && (
              <TouchableOpacity
                style={s.viewAllBtn}
                onPress={() => router.push(`/round-robin/${g.id}/schedule` as never)}
                activeOpacity={0.7}
              >
                <Text style={s.viewAllText}>View All</Text>
                <Ionicons name="chevron-forward" size={13} color={L.gold} />
              </TouchableOpacity>
            )}
          </View>
          {scheduleExists ? (
            <View style={s.scheduleGenerated}>
              <View style={s.scheduleGenRow}>
                <Ionicons name="checkmark-circle" size={18} color={L.success} />
                <Text style={s.scheduleGenTitle}>Schedule Generated</Text>
              </View>
              <View style={s.scheduleGenMeta}>
                <View style={s.scheduleGenMetaItem}>
                  <Text style={s.scheduleGenMetaValue}>{scheduleRounds.length}</Text>
                  <Text style={s.scheduleGenMetaLabel}>Rounds</Text>
                </View>
                <View style={s.scheduleGenDivider} />
                <View style={s.scheduleGenMetaItem}>
                  <Text style={s.scheduleGenMetaValue}>{totalMatches}</Text>
                  <Text style={s.scheduleGenMetaLabel}>Matches</Text>
                </View>
              </View>
              <TouchableOpacity
                style={s.viewScheduleBtn}
                onPress={() => router.push(`/round-robin/${g.id}/schedule` as never)}
                activeOpacity={0.85}
              >
                <Ionicons name="calendar-outline" size={15} color={L.navy} />
                <Text style={s.viewScheduleBtnText}>View Schedule</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.emptyState}>
              <Ionicons name="calendar-outline" size={28} color={L.border} />
              <Text style={s.emptyText}>No schedule generated yet.</Text>
              <Text style={s.emptySub}>Generate matches to create matchups.</Text>
            </View>
          )}
        </View>

        {/* 8 ── STANDINGS ── */}
        <View style={s.card}>
          <View style={s.sectionHeader}>
            <View style={s.sectionIconWrap}>
              <Ionicons name="podium-outline" size={17} color={L.gold} />
            </View>
            <View style={s.sectionHeaderText}>
              <Text style={s.sectionTitle}>Standings</Text>
            </View>
            {hasLiveStandings && (
              <TouchableOpacity
                style={s.viewAllBtn}
                onPress={() => router.push(`/round-robin/${g.id}/standings` as never)}
                activeOpacity={0.7}
              >
                <Text style={s.viewAllText}>View All</Text>
                <Ionicons name="chevron-forward" size={13} color={L.gold} />
              </TouchableOpacity>
            )}
          </View>

          {hasLiveStandings ? (
            <View style={s.standingsPreview}>
              {topStandings.filter(st => st.matchesPlayed > 0).map(st => (
                <View key={st.playerId} style={[s.standingsRow, st.rank === 1 && s.standingsRowLeader]}>
                  <View style={s.standingsRankWrap}>
                    <Text style={[s.standingsRank, st.rank === 1 && s.standingsRankLeader]}>
                      #{st.rank}
                    </Text>
                  </View>
                  <View style={s.standingsAvatar}>
                    <Text style={s.standingsAvatarText}>{st.avatarInitials}</Text>
                  </View>
                  <Text style={s.standingsName} numberOfLines={1}>{st.playerName}</Text>
                  <Text style={[s.standingsRecord, st.rank === 1 && s.standingsRecordLeader]}>
                    {st.wins}-{st.losses}
                  </Text>
                  <Text style={[s.standingsDiff, st.pointDifferential >= 0 ? s.standingsDiffPos : s.standingsDiffNeg]}>
                    {fmtDiff(st.pointDifferential)}
                  </Text>
                </View>
              ))}
              <TouchableOpacity
                style={s.viewStandingsBtn}
                onPress={() => router.push(`/round-robin/${g.id}/standings` as never)}
                activeOpacity={0.85}
              >
                <Ionicons name="podium-outline" size={15} color={L.navy} />
                <Text style={s.viewStandingsBtnText}>View Full Standings</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.emptyState}>
              <Ionicons name="podium-outline" size={28} color={L.border} />
              <Text style={s.emptyText}>Standings will appear after scores are entered.</Text>
            </View>
          )}
        </View>

        {/* 9 ── ROUND ROBIN CHAT ── */}
        <View style={s.card}>
          <View style={s.chatHeader}>
            <View style={s.chatIconWrap}>
              <Ionicons name="chatbubble-outline" size={17} color={L.gold} />
            </View>
            <View style={s.chatHeaderText}>
              <Text style={s.chatTitle}>Round Robin Chat</Text>
              <Text style={s.chatSub}>Message all players in this event</Text>
            </View>
          </View>
          <View style={s.chatEmpty}>
            <Ionicons name="chatbubbles-outline" size={28} color={L.border} />
            <Text style={s.chatEmptyText}>Chat becomes active when another player joins.</Text>
          </View>
          <TouchableOpacity style={s.chatCta} onPress={() => comingSoon('Round Robin Chat')} activeOpacity={0.8}>
            <Text style={s.chatCtaText}>Open Chat</Text>
            <Ionicons name="chevron-forward" size={15} color={L.gold} />
          </TouchableOpacity>
        </View>

        {/* 10 ── MANAGEMENT ── */}
        <View style={[s.card, { padding: 0 }]}>
          <ActionRow
            icon="person-add-outline"
            label="Invite Players"
            sub="Invite friends or find nearby players"
            onPress={handleInvite}
            disabled={isPastEvent}
            disabledSub="This round robin has ended"
          />
          <ActionRow
            icon="people-outline"
            label="View Players"
            sub="See who's registered and spots remaining"
            onPress={() => router.push(`/round-robin/${g.id}/roster` as never)}
          />
          <ActionRow
            icon="settings-outline"
            label="Round Robin Settings"
            sub="Edit event details, format, or skill level"
            onPress={isOrganizer && sbEvent?.status === 'open' ? handleOpenEdit : () => comingSoon('Round Robin Settings')}
            last
          />
        </View>

        {/* JOIN EVENT — logged-in, not participant, not organizer, open + space */}
        {canJoin && (
          <TouchableOpacity style={s.joinCard} onPress={handleJoin} activeOpacity={0.8}>
            <View style={s.joinIconWrap}>
              <Ionicons name="enter-outline" size={18} color={L.gold} />
            </View>
            <View style={s.cancelBody}>
              <Text style={s.joinTitle}>Join Round Robin</Text>
              <Text style={s.joinSub}>Add yourself to the roster.</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={L.gold} />
          </TouchableOpacity>
        )}

        {/* LEAVE EVENT — participant + not organizer + active only */}
        {canLeave && (
          <TouchableOpacity style={s.leaveCard} onPress={handleLeave} activeOpacity={0.8}>
            <View style={s.leaveIconWrap}>
              <Ionicons name="exit-outline" size={18} color={L.danger} />
            </View>
            <View style={s.cancelBody}>
              <Text style={s.leaveTitle}>Leave Round Robin</Text>
              <Text style={s.leaveSub}>Remove yourself from the roster.</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={L.danger} />
          </TouchableOpacity>
        )}

        {/* MARK COMPLETE — organizer + Supabase + active only */}
        {isSupabase && user?.id && sbEvent?.organizer_id === user.id &&
         g.status !== 'completed' && g.status !== 'cancelled' && (
          <TouchableOpacity style={s.completeCard} onPress={handleMarkComplete} activeOpacity={0.8}>
            <View style={s.completeIconWrap}>
              <Ionicons name="checkmark-circle-outline" size={18} color={L.success} />
            </View>
            <View style={s.cancelBody}>
              <Text style={s.completeTitle}>Mark Round Robin as Complete</Text>
              <Text style={s.completeSub}>Close the event and archive results.</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={L.success} />
          </TouchableOpacity>
        )}

        {/* 11 ── CANCEL ── */}
        <TouchableOpacity style={s.cancelCard} onPress={handleCancelRR} activeOpacity={0.8}>
          <View style={s.cancelIconWrap}>
            <Ionicons name="trash-outline" size={18} color={L.danger} />
          </View>
          <View style={s.cancelBody}>
            <Text style={s.cancelTitle}>Cancel Round Robin</Text>
            <Text style={s.cancelSub}>This will remove the event for everyone.</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={L.danger} />
        </TouchableOpacity>

      </ScrollView>

      {/* ── CONTEXT MENU ── */}
      {menuOpen && (
        <>
          <Animated.View style={[mm.backdrop, { opacity: backdropOpacity }]} pointerEvents="none" />
          <TouchableOpacity
            style={[StyleSheet.absoluteFill, { zIndex: 30 }]}
            activeOpacity={1}
            onPress={() => closeMenu()}
          />
          <Animated.View
            style={[mm.popover, {
              top: insets.top + 82,
              right: 16,
              opacity: menuOpacity,
              transform: [{ scale: menuScale }],
            }]}
          >
            <View style={mm.caret} />
            {MENU_ITEMS.map((item, i) => (
              <TouchableOpacity
                key={item.id}
                style={[mm.row, i === 0 && mm.rowFirst]}
                onPress={() => handleMenuAction(item.id)}
                activeOpacity={0.7}
              >
                <View style={mm.iconWrap}>
                  <Ionicons name={item.icon as never} size={17} color={L.navy} />
                </View>
                <Text style={mm.rowLabel}>{item.label}</Text>
              </TouchableOpacity>
            ))}
            <View style={mm.divider} />
            <TouchableOpacity
              style={mm.row}
              onPress={() => handleMenuAction('cancel')}
              activeOpacity={0.7}
            >
              <View style={mm.iconWrap}>
                <Ionicons name="trash-outline" size={17} color={L.danger} />
              </View>
              <Text style={[mm.rowLabel, mm.rowLabelDanger]}>{MENU_DANGER.label}</Text>
            </TouchableOpacity>
          </Animated.View>
        </>
      )}

      {/* EDIT MODAL — organizer only, open events */}
      <Modal visible={editOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditOpen(false)}>
        <KeyboardAvoidingView style={s.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.modalHeader}>
            <TouchableOpacity onPress={() => setEditOpen(false)} hitSlop={12}>
              <Text style={s.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={s.modalTitle}>Edit Event</Text>
            <TouchableOpacity onPress={handleSaveEdit} disabled={editSaving} hitSlop={12}>
              <Text style={[s.modalSave, editSaving && { opacity: 0.4 }]}>Save</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={s.modalScroll} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <Text style={s.fieldLabel}>Event Name</Text>
            <TextInput style={s.fieldInput} value={editName} onChangeText={setEditName} placeholder="e.g. Saturday Round Robin" placeholderTextColor={L.textSub} />

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

  // Full-bleed hero
  hero: {
    width: SW,
    height: Math.round(SW * 0.72),
    position: 'relative',
    backgroundColor: L.navy,
  },
  navRow: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  navBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
  navRight: { flexDirection: 'row', gap: 10 },
  heroBadgeRow: { position: 'absolute', bottom: 140, left: 20 },
  openBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#2563EB',
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6,
  },
  openBadgeText: { fontSize: 13, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  heroContent: { position: 'absolute', bottom: 20, left: 20, right: 20, gap: 4 },
  heroTitle: {
    color: L.white, fontSize: 32, fontWeight: '800',
    marginBottom: 4,
    textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroMetaText: { fontSize: 14, color: 'rgba(255,255,255,0.9)', fontWeight: '500' },

  scroll: { paddingHorizontal: spacing.screenH, paddingTop: spacing.md, gap: 12 },

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
  fillDots:   { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  fillDot:    { width: 20, height: 6, borderRadius: 3 },
  fillDotFilled: { backgroundColor: L.gold },
  fillDotMin:    { backgroundColor: L.goldBorder },
  fillDotEmpty:  { backgroundColor: L.border },
  fillMore:   { fontSize: 11, color: L.textSub },

  // 4 — Acquisition
  acqCard: {
    backgroundColor: L.bg,
    borderRadius: radius.card,
    borderWidth: 1, borderColor: L.border,
    padding: spacing.md,
    gap: 10,
  },
  acqPrimary:   {},
  acqSecondary: {},
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

  // 5 — Roster
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
  rosterLeft:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rosterTitle: { fontSize: 14, fontWeight: '800', color: L.navy },
  viewAllBtn:  { flexDirection: 'row', alignItems: 'center', gap: 2 },
  viewAllText: { fontSize: 12, fontWeight: '700', color: L.gold },

  playerRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  playerRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border },
  avatarWrap:      { position: 'relative', flexShrink: 0 },
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
  openAvatarGroup:  { flexDirection: 'row' },
  openAvatarCircle: {
    width: 34, height: 34, borderRadius: 17,
    borderWidth: 1.5, borderColor: L.border, borderStyle: 'dashed',
    backgroundColor: L.page,
    alignItems: 'center', justifyContent: 'center',
  },
  openSpotsText: { fontSize: 13, fontWeight: '600', color: L.textSub },

  // 6 — Generate matches
  generateCard: {
    backgroundColor: L.bg,
    borderRadius: radius.card,
    borderWidth: 1.5, borderColor: L.goldBorder,
    padding: spacing.md,
    gap: 12,
  },
  generateHeader:     { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  generateIconWrap: {
    width: iconCircle.small, height: iconCircle.small,
    borderRadius: iconCircle.small / 2,
    backgroundColor: L.goldBg,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    marginTop: 1,
  },
  generateHeaderText: { flex: 1 },
  generateTitle:      { fontSize: 15, fontWeight: '800', color: L.navy },
  generateSub:        { fontSize: 12, color: L.textSub, marginTop: 2, lineHeight: 17 },
  generateMeta: {
    flexDirection: 'row', gap: 16,
    paddingTop: 2,
  },
  generateMetaItem:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  generateMetaText:  { fontSize: 12, color: L.textSub },
  generateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: L.navy, borderRadius: radius.sm, paddingVertical: 14,
  },
  generateBtnText: { fontSize: 15, fontWeight: '800', color: L.white },

  // 7 — Schedule generated state
  scheduleGenerated: {
    gap: 10,
  },
  scheduleGenRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  scheduleGenTitle: {
    fontSize: 14, fontWeight: '800', color: L.navy,
  },
  scheduleGenMeta: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    backgroundColor: L.page, borderRadius: radius.sm,
    padding: 12,
  },
  scheduleGenMetaItem: { alignItems: 'center', flex: 1 },
  scheduleGenMetaValue: { fontSize: 22, fontWeight: '900', color: L.navy },
  scheduleGenMetaLabel: { fontSize: 11, color: L.textSub, marginTop: 2 },
  scheduleGenDivider: {
    width: 1, height: 28, backgroundColor: L.border,
  },
  viewScheduleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderColor: L.border,
    borderRadius: radius.sm, paddingVertical: 11,
    backgroundColor: L.bg,
  },
  viewScheduleBtnText: { fontSize: 14, fontWeight: '700', color: L.navy },

  // 7 & 8 — Section cards (schedule, standings)
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12,
  },
  sectionIconWrap: {
    width: iconCircle.small, height: iconCircle.small,
    borderRadius: iconCircle.small / 2,
    backgroundColor: L.goldBg,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  sectionHeaderText: { flex: 1 },
  sectionTitle:      { fontSize: 14, fontWeight: '800', color: L.navy },
  emptyState: {
    alignItems: 'center', gap: 6,
    paddingVertical: 20,
    backgroundColor: L.page, borderRadius: radius.sm,
  },
  emptyText: { fontSize: 13, fontWeight: '600', color: L.textSub },
  emptySub:  { fontSize: 12, color: L.textSub },

  // 8 — Standings preview
  standingsPreview: { gap: 6 },
  standingsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8, paddingHorizontal: 10,
    borderRadius: radius.sm,
  },
  standingsRowLeader: {
    backgroundColor: L.goldLight,
    borderWidth: 1, borderColor: L.goldBorder,
  },
  standingsRankWrap: { width: 28, alignItems: 'center' },
  standingsRank:     { fontSize: 12, fontWeight: '800', color: L.textSub },
  standingsRankLeader: { color: L.gold },
  standingsAvatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: L.goldBg, borderWidth: 1, borderColor: L.goldBorder,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  standingsAvatarText: { fontSize: 9, fontWeight: '800', color: L.navy },
  standingsName:   { flex: 1, fontSize: 13, fontWeight: '700', color: L.navy },
  standingsRecord: { fontSize: 13, fontWeight: '700', color: L.textSub, minWidth: 34, textAlign: 'right' },
  standingsRecordLeader: { color: L.navy },
  standingsDiff:    { fontSize: 12, fontWeight: '700', minWidth: 34, textAlign: 'right' },
  standingsDiffPos: { color: L.success },
  standingsDiffNeg: { color: L.danger },
  viewStandingsBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderColor: L.border,
    borderRadius: radius.sm, paddingVertical: 10,
    marginTop: 4,
  },
  viewStandingsBtnText: { fontSize: 13, fontWeight: '700', color: L.navy },

  // 9 — Chat
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

  // 11 — Cancel
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

  // Edit modal
  modalRoot:    { flex: 1, backgroundColor: L.page },
  modalHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: L.border },
  modalTitle:   { fontSize: 16, fontWeight: '700', color: L.navy },
  modalCancel:  { fontSize: 15, color: L.textSub },
  modalSave:    { fontSize: 15, fontWeight: '700', color: L.gold },
  modalScroll:  { flex: 1, paddingHorizontal: 20, paddingTop: 20 },
  fieldLabel:   { fontSize: 12, fontWeight: '700', color: L.textSub, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6, marginTop: 16 },
  fieldInput:   { backgroundColor: L.bg, borderWidth: 1, borderColor: L.border, borderRadius: radius.card, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: L.navy },
  fieldTextarea: { minHeight: 80, textAlignVertical: 'top' },
});

// ─── Context menu styles ─────────────────────────────────────────────────────────

const mm = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0A1228',
    zIndex: 30,
  },
  popover: {
    position: 'absolute',
    width: 252,
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
    position: 'absolute', top: -7, right: 13,
    width: 0, height: 0,
    borderLeftWidth: 6, borderRightWidth: 6, borderBottomWidth: 8,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    borderBottomColor: '#FFFFFF',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 8, marginHorizontal: 5,
    borderRadius: 11, height: 50,
  },
  rowFirst:  { marginTop: 4 },
  iconWrap: {
    width: 32, height: 32, borderRadius: 9,
    backgroundColor: '#F3F6FC',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  rowLabel:       { color: L.navy, fontSize: 14, fontWeight: '500' },
  rowLabelDanger: { color: L.danger },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: L.border,
    marginHorizontal: 10, marginVertical: 3,
  },
});
