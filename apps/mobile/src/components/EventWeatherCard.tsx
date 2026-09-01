import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/theme';
import type { EventWeatherResult } from '@/lib/supabase/weather';

// The weather card, shared by the community-event and facility screens.
//
// Both screens already called the same fetchEventWeather, but each rendered
// its own widget: community a detailed card, facility a compact strip with
// only temperature, condition and wind. Same data, two designs, and only one
// of them showed feels-like, high/low, precipitation or humidity.
//
// Extracted from community/[id].tsx, which had the better of the two. Palette
// references are resolved against the theme rather than either screen's local
// alias table, so it does not depend on the file it came from.

// ─── Weather widget ────────────────────────────────────────────────────────────
// Backed by the event-weather edge function (Google Weather API). Forecasts
// only cover ~10 days out, so events further out (or in the past) render an
// "unavailable" state instead of stale/fake data.

type AvailableEventWeather = Extract<EventWeatherResult, { available: true }>;

function formatTemp(value: number | null | undefined): string {
  return value != null ? `${value}\u00B0` : '--';
}

function primaryWeatherTemp(w: AvailableEventWeather): number | null {
  if (w.temp != null) return w.temp;
  if (w.high != null && w.low != null) return Math.round((w.high + w.low) / 2);
  return w.high ?? w.low ?? null;
}

function feelsLikeTemp(w: AvailableEventWeather): number | null {
  const temp = primaryWeatherTemp(w);
  if (temp == null) return null;

  if (temp >= 80 && w.humidity != null) {
    const t = temp;
    const h = w.humidity;
    return Math.round(
      -42.379 +
      2.04901523 * t +
      10.14333127 * h -
      0.22475541 * t * h -
      0.00683783 * t * t -
      0.05481717 * h * h +
      0.00122874 * t * t * h +
      0.00085282 * t * h * h -
      0.00000199 * t * t * h * h
    );
  }

  if (temp <= 50 && w.wind != null && w.wind > 3) {
    return Math.round(
      35.74 +
      0.6215 * temp -
      35.75 * Math.pow(w.wind, 0.16) +
      0.4275 * temp * Math.pow(w.wind, 0.16)
    );
  }

  return temp;
}

