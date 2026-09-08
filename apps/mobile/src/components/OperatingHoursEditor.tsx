import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Switch } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import {
  fetchOperatingHours, upsertOperatingHours,
  type DayHours, type OperatingHoursOwnerType,
} from '@/lib/supabase/operatingHours';

// The week a facility is open.
//
// Writes `operating_hours`, which is what choose-time.tsx actually reads to
// decide when a court can be booked. NOT facilities.hours_summary — that is a
// free-text display string the booking engine ignores, and a manager editing it
// expecting their hours to change would be quietly wrong.
//
// operatingHours.ts already had fetch, upsert and clear; only choose-time
// called it, and only to read. This is the editor that never existed.

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

const DEFAULT_OPEN = '08:00';
const DEFAULT_CLOSE = '21:00';

/** 'HH:MM[:SS]' -> a Date today, for the picker. */
function timeToDate(t: string | null, fallback: string): Date {
  const [h, m] = (t ?? fallback).split(':').map(Number);
  const d = new Date();
  d.setHours(h ?? 8, m ?? 0, 0, 0);
  return d;
}

/** Date -> 'HH:MM' for the column, which is a `time`. */
function dateToTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** '17:30' -> '5:30 PM'. The stored value stays 24h; only the display changes. */
export function formatTime12(t: string | null): string {
  if (!t) return '—';
  const [hRaw, m] = t.split(':').map(Number);
  const period = hRaw >= 12 ? 'PM' : 'AM';
  const h = hRaw % 12 === 0 ? 12 : hRaw % 12;
  return `${h}:${String(m ?? 0).padStart(2, '0')} ${period}`;
}

const emptyWeek = (): DayHours[] =>
  ([0, 1, 2, 3, 4, 5, 6] as const).map(d => ({
    dayOfWeek: d, isClosed: false, openTime: DEFAULT_OPEN, closeTime: DEFAULT_CLOSE,
  }));

