import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { fetchFacilities } from '@/lib/supabase/facilities';
import { useCurrentLocation } from '@/lib/location';

// The public handoff spot for a marketplace listing.
//
// Extracted from the create flow's Location step so the edit screen could offer
// the same thing without a second copy — the Marketplace map audit is explicit
// that parallel components and duplicated geographic-query logic are what to
// avoid here.
//
// Deliberately reuses fetchFacilities (the search_facilities_nearby RPC) rather
// than adding a listing-specific search: courts are courts, and that query is
// already the app's one real proximity search.

const L = {
  navy: colors.navy, gold: colors.gold, text: colors.text,
  textMuted: colors.textSub, border: colors.border,
};

/** Only what the UI shows plus the id the server derives the coordinate from. */
export type PickupFacility = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  latitude: number;
  longitude: number;
};

type Props = {
  facility: PickupFacility | null;
  onPick: (facility: PickupFacility) => void;
  onClear: () => void;
  /** Shown above the search box. Omit for the compact (edit-screen) variant. */
  hint?: string;
};

export function PickupCourtPicker({ facility, onPick, onClear, hint }: Props) {
  const { lat, lng } = useCurrentLocation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Awaited<ReturnType<typeof fetchFacilities>>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Nothing to search while a court is chosen — the list is replaced by the
    // confirmed row, so skip the round trip entirely.
    if (facility) return;
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      fetchFacilities({ lat, lng, radiusMiles: 50, query: query.trim() || undefined, limit: 12 })
        .then((rows) => { if (active) setResults(rows); })
        .catch(() => { if (active) setResults([]); })
        .finally(() => { if (active) setLoading(false); });
    }, query ? 300 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [lat, lng, query, facility]);

  if (facility) {
    return (
      <View style={s.selected}>
        <Ionicons name="location" size={18} color={L.gold} />
        <View style={{ flex: 1 }}>
          <Text style={s.selectedName} numberOfLines={1}>{facility.name}</Text>
          <Text style={s.selectedSub} numberOfLines={1}>
            {[facility.city, facility.state].filter(Boolean).join(', ')}
          </Text>
        </View>
        <TouchableOpacity onPress={onClear} accessibilityRole="button" accessibilityLabel="Change pickup court">
          <Text style={s.change}>Change</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View>
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
      <TextInput
        style={s.input}
        value={query}
        onChangeText={setQuery}
        placeholder="Search courts near you"
        placeholderTextColor={L.textMuted}
      />
      {loading && <ActivityIndicator style={{ marginTop: 12 }} color={L.gold} />}
      {!loading && results.length === 0 && (
        <Text style={s.empty}>No courts found nearby. You can leave this blank and just use your city.</Text>
      )}
      {results.map((f) => (
        <TouchableOpacity
          key={f.id}
          style={s.row}
          activeOpacity={0.75}
          onPress={() => onPick({
            id: f.id,
            name: f.name,
            city: f.city,
            state: f.state,
            latitude: Number(f.latitude),
            longitude: Number(f.longitude),
          })}
        >
          <Ionicons name="tennisball-outline" size={18} color={L.navy} />
          <View style={{ flex: 1 }}>
            <Text style={s.rowName} numberOfLines={1}>{f.name}</Text>
            <Text style={s.rowSub} numberOfLines={1}>
              {[f.city, f.state].filter(Boolean).join(', ')}
              {f.distanceMeters != null ? ` · ${(f.distanceMeters / 1609.344).toFixed(1)} mi` : ''}
            </Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  hint: { color: L.textMuted, fontSize: text.caption.size, lineHeight: 18, marginBottom: 10 },
  input: {
    borderWidth: 1, borderColor: L.border, borderRadius: shape.card,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: text.rowTitle.size, color: L.text,
  },
  selected: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: L.gold, borderRadius: shape.card,
    paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.goldLight,
  },
  selectedName: { color: L.text, fontWeight: '800', fontSize: text.rowTitle.size },
  selectedSub: { color: L.textMuted, fontSize: text.caption.size, marginTop: 2 },
  change: { color: L.gold, fontWeight: '800', fontSize: text.caption.size },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: L.border, borderRadius: shape.card,
    paddingHorizontal: 14, paddingVertical: 12, marginTop: 8,
  },
  rowName: { color: L.text, fontWeight: '700', fontSize: text.rowTitle.size },
  rowSub: { color: L.textMuted, fontSize: text.caption.size, marginTop: 2 },
  empty: { color: L.textMuted, fontSize: text.caption.size, marginTop: 12 },
});
