import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator,
  Alert, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, radius } from '@/theme';
import { goBack } from '@/lib/navigation';
import { useSession } from '@/hooks/useSession';
import { DirectorOnly } from '@/components/DirectorOnly';
import { supabase } from '@/lib/supabase';
import {
  directorAddRegistration, fetchDirectorDivisions, searchRegistrableProfiles,
  fetchDivisionRoster,
  type DirectorDivision, type RegistrableProfile, type RosterEntry, type Participant,
} from '@/lib/supabase/directorRegistrations';

// Director manual registration screen. Free divisions only — the RPC refuses a
// priced division, and this screen refuses to let you pick one rather than
// letting the server say no after you have filled in a whole team.
//
// Director-only, via the shared DirectorOnly guard like the rest of the
// director surfaces. The guard also checks is_approved_director(), which the
// inline ownership check this replaced did not — and it resolves before the
// screen mounts, so nothing below runs for a non-director. RLS and
// director_add_tournament_registration() remain the real enforcement.

const L = {
  bg: colors.bg, page: colors.page, navy: colors.navy, gold: colors.gold,
  goldBg: colors.goldBg, text: colors.text, textSub: colors.textSub, border: colors.border,
  white: colors.white, success: colors.success,
};

type Slot = 'player' | 'partner';

// A slot being filled: either searching for an existing profile, or typing a guest.
type SlotDraft = {
  mode: 'profile' | 'guest';
  query: string;
  results: RegistrableProfile[];
  searching: boolean;
  chosen: RegistrableProfile | null;
  guestName: string;
  guestPhone: string;
  guestEmail: string;
};

const emptySlot: SlotDraft = {
  mode: 'profile', query: '', results: [], searching: false,
  chosen: null, guestName: '', guestPhone: '', guestEmail: '',
};

function slotToParticipant(slot: SlotDraft): Participant | null {
  if (slot.mode === 'profile') {
    return slot.chosen
      ? { kind: 'profile', profileId: slot.chosen.id, displayName: slot.chosen.fullName }
      : null;
  }
  const name = slot.guestName.trim();
  if (!name) return null;
  return {
    kind: 'guest',
    guest: {
      displayName: name,
      phone: slot.guestPhone.trim() || undefined,
      email: slot.guestEmail.trim() || undefined,
    },
  };
}

function slotLabel(slot: SlotDraft): string {
  const p = slotToParticipant(slot);
  if (!p) return '—';
  return p.kind === 'profile' ? p.displayName : `${p.guest.displayName} (guest)`;
}

