import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, ActivityIndicator, Alert, Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { colors, radius, spacing, typography } from '@/theme';
import { goBack } from '@/lib/navigation';
import { useSession } from '@/hooks/useSession';
import {
  fetchManagedFacilities, fetchCourts, saveCourt, deactivateCourt, fetchStaff, fetchPayoutStatus,
  type ManagedFacility, type Court, type StaffMember, type PayoutStatus,
} from '@/lib/supabase/facilityManagement';
import { startConnectOnboarding } from '@/lib/payments/connectOnboarding';

// Facility Marketplace Phase 2 — courts and staff.
//
// A claimed facility with no courts is still unbookable, so this is what turns
// an approved application into something players can actually reserve. Only one
// of 194 facilities currently has courts at all.
//
// Rates are entered in dollars and stored in cents: hourly_rate_cents is the
// figure Phase 4 will split between the platform and the facility, and a
// rounding slip there is somebody's money.

type CourtDraft = {
  id?: string;
  name: string;
  indoorOutdoor: 'indoor' | 'outdoor';
  rateDollars: string;
  isActive: boolean;
};

const NEW_COURT: CourtDraft = { name: '', indoorOutdoor: 'outdoor', rateDollars: '', isActive: true };

function dollarsToCents(v: string): number | null {
  const n = Number(v.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export default function FacilityManageScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();

  const [facilities, setFacilities] = useState<ManagedFacility[]>([]);
  const [active, setActive] = useState<ManagedFacility | null>(null);
  const [courts, setCourts] = useState<Court[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<CourtDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [payout, setPayout] = useState<PayoutStatus | null>(null);
  const [connecting, setConnecting] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    setLoading(true);
    try {
      const rows = await fetchManagedFacilities();
      setFacilities(rows);
      const first = rows[0] ?? null;
      setActive(prev => (prev && rows.some(r => r.id === prev.id) ? prev : first));
    } catch {
      setFacilities([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { void load(); }, [load]);

  const loadDetail = useCallback(async (facilityId: string) => {
    try {
      const [c, s, p] = await Promise.all([
        fetchCourts(facilityId), fetchStaff(facilityId), fetchPayoutStatus(facilityId),
      ]);
      setCourts(c);
      setStaff(s);
      setPayout(p);
    } catch {
      setCourts([]);
      setStaff([]);
      setPayout(null);
    }
  }, []);

  useEffect(() => { if (active?.id) void loadDetail(active.id); }, [active?.id, loadDetail]);

  async function submitCourt() {
    if (!draft || !active) return;
    const cents = dollarsToCents(draft.rateDollars);
    if (!draft.name.trim()) { Alert.alert('Name required', 'Give the court a name players will recognise.'); return; }
    if (cents === null)     { Alert.alert('Rate required', 'Enter an hourly rate, or 0 for free.'); return; }

    setBusy(true);
    try {
      const res = await saveCourt({
        id: draft.id,
        facilityId: active.id,
        name: draft.name,
        indoorOutdoor: draft.indoorOutdoor,
        hourlyRateCents: cents,
        isActive: draft.isActive,
      });
      if (!res.ok) { Alert.alert('Could not save', res.message); return; }
      setDraft(null);
      await loadDetail(active.id);
    } finally {
      setBusy(false);
    }
  }

  function confirmDeactivate(c: Court) {
    Alert.alert(
      `Retire ${c.name}?`,
      'It stops appearing for new bookings. Existing reservations and their history are kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Retire',
          style: 'destructive',
          onPress: async () => {
            const res = await deactivateCourt(c.id);
            if (!res.ok) { Alert.alert('Could not retire', res.message); return; }
            if (active?.id) await loadDetail(active.id);
          },
        },
      ],
    );
  }

  const canManage = active?.role === 'owner' || active?.role === 'manager';

  async function connectPayouts() {
    if (!active || connecting) return;
    setConnecting(true);
    try {
      const res = await startConnectOnboarding('facility', active.id);
      if (!res.ok) {
        Alert.alert(
          'Could not start',
          res.code === 'not_facility_owner'
            ? 'Only the facility owner can set up payouts.'
            : 'Please try again in a moment.',
        );
        return;
      }
      // `completed` only means the browser returned. Stripe decides readiness
      // and tells us through the account.updated webhook, so re-read rather
      // than assume — the same discipline the payment hooks use.
      await loadDetail(active.id);
    } finally {
      setConnecting(false);
    }
  }

  return (
    <View style={s.root}>
      <StatusBar style="dark" />
      <View style={[s.header, { paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity style={s.back} onPress={() => goBack('/(tabs)/profile')} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={colors.navy} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>My Facility</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxxl, gap: spacing.lg }}
        keyboardShouldPersistTaps="handled"
      >
        {loading && <ActivityIndicator size="large" color={colors.gold} style={{ marginTop: spacing.xxl }} />}

        {!loading && facilities.length === 0 && (
          <View style={s.card}>
            <Ionicons name="business-outline" size={30} color={colors.textSub} />
            <Text style={s.cardTitle}>You don&rsquo;t manage a facility yet</Text>
            <Text style={s.cardBody}>
              Apply to manage your courts, and once approved you can set them up here.
            </Text>
            <TouchableOpacity
              style={s.secondary}
              onPress={() => router.push('/facility/apply' as never)}
              activeOpacity={0.85}
            >
              <Text style={s.secondaryText}>Apply</Text>
            </TouchableOpacity>
          </View>
        )}

        {!loading && facilities.length > 1 && (
          <View style={s.switcher}>
            {facilities.map(f => (
              <TouchableOpacity
                key={f.id}
                style={[s.switchChip, active?.id === f.id && s.switchChipOn]}
                onPress={() => setActive(f)}
                activeOpacity={0.8}
              >
                <Text style={[s.switchText, active?.id === f.id && s.switchTextOn]} numberOfLines={1}>
                  {f.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {!loading && active && (
          <>
            <View style={s.facilityCard}>
              <Text style={s.facilityName}>{active.name}</Text>
              <Text style={s.facilitySub}>
                {[active.city, active.state].filter(Boolean).join(', ')} · you are {active.role}
              </Text>
            </View>

            {/* Check-in is front-desk work, so staff see it too — not just
                managers. Phase 5 records attendance only; it moves no money. */}
            <TouchableOpacity
              style={s.checkInBtn}
              onPress={() => router.push('/facility/check-in' as never)}
              activeOpacity={0.85}
            >
              <Ionicons name="qr-code-outline" size={20} color={colors.navy} />
              <Text style={s.checkInBtnText}>Check in a player</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textSub} />
            </TouchableOpacity>

            {/* ── Courts ─────────────────────────────────────────────────── */}
            <View style={s.sectionHead}>
              <Text style={s.sectionLabel}>COURTS</Text>
              {canManage && !draft && (
                <TouchableOpacity onPress={() => setDraft({ ...NEW_COURT })} activeOpacity={0.7}>
                  <Text style={s.addLink}>+ Add court</Text>
                </TouchableOpacity>
              )}
            </View>

            {courts.length === 0 && !draft && (
              <Text style={s.empty}>
                No courts yet. Players cannot book this facility until at least one is added.
              </Text>
            )}

            {courts.map(c => (
              <View key={c.id} style={[s.courtRow, !c.isActive && s.courtRetired]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.courtName} numberOfLines={1}>
                    {c.name}{!c.isActive && ' · retired'}
                  </Text>
                  <Text style={s.courtSub}>
                    {c.indoorOutdoor ?? 'outdoor'} · ${((c.hourlyRateCents ?? 0) / 100).toFixed(2)}/hr
                  </Text>
                </View>
                {canManage && (
                  <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                    <TouchableOpacity
                      onPress={() => setDraft({
                        id: c.id, name: c.name,
                        indoorOutdoor: (c.indoorOutdoor === 'indoor' ? 'indoor' : 'outdoor'),
                        rateDollars: ((c.hourlyRateCents ?? 0) / 100).toFixed(2),
                        isActive: c.isActive,
                      })}
                      activeOpacity={0.7}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="create-outline" size={20} color={colors.navy} />
                    </TouchableOpacity>
                    {c.isActive && (
                      <TouchableOpacity
                        onPress={() => confirmDeactivate(c)}
                        activeOpacity={0.7}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="archive-outline" size={20} color={colors.textSub} />
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            ))}

            {draft && (
              <View style={s.editor}>
                <Text style={s.editorTitle}>{draft.id ? 'Edit court' : 'New court'}</Text>

                <Text style={s.fieldLabel}>Name</Text>
                <TextInput
                  style={s.input}
                  value={draft.name}
                  onChangeText={v => setDraft({ ...draft, name: v })}
                  placeholder="Court 1"
                  placeholderTextColor={colors.textSub}
                />

                <Text style={s.fieldLabel}>Type</Text>
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  {(['indoor', 'outdoor'] as const).map(t => (
                    <TouchableOpacity
                      key={t}
                      style={[s.typeChip, draft.indoorOutdoor === t && s.typeChipOn]}
                      onPress={() => setDraft({ ...draft, indoorOutdoor: t })}
                      activeOpacity={0.8}
                    >
                      <Text style={[s.typeText, draft.indoorOutdoor === t && s.typeTextOn]}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={s.fieldLabel}>Hourly rate (USD)</Text>
                <TextInput
                  style={s.input}
                  value={draft.rateDollars}
                  onChangeText={v => setDraft({ ...draft, rateDollars: v })}
                  placeholder="25.00"
                  placeholderTextColor={colors.textSub}
                  keyboardType="decimal-pad"
                />

                <View style={s.switchRow}>
                  <Text style={s.fieldLabel}>Bookable</Text>
                  <Switch
                    value={draft.isActive}
                    onValueChange={v => setDraft({ ...draft, isActive: v })}
                    trackColor={{ true: colors.gold, false: colors.border }}
                  />
                </View>

                <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                  <TouchableOpacity style={[s.secondary, { flex: 1 }]} onPress={() => setDraft(null)} activeOpacity={0.85}>
                    <Text style={[s.secondaryText, { textAlign: 'center' }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.saveBtn, { flex: 1 }, busy && s.submitDisabled]}
                    onPress={submitCourt}
                    disabled={busy}
                    activeOpacity={0.85}
                  >
                    {busy
                      ? <ActivityIndicator size="small" color={colors.white} />
                      : <Text style={s.saveText}>Save</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* ── Staff ──────────────────────────────────────────────────── */}
            <View style={s.sectionHead}>
              <Text style={s.sectionLabel}>STAFF</Text>
            </View>
            {staff.map(m => (
              <View key={m.userId} style={s.courtRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.courtName} numberOfLines={1}>{m.fullName ?? 'Unnamed'}</Text>
                  <Text style={s.courtSub} numberOfLines={1}>{m.email}</Text>
                </View>
                <Text style={s.roleChip}>{m.role}</Text>
              </View>
            ))}

            {/* ── Payouts ────────────────────────────────────────────────── */}
            <View style={s.sectionHead}>
              <Text style={s.sectionLabel}>PAYOUTS</Text>
            </View>

            {payout?.onboarded ? (
              <View style={s.payoutReady}>
                <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                <Text style={s.payoutReadyText}>
                  This facility can receive payouts.
                </Text>
              </View>
            ) : (
              <View style={s.payoutCard}>
                <Text style={s.payoutTitle}>
                  {payout?.hasAccount ? 'Finish your payout setup' : 'Set up payouts'}
                </Text>
                <Text style={s.payoutBody}>
                  Bookings are paid to the business, not to a personal account. Stripe will ask for
                  the company&rsquo;s EIN, its owners, and a photo ID for whoever signs — have those
                  to hand before you start.
                </Text>
                {payout?.canManage ? (
                  <TouchableOpacity
                    style={[s.saveBtn, connecting && s.submitDisabled]}
                    onPress={connectPayouts}
                    disabled={connecting}
                    activeOpacity={0.85}
                  >
                    {connecting
                      ? <ActivityIndicator size="small" color={colors.white} />
                      : <Text style={s.saveText}>
                          {payout?.hasAccount ? 'Continue setup' : 'Set up payouts'}
                        </Text>}
                  </TouchableOpacity>
                ) : (
                  <Text style={s.footnote}>
                    Only the facility owner can set this up.
                  </Text>
                )}
              </View>
            )}
          </>
        )}
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

  switcher: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  switchChip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.chip,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, maxWidth: 200,
  },
  switchChipOn: { borderColor: colors.gold, backgroundColor: colors.goldBg },
  switchText:   { color: colors.textSub, ...typography.metadata, fontWeight: '700' },
  switchTextOn: { color: colors.navy },

  facilityCard: {
    padding: spacing.lg, backgroundColor: colors.bg, borderRadius: radius.card,
    borderWidth: 1, borderColor: colors.border, gap: spacing.xs,
  },
  facilityName: { color: colors.navy, ...typography.sectionTitle },
  facilitySub:  { color: colors.textSub, ...typography.metadata },

  sectionHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  sectionLabel: { color: colors.navy, fontSize: 13, fontWeight: '800', letterSpacing: 0.8 },
  addLink: { color: colors.gold, fontSize: 13, fontWeight: '800' },
  empty: { color: colors.textSub, ...typography.body, lineHeight: 21 },

  courtRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md,
    backgroundColor: colors.bg, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border,
  },
  courtRetired: { opacity: 0.55 },
  courtName: { color: colors.navy, ...typography.cardTitle },
  courtSub:  { color: colors.textSub, ...typography.metadata, textTransform: 'capitalize' },
  roleChip: {
    color: colors.navy, fontSize: 11, fontWeight: '900', letterSpacing: 0.6,
    textTransform: 'uppercase', backgroundColor: colors.goldBg,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.chip,
    overflow: 'hidden',
  },

  editor: {
    padding: spacing.lg, backgroundColor: colors.bg, borderRadius: radius.card,
    borderWidth: 1.5, borderColor: colors.goldBorder, gap: spacing.sm,
  },
  editorTitle: { color: colors.navy, ...typography.cardTitle, marginBottom: spacing.xs },
  fieldLabel: { color: colors.textSub, ...typography.metadata, fontWeight: '700' },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    color: colors.navy, fontSize: 15, backgroundColor: colors.bg, minHeight: 44,
  },
  typeChip: {
    flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.button,
    borderWidth: 1.5, borderColor: colors.border,
  },
  typeChipOn: { borderColor: colors.gold, backgroundColor: colors.goldBg },
  typeText:   { color: colors.textSub, fontSize: 14, fontWeight: '700', textTransform: 'capitalize' },
  typeTextOn: { color: colors.navy, fontWeight: '800' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  card: {
    padding: spacing.xl, backgroundColor: colors.bg, borderRadius: radius.card,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center', gap: spacing.sm,
  },
  cardTitle: { color: colors.navy, ...typography.sectionTitle, textAlign: 'center' },
  cardBody:  { color: colors.textSub, ...typography.body, textAlign: 'center', lineHeight: 21 },

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
  submitDisabled: { opacity: 0.4 },

  footnote: { color: colors.textSub, ...typography.metadata, marginTop: spacing.sm },

  checkInBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.lg,
    backgroundColor: colors.goldBg, borderRadius: radius.card,
    borderWidth: 1.5, borderColor: colors.goldBorder,
  },
  checkInBtnText: { flex: 1, color: colors.navy, ...typography.cardTitle },

  payoutCard: {
    padding: spacing.lg, backgroundColor: colors.bg, borderRadius: radius.card,
    borderWidth: 1, borderColor: colors.border, gap: spacing.sm,
  },
  payoutTitle: { color: colors.navy, ...typography.cardTitle },
  payoutBody:  { color: colors.textSub, ...typography.body, lineHeight: 21 },
  payoutReady: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md,
    backgroundColor: colors.successBg, borderRadius: radius.card,
    borderWidth: 1, borderColor: colors.success,
  },
  payoutReadyText: { color: colors.navy, ...typography.body, flex: 1 },
});
