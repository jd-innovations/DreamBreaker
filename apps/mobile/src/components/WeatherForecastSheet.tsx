import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Modal, Pressable, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, spacing } from '@/theme';
import { radius as shape, text } from '@shared/tokens';
import {
  fetchWeatherForecast,
  type CurrentWeather,
  type ForecastDay,
  type WeatherForecastResult,
} from '@/lib/supabase/weather';

/**
 * Full weather for a completed profile: current conditions plus the next five
 * days at the player's saved location. Opened from the home banner's weather
 * strip, which is what a finished setup checklist turns into.
 *
 * Same Modal/slide/transparent idiom and grabber as ShareAppSheet and
 * ClaimInviteSheet, so the app keeps one bottom-sheet language.
 *
 * Current conditions come in from the strip (already fetched); the forecast is
 * fetched on open. No forecast means an honest unavailable state with a retry,
 * never a placeholder week.
 */

type Props = {
  visible: boolean;
  onClose: () => void;
  lat: number;
  lng: number;
  locationLabel: string | null;
  current: CurrentWeather | null;
};

const RAIN_BLUE = '#2563EB';

function formatDeg(value: number | null, digits = 0): string {
  return value != null ? `${value.toFixed(digits)}°` : '--';
}

function dayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return 'Today';
  return date.toLocaleDateString(undefined, { weekday: 'short' });
}

function uvLabel(uv: number): string {
  if (uv <= 2) return 'Low';
  if (uv <= 5) return 'Moderate';
  if (uv <= 7) return 'High';
  if (uv <= 10) return 'Very High';
  return 'Extreme';
}

