import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { StatusChip } from '@/components';
import { useSession } from '@/hooks/useSession';
import { requireAuth } from '@/lib/authGuard';
import { fetchTournamentById } from '@/lib/supabase/tournaments';
import {
  fetchTournamentRegistrations,
  checkInPlayer,
  undoCheckIn,
  type TournamentRegistration,
} from '@/lib/supabase/registrations';
import type { Tournament } from '@/lib/tournamentTypes';
import { DirectorOnly } from '@/components/DirectorOnly';

const L = {
  bg:        colors.bg,
  page:      colors.page,
  navy:      colors.navy,
  gold:      colors.gold,
  goldLight: colors.goldLight,
  text:      colors.text,
  textSub:   colors.textSub,
  border:    colors.border,
  success:   colors.success,
  successBg: colors.successBg,
};

function initials(name: string): string {
  return name.split(' ').map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase();
}

type CheckInFilter = 'pending' | 'all' | 'checked_in';

const FILTERS: { key: CheckInFilter; label: string }[] = [
  { key: 'pending',    label: 'Pending' },
  { key: 'all',        label: 'All'     },
  { key: 'checked_in', label: 'Done'    },
];

function CheckInRow({
  reg,
  onCheckIn,
  onUndo,
}: {
  reg: TournamentRegistration;
  onCheckIn: () => void;
  onUndo: () => void;
}) {
  const isCheckedIn = reg.status === 'checked_in';

  return (
    <View style={cr.row}>
      <View style={[cr.avatar, isCheckedIn && cr.avatarDone]}>
        {isCheckedIn
          ? <Ionicons name="checkmark" size={22} color={L.bg} />
          : <Text style={cr.avatarText}>{initials(reg.playerName)}</Text>
        }
      </View>
      <View style={cr.center}>
        <Text style={cr.name}>{reg.playerName}</Text>
        <Text style={cr.sub}>{reg.divisionName}  •  {reg.divisionLevel}</Text>
        {reg.partnerName && (
          <Text style={cr.partner}>w/ {reg.partnerName}</Text>
        )}
      </View>
      {isCheckedIn ? (
        <View style={cr.doneGroup}>
          <View style={cr.donePill}>
            <Ionicons name="checkmark-circle" size={16} color={L.success} />
            <Text style={cr.doneText}>Checked In</Text>
          </View>
          <TouchableOpacity style={cr.undoBtn} activeOpacity={0.8} onPress={onUndo}>
            <Text style={cr.undoBtnText}>Undo</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={cr.checkBtn} activeOpacity={0.85} onPress={onCheckIn}>
          <Text style={cr.checkBtnText}>Check In</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const cr = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 16, paddingVertical: 16,
    backgroundColor: L.bg,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: L.navy, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarDone: { backgroundColor: L.success },
  avatarText: { color: L.bg, fontSize: 16, fontWeight: '800' },
  center: { flex: 1, minWidth: 0 },
  name: { color: L.navy, fontSize: text.rowTitle.size, fontWeight: '700', marginBottom: 2 },
  sub: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', marginBottom: 1 },
  partner: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500' },
  doneGroup: { alignItems: 'flex-end', gap: 6 },
  donePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: L.successBg, borderRadius: shape.pill,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  doneText: { color: L.success, fontSize: text.chipValue.size, fontWeight: '800' },
  undoBtn: {
    borderWidth: 1, borderColor: colors.goldBorder, borderRadius: shape.cta,
    paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: colors.goldLight,
  },
  undoBtnText: { color: colors.gold, fontSize: text.cardLabel.size, fontWeight: '800', letterSpacing: text.cardLabel.letterSpacing },
  checkBtn: {
    backgroundColor: L.navy, borderRadius: shape.cta,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  checkBtnText: { color: L.bg, fontSize: text.action.size, fontWeight: '800' },
});

// ─── Main ─────────────────────────────────────────────────────────────────────

function CheckInScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, loading: authLoading } = useSession();

  useEffect(() => {
    if (!authLoading && !user) router.replace('/sign-in' as never);
  }, [user, authLoading]);

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [filter, setFilter]         = useState<CheckInFilter>('pending');
  const [regs, setRegs]             = useState<TournamentRegistration[]>([]);
  const [checkedIn, setCheckedIn]   = useState(0);

  const refresh = useCallback(async () => {
    const [t, allRegs] = await Promise.all([
      fetchTournamentById(id),
      fetchTournamentRegistrations(id),
    ]);
    setTournament(t);
    setRegs(allRegs);
    setCheckedIn(allRegs.filter(r => r.status === 'checked_in').length);
  }, [id]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const activeRegs = regs.filter(r => r.status !== 'cancelled' && r.status !== 'no_show');

  const displayed = filter === 'all'
    ? activeRegs
    : filter === 'checked_in'
    ? activeRegs.filter(r => r.status === 'checked_in')
    : activeRegs.filter(r => r.status !== 'checked_in');

  const total    = activeRegs.length;
  const progress = total > 0 ? checkedIn / total : 0;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={L.navy} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle} numberOfLines={1}>Check In</Text>
          <Text style={s.headerSub}>{tournament?.name ?? '...'}</Text>
        </View>
        <View style={s.progressPill}>
          <Text style={s.progressText}>{checkedIn} / {total}</Text>
        </View>
      </View>

      {/* ── Progress bar ── */}
      <View style={s.progressBarBg}>
        <View style={[s.progressBarFill, { width: `${Math.round(progress * 100)}%` as `${number}%` }]} />
      </View>

      {/* ── Scan entry ── */}
      <View style={s.scanBar}>
        <TouchableOpacity
          style={s.scanBtn}
          activeOpacity={0.85}
          onPress={() => router.push(`/tournament/${id}/check-in-scan` as never)}
          accessibilityRole="button"
          accessibilityLabel="Scan Player QR"
        >
          <Ionicons name="qr-code-outline" size={18} color={L.bg} />
          <Text style={s.scanBtnText}>Scan Player QR</Text>
        </TouchableOpacity>
      </View>

      {/* ── Filter tabs ── */}
      <View style={s.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[s.filterBtn, filter === f.key && s.filterBtnActive]}
            activeOpacity={0.7}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[s.filterLabel, filter === f.key && s.filterLabelActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── List ── */}
      {displayed.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="checkmark-done-circle-outline" size={52} color={L.textSub} />
          <Text style={s.emptyTitle}>
            {filter === 'checked_in' ? 'No one checked in yet' :
             filter === 'pending'    ? 'All players checked in!' :
                                       'No registrations'}
          </Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        >
          {displayed.map(reg => (
            <CheckInRow
              key={reg.id}
              reg={reg}
              onCheckIn={() => requireAuth(user?.id, () =>
                checkInPlayer(reg.id, id)
                  .then(() => refresh())
                  .catch((e: unknown) => {
                    Alert.alert('Could not check in', e instanceof Error ? e.message : 'Please try again.');
                    refresh();
                  }))}
              onUndo={() => {
                Alert.alert(
                  'Undo Check-In',
                  `Undo check-in for ${reg.playerName}? They will return to Registered.`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Undo',
                      style: 'destructive',
                      onPress: () => requireAuth(user?.id, () => undoCheckIn(reg.id).then(() => refresh())),
                    },
                  ],
                );
              }}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: L.bg,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800' },
  headerSub: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', marginTop: 1 },
  progressPill: {
    backgroundColor: L.navy, borderRadius: shape.pill,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  progressText: { color: L.bg, fontSize: text.chipValue.size, fontWeight: '800' },

  progressBarBg: {
    height: 4, backgroundColor: L.border,
  },
  progressBarFill: {
    height: 4, backgroundColor: L.success,
  },

  scanBar: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, backgroundColor: L.bg },
  scanBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: L.navy, borderRadius: shape.cta, paddingVertical: 13,
  },
  scanBtnText: { color: L.bg, fontSize: text.action.size, fontWeight: '800' },

  filterRow: {
    flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, gap: 8,
    backgroundColor: L.bg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  filterBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 7,
    borderRadius: shape.cta, borderWidth: 1, borderColor: L.border,
  },
  filterBtnActive: { backgroundColor: L.navy, borderColor: L.navy },
  filterLabel: { color: L.textSub, fontSize: text.controlLabel.size, fontWeight: '700' },
  filterLabelActive: { color: L.bg },

  empty: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 40,
  },
  emptyTitle: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800', textAlign: 'center' },
});

// Director-only route. The screen body above is mounted only after
// DirectorOnly confirms the signed-in user directs this tournament, so its
// effects and fetches never run for anyone else.
export default function CheckInScreenRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <DirectorOnly tournamentId={id}>
      <CheckInScreen />
    </DirectorOnly>
  );
}
