import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, Alert, Image,
  ActivityIndicator, type AlertButton,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing, iconCircle } from '@/theme';
import { FieldLabel } from '@/components/FieldLabel';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { PrimaryButton } from '@/components/PrimaryButton';
import { AppIcon, type AppIconName } from '@/components';
import { useSession } from '@/hooks/useSession';
import { createMiniTournament, uploadPlayEventCover, parseDurationLabel } from '@/lib/supabase/playEvents';
import { FacilityPicker, type FacilityPickerValue } from '@/components/FacilityPicker';
import { fetchFacilityById } from '@/lib/supabase/facilities';
import { consumePendingGroupId } from '@/lib/pendingGroupLink';
import { eventCoverUri } from '@/lib/eventCover';

// ─── Constants ──────────────────────────────────────────────────────────────────

const SKILL_RANGES     = ['3.0 – 3.5', '3.5 – 4.0', '4.0 – 4.5', '4.5+'];
const DURATION_OPTIONS = ['1 Hour', '2 Hours', '3 Hours', '4 Hours', 'All Day'];
const TOURNAMENT_TYPES = ['Single Elimination', 'Pool Play', 'RR to Bracket'] as const;
const MATCH_FORMATS    = ['1 Game to 11 (Win by 2)', '1 Game to 15', 'Best of 3', 'Timed Matches'];
const SCORE_OPTIONS    = ['Yes, track scores', 'No, casual tournament'];
const WARMUP_OPTIONS   = ['0 Minutes', '5 Minutes', '10 Minutes'];
const PLAYER_MIN = 4;
const PLAYER_MAX = 64;

const TYPE_DESC: Record<typeof TOURNAMENT_TYPES[number], string> = {
  'Single Elimination': 'Knockout bracket, single loss.',
  'Pool Play':          'Everyone plays multiple matches.',
  'RR to Bracket':      'Pool stage feeds a playoff bracket.',
};

// ─── Theme ──────────────────────────────────────────────────────────────────────

const L = {
  navy:       colors.navy,
  gold:       colors.gold,
  goldBg:     colors.goldBg,
  goldLight:  colors.goldLight,
  goldBorder: colors.goldBorder,
  text:       colors.text,
  textSub:    colors.textSub,
  bg:         colors.bg,
  page:       colors.page,
  border:     colors.border,
  white:      colors.white,
};

// ─── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(d: Date) {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function fmtTime(d: Date) {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}
function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

// ─── Shared sub-components ──────────────────────────────────────────────────────

function CardHeader({ icon, label }: { icon: AppIconName; label: string }) {
  return (
    <View style={ch.row}>
      <AppIcon name={icon} size={17} color={L.gold} />
      <Text style={ch.label}>{label}</Text>
    </View>
  );
}
const ch = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  label: { fontSize: text.body.size, fontWeight: '500', color: L.navy, letterSpacing: 0.1 },
});

function Divider() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: L.border, marginVertical: 12 }} />;
}


function DropdownBtn({
  icon, value, onPress,
}: {
  icon: AppIconName;
  value: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={db.btn} onPress={onPress} activeOpacity={0.8}>
      <AppIcon name={icon} size={13} color={L.textSub} />
      <Text style={db.text} numberOfLines={1}>{value}</Text>
      <Ionicons name="chevron-down" size={13} color={L.textSub} />
    </TouchableOpacity>
  );
}
const db = StyleSheet.create({
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1.5, borderColor: L.border,
    borderRadius: shape.cta, paddingHorizontal: 12, height: 46,
    backgroundColor: L.bg,
  },
  text: { flex: 1, fontSize: text.controlLabel.size, color: L.navy, fontWeight: '700' },
});

