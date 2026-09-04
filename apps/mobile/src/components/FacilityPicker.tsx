import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Modal, FlatList, ActivityIndicator, SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import {
  fetchFacilities,
  facilityAccessType,
  type FacilityWithPrimaryPhoto,
} from '@/lib/supabase/facilities';
import { FALLBACK_LOCATION, useCurrentLocation } from '@/lib/location';
import { PickleballIcon } from './PickleballIcon';

// ─── Types ────────────────────────────────────────────────────────────────────

export type FacilityPickerValue =
  | { mode: 'facility'; facilityId: string; name: string; city: string; state: string; address: string }
  | { mode: 'manual'; text: string };

interface Props {
  value: FacilityPickerValue | null;
  onChange: (v: FacilityPickerValue) => void;
  lat?: number;
  lng?: number;
  radiusMiles?: number;
}

// ─── Theme ───────────────────────────────────────────────────────────────────

const L = {
  navy:    colors.navy,
  gold:    colors.gold,
  text:    colors.text,
  textSub: colors.textSub,
  bg:      colors.bg,
  page:    colors.page,
  border:  colors.border,
  white:   colors.white,
};


const ACCESS_COLOR: Record<string, string> = {
  public:     '#16A34A',
  membership: '#CA8A04',
  private:    '#DC2626',
};

// ─── Facility row in the modal list ──────────────────────────────────────────

function FacilityRow({
  facility,
  onSelect,
}: {
  facility: FacilityWithPrimaryPhoto;
  onSelect: () => void;
}) {
  const access = facilityAccessType(facility);
  const dist   = facility.distanceMeters != null
    ? ` · ${(facility.distanceMeters / 1609.344).toFixed(1)} mi`
    : '';
  return (
    <TouchableOpacity style={fr.row} onPress={onSelect} activeOpacity={0.75}>
      <View style={fr.iconWrap}>
        <PickleballIcon size={18} color={L.gold} />
      </View>
      <View style={fr.body}>
        <Text style={fr.name} numberOfLines={1}>{facility.name}</Text>
        <Text style={fr.meta}>
          {facility.city}, {facility.state}{dist}
          {'  ·  '}
          <Text style={[fr.access, { color: ACCESS_COLOR[access] }]}>
            {access.charAt(0).toUpperCase() + access.slice(1)}
          </Text>
        </Text>
      </View>
      <Text style={fr.courts}>{facility.court_count}c</Text>
    </TouchableOpacity>
  );
}

const fr = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border },
  iconWrap: { width: 34, height: 34, borderRadius: 17, backgroundColor: L.bg, borderWidth: 1, borderColor: L.border, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
  name: { fontSize: text.rowTitle.size, fontWeight: '700', color: L.navy },
  meta: { fontSize: text.caption.size, fontWeight: '500', color: L.textSub, marginTop: 1 },
  access: { fontWeight: '700' },
  courts: { fontSize: text.cardLabel.size, fontWeight: '800', letterSpacing: text.cardLabel.letterSpacing, color: L.textSub },
});

// ─── Picker modal ─────────────────────────────────────────────────────────────

