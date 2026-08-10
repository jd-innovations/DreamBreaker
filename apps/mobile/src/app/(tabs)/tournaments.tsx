import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, FlatList, TouchableOpacity, Pressable,
  ActivityIndicator, Modal, Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors, typography, radius } from '@/theme';
import { StatusChip, FIND_GAMES_SKILL_RANGES } from '@/components';
import { useSlideMenu } from '@/components/SlideMenu';
import { type Tournament } from '@/lib/tournamentTypes';
import { fetchTournaments } from '@/lib/supabase/tournaments';
import { fetchPlayerHolds, fetchPlayerRegistrations } from '@/lib/supabase/registrations';
import { useSession } from '@/hooks/useSession';
import {
  getTournamentStatus,
  getTournamentStatusInfo,
  getPlayerRegStatusInfo,
  type PlayerRegStatusKey,
} from '@/lib/tournamentStatus';

const FILTERS = ['All', 'Open', 'Filling Fast', '$5k+ Prize'];
const DEFAULT_FILTER = 'Open';

type SortKey = 'recommended' | 'prize' | 'entryLow' | 'spotsLeft';
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'recommended', label: 'Recommended' },
  { key: 'prize',       label: 'Prize (high to low)' },
  { key: 'entryLow',    label: 'Entry fee (low to high)' },
  { key: 'spotsLeft',   label: 'Most spots left' },
];

// A tournament matches the selected skill ranges if its [skillMin, skillMax]
// DUPR band overlaps ANY chosen range. A 0–0 band means "no range set" and,
// like Find Games, always shows. Empty selection = show all.
function matchesSkill(t: Tournament, selectedLabels: string[]): boolean {
  if (selectedLabels.length === 0) return true;
  if (t.skillMin === 0 && t.skillMax === 0) return true;
  return FIND_GAMES_SKILL_RANGES.some((r) => {
    if (!selectedLabels.includes(r.label)) return false;
    const rMax = r.max ?? Infinity;
    return r.min <= t.skillMax && rMax >= t.skillMin;
  });
}

function sortTournaments(list: Tournament[], sort: SortKey): Tournament[] {
  if (sort === 'recommended') return list;
  const arr = [...list];
  if (sort === 'prize')    arr.sort((a, b) => (b.prizePoolCents ?? 0) - (a.prizePoolCents ?? 0));
  if (sort === 'entryLow') arr.sort((a, b) => a.entryFeeCents - b.entryFeeCents);
  if (sort === 'spotsLeft') arr.sort((a, b) => (b.drawSize - b.spotsFilled) - (a.drawSize - a.spotsFilled));
  return arr;
}

function fmt(cents: number) { return `$${(cents / 100).toFixed(0)}`; }