function AddRegistrationScreen() {
  const insets = useSafeAreaInsets();
  const { id: tournamentId } = useLocalSearchParams<{ id: string }>();
  const { user, loading: sessionLoading } = useSession();

  const [loading, setLoading] = useState(true);
  const [tournamentName, setTournamentName] = useState('');
  const [divisions, setDivisions] = useState<DirectorDivision[]>([]);
  const [divisionId, setDivisionId] = useState<string | null>(null);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [playerSlot, setPlayerSlot] = useState<SlotDraft>(emptySlot);
  const [partnerSlot, setPartnerSlot] = useState<SlotDraft>(emptySlot);

  const division = divisions.find(d => d.id === divisionId) ?? null;

  const load = useCallback(async () => {
    if (sessionLoading) return;
    if (!tournamentId || !user?.id) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data: t } = await supabase
        .from('tournaments')
        .select('name')
        .eq('id', tournamentId)
        .maybeSingle();

      setTournamentName(t?.name ?? '');

      const divs = await fetchDirectorDivisions(tournamentId);
      setDivisions(divs);
      // Preselect the first division manual registration can actually use.
      setDivisionId(prev => prev ?? divs.find(d => d.manualEligible)?.id ?? null);
    } finally {
      setLoading(false);
    }
  }, [tournamentId, user?.id, sessionLoading]);

  useEffect(() => { load(); }, [load]);

  const refreshRoster = useCallback(async () => {
    if (!divisionId) { setRoster([]); return; }
    setRoster(await fetchDivisionRoster(divisionId));
  }, [divisionId]);

  useEffect(() => { refreshRoster(); }, [refreshRoster]);

  // Debounced profile search per slot.
  const runSearch = useCallback(async (slot: Slot, query: string) => {
    const setter = slot === 'player' ? setPlayerSlot : setPartnerSlot;
    setter(s => ({ ...s, query, searching: query.trim().length >= 2 }));
    if (query.trim().length < 2) {
      setter(s => ({ ...s, results: [], searching: false }));
      return;
    }
    const results = await searchRegistrableProfiles(query);
    setter(s => (s.query === query ? { ...s, results, searching: false } : s));
  }, []);

  function resetForm() {
    setPlayerSlot(emptySlot);
    setPartnerSlot(emptySlot);
  }

  async function handleSubmit() {
    if (!division || !tournamentId || submitting) return;

    const player = slotToParticipant(playerSlot);
    if (!player) {
      Alert.alert('Player Required', 'Choose an existing player or enter a guest name.');
      return;
    }

    let partner: Participant | undefined;
    if (division.requiresPartner) {
      const p = slotToParticipant(partnerSlot);
      if (!p) {
        Alert.alert('Partner Required', `${division.name} is a doubles division — add a partner.`);
        return;
      }
      partner = p;
    }

    setSubmitting(true);
    try {
      const result = await directorAddRegistration({
        tournamentId,
        divisionId: division.id,
        player,
        partner,
      });

      if (!result.ok) {
        Alert.alert('Could Not Add', result.message);
        return;
      }

      resetForm();
      await Promise.all([refreshRoster(), load()]);
      Alert.alert(
        'Added',
        partner
          ? `${slotLabel(playerSlot)} and ${slotLabel(partnerSlot)} are registered for ${division.name}.`
          : `${slotLabel(playerSlot)} is registered for ${division.name}.`,
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || sessionLoading) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color={L.navy} />
      </View>
    );
  }

  const eligible = divisions.filter(d => d.manualEligible);

  return (
    <KeyboardAvoidingView
      style={[s.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style="dark" />

      <View style={s.header}>
        <TouchableOpacity style={s.iconBtn} onPress={() => goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={L.navy} />
        </TouchableOpacity>
        <Text style={s.title}>Add Registration</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.screenH, paddingBottom: insets.bottom + 48 }}
        keyboardShouldPersistTaps="handled"
      >
        {!!tournamentName && <Text style={s.subtitle}>{tournamentName}</Text>}

        {/* ── Division ─────────────────────────────────────────────────── */}
        <View style={s.card}>
          <Text style={s.sectionTitle}>Division</Text>
          {eligible.length === 0 ? (
            <Text style={s.emptyText}>
              No free divisions in this tournament. Manual registration is only available for
              divisions with no entry fee.
            </Text>
          ) : (
            eligible.map(d => {
              const active = d.id === divisionId;
              return (
                <TouchableOpacity
                  key={d.id}
                  style={[s.choiceRow, active && s.choiceRowActive]}
                  activeOpacity={0.8}
                  onPress={() => { setDivisionId(d.id); resetForm(); }}
                >
                  <Ionicons
                    name={active ? 'radio-button-on' : 'radio-button-off'}
                    size={18}
                    color={active ? L.navy : L.border}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={s.choiceLabel}>{d.name}</Text>
                    <Text style={s.choiceMeta}>
                      {d.requiresPartner ? 'Doubles' : 'Singles'} · {d.spotsFilled}/{d.drawSize} spots
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}

          {divisions.some(d => !d.manualEligible) && (
            <View style={s.noticeRow}>
              <Ionicons name="information-circle-outline" size={15} color={L.textSub} />
              <Text style={s.noticeText}>
                {divisions.filter(d => !d.manualEligible).map(d => d.name).join(', ')} charge an
                entry fee and can&apos;t be added manually yet.
              </Text>
            </View>
          )}
        </View>

        {division && (
          <>
            <SlotEditor
              heading={division.requiresPartner ? 'Player 1' : 'Player'}
              slot={playerSlot}
              setSlot={setPlayerSlot}
              onQuery={q => runSearch('player', q)}
            />

            {division.requiresPartner && (
              <SlotEditor
                heading="Player 2"
                slot={partnerSlot}
                setSlot={setPartnerSlot}
                onQuery={q => runSearch('partner', q)}
              />
            )}

            <TouchableOpacity
              style={[s.primaryBtn, submitting && { opacity: 0.7 }]}
              activeOpacity={0.88}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? <ActivityIndicator size="small" color={L.white} /> : (
                <Text style={s.primaryBtnText}>
                  {division.requiresPartner ? 'Add Team' : 'Add Player'}
                </Text>
              )}
            </TouchableOpacity>

            <Text style={s.footnote}>
              Adds a normal registration — it appears in check-in and bracket generation like any
              other. No payment is collected.
            </Text>
          </>
        )}

        {/* ── Current roster ───────────────────────────────────────────── */}
        {division && (
          <View style={s.card}>
            <Text style={s.sectionTitle}>{division.name} Roster ({roster.length})</Text>
            {roster.length === 0 ? (
              <Text style={s.emptyText}>Nobody registered yet.</Text>
            ) : (
              roster.map(r => (
                <View key={r.registrationId} style={s.rosterRow}>
                  <Ionicons
                    name={r.isGuest ? 'person-outline' : 'person-circle-outline'}
                    size={16}
                    color={r.isGuest ? L.textSub : L.gold}
                  />
                  <Text style={s.rosterName} numberOfLines={1}>
                    {r.playerName}{r.partnerName ? ` & ${r.partnerName}` : ''}
                  </Text>
                  {r.directorAdded && <Text style={s.rosterTag}>added</Text>}
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Slot editor ──────────────────────────────────────────────────────────────

function SlotEditor({
  heading, slot, setSlot, onQuery,
}: {
  heading: string;
  slot: SlotDraft;
  setSlot: React.Dispatch<React.SetStateAction<SlotDraft>>;
  onQuery: (q: string) => void;
}) {
  return (
    <View style={s.card}>
      <Text style={s.sectionTitle}>{heading}</Text>

      <View style={s.segment}>
        {(['profile', 'guest'] as const).map(mode => {
          const active = slot.mode === mode;
          return (
            <TouchableOpacity
              key={mode}
              style={[s.segmentBtn, active && s.segmentBtnActive]}
              activeOpacity={0.85}
              onPress={() => setSlot(x => ({ ...x, mode }))}
            >
              <Text style={[s.segmentText, active && s.segmentTextActive]}>
                {mode === 'profile' ? 'App user' : 'Guest'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {slot.mode === 'profile' ? (
        slot.chosen ? (
          <View style={s.chosenRow}>
            <Ionicons name="checkmark-circle" size={18} color={L.success} />
            <Text style={s.chosenName}>{slot.chosen.fullName}</Text>
            <TouchableOpacity onPress={() => setSlot(x => ({ ...x, chosen: null, query: '', results: [] }))}>
              <Text style={s.clearText}>Change</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <TextInput
              style={s.input}
              placeholder="Search players by name"
              placeholderTextColor={L.textSub}
              value={slot.query}
              onChangeText={onQuery}
              autoCorrect={false}
            />
            {slot.searching && <ActivityIndicator size="small" color={L.navy} style={{ marginTop: 8 }} />}
            {slot.results.map(p => (
              <TouchableOpacity
                key={p.id}
                style={s.resultRow}
                activeOpacity={0.8}
                onPress={() => setSlot(x => ({ ...x, chosen: p, results: [], query: '' }))}
              >
                <Ionicons name="person-circle-outline" size={18} color={L.gold} />
                <Text style={s.resultName}>{p.fullName}</Text>
              </TouchableOpacity>
            ))}
            {!slot.searching && slot.query.trim().length >= 2 && slot.results.length === 0 && (
              <Text style={s.emptyText}>
                No players found. Switch to Guest to add someone without an account.
              </Text>
            )}
          </>
        )
      ) : (
        <>
          <TextInput
            style={s.input}
            placeholder="Full name (required)"
            placeholderTextColor={L.textSub}
            value={slot.guestName}
            onChangeText={t => setSlot(x => ({ ...x, guestName: t }))}
          />
          <TextInput
            style={s.input}
            placeholder="Phone (optional)"
            placeholderTextColor={L.textSub}
            value={slot.guestPhone}
            onChangeText={t => setSlot(x => ({ ...x, guestPhone: t }))}
            keyboardType="phone-pad"
          />
          <TextInput
            style={s.input}
            placeholder="Email (optional)"
            placeholderTextColor={L.textSub}
            value={slot.guestEmail}
            onChangeText={t => setSlot(x => ({ ...x, guestEmail: t }))}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Text style={s.noticeText}>
            A guest is a roster entry only — no account is created and no email is sent.
          </Text>
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
  subtitle: { color: L.textSub, fontSize: 13, fontWeight: '600', marginTop: spacing.sm },

  card: {
    backgroundColor: L.bg, borderRadius: radius.card, borderWidth: 1, borderColor: L.border,
    padding: spacing.lg, marginTop: spacing.md,
  },
  sectionTitle: { color: L.navy, fontSize: 13, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: spacing.sm },
  emptyText: { color: L.textSub, fontSize: 13, fontWeight: '500', lineHeight: 18 },

  choiceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  choiceRowActive: {},
  choiceLabel: { color: L.text, fontSize: 14, fontWeight: '700' },
  choiceMeta: { color: L.textSub, fontSize: 12, fontWeight: '500', marginTop: 2 },

  noticeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: spacing.sm },
  noticeText: { flex: 1, color: L.textSub, fontSize: 12, fontWeight: '500', lineHeight: 17, marginTop: 6 },

  segment: { flexDirection: 'row', backgroundColor: L.page, borderRadius: radius.button, padding: 3, marginBottom: spacing.sm },
  segmentBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: radius.button - 2 },
  segmentBtnActive: { backgroundColor: L.navy },
  segmentText: { color: L.textSub, fontSize: 13, fontWeight: '700' },
  segmentTextActive: { color: L.white },

  input: {
    borderWidth: 1, borderColor: L.border, borderRadius: radius.button,
    paddingHorizontal: 12, paddingVertical: 10, color: L.text, fontSize: 14, marginTop: 8,
  },

  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: L.border },
  resultName: { flex: 1, color: L.text, fontSize: 14, fontWeight: '600' },

  chosenRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  chosenName: { flex: 1, color: L.text, fontSize: 14, fontWeight: '700' },
  clearText: { color: L.navy, fontSize: 13, fontWeight: '700' },

  rosterRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: L.border },
  rosterName: { flex: 1, color: L.text, fontSize: 14, fontWeight: '600' },
  rosterTag: { color: L.gold, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },

  primaryBtn: { backgroundColor: L.navy, borderRadius: radius.button, paddingVertical: 16, alignItems: 'center', marginTop: spacing.xl },
  primaryBtnText: { color: L.white, fontSize: 15, fontWeight: '800' },
  footnote: { color: L.textSub, fontSize: 11, fontWeight: '500', textAlign: 'center', marginTop: spacing.md },
});

// Director-only route. The screen body above is mounted only after DirectorOnly
// confirms the signed-in user directs this tournament, so its effects and
// fetches never run for anyone else.
export default function AddRegistrationScreenRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <DirectorOnly tournamentId={id}>
      <AddRegistrationScreen />
    </DirectorOnly>
  );
}
