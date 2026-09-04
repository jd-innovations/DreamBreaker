import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, TextInput, Alert, ActivityIndicator, type AlertButton,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing } from '@/theme';
import { FieldLabel } from '@/components/FieldLabel';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import {
  fetchPlayEventWithOrganizer, updatePlayEvent, parseDurationLabel,
  type UpdatePlayEventPatch,
} from '@/lib/supabase/playEvents';
import { fetchFacilityById } from '@/lib/supabase/facilities';
import { FacilityPicker, type FacilityPickerValue } from '@/components/FacilityPicker';

const L = {
  bg: colors.bg, page: colors.page, navy: colors.navy,
  gold: colors.gold, goldLight: colors.goldLight,
  text: colors.text, textSub: colors.textSub, border: colors.border,
};

const DURATION_OPTIONS = ['1 Hour', '2 Hours', '3 Hours', '4 Hours'];

function durationMinutesToLabel(minutes: number | null): string {
  if (!minutes) return '2 Hours';
  const hours = Math.round(minutes / 60);
  return `${hours} Hour${hours === 1 ? '' : 's'}`;
}

function dateToYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function timeToHHMMSS(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`;
}

function fmtDate(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function CardSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={cs.wrap}>
      <Text style={cs.title}>{title}</Text>
      <View style={cs.card}>{children}</View>
    </View>
  );
}
const cs = StyleSheet.create({
  wrap: { marginBottom: spacing.xxl },
  title: { color: L.navy, fontSize: text.sectionLabel.size, fontWeight: '800', letterSpacing: text.sectionLabel.letterSpacing, marginBottom: spacing.sm, marginLeft: 2 },
  card: { backgroundColor: L.bg, borderRadius: shape.card, borderWidth: 1, borderColor: L.border, overflow: 'hidden' },
});


export default function EditEventScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [eventType, setEventType]   = useState<string | null>(null);

  const [name, setName]             = useState('');
  const [date, setDate]             = useState(new Date());
  const [startTime, setStartTime]   = useState(new Date());
  const [duration, setDuration]     = useState('2 Hours');
  const [maxPlayers, setMaxPlayers] = useState('4');
  const [notes, setNotes]           = useState('');
  const [pickerValue, setPickerValue] = useState<FacilityPickerValue | null>(null);
  const [activePicker, setActivePicker] = useState<'date' | 'time' | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchPlayEventWithOrganizer(id);
        if (!data || cancelled) return;
        setEventType(data.event_type);
        setName(data.name);
        setDate(new Date(`${data.event_date}T12:00:00`));
        if (data.start_time) {
          const [h, m] = data.start_time.split(':').map(Number);
          const t = new Date();
          t.setHours(h, m, 0, 0);
          setStartTime(t);
        }
        setDuration(durationMinutesToLabel(data.duration_minutes));
        setMaxPlayers(String(data.max_players));
        setNotes(data.notes ?? '');
        if (data.facility_id) {
          const facility = await fetchFacilityById(data.facility_id);
          if (facility && !cancelled) {
            setPickerValue({
              mode: 'facility', facilityId: facility.id, name: facility.name,
              city: facility.city, state: facility.state, address: facility.address,
            });
          }
        } else {
          setPickerValue({ mode: 'manual', text: data.location });
        }
      } catch {
        // non-fatal — screen falls back to blank fields, save will still work
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  function pickDuration() {
    const buttons: AlertButton[] = DURATION_OPTIONS.map(opt => ({
      text: opt + (opt === duration ? ' ✓' : ''),
      onPress: () => setDuration(opt),
    }));
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Duration', undefined, buttons);
  }

  async function handleSave() {
    if (!id) return;
    if (!name.trim()) { Alert.alert('Missing field', 'Please enter an event name.'); return; }
    const maxPlayersNum = parseInt(maxPlayers, 10);
    if (!maxPlayersNum || maxPlayersNum < 2) { Alert.alert('Missing field', 'Please enter a valid number of players.'); return; }

    const isFacility = pickerValue?.mode === 'facility';
    const locationText = isFacility ? `${pickerValue.city}, ${pickerValue.state}` : pickerValue?.text ?? '';

    const patch: UpdatePlayEventPatch = {
      name: name.trim(),
      event_date: dateToYMD(date),
      start_time: timeToHHMMSS(startTime),
      max_players: maxPlayersNum,
      notes: notes.trim() || null,
      facility_id: isFacility ? pickerValue.facilityId : null,
      venue_name: isFacility ? pickerValue.name : null,
      location: locationText,
      city: isFacility ? pickerValue.city : null,
      state: isFacility ? pickerValue.state : null,
    };
    if (eventType === 'open_play') {
      patch.duration_minutes = parseDurationLabel(duration);
    }

    setSaving(true);
    try {
      await updatePlayEvent(id, patch);
      router.back();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      const friendly =
        msg === 'below_participant_count' ? "Max players can't be lower than the number of people already joined." :
        msg === 'event_not_open'          ? 'This event’s status changed — please go back and refresh.' :
        msg || 'Please try again.';
      Alert.alert('Could not save', friendly);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={[s.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={L.gold} />
      </View>
    );
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.6}>
          <Ionicons name="chevron-back" size={20} color={L.navy} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>Edit Event</Text>
        </View>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 120 }]}
        keyboardShouldPersistTaps="handled"
      >
        <CardSection title="EVENT DETAILS">
          <View style={gd.field}>
            <FieldLabel>Event Name</FieldLabel>
            <TextInput style={gd.input} value={name} onChangeText={setName} maxLength={60} placeholderTextColor={L.textSub} />
          </View>

          <View style={[gd.field, gd.fieldBorder, gd.dtRow]}>
            <View style={gd.dtCell}>
              <FieldLabel>Date</FieldLabel>
              <TouchableOpacity style={gd.dtBtn} onPress={() => setActivePicker(activePicker === 'date' ? null : 'date')} activeOpacity={0.8}>
                <Ionicons name="calendar-outline" size={13} color={L.textSub} />
                <Text style={gd.dtBtnText} numberOfLines={1}>{fmtDate(date)}</Text>
              </TouchableOpacity>
            </View>
            <View style={gd.dtCell}>
              <FieldLabel>Start Time</FieldLabel>
              <TouchableOpacity style={gd.dtBtn} onPress={() => setActivePicker(activePicker === 'time' ? null : 'time')} activeOpacity={0.8}>
                <Ionicons name="time-outline" size={13} color={L.textSub} />
                <Text style={gd.dtBtnText} numberOfLines={1}>{fmtTime(startTime)}</Text>
              </TouchableOpacity>
            </View>
            {eventType === 'open_play' && (
              <View style={gd.dtCell}>
                <FieldLabel>Duration</FieldLabel>
                <TouchableOpacity style={gd.dtBtn} onPress={pickDuration} activeOpacity={0.8}>
                  <Ionicons name="alarm-outline" size={13} color={L.textSub} />
                  <Text style={gd.dtBtnText} numberOfLines={1}>{duration}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {activePicker === 'date' && (
            <DateTimePicker
              value={date}
              mode="date"
              display="spinner"
              textColor={L.navy}
              onChange={(_, selected) => { if (selected) setDate(selected); }}
            />
          )}
          {activePicker === 'time' && (
            <DateTimePicker
              value={startTime}
              mode="time"
              display="spinner"
              textColor={L.navy}
              onChange={(_, selected) => { if (selected) setStartTime(selected); }}
            />
          )}

          <View style={[gd.field, gd.fieldBorder]}>
            <FieldLabel>Max Players</FieldLabel>
            <TextInput
              style={gd.input}
              value={maxPlayers}
              onChangeText={t => setMaxPlayers(t.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              placeholderTextColor={L.textSub}
            />
          </View>
        </CardSection>

        <CardSection title="LOCATION">
          <View style={{ padding: spacing.md }}>
            <FacilityPicker value={pickerValue} onChange={setPickerValue} />
          </View>
        </CardSection>

        <CardSection title="ADDITIONAL NOTES">
          <View style={gd.field}>
            <TextInput
              style={[gd.input, gd.textArea]}
              value={notes}
              onChangeText={t => t.length <= 200 && setNotes(t)}
              multiline
              textAlignVertical="top"
              placeholder="Add any details about your event..."
              placeholderTextColor={L.textSub}
            />
            <Text style={gd.charCounter}>{notes.length}/200</Text>
          </View>
        </CardSection>
      </ScrollView>

      <View style={[s.cta, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity style={s.ctaBtn} onPress={handleSave} activeOpacity={0.85} disabled={saving}>
          {saving ? <ActivityIndicator color={colors.white} /> : <Text style={s.ctaBtnText}>Save Changes</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.screenH, paddingVertical: spacing.md,
    backgroundColor: L.bg, borderBottomWidth: 1, borderBottomColor: L.border,
  },
  backBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { color: L.navy, fontSize: text.sectionTitle.size, fontWeight: '900' },
  scroll: { padding: spacing.screenH, paddingTop: spacing.xl },
  cta: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: L.bg, borderTopWidth: 1, borderTopColor: L.border,
    paddingHorizontal: spacing.screenH, paddingTop: spacing.md,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: -3 },
    elevation: 8,
  },
  ctaBtn: { backgroundColor: L.gold, borderRadius: shape.cta, paddingVertical: spacing.lg, alignItems: 'center' },
  ctaBtnText: { color: colors.white, fontSize: text.actionLarge.size, fontWeight: '800' },
});

const gd = StyleSheet.create({
  field: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  fieldBorder: { borderTopWidth: 1, borderTopColor: L.border },
  input: { color: L.text, fontSize: text.body.size, fontWeight: '500', padding: 0 },
  textArea: { minHeight: 90, lineHeight: 22 },
  charCounter: { fontSize: 11, color: L.textSub, textAlign: 'right', marginTop: spacing.xs },
  dtRow: { flexDirection: 'row', gap: spacing.sm },
  dtCell: { flex: 1 },
  dtBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    borderWidth: 1.5, borderColor: L.border,
    borderRadius: shape.cta, paddingHorizontal: spacing.sm, height: 40,
    backgroundColor: L.bg,
  },
  dtBtnText: { flex: 1, fontSize: text.caption.size, fontWeight: '500', color: L.navy },
});
