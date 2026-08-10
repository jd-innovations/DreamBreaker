import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';
import { facilityAccessType, type FacilityDetail } from '@/lib/supabase/facilities';

const L = {
  navy:     colors.navy,
  gold:     colors.gold,
  text:     colors.text,
  textSub:  colors.textSub,
  border:   colors.border,
  bg:       colors.bg,
};

const ACCESS_BADGE = {
  public:     { label: 'Public',     bg: '#DCFCE7', color: '#16A34A' },
  membership: { label: 'Membership', bg: '#FEF9C3', color: '#CA8A04' },
  private:    { label: 'Private',    bg: '#FEE2E2', color: '#DC2626' },
};

export function FacilityCard({ facility }: { facility: FacilityDetail }) {
  const access = facilityAccessType(facility);
  const badge  = ACCESS_BADGE[access];

  return (
    <TouchableOpacity
      style={s.card}
      activeOpacity={0.85}
      onPress={() => router.push(`/facility/${facility.id}` as never)}
    >
      <View style={s.nameRow}>
        <Text style={s.name}>{facility.name}</Text>
        {facility.verified && (
          <View style={s.verBadge}>
            <Ionicons name="shield-checkmark" size={10} color="#2563EB" />
            <Text style={s.verText}>Verified</Text>
          </View>
        )}
      </View>
      <View style={s.meta}>
        <View style={[s.accessBadge, { backgroundColor: badge.bg }]}>
          <Text style={[s.accessText, { color: badge.color }]}>{badge.label}</Text>
        </View>
        <Text style={s.courts}>{facility.court_count} {facility.court_count === 1 ? 'Court' : 'Courts'}</Text>
        <Text style={s.dot}>·</Text>
        <Text style={s.loc}>{facility.city}, {facility.state}</Text>
      </View>
      <View style={s.viewPill}>
        <Text style={s.viewText}>View Facility</Text>
        <Ionicons name="chevron-forward" size={13} color={L.gold} />
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card:        { backgroundColor: L.bg, borderWidth: 1, borderColor: L.border, borderRadius: 14, padding: 14, marginHorizontal: 16, marginBottom: 12, gap: 10 },
  nameRow:     { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  name:        { color: L.navy, fontSize: 14, fontWeight: '800', flexShrink: 1 },
  verBadge:    { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#DBEAFE', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  verText:     { fontSize: 9, fontWeight: '800', color: '#2563EB', letterSpacing: 0.2 },
  meta:        { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  accessBadge: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  accessText:  { fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },
  courts:      { color: L.textSub, fontSize: 11, fontWeight: '600' },
  dot:         { color: L.border, fontSize: 11 },
  loc:         { color: L.textSub, fontSize: 11, fontWeight: '500' },
  viewPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-end',
    borderWidth: 1.5, borderColor: L.gold, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  viewText:    { color: L.gold, fontSize: 12, fontWeight: '700' },
});
