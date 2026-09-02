import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useJoinFeePayment, joinFeeErrorMessage } from '@/lib/payments/joinFeePayment';
import { colors, spacing, radius } from '@/theme';
import { goBack } from '@/lib/navigation';
import { StatusChip, type StatusVariant } from '@/components';
import { fetchCourts, type Court } from '@/lib/supabase/courts';
import { fetchBallMachines, type BallMachine } from '@/lib/supabase/ballMachines';
import { fetchFlashDealsForFacility, type FlashDeal } from '@/lib/supabase/flashDeals';
import { fetchOperatingHours } from '@/lib/supabase/operatingHours';
import {
  fetchAssetAvailability,
  createReservation,
  joinReservation,
  projectedOccupancy,
  occupancyStatusLabel,
  type AssetAvailabilitySlot,
  type Reservation,
} from '@/lib/supabase/reservations';
import {
  getBookingSearch,
  getBookingFacility,
  setBookingSelection,
  setBookingReservationId,
} from '@/lib/bookingStore';

const L = {
  bg: colors.bg, page: colors.page, navy: colors.navy, gold: colors.gold,
  goldBg: colors.goldBg, goldBorder: colors.goldBorder, text: colors.text,
  textSub: colors.textSub, border: colors.border, white: colors.white,
};

type AssetKind = 'court' | 'ball_machine';

type AssetInfo = {
  id: string;
  kind: AssetKind;
  name: string;
  subtitle: string | null;
  hourlyRateCents: number | null;
};

type RowState = {
  available: boolean;
  label: string;
  variant: StatusVariant;
  current: number | null;   // null for ball machines -- no occupancy concept
  max: number | null;
  projected: number | null;
  fitsGroup: boolean;       // whether the incoming group fully fits this slot
  reservationId: string | null; // set only when joining an existing court game
};

type SuccessState = {
  action: 'created' | 'joined';
  reservationId: string;
  assetName: string;
  startsAt: string;
  endsAt: string;
  finalPriceCents: number | null;
  holdExpiresAt: string | null;
};

const DEFAULT_HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

const RPC_ERROR_MESSAGES: Record<string, string> = {
  not_authenticated: 'Please sign in to book a court.',
  invalid_asset_type: 'This asset type is not bookable.',
  asset_not_found: 'This court or ball machine is no longer available at this facility.',
  invalid_game_format_for_ball_machine: 'Ball machines do not use a game format.',
  game_format_required: 'Please choose singles or doubles before booking a court.',
  slot_unavailable: 'That time was just booked by someone else. Please pick another slot.',
  reservation_not_found: 'That game no longer exists.',
  reservation_not_joinable: 'That game is no longer open to join.',
  hold_expired: 'That hold expired. Please pick another slot.',
  reservation_full: 'That game just filled up. Please pick another slot.',
  already_joined: "You're already in that game.",
};

function showRpcError(e: unknown) {
  const code = e instanceof Error ? e.message : 'unknown_error';
  Alert.alert('Could Not Book', RPC_ERROR_MESSAGES[code] ?? 'Something went wrong. Please try again.');
}

function todayIsoDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatHourLabel(hour: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${period}`;
}

function formatDateHeader(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// Spec: default 1 hour, maximum 4 (BOOKING_ENGINE_V1_SPEC.md, Reservation
// Rules). create_reservation enforces the same ceiling server-side.
const MAX_BOOKING_HOURS = 4;
const DURATION_OPTIONS = [1, 2, 3, 4] as const;

function hourRange(dateStr: string, hour: number, hours = 1): { startsAt: string; endsAt: string } {
  const start = new Date(`${dateStr}T${String(hour).padStart(2, '0')}:00:00`);
  const end = new Date(start.getTime() + hours * 60 * 60 * 1000);
  return { startsAt: start.toISOString(), endsAt: end.toISOString() };
}

// Client-side preview only -- mirrors reservation_best_flash_deal()'s "max
// discount among active deals covering this instant" logic so the price
// shown here matches what create_reservation() will actually charge. The
// server always recomputes and snapshots the real price at creation time;
// this never needs to be authoritative, only accurate as a preview.
function bestFlashDealPercent(deals: FlashDeal[], kind: AssetKind, assetId: string, atIso: string): number | null {
  const at = new Date(atIso).getTime();
  let best: number | null = null;
  for (const d of deals) {
    if (d.owner_type !== kind || d.owner_id !== assetId || !d.is_active) continue;
    const starts = new Date(d.starts_at).getTime();
    const ends = new Date(d.ends_at).getTime();
    if (at >= starts && at < ends && (best == null || d.discount_percent > best)) best = d.discount_percent;
  }
  return best;
}

function findSlotAt(
  slots: AssetAvailabilitySlot[], dateStr: string, hour: number, hours = 1,
): AssetAvailabilitySlot | null {
  const { startsAt, endsAt } = hourRange(dateStr, hour, hours);
  const spanStart = new Date(startsAt).getTime();
  const spanEnd = new Date(endsAt).getTime();
  // Any overlap anywhere in the span. A 3-hour booking is blocked by something
  // sitting in its third hour just as surely as in its first — the server's
  // exclusion constraint would reject it, and finding that out at the end of
  // the flow is the worst place to learn it.
  return slots.find(s =>
    new Date(s.startsAt).getTime() < spanEnd && new Date(s.endsAt).getTime() > spanStart) ?? null;
}

/**
 * The longest booking that fits from this hour: stops at the first hour that
 * is occupied, at the facility's closing hour, or at the 4-hour ceiling.
 */
function maxHoursFrom(
  slots: AssetAvailabilitySlot[], dateStr: string, hour: number, openHours: number[],
): number {
  let n = 0;
  for (let h = 1; h <= MAX_BOOKING_HOURS; h++) {
    const covered = hour + h - 1;
    if (!openHours.includes(covered)) break;
    if (findSlotAt(slots, dateStr, covered, 1)) break;
    n = h;
  }
  return n;
}

function computeRowState(
  kind: AssetKind,
  slot: AssetAvailabilitySlot | null,
  playersInGroup: number,
  newGameMax: number,
): RowState {
  if (kind === 'ball_machine') {
    return slot
      ? { available: false, label: 'Booked', variant: 'gray', current: null, max: null, projected: null, fitsGroup: true, reservationId: null }
      : { available: true, label: 'Available', variant: 'green', current: null, max: null, projected: null, fitsGroup: true, reservationId: null };
  }

  if (!slot) {
    return {
      available: true,
      label: 'Starting New Game',
      variant: 'gold',
      current: 0,
      max: newGameMax,
      projected: Math.min(playersInGroup, newGameMax),
      fitsGroup: playersInGroup <= newGameMax,
      reservationId: null,
    };
  }

  const { currentPlayers: current, maxPlayers: max } = slot;
  if (current >= max) {
    return { available: false, label: 'Game Complete', variant: 'navy', current, max, projected: current, fitsGroup: false, reservationId: slot.reservationId };
  }

  const projected = projectedOccupancy(current, playersInGroup);
  return {
    available: true,
    label: occupancyStatusLabel(current, max),
    variant: 'gold',
    current, max, projected,
    fitsGroup: projected <= max,
    reservationId: slot.reservationId,
  };
}

export default function ChooseTimeScreen() {
  const insets = useSafeAreaInsets();
  const search = getBookingSearch();
  const facility = getBookingFacility();
  const dateStr = search.date ?? todayIsoDate();
  const newGameMax = search.gameFormat === 'doubles' ? 4 : 2;

  const [inventoryTab, setInventoryTab] = useState<AssetKind>(
    (search.assetTypeFilter as AssetKind | null) ?? 'court',
  );
  const [courts, setCourts] = useState<Court[]>([]);
  const [ballMachines, setBallMachines] = useState<BallMachine[]>([]);
  const [deals, setDeals] = useState<FlashDeal[]>([]);
  const [availability, setAvailability] = useState<Record<string, AssetAvailabilitySlot[]>>({});
  // Starts empty (not DEFAULT_HOURS) so the hour-selection effect below never
  // locks onto the fallback range before the real operating-hours fetch
  // resolves -- otherwise "7 AM" (DEFAULT_HOURS[0]) wins the race against a
  // facility that actually opens at 6 AM.
  const [hours, setHours] = useState<number[]>([]);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [durationHours, setDurationHours] = useState(1);
  // Slots the booker is taking = the group size they already chose on the
  // search screen ("How many players are in your group?"). Asking again here
  // was a duplicate of that question, and letting the two disagree meant
  // someone could say 3 players and be charged for 1.
  const slotCount = search.playersInGroup;
  const { payJoinFee } = useJoinFeePayment();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionAssetId, setActionAssetId] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessState | null>(null);

  useEffect(() => {
    if (!facility.facilityId) { setError('No facility selected.'); setLoading(false); return; }
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [courtRows, machineRows, dealRows, hoursRows] = await Promise.all([
          fetchCourts(facility.facilityId!),
          fetchBallMachines(facility.facilityId!),
          fetchFlashDealsForFacility(facility.facilityId!),
          fetchOperatingHours('facility', facility.facilityId!),
        ]);
        if (cancelled) return;

        setCourts(courtRows);
        setBallMachines(machineRows);
        setDeals(dealRows);

        const dow = new Date(`${dateStr}T00:00:00`).getDay();
        const today = hoursRows.find(h => h.day_of_week === dow);
        if (today && !today.is_closed && today.open_time && today.close_time) {
          const openH = parseInt(today.open_time.slice(0, 2), 10);
          const closeH = parseInt(today.close_time.slice(0, 2), 10);
          const list = [];
          for (let h = openH; h < closeH; h++) list.push(h);
          setHours(list.length > 0 ? list : DEFAULT_HOURS);
        } else if (today?.is_closed) {
          setHours([]);
        } else {
          setHours(DEFAULT_HOURS);
        }

        const allAssets = [
          ...courtRows.map(c => ({ id: c.id, kind: 'court' as const })),
          ...machineRows.map(m => ({ id: m.id, kind: 'ball_machine' as const })),
        ];
        const slotsByAsset = await Promise.all(
          allAssets.map(a => fetchAssetAvailability(a.kind, a.id, dateStr).catch(() => [])),
        );
        if (cancelled) return;
        const map: Record<string, AssetAvailabilitySlot[]> = {};
        allAssets.forEach((a, i) => { map[a.id] = slotsByAsset[i]; });
        setAvailability(map);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load availability.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [facility.facilityId, dateStr]);

  useEffect(() => {
    if (selectedHour == null && hours.length > 0) setSelectedHour(hours[0]);
  }, [hours, selectedHour]);


  const primaryAssets: AssetInfo[] = useMemo(() => (
    inventoryTab === 'court'
      ? courts.map(c => ({ id: c.id, kind: 'court' as const, name: c.name, subtitle: c.indoor_outdoor === 'indoor' ? 'Indoor' : 'Outdoor', hourlyRateCents: c.hourly_rate_cents }))
      : ballMachines.map(m => ({ id: m.id, kind: 'ball_machine' as const, name: m.name, subtitle: m.description, hourlyRateCents: m.hourly_rate_cents }))
  ), [inventoryTab, courts, ballMachines]);

  const otherAssets: AssetInfo[] = useMemo(() => (
    inventoryTab === 'court'
      ? ballMachines.map(m => ({ id: m.id, kind: 'ball_machine' as const, name: m.name, subtitle: m.description, hourlyRateCents: m.hourly_rate_cents }))
      : courts.map(c => ({ id: c.id, kind: 'court' as const, name: c.name, subtitle: c.indoor_outdoor === 'indoor' ? 'Indoor' : 'Outdoor', hourlyRateCents: c.hourly_rate_cents }))
  ), [inventoryTab, courts, ballMachines]);

  // Keep the duration honest when the hour changes. A 4-hour choice carried
  // over to an hour where only 1 fits would be rejected by the server's
  // exclusion constraint at the very end of the flow; clamping it here means
  // the picker never shows a selection that cannot be booked.
  useEffect(() => {
    if (selectedHour == null) return;
    const best = Math.max(
      1,
      ...[...primaryAssets, ...otherAssets].map(a =>
        maxHoursFrom(availability[a.id] ?? [], dateStr, selectedHour, hours)),
    );
    setDurationHours(d => (d > best ? best : d));
  }, [selectedHour, availability, dateStr, hours, primaryAssets, otherAssets]);

  async function handleBook(asset: AssetInfo, row: RowState, slot: AssetAvailabilitySlot | null) {
    if (selectedHour == null || actionAssetId != null) return;

    const doIt = async () => {
      setActionAssetId(asset.id);
      // A join takes the existing reservation's window; a new booking takes the
      // picked duration.
      const { startsAt, endsAt } = row.reservationId && slot
        ? { startsAt: slot.startsAt, endsAt: slot.endsAt }
        : hourRange(dateStr, selectedHour, durationHours);
      try {
        if (row.reservationId) {
          // Existing joinable court game -- join only seats this one
          // authenticated user; the rest of their group is invited in the
          // (not-yet-built) Find Players step.
          // join_reservation HOLDS the seat and records the fee owed; the
          // charge follows. Holding first is what stops two people paying for
          // the last seat.
          await joinReservation(row.reservationId, slotCount);

          const outcome = await payJoinFee(row.reservationId, `${Date.now()}`);
          if (outcome.status === 'canceled') {
            // The held seat is left to the sweeper rather than deleted here —
            // they may simply retry, and the hold is what keeps it theirs.
            Alert.alert('Not joined', 'Your seat is held for 10 minutes if you want to try again.');
            return;
          }
          if (outcome.status === 'failed' || outcome.status === 'error') {
            Alert.alert(
              'Could not join',
              outcome.status === 'failed'
                ? outcome.message
                : joinFeeErrorMessage(outcome.code),
            );
            return;
          }

          const discount = bestFlashDealPercent(deals, asset.kind, asset.id, startsAt);
          // Joining inherits the existing game's length — the duration picker
          // describes a NEW booking and must not reprice someone else's.
          const joinHours = slot
            ? (new Date(slot.endsAt).getTime() - new Date(slot.startsAt).getTime()) / 3_600_000
            : 1;
          const finalPriceCents = asset.hourlyRateCents != null
            ? Math.round(asset.hourlyRateCents * joinHours * (100 - (discount ?? 0)) / 100)
            : null;
          setBookingSelection({
            assetType: asset.kind, assetId: asset.id, assetName: asset.name, startsAt, endsAt,
            basePriceCents: asset.hourlyRateCents, flashDealDiscountPercent: discount, finalPriceCents,
          });
          setBookingReservationId(row.reservationId);
          setSuccess({ action: 'joined', reservationId: row.reservationId, assetName: asset.name, startsAt, endsAt, finalPriceCents, holdExpiresAt: null });
        } else {
          const reservation: Reservation = await createReservation({
            facilityId: facility.facilityId!,
            assetType: asset.kind,
            assetId: asset.id,
            startsAt, endsAt,
            gameFormat: asset.kind === 'court' ? search.gameFormat : undefined,
            // Slots this booker is taking. Everyone reserves individually;
            // whatever they leave stays open for others to join and pay for.
            slots: slotCount,
          });
          setBookingSelection({
            assetType: asset.kind, assetId: asset.id, assetName: asset.name, startsAt, endsAt,
            basePriceCents: reservation.base_price_cents,
            flashDealDiscountPercent: reservation.flash_deal_discount_percent,
            finalPriceCents: reservation.final_price_cents,
          });
          setBookingReservationId(reservation.id);
          setSuccess({
            action: 'created', reservationId: reservation.id, assetName: asset.name, startsAt, endsAt,
            finalPriceCents: reservation.final_price_cents, holdExpiresAt: reservation.hold_expires_at,
          });
        }
      } catch (e) {
        showRpcError(e);
      } finally {
        setActionAssetId(null);
      }
    };

    if (row.reservationId && !row.fitsGroup) {
      Alert.alert(
        'Not Enough Room',
        `This game only has room for ${(row.max ?? 0) - (row.current ?? 0)} more, but your group is ${search.playersInGroup}. Join anyway?`,
        [{ text: 'Cancel', style: 'cancel' }, { text: 'Join Anyway', onPress: doIt }],
      );
      return;
    }
    await doIt();
  }

  if (loading) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color={L.navy} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <Ionicons name="alert-circle-outline" size={36} color={L.border} />
        <Text style={s.errorText}>{error}</Text>
        <TouchableOpacity onPress={() => goBack()} style={s.errorBackBtn}>
          <Text style={s.errorBackText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={s.header}>
        <TouchableOpacity style={s.iconBtn} onPress={() => goBack()} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={20} color={L.navy} />
        </TouchableOpacity>
        <Text style={s.title}>Choose Time</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={s.contextBar}>
        <Text style={s.contextText} numberOfLines={1}>
          {facility.facilityName ?? 'Facility'}  ·  {formatDateHeader(dateStr)}  ·  {search.gameFormat === 'doubles' ? 'Doubles' : 'Singles'} ({search.playersInGroup} {search.playersInGroup === 1 ? 'player' : 'players'})
        </Text>
      </View>

      {success ? (
        <ScrollView contentContainerStyle={{ padding: spacing.screenH, paddingBottom: insets.bottom + 32 }}>
          <View style={s.successCard}>
            <Ionicons name="checkmark-circle" size={28} color={colors.success} />
            <Text style={s.successTitle}>{success.action === 'created' ? 'Reservation Held' : "You're In!"}</Text>
            <Text style={s.successBody}>
              {success.assetName}  ·  {formatHourLabel(new Date(success.startsAt).getHours())} – {formatHourLabel(new Date(success.endsAt).getHours())}
              {success.finalPriceCents != null ? `  ·  $${(success.finalPriceCents / 100).toFixed(2)}` : ''}
            </Text>
            {success.holdExpiresAt && (
              <Text style={s.successHold}>
                Hold expires {new Date(success.holdExpiresAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} — confirm soon.
              </Text>
            )}
            <TouchableOpacity
              style={s.primaryBtn}
              activeOpacity={0.88}
              onPress={() => router.push('/booking/players' as never)}
            >
              <Text style={s.primaryBtnText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.hourRow} contentContainerStyle={{ paddingHorizontal: spacing.screenH, gap: spacing.sm }}>
            {hours.length === 0 ? (
              <Text style={s.closedText}>Closed on this date.</Text>
            ) : hours.map(h => (
              <TouchableOpacity
                key={h}
                style={[s.hourChip, selectedHour === h && s.hourChipActive]}
                activeOpacity={0.85}
                onPress={() => setSelectedHour(h)}
              >
                <Text
                  style={[s.hourChipText, selectedHour === h && s.hourChipTextActive]}
                  numberOfLines={1}
                >
                  {formatHourLabel(h)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Duration. The server accepts 1-4 hours; an option is offered only
              when every hour it covers is open and unbooked on at least one
              asset — a duration that could never be booked anywhere is worse
              than no choice at all. */}
          {selectedHour != null && hours.length > 0 && (
            <View style={s.durationRow}>
              <Text style={s.durationLabel}>For</Text>
              {DURATION_OPTIONS.map(d => {
                const fitsSomewhere = [...primaryAssets, ...otherAssets].some(a =>
                  maxHoursFrom(availability[a.id] ?? [], dateStr, selectedHour, hours) >= d);
                const disabled = !fitsSomewhere;
                return (
                  <TouchableOpacity
                    key={d}
                    style={[
                      s.durationChip,
                      durationHours === d && s.durationChipActive,
                      disabled && s.durationChipDisabled,
                    ]}
                    disabled={disabled}
                    activeOpacity={0.85}
                    onPress={() => setDurationHours(d)}
                  >
                    <Text
                      style={[s.durationChipText, durationHours === d && s.durationChipTextActive]}
                      numberOfLines={1}
                    >
                      {d}h
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <View style={s.tabRow}>
            <TouchableOpacity style={[s.tab, inventoryTab === 'court' && s.tabActive]} activeOpacity={0.85} onPress={() => setInventoryTab('court')}>
              <Text style={[s.tabText, inventoryTab === 'court' && s.tabTextActive]}>Courts</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.tab, inventoryTab === 'ball_machine' && s.tabActive]} activeOpacity={0.85} onPress={() => setInventoryTab('ball_machine')}>
              <Text style={[s.tabText, inventoryTab === 'ball_machine' && s.tabTextActive]}>Ball Machines</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.screenH, paddingBottom: insets.bottom + 32 }}>
            {selectedHour == null ? null : (
              <>
                {primaryAssets.length === 0 && (
                  <Text style={s.emptyText}>
                    {inventoryTab === 'court' ? 'No courts listed at this facility yet.' : 'No ball machines listed at this facility yet.'}
                  </Text>
                )}
                {primaryAssets.map(asset => {
                  const slot = findSlotAt(availability[asset.id] ?? [], dateStr, selectedHour, durationHours);
                  const row = computeRowState(asset.kind, slot, search.playersInGroup, newGameMax);
                  const discount = bestFlashDealPercent(deals, asset.kind, asset.id, hourRange(dateStr, selectedHour).startsAt);
                  // What THIS booker pays: their slots x hours x the per-slot
                  // rate. Showing the whole-court price would quote a number
                  // nobody is charged.
                  const finalPrice = asset.hourlyRateCents != null
                    ? Math.round(asset.hourlyRateCents * durationHours * slotCount
                                 * (100 - (discount ?? 0)) / 100)
                    : asset.hourlyRateCents;
                  const busy = actionAssetId === asset.id;

                  return (
                    <TouchableOpacity
                      key={asset.id}
                      style={s.row}
                      activeOpacity={row.available ? 0.85 : 1}
                      disabled={!row.available || busy}
                      onPress={() => handleBook(asset, row, slot)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={s.rowName}>{asset.name}</Text>
                        {asset.subtitle ? <Text style={s.rowSubtitle}>{asset.subtitle}</Text> : null}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                          <StatusChip label={row.label} variant={row.variant} />
                          {row.current != null && row.max != null && (
                            <Text style={s.occupancyText}>
                              {row.current}/{row.max}{row.projected != null && row.available ? ` → ${Math.min(row.projected, row.max)}/${row.max} with your group` : ''}
                            </Text>
                          )}
                        </View>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        {discount != null && <StatusChip label="FLASH DEAL" variant="gold" icon="flash" />}
                        {finalPrice != null ? (
                          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                            {discount != null && <Text style={s.priceStrike}>${Math.round(asset.hourlyRateCents! / 100)}</Text>}
                            <Text style={s.price}>${Math.round(finalPrice / 100)}</Text>
                          </View>
                        ) : (
                          <Text style={s.priceUnavailable}>Pricing unavailable</Text>
                        )}
                        {busy && <ActivityIndicator size="small" color={L.gold} />}
                      </View>
                    </TouchableOpacity>
                  );
                })}

                {otherAssets.length > 0 && (
                  <>
                    <Text style={s.sectionTitle}>Also Available at This Time</Text>
                    {otherAssets.map(asset => {
                      const slot = findSlotAt(availability[asset.id] ?? [], dateStr, selectedHour, durationHours);
                      const row = computeRowState(asset.kind, slot, search.playersInGroup, newGameMax);
                      if (!row.available) return null; // "also available" -- only show open alternatives
                      const discount = bestFlashDealPercent(deals, asset.kind, asset.id, hourRange(dateStr, selectedHour).startsAt);
                      const finalPrice = asset.hourlyRateCents != null && discount != null
                        ? Math.round(asset.hourlyRateCents * (100 - discount) / 100)
                        : asset.hourlyRateCents;
                      const busy = actionAssetId === asset.id;

                      return (
                        <TouchableOpacity
                          key={asset.id}
                          style={[s.row, s.rowMuted]}
                          activeOpacity={0.85}
                          disabled={busy}
                          onPress={() => { setInventoryTab(asset.kind); handleBook(asset, row, slot); }}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={s.rowName}>{asset.name}</Text>
                            {asset.subtitle ? <Text style={s.rowSubtitle}>{asset.subtitle}</Text> : null}
                            <StatusChip label={row.label} variant={row.variant} style={{ marginTop: 6 }} />
                          </View>
                          {finalPrice != null && <Text style={s.price}>${Math.round(finalPrice / 100)}</Text>}
                        </TouchableOpacity>
                      );
                    })}
                  </>
                )}
              </>
            )}
          </ScrollView>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: L.bg, paddingHorizontal: 32 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.screenH, paddingVertical: spacing.screenV, backgroundColor: L.bg,
  },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title:   { color: L.navy, fontSize: 17, fontWeight: '900' },

  contextBar: { paddingHorizontal: spacing.screenH, paddingBottom: spacing.sm, backgroundColor: L.bg },
  contextText: { color: L.textSub, fontSize: 12, fontWeight: '600' },

  // flexGrow/flexShrink 0: a horizontal ScrollView between flex siblings gets
  // squeezed vertically, which clips the chips rather than scrolling them.
  hourRow: {
    flexGrow: 0, flexShrink: 0,
    paddingVertical: spacing.sm, backgroundColor: L.bg,
    borderBottomWidth: 1, borderBottomColor: L.border,
  },
  hourChip: {
    flexShrink: 0, borderWidth: 1.5, borderColor: L.border, borderRadius: radius.chip,
    paddingHorizontal: 14, paddingVertical: 8, minWidth: 64, alignItems: 'center',
  },
  hourChipActive: { borderColor: L.gold, backgroundColor: L.goldBg },
  hourChipText: { color: L.textSub, fontSize: 13, fontWeight: '700' },
  durationRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.screenH, paddingVertical: spacing.sm,
    backgroundColor: L.bg, borderBottomWidth: 1, borderBottomColor: L.border,
  },
  durationLabel: { color: L.textSub, fontSize: 13, fontWeight: '700', marginRight: spacing.xs },
  durationChip: {
    flexShrink: 0, minWidth: 48, alignItems: 'center',
    borderWidth: 1.5, borderColor: L.border, borderRadius: radius.chip,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  durationChipActive: { borderColor: L.gold, backgroundColor: L.goldBg },
  durationChipDisabled: { opacity: 0.35 },
  durationChipText: { color: L.textSub, fontSize: 13, fontWeight: '700' },
  durationChipTextActive: { color: L.navy },
  hourChipTextActive: { color: L.navy },
  closedText: { color: L.textSub, fontSize: 13, fontWeight: '600', paddingVertical: 8 },

  tabRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.screenH, paddingVertical: spacing.sm, backgroundColor: L.bg },
  tab: { flex: 1, alignItems: 'center', borderWidth: 1.5, borderColor: L.border, borderRadius: radius.button, paddingVertical: 10 },
  tabActive: { borderColor: L.gold, backgroundColor: L.goldBg },
  tabText: { color: L.textSub, fontSize: 13, fontWeight: '700' },
  tabTextActive: { color: L.navy },

  sectionTitle: { color: L.navy, fontSize: 13, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: spacing.xl, marginBottom: spacing.sm },
  emptyText: { color: L.textSub, fontSize: 13, fontWeight: '500', textAlign: 'center', paddingVertical: 24 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: L.bg, borderRadius: radius.card, borderWidth: 1, borderColor: L.border,
    padding: spacing.md, marginTop: spacing.sm,
  },
  rowMuted: { opacity: 0.92 },
  rowName: { color: L.text, fontSize: 14, fontWeight: '700' },
  rowSubtitle: { color: L.textSub, fontSize: 12, fontWeight: '500', marginTop: 2 },
  occupancyText: { color: L.textSub, fontSize: 11, fontWeight: '600' },

  price: { color: L.navy, fontSize: 15, fontWeight: '800' },
  priceStrike: { color: L.textSub, fontSize: 12, fontWeight: '600', textDecorationLine: 'line-through' },
  priceUnavailable: { color: L.textSub, fontSize: 11, fontWeight: '500' },

  successCard: {
    backgroundColor: L.bg, borderRadius: radius.card, borderWidth: 1, borderColor: L.border,
    padding: spacing.xl, alignItems: 'center', gap: 8,
  },
  successTitle: { color: L.navy, fontSize: 18, fontWeight: '900', marginTop: 4 },
  successBody: { color: L.text, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  successHold: { color: colors.danger, fontSize: 12, fontWeight: '700', textAlign: 'center' },

  primaryBtn: { backgroundColor: L.navy, borderRadius: radius.button, paddingVertical: 16, paddingHorizontal: 32, alignItems: 'center', marginTop: spacing.lg, alignSelf: 'stretch' },
  primaryBtnText: { color: L.white, fontSize: 16, fontWeight: '800' },

  errorText: { color: L.textSub, fontSize: 14, fontWeight: '500', textAlign: 'center' },
  errorBackBtn: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: radius.button, backgroundColor: L.navy },
  errorBackText: { color: L.white, fontSize: 14, fontWeight: '700' },
});
