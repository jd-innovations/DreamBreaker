import React, { useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Animated, Easing, Share, TextInput,
  KeyboardAvoidingView, Platform, Modal, ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing, radius } from '@/theme';
import { StatusChip } from '@/components/StatusChip';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SecondaryButton } from '@/components/SecondaryButton';
import { useSession } from '@/hooks/useSession';
import { IS_INTERNAL_BUILD } from '@/lib/featureFlags';
import { getRoundRobin, updateCurrentPlayers } from '@/lib/roundRobinStore';
import {
  getRoster, addPlayer, removePlayer, clearRoster,
  buildTestPlayers, type RRPlayer,
} from '@/lib/rrRosterStore';
import {
  fetchPlayEventById, fetchPlayParticipants,
  addPlayParticipant, removePlayParticipant,
  type PlayParticipant,
} from '@/lib/supabase/playEvents';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Input shape shared by both paths in AddPlayerModal
type AddPlayerInput = {
  name:   string;
  email:  string;
  dupr?:  string;
  status: RRPlayer['status'];
};

function sbToRRPlayer(p: PlayParticipant): RRPlayer {
  const name = p.last_initial ? `${p.first_name} ${p.last_initial}.` : p.first_name;
  return {
    id:             p.id,
    profileId:      p.claimed_by ?? null,
    name,
    dupr:           p.self_rating ?? undefined,
    city:           undefined,
    avatarInitials: makeInitials(name),
    status:         'registered',
  };
}

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function comingSoon(feature: string) {
  Alert.alert(feature, 'Coming soon — this feature is on the way.', [{ text: 'Got It' }]);
}

function makeInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({ filled, total }: { filled: number; total: number }) {
  const pct = total > 0 ? Math.min(filled / total, 1) : 0;
  return (
    <View style={pb.track}>
      <View style={[pb.fill, { width: `${Math.round(pct * 100)}%` }]} />
    </View>
  );
}

const pb = StyleSheet.create({
  track: {
    height: 6, borderRadius: 3,
    backgroundColor: L.border, overflow: 'hidden',
  },
  fill: {
    height: '100%', borderRadius: 3,
    backgroundColor: L.gold,
  },
});

// ─── Player Card ─────────────────────────────────────────────────────────────

