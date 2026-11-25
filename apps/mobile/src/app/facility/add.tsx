// Add a court (Phase 4b, 2026-11-25).
//
// A player proposes a court the directory is missing. The map pin comes from
// the phone itself — "I'm at the court" (GPS) or the device geocoder for a
// typed address — so this costs no Google API calls. Before sending, nearby
// listed courts are shown so a duplicate is caught here, not in review.
// Everything goes to submit_facility_submission() and waits for an admin.
//
// Entry points: Nearby search with no results, and the facility picker's
// "not listed" option. ?name= prefills the name from what was searched.

import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { colors, spacing } from '@/theme';
import { radius as shape, text } from '@shared/tokens';
import { stateCode } from '@shared/usStates';
import { useSession } from '@/hooks/useSession';
import { goBack } from '@/lib/navigation';
import { haptics } from '@/lib/haptics';
import {
  fetchDuplicateCandidates, submitFacilitySubmission, type DuplicateCandidate,
} from '@/lib/supabase/facilitySubmissions';

type Tri = 'yes' | 'no' | '';
type Pin = { latitude: number; longitude: number; label: string };

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export default function AddCourtScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const params = useLocalSearchParams<{ name?: string }>();

  const [name, setName] = useState(typeof params.name === 'string' ? params.name.slice(0, 120) : '');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [total, setTotal] = useState('');
  const [outdoor, setOutdoor] = useState('');
  const [indoor, setIndoor] = useState('');
  const [lights, setLights] = useState<Tri>('');
  const [isPublic, setIsPublic] = useState<Tri>('');
  const [note, setNote] = useState('');
  const [pin, setPin] = useState<Pin | null>(null);
  const [dupes, setDupes] = useState<DuplicateCandidate[] | null>(null);
  const [busy, setBusy] = useState<null | 'gps' | 'lookup' | 'send'>(null);
  const [error, setError] = useState<string | null>(null);

  /** Fill city/state/ZIP from the pin, never overwriting what was typed. */
  async function describe(lat: number, lng: number) {
    try {
      const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (!place) return;
      setCity(c => c || place.city || place.subregion || '');
      setState(s => s || stateCode(place.region) || '');
      setZip(z => z || (place.postalCode?.slice(0, 5) ?? ''));
      setAddress(a => a || [place.streetNumber, place.street].filter(Boolean).join(' '));
    } catch {
      // Offline or no geocoder: the player types city/state themselves.
    }
  }

  async function afterPin(p: Pin) {
    setPin(p);
    setDupes(await fetchDuplicateCandidates(name, p.latitude, p.longitude, 300));
  }

  async function locateMe() {
    setBusy('gps'); setError(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        setError('Location is off for the app. Type the address and tap “Find this address” instead.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const lat = round6(pos.coords.latitude);
      const lng = round6(pos.coords.longitude);
      await describe(lat, lng);
      await afterPin({ latitude: lat, longitude: lng, label: 'Your current location' });
    } catch {
      setError('Couldn’t get your location. Try again, or use the address instead.');
    } finally {
      setBusy(null);
    }
  }

  async function lookUp() {
    const query = [address, city, state, zip].map(s => s.trim()).filter(Boolean).join(', ');
    if (query.length < 4) { setError('Enter the address, or at least the city and state, first.'); return; }
    setBusy('lookup'); setError(null);
    try {
      const [hit] = await Location.geocodeAsync(query);
      if (!hit) { setError('We couldn’t find that address. Check it, or use “I’m at the court”.'); return; }
      const lat = round6(hit.latitude);
      const lng = round6(hit.longitude);
      await describe(lat, lng);
      await afterPin({ latitude: lat, longitude: lng, label: query });
    } catch {
      setError('Address lookup failed. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    setError(null);
    const st = stateCode(state);
    if (name.trim().length < 2) { setError('Add the court’s name.'); return; }
    if (city.trim().length < 2 || !st) { setError('Add the city and a valid state (for example FL).'); return; }
    if (!pin) { setError('Set the map pin: tap “I’m at the court” or “Find this address”.'); return; }

    const proposed: Record<string, unknown> = {
      name: name.trim(), city: city.trim(), state: st, latitude: pin.latitude, longitude: pin.longitude,
    };
    if (address.trim()) proposed.address = address.trim();
    if (/^\d{5}$/.test(zip.trim())) proposed.postal_code = zip.trim();
    for (const [k, v] of [['court_count', total], ['outdoor_courts', outdoor], ['indoor_courts', indoor]] as const) {
      if (v.trim()) proposed[k] = Math.min(100, Number(v));
    }
    if (lights) proposed.lighting = lights === 'yes';
    if (isPublic) proposed.public_access = isPublic === 'yes';

    setBusy('send');
    try {
      await submitFacilitySubmission({ kind: 'new', proposed, note });
      haptics.success();
      Alert.alert(
        'Thanks, we got it',
        'Our team reviews every new court before it goes live. We’ll let you know when it’s approved.',
        [{ text: 'OK', onPress: () => goBack('/(tabs)/nearby') }],
      );
    } catch (e) {
      haptics.error();
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  if (!user) {
    return (
      <View style={[st.center, { paddingTop: insets.top + 40 }]}>
        <Text style={st.title}>Sign in to add a court</Text>
        <Text style={st.sub}>Submissions come from players with an account, so our team can follow up if needed.</Text>
        <TouchableOpacity style={st.submit} onPress={() => router.push('/sign-in' as never)}>
          <Text style={st.submitText}>Sign in</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const triRow = (label: string, value: Tri, set: (v: Tri) => void) => (
    <View style={st.toggleRow}>
      <Text style={st.toggleLabel}>{label}</Text>
      <View style={st.chips}>
        {(['yes', 'no'] as const).map(v => (
          <TouchableOpacity key={v} style={[st.chip, value === v && st.chipOn]} onPress={() => set(value === v ? '' : v)}
            accessibilityRole="button" accessibilityState={{ selected: value === v }}>
            <Text style={[st.chipText, value === v && st.chipTextOn]}>{v === 'yes' ? 'Yes' : 'No'}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const field = (label: string, value: string, set: (v: string) => void, opts: Partial<React.ComponentProps<typeof TextInput>> = {}) => (
    <View style={{ gap: 6 }}>
      <Text style={st.label}>{label}</Text>
      <TextInput style={st.input} value={value} onChangeText={v => { set(v); setError(null); }}
        placeholderTextColor={colors.textSub} {...opts} />
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.page }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[st.container, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={st.back} onPress={() => goBack('/(tabs)/nearby')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={colors.navy} />
        </TouchableOpacity>

        <Text style={st.title}>Add a court</Text>
        <Text style={st.sub}>Know a place to play that isn’t listed? Our team reviews every submission before it goes live.</Text>

        <View style={st.card}>
          {field('Name *', name, setName, { maxLength: 120, placeholder: 'e.g. Payne Park Pickleball Courts' })}
          {field('Street address', address, setAddress, { maxLength: 200 })}
          <View style={st.row}>
            <View style={{ flex: 2 }}>{field('City *', city, setCity, { maxLength: 80 })}</View>
            <View style={{ flex: 1 }}>{field('State *', state, v => setState(v.toUpperCase().slice(0, 14)), { placeholder: 'FL', autoCapitalize: 'characters' })}</View>
          </View>
          {field('ZIP', zip, v => setZip(v.replace(/[^0-9]/g, '').slice(0, 5)), { keyboardType: 'number-pad' })}
        </View>

        <View style={st.card}>
          <Text style={st.label}>Map pin *</Text>
          <View style={st.row}>
            <TouchableOpacity style={st.pinBtn} onPress={() => { void locateMe(); }} disabled={!!busy}>
              {busy === 'gps' ? <ActivityIndicator color={colors.navy} /> : <Ionicons name="navigate-outline" size={17} color={colors.navy} />}
              <Text style={st.pinText}>I’m at the court</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.pinBtn} onPress={() => { void lookUp(); }} disabled={!!busy}>
              {busy === 'lookup' ? <ActivityIndicator color={colors.navy} /> : <Ionicons name="location-outline" size={17} color={colors.navy} />}
              <Text style={st.pinText}>Find this address</Text>
            </TouchableOpacity>
          </View>
          {pin && (
            <Text style={st.pinSet}>
              Pin set: {pin.label}.{' '}
              <Text style={st.link} onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${pin.latitude},${pin.longitude}`).catch(() => {})}>
                Check on map
              </Text>
            </Text>
          )}
          {dupes && dupes.length > 0 && (
            <View style={st.dupes}>
              <Text style={st.dupesTitle}>Is it one of these? They’re already listed nearby.</Text>
              {dupes.slice(0, 5).map(d => (
                <TouchableOpacity key={d.id} onPress={() => router.push(`/facility/${d.id}` as never)} style={st.dupeRow}>
                  <Text style={st.dupeName}>{d.name}</Text>
                  <Text style={st.dupeMeta}>{[d.address, d.city].filter(Boolean).join(', ')} · {Math.round(d.distance_meters)} m away</Text>
                </TouchableOpacity>
              ))}
              <Text style={st.dupeHint}>If yes, open it and use Suggest an Edit instead.</Text>
            </View>
          )}
        </View>

        <View style={st.card}>
          <View style={st.row}>
            <View style={{ flex: 1 }}>{field('Total', total, v => setTotal(v.replace(/[^0-9]/g, '').slice(0, 3)), { keyboardType: 'number-pad', placeholder: '?' })}</View>
            <View style={{ flex: 1 }}>{field('Outdoor', outdoor, v => setOutdoor(v.replace(/[^0-9]/g, '').slice(0, 3)), { keyboardType: 'number-pad', placeholder: '?' })}</View>
            <View style={{ flex: 1 }}>{field('Indoor', indoor, v => setIndoor(v.replace(/[^0-9]/g, '').slice(0, 3)), { keyboardType: 'number-pad', placeholder: '?' })}</View>
          </View>
          {triRow('Lights for night play', lights, setLights)}
          {triRow('Open to the public', isPublic, setIsPublic)}
          {field('Anything else? (optional)', note, setNote, {
            multiline: true, maxLength: 1000, textAlignVertical: 'top', style: [st.input, { minHeight: 80 }],
            placeholder: 'e.g. how you know about it, best entrance…',
          })}
        </View>

        {!!error && <Text style={st.error} accessibilityLiveRegion="polite">{error}</Text>}

        <TouchableOpacity style={[st.submit, busy === 'send' && { opacity: 0.6 }]} onPress={() => { void send(); }} disabled={!!busy}
          accessibilityRole="button">
          {busy === 'send' ? <ActivityIndicator color={colors.bg} /> : <Text style={st.submitText}>Send for review</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  container: { paddingHorizontal: spacing.lg, gap: spacing.md },
  center: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.xl, gap: spacing.md, backgroundColor: colors.page },
  back: { alignSelf: 'flex-start', paddingVertical: 4 },
  title: { color: colors.navy, fontSize: text.titleSm.size, fontWeight: '900' },
  sub: { color: colors.textSub, fontSize: text.body.size, fontWeight: '500', lineHeight: 21 },
  card: { backgroundColor: colors.bg, borderRadius: shape.card, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.sm },
  label: { color: colors.navy, fontSize: text.caption.size, fontWeight: '700' },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: shape.cta, paddingHorizontal: 12, paddingVertical: 11,
    color: colors.navy, fontSize: text.body.size, backgroundColor: colors.page,
  },
  pinBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: colors.border, borderRadius: shape.cta, paddingVertical: 12, backgroundColor: colors.bg,
  },
  pinText: { color: colors.navy, fontSize: text.caption.size, fontWeight: '800' },
  pinSet: { color: colors.textSub, fontSize: text.caption.size, fontWeight: '500', lineHeight: 18 },
  link: { color: colors.navy, fontWeight: '700', textDecorationLine: 'underline' },
  dupes: { backgroundColor: colors.goldBg, borderRadius: shape.cta, padding: spacing.md, gap: 8 },
  dupesTitle: { color: colors.navy, fontSize: text.caption.size, fontWeight: '800' },
  dupeRow: { gap: 2 },
  dupeName: { color: colors.navy, fontSize: text.body.size, fontWeight: '700', textDecorationLine: 'underline' },
  dupeMeta: { color: colors.textSub, fontSize: text.caption.size, fontWeight: '500' },
  dupeHint: { color: colors.textSub, fontSize: text.caption.size, fontWeight: '500' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  toggleLabel: { flex: 1, color: colors.navy, fontSize: text.body.size, fontWeight: '600' },
  chips: { flexDirection: 'row', gap: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  chipOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipText: { color: colors.navy, fontSize: text.caption.size, fontWeight: '700' },
  chipTextOn: { color: colors.bg },
  error: { color: colors.danger, fontSize: text.caption.size, fontWeight: '600' },
  submit: { backgroundColor: colors.navy, borderRadius: shape.cta, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  submitText: { color: colors.bg, fontSize: text.actionLarge.size, fontWeight: '800' },
});
