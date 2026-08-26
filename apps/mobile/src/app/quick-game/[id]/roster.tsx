import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, TextInput, KeyboardAvoidingView, Platform, Modal, ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing, radius } from '@/theme';
import { supabase as supabaseClient } from '@/lib/supabase';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SecondaryButton } from '@/components/SecondaryButton';
import { StatusChip } from '@/components/StatusChip';
import { useSession } from '@/hooks/useSession';
import { useSupportContext } from '@/lib/support/supportContext';
import { IS_INTERNAL_BUILD } from '@/lib/featureFlags';
import {
  fetchPlayParticipants,
  addPlayParticipant,
  removePlayParticipant,
  fetchPlayEventWithOrganizer,
  type PlayParticipant,
  type OrganizerProfile,
} from '@/lib/supabase/playEvents';
import { getCurrentGame } from '@/lib/quickGameStore';
import {
  getRoster, setRoster as qgSetRoster, addPlayer as localAddPlayer,
  removePlayer as localRemovePlayer, clearRoster, buildTestPlayers, type QGPlayer,
} from '@/lib/quickGameRosterStore';

// ─── Theme ───────────────────────────────────────────────────────────────────

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

// ─── UUID detection ───────────────────────────────────────────────────────────
// Supabase-created games have UUID ids; local games have string ids like "qg-*".

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUUID(s: string): boolean { return UUID_RE.test(s); }

// ─── Unified display type ─────────────────────────────────────────────────────

type RosterPlayer = {
  id: string;
  displayName: string;
  rating?: string;
  initials: string;
  source: 'supabase' | 'local';
};

function sbToRoster(p: PlayParticipant): RosterPlayer {
  const initials = (p.first_name.charAt(0) + (p.last_initial ?? '')).toUpperCase();
  const displayName = p.last_initial
    ? `${p.first_name} ${p.last_initial}.`
    : p.first_name;
  return {
    id:          p.id,
    displayName,
    rating:      p.self_rating ?? undefined,
    initials,
    source:      'supabase',
  };
}

function localToRoster(p: QGPlayer): RosterPlayer {
  return {
    id:          p.id,
    displayName: p.name,
    rating:      p.dupr,
    initials:    p.avatarInitials,
    source:      'local',
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function comingSoon(feature: string) {
  Alert.alert(feature, 'Coming soon — this feature is on the way.', [{ text: 'Got It' }]);
}

function makeInitials(firstName: string, lastInitial: string): string {
  return (firstName.charAt(0) + lastInitial).toUpperCase() || firstName.charAt(0).toUpperCase();
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ filled, total }: { filled: number; total: number }) {
  const pct = total > 0 ? Math.min(filled / total, 1) : 0;
  return (
    <View style={pb.track}>
      <View style={[pb.fill, { width: `${pct * 100}%` }]} />
    </View>
  );
}
const pb = StyleSheet.create({
  track: { height: 6, borderRadius: 3, backgroundColor: L.border, overflow: 'hidden' },
  fill:  { height: '100%', borderRadius: 3, backgroundColor: L.gold },
});

// ─── Player card ──────────────────────────────────────────────────────────────

function PlayerCard({ player, onRemove }: { player: RosterPlayer; onRemove?: () => void }) {
  return (
    <View style={pc.card}>
      <View style={pc.avatar}>
        <Text style={pc.avatarText}>{player.initials}</Text>
      </View>
      <View style={pc.body}>
        <Text style={pc.name} numberOfLines={1}>{player.displayName}</Text>
        {player.rating ? (
          <Text style={pc.meta}>{`Self Rating ${player.rating}`}</Text>
        ) : null}
      </View>
      <StatusChip label="Joined" variant="green" />
      {onRemove && (
        <TouchableOpacity
          style={pc.removeBtn}
          onPress={onRemove}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.7}
        >
          <Ionicons name="close-circle" size={20} color={L.textSub} />
        </TouchableOpacity>
      )}
    </View>
  );
}
const pc = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: L.bg, borderRadius: radius.md,
    borderWidth: 1, borderColor: L.border,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: L.goldBg, borderWidth: 1.5, borderColor: L.goldBorder,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarText: { fontSize: 11, fontWeight: '900', color: L.navy },
  body:       { flex: 1 },
  name:       { fontSize: 14, fontWeight: '700', color: L.navy },
  meta:       { fontSize: 11, color: L.textSub, marginTop: 2 },
  removeBtn:  { flexShrink: 0, marginLeft: 4 },
});