/** Segmented control — connected pill bar with gold active state */
function SegmentedControl<T extends string>({
  options, value, onChange,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={sc.wrap}>
      {options.map((opt, i) => {
        const active = value === opt;
        const first  = i === 0;
        const last   = i === options.length - 1;
        return (
          <TouchableOpacity
            key={opt}
            style={[
              sc.seg,
              first  && sc.first,
              last   && sc.last,
              active ? sc.active : sc.inactive,
              !last  && sc.rightBorder,
            ]}
            onPress={() => onChange(opt)}
            activeOpacity={0.8}
          >
            <Text style={[sc.text, active && sc.textActive]} numberOfLines={1} adjustsFontSizeToFit>
              {opt}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
const sc = StyleSheet.create({
  wrap: { flexDirection: 'row', borderWidth: 1.5, borderColor: L.border, borderRadius: shape.cta, overflow: 'hidden' },
  seg: { flex: 1, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
  first: { borderTopLeftRadius: shape.cta - 2,  borderBottomLeftRadius: shape.cta - 2  },
  last: { borderTopRightRadius: shape.cta - 2, borderBottomRightRadius: shape.cta - 2 },
  active: { backgroundColor: L.gold },
  inactive: { backgroundColor: L.bg },
  rightBorder: { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: L.border },
  text: { fontSize: text.chipValue.size, fontWeight: '800', color: L.navy },
  textActive: { color: L.white },
});

function Stepper({
  value, onDecrement, onIncrement, min, max,
}: {
  value: number; onDecrement: () => void; onIncrement: () => void; min: number; max: number;
}) {
  return (
    <View style={stp.row}>
      <TouchableOpacity
        style={[stp.btn, value <= min && stp.disabled]}
        onPress={onDecrement} disabled={value <= min} activeOpacity={0.8}
      >
        <Ionicons name="remove" size={20} color={value <= min ? L.border : L.navy} />
      </TouchableOpacity>
      <Text style={stp.value}>{value}</Text>
      <TouchableOpacity
        style={[stp.btn, value >= max && stp.disabled]}
        onPress={onIncrement} disabled={value >= max} activeOpacity={0.8}
      >
        <Ionicons name="add" size={20} color={value >= max ? L.border : L.navy} />
      </TouchableOpacity>
    </View>
  );
}
const stp = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 24 },
  btn: { width: 42, height: 42, borderRadius: 11, borderWidth: 1.5, borderColor: L.border, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.35 },
  value: { fontSize: 30, fontWeight: '900', color: L.navy, minWidth: 40, textAlign: 'center' },
});

// ─── Screen ────────────────────────────────────────────────────────────────────

export default function CreateMiniTournamentScreen() {
  const insets    = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const { user }  = useSession();
  const { facilityId: preloadId } = useLocalSearchParams<{ facilityId?: string }>();

  const [step, setStep] = useState<1 | 2>(1);
  const [saving, setSaving] = useState(false);

  // ── Step 1 state ──
  const [photo,        setPhoto]        = useState<string | null>(null);
  // Picked photos aren't guaranteed to be JPEG (HEIC, PNG, WEBP, GIF, etc.)
  // — track the real mimeType so upload tags Storage correctly.
  const [photoMimeType, setPhotoMimeType] = useState<string | null>(null);
  const [tourneyName,  setTourneyName]  = useState('');
  const defaultDate = (() => { const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(9, 0, 0, 0); return d; })();
  const [date,         setDate]         = useState(defaultDate);
  const [startTime,    setStartTime]    = useState(defaultDate);
  const [duration,     setDuration]     = useState('3 Hours');
  const [pickerValue,  setPickerValue]  = useState<FacilityPickerValue | null>(null);
  const [skillRange,   setSkillRange]   = useState('3.5 – 4.0');
  const [activePicker, setActivePicker] = useState<'date' | 'time' | null>(null);

  useEffect(() => {
    if (!preloadId) return;
    fetchFacilityById(preloadId).then(f => {
      if (!f) return;
      setPickerValue({ mode: 'facility', facilityId: f.id, name: f.name, city: f.city, state: f.state, address: f.address });
    }).catch(() => { /* ignore */ });
  }, [preloadId]);

  // ── Step 2 state ──
  const [tournamentType,  setTournamentType]  = useState<typeof TOURNAMENT_TYPES[number]>('Single Elimination');
  const [maxPlayers,      setMaxPlayers]      = useState(16);
  const [singlesDoubles,  setSinglesDoubles]  = useState<'Singles' | 'Doubles' | 'Mixed Doubles'>('Singles');
  const [matchFormat,     setMatchFormat]     = useState('1 Game to 11 (Win by 2)');
  const [scoreTracking,   setScoreTracking]   = useState('Yes, track scores');
  const [warmupTime,      setWarmupTime]      = useState('5 Minutes');
  const [visibility,      setVisibility]      = useState<'public' | 'invite_only'>('public');
  const [notes,           setNotes]           = useState('');

  // ── Alert picker helper ──
  function pickAlert(title: string, options: string[], current: string, onSelect: (v: string) => void) {
    const buttons: AlertButton[] = options.map(o => ({
      text: o + (o === current ? ' ✓' : ''),
      onPress: () => onSelect(o),
    }));
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert(title, undefined, buttons);
  }

  async function pickFromLibrary() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo access to add a cover.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', allowsEditing: true, aspect: [16, 9], quality: 0.8 });
    if (!result.canceled) {
      setPhoto(result.assets[0].uri);
      setPhotoMimeType(result.assets[0].mimeType ?? null);
    }
  }

  async function pickFromCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow camera access to take a photo.'); return; }
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [16, 9], quality: 0.8 });
    if (!result.canceled) {
      setPhoto(result.assets[0].uri);
      setPhotoMimeType(result.assets[0].mimeType ?? null);
    }
  }

  function handlePhotoPress() {
    const buttons: AlertButton[] = [
      { text: 'Take Photo',          onPress: pickFromCamera },
      { text: 'Choose From Library', onPress: pickFromLibrary },
    ];
    if (photo) buttons.push({ text: 'Remove Photo', style: 'destructive', onPress: () => { setPhoto(null); setPhotoMimeType(null); } });
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Add Photo', undefined, buttons);
  }

  function handleNext() {
    if (!tourneyName.trim()) { Alert.alert('Missing field', 'Please enter a tournament name.'); return; }
    const nextLocationText =
      pickerValue?.mode === 'facility' ? `${pickerValue.city}, ${pickerValue.state}` :
      pickerValue?.mode === 'manual'   ? pickerValue.text : '';
    if (!nextLocationText.trim()) { Alert.alert('Missing field', 'Please select a facility or enter a location.'); return; }
    setActivePicker(null);
    setStep(2);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }

  async function handleCreate() {
    if (!user?.id) {
      Alert.alert('Sign in required', 'You must be signed in to create a Mini Tournament.', [{ text: 'OK' }]);
      return;
    }
    setSaving(true);
    try {
      let coverUrl: string | undefined;
      if (photo) { try { coverUrl = await uploadPlayEventCover(user.id, photo, photoMimeType); } catch {} }
      const mtLocationText =
      pickerValue?.mode === 'facility' ? `${pickerValue.city}, ${pickerValue.state}` :
      pickerValue?.mode === 'manual'   ? pickerValue.text : '';
    const isFacility = pickerValue?.mode === 'facility';
      const created = await createMiniTournament({
        organizerId:     user.id,
        name:            tourneyName.trim(),
        locationName:    mtLocationText,
        locationAddress: isFacility ? pickerValue!.name : undefined,
        eventDate:       date.toISOString(),
        startTime:       startTime.toISOString(),
        maxPlayers,
        skillRange,
        coverUrl,
        notes:           notes.trim() || undefined,
        city:            isFacility ? pickerValue!.city  : undefined,
        state:           isFacility ? pickerValue!.state : undefined,
        facilityId:      isFacility ? pickerValue!.facilityId : null,
        groupId:         consumePendingGroupId(),
        durationMinutes: parseDurationLabel(duration),
      });
      router.push(`/mini-tournament-created?id=${created.id}` as never);
    } catch (err) {
      Alert.alert('Could not create Mini Tournament', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  // Preview shows the organizer's pick, else the shared bundled default.
  const displayPhoto = eventCoverUri(photo);

  // ── Shared header ──
  function Header() {
    return (
      <View style={[s.header, { paddingTop: insets.top }]}>
        <View style={s.headerTop}>
          <TouchableOpacity
            style={s.backBtn}
            onPress={() => step === 1 ? router.back() : setStep(1)}
            activeOpacity={0.6}
          >
            <Ionicons name="chevron-back" size={20} color="#007AFF" />
            <Text style={s.backText}>Back</Text>
          </TouchableOpacity>
          <View style={s.headerIcon}>
            <Ionicons name="trophy-outline" size={19} color={L.gold} />
          </View>
        </View>
        <Text style={s.title}>Create Mini Tournament</Text>
        <Text style={s.subtitle}>
          {step === 1 ? 'Set up the basics for your tournament.' : 'Customize your tournament format.'}
        </Text>
        {/* Step indicator */}
        <View style={s.stepRow}>
          <Text style={s.stepLabel}>Step {step} of 2</Text>
          <View style={[s.stepDot, step === 1 ? s.stepDotActive : s.stepDotInactive]} />
          <View style={[s.stepDot, step === 2 ? s.stepDotActive : s.stepDotInactive]} />
        </View>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 1
  // ─────────────────────────────────────────────────────────────────────────────

  if (step === 1) {
    return (
      <View style={s.root}>
        <StatusBar style="dark" />
        <Header />
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 80 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >

            {/* SECTION 1 — EVENT PHOTO */}
            <View style={s.card}>
              <View style={ch.row}>
                <Ionicons name="image-outline" size={17} color={L.gold} />
                <Text style={ch.label}>Event Photo</Text>
                <Text style={s.optional}> (Optional)</Text>
              </View>
              <Text style={s.cardSub}>Add a photo to your tournament.</Text>

              <View style={s.photoRow}>
                <View style={s.photoPreviewWrap}>
                  <Image source={{ uri: displayPhoto }} style={s.photoPreview} resizeMode="cover" />
                  <TouchableOpacity style={s.cameraBtn} onPress={handlePhotoPress} activeOpacity={0.85}>
                    <Ionicons name="camera" size={15} color={L.navy} />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity style={s.uploadTile} onPress={handlePhotoPress} activeOpacity={0.75}>
                  <Ionicons name="cloud-upload-outline" size={26} color={L.gold} />
                  <Text style={s.uploadTitle}>Upload Photo</Text>
                  <Text style={s.uploadSub}>Tap to add from gallery{'\n'}or take a photo</Text>
                </TouchableOpacity>
              </View>
              <Text style={s.photoHelper}>If no photo is added, we'll use the venue image or a default.</Text>
            </View>

            {/* SECTION 2 — TOURNAMENT DETAILS */}
            <View style={s.card}>
              <CardHeader icon="document-text-outline" label="Tournament Details" />

              <FieldLabel>Tournament Name</FieldLabel>
              <View style={s.inputWrap}>
                <TextInput
                  style={s.input}
                  value={tourneyName}
                  onChangeText={setTourneyName}
                  placeholder="Name your tournament"
                  placeholderTextColor={L.textSub}
                  returnKeyType="done"
                />
                {tourneyName.length > 0 && (
                  <TouchableOpacity onPress={() => setTourneyName('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={18} color={L.textSub} />
                  </TouchableOpacity>
                )}
              </View>

              <Divider />

              {/* Date + Start Time */}
              <View style={s.dtRow}>
                <View style={s.dtCell}>
                  <FieldLabel>Date</FieldLabel>
                  <TouchableOpacity
                    style={s.dtBtn}
                    onPress={() => setActivePicker(activePicker === 'date' ? null : 'date')}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="calendar-outline" size={13} color={L.textSub} />
                    <Text style={s.dtText} numberOfLines={1}>{fmtDate(date)}</Text>
                    <Ionicons name="chevron-down" size={12} color={L.textSub} />
                  </TouchableOpacity>
                </View>
                <View style={s.dtCell}>
                  <FieldLabel>Start Time</FieldLabel>
                  <TouchableOpacity
                    style={s.dtBtn}
                    onPress={() => setActivePicker(activePicker === 'time' ? null : 'time')}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="time-outline" size={13} color={L.textSub} />
                    <Text style={s.dtText} numberOfLines={1}>{fmtTime(startTime)}</Text>
                    <Ionicons name="chevron-down" size={12} color={L.textSub} />
                  </TouchableOpacity>
                </View>
              </View>

              {activePicker === 'date' && (
                <DateTimePicker
                  value={date} mode="date" display="spinner" textColor={L.navy}
                  onChange={(_, d) => { if (d) setDate(d); }}
                  style={{ marginTop: 4 }}
                />
              )}
              {activePicker === 'time' && (
                <DateTimePicker
                  value={startTime} mode="time" display="spinner" textColor={L.navy}
                  onChange={(_, t) => { if (t) setStartTime(t); }}
                  style={{ marginTop: 4 }}
                />
              )}

              <Divider />

              {/* Duration + Format Preview */}
              <View style={s.dtRow}>
                <View style={s.dtCell}>
                  <FieldLabel>Duration</FieldLabel>
                  <DropdownBtn
                    icon="alarm-outline"
                    value={duration}
                    onPress={() => pickAlert('Duration', DURATION_OPTIONS, duration, setDuration)}
                  />
                </View>
                <View style={s.dtCell}>
                  <FieldLabel>Format Preview</FieldLabel>
                  <View style={[db.btn, s.readOnly]}>
                    <Ionicons name="people-circle-outline" size={13} color={L.textSub} />
                    <Text style={[db.text, { color: L.textSub }]} numberOfLines={1}>Mini Tournament</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* SECTION 3 — LOCATION */}
            <View style={s.card}>
              <CardHeader icon="location-outline" label="Location" />
              <FacilityPicker value={pickerValue} onChange={setPickerValue} />
            </View>

            {/* SECTION 4 — SKILL RANGE */}
            <View style={s.card}>
              <CardHeader icon="speedometer-outline" label="Skill Range" />
              <View style={s.pillRow}>
                {SKILL_RANGES.map(r => {
                  const active = skillRange === r;
                  return (
                    <TouchableOpacity
                      key={r}
                      style={[s.pill, active && s.pillActive]}
                      onPress={() => setSkillRange(r)}
                      activeOpacity={0.8}
                    >
                      <Text style={[s.pillText, active && s.pillTextActive]}>{r}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={s.helperText}>Helps players find the right match level.</Text>
            </View>

          </ScrollView>
        </KeyboardAvoidingView>

        {/* FOOTER */}
        <View style={[s.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <PrimaryButton label="Next" onPress={handleNext} />
        </View>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 2
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <View style={s.root}>
      <StatusBar style="dark" />
      <Header />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 80 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* SECTION 1 — TOURNAMENT FORMAT */}
          <View style={s.card}>
            <CardHeader icon="trophy-outline" label="Tournament Format" />

            <FieldLabel>Tournament Type</FieldLabel>
            <SegmentedControl
              options={TOURNAMENT_TYPES}
              value={tournamentType}
              onChange={setTournamentType}
            />
            <Text style={[s.helperText, { marginTop: 8 }]}>{TYPE_DESC[tournamentType]}</Text>

            <Divider />

            {/* Max Players + Singles/Doubles */}
            <View style={s.formatGrid}>
              {/* Max Players */}
              <View style={s.formatCol}>
                <View style={ch.row}>
                  <Ionicons name="people-outline" size={15} color={L.gold} />
                  <Text style={[ch.label, { fontSize: 13 }]}>Max Players</Text>
                  <Text style={s.totalTag}>(Total)</Text>
                </View>
                <Stepper
                  value={maxPlayers}
                  onDecrement={() => setMaxPlayers(v => clamp(v - 1, PLAYER_MIN, PLAYER_MAX))}
                  onIncrement={() => setMaxPlayers(v => clamp(v + 1, PLAYER_MIN, PLAYER_MAX))}
                  min={PLAYER_MIN}
                  max={PLAYER_MAX}
                />
                <Text style={[s.helperText, { marginTop: 6 }]}>{PLAYER_MIN}–{PLAYER_MAX} players</Text>
              </View>

              {/* Singles / Doubles */}
              <View style={s.formatCol}>
                <View style={ch.row}>
                  <Ionicons name="people-circle-outline" size={15} color={L.gold} />
                  <Text style={[ch.label, { fontSize: 13 }]}>Singles / Doubles</Text>
                </View>
                <SegmentedControl
                  options={['Singles', 'Doubles', 'Mixed Doubles'] as const}
                  value={singlesDoubles}
                  onChange={setSinglesDoubles}
                />
              </View>
            </View>
          </View>

          {/* SECTION 2 — MATCH SETTINGS */}
          <View style={s.card}>
            <CardHeader icon="pickleball" label="Match Settings" />

            <FieldLabel>Match Format</FieldLabel>
            <DropdownBtn
              icon="pickleball"
              value={matchFormat}
              onPress={() => pickAlert('Match Format', MATCH_FORMATS, matchFormat, setMatchFormat)}
            />

            <Divider />

            <FieldLabel>Score Tracking</FieldLabel>
            <DropdownBtn
              icon="checkmark-circle-outline"
              value={scoreTracking}
              onPress={() => pickAlert('Score Tracking', SCORE_OPTIONS, scoreTracking, setScoreTracking)}
            />

            <Divider />

            <FieldLabel>Warm-up Time (per match)</FieldLabel>
            <DropdownBtn
              icon="timer-outline"
              value={warmupTime}
              onPress={() => pickAlert('Warm-up Time', WARMUP_OPTIONS, warmupTime, setWarmupTime)}
            />
          </View>

          {/* SECTION 3 — WHO CAN JOIN? */}
          <View style={s.card}>
            <CardHeader icon="lock-closed-outline" label="Who Can Join?" />

            <TouchableOpacity
              style={[s.radioOption, visibility === 'invite_only' && s.radioOptionActive]}
              onPress={() => setVisibility('invite_only')}
              activeOpacity={0.8}
            >
              <View style={[s.radioCircle, visibility === 'invite_only' && s.radioCircleActive]}>
                {visibility === 'invite_only' && <View style={s.radioInner} />}
              </View>
              <View style={s.radioBody}>
                <Text style={s.radioLabel}>Invite Only</Text>
                <Text style={s.radioSub}>Only people you invite can join.</Text>
              </View>
            </TouchableOpacity>

            <View style={{ height: 10 }} />

            <TouchableOpacity
              style={[s.radioOption, visibility === 'public' && s.radioOptionActive]}
              onPress={() => setVisibility('public')}
              activeOpacity={0.8}
            >
              <View style={[s.radioCircle, visibility === 'public' && s.radioCircleActive]}>
                {visibility === 'public' && <View style={s.radioInner} />}
              </View>
              <View style={s.radioBody}>
                <Text style={s.radioLabel}>Public Nearby Players</Text>
                <Text style={s.radioSub}>Any nearby player can find and join.</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* SECTION 4 — ADDITIONAL NOTES */}
          <View style={s.card}>
            <View style={ch.row}>
              <Ionicons name="create-outline" size={17} color={L.gold} />
              <Text style={ch.label}>Additional Notes</Text>
              <Text style={s.optional}> (Optional)</Text>
            </View>

            <TextInput
              style={s.notesInput}
              value={notes}
              onChangeText={t => t.length <= 200 && setNotes(t)}
              placeholder="Add any details about your tournament..."
              placeholderTextColor={L.textSub}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              returnKeyType="done"
              blurOnSubmit
            />
            <Text style={s.charCounter}>{notes.length}/200</Text>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* FOOTER */}
      <View style={[s.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        {saving
          ? <ActivityIndicator size="large" color={colors.gold} />
          : <PrimaryButton label="Create Mini Tournament" onPress={handleCreate} />}
      </View>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },

  // Header
  header: {
    backgroundColor: L.page,
    paddingHorizontal: spacing.screenH,
    paddingBottom: spacing.md,
  },
  headerTop: {
    height: 44, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between',
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  backText: { fontSize: 17, color: '#007AFF', fontWeight: '400' },
  headerIcon: {
    width: iconCircle.small, height: iconCircle.small,
    borderRadius: iconCircle.small / 2,
    backgroundColor: L.bg, borderWidth: 1, borderColor: L.border,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: text.heroTitle.size, fontWeight: '800', color: L.navy, lineHeight: 30, marginTop: 2 },
  subtitle: { fontSize: text.caption.size, color: L.textSub, fontWeight: '500', marginTop: 3 },

  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  stepLabel: { fontSize: text.chipValue.size, fontWeight: '800', color: L.textSub },
  stepDot: { width: 8, height: 8, borderRadius: 4 },
  stepDotActive: { backgroundColor: L.gold },
  stepDotInactive: { backgroundColor: L.border },

  // Scroll
  scroll: { paddingHorizontal: spacing.screenH, paddingTop: spacing.md, gap: 14 },

  // Card
  card: {
    backgroundColor: L.bg,
    borderRadius: shape.card,
    borderWidth: 1, borderColor: L.border,
    padding: spacing.lg,
  },
  cardSub: { fontSize: text.caption.size, fontWeight: '500', color: L.textSub, marginBottom: 14, marginTop: -8 },
  optional: { fontSize: text.caption.size, color: L.textSub, fontWeight: '500' },
  readOnly: { opacity: 0.55 },

  // Photo
  photoRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  photoPreviewWrap: { flex: 1, borderRadius: shape.cta, overflow: 'hidden', aspectRatio: 16 / 9 },
  photoPreview: { width: '100%', height: '100%' },
  cameraBtn: {
    position: 'absolute', bottom: 8, right: 8,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: L.white, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 4, elevation: 3,
  },
  uploadTile: {
    flex: 1, borderWidth: 1.5, borderColor: L.border, borderStyle: 'dashed',
    borderRadius: shape.cta, alignItems: 'center', justifyContent: 'center',
    padding: 10, gap: 5,
  },
  uploadTitle: { fontSize: text.fieldLabel.size, fontWeight: '800', color: L.navy },
  uploadSub: { fontSize: 11, color: L.textSub, textAlign: 'center', lineHeight: 15 },
  photoHelper: { fontSize: 11, color: L.textSub, textAlign: 'center', marginTop: 4 },

  // Input
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderColor: L.border,
    borderRadius: shape.cta, paddingHorizontal: 12, height: 46,
  },
  input: { flex: 1, fontSize: text.body.size, fontWeight: '500', color: L.text },

  // Date/time row
  dtRow: { flexDirection: 'row', gap: 10 },
  dtCell: { flex: 1 },
  dtBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1.5, borderColor: L.border,
    borderRadius: shape.cta, paddingHorizontal: 9, height: 40,
  },
  dtText: { flex: 1, fontSize: 11, fontWeight: '600', color: L.navy },

  // Location
  locationBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1.5, borderColor: L.border, borderRadius: shape.cta,
    height: 44, marginTop: 10,
  },
  locationBtnText: { fontSize: text.rowTitle.size, fontWeight: '700', color: L.navy },

  // Skill pills
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
  pill: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: shape.pill, borderWidth: 1.5, borderColor: L.border, backgroundColor: L.bg },
  pillActive: { backgroundColor: L.gold, borderColor: L.gold },
  pillText: { fontSize: text.controlLabel.size, fontWeight: '700', color: L.navy },
  pillTextActive: { color: L.white },
  helperText: { fontSize: text.caption.size, fontWeight: '500', color: L.textSub },

  // Format grid (step 2)
  formatGrid: { gap: 18 },
  formatCol: { gap: 8 },
  totalTag: { fontSize: text.caption.size, color: L.textSub, fontWeight: '500', marginLeft: 2 },

  // Radio
  radioOption: { flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1.5, borderColor: L.border, borderRadius: shape.cta, padding: 14, backgroundColor: L.bg },
  radioOptionActive: { borderColor: L.gold, backgroundColor: L.goldLight },
  radioCircle: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: L.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  radioCircleActive: { borderColor: L.gold },
  radioInner: { width: 11, height: 11, borderRadius: 6, backgroundColor: L.gold },
  radioBody: { flex: 1 },
  radioLabel: { fontSize: text.rowTitle.size, fontWeight: '700', color: L.navy },
  radioSub: { fontSize: text.caption.size, fontWeight: '500', color: L.textSub, marginTop: 2 },

  // Notes
  notesInput: {
    borderWidth: 1.5, borderColor: L.border, borderRadius: shape.cta,
    padding: 12, fontSize: text.body.size, fontWeight: '500', color: L.text, minHeight: 100, marginTop: 4,
  },
  charCounter: { fontSize: 11, color: L.textSub, textAlign: 'right', marginTop: 6 },

  // Footer
  footer: {
    paddingHorizontal: spacing.screenH, paddingTop: 12,
    backgroundColor: L.page,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: L.border,
  },
});