export function WeatherForecastSheet({ visible, onClose, lat, lng, locationLabel, current }: Props) {
  const [forecast, setForecast] = useState<WeatherForecastResult | 'loading' | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    setForecast('loading');
    fetchWeatherForecast(lat, lng)
      .then(result => { if (!cancelled) setForecast(result); })
      .catch(() => { if (!cancelled) setForecast({ available: false, reason: 'upstream_error' }); });
    return () => { cancelled = true; };
  }, [lat, lng]);

  useEffect(() => {
    if (!visible) return;
    return load();
  }, [visible, load]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={s.anchor} pointerEvents="box-none">
        <View style={s.sheet}>
          <View style={s.grabber} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
            {/* ── Now ── */}
            {locationLabel ? (
              <View style={s.locationRow}>
                <Ionicons name="location" size={13} color={colors.gold} />
                <Text style={s.locationText}>{locationLabel.toUpperCase()}</Text>
              </View>
            ) : null}

            {current ? (
              <>
                <View style={s.nowRow}>
                  <Ionicons name={current.icon as never} size={52} color={colors.gold} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.nowTemp}>{formatDeg(current.temp, 1)}</Text>
                    <Text style={s.nowCondition}>{current.condition}</Text>
                  </View>
                  {current.feelsLike != null && (
                    <Text style={s.feels}>Feels {formatDeg(current.feelsLike)}</Text>
                  )}
                </View>

                <View style={s.tiles}>
                  <View style={s.tile}>
                    <Ionicons name="rainy-outline" size={18} color={RAIN_BLUE} />
                    <Text style={s.tileValue}>{current.precipChance != null ? `${current.precipChance}%` : '--'}</Text>
                    <Text style={s.tileLabel}>RAIN</Text>
                  </View>
                  <View style={s.tile}>
                    <MaterialCommunityIcons name="weather-windy" size={18} color={colors.textSub} />
                    <Text style={s.tileValue} numberOfLines={1}>
                      {current.windSpeed != null
                        ? `${current.windDirection ? `${current.windDirection} ` : ''}${current.windSpeed.toFixed(1)}`
                        : '--'}
                    </Text>
                    <Text style={s.tileLabel}>WIND MPH</Text>
                  </View>
                  <View style={s.tile}>
                    <Ionicons name="water-outline" size={18} color={colors.textSub} />
                    <Text style={s.tileValue}>{current.humidity != null ? `${current.humidity}%` : '--'}</Text>
                    <Text style={s.tileLabel}>HUMIDITY</Text>
                  </View>
                  <View style={s.tile}>
                    <Ionicons name="sunny-outline" size={18} color={colors.gold} />
                    <Text style={s.tileValue}>{current.uvIndex != null ? current.uvIndex : '--'}</Text>
                    <Text style={s.tileLabel} numberOfLines={1}>
                      {current.uvIndex != null ? `UV ${uvLabel(current.uvIndex).toUpperCase()}` : 'UV'}
                    </Text>
                  </View>
                </View>
              </>
            ) : null}

            {/* ── Next 5 days ── */}
            <Text style={s.sectionLabel}>5-DAY FORECAST</Text>
            <ForecastList forecast={forecast} onRetry={load} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function ForecastList({ forecast, onRetry }: {
  forecast: WeatherForecastResult | 'loading' | null;
  onRetry: () => void;
}) {
  if (forecast == null || forecast === 'loading') {
    return (
      <View style={[s.list, s.listState]}>
        <ActivityIndicator color={colors.textSub} />
      </View>
    );
  }
  if (!forecast.available || forecast.days.length === 0) {
    return (
      <View style={[s.list, s.listState]}>
        <Ionicons name="cloud-offline-outline" size={20} color={colors.textSub} />
        <Text style={s.stateText}>Forecast unavailable</Text>
        <TouchableOpacity onPress={onRetry} activeOpacity={0.7}>
          <Text style={s.retry}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Shared scale across the week so each day's bar sits where its range falls.
  const lows = forecast.days.map(d => d.low).filter((v): v is number => v != null);
  const highs = forecast.days.map(d => d.high).filter((v): v is number => v != null);
  const weekMin = lows.length ? Math.min(...lows) : 0;
  const weekMax = highs.length ? Math.max(...highs) : 0;
  const span = Math.max(1, weekMax - weekMin);

  return (
    <View style={s.list}>
      {forecast.days.map((day, idx) => (
        <ForecastRow
          key={day.date}
          day={day}
          weekMin={weekMin}
          span={span}
          last={idx === forecast.days.length - 1}
        />
      ))}
    </View>
  );
}

function ForecastRow({ day, weekMin, span, last }: {
  day: ForecastDay;
  weekMin: number;
  span: number;
  last: boolean;
}) {
  const hasRange = day.low != null && day.high != null;
  const left = hasRange ? ((day.low! - weekMin) / span) * 100 : 0;
  const width = hasRange ? Math.max(4, ((day.high! - day.low!) / span) * 100) : 0;

  return (
    <View style={[s.row, !last && s.rowBorder]}>
      <Text style={s.day}>{dayLabel(day.date)}</Text>
      <View style={s.iconCol}>
        <Ionicons name={day.icon as never} size={22} color={colors.gold} />
        {day.precipChance != null && day.precipChance >= 20 ? (
          <Text style={s.rowPrecip}>{day.precipChance}%</Text>
        ) : null}
      </View>
      <Text style={s.low}>{formatDeg(day.low)}</Text>
      <View style={s.track}>
        {hasRange ? <View style={[s.fill, { left: `${left}%`, width: `${width}%` }]} /> : null}
      </View>
      <Text style={s.high}>{formatDeg(day.high)}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,18,40,0.45)' },
  anchor: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: shape.card + 8,
    borderTopRightRadius: shape.card + 8,
    paddingTop: spacing.md,
    maxHeight: '88%',
  },
  grabber: {
    width: 38, height: 4, borderRadius: 2, alignSelf: 'center',
    backgroundColor: colors.border, marginBottom: spacing.lg,
  },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl },

  locationRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  locationText: {
    color: colors.gold, fontSize: text.cardLabel.size, fontWeight: '800',
    letterSpacing: text.cardLabel.letterSpacing,
  },

  nowRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  nowTemp: { color: colors.navy, fontSize: 40, fontWeight: '900', lineHeight: 44 },
  nowCondition: { color: colors.navy, fontSize: text.rowTitle.size, fontWeight: '700' },
  feels: { color: colors.textSub, fontSize: text.caption.size, fontWeight: '600', alignSelf: 'flex-end', marginBottom: 4 },

  tiles: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl },
  tile: {
    flex: 1, alignItems: 'center', gap: 3,
    borderWidth: 1, borderColor: colors.border, borderRadius: shape.card,
    paddingVertical: spacing.md, paddingHorizontal: spacing.xs,
  },
  tileValue: { color: colors.navy, fontSize: text.rowTitle.size, fontWeight: '800' },
  tileLabel: { color: colors.textSub, fontSize: text.microLabel.size, fontWeight: '700', letterSpacing: 0.5 },

  sectionLabel: {
    color: colors.textSub, fontSize: text.cardLabel.size, fontWeight: '800',
    letterSpacing: text.cardLabel.letterSpacing, marginBottom: spacing.sm,
  },
  list: { borderWidth: 1, borderColor: colors.border, borderRadius: shape.card, paddingHorizontal: spacing.md },
  listState: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.xxl },
  stateText: { color: colors.textSub, fontSize: text.caption.size, fontWeight: '600' },
  retry: { color: colors.navy, fontSize: text.caption.size, fontWeight: '800', textDecorationLine: 'underline' },

  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  day: { width: 52, color: colors.navy, fontSize: text.rowTitle.size, fontWeight: '800' },
  iconCol: { width: 40, alignItems: 'center' },
  rowPrecip: { color: RAIN_BLUE, fontSize: text.microLabel.size, fontWeight: '800', marginTop: 1 },
  low: { width: 36, textAlign: 'right', color: colors.textSub, fontSize: text.rowTitle.size, fontWeight: '600' },
  track: { flex: 1, height: 5, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { position: 'absolute', top: 0, bottom: 0, borderRadius: 3, backgroundColor: colors.gold },
  high: { width: 36, color: colors.navy, fontSize: text.rowTitle.size, fontWeight: '800' },
});