function WeatherWidget({ w, style }: { w: EventWeatherResult | 'loading' | null; style?: StyleProp<ViewStyle> }) {
  if (w == null) return null;

  if (w === 'loading') {
    return (
      <View style={[ww.card, ww.centered, style]}>
        <ActivityIndicator size="small" color={colors.gold} />
      </View>
    );
  }

  if (!w.available) {
    return (
      <View style={[ww.card, ww.centered, style]}>
        <Ionicons name="cloud-offline-outline" size={20} color={colors.textSub} />
        <Text style={ww.unavailableText}>
          {w.reason === 'out_of_range' ? 'Forecast not available yet for this date' : 'Weather unavailable'}
        </Text>
      </View>
    );
  }

  return (
    <View style={[ww.card, style]}>
      <View style={ww.left}>
        <Ionicons name={w.icon as never} size={40} color={colors.gold} />
        <View>
          <Text style={ww.hiTemp}>{w.high != null ? `${w.high}°` : '—'}</Text>
          <Text style={ww.loTemp}>{w.low != null ? `${w.low}°` : '—'}</Text>
        </View>
      </View>
      <View style={ww.divider} />
      <View style={ww.right}>
        <Text style={ww.condition}>{w.condition}</Text>
        <View style={ww.statRow}>
          {w.precipChance != null && (
            <View style={ww.precipPill}>
              <Ionicons name="water" size={13} color="#2563EB" />
              <Text style={ww.precipPillText}>{w.precipChance}%</Text>
            </View>
          )}
          <View style={ww.windPill}>
            <Ionicons name="compass-outline" size={13} color={colors.textSub} />
            <Text style={ww.windPillText}>{w.wind != null ? `${w.wind} mph` : '—'}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const ww = StyleSheet.create({
  card:      { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.card, padding: spacing.lg, gap: spacing.lg, backgroundColor: colors.bg },
  centered:  { justifyContent: 'center', gap: spacing.sm, minHeight: 60 },
  unavailableText: { color: colors.textSub, fontSize: 12, fontWeight: '600' },
  left:      { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  hiTemp:    { color: colors.navy, fontSize: 26, fontWeight: '900', lineHeight: 28 },
  loTemp:    { color: colors.textSub, fontSize: 20, fontWeight: '700', lineHeight: 24 },
  divider:   { width: 1, height: 48, backgroundColor: colors.border },
  right:     { flex: 1, gap: spacing.sm },
  condition: { color: colors.navy, fontSize: 18, fontWeight: '900' },
  statRow:   { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  precipPill: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: '#DBEAFE', borderRadius: radius.chip, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
  },
  precipPillText: { color: '#2563EB', fontSize: 13, fontWeight: '800' },
  windPill: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.page, borderRadius: radius.chip, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
  },
  windPillText: { color: colors.textSub, fontSize: 13, fontWeight: '800' },
});

export function EventWeatherCard({ w, locationLabel, style }: {
  w: EventWeatherResult | 'loading' | null;
  locationLabel?: string;
  /** Outer spacing is the host screen's call, not this component's. */
  style?: StyleProp<ViewStyle>;
}) {
  if (w == null || w === 'loading' || !w.available) {
    return <WeatherWidget w={w} style={style} />;
  }

  const temp = primaryWeatherTemp(w);
  const feels = feelsLikeTemp(w);

  return (
    <View style={[dw.card, style]}>
      <View style={dw.mainRow}>
        <View style={dw.iconPanel}>
          <Ionicons name={w.icon as never} size={44} color={colors.gold} />
        </View>

        <View style={dw.primary}>
          <Text style={dw.currentTemp}>{formatTemp(temp)}</Text>
          <Text style={dw.condition}>{w.condition}</Text>
          {feels != null && <Text style={dw.feels}>Feels {formatTemp(feels)}</Text>}
        </View>

        <View style={dw.details}>
          {locationLabel ? (
            <View style={dw.locationRow}>
              <Ionicons name="location" size={14} color={colors.success} />
              <Text style={dw.locationText}>{locationLabel}</Text>
            </View>
          ) : null}
          <Text style={dw.highLow} numberOfLines={1}>H:{formatTemp(w.high)} L:{formatTemp(w.low)}</Text>
          {w.precipChance != null && (
            <View style={dw.metricRow}>
              <Ionicons name="water" size={14} color={colors.textSub} />
              <Text style={dw.metricText}>{w.precipChance}%</Text>
            </View>
          )}
        </View>
      </View>

      <View style={dw.metricGrid}>
        {w.humidity != null && (
          <View style={dw.metricPill}>
            <Ionicons name="water-outline" size={11} color={colors.gold} />
            <Text style={dw.metricPillText}>{w.humidity}% humidity</Text>
          </View>
        )}
        {w.wind != null && (
          <View style={dw.metricPill}>
            <Ionicons name="compass-outline" size={11} color={colors.gold} />
            <Text style={dw.metricPillText}>{w.wind} mph wind</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const dw = StyleSheet.create({
  card:      { borderWidth: 1, borderColor: colors.border, borderRadius: radius.card, paddingVertical: spacing.md, paddingHorizontal: spacing.md, gap: spacing.sm, backgroundColor: colors.bg },
  mainRow:   { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconPanel: { width: 50, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  primary:   { flex: 1.15, minWidth: 0 },
  currentTemp:{ color: colors.navy, fontSize: 31, fontWeight: '900', lineHeight: 34 },
  condition: { color: colors.navy, fontSize: 14, fontWeight: '800', lineHeight: 17 },
  feels:     { color: colors.navy, fontSize: 12, fontWeight: '700', lineHeight: 15, marginTop: 2 },
  details:   { flex: 0.9, alignItems: 'flex-end', gap: spacing.xs, minWidth: 0 },
  locationRow:{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'flex-end', gap: spacing.xs, maxWidth: '100%' },
  locationText:{ color: colors.navy, fontSize: 11, fontWeight: '800', lineHeight: 14, flexShrink: 1, textAlign: 'right' },
  highLow:   { color: colors.text, fontSize: 11, fontWeight: '600', lineHeight: 14 },
  metricRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  metricText:{ color: colors.text, fontSize: 11, fontWeight: '600', lineHeight: 14 },
  metricGrid:{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  metricPill:{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.goldBg, borderColor: colors.goldBorder, borderWidth: 1, borderRadius: radius.chip, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  metricPillText:{ color: colors.navy, fontSize: 10, fontWeight: '700', lineHeight: 12 },
});