// ─── New player input type ────────────────────────────────────────────────────

type NewPlayerInput = {
  firstName: string;
  lastInitial: string;
  email: string;
  selfRating: string;
};

// ─── Add Player modal ─────────────────────────────────────────────────────────

function AddPlayerModal({
  visible, onClose, onAdd, isFull,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (p: NewPlayerInput) => Promise<void>;
  isFull: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [firstName,   setFirstName]   = useState('');
  const [lastInitial, setLastInitial] = useState('');
  const [email,       setEmail]       = useState('');
  const [selfRating,  setSelfRating]  = useState('');
  const [saving,      setSaving]      = useState(false);

  async function handleAdd() {
    if (!firstName.trim()) {
      Alert.alert('Name required', 'Please enter the player\'s first name.'); return;
    }
    if (!email.trim()) {
      Alert.alert('Email required', 'Please enter the player\'s email.'); return;
    }
    setSaving(true);
    try {
      await onAdd({
        firstName:   firstName.trim(),
        lastInitial: lastInitial.trim().charAt(0),
        email:       email.trim().toLowerCase(),
        selfRating:  selfRating.trim(),
      });
      // Success: clear form and close
      setFirstName(''); setLastInitial(''); setEmail(''); setSelfRating('');
      onClose();
    } catch {
      // Screen already showed an Alert; keep modal open so user can retry
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[am.root, { paddingBottom: insets.bottom + 16 }]}>
          <View style={am.header}>
            <Text style={am.title}>Add Player</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={24} color={L.navy} />
            </TouchableOpacity>
          </View>

          {isFull ? (
            <View style={am.fullState}>
              <Ionicons name="people" size={40} color={L.textSub} />
              <Text style={am.fullTitle}>Game is Full</Text>
              <Text style={am.fullSub}>This game has reached its max players.</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={am.scroll} keyboardShouldPersistTaps="handled">
              <Text style={am.fieldLabel}>First Name *</Text>
              <View style={am.inputWrap}>
                <TextInput
                  style={am.input}
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="e.g. Sarah"
                  placeholderTextColor={L.textSub}
                  autoFocus
                  returnKeyType="next"
                />
              </View>

              <Text style={[am.fieldLabel, { marginTop: 14 }]}>Last Initial</Text>
              <View style={am.inputWrap}>
                <TextInput
                  style={am.input}
                  value={lastInitial}
                  onChangeText={t => setLastInitial(t.charAt(0))}
                  placeholder="e.g. M  (optional)"
                  placeholderTextColor={L.textSub}
                  maxLength={1}
                  autoCapitalize="characters"
                  returnKeyType="next"
                />
              </View>

              <Text style={[am.fieldLabel, { marginTop: 14 }]}>Email *</Text>
              <View style={am.inputWrap}>
                <TextInput
                  style={am.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="player@email.com"
                  placeholderTextColor={L.textSub}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  returnKeyType="next"
                />
              </View>

              <Text style={[am.fieldLabel, { marginTop: 14 }]}>Self Rating</Text>
              <View style={am.inputWrap}>
                <TextInput
                  style={am.input}
                  value={selfRating}
                  onChangeText={setSelfRating}
                  placeholder="e.g. 4.0  (optional)"
                  placeholderTextColor={L.textSub}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                />
              </View>
            </ScrollView>
          )}

          {!isFull && (
            <View style={am.footer}>
              {saving ? (
                <View style={am.savingRow}>
                  <ActivityIndicator size="small" color={L.gold} />
                  <Text style={am.savingText}>Adding player…</Text>
                </View>
              ) : (
                <PrimaryButton label="Add Player" onPress={handleAdd} />
              )}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const am = StyleSheet.create({
  root:   { flex: 1, backgroundColor: L.page },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.screenH, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
    backgroundColor: L.bg,
  },
  title:      { fontSize: 17, fontWeight: '800', color: L.navy },
  scroll:     { paddingHorizontal: spacing.screenH, paddingTop: spacing.lg },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: L.textSub, marginBottom: 6, letterSpacing: 0.3 },
  inputWrap:  {
    borderWidth: 1.5, borderColor: L.border, borderRadius: radius.sm,
    paddingHorizontal: 12, height: 46, justifyContent: 'center',
    backgroundColor: L.bg,
  },
  input:      { fontSize: 14, color: L.text },
  footer:     { paddingHorizontal: spacing.screenH, paddingTop: 12 },
  fullState:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
  fullTitle:  { fontSize: 17, fontWeight: '800', color: L.navy },
  fullSub:    { fontSize: 13, color: L.textSub, textAlign: 'center' },
  savingRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 14 },
  savingText: { fontSize: 14, color: L.textSub, fontWeight: '600' },
});

// ─── Test Player modal (local-only) ───────────────────────────────────────────

function TestPlayerModal({
  visible, onClose, onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (count: 4 | 8 | 12) => void;
}) {
  const insets = useSafeAreaInsets();
  const OPTIONS: { count: 4 | 8 | 12; label: string }[] = [
    { count: 4,  label: '4 Players — Small group' },
    { count: 8,  label: '8 Players — Medium game' },
    { count: 12, label: '12 Players — Full session' },
  ];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[tm.root, { paddingBottom: insets.bottom + 16 }]}>
        <View style={tm.header}>
          <Text style={tm.title}>Add Test Players</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={24} color={L.navy} />
          </TouchableOpacity>
        </View>

        <Text style={tm.sub}>Populate the roster with sample players for testing.</Text>

        <View style={tm.optionList}>
          {OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.count}
              style={tm.option}
              onPress={() => { onAdd(opt.count); onClose(); }}
              activeOpacity={0.8}
            >
              <View style={tm.optionIcon}>
                <Ionicons name="people-outline" size={18} color={L.gold} />
              </View>
              <View style={tm.optionBody}>
                <Text style={tm.optionLabel}>{opt.label}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={L.textSub} />
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Modal>
  );
}

const tm = StyleSheet.create({
  root:   { flex: 1, backgroundColor: L.page },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.screenH, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
    backgroundColor: L.bg,
  },
  title:      { fontSize: 17, fontWeight: '800', color: L.navy },
  sub:        { fontSize: 13, color: L.textSub, paddingHorizontal: spacing.screenH, marginTop: 16, marginBottom: 8 },
  optionList: { paddingHorizontal: spacing.screenH, gap: 10, marginTop: 8 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: L.bg, borderRadius: radius.card,
    borderWidth: 1, borderColor: L.border,
    paddingHorizontal: 14, paddingVertical: 14,
  },
  optionIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: L.goldBg, borderWidth: 1, borderColor: L.goldBorder,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  optionBody:  { flex: 1 },
  optionLabel: { fontSize: 14, fontWeight: '700', color: L.navy },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function QuickGameRosterScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const gameId     = id ?? '';
  const supabase   = isUUID(gameId);
  // Seeded test players are a QA affordance, not a product feature. They were
  // gated only on `!supabase` (local, non-Supabase games), which kept the fake
  // roster out of the database but still showed real users an "Add Test
  // Players" button in a production build (item 6.1).
  const canAddTestPlayers = !supabase && IS_INTERNAL_BUILD;

  const [players,       setPlayers]       = useState<RosterPlayer[]>([]);
  const [playersNeeded, setPlayersNeeded] = useState(8);
  const [gameTitle,     setGameTitle]     = useState('Quick Game');
  const [loading,       setLoading]       = useState(supabase);
  const [showAdd,       setShowAdd]       = useState(false);
  const [showTest,      setShowTest]      = useState(false);
  const [isOrganizer,   setIsOrganizer]   = useState(false);
  const [organizerProfile, setOrganizerProfile] = useState<OrganizerProfile | null>(null);

  useSupportContext({ feature: 'quick_game', entityType: 'quick_game', entityId: gameId, entityLabel: gameTitle });

  // ── Fetch ────────────────────────────────────────────────────────────────────
  // Non-organizer viewers can't SELECT the full play_participants table (RLS
  // restricts base-table reads to your own row + the organizer) — reading it
  // anyway silently returns just your own row, undercounting the roster. Use
  // the public view for anyone but the organizer, matching community/[id].tsx.

  useFocusEffect(useCallback(() => {
    if (supabase) {
      setLoading(true);
      fetchPlayEventWithOrganizer(gameId)
        .then(async (event) => {
          if (event) {
            setPlayersNeeded(event.max_players);
            setGameTitle(event.name);
            setOrganizerProfile(event.organizer);
          }
          const organizer = !!user?.id && event?.organizer_id === user.id;
          setIsOrganizer(organizer);

          if (organizer) {
            const participants = await fetchPlayParticipants(gameId);
            setPlayers(participants.map(sbToRoster));
          } else {
            const { data } = await supabaseClient
              .from('play_participants_public')
              .select('*')
              .eq('event_id', gameId)
              .order('created_at', { ascending: true });
            setPlayers((data ?? []).map((p, i) => ({
              id: p.id ?? `public-${i}`,
              displayName: p.last_initial ? `${p.first_name} ${p.last_initial}.` : (p.first_name ?? ''),
              rating: p.self_rating ?? undefined,
              initials: ((p.first_name?.charAt(0) ?? '') + (p.last_initial ?? '')).toUpperCase(),
              source: 'supabase',
            })));
          }
        })
        .catch(() => { /* keep last state on error */ })
        .finally(() => setLoading(false));
    } else {
      const game = getCurrentGame();
      if (game) { setPlayersNeeded(game.playersNeeded); setGameTitle(game.title); }
      setPlayers(getRoster(gameId).map(localToRoster));
      setIsOrganizer(true);
    }
  }, [gameId, supabase, user?.id]));

  // Supabase: organizer is already in play_participants, so players.length is correct.
  // Local: rrRosterStore doesn't track the host, so +1 accounts for them.
  const totalFilled = supabase ? players.length : players.length + 1;
  const spotsLeft   = Math.max(playersNeeded - totalFilled, 0);
  const isFull      = spotsLeft <= 0;

  // ── Add ──────────────────────────────────────────────────────────────────────

  // Returns Promise<void>. Throws on error so the modal stays open and shows the Alert.
  async function handleAdd(input: NewPlayerInput): Promise<void> {
    if (supabase) {
      if (!user?.id) {
        Alert.alert(
          'Sign in required',
          'You must be signed in to add players.',
          [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign In', onPress: () => router.push('/sign-in' as never) }],
        );
        throw new Error('not signed in');
      }
      if (isFull) {
        Alert.alert('Game is full', 'No spots remaining.');
        throw new Error('game full');
      }

      // Duplicate email guard
      const existing = await fetchPlayParticipants(gameId);
      if (existing.some(p => p.email.toLowerCase() === input.email.toLowerCase())) {
        Alert.alert('Duplicate player', 'A player with this email is already on the roster.');
        throw new Error('duplicate email');
      }

      await addPlayParticipant({
        event_id:           gameId,
        first_name:         input.firstName,
        last_initial:       input.lastInitial || null,
        email:              input.email,
        self_rating:        input.selfRating || null,
        added_by_organizer: true,
        claimed_by:         null,
      });
      const updated = await fetchPlayParticipants(gameId);
      setPlayers(updated.map(sbToRoster));
    } else {
      localAddPlayer(gameId, {
        id:             `qg-p-${Date.now()}`,
        name:           input.firstName + (input.lastInitial ? ` ${input.lastInitial}.` : ''),
        dupr:           input.selfRating || undefined,
        avatarInitials: makeInitials(input.firstName, input.lastInitial),
        status:         'registered',
      });
      setPlayers(getRoster(gameId).map(localToRoster));
    }
  }

  // ── Remove ───────────────────────────────────────────────────────────────────

  function handleRemove(player: RosterPlayer) {
    Alert.alert(
      'Remove Player',
      `Remove ${player.displayName} from the roster?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            if (player.source === 'supabase') {
              if (!user?.id) {
                Alert.alert('Sign in required', 'You must be signed in to remove players.');
                return;
              }
              try {
                await removePlayParticipant(player.id);
                setPlayers(prev => prev.filter(p => p.id !== player.id));
              } catch {
                Alert.alert('Error', 'Could not remove player. Please try again.');
              }
            } else {
              localRemovePlayer(gameId, player.id);
              setPlayers(getRoster(gameId).map(localToRoster));
            }
          },
        },
      ],
    );
  }

  // ── Test players (local only) ─────────────────────────────────────────────────

  function handleTestAdd(count: 4 | 8 | 12) {
    const existing = getRoster(gameId);
    const needed   = Math.max(count - existing.length, 0);
    if (needed === 0) return;
    const fresh  = buildTestPlayers(count);
    const toAdd  = fresh.slice(existing.length, existing.length + needed);
    const merged = [...existing, ...toAdd].map((p, i) => ({ ...p, id: `qg-mock-${i + 1}` }));
    qgSetRoster(gameId, merged);
    setPlayers(getRoster(gameId).map(localToRoster));
  }

  function handleClearRoster() {
    if (supabase) { comingSoon('Clear Roster'); return; }
    Alert.alert('Clear Roster', 'Remove all players from the roster?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => { clearRoster(gameId); setPlayers([]); } },
    ]);
  }

  const isEmpty = players.length === 0;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <View style={s.root}>
      <StatusBar style="dark" />

      {/* ── HEADER ── */}
      <View style={[s.header, { paddingTop: insets.top }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.6}>
          <Ionicons name="chevron-back" size={20} color="#007AFF" />
          <Text style={s.backText}>Back</Text>
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>Player Roster</Text>
          <Text style={s.headerSub}>{gameTitle}</Text>
        </View>
        <TouchableOpacity
          style={s.headerAction}
          onPress={() => isFull
            ? Alert.alert('Game is full', 'No open spots remaining.')
            : setShowAdd(true)
          }
          activeOpacity={0.7}
        >
          <Ionicons name="person-add-outline" size={20} color={isFull ? L.textSub : L.gold} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color={L.gold} />
          <Text style={s.loadingText}>Loading roster…</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* ── FILL STATUS ── */}
          <View style={s.fillCard}>
            <View style={s.fillRow}>
              <View style={s.fillIconWrap}>
                <Ionicons name="people-outline" size={18} color={L.gold} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.fillTitle}>
                  {totalFilled} of {playersNeeded} Players
                </Text>
                <Text style={s.fillSub}>
                  {isFull
                    ? 'Game is full'
                    : `${spotsLeft} spot${spotsLeft !== 1 ? 's' : ''} remaining`}
                </Text>
              </View>
              <Text style={s.fillPct}>
                {Math.min(Math.round((totalFilled / playersNeeded) * 100), 100)}%
              </Text>
            </View>
            <ProgressBar filled={totalFilled} total={playersNeeded} />
            {isFull && (
              <View style={s.fullBanner}>
                <Ionicons name="lock-closed-outline" size={13} color={L.gold} />
                <Text style={s.fullBannerText}>Game is full — no open spots</Text>
              </View>
            )}
          </View>

          {/* ── INVITE ── */}
          <TouchableOpacity
            style={s.inviteCard}
            onPress={() => router.push({
              pathname: '/community/[id]/invite-players' as never,
              params: { id: gameId },
            } as never)}
            activeOpacity={0.85}
          >
            <View style={s.inviteIconWrap}>
              <Ionicons name="person-add-outline" size={18} color={L.gold} />
            </View>
            <View style={s.inviteBody}>
              <Text style={s.inviteTitle}>Invite Players</Text>
              <Text style={s.inviteSub}>Send invite links to fill open spots</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={L.textSub} />
          </TouchableOpacity>

          {/* ── HOST ROW ── */}
          <View style={s.sectionLabel}>
            <Text style={s.sectionLabelText}>PLAYERS ({totalFilled}/{playersNeeded})</Text>
            {isOrganizer && players.length > 0 && (
              <TouchableOpacity onPress={handleClearRoster} activeOpacity={0.7}>
                <Text style={s.clearText}>Clear All</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={[pc.card, s.hostCard]}>
            <View style={[pc.avatar, s.hostAvatar]}>
              <Text style={pc.avatarText}>
                {isOrganizer ? 'YO' : (organizerProfile?.full_name?.slice(0, 2).toUpperCase() ?? 'HO')}
              </Text>
            </View>
            <View style={pc.body}>
              <Text style={pc.name}>{isOrganizer ? 'You (Host)' : (organizerProfile?.full_name ?? 'Host')}</Text>
              <Text style={pc.meta}>Organizer</Text>
            </View>
            <StatusChip label="Host" variant="gold" />
          </View>

          {/* ── ROSTER LIST ── */}
          {isEmpty ? (
            <View style={s.emptyCard}>
              <Ionicons name="people-outline" size={36} color={L.border} />
              <Text style={s.emptyTitle}>No players yet</Text>
              <Text style={s.emptySub}>
                {isOrganizer ? 'Add players manually to fill the roster.' : 'Be the first to invite someone!'}
              </Text>
              {!isFull && isOrganizer && (
                <TouchableOpacity
                  style={s.emptyAddBtn}
                  onPress={() => setShowAdd(true)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="person-add-outline" size={16} color={L.gold} />
                  <Text style={s.emptyAddText}>Add First Player</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={s.playerList}>
              {players.map(p => (
                <PlayerCard
                  key={p.id}
                  player={p}
                  onRemove={isOrganizer ? () => handleRemove(p) : undefined}
                />
              ))}
            </View>
          )}

          {/* ── OPEN SPOTS ── */}
          {spotsLeft > 0 && (
            <View style={s.openSpotsCard}>
              <Ionicons name="add-circle-outline" size={16} color={L.textSub} />
              <Text style={s.openSpotsText}>
                {spotsLeft} Open Spot{spotsLeft !== 1 ? 's' : ''}
              </Text>
              <TouchableOpacity
                onPress={() => router.push({
                  pathname: '/community/[id]/invite-players' as never,
                  params: { id: gameId },
                } as never)}
                style={s.openSpotsInviteBtn}
                activeOpacity={0.8}
              >
                <Text style={s.openSpotsInviteText}>Invite</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}

      {/* ── STICKY FOOTER — manual add is organizer-only ── */}
      {!loading && isOrganizer && (
        <View style={[s.footer, { paddingBottom: insets.bottom + 12 }]}>
          <PrimaryButton
            label={isFull ? 'Game is Full' : 'Add Player'}
            icon={isFull ? 'lock-closed-outline' : 'person-add-outline'}
            onPress={() => isFull
              ? Alert.alert('Game is full', 'No open spots remaining.')
              : setShowAdd(true)
            }
          />
          {canAddTestPlayers && (
            <SecondaryButton
              label="Add Test Players"
              icon="people-outline"
              onPress={() => setShowTest(true)}
            />
          )}
        </View>
      )}

      {/* ── MODALS ── */}
      <AddPlayerModal
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onAdd={handleAdd}
        isFull={isFull}
      />
      {canAddTestPlayers && (
        <TestPlayerModal
          visible={showTest}
          onClose={() => setShowTest(false)}
          onAdd={handleTestAdd}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.screenH, paddingBottom: 10,
    backgroundColor: L.page,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  backBtn:      { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 60 },
  backText:     { fontSize: 17, color: '#007AFF', fontWeight: '400' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle:  { fontSize: 15, fontWeight: '800', color: L.navy },
  headerSub:    { fontSize: 11, color: L.textSub, marginTop: 1 },
  headerAction: { width: 36, height: 36, justifyContent: 'center', minWidth: 60, alignItems: 'flex-end' },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: L.textSub },

  scroll: { paddingHorizontal: spacing.screenH, paddingTop: spacing.md, gap: 12 },

  fillCard: {
    backgroundColor: L.goldLight, borderRadius: radius.card,
    borderWidth: 1, borderColor: L.goldBorder,
    padding: spacing.md, gap: 10,
  },
  fillRow:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fillIconWrap: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: L.goldBg, borderWidth: 1, borderColor: L.goldBorder,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  fillTitle:  { fontSize: 14, fontWeight: '800', color: L.navy },
  fillSub:    { fontSize: 12, color: L.textSub, marginTop: 1 },
  fillPct:    { fontSize: 16, fontWeight: '900', color: L.gold },
  fullBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: L.goldBg, borderRadius: radius.sm,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: L.goldBorder,
  },
  fullBannerText: { fontSize: 12, fontWeight: '700', color: L.navy },

  inviteCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: L.bg, borderRadius: radius.card,
    borderWidth: 1, borderColor: L.border,
    paddingHorizontal: 14, paddingVertical: 13,
  },
  inviteIconWrap: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: L.goldBg, borderWidth: 1, borderColor: L.goldBorder,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  inviteBody:  { flex: 1 },
  inviteTitle: { fontSize: 14, fontWeight: '700', color: L.navy },
  inviteSub:   { fontSize: 11, color: L.textSub, marginTop: 1 },

  sectionLabel:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionLabelText: { fontSize: 11, fontWeight: '800', color: L.textSub, letterSpacing: 0.5 },
  clearText:        { fontSize: 12, fontWeight: '700', color: L.danger },

  hostCard:   { marginBottom: 4 },
  hostAvatar: { borderColor: L.gold },

  playerList: { gap: 8 },

  emptyCard: {
    backgroundColor: L.bg, borderRadius: radius.card,
    borderWidth: 1, borderColor: L.border,
    padding: spacing.xl, alignItems: 'center', gap: 8,
  },
  emptyTitle:  { fontSize: 15, fontWeight: '800', color: L.navy },
  emptySub:    { fontSize: 13, color: L.textSub, textAlign: 'center', lineHeight: 19 },
  emptyAddBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1.5, borderColor: L.goldBorder, borderRadius: radius.sm,
    paddingHorizontal: 16, paddingVertical: 9, marginTop: 4,
  },
  emptyAddText: { fontSize: 13, fontWeight: '700', color: L.gold },

  openSpotsCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: L.bg, borderRadius: radius.md,
    borderWidth: 1, borderColor: L.border, borderStyle: 'dashed',
    paddingHorizontal: 14, paddingVertical: 12,
  },
  openSpotsText:       { flex: 1, fontSize: 13, color: L.textSub, fontWeight: '600' },
  openSpotsInviteBtn:  {
    backgroundColor: L.goldLight, borderRadius: radius.sm,
    borderWidth: 1, borderColor: L.goldBorder,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  openSpotsInviteText: { fontSize: 12, fontWeight: '700', color: L.gold },

  footer: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: spacing.screenH, paddingTop: 12,
    backgroundColor: L.page,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: L.border,
    gap: 8,
  },
});