export function FacilityPickerModal({
  visible,
  onClose,
  onSelectFacility,
  onSelectManual,
  lat,
  lng,
  radiusMiles = 20,
}: {
  visible: boolean;
  onClose: () => void;
  onSelectFacility: (f: FacilityWithPrimaryPhoto) => void;
  onSelectManual?: () => void;
  lat: number;
  lng: number;
  radiusMiles?: number;
}) {
  const [query,    setQuery]    = useState('');
  const [list,     setList]     = useState<FacilityWithPrimaryPhoto[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [loaded,   setLoaded]   = useState(false);
  // The failure used to be discarded (`.catch(() => setLoaded(true))`), leaving
  // an empty list with no message, no retry and nothing to diagnose from — the
  // same blank screen whether the network was down, the RPC errored, or there
  // genuinely are no courts nearby.
  const [error,    setError]    = useState<string | null>(null);

  const load = useCallback(() => {
    if (loaded) return;
    setLoading(true);
    setError(null);
    fetchFacilities({ lat, lng, radiusMiles, limit: 50 })
      .then(data => { setList(data); setLoaded(true); })
      .catch(() => { setError('Could not load nearby facilities.'); setLoaded(true); })
      .finally(() => setLoading(false));
  }, [lat, lng, loaded, radiusMiles]);

  const retry = useCallback(() => { setLoaded(false); setList([]); setError(null); }, []);

  React.useEffect(() => {
    setLoaded(false);
    setList([]);
  }, [lat, lng, radiusMiles]);

  // Load on open
  React.useEffect(() => { if (visible) load(); }, [visible, load]);

  // Typing searches the whole directory, not just the radius already fetched.
  //
  // Filtering the local list was the entire search: a facility outside the
  // radius — or absent because the initial load failed — could never be found
  // by typing its name, which reads as "search is broken" rather than "search
  // only covers what already loaded".
  const [remote, setRemote] = useState<FacilityWithPrimaryPhoto[]>([]);
  const [searching, setSearching] = useState(false);

  React.useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setRemote([]); setSearching(false); return; }

    let cancelled = false;
    setSearching(true);
    // Debounced so a query is not fired per keystroke.
    const timer = setTimeout(() => {
      fetchFacilities({ query: q, limit: 50 })
        .then(data => { if (!cancelled) setRemote(data); })
        .catch(() => { if (!cancelled) setRemote([]); })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, 350);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);

  const localMatches = query.trim()
    ? list.filter(f =>
        f.name.toLowerCase().includes(query.toLowerCase()) ||
        f.city.toLowerCase().includes(query.toLowerCase()),
      )
    : list;

  // Nearby matches first, then anything else the server found, de-duplicated.
  const filtered = query.trim()
    ? (() => {
        const seen = new Set(localMatches.map(f => f.id));
        return [...localMatches, ...remote.filter(f => !seen.has(f.id))];
      })()
    : localMatches;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={m.root}>
        {/* Header */}
        <View style={m.header}>
          <Text style={m.title}>Select Facility</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={22} color={L.navy} />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={m.searchWrap}>
          <Ionicons name="search-outline" size={16} color={L.textSub} />
          <TextInput
            style={m.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name or city…"
            placeholderTextColor={L.textSub}
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={16} color={L.textSub} />
            </TouchableOpacity>
          )}
        </View>

        {/* List */}
        {loading || searching ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={L.navy} />
        ) : error && list.length === 0 ? (
          <View style={m.empty}>
            <Ionicons name="cloud-offline-outline" size={30} color={L.border} />
            <Text style={m.emptyText}>{error}</Text>
            <TouchableOpacity onPress={retry} style={m.retryBtn} activeOpacity={0.8}>
              <Text style={m.retryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={f => f.id}
            renderItem={({ item }) => (
              <FacilityRow
                facility={item}
                onSelect={() => { onSelectFacility(item); onClose(); }}
              />
            )}
            ListEmptyComponent={
              <View style={m.empty}>
                <PickleballIcon size={32} color={L.border} />
                <Text style={m.emptyText}>
                  {query.trim()
                    ? `No facilities matching "${query.trim()}"`
                    : 'No facilities found nearby'}
                </Text>
              </View>
            }
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 100 }}
          />
        )}

        {/* Manual fallback */}
        {onSelectManual && (
          <View style={m.footer}>
            <TouchableOpacity style={m.manualBtn} onPress={() => { onSelectManual(); onClose(); }} activeOpacity={0.8}>
              <Ionicons name="create-outline" size={16} color={L.textSub} />
              <Text style={m.manualText}>Facility not listed? Enter manually</Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const m = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.white },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border },
  title: { fontSize: text.titleSm.size, fontWeight: '800', color: L.navy },
  retryBtn: { marginTop: 10, borderWidth: 1.5, borderColor: L.navy, borderRadius: shape.pill, paddingHorizontal: 18, paddingVertical: 8 },
  retryText: { color: L.navy, fontSize: text.action.size, fontWeight: '800' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 12, borderWidth: 1.5, borderColor: L.border, borderRadius: shape.cta, paddingHorizontal: 12, height: 44 },
  searchInput: { flex: 1, fontSize: text.body.size, fontWeight: '500', color: L.text },
  empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyText: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500' },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: L.border, padding: 12 },
  manualBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12 },
  manualText: { fontSize: text.caption.size, color: L.textSub, fontWeight: '500' },
});

// ─── FacilityPicker (exported) ────────────────────────────────────────────────

