import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { VenueMapCard } from './VenueMapCard';

// The LOCATION section: a map well over the venue's name, address and actions.
//
// This markup lived only in community/[id].tsx, which is why putting the same
// section on the tournament screen looked like new work — VenueMapCard (the map
// tile) was already shared, but the card around it never was. Extracted so the
// third screen that wants it imports rather than copies.
//
// Deliberately dumb: it takes strings and callbacks, not an event, tournament
// or facility. Not named EventLocationCard for that reason — a tournament is
// not a community event, and a name implying otherwise would tell the next
// caller this is off limits to them. It renders a venue; it does not know or
// care what is being held there. Screens reach the same fields under different
// names, and teaching it every shape would put screen-specific branching in
// the one file that is supposed to be screen-agnostic.

type Props = {
  name: string;
  /** Rendered one per line under the name. Empty strings are dropped. */
  addressLines: (string | null | undefined)[];
  /** Both required to draw a map; otherwise the placeholder shows. */
  latitude?: number | null;
  longitude?: number | null;
  verified?: boolean;
  /** What to hand the maps app — an address, or "lat,lng" when known. */
  directionsQuery: string;
  /** Optional row between the address and the buttons (badges, court counts). */
  meta?: React.ReactNode;
  /** Omitted when there is no facility record to open. */
  onViewFacility?: () => void;
};

export default function LocationCard({
  name, addressLines, latitude, longitude, verified, directionsQuery, meta, onViewFacility,
}: Props) {
  const hasCoords = latitude != null && longitude != null;

  return (
    <View style={s.card}>
      <View style={s.mapWell}>
        {hasCoords ? (
          <VenueMapCard latitude={latitude} longitude={longitude} name={name} />
        ) : (
          <>
            <Ionicons name="map-outline" size={36} color={colors.textSub} />
            <Text style={s.mapText}>Map preview</Text>
          </>
        )}
      </View>

      <View style={s.info}>
        <View style={s.titleRow}>
          <Text style={s.venue}>{name}</Text>
          {verified && (
            <View style={s.verifiedBadge}>
              <Ionicons name="shield-checkmark" size={11} color="#2563EB" />
              <Text style={s.verifiedText}>VERIFIED</Text>
            </View>
          )}
        </View>

        {addressLines.filter(Boolean).map((line, i) => (
          <Text key={`${line}-${i}`} style={s.addr}>{line}</Text>
        ))}

        {meta}

        <View style={s.btnRow}>
          <TouchableOpacity
            style={s.btn}
            onPress={() => {
              const q = encodeURIComponent(directionsQuery);
              // Apple Maps first on the assumption of iOS, but the scheme is a
              // plain https URL, so Android resolves it too — the catch is for
              // a device with no handler at all, not for the wrong platform.
              Linking.openURL(`https://maps.apple.com/?q=${q}`).catch(() =>
                Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`),
              );
            }}
          >
            <Ionicons name="navigate-outline" size={14} color={colors.gold} />
            <Text style={s.btnText}>Get Directions</Text>
          </TouchableOpacity>

          {onViewFacility && (
            <TouchableOpacity style={s.btn} onPress={onViewFacility}>
              <Ionicons name="business-outline" size={14} color={colors.gold} />
              <Text style={s.btnText}>View Facility</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border,
    borderRadius: shape.card, overflow: 'hidden',
  },
  mapWell: {
    height: 130, backgroundColor: '#F0F4FA',
    alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
  },
  mapText: { color: colors.textSub, fontSize: text.caption.size, fontWeight: '500' },
  info: { padding: spacing.md, gap: spacing.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  venue: { color: colors.navy, fontSize: text.rowValue.size, fontWeight: '800', flexShrink: 1 },
  verifiedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: '#DBEAFE', borderRadius: shape.pill,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
  },
  verifiedText: { fontSize: 9, fontWeight: '800', color: '#2563EB', letterSpacing: 0.4 },
  addr: { color: colors.textSub, fontSize: text.caption.size, fontWeight: '500' },
  btnRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, justifyContent: 'center' },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    borderWidth: 1.5, borderColor: colors.gold, borderRadius: shape.cta,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  btnText: { color: colors.gold, fontSize: text.controlLabel.size, fontWeight: '700' },
});