function TournamentCard({ t, playerStatus }: { t: Tournament; playerStatus?: PlayerRegStatusKey | null }) {
  const fillPct = Math.round((t.spotsFilled / t.drawSize) * 100);
  const spotsLeft = t.drawSize - t.spotsFilled;
  const tStatus = getTournamentStatus(t);
  const st = getTournamentStatusInfo(tStatus);
  const ps = playerStatus ? getPlayerRegStatusInfo(playerStatus) : null;
  // Completed tournaments are view-only — no holding or registering possible.
  const isCompleted = tStatus === 'completed';
  const isClosed = tStatus === 'registration_closed';
  const ctaMuted = isCompleted || isClosed;
  const ctaLabel =
    isCompleted ? 'VIEW RESULTS'
      : isClosed ? 'JOIN WAITLIST'
      : playerStatus === 'registered' || playerStatus === 'checked_in' ? 'VIEW REGISTRATION'
      : playerStatus === 'held' ? 'COMPLETE REGISTRATION'
      : 'VIEW & HOLD SPOT';
  return (
    <Pressable
      style={({ pressed }) => [s2.card, pressed && { opacity: 0.85 }]}
      onPress={() => router.push(`/tournament/${t.id}` as never)}
    >
      <View style={s2.cardHeader}>
        <View style={{ flex: 1, marginRight: 10 }}>
          <Text style={s2.cardName} numberOfLines={1}>{t.name.toUpperCase()}</Text>
          <Text style={s2.cardSub}>{t.venue} · {t.city}, {t.state}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          {ps && <StatusChip label={ps.label} variant={ps.variant} />}
          <StatusChip label={st.label} variant={st.variant} />
        </View>
      </View>
      <View style={s2.metaRow}>
        <Ionicons name="calendar-outline" size={12} color={colors.textSub} />
        <Text style={s2.metaText}>{t.date}</Text>
        <Text style={s2.dot}>·</Text>
        <Ionicons name="speedometer-outline" size={12} color={colors.textSub} />
        <Text style={s2.metaText}>{t.skillMin}–{t.skillMax} DUPR</Text>
      </View>
      <View style={s2.divider} />
      <View style={s2.feeRow}>
        <View style={s2.feeBlock}>
          <Text style={s2.feeLabel}>ENTRY</Text>
          <Text style={s2.feeValue}>{fmt(t.entryFeeCents)}</Text>
        </View>
        <View style={s2.feeBlock}>
          <Text style={s2.feeLabel}>HOLD</Text>
          <Text style={s2.feeValue}>{fmt(t.holdFeeCents)}</Text>
        </View>
        {t.prizePoolCents != null && (
          <View style={s2.prizeBlock}>
            <Ionicons name="trophy" size={11} color={colors.gold} />
            <Text style={s2.prizeValue}>{fmt(t.prizePoolCents)}</Text>
          </View>
        )}
        <View style={{ flex: 1, alignItems: 'flex-end', flexDirection: 'row', gap: 4, justifyContent: 'flex-end' }}>
          {t.formats.map((f, i) => (
            <View key={`${f}-${i}`} style={s2.fmtChip}>
              <Text style={s2.fmtText}>{f}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={s2.fillRow}>
        <View style={s2.fillTrack}>
          <View style={[s2.fillBar, {
            width: `${fillPct}%` as `${number}%`,
            backgroundColor: fillPct >= 90 ? colors.danger : fillPct >= 70 ? colors.gold : colors.success,
          }]} />
        </View>
        <Text style={s2.fillLabel}>{t.status === 'full' ? 'WAITLIST' : `${spotsLeft} left`}</Text>
      </View>
      <TouchableOpacity
        style={[s2.cta, ctaMuted && s2.ctaFull]}
        onPress={() => router.push(`/tournament/${t.id}` as never)}
      >
        <Text style={[s2.ctaText, ctaMuted && s2.ctaTextFull]}>{ctaLabel}</Text>
        <Ionicons
          name="arrow-forward" size={14}
          color={ctaMuted ? colors.textSub : colors.white}
        />
      </TouchableOpacity>
    </Pressable>
  );
}

export default function TournamentsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const { setTriggerVisible } = useSlideMenu();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState(DEFAULT_FILTER);
  const [sort, setSort] = useState<SortKey>('recommended');
  const [selectedSkillLabels, setSelectedSkillLabels] = useState<string[]>([]);
  const [hideFull, setHideFull] = useState(false);
  const [filterModalVisible, setFilterModalVisible] = useState(false);

  const toggleSkill = (label: string) =>
    setSelectedSkillLabels((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [playerStatusMap, setPlayerStatusMap] = useState<Record<string, PlayerRegStatusKey | null>>({});

  // Hide the global SlideMenu hamburger on this screen — navigation here is via
  // the bottom tab bar, and the floating trigger overlapped the page title.
  useFocusEffect(useCallback(() => {
    setTriggerVisible(false);
    return () => setTriggerVisible(true);
  }, [setTriggerVisible]));

  useEffect(() => {
    fetchTournaments()
      .then(setTournaments)
      .catch(() => setTournaments([]))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => {
    if (!user?.id) return;
    Promise.all([fetchPlayerHolds(user.id), fetchPlayerRegistrations(user.id)]).then(([holds, regs]) => {
      const map: Record<string, PlayerRegStatusKey | null> = {};
      for (const r of regs) {
        const cur = map[r.tournamentId];
        const next: PlayerRegStatusKey =
          r.status === 'checked_in' ? 'checked_in' :
          r.status === 'waitlisted' ? 'waitlisted' :
          'registered';
        if (!cur || next === 'checked_in' || (next === 'registered' && cur !== 'checked_in')) {
          map[r.tournamentId] = next;
        }
      }
      for (const h of holds) {
        if (!map[h.tournamentId]) map[h.tournamentId] = 'held';
      }
      setPlayerStatusMap(map);
    });
  }, [user?.id]));

  const filtered = tournaments.filter((t) => {
    const q = t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.city.toLowerCase().includes(search.toLowerCase());
    // Use the derived status, not the raw record status — completed/past events
    // still carry a raw status of 'open' and must not leak into the Open filter.
    const dStatus = getTournamentStatus(t);
    if (!q) return false;
    if (!matchesSkill(t, selectedSkillLabels)) return false;
    if (hideFull && t.spotsFilled >= t.drawSize) return false;
    if (filter === 'Open') return dStatus === 'open';
    if (filter === 'Filling Fast') return dStatus === 'filling_fast' || dStatus === 'closing_soon';
    if (filter === '$5k+ Prize') return (t.prizePoolCents ?? 0) >= 500000;
    return true;
  });
  const data = sortTournaments(filtered, sort);
  const filtersActive =
    filter !== DEFAULT_FILTER || sort !== 'recommended' ||
    selectedSkillLabels.length > 0 || hideFull;

  return (
    <View style={[s2.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <View style={s2.header}>
        <Text style={s2.title}>Tournaments</Text>
        <TouchableOpacity
          style={s2.notifBtn}
          onPress={() => setFilterModalVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Filter and sort tournaments"
        >
          <Ionicons name="options-outline" size={20} color={colors.navy} />
          {filtersActive && <View style={s2.filterDot} />}
        </TouchableOpacity>
      </View>
      <View style={s2.searchRow}>
        <Ionicons name="search-outline" size={15} color={colors.textSub} style={{ marginRight: 8 }} />
        <TextInput
          style={s2.searchInput}
          placeholder="Search tournaments, cities…"
          placeholderTextColor={colors.textSub}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={15} color={colors.textSub} />
          </Pressable>
        )}
      </View>
      <View style={s2.filterRow}>
        {FILTERS.map((f) => (
          <Pressable
            key={f}
            style={[s2.chip, filter === f && s2.chipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[s2.chipText, filter === f && s2.chipTextActive]}>{f}</Text>
          </Pressable>
        ))}
      </View>
      {loading ? (
        <View style={s2.loadingWrap}>
          <ActivityIndicator color={colors.gold} size="large" />
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(t) => t.id}
          renderItem={({ item }) => <TournamentCard t={item} playerStatus={playerStatusMap[item.id]} />}
          extraData={playerStatusMap}
          contentContainerStyle={[s2.list, { paddingBottom: insets.bottom + 16 }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={s2.empty}>
              <Ionicons name="search" size={38} color={colors.textSub} />
              <Text style={s2.emptyText}>No tournaments found</Text>
            </View>
          }
        />
      )}

      <Modal
        visible={filterModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <Pressable style={s2.modalOverlay} onPress={() => setFilterModalVisible(false)}>
          <Pressable
            style={[s2.modalSheet, { paddingBottom: insets.bottom + 12 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={s2.modalHandle} />
            <View style={s2.modalTitleRow}>
              <Text style={s2.modalTitle}>Filter & Sort</Text>
              {filtersActive && (
                <Pressable
                  onPress={() => {
                    setFilter(DEFAULT_FILTER);
                    setSort('recommended');
                    setSelectedSkillLabels([]);
                    setHideFull(false);
                  }}
                >
                  <Text style={s2.modalReset}>Reset</Text>
                </Pressable>
              )}
            </View>

            <Text style={s2.modalSectionLabel}>Show</Text>
            <View style={s2.optionsWrap}>
              {FILTERS.map((f) => {
                const active = filter === f;
                return (
                  <Pressable
                    key={f}
                    style={[s2.optionChip, active && s2.optionChipActive]}
                    onPress={() => setFilter(f)}
                  >
                    <Text style={[s2.optionChipText, active && s2.optionChipTextActive]}>{f}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={s2.modalSectionLabel}>Skill level (DUPR)</Text>
            <View style={s2.optionsWrap}>
              {FIND_GAMES_SKILL_RANGES.map((r) => {
                const active = selectedSkillLabels.includes(r.label);
                return (
                  <Pressable
                    key={r.label}
                    style={[s2.optionChip, active && s2.optionChipActive]}
                    onPress={() => toggleSkill(r.label)}
                  >
                    {active && <Ionicons name="checkmark" size={13} color={colors.gold} style={{ marginRight: 4 }} />}
                    <Text style={[s2.optionChipText, active && s2.optionChipTextActive]}>{r.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={s2.modalHint}>Leave blank for all levels. Tournaments with no skill range set always show.</Text>

            <Text style={s2.modalSectionLabel}>Sort by</Text>
            <View style={s2.optionsWrap}>
              {SORTS.map((o) => {
                const active = sort === o.key;
                return (
                  <Pressable
                    key={o.key}
                    style={[s2.optionChip, active && s2.optionChipActive]}
                    onPress={() => setSort(o.key)}
                  >
                    <Text style={[s2.optionChipText, active && s2.optionChipTextActive]}>{o.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={s2.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={s2.toggleLabel}>Hide full tournaments</Text>
                <Text style={s2.toggleSub}>Only show tournaments with open spots</Text>
              </View>
              <Switch
                value={hideFull}
                onValueChange={setHideFull}
                trackColor={{ false: colors.border, true: colors.gold }}
                thumbColor="#FFFFFF"
              />
            </View>

            <TouchableOpacity style={s2.applyBtn} onPress={() => setFilterModalVisible(false)}>
              <Text style={s2.applyBtnText}>Show {data.length} tournament{data.length === 1 ? '' : 's'}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const s2 = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.page },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingLeft: 20, paddingRight: 20, paddingBottom: 12, paddingTop: 8,
  },
  title: { ...typography.pageTitle, color: colors.navy },
  notifBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: colors.bg,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
  },
  filterDot: {
    position: 'absolute', top: 8, right: 8,
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.gold, borderWidth: 1, borderColor: colors.bg,
  },
  // ── Filter / sort modal ──
  modalOverlay: { flex: 1, backgroundColor: 'rgba(10,18,40,0.45)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 12,
  },
  modalHandle: {
    alignSelf: 'center', width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.border, marginBottom: 16,
  },
  modalTitleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16,
  },
  modalTitle: { ...typography.pageTitle, color: colors.navy, fontSize: 20 },
  modalReset: { color: colors.gold, fontSize: 13, fontWeight: '700' },
  modalSectionLabel: {
    color: colors.textSub, fontSize: 11, fontWeight: '800', letterSpacing: 0.6,
    textTransform: 'uppercase', marginBottom: 10,
  },
  optionsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  optionChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12,
    backgroundColor: colors.page, borderWidth: 1, borderColor: colors.border,
  },
  optionChipActive: { backgroundColor: colors.goldBg, borderColor: colors.gold },
  optionChipText: { color: colors.textSub, fontSize: 13, fontWeight: '700' },
  optionChipTextActive: { color: colors.gold },
  modalHint: { color: colors.textSub, fontSize: 11, marginTop: -12, marginBottom: 20 },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, marginBottom: 20,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  toggleLabel: { color: colors.navy, fontSize: 14, fontWeight: '700' },
  toggleSub: { color: colors.textSub, fontSize: 12, marginTop: 2 },
  applyBtn: {
    backgroundColor: colors.navy, borderRadius: radius.button, paddingVertical: 15,
    alignItems: 'center', marginBottom: 8,
  },
  applyBtnText: { color: colors.white, fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: 16,
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.button, paddingHorizontal: 14, height: 44, marginBottom: 12,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 14 },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 12 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 18,
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.goldBg, borderColor: colors.gold },
  chipText: { color: colors.textSub, fontSize: 11, fontWeight: '700' },
  chipTextActive: { color: colors.gold },
  list: { paddingHorizontal: 16, gap: 12 },
  card: {
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.card, padding: 16,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  cardName: { color: colors.text, fontSize: 18, fontWeight: '800', lineHeight: 23, marginBottom: 3 },
  cardSub: { color: colors.textSub, fontSize: 11, fontWeight: '500' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 12 },
  metaText: { color: colors.textSub, fontSize: 11, fontWeight: '600' },
  dot: { color: colors.textSub },
  divider: { height: 1, backgroundColor: colors.border, marginBottom: 12 },
  feeRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 },
  feeBlock: {},
  feeLabel: { color: colors.textSub, fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  feeValue: { color: colors.text, fontSize: 15, fontWeight: '800' },
  prizeBlock: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.goldBg, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  prizeValue: { color: colors.gold, fontSize: 13, fontWeight: '800' },
  fmtChip: {
    paddingHorizontal: 6, paddingVertical: 2,
    backgroundColor: colors.page, borderRadius: 5, borderWidth: 1, borderColor: colors.border,
  },
  fmtText: { color: colors.textSub, fontSize: 9, fontWeight: '700' },
  fillRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  fillTrack: { flex: 1, height: 4, backgroundColor: colors.page, borderRadius: 2, overflow: 'hidden' },
  fillBar: { height: '100%', borderRadius: 2 },
  fillLabel: { color: colors.textSub, fontSize: 10, fontWeight: '700' },
  cta: {
    backgroundColor: colors.navy, borderRadius: radius.button, paddingVertical: 13,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  ctaFull: { backgroundColor: colors.page },
  ctaText: { color: colors.white, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  ctaTextFull: { color: colors.textSub },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { color: colors.textSub, fontSize: 14, fontWeight: '600' },
});