export function OperatingHoursEditor({
  ownerType,
  ownerId,
  canEdit,
}: {
  ownerType: OperatingHoursOwnerType;
  ownerId: string;
  canEdit: boolean;
}) {
  const [week, setWeek] = useState<DayHours[]>(emptyWeek());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [picker, setPicker] = useState<{ day: number; field: 'open' | 'close' } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchOperatingHours(ownerType, ownerId);
      const base = emptyWeek();
      for (const r of rows) {
        const i = base.findIndex(d => d.dayOfWeek === r.day_of_week);
        if (i >= 0) {
          base[i] = {
            dayOfWeek: r.day_of_week as DayHours['dayOfWeek'],
            isClosed: r.is_closed,
            openTime: r.open_time,
            closeTime: r.close_time,
          };
        }
      }
      setWeek(base);
      setDirty(false);
    } catch {
      setWeek(emptyWeek());
    } finally {
      setLoading(false);
    }
  }, [ownerType, ownerId]);

  useEffect(() => { void load(); }, [load]);

  function patch(day: number, next: Partial<DayHours>) {
    setWeek(w => w.map(d => (d.dayOfWeek === day ? { ...d, ...next } : d)));
    setDirty(true);
  }

  /**
   * Copies one day's hours across the week.
   *
   * Fills the FORM only — nothing is written until Save. This facility already
   * has real hours, and a button that silently overwrote all seven days would
   * be a bad thing to have within one tap of a mis-press.
   */
  function applyToAll(day: number) {
    const source = week.find(d => d.dayOfWeek === day);
    if (!source) return;
    Alert.alert(
      'Apply to every day?',
      `Every day becomes ${source.isClosed ? 'closed' : `${formatTime12(source.openTime)} – ${formatTime12(source.closeTime)}`}. Nothing is saved until you press Save.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Apply',
          onPress: () => {
            setWeek(w => w.map(d => ({
              ...d,
              isClosed: source.isClosed,
              openTime: source.openTime,
              closeTime: source.closeTime,
            })));
            setDirty(true);
          },
        },
      ],
    );
  }

  async function save() {
    // The DB CHECK requires open < close on any day that is not closed, so it
    // is caught here rather than surfacing as a constraint error.
    const bad = week.find(d => !d.isClosed && (!d.openTime || !d.closeTime || d.openTime >= d.closeTime));
    if (bad) {
      Alert.alert(
        'Check the times',
        `${DAY_NAMES[bad.dayOfWeek]} closes before it opens. Set a closing time later than the opening time, or mark the day closed.`,
      );
      return;
    }

    setSaving(true);
    try {
      await upsertOperatingHours(ownerType, ownerId, week);
      setDirty(false);
      Alert.alert('Saved', 'Your hours are updated. Players can only book inside them.');
    } catch (e) {
      Alert.alert(
        'Could not save',
        e instanceof Error && e.message.toLowerCase().includes('row-level security')
          ? 'You do not have permission to change this facility.'
          : 'Something went wrong. Please try again.',
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <ActivityIndicator size="small" color={colors.gold} style={{ marginVertical: spacing.lg }} />;
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={s.note}>
        Players can only book inside these hours.
      </Text>

      {week.map(d => (
        <View key={d.dayOfWeek} style={s.dayRow}>
          <View style={s.dayHead}>
            <Text style={s.dayName}>{DAY_NAMES[d.dayOfWeek]}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Text style={s.openLabel}>{d.isClosed ? 'Closed' : 'Open'}</Text>
              <Switch
                value={!d.isClosed}
                disabled={!canEdit}
                onValueChange={v => patch(d.dayOfWeek, { isClosed: !v })}
                trackColor={{ true: colors.gold, false: colors.border }}
              />
            </View>
          </View>

          {!d.isClosed && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <TouchableOpacity
                style={s.timeBtn}
                disabled={!canEdit}
                onPress={() => setPicker(p =>
                  p?.day === d.dayOfWeek && p.field === 'open' ? null : { day: d.dayOfWeek, field: 'open' })}
                activeOpacity={0.8}
              >
                <Text style={s.timeText}>{formatTime12(d.openTime)}</Text>
              </TouchableOpacity>
              <Text style={s.dash}>to</Text>
              <TouchableOpacity
                style={s.timeBtn}
                disabled={!canEdit}
                onPress={() => setPicker(p =>
                  p?.day === d.dayOfWeek && p.field === 'close' ? null : { day: d.dayOfWeek, field: 'close' })}
                activeOpacity={0.8}
              >
                <Text style={s.timeText}>{formatTime12(d.closeTime)}</Text>
              </TouchableOpacity>
              {canEdit && (
                <TouchableOpacity
                  onPress={() => applyToAll(d.dayOfWeek)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="copy-outline" size={18} color={colors.textSub} />
                </TouchableOpacity>
              )}
            </View>
          )}

          {picker?.day === d.dayOfWeek && (
            <DateTimePicker
              value={timeToDate(
                picker.field === 'open' ? d.openTime : d.closeTime,
                picker.field === 'open' ? DEFAULT_OPEN : DEFAULT_CLOSE,
              )}
              mode="time"
              display="spinner"
              textColor={colors.navy}
              minuteInterval={15}
              onChange={(_, sel) => {
                if (!sel) return;
                patch(d.dayOfWeek, picker.field === 'open'
                  ? { openTime: dateToTime(sel) }
                  : { closeTime: dateToTime(sel) });
              }}
            />
          )}
        </View>
      ))}

      {canEdit && (
        <TouchableOpacity
          style={[s.saveBtn, (!dirty || saving) && s.disabled]}
          disabled={!dirty || saving}
          onPress={save}
          activeOpacity={0.85}
        >
          {saving
            ? <ActivityIndicator size="small" color={colors.white} />
            : <Text style={s.saveText}>{dirty ? 'Save hours' : 'Saved'}</Text>}
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  note: { fontSize: text.caption.size, fontWeight: '500', color: colors.textSub, },
  dayRow: {
    padding: spacing.md, backgroundColor: colors.bg, borderRadius: shape.card,
    borderWidth: 1, borderColor: colors.border, gap: spacing.sm,
  },
  dayHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayName: { fontSize: text.rowTitle.size, fontWeight: '700', color: colors.navy, },
  openLabel: { fontSize: text.caption.size, fontWeight: '500', color: colors.textSub, },
  timeBtn: {
    flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: shape.cta,
    borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.bg,
  },
  timeText: { color: colors.navy, fontSize: text.rowTitle.size, fontWeight: '700' },
  dash: { fontSize: text.caption.size, fontWeight: '500', color: colors.textSub, },
  saveBtn: {
    backgroundColor: colors.navy, borderRadius: shape.cta, paddingVertical: spacing.md,
    alignItems: 'center', justifyContent: 'center', marginTop: spacing.xs,
  },
  saveText: { color: colors.white, fontSize: text.actionLarge.size, fontWeight: '800' },
  disabled: { opacity: 0.4 },
});