export function FacilityPicker({ value, onChange, lat, lng, radiusMiles = 20 }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const location = useCurrentLocation();
  const pickerLat = lat ?? location.lat ?? FALLBACK_LOCATION.lat;
  const pickerLng = lng ?? location.lng ?? FALLBACK_LOCATION.lng;

  function handleSelectFacility(f: FacilityWithPrimaryPhoto) {
    onChange({
      mode:       'facility',
      facilityId:  f.id,
      name:        f.name,
      city:        f.city,
      state:       f.state,
      address:     f.address,
    });
  }

  function handleSelectManual() {
    onChange({ mode: 'manual', text: '' });
  }

  // ── Facility selected ───────────────────────────────────────────────────────
  if (value?.mode === 'facility') {
    return (
      <>
        <TouchableOpacity style={p.chipWrap} onPress={() => setModalOpen(true)} activeOpacity={0.8}>
          <Ionicons name="location" size={16} color={L.gold} />
          <View style={{ flex: 1 }}>
            <Text style={p.chipName} numberOfLines={1}>{value.name}</Text>
            <Text style={p.chipSub}>{value.city}, {value.state}</Text>
          </View>
          <Ionicons name="chevron-down" size={14} color={L.textSub} />
        </TouchableOpacity>

        <TouchableOpacity
          style={p.switchLink}
          onPress={handleSelectManual}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Text style={p.switchText}>Enter location manually instead</Text>
        </TouchableOpacity>

        <FacilityPickerModal
          visible={modalOpen}
          onClose={() => setModalOpen(false)}
          onSelectFacility={handleSelectFacility}
          onSelectManual={handleSelectManual}
          lat={pickerLat}
          lng={pickerLng}
          radiusMiles={radiusMiles}
        />
      </>
    );
  }

  // ── Manual text input ───────────────────────────────────────────────────────
  if (value?.mode === 'manual') {
    return (
      <>
        <TouchableOpacity
          style={p.switchLink}
          onPress={() => setModalOpen(true)}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Ionicons name="search-outline" size={13} color={L.gold} />
          <Text style={[p.switchText, { color: L.gold }]}>Search facility directory</Text>
        </TouchableOpacity>

        <View style={p.inputWrap}>
          <Ionicons name="location-outline" size={16} color={L.textSub} />
          <TextInput
            style={p.input}
            value={value.text}
            onChangeText={t => onChange({ mode: 'manual', text: t })}
            placeholder="Enter court name or address"
            placeholderTextColor={L.textSub}
            returnKeyType="done"
          />
          {value.text.length > 0 && (
            <TouchableOpacity
              onPress={() => onChange({ mode: 'manual', text: '' })}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={18} color={L.textSub} />
            </TouchableOpacity>
          )}
        </View>

        <FacilityPickerModal
          visible={modalOpen}
          onClose={() => setModalOpen(false)}
          onSelectFacility={(f: FacilityWithPrimaryPhoto) => { handleSelectFacility(f); setModalOpen(false); }}
          onSelectManual={handleSelectManual}
          lat={pickerLat}
          lng={pickerLng}
          radiusMiles={radiusMiles}
        />
      </>
    );
  }

  // ── Nothing selected (initial state) ───────────────────────────────────────
  return (
    <>
      <TouchableOpacity style={p.placeholder} onPress={() => setModalOpen(true)} activeOpacity={0.8}>
        <Ionicons name="search-outline" size={16} color={L.textSub} />
        <Text style={p.placeholderText}>Search nearby facilities…</Text>
        <Ionicons name="chevron-down" size={14} color={L.textSub} />
      </TouchableOpacity>

      <TouchableOpacity
        style={[p.switchLink, { marginTop: 8 }]}
        onPress={handleSelectManual}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <Text style={p.switchText}>Enter location manually instead</Text>
      </TouchableOpacity>

      <FacilityPickerModal
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        onSelectFacility={handleSelectFacility}
        onSelectManual={handleSelectManual}
        lat={pickerLat}
        lng={pickerLng}
        radiusMiles={radiusMiles}
      />
    </>
  );
}

const p = StyleSheet.create({
  placeholder: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderColor: L.border, borderRadius: shape.cta, paddingHorizontal: 12, height: 46, backgroundColor: L.bg },
  placeholderText: { flex: 1, fontSize: text.caption.size, fontWeight: '500', color: L.textSub },
  chipWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderColor: L.gold, borderRadius: shape.cta, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: L.bg },
  chipName: { fontSize: text.rowTitle.size, fontWeight: '700', color: L.navy },
  chipSub: { fontSize: text.caption.size, fontWeight: '500', color: L.textSub, marginTop: 1 },
  switchLink: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  switchText: { fontSize: text.caption.size, color: L.textSub, fontWeight: '500', textDecorationLine: 'underline' },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderColor: L.border, borderRadius: shape.cta, paddingHorizontal: 12, height: 46, backgroundColor: L.bg, marginTop: 8 },
  input: { flex: 1, fontSize: text.body.size, fontWeight: '500', color: L.text },
});




