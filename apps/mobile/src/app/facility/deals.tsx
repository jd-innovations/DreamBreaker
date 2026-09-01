import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams } from 'expo-router';
import { colors, radius, spacing, typography } from '@/theme';
import { goBack } from '@/lib/navigation';
import { useSession } from '@/hooks/useSession';
import { useFacilityRole } from '@/hooks/useFacilityRole';
import { fetchCourts, type Court } from '@/lib/supabase/courts';
import { fetchBallMachines, type BallMachine } from '@/lib/supabase/ballMachines';
import {
  fetchAllFlashDealsForFacility, createFlashDeal, updateFlashDeal, deactivateFlashDeal,
  previewPriceCents, dealStatus, DISCOUNT_MIN, DISCOUNT_MAX,
  type FlashDeal, type DealStatus,
} from '@/lib/supabase/flashDeals';
import { fetchManagedFacilities, facilityManagementError, type ManagedFacility } from '@/lib/supabase/facilityManagement';

// Facility Marketplace Phase 6 — Flash Deals.
//
// Built to BOOKING_ENGINE_V1_SPEC.md's Flash Deals screen: Asset, Date, Start,
// End, Discount %, Preview Price, Publish.
//
// The audit recommended building deals last, "since they depend on real
// reservation data existing". That reasoning holds for the Dashboard and
// Calendar, which report on bookings, and not for deals: a deal hangs off an
// ASSET, which the facility creates itself. The dependency runs the other way —
// a discount is how an empty court gets its first booking.
//
// Deals are asset-scoped because flash_deals_owner_type_check permits only
// 'court' and 'ball_machine'. There is no facility-wide deal, despite
// 'facility' existing in the enum.

type Picker = 'date' | 'start' | 'end' | null;

type Draft = {
  id?: string;
  ownerType: 'court' | 'ball_machine';
  ownerId: string;
  discount: string;
  date: Date;
  start: Date;
  end: Date;
};

const STATUS_LABEL: Record<DealStatus, string> = {
  live: 'LIVE', scheduled: 'SCHEDULED', ended: 'ENDED', off: 'OFF',
};

