import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Switch, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { goBack } from '@/lib/navigation';
import { StatusBar } from 'expo-status-bar';

import { colors } from '@/theme';
import { useCurrentLocation, FALLBACK_LOCATION_LABEL } from '@/lib/location';
import { useLocationSettings } from '@/hooks/useLocationSettings';

// Theme-backed alias â€” brand values resolve from @/theme.
const L = {
  bg:        colors.bg,
  page:      colors.page,
  navy:      colors.navy,
  blue:      '#007AFF',
  gold:      colors.gold,
  goldBg:    colors.goldBg,
  goldBorder:colors.goldBorder,
  text:      colors.text,
  textSub:   colors.textSub,
  textMuted: colors.textSub,
  border:    colors.border,
  div:       colors.border,
  green:     colors.success,
  greenBg:   colors.successBg,
};

// â”€â”€â”€ Section header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function SectionHeader({ label }: { label: string }) {
  return <Text style={s.sectionHeader}>{label}</Text>;
}

// â”€â”€â”€ Group container â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function Group({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[s.group, style]}>{children}</View>;
}

// â”€â”€â”€ Thin divider â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function Div() {
  return <View style={s.div} />;
}

// â”€â”€â”€ Full-width radius segmented control â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function RadiusControl({
  label, sub, options, value, onChange,
}: {
  label: string; sub: string;
  options: string[]; value: string; onChange: (v: string) => void;
}) {
  return (
    <View style={s.radiusWrap}>
      <View style={s.radiusHeader}>
        <View style={{ flex: 1 }}>
          <Text style={s.radiusLabel}>{label}</Text>
          <Text style={s.radiusSub}>{sub}</Text>
        </View>
        <Ionicons name="information-circle-outline" size={20} color={L.blue} />
      </View>
      <View style={s.segRow}>
        {options.map((opt, i) => {
          const active = opt === value;
          const isFirst = i === 0;
          const isLast  = i === options.length - 1;
          return (
            <TouchableOpacity
              key={opt}
              style={[
                s.segBtn,
                isFirst  && s.segFirst,
                isLast   && s.segLast,
                active   && s.segActive,
              ]}
              onPress={() => onChange(opt)}
              activeOpacity={0.75}
            >
              <Text style={[s.segText, active && s.segTextActive]}>{opt}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// â”€â”€â”€ Toggle row with icon â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function IconToggleRow({
  icon, label, sub, value, onChange, last,
}: {
  icon: string; label: string; sub: string;
  value: boolean; onChange: (v: boolean) => void; last?: boolean;
}) {
  return (
    <>
      <View style={s.toggleRow}>
        <View style={s.iconCircle}>
          <Ionicons name={icon as never} size={18} color={L.gold} />
        </View>
        <View style={s.toggleText}>
          <Text style={s.toggleLabel}>{label}</Text>
          <Text style={s.toggleSub}>{sub}</Text>
        </View>
        <Switch
          value={value}
          onValueChange={onChange}
          trackColor={{ false: '#D1D1D6', true: L.green }}
          thumbColor="#FFFFFF"
          ios_backgroundColor="#D1D1D6"
        />
      </View>
      {!last && <Div />}
    </>
  );
}

// â”€â”€â”€ Simple toggle row (no icon) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ToggleRow({
  label, sub, value, onChange, last,
}: {
  label: string; sub: string; value: boolean; onChange: (v: boolean) => void; last?: boolean;
}) {
  return (
    <>
      <View style={s.toggleRow}>
        <View style={s.toggleText}>
          <Text style={s.toggleLabel}>{label}</Text>
          <Text style={s.toggleSub}>{sub}</Text>
        </View>
        <Switch
          value={value}
          onValueChange={onChange}
          trackColor={{ false: '#D1D1D6', true: L.green }}
          thumbColor="#FFFFFF"
          ios_backgroundColor="#D1D1D6"
        />
      </View>
      {!last && <Div />}
    </>
  );
}

// â”€â”€â”€ Main screen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Coarse relative-time label for the "last updated" line.
function relativeTime(date: Date | null): string {
  if (!date) return '—';
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return 'Just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export default function LocationSettingsScreen() {
  const insets = useSafeAreaInsets();

  // ── Live device location ──
  const location = useCurrentLocation();
  const [placeLabel, setPlaceLabel] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt]   = useState<Date | null>(null);

  // Reverse-geocode coordinates → "City, State" and stamp the update time
  // whenever a fresh fix lands.
  useEffect(() => {
    if (location.loading) return;
    setUpdatedAt(new Date());
    let cancelled = false;
    (async () => {
      try {
        const results = await Location.reverseGeocodeAsync({
          latitude: location.lat,
          longitude: location.lng,
        });
        const r = results[0];
        if (!cancelled && r) {
          const label = [r.city ?? r.subregion ?? r.district, r.region].filter(Boolean).join(', ');
          setPlaceLabel(label || null);
        }
      } catch {
        // Reverse geocoding unavailable (offline / no provider) — fall back below.
      }
    })();
    return () => { cancelled = true; };
  }, [location.lat, location.lng, location.loading]);

  const cityLabel = placeLabel
    ?? (location.loading ? 'Locating…' : FALLBACK_LOCATION_LABEL);

  // ── Persisted discovery / privacy preferences ──
  const { settings, update } = useLocationSettings();

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* â”€â”€ Header â”€â”€ */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={L.blue} />
          <Text style={s.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Location</Text>
        <View style={{ width: 80 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
      >
        {/* â”€â”€ Current Location â”€â”€ */}
        <SectionHeader label="CURRENT LOCATION" />
        <Group>
          <View style={s.locationCard}>
            {/* Pin icon */}
            <View style={s.pinCircle}>
              <Ionicons name="location" size={22} color={L.gold} />
            </View>

            {/* City + timestamp */}
            <View style={s.locationInfo}>
              <Text style={s.locationCity}>{cityLabel}</Text>
              <Text style={s.locationTime}>Last updated: {relativeTime(updatedAt)}</Text>
              <TouchableOpacity
                style={s.refreshRow}
                activeOpacity={0.7}
                onPress={() => { void location.refresh(); }}
                disabled={location.loading}
              >
                {location.loading ? (
                  <ActivityIndicator size="small" color={L.blue} />
                ) : (
                  <Ionicons name="refresh" size={14} color={L.blue} />
                )}
                <Text style={s.refreshText}>
                  {location.loading ? 'Refreshing…' : 'Refresh Location'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Source badge — GPS when a real fix is available, else approximate */}
            {location.isFallback ? (
              <View style={[s.gpsBadge, s.approxBadge]}>
                <Ionicons name="help-circle" size={13} color={L.textMuted} />
                <Text style={[s.gpsBadgeText, { color: L.textMuted }]}>APPROX</Text>
              </View>
            ) : (
              <View style={s.gpsBadge}>
                <Ionicons name="checkmark-circle" size={13} color={L.green} />
                <Text style={s.gpsBadgeText}>GPS</Text>
              </View>
            )}
          </View>
        </Group>

        {/* â”€â”€ Discovery Preferences â”€â”€ */}
        <SectionHeader label="DISCOVERY PREFERENCES" />
        <Group>
          <RadiusControl
            label="Tournament Radius"
            sub="Show tournaments within this distance"
            options={['10 mi', '25 mi', '50 mi', '100 mi', 'Unlimited']}
            value={settings.tournamentRadius}
            onChange={(v) => update({ tournamentRadius: v })}
          />
          <Div />
          <RadiusControl
            label="Community Play Radius"
            sub="Show community play within this distance"
            options={['10 mi', '25 mi', '50 mi', '100 mi']}
            value={settings.communityRadius}
            onChange={(v) => update({ communityRadius: v })}
          />
          <Div />
          <RadiusControl
            label="Partner Finder Radius"
            sub="Find partners within this distance"
            options={['10 mi', '25 mi', '50 mi', 'Statewide']}
            value={settings.partnerRadius}
            onChange={(v) => update({ partnerRadius: v })}
          />
          <Div />
          <RadiusControl
            label="Marketplace Radius"
            sub="Find paddles and sellers within this distance"
            options={['Local Only', '25 mi', '50 mi', '100 mi']}
            value={settings.marketplaceRadius}
            onChange={(v) => update({ marketplaceRadius: v })}
          />
          <Div />
          <ToggleRow
            label="Willing to Ship"
            sub="Show listings that offer shipping"
            value={settings.willingToShip}
            onChange={(v) => update({ willingToShip: v })}
            last
          />
        </Group>

        {/* â”€â”€ Travel Preferences â”€â”€ */}
        <SectionHeader label="TRAVEL PREFERENCES" />
        <Group>
          <IconToggleRow
            icon="location-outline"
            label="Local Events"
            sub="Events near your area"
            value={settings.localEvents}
            onChange={(v) => update({ localEvents: v })}
          />
          <IconToggleRow
            icon="map-outline"
            label="Regional Events"
            sub="Events in surrounding regions"
            value={settings.regionalEvents}
            onChange={(v) => update({ regionalEvents: v })}
          />
          <IconToggleRow
            icon="airplane-outline"
            label="Major Events"
            sub="Events in major cities"
            value={settings.majorEvents}
            onChange={(v) => update({ majorEvents: v })}
          />
          <IconToggleRow
            icon="globe-outline"
            label="National Events"
            sub="Nationwide events"
            value={settings.nationalEvents}
            onChange={(v) => update({ nationalEvents: v })}
            last
          />
        </Group>

        {/* â”€â”€ Privacy â”€â”€ */}
        <SectionHeader label="PRIVACY" />
        <Group>
          <IconToggleRow
            icon="bar-chart-outline"
            label="Show City on Profile"
            sub="Display your city to other players"
            value={settings.showCity}
            onChange={(v) => update({ showCity: v })}
          />
          <IconToggleRow
            icon="locate-outline"
            label="Show Exact Location"
            sub="Display your exact location to other players"
            value={settings.showExactLocation}
            onChange={(v) => update({ showExactLocation: v })}
          />
          <IconToggleRow
            icon="people-outline"
            label="Allow Distance Matching"
            sub="Allow the app to use location for better matches"
            value={settings.allowDistanceMatch}
            onChange={(v) => update({ allowDistanceMatch: v })}
            last
          />
        </Group>

        {/* â”€â”€ Footer â”€â”€ */}
        <View style={s.footer}>
          <Ionicons name="lock-closed-outline" size={13} color={L.textMuted} />
          <Text style={s.footerText}>Changes are saved automatically</Text>
        </View>
      </ScrollView>
    </View>
  );
}

// â”€â”€â”€ Styles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.bg },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: L.bg, borderBottomWidth: 1, borderBottomColor: L.border,
    paddingHorizontal: 8, paddingVertical: 12,
  },
  backBtn:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, minWidth: 80 },
  backText:   { color: L.blue, fontSize: 17, fontWeight: '400' },
  headerTitle:{ color: L.navy, fontSize: 17, fontWeight: '700' },

  scroll: { padding: 20 },

  // Section header
  sectionHeader: {
    color: L.textMuted, fontSize: 12, fontWeight: '600',
    letterSpacing: 0.6, textTransform: 'uppercase',
    marginBottom: 8, marginTop: 24, paddingHorizontal: 4,
  },

  // Group
  group: {
    backgroundColor: L.bg, borderRadius: 12,
    borderWidth: 1, borderColor: L.border, overflow: 'hidden',
  },

  // Divider
  div: { height: StyleSheet.hairlineWidth, backgroundColor: L.div, marginLeft: 16 },

  // Current location card
  locationCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 16, paddingVertical: 16, gap: 12,
  },
  pinCircle: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: L.goldBg, borderWidth: 1, borderColor: L.goldBorder,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  locationInfo: { flex: 1, gap: 3 },
  locationCity: { color: L.navy, fontSize: 17, fontWeight: '700' },
  locationTime: { color: L.textMuted, fontSize: 13, fontWeight: '400' },
  refreshRow:   { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  refreshText:  { color: L.blue, fontSize: 13, fontWeight: '500' },
  gpsBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: L.greenBg, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(52,199,89,0.25)',
    flexShrink: 0,
  },
  gpsBadgeText: { color: L.green, fontSize: 12, fontWeight: '700' },
  approxBadge: { backgroundColor: L.page, borderColor: L.border },

  // Radius control
  radiusWrap: { paddingHorizontal: 16, paddingVertical: 14 },
  radiusHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  radiusLabel:  { color: L.navy, fontSize: 15, fontWeight: '600', marginBottom: 2 },
  radiusSub:    { color: L.textMuted, fontSize: 12, fontWeight: '400' },

  // Segmented row
  segRow: {
    flexDirection: 'row',
    borderWidth: 1, borderColor: L.border, borderRadius: 10, overflow: 'hidden',
  },
  segBtn: {
    flex: 1, paddingVertical: 9, alignItems: 'center', justifyContent: 'center',
    backgroundColor: L.bg, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: L.border,
  },
  segFirst:      {},
  segLast:       { borderRightWidth: 0 },
  segActive:     { backgroundColor: L.gold },
  segText:       { color: L.textMuted, fontSize: 12, fontWeight: '500' },
  segTextActive: { color: '#FFFFFF', fontWeight: '700' },

  // Toggle rows
  toggleRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, gap: 12,
  },
  iconCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: L.goldBg, borderWidth: 1, borderColor: L.goldBorder,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  toggleText:  { flex: 1 },
  toggleLabel: { color: L.navy, fontSize: 15, fontWeight: '500', marginBottom: 2 },
  toggleSub:   { color: L.textMuted, fontSize: 12, fontWeight: '400' },

  // Footer
  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginTop: 28,
  },
  footerText: { color: L.textMuted, fontSize: 13, fontWeight: '400' },
});
