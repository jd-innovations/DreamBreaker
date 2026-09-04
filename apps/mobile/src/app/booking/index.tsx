import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors, spacing } from '@/theme';
// The design standard, straight from the shared token source both platforms
// read. See DESIGN_STANDARD.md — `shape.cta` (10) replaces the old
// `radius.button` (14) here.
import { text, radius as shape } from '@shared/tokens';
import { goBack } from '@/lib/navigation';
import { AppIcon } from '@/components';
import { useCurrentLocation } from '@/lib/location';
import {
  getBookingSearch,
  setBookingSearch,
  type BookingGameFormat,
  type BookingAssetType,
} from '@/lib/bookingStore';
import { playersNeeded } from '@/lib/supabase/reservations';

const L = {
  bg:      colors.bg,
  page:    colors.page,
  navy:    colors.navy,
  gold:    colors.gold,
  goldBg:  colors.goldBg,
  goldBorder: colors.goldBorder,
  text:    colors.text,
  textSub: colors.textSub,
  border:  colors.border,
  white:   colors.white,
};

const DOUBLES_CAPACITY = 4;
const SINGLES_CAPACITY = 2;

function capacityFor(format: BookingGameFormat): number {
  return format === 'doubles' ? DOUBLES_CAPACITY : SINGLES_CAPACITY;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function BookingSearchScreen() {
  const insets = useSafeAreaInsets();
  const initial = getBookingSearch();

  const [locationQuery, setLocationQuery] = useState(initial.locationQuery ?? '');
  const [date, setDate] = useState<Date>(initial.date ? new Date(`${initial.date}T00:00:00`) : new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [gameFormat, setGameFormat] = useState<BookingGameFormat>(initial.gameFormat);
  const [playersInGroup, setPlayersInGroup] = useState(initial.playersInGroup);
  const [assetType, setAssetType] = useState<BookingAssetType>(initial.assetTypeFilter ?? 'court');
  const [useMyLocation, setUseMyLocation] = useState(initial.locationLat != null && !initial.locationQuery);

  const location = useCurrentLocation();

  const capacity = capacityFor(gameFormat);
  const needed = playersNeeded(playersInGroup, capacity);
  const isCourt = assetType === 'court';

  function handleFormatChange(next: BookingGameFormat) {
    setGameFormat(next);
    const cap = capacityFor(next);
    if (playersInGroup > cap) setPlayersInGroup(cap);
  }

  function handleUseMyLocation() {
    setUseMyLocation(true);
    setLocationQuery('');
  }

  function handleLocationTextChange(text: string) {
    setLocationQuery(text);
    if (text.trim().length > 0) setUseMyLocation(false);
  }

  function handleSearch() {
    setBookingSearch({
      locationQuery:   locationQuery.trim() || null,
      locationLat:     useMyLocation && !location.isFallback ? location.lat : null,
      locationLng:     useMyLocation && !location.isFallback ? location.lng : null,
      date:            toIsoDate(date),
      gameFormat,
      playersInGroup,
      assetTypeFilter: assetType,
    });
    router.push('/booking/results' as never);
  }

  const playerOptions = Array.from({ length: capacity }, (_, i) => i + 1);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={s.header}>
        <TouchableOpacity style={s.iconBtn} onPress={() => goBack()} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={20} color={L.navy} />
        </TouchableOpacity>
        <Text style={s.title}>Book a Court</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">

        {/* Looking for */}
        <Text style={s.label}>Looking For</Text>
        <View style={s.segmentRow}>
          <TouchableOpacity
            style={[s.segment, isCourt && s.segmentActive]}
            activeOpacity={0.85}
            onPress={() => setAssetType('court')}
          >
            <AppIcon name="pickleball" size={16} color={isCourt ? L.gold : L.textSub} />
            <Text style={[s.segmentText, isCourt && s.segmentTextActive]}>Court</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.segment, !isCourt && s.segmentActive]}
            activeOpacity={0.85}
            onPress={() => setAssetType('ball_machine')}
          >
            <Ionicons name="disc-outline" size={16} color={!isCourt ? L.gold : L.textSub} />
            <Text style={[s.segmentText, !isCourt && s.segmentTextActive]}>Ball Machine</Text>
          </TouchableOpacity>
        </View>

        {/* Where */}
        <Text style={s.label}>Where?</Text>
        <View style={s.searchBar}>
          <Ionicons name="search-outline" size={18} color={L.textSub} />
          <TextInput
            style={s.searchInput}
            placeholder="City, state, or facility name"
            placeholderTextColor={L.textSub}
            value={locationQuery}
            onChangeText={handleLocationTextChange}
            autoCapitalize="words"
            returnKeyType="search"
          />
        </View>
        <TouchableOpacity style={s.locationChip} activeOpacity={0.8} onPress={handleUseMyLocation}>
          <Ionicons
            name={useMyLocation ? 'checkmark-circle' : 'locate-outline'}
            size={15}
            color={useMyLocation ? colors.success : L.textSub}
          />
          <Text style={[s.locationChipText, useMyLocation && { color: colors.success }]}>
            {useMyLocation ? 'Using your current location' : 'Use my current location'}
          </Text>
        </TouchableOpacity>

        {/* Date */}
        <Text style={s.label}>Date</Text>
        <TouchableOpacity style={s.dateRow} activeOpacity={0.8} onPress={() => setShowDatePicker(v => !v)}>
          <Text style={s.dateText}>{formatDate(date)}</Text>
          <Ionicons name="calendar-outline" size={18} color={L.gold} />
        </TouchableOpacity>
        {showDatePicker && (
          <DateTimePicker
            value={date}
            mode="date"
            display="spinner"
            minimumDate={new Date()}
            textColor={L.navy}
            onChange={(_, d) => { if (d) setDate(d); }}
            style={{ marginTop: 4 }}
          />
        )}

        {isCourt && (
          <>
            {/* Game Format */}
            <Text style={s.label}>Game Format</Text>
            <View style={s.segmentRow}>
              <TouchableOpacity
                style={[s.segment, gameFormat === 'doubles' && s.segmentActive]}
                activeOpacity={0.85}
                onPress={() => handleFormatChange('doubles')}
              >
                <Text style={[s.segmentText, gameFormat === 'doubles' && s.segmentTextActive]}>Doubles</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.segment, gameFormat === 'singles' && s.segmentActive]}
                activeOpacity={0.85}
                onPress={() => handleFormatChange('singles')}
              >
                <Text style={[s.segmentText, gameFormat === 'singles' && s.segmentTextActive]}>Singles</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.captionCenter}>
              {gameFormat === 'doubles' ? 'Doubles = 4 total players' : 'Singles = 2 total players'}
            </Text>

            {/* Players in group */}
            <Text style={s.label}>How many players are in your group?</Text>
            <View style={s.playersRow}>
              {playerOptions.map(n => (
                <TouchableOpacity
                  key={n}
                  style={[s.playerPill, playersInGroup === n && s.playerPillActive]}
                  activeOpacity={0.85}
                  onPress={() => setPlayersInGroup(n)}
                >
                  <Text style={[s.playerPillText, playersInGroup === n && s.playerPillTextActive]}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {needed > 0 && (
              <View style={s.helperBanner}>
                <Text style={s.helperText}>
                  You&apos;re looking for {needed} more {needed === 1 ? 'player' : 'players'} to complete your {gameFormat} game.
                </Text>
              </View>
            )}
          </>
        )}

        <TouchableOpacity style={s.primaryBtn} activeOpacity={0.88} onPress={handleSearch}>
          <Text style={s.primaryBtnText}>{isCourt ? 'Find Courts' : 'Find Ball Machines'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.screenH, paddingVertical: spacing.screenV,
  },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title:   { color: L.navy, fontSize: text.sectionTitle.size, fontWeight: '900' },

  body: { paddingHorizontal: spacing.screenH, paddingBottom: 24 },

  label: {
    color: L.navy, fontSize: text.fieldLabel.size, fontWeight: '800',
    marginTop: spacing.xl, marginBottom: spacing.sm,
  },

  segmentRow: { flexDirection: 'row', gap: spacing.sm },
  segment: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderColor: L.border, borderRadius: shape.cta,
    paddingVertical: 12,
  },
  segmentActive:    { borderColor: L.gold, backgroundColor: L.goldBg },
  // controlLabel, matching the identical Courts/Ball Machines toggle on Choose
  // Time and facility detail. This screen was migrated before controlLabel
  // existed and took `body` as the nearest value up, which left the same
  // control rendering three points and two weights apart within one flow.
  segmentText:      { color: L.textSub, fontSize: text.controlLabel.size, fontWeight: '700' },
  // State variant (decision 9): the base weight is now 700, so the selected
  // one moves to 800 to stay distinguishable.
  segmentTextActive:{ color: L.navy, fontWeight: '800' },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: L.border, borderRadius: shape.cta,
    paddingHorizontal: 14, paddingVertical: 12, backgroundColor: L.page,
  },
  searchInput: { flex: 1, color: L.text, fontSize: text.body.size },

  locationChip: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm, paddingVertical: 4 },
  locationChipText: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500' },

  dateRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: L.border, borderRadius: shape.cta,
    paddingHorizontal: 14, paddingVertical: 14, backgroundColor: L.page,
  },
  dateText: { color: L.text, fontSize: text.body.size, fontWeight: '500' },

  // Was 11/500. Decision 2026-09-03: the 11/400-500 tier folds into `caption`.
  captionCenter: {
    color: L.textSub, fontSize: text.caption.size, fontWeight: '500',
    textAlign: 'center', marginTop: spacing.sm,
  },

  playersRow: { flexDirection: 'row', gap: spacing.sm },
  playerPill: {
    width: 52, height: 52, borderRadius: shape.cta, borderWidth: 1.5, borderColor: L.border,
    alignItems: 'center', justifyContent: 'center',
  },
  playerPillActive:    { borderColor: L.navy, backgroundColor: L.navy },
  playerPillText:      { color: L.text, fontSize: text.actionLarge.size, fontWeight: '800' },
  playerPillTextActive:{ color: L.white },

  helperBanner: {
    backgroundColor: L.goldBg, borderWidth: 1, borderColor: L.goldBorder,
    borderRadius: shape.card, padding: spacing.md, marginTop: spacing.lg,
  },
  helperText: { color: L.navy, fontSize: text.action.size, fontWeight: '800', lineHeight: 18 },

  primaryBtn: {
    backgroundColor: L.navy, borderRadius: shape.cta,
    paddingVertical: 16, alignItems: 'center', marginTop: spacing.xxl,
  },
  primaryBtnText: { color: L.white, fontSize: text.actionLarge.size, fontWeight: '800' },
});