function atTimeOn(day: Date, time: Date): Date {
  const d = new Date(day);
  d.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return d;
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function fmtDay(d: string | Date) {
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function fmtTime(d: string | Date) {
  return new Date(d).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export default function FacilityDealsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const params = useLocalSearchParams<{ facilityId?: string }>();

  const [facilities, setFacilities] = useState<ManagedFacility[]>([]);
  const [facilityId, setFacilityId] = useState<string | null>(params.facilityId ?? null);
  const [courts, setCourts] = useState<Court[]>([]);
  const [machines, setMachines] = useState<BallMachine[]>([]);
  const [deals, setDeals] = useState<FlashDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [picker, setPicker] = useState<Picker>(null);
  const [busy, setBusy] = useState(false);

  const { isManagerOrAbove } = useFacilityRole(facilityId);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    void (async () => {
      try {
        const rows = await fetchManagedFacilities(user.id);
        setFacilities(rows);
        setFacilityId(prev => prev ?? rows[0]?.id ?? null);
      } catch {
        setFacilities([]);
      }
    })();
  }, [user?.id]);

  const load = useCallback(async (fid: string) => {
    setLoading(true);
    try {
      // Only ACTIVE assets can take a new deal, but the list has to render
      // deals on retired ones too, so both are fetched.
      const [c, m, d] = await Promise.all([
        fetchCourts(fid, { includeInactive: true }),
        fetchBallMachines(fid, { includeInactive: true }),
        fetchAllFlashDealsForFacility(fid),
      ]);
      setCourts(c); setMachines(m); setDeals(d);
    } catch {
      setCourts([]); setMachines([]); setDeals([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (facilityId) void load(facilityId); }, [facilityId, load]);

  const assetName = useCallback((ownerId: string) =>
    courts.find(c => c.id === ownerId)?.name
    ?? machines.find(m => m.id === ownerId)?.name
    ?? 'Asset', [courts, machines]);

  const assetRate = useCallback((ownerId: string) =>
    courts.find(c => c.id === ownerId)?.hourly_rate_cents
    ?? machines.find(m => m.id === ownerId)?.hourly_rate_cents
    ?? 0, [courts, machines]);

  const bookableAssets = useMemo(() => [
    ...courts.filter(c => c.is_active).map(c => ({ id: c.id, name: c.name, type: 'court' as const })),
    ...machines.filter(m => m.is_active).map(m => ({ id: m.id, name: m.name, type: 'ball_machine' as const })),
  ], [courts, machines]);

  function startDraft() {
    const first = bookableAssets[0];
    if (!first) {
      Alert.alert('No assets', 'Add a bookable court or ball machine before creating a deal.');
      return;
    }
    const now = new Date();
    const start = new Date(now); start.setHours(now.getHours() + 1, 0, 0, 0);
    const end = new Date(start); end.setHours(start.getHours() + 4);
    setDraft({ ownerType: first.type, ownerId: first.id, discount: '20', date: start, start, end });
  }

  const discountNum = draft ? Number(draft.discount.replace(/[^0-9]/g, '')) : 0;
  const discountValid = discountNum >= DISCOUNT_MIN && discountNum <= DISCOUNT_MAX;
  const windowValid = draft ? atTimeOn(draft.date, draft.end) > atTimeOn(draft.date, draft.start) : false;

  // Deals already on this asset whose window overlaps the draft. Surfaced
  // rather than blocked: overlapping deals are legal and the biggest discount
  // wins, so a manager needs to see what they are competing with.
  const overlapping = useMemo(() => {
    if (!draft) return [];
    const s = atTimeOn(draft.date, draft.start);
    const e = atTimeOn(draft.date, draft.end);
    return deals.filter(d =>
      d.id !== draft.id && d.owner_id === draft.ownerId && d.is_active &&
      new Date(d.starts_at) < e && new Date(d.ends_at) > s);
  }, [draft, deals]);

  async function publish() {
    if (!draft || !facilityId || !user?.id) return;
    if (!discountValid) {
      Alert.alert('Check the discount', `Enter a number between ${DISCOUNT_MIN} and ${DISCOUNT_MAX}.`);
      return;
    }
    if (!windowValid) {
      Alert.alert('Check the times', 'The end time has to be after the start time.');
      return;
    }

    setBusy(true);
    try {
      const startsAt = atTimeOn(draft.date, draft.start);
      const endsAt = atTimeOn(draft.date, draft.end);

      if (draft.id) {
        await updateFlashDeal(draft.id, { discountPercent: discountNum, startsAt, endsAt });
      } else {
        await createFlashDeal({
          ownerType: draft.ownerType, ownerId: draft.ownerId,
          discountPercent: discountNum, startsAt, endsAt,
        }, user.id);
      }
      setDraft(null); setPicker(null);
      await load(facilityId);
    } catch (e) {
      Alert.alert('Could not publish', facilityManagementError(e));
    } finally {
      setBusy(false);
    }
  }

  function confirmEnd(deal: FlashDeal) {
    Alert.alert(
      'End this deal?',
      'It stops applying to new bookings. Reservations already priced with it keep their discount.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End deal',
          style: 'destructive',
          onPress: async () => {
            try {
              await deactivateFlashDeal(deal.id);
              if (facilityId) await load(facilityId);
            } catch (e) {
              Alert.alert('Could not end', facilityManagementError(e));
            }
          },
        },
      ],
    );
  }

  const previewCents = draft ? previewPriceCents(assetRate(draft.ownerId), discountValid ? discountNum : 0) : 0;

  return (
    <View style={s.root}>
      <StatusBar style="dark" />
      <View style={[s.header, { paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity style={s.back} onPress={() => goBack('/facility/manage')} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={colors.navy} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Flash Deals</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxxl, gap: spacing.lg }}
        keyboardShouldPersistTaps="handled"
      >
        {loading && <ActivityIndicator size="large" color={colors.gold} style={{ marginTop: spacing.xxl }} />}

        {!loading && facilities.length > 1 && (
          <View style={s.switcher}>
            {facilities.map(f => (
              <TouchableOpacity
                key={f.id}
                style={[s.switchChip, facilityId === f.id && s.switchChipOn]}
                onPress={() => { setFacilityId(f.id); setDraft(null); }}
                activeOpacity={0.8}
              >
                <Text style={[s.switchText, facilityId === f.id && s.switchTextOn]} numberOfLines={1}>
                  {f.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {!loading && !draft && (
          <>
            <Text style={s.intro}>
              Discount a court or machine for a window of time. Players see the reduced price when
              they book inside it.
            </Text>
            {isManagerOrAbove && (
              <TouchableOpacity style={s.newBtn} onPress={startDraft} activeOpacity={0.85}>
                <Ionicons name="flash" size={18} color={colors.navy} />
                <Text style={s.newBtnText}>New deal</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {/* ── Editor ─────────────────────────────────────────────────────── */}
        {draft && (
          <View style={s.editor}>
            <Text style={s.editorTitle}>{draft.id ? 'Edit deal' : 'New deal'}</Text>

            <Text style={s.fieldLabel}>Asset</Text>
            <View style={s.assetWrap}>
              {bookableAssets.map(a => (
                <TouchableOpacity
                  key={a.id}
                  style={[s.assetChip, draft.ownerId === a.id && s.assetChipOn]}
                  onPress={() => setDraft({ ...draft, ownerId: a.id, ownerType: a.type })}
                  activeOpacity={0.8}
                  disabled={!!draft.id}
                >
                  <Text style={[s.assetChipText, draft.ownerId === a.id && s.assetChipTextOn]}>
                    {a.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {!!draft.id && (
              <Text style={s.hint}>The asset cannot be changed. End this deal and create another.</Text>
            )}

            <Text style={s.fieldLabel}>Date</Text>
            <TouchableOpacity style={s.pickerBtn} onPress={() => setPicker(picker === 'date' ? null : 'date')} activeOpacity={0.8}>
              <Ionicons name="calendar-outline" size={16} color={colors.gold} />
              <Text style={s.pickerText}>{fmtDay(draft.date)}</Text>
            </TouchableOpacity>
            {picker === 'date' && (
              <DateTimePicker
                value={draft.date}
                mode="date"
                display="spinner"
                textColor={colors.navy}
                onChange={(_, sel) => { if (sel) setDraft({ ...draft, date: sel }); }}
              />
            )}

            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 1, gap: spacing.xs }}>
                <Text style={s.fieldLabel}>Starts</Text>
                <TouchableOpacity style={s.pickerBtn} onPress={() => setPicker(picker === 'start' ? null : 'start')} activeOpacity={0.8}>
                  <Ionicons name="time-outline" size={16} color={colors.gold} />
                  <Text style={s.pickerText}>{fmtTime(draft.start)}</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flex: 1, gap: spacing.xs }}>
                <Text style={s.fieldLabel}>Ends</Text>
                <TouchableOpacity style={s.pickerBtn} onPress={() => setPicker(picker === 'end' ? null : 'end')} activeOpacity={0.8}>
                  <Ionicons name="time-outline" size={16} color={colors.gold} />
                  <Text style={s.pickerText}>{fmtTime(draft.end)}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {picker === 'start' && (
              <DateTimePicker
                value={draft.start} mode="time" display="spinner" textColor={colors.navy}
                onChange={(_, sel) => { if (sel) setDraft({ ...draft, start: sel }); }}
              />
            )}
            {picker === 'end' && (
              <DateTimePicker
                value={draft.end} mode="time" display="spinner" textColor={colors.navy}
                onChange={(_, sel) => { if (sel) setDraft({ ...draft, end: sel }); }}
              />
            )}
            {!windowValid && <Text style={s.error}>The end time has to be after the start time.</Text>}

            <Text style={s.fieldLabel}>Discount %</Text>
            <TextInput
              style={s.input}
              value={draft.discount}
              onChangeText={v => setDraft({ ...draft, discount: v.replace(/[^0-9]/g, '').slice(0, 2) })}
              keyboardType="number-pad"
              placeholder="20"
              placeholderTextColor={colors.textSub}
            />
            {!discountValid && (
              <Text style={s.error}>Between {DISCOUNT_MIN} and {DISCOUNT_MAX}.</Text>
            )}

            {/* The spec's Preview Price. Same arithmetic as create_reservation,
                so this is what a player is actually charged. */}
            <View style={s.preview}>
              <Text style={s.previewLabel}>Preview price · 1 hour</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
                <Text style={s.previewWas}>{money(assetRate(draft.ownerId))}</Text>
                <Text style={s.previewNow}>{money(previewCents)}</Text>
              </View>
            </View>

            {overlapping.length > 0 && (
              <View style={s.warn}>
                <Ionicons name="information-circle-outline" size={16} color={colors.gold} />
                <Text style={s.warnText}>
                  {overlapping.length} other deal{overlapping.length === 1 ? '' : 's'} overlap this
                  window on {assetName(draft.ownerId)}. The biggest discount wins — currently{' '}
                  {Math.max(discountValid ? discountNum : 0, ...overlapping.map(o => o.discount_percent))}%.
                </Text>
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
              <TouchableOpacity
                style={[s.secondary, { flex: 1 }]}
                onPress={() => { setDraft(null); setPicker(null); }}
                activeOpacity={0.85}
              >
                <Text style={[s.secondaryText, { textAlign: 'center' }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.saveBtn, { flex: 1 }, (busy || !discountValid || !windowValid) && s.disabled]}
                onPress={publish}
                disabled={busy || !discountValid || !windowValid}
                activeOpacity={0.85}
              >
                {busy
                  ? <ActivityIndicator size="small" color={colors.white} />
                  : <Text style={s.saveText}>{draft.id ? 'Save' : 'Publish'}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Existing deals ─────────────────────────────────────────────── */}
        {!loading && deals.length === 0 && !draft && (
          <Text style={s.empty}>No deals yet.</Text>
        )}

        {deals.map(d => {
          const status = dealStatus(d);
          return (
            <View key={d.id} style={[s.dealRow, status === 'ended' && s.dealDim, status === 'off' && s.dealDim]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Text style={s.dealDiscount}>{d.discount_percent}% off</Text>
                  <Text style={[s.badge, status === 'live' && s.badgeLive]}>{STATUS_LABEL[status]}</Text>
                </View>
                <Text style={s.dealAsset} numberOfLines={1}>{assetName(d.owner_id)}</Text>
                <Text style={s.dealWhen}>
                  {fmtDay(d.starts_at)} · {fmtTime(d.starts_at)}–{fmtTime(d.ends_at)}
                </Text>
              </View>
              {isManagerOrAbove && d.is_active && status !== 'ended' && (
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <TouchableOpacity
                    onPress={() => setDraft({
                      id: d.id,
                      ownerType: d.owner_type as 'court' | 'ball_machine',
                      ownerId: d.owner_id,
                      discount: String(d.discount_percent),
                      date: new Date(d.starts_at),
                      start: new Date(d.starts_at),
                      end: new Date(d.ends_at),
                    })}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="create-outline" size={20} color={colors.navy} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => confirmEnd(d)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="stop-circle-outline" size={20} color={colors.textSub} />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.page },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.screenH, paddingBottom: spacing.md, backgroundColor: colors.bg,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: colors.navy, ...typography.pageTitle },

  intro: { color: colors.textSub, ...typography.body, lineHeight: 21 },

  switcher: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  switchChip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.chip,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, maxWidth: 200,
  },
  switchChipOn: { borderColor: colors.gold, backgroundColor: colors.goldBg },
  switchText: { color: colors.textSub, ...typography.metadata, fontWeight: '700' },
  switchTextOn: { color: colors.navy },

  newBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    padding: spacing.lg, borderRadius: radius.card,
    backgroundColor: colors.goldBg, borderWidth: 1.5, borderColor: colors.goldBorder,
  },
  newBtnText: { color: colors.navy, ...typography.cardTitle },

  editor: {
    padding: spacing.lg, backgroundColor: colors.bg, borderRadius: radius.card,
    borderWidth: 1.5, borderColor: colors.goldBorder, gap: spacing.sm,
  },
  editorTitle: { color: colors.navy, ...typography.cardTitle, marginBottom: spacing.xs },
  fieldLabel: { color: colors.textSub, ...typography.metadata, fontWeight: '700' },
  hint: { color: colors.textSub, ...typography.metadata },
  error: { color: colors.danger, ...typography.metadata },

  assetWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  assetChip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.chip,
    borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.bg,
  },
  assetChipOn: { borderColor: colors.gold, backgroundColor: colors.goldBg },
  assetChipText: { color: colors.textSub, fontSize: 13, fontWeight: '700' },
  assetChipTextOn: { color: colors.navy, fontWeight: '800' },

  pickerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, minHeight: 44, backgroundColor: colors.bg,
  },
  pickerText: { color: colors.navy, fontSize: 15, fontWeight: '600' },

  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    color: colors.navy, fontSize: 15, backgroundColor: colors.bg, minHeight: 44,
  },

  preview: {
    padding: spacing.md, borderRadius: radius.card,
    backgroundColor: colors.page, borderWidth: 1, borderColor: colors.border, gap: spacing.xs,
  },
  previewLabel: { color: colors.textSub, ...typography.metadata, fontWeight: '700' },
  previewWas: { color: colors.textSub, fontSize: 15, textDecorationLine: 'line-through' },
  previewNow: { color: colors.navy, fontSize: 22, fontWeight: '900' },

  warn: {
    flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderRadius: radius.card,
    backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder,
  },
  warnText: { flex: 1, color: colors.text, ...typography.metadata, lineHeight: 17 },

  empty: { color: colors.textSub, ...typography.body },

  dealRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md,
    backgroundColor: colors.bg, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border,
  },
  dealDim: { opacity: 0.55 },
  dealDiscount: { color: colors.navy, ...typography.cardTitle },
  dealAsset: { color: colors.navy, ...typography.metadata, fontWeight: '700' },
  dealWhen: { color: colors.textSub, ...typography.metadata },
  badge: {
    color: colors.textSub, fontSize: 10, fontWeight: '900', letterSpacing: 0.6,
    paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.chip,
    backgroundColor: colors.page, overflow: 'hidden',
  },
  badgeLive: { color: colors.navy, backgroundColor: colors.goldBg },

  secondary: {
    paddingVertical: spacing.md, paddingHorizontal: spacing.xxl,
    borderRadius: radius.button, borderWidth: 1.5, borderColor: colors.border,
  },
  secondaryText: { color: colors.navy, fontSize: 15, fontWeight: '800' },
  saveBtn: {
    backgroundColor: colors.navy, borderRadius: radius.button, paddingVertical: spacing.md,
    alignItems: 'center', justifyContent: 'center',
  },
  saveText: { color: colors.white, fontSize: 15, fontWeight: '800' },
  disabled: { opacity: 0.4 },
});