function PlayerCard({
  player,
  onRemove,
  isOrganizer = false,
}: {
  player: RRPlayer;
  onRemove: (id: string) => void;
  isOrganizer?: boolean;
}) {
  function handleLongPress() {
    if (isOrganizer) return; // organizer cannot be removed
    // "View Profile" used to alert "coming soon" for every player, including
    // ones whose profile screen exists and works. It is now a real navigation,
    // and is omitted entirely for guests -- a participant added by the
    // organizer has no account to open (item 6.2).
    Alert.alert(
      player.name,
      'What would you like to do?',
      [
        ...(player.profileId
          ? [{
              text: 'View Profile',
              onPress: () => router.push(`/players/${player.profileId}` as never),
            }]
          : []),
        {
          text: 'Remove Player',
          style: 'destructive',
          onPress: () =>
            Alert.alert(
              'Remove Player?',
              `Remove ${player.name} from the roster?`,
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Remove', style: 'destructive', onPress: () => onRemove(player.id) },
              ],
            ),
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }

  return (
    <TouchableOpacity
      style={pc.card}
      onLongPress={handleLongPress}
      activeOpacity={0.85}
      delayLongPress={300}
    >
      <View style={pc.avatar}>
        <Text style={pc.avatarText}>{player.avatarInitials}</Text>
      </View>
      <View style={pc.body}>
        <Text style={pc.name} numberOfLines={1}>{player.name}</Text>
        <View style={pc.metaRow}>
          {player.dupr ? (
            <Text style={pc.meta}>{player.dupr} DUPR</Text>
          ) : null}
          {player.dupr && player.city ? (
            <View style={pc.dot} />
          ) : null}
          {player.city ? (
            <Text style={pc.meta} numberOfLines={1}>{player.city}</Text>
          ) : null}
        </View>
      </View>
      <StatusChip
        label={player.status === 'registered' ? 'Registered' : 'Invited'}
        variant={player.status === 'registered' ? 'green' : 'gray'}
      />
      {!isOrganizer && (
        <TouchableOpacity
          style={pc.removeBtn}
          onPress={() =>
            Alert.alert(
              'Remove Player?',
              `Remove ${player.name} from the roster?`,
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Remove', style: 'destructive', onPress: () => onRemove(player.id) },
              ],
            )
          }
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          activeOpacity={0.7}
        >
          <Ionicons name="close-circle" size={20} color={L.border} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const pc = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: L.bg,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: L.border,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: L.goldBg, borderWidth: 1.5, borderColor: L.goldBorder,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarText: { fontSize: 12, fontWeight: '900', color: L.navy },
  body:     { flex: 1, gap: 3 },
  name:     { fontSize: 14, fontWeight: '700', color: L.navy },
  metaRow:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta:     { fontSize: 11, color: L.textSub },
  dot:      { width: 3, height: 3, borderRadius: 1.5, backgroundColor: L.border },
  removeBtn:{ padding: 2 },
});

// ─── Add Player Modal ─────────────────────────────────────────────────────────

const STATUS_OPTIONS: RRPlayer['status'][] = ['registered', 'invited'];

function AddPlayerModal({
  visible,
  onClose,
  onAdd,
  requireEmail = false,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (input: AddPlayerInput) => void;
  requireEmail?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [dupr,     setDupr]     = useState('');
  const [status,   setStatus]   = useState<RRPlayer['status']>('registered');
  const [nameErr,  setNameErr]  = useState('');
  const [emailErr, setEmailErr] = useState('');

  function reset() {
    setName(''); setEmail(''); setDupr('');
    setStatus('registered'); setNameErr(''); setEmailErr('');
  }

  function handleClose() { reset(); onClose(); }

  function handleAdd() {
    let ok = true;
    if (!name.trim())                                  { setNameErr('Name is required.'); ok = false; }
    if (requireEmail && !email.trim())                 { setEmailErr('Email is required.'); ok = false; }
    if (requireEmail && email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setEmailErr('Enter a valid email address.'); ok = false;
    }
    if (!ok) return;
    setNameErr(''); setEmailErr('');
    onAdd({ name: name.trim(), email: email.trim(), dupr: dupr.trim() || undefined, status });
    reset();
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[am.root, { paddingBottom: insets.bottom + 20 }]}>
          {/* Header */}
          <View style={am.header}>
            <TouchableOpacity onPress={handleClose} style={am.cancelBtn} activeOpacity={0.7}>
              <Text style={am.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={am.title}>Add Player</Text>
            <TouchableOpacity onPress={handleAdd} style={am.addBtn} activeOpacity={0.7}>
              <Text style={am.addText}>Add</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={am.scroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Name */}
            <View style={am.field}>
              <Text style={am.fieldLabel}>Name <Text style={am.required}>*</Text></Text>
              <TextInput
                style={[am.input, nameErr ? am.inputError : null]}
                value={name}
                onChangeText={v => { setName(v); setNameErr(''); }}
                placeholder="Full name"
                placeholderTextColor={L.textSub}
                returnKeyType="next"
                autoFocus
              />
              {nameErr ? <Text style={am.errorText}>{nameErr}</Text> : null}
            </View>

            {/* Email */}
            <View style={am.field}>
              <Text style={am.fieldLabel}>
                Email {requireEmail
                  ? <Text style={am.required}>*</Text>
                  : <Text style={am.optional}>(Optional)</Text>}
              </Text>
              <TextInput
                style={[am.input, emailErr ? am.inputError : null]}
                value={email}
                onChangeText={v => { setEmail(v); setEmailErr(''); }}
                placeholder="player@email.com"
                placeholderTextColor={L.textSub}
                keyboardType="email-address"
                autoCapitalize="none"
                returnKeyType="next"
              />
              {emailErr ? <Text style={am.errorText}>{emailErr}</Text> : null}
            </View>

            {/* DUPR */}
            <View style={am.field}>
              <Text style={am.fieldLabel}>DUPR Rating <Text style={am.optional}>(Optional)</Text></Text>
              <TextInput
                style={am.input}
                value={dupr}
                onChangeText={setDupr}
                placeholder="e.g. 4.2"
                placeholderTextColor={L.textSub}
                keyboardType="decimal-pad"
                returnKeyType="done"
              />
            </View>

            {/* Status */}
            <View style={am.field}>
              <Text style={am.fieldLabel}>Status</Text>
              <View style={am.statusRow}>
                {STATUS_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt}
                    style={[am.statusChip, status === opt && am.statusChipActive]}
                    onPress={() => setStatus(opt)}
                    activeOpacity={0.8}
                  >
                    <Text style={[am.statusChipText, status === opt && am.statusChipTextActive]}>
                      {opt === 'registered' ? 'Registered' : 'Invited'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <PrimaryButton label="Add Player" icon="person-add-outline" onPress={handleAdd} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const am = StyleSheet.create({
  root: {
    flex: 1, backgroundColor: L.page,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.screenH, paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  title:      { fontSize: 16, fontWeight: '800', color: L.navy },
  cancelBtn:  { minWidth: 60 },
  cancelText: { fontSize: 16, color: '#007AFF' },
  addBtn:     { minWidth: 60, alignItems: 'flex-end' },
  addText:    { fontSize: 16, color: L.gold, fontWeight: '700' },

  scroll: { padding: spacing.screenH, gap: 20 },

  field:      { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: L.navy },
  required:   { color: L.danger },
  optional:   { fontWeight: '400', color: L.textSub },
  input: {
    borderWidth: 1.5, borderColor: L.border,
    borderRadius: radius.sm, paddingHorizontal: 14,
    height: 48, fontSize: 15, color: L.navy,
    backgroundColor: L.bg,
  },
  inputError: { borderColor: L.danger },
  errorText:  { fontSize: 12, color: L.danger },

  statusRow: { flexDirection: 'row', gap: 10 },
  statusChip: {
    flex: 1, alignItems: 'center', paddingVertical: 12,
    borderRadius: radius.sm, borderWidth: 1.5, borderColor: L.border,
    backgroundColor: L.bg,
  },
  statusChipActive:     { backgroundColor: L.goldLight, borderColor: L.goldBorder },
  statusChipText:       { fontSize: 14, fontWeight: '700', color: L.textSub },
  statusChipTextActive: { color: L.navy },
});

// ─── Test Player Sheet ────────────────────────────────────────────────────────

function TestPlayerModal({
  visible,
  onClose,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (count: 4 | 8 | 12 | 16) => void;
}) {
  const insets = useSafeAreaInsets();
  const counts: (4 | 8 | 12 | 16)[] = [4, 8, 12, 16];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[tp.root, { paddingBottom: insets.bottom + 20 }]}>
        <View style={tp.header}>
          <Text style={tp.title}>Add Test Players</Text>
          <TouchableOpacity onPress={onClose} style={tp.closeBtn} activeOpacity={0.7}>
            <Ionicons name="close" size={22} color={L.navy} />
          </TouchableOpacity>
        </View>
        <Text style={tp.sub}>
          Populates the roster with realistic mock data for development and testing.
        </Text>
        <View style={tp.options}>
          {counts.map(c => (
            <TouchableOpacity
              key={c}
              style={tp.optionBtn}
              onPress={() => { onAdd(c); onClose(); }}
              activeOpacity={0.85}
            >
              <View style={tp.optionLeft}>
                <View style={tp.optionIcon}>
                  <Ionicons name="people-outline" size={18} color={L.gold} />
                </View>
                <View>
                  <Text style={tp.optionLabel}>Add {c} Players</Text>
                  <Text style={tp.optionSub}>
                    {c - 1} rounds · {Math.floor(c / 2) * (c - 1)} total matches
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color={L.textSub} />
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Modal>
  );
}

const tp = StyleSheet.create({
  root: {
    flex: 1, backgroundColor: L.page,
    paddingHorizontal: spacing.screenH,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 20,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
    marginBottom: 14,
  },
  title:    { fontSize: 18, fontWeight: '900', color: L.navy },
  closeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  sub: {
    fontSize: 13, color: L.textSub, lineHeight: 18, marginBottom: 20,
  },
  options: { gap: 10 },
  optionBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: L.bg, borderRadius: radius.card,
    borderWidth: 1, borderColor: L.border,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  optionLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  optionIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: L.goldBg, borderWidth: 1, borderColor: L.goldBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  optionLabel: { fontSize: 15, fontWeight: '800', color: L.navy },
  optionSub:   { fontSize: 12, color: L.textSub, marginTop: 2 },
});

// ─── Context Menu ─────────────────────────────────────────────────────────────

const ALL_MENU_ITEMS = [
  { id: 'share',   label: 'Share Roster',            icon: 'share-outline' },
  { id: 'export',  label: 'Export Players',           icon: 'download-outline' },
  { id: 'invite',  label: 'Invite Players',           icon: 'person-add-outline' },
  { id: 'command', label: 'Return to Command Center', icon: 'arrow-back-outline' },
];

// Actions with no implementation behind them. They used to sit in the menu
// and answer with a "coming soon" alert; item 6.2's bar is that a visible CTA
// does something real, so in a production build they are simply not offered.
// Internal builds keep them visible so the gap stays obvious to QA.
const UNBUILT_MENU_IDS = new Set(['export']);
const MENU_ITEMS = ALL_MENU_ITEMS.filter(
  (i) => IS_INTERNAL_BUILD || !UNBUILT_MENU_IDS.has(i.id),
);
const MENU_DANGER = { id: 'clear', label: 'Clear Roster', icon: 'trash-outline' };

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function RRRosterScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();
  const tournamentId = id ?? '';
  const isSupabase   = UUID_RE.test(tournamentId);
  // See quick-game/[id]/roster.tsx: `!isSupabase` alone kept seeded players out
  // of the database but still surfaced the button to real users (item 6.1).
  const canAddTestPlayers = !isSupabase && IS_INTERNAL_BUILD;

  // ── State ──
  const [sbMaxPlayers, setSbMaxPlayers] = useState(12);
  const [sbTitle,      setSbTitle]      = useState('Round Robin');
  const [loading,      setLoading]      = useState(isSupabase);
  const [players,      setPlayers]      = useState<RRPlayer[]>(() =>
    isSupabase ? [] : getRoster(tournamentId),
  );
  const [organizerParticipantId, setOrganizerParticipantId] = useState<string | null>(null);

  // ── Supabase fetch ──
  async function fetchSb() {
    const [ev, parts] = await Promise.all([
      fetchPlayEventById(tournamentId),
      fetchPlayParticipants(tournamentId),
    ]);
    if (ev) { setSbMaxPlayers(ev.max_players); setSbTitle(ev.name); }
    setPlayers(parts.map(sbToRRPlayer));
    setOrganizerParticipantId(parts.find(p => p.added_by_organizer)?.id ?? null);
  }

  useFocusEffect(useCallback(() => {
    if (isSupabase) {
      setLoading(true);
      fetchSb().catch(() => {}).finally(() => setLoading(false));
    } else {
      setPlayers(getRoster(tournamentId));
    }
  }, [tournamentId, isSupabase]));

  // ── Derived ──
  const localRR    = isSupabase ? null : getRoundRobin();
  const maxPlayers = isSupabase ? sbMaxPlayers : (localRR?.maxPlayers ?? 12);
  const title      = isSupabase ? sbTitle      : (localRR?.title      ?? 'Round Robin');
  const count      = players.length;
  const spotsLeft  = Math.max(maxPlayers - count, 0);
  const isFull     = count >= maxPlayers;

  function refreshLocal() {
    const updated = getRoster(tournamentId);
    setPlayers(updated);
    updateCurrentPlayers(updated.length);
  }

  // ── Add Player ──
  const [addVisible, setAddVisible] = useState(false);

  async function handleAddPlayer(input: AddPlayerInput) {
    setAddVisible(false);
    if (isSupabase) {
      if (!user?.id) {
        Alert.alert('Sign In Required', 'You must be signed in to add players.',
          [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign In', onPress: () => router.push('/sign-in' as never) }]);
        return;
      }
      if (isFull) {
        Alert.alert('Roster Full', `This round robin has reached the maximum of ${maxPlayers} players.`);
        return;
      }
      const emailLower = input.email.trim().toLowerCase();
      const existing = await fetchPlayParticipants(tournamentId).catch(() => []);
      if (existing.some(p => p.email.toLowerCase() === emailLower)) {
        Alert.alert('Duplicate Email', 'A player with that email is already on the roster.');
        return;
      }
      try {
        await addPlayParticipant({
          event_id:           tournamentId,
          first_name:         input.name.trim(),
          email:              input.email.trim(),
          self_rating:        input.dupr?.trim() || null,
          claimed_by:         null,
          added_by_organizer: true,
        });
        setLoading(true);
        await fetchSb().catch(() => {});
        setLoading(false);
      } catch (e) {
        Alert.alert('Error', e instanceof Error ? e.message : 'Failed to add player.');
      }
      return;
    }
    const player: RRPlayer = {
      id:             `player-${Date.now()}`,
      name:           input.name,
      dupr:           input.dupr,
      city:           undefined,
      avatarInitials: makeInitials(input.name),
      status:         input.status,
    };
    addPlayer(tournamentId, player);
    refreshLocal();
  }

  // ── Test Players (local only) ──
  const [testVisible, setTestVisible] = useState(false);

  function handleAddTest(n: 4 | 8 | 12 | 16) {
    const testPlayers = buildTestPlayers(n);
    testPlayers.forEach(p => addPlayer(tournamentId, p));
    refreshLocal();
  }

  // ── Remove ──
  async function handleRemove(playerId: string) {
    if (playerId === organizerParticipantId) {
      Alert.alert('Cannot Remove Organizer', 'The event organizer cannot be removed from the roster.');
      return;
    }
    if (isSupabase) {
      if (!user?.id) return;
      try {
        await removePlayParticipant(playerId);
        setLoading(true);
        await fetchSb().catch(() => {});
        setLoading(false);
      } catch {
        Alert.alert('Error', 'Failed to remove player.');
      }
      return;
    }
    removePlayer(tournamentId, playerId);
    refreshLocal();
  }

  // ── Clear (local only) ──
  function handleClear() {
    Alert.alert(
      'Clear Roster?',
      'This will remove all players from the roster. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear Roster', style: 'destructive',
          onPress: () => { clearRoster(tournamentId); refreshLocal(); } },
      ],
    );
  }

  // ── Share ──
  async function handleShare() {
    try {
      const lines = players.map((p, i) =>
        `${i + 1}. ${p.name}${p.dupr ? ` — ${p.dupr} DUPR` : ''}`,
      ).join('\n');
      await Share.share({
        message: `${title} — Player Roster (${count}/${maxPlayers})\n\n${lines}`,
        title: `${title} Roster`,
      });
    } catch { /* dismissed */ }
  }

  // ── Context menu ──
  const [menuOpen, setMenuOpen] = useState(false);
  const menuAnim = useRef(new Animated.Value(0)).current;
  const menuOpacity     = menuAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const menuScale       = menuAnim.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] });
  const backdropOpacity = menuAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.18] });

  function openMenu() {
    setMenuOpen(true);
    Animated.timing(menuAnim, { toValue: 1, duration: 160, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }
  function closeMenu(cb?: () => void) {
    Animated.timing(menuAnim, { toValue: 0, duration: 120, easing: Easing.in(Easing.cubic), useNativeDriver: true })
      .start(() => { setMenuOpen(false); cb?.(); });
  }

  function handleMenuAction(menuId: string) {
    switch (menuId) {
      case 'share':   closeMenu(handleShare); break;
      case 'export':  closeMenu(() => comingSoon('Export Players')); break;
      // Was an unconditional "coming soon" even though
      // community/[id]/invite-players exists and round-robin-created.tsx
      // already navigates to it (item 6.2). Local rosters have nobody to
      // invite through the server, so those still fall through.
      case 'invite':  closeMenu(() => isSupabase
                        ? router.push({ pathname: '/community/[id]/invite-players' as never,
                                        params: { id: tournamentId } } as never)
                        : comingSoon('Invite Players')); break;
      case 'command': closeMenu(() => router.back()); break;
      case 'clear':   closeMenu(handleClear); break;
      default: closeMenu();
    }
  }

  // ── Loading ──
  if (loading) {
    return (
      <View style={[s.root, s.center]}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color={colors.gold} />
        <Text style={{ marginTop: 12, fontSize: 14, color: colors.textSub }}>Loading roster…</Text>
      </View>
    );
  }

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
          <Text style={s.headerSub}>Round Robin Participants</Text>
        </View>
        <View style={s.headerActions}>
          <TouchableOpacity style={s.headerIconBtn} onPress={handleShare} activeOpacity={0.7}>
            <Ionicons name="share-outline" size={20} color={L.navy} />
          </TouchableOpacity>
          <TouchableOpacity style={s.headerIconBtn} onPress={openMenu} activeOpacity={0.7}>
            <Ionicons name="ellipsis-horizontal" size={20} color={L.navy} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── SUMMARY CARD ── */}
        <View style={s.summaryCard}>
          <Text style={s.summaryTitle} numberOfLines={1}>{title}</Text>
          <View style={s.summaryRow}>
            <View style={s.summaryPills}>
              <View style={s.summaryPill}>
                <Text style={s.pillValue}>{count}</Text>
                <Text style={s.pillLabel}>Registered</Text>
              </View>
              <View style={s.pillDivider} />
              <View style={s.summaryPill}>
                <Text style={s.pillValue}>{maxPlayers}</Text>
                <Text style={s.pillLabel}>Max Players</Text>
              </View>
              <View style={s.pillDivider} />
              <View style={s.summaryPill}>
                <Text style={[s.pillValue, isFull && s.pillValueFull]}>
                  {isFull ? 'Full' : spotsLeft}
                </Text>
                <Text style={s.pillLabel}>Spots Left</Text>
              </View>
            </View>
          </View>
          <ProgressBar filled={count} total={maxPlayers} />
          <Text style={s.progressLabel}>{count} of {maxPlayers} players registered</Text>
        </View>

        {/* ── PLAYER LIST ── */}
        {players.length === 0 ? (
          <View style={s.emptyCard}>
            <View style={s.emptyIconWrap}>
              <Ionicons name="people-outline" size={28} color={L.textSub} />
            </View>
            <Text style={s.emptyTitle}>No Players Yet</Text>
            <Text style={s.emptySub}>
              {isSupabase
                ? 'Add players to this Round Robin to get started.'
                : 'Invite players to join this Round Robin or add test data to get started.'}
            </Text>
            <View style={s.emptyActions}>
              <PrimaryButton label="Add Player" icon="person-add-outline" onPress={() => setAddVisible(true)} />
              {canAddTestPlayers && (
                <SecondaryButton label="Add Test Players" icon="flask-outline" onPress={() => setTestVisible(true)} />
              )}
            </View>
          </View>
        ) : (
          <View style={s.listSection}>
            <View style={s.listHeader}>
              <Text style={s.listHeaderTitle}>Players ({count})</Text>
              <Text style={s.listHeaderHint}>Long-press for options</Text>
            </View>
            <View style={s.playerList}>
              {players.map(p => (
                <PlayerCard
                  key={p.id}
                  player={p}
                  onRemove={handleRemove}
                  isOrganizer={p.id === organizerParticipantId}
                />
              ))}
            </View>
          </View>
        )}

        {/* ── MIN PLAYERS WARNING ── */}
        {count > 0 && count < 4 && (
          <View style={s.warningCard}>
            <Ionicons name="warning-outline" size={16} color={L.gold} />
            <Text style={s.warningText}>
              At least 4 players are required to generate a schedule.
              {' '}Add {4 - count} more player{4 - count !== 1 ? 's' : ''} to continue.
            </Text>
          </View>
        )}

        {/* ── READY BANNER ── */}
        {count >= 4 && (
          <View style={s.readyCard}>
            <View style={s.readyIcon}>
              <Ionicons name="checkmark-circle" size={18} color={L.success} />
            </View>
            <View style={s.readyBody}>
              <Text style={s.readyTitle}>Ready to Generate</Text>
              <Text style={s.readySub}>
                {count} players · {count % 2 !== 0 ? count : count - 1} rounds
                {' '}· {Math.floor(count / 2) * (count % 2 !== 0 ? count : count - 1)} total matches
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* ── STICKY FOOTER ── */}
      <View style={[s.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        {players.length > 0 && canAddTestPlayers && (
          <SecondaryButton label="Add Test Players" icon="flask-outline"
            onPress={() => setTestVisible(true)} style={s.footerSecondary} />
        )}
        <PrimaryButton
          label={isFull ? 'Roster Full' : 'Add Player'}
          icon={isFull ? 'checkmark-circle-outline' : 'person-add-outline'}
          onPress={isFull
            ? () => Alert.alert('Roster Full', `This round robin has reached the maximum of ${maxPlayers} players.`)
            : () => setAddVisible(true)}
        />
      </View>

      {/* ── MODALS ── */}
      <AddPlayerModal
        visible={addVisible}
        onClose={() => setAddVisible(false)}
        onAdd={handleAddPlayer}
        requireEmail={isSupabase}
      />
      {canAddTestPlayers && (
        <TestPlayerModal
          visible={testVisible}
          onClose={() => setTestVisible(false)}
          onAdd={handleAddTest}
        />
      )}

      {/* ── CONTEXT MENU ── */}
      {menuOpen && (
        <>
          <Animated.View style={[mm.backdrop, { opacity: backdropOpacity }]} pointerEvents="none" />
          <TouchableOpacity style={[StyleSheet.absoluteFill, { zIndex: 30 }]} activeOpacity={1} onPress={() => closeMenu()} />
          <Animated.View style={[mm.popover, { top: insets.top + 52, right: 16, opacity: menuOpacity, transform: [{ scale: menuScale }] }]}>
            <View style={mm.caret} />
            {MENU_ITEMS.map((item, i) => (
              <TouchableOpacity key={item.id} style={[mm.row, i === 0 && mm.rowFirst]}
                onPress={() => handleMenuAction(item.id)} activeOpacity={0.7}>
                <View style={mm.iconWrap}>
                  <Ionicons name={item.icon as never} size={17} color={L.navy} />
                </View>
                <Text style={mm.rowLabel}>{item.label}</Text>
              </TouchableOpacity>
            ))}
            {!isSupabase && (
              <>
                <View style={mm.divider} />
                <TouchableOpacity style={mm.row} onPress={() => handleMenuAction('clear')} activeOpacity={0.7}>
                  <View style={mm.iconWrap}>
                    <Ionicons name={MENU_DANGER.icon as never} size={17} color={L.danger} />
                  </View>
                  <Text style={[mm.rowLabel, mm.rowLabelDanger]}>{MENU_DANGER.label}</Text>
                </TouchableOpacity>
              </>
            )}
          </Animated.View>
        </>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: L.page },
  center: { justifyContent: 'center', alignItems: 'center' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.screenH,
    paddingBottom: 10,
    backgroundColor: L.page,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  backBtn:       { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 60 },
  backText:      { fontSize: 17, color: '#007AFF', fontWeight: '400' },
  headerCenter:  { flex: 1, alignItems: 'center' },
  headerTitle:   { fontSize: 15, fontWeight: '800', color: L.navy },
  headerSub:     { fontSize: 11, color: L.textSub, marginTop: 1 },
  headerActions: { flexDirection: 'row', gap: 4, minWidth: 60, justifyContent: 'flex-end' },
  headerIconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },

  scroll: { paddingHorizontal: spacing.screenH, paddingTop: spacing.md, gap: 14 },

  // Summary card
  summaryCard: {
    backgroundColor: L.bg, borderRadius: radius.card,
    borderWidth: 1, borderColor: L.border, padding: spacing.md, gap: 12,
  },
  summaryTitle: { fontSize: 17, fontWeight: '900', color: L.navy },
  summaryRow:   { flexDirection: 'row' },
  summaryPills: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: L.page, borderRadius: radius.sm, padding: 12,
  },
  summaryPill:   { flex: 1, alignItems: 'center' },
  pillValue:     { fontSize: 20, fontWeight: '900', color: L.navy },
  pillValueFull: { color: L.success },
  pillLabel:     { fontSize: 11, color: L.textSub, marginTop: 2 },
  pillDivider:   { width: 1, height: 24, backgroundColor: L.border },
  progressLabel: { fontSize: 11, color: L.textSub, textAlign: 'center' },

  // Player list
  listSection: { gap: 10 },
  listHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  listHeaderTitle: { fontSize: 14, fontWeight: '800', color: L.navy },
  listHeaderHint:  { fontSize: 11, color: L.textSub },
  playerList: { gap: 8 },

  // Empty state
  emptyCard: {
    backgroundColor: L.bg, borderRadius: radius.card,
    borderWidth: 1, borderColor: L.border,
    padding: spacing.lg, alignItems: 'center', gap: 10,
  },
  emptyIconWrap: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: L.page, borderWidth: 1.5, borderColor: L.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: L.navy },
  emptySub:   { fontSize: 13, color: L.textSub, textAlign: 'center', lineHeight: 18 },
  emptyActions: { width: '100%', gap: 10, marginTop: 4 },

  // Warning card
  warningCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: L.goldLight,
    borderRadius: radius.card,
    borderWidth: 1, borderColor: L.goldBorder,
    padding: spacing.md,
  },
  warningText: { flex: 1, fontSize: 13, color: L.navy, lineHeight: 18 },

  // Ready card
  readyCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: L.successBg,
    borderRadius: radius.card,
    borderWidth: 1, borderColor: colors.success,
    padding: spacing.md,
  },
  readyIcon: { flexShrink: 0 },
  readyBody: { flex: 1 },
  readyTitle: { fontSize: 14, fontWeight: '800', color: L.navy },
  readySub:   { fontSize: 12, color: L.textSub, marginTop: 2 },

  // Footer
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: spacing.screenH, paddingTop: 12,
    backgroundColor: L.page,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: L.border,
    gap: 8,
  },
  footerSecondary: {},
});

// ─── Context menu styles ──────────────────────────────────────────────────────

const mm = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0A1228', zIndex: 30 },
  popover: {
    position: 'absolute', width: 256,
    backgroundColor: '#FFFFFF', borderRadius: 22, paddingVertical: 5, zIndex: 31,
    shadowColor: '#000', shadowOpacity: 0.13, shadowRadius: 18, shadowOffset: { width: 0, height: 8 },
    elevation: 16,
  },
  caret: {
    position: 'absolute', top: -7, right: 13, width: 0, height: 0,
    borderLeftWidth: 6, borderRightWidth: 6, borderBottomWidth: 8,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#FFFFFF',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 8, marginHorizontal: 5, borderRadius: 11, height: 50,
  },
  rowFirst:  { marginTop: 4 },
  iconWrap: {
    width: 32, height: 32, borderRadius: 9, backgroundColor: '#F3F6FC',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  rowLabel:       { color: L.navy, fontSize: 14, fontWeight: '500' },
  rowLabelDanger: { color: L.danger },
  divider: {
    height: StyleSheet.hairlineWidth, backgroundColor: L.border, marginHorizontal: 10, marginVertical: 3,
  },
});
