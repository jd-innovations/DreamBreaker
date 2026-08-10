import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, Alert, Image,
  ActivityIndicator, type AlertButton,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing, radius, iconCircle } from '@/theme';
import { PrimaryButton } from '@/components/PrimaryButton';
import { AppIcon, PickleballIcon, type AppIconName } from '@/components';
import { useSession } from '@/hooks/useSession';
import { createRoundRobin, uploadPlayEventCover, parseDurationLabel } from '@/lib/supabase/playEvents';
import { FacilityPicker, type FacilityPickerValue } from '@/components/FacilityPicker';
import { fetchFacilityById } from '@/lib/supabase/facilities';
import { consumePendingGroupId } from '@/lib/pendingGroupLink';
import { eventCoverUri } from '@/lib/eventCover';

// ─── Constants ──────────────────────────────────────────────────────────────────

const SKILL_RANGES      = ['3.0 – 3.5', '3.5 – 4.0', '4.0 – 4.5', '4.5+'];
const DURATION_OPTIONS  = ['1 Hour', '2 Hours', '3 Hours', '4 Hours'];
const MATCH_FORMATS     = ['1 Game to 11 (Win by 2)', '1 Game to 15', 'Timed Games', 'Custom'];
const MATCHES_PER_PLAYER= ['3 – 5 Matches', '6 – 8 Matches', '9+ Matches', 'Auto'];
const SCORE_OPTIONS     = ['Yes, track scores', 'No, casual play only'];

const PLAYERS_HARD_MIN = 4;
const PLAYERS_HARD_MAX = 32;

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
  danger:     colors.danger,
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
  row:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  label: { fontSize: 15, fontWeight: '800', color: L.navy, letterSpacing: 0.1 },
});

function Divider() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: L.border, marginVertical: 12 }} />;
}

function FieldLabel({ children }: { children: string }) {
  return (
    <Text style={{ fontSize: 12, fontWeight: '700', color: L.textSub, marginBottom: 6, letterSpacing: 0.3 }}>
      {children}
    </Text>
  );
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
    borderRadius: radius.sm, paddingHorizontal: 12, height: 46,
    backgroundColor: L.bg,
  },
  text: { flex: 1, fontSize: 14, color: L.navy, fontWeight: '500' },
});

function Stepper({
  value, onDecrement, onIncrement, min, max,
}: {
  value: number;
  onDecrement: () => void;
  onIncrement: () => void;
  min: number;
  max: number;
}) {
  return (
    <View style={st.row}>
      <TouchableOpacity
        style={[st.btn, value <= min && st.btnDisabled]}
        onPress={onDecrement}
        disabled={value <= min}
        activeOpacity={0.8}
      >
        <Ionicons name="remove" size={18} color={value <= min ? L.border : L.navy} />
      </TouchableOpacity>
      <Text style={st.value}>{value}</Text>
      <TouchableOpacity
        style={[st.btn, value >= max && st.btnDisabled]}
        onPress={onIncrement}
        disabled={value >= max}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={18} color={value >= max ? L.border : L.navy} />
      </TouchableOpacity>
    </View>
  );
}
const st = StyleSheet.create({
  row:        { flexDirection: 'row', alignItems: 'center', gap: 20 },
  btn:        { width: 40, height: 40, borderRadius: 10, borderWidth: 1.5, borderColor: L.border, alignItems: 'center', justifyContent: 'center' },
  btnDisabled:{ opacity: 0.35 },
  value:      { fontSize: 28, fontWeight: '900', color: L.navy, minWidth: 36, textAlign: 'center' },
});

function StepDots({ current }: { current: 1 | 2 }) {
  return (
    <View style={sd.row}>
      <View style={[sd.dot, current === 1 ? sd.active : sd.inactive]} />
      <View style={[sd.dot, current === 2 ? sd.active : sd.inactive]} />
    </View>
  );
}
const sd = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 10 },
  dot:      { width: 8, height: 8, borderRadius: 4 },
  active:   { backgroundColor: L.gold },
  inactive: { backgroundColor: L.border },
});

// ─── Screen ────────────────────────────────────────────────────────────────────

export default function CreateRoundRobinScreen() {
  const insets    = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const { user }  = useSession();
  const { facilityId: preloadId } = useLocalSearchParams<{ facilityId?: string }>();

  // Default to tomorrow 6:30 PM
  const defaultDate = (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(18, 30, 0, 0); return d; })();

  // ── Step ──
  const [step, setStep] = useState<1 | 2>(1);

  // ── Step 1 state ──
  const [photo,        setPhoto]        = useState<string | null>(null);
  // Picked photos aren't guaranteed to be JPEG (HEIC, PNG, WEBP, GIF, etc.)
  // — track the real mimeType so upload tags Storage correctly.
  const [photoMimeType, setPhotoMimeType] = useState<string | null>(null);
  const [eventName,    setEventName]    = useState('Wednesday Round Robin');
  const [date,         setDate]         = useState(defaultDate);
  const [startTime,    setStartTime]    = useState(defaultDate);
  const [duration,     setDuration]     = useState('2 Hours');
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
  const [minPlayers,       setMinPlayers]       = useState(4);
  const [maxPlayers,       setMaxPlayers]       = useState(12);
  const [matchFormat,      setMatchFormat]      = useState('1 Game to 11 (Win by 2)');
  const [matchesPerPlayer, setMatchesPerPlayer] = useState('6 – 8 Matches');
  const [scoreRecording,   setScoreRecording]   = useState('Yes, track scores');
  const [visibility,       setVisibility]       = useState<'public' | 'invite_only'>('public');
  const [notes,            setNotes]            = useState('');
  const [saving,           setSaving]           = useState(false);

  // ── Picker helpers ──

  function pickAlert(
    title: string,
    options: string[],
    current: string,
    onSelect: (v: string) => void,
  ) {
    const buttons: AlertButton[] = options.map(o => ({
      text: o + (o === current ? ' ✓' : ''),
      onPress: () => onSelect(o),
    }));
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert(title, undefined, buttons);
  }

  async function pickFromLibrary() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Allow photo library access to add an event photo.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [16, 9], quality: 0.8 });
    if (!result.canceled) {
      setPhoto(result.assets[0].uri);
      setPhotoMimeType(result.assets[0].mimeType ?? null);
    }
  }

  async function pickFromCamera() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Allow camera access to take a photo.'); return; }
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

  // ── Step 1 → Next ──

  function handleNext() {
    if (!eventName.trim()) { Alert.alert('Missing field', 'Please enter an event name.'); return; }
    const rrLocationText =
      pickerValue?.mode === 'facility' ? `${pickerValue.city}, ${pickerValue.state}` :
      pickerValue?.mode === 'manual'   ? pickerValue.text : '';
    if (!rrLocationText.trim()) { Alert.alert('Missing field', 'Please select a facility or enter a location.'); return; }
    setActivePicker(null);
    setStep(2);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }

  // ── Step 2 → Create ──

  async function handleCreate() {
    if (maxPlayers < minPlayers) {
      Alert.alert('Invalid', 'Maximum players must be ≥ minimum players.'); return;
    }

    // Auth guard — guests cannot create Round Robins
    if (!user?.id) {
      Alert.alert(
        'Sign in required',
        'You need to be signed in to create a Round Robin.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign In', onPress: () => router.push('/sign-in' as never) },
        ],
      );
      return;
    }

    setSaving(true);
    try {
      // Upload cover photo if selected
      let coverUrl: string | undefined;
      if (photo) {
        try { coverUrl = await uploadPlayEventCover(user.id, photo, photoMimeType); } catch { /* non-fatal */ }
      }

      const rrCreateLocation =
        pickerValue?.mode === 'facility' ? `${pickerValue.city}, ${pickerValue.state}` :
        pickerValue?.mode === 'manual'   ? pickerValue.text : '';
      const isFacility = pickerValue?.mode === 'facility';
      const created = await createRoundRobin({
        organizerId:     user.id,
        name:            eventName.trim(),
        locationName:    rrCreateLocation,
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

      router.push(`/round-robin-created?id=${created.id}` as never);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Please try again.';
      Alert.alert('Could not create Round Robin', msg);
    } finally {
      setSaving(false);
    }
  }

  // Preview shows the organizer's pick, else the shared bundled default.
  const displayPhoto = eventCoverUri(photo);

  // ── Header ──

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
            <PickleballIcon size={20} color={L.gold} />
          </View>
        </View>
        <Text style={s.title}>Create Round Robin</Text>
        <Text style={s.subtitle}>
          {step === 1 ? 'Organize a structured round robin event.' : 'Step 2 of 2'}
        </Text>
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
              <CardHeader icon="image-outline" label="Event Photo" />
              <Text style={s.cardSub}>
                Add a photo to your event.{' '}
                <Text style={s.optional}>(Optional)</Text>
              </Text>

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

            {/* SECTION 2 — EVENT DETAILS */}
            <View style={s.card}>
              <CardHeader icon="document-text-outline" label="Event Details" />

              <FieldLabel>Event Name</FieldLabel>
              <View style={s.inputWrap}>
                <TextInput
                  style={s.input}
                  value={eventName}
                  onChangeText={setEventName}
                  placeholder="Name your event"
                  placeholderTextColor={L.textSub}
                  returnKeyType="done"
                />
                {eventName.length > 0 && (
                  <TouchableOpacity onPress={() => setEventName('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={18} color={L.textSub} />
                  </TouchableOpacity>
                )}
              </View>

              <Divider />

              {/* Date + Start Time row */}
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

              {/* Duration + Format row */}
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
                  <FieldLabel>Format</FieldLabel>
                  {/* Read-only — this flow is specifically for Round Robin */}
                  <View style={[db.btn, { opacity: 0.6 }]}>
                    <Ionicons name="people-circle-outline" size={13} color={L.textSub} />
                    <Text style={[db.text, { color: L.textSub }]} numberOfLines={1}>Round Robin</Text>
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

        {/* ── STICKY FOOTER ── */}
        <View style={[s.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <StepDots current={1} />
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

          {/* SECTION 1 — PLAYERS */}
          <View style={s.card}>
            <CardHeader icon="people-outline" label="Players" />

            {/* Min + Max side by side */}
            <View style={s.playersGrid}>
              <View style={s.playersCol}>
                <FieldLabel>Minimum Players</FieldLabel>
                <Stepper
                  value={minPlayers}
                  onDecrement={() => setMinPlayers(v => clamp(v - 1, PLAYERS_HARD_MIN, maxPlayers))}
                  onIncrement={() => setMinPlayers(v => clamp(v + 1, PLAYERS_HARD_MIN, maxPlayers))}
                  min={PLAYERS_HARD_MIN}
                  max={maxPlayers}
                />
              </View>
              <View style={s.playersCol}>
                <FieldLabel>Maximum Players</FieldLabel>
                <Stepper
                  value={maxPlayers}
                  onDecrement={() => setMaxPlayers(v => clamp(v - 1, minPlayers, PLAYERS_HARD_MAX))}
                  onIncrement={() => setMaxPlayers(v => clamp(v + 1, minPlayers, PLAYERS_HARD_MAX))}
                  min={minPlayers}
                  max={PLAYERS_HARD_MAX}
                />
              </View>
            </View>

            <Text style={[s.helperText, { marginTop: 14 }]}>More players = more matches!</Text>
          </View>

          {/* SECTION 2 — MATCH SETTINGS */}
          <View style={s.card}>
            <CardHeader icon="trophy-outline" label="Match Settings" />

            <FieldLabel>Match Format</FieldLabel>
            <DropdownBtn
              icon="pickleball"
              value={matchFormat}
              onPress={() => pickAlert('Match Format', MATCH_FORMATS, matchFormat, setMatchFormat)}
            />

            <Divider />

            <FieldLabel>Matches Per Player (Est.)</FieldLabel>
            <DropdownBtn
              icon="repeat-outline"
              value={matchesPerPlayer}
              onPress={() => pickAlert('Matches Per Player', MATCHES_PER_PLAYER, matchesPerPlayer, setMatchesPerPlayer)}
            />

            <Divider />

            <FieldLabel>Score Recording</FieldLabel>
            <DropdownBtn
              icon="checkmark-circle-outline"
              value={scoreRecording}
              onPress={() => pickAlert('Score Recording', SCORE_OPTIONS, scoreRecording, setScoreRecording)}
            />
          </View>

          {/* SECTION 3 — WHO CAN JOIN */}
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
            <CardHeader icon="create-outline" label="Additional Notes" />
            <Text style={[s.cardSub, { marginTop: -8 }]}>
              <Text style={s.optional}>(Optional)</Text>
            </Text>

            <TextInput
              style={s.notesInput}
              value={notes}
              onChangeText={t => t.length <= 200 && setNotes(t)}
              placeholder="Add any details about your round robin..."
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

      {/* ── STICKY FOOTER ── */}
      <View style={[s.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <StepDots current={2} />
        {saving ? (
          <View style={s.savingRow}>
            <ActivityIndicator color={colors.gold} />
            <Text style={s.savingText}>Creating Round Robin…</Text>
          </View>
        ) : (
          <PrimaryButton label="Create Round Robin" onPress={handleCreate} />
        )}
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
    height: 44,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  backBtn:  { flexDirection: 'row', alignItems: 'center', gap: 2 },
  backText: { fontSize: 17, color: '#007AFF', fontWeight: '400' },
  headerIcon: {
    width: iconCircle.small, height: iconCircle.small,
    borderRadius: iconCircle.small / 2,
    backgroundColor: L.bg, borderWidth: 1, borderColor: L.border,
    alignItems: 'center', justifyContent: 'center',
  },
  title:    { fontSize: 26, fontWeight: '900', color: L.navy, lineHeight: 30, marginTop: 2 },
  subtitle: { fontSize: 13, color: L.textSub, fontWeight: '400', marginTop: 3 },

  // Scroll
  scroll: { paddingHorizontal: spacing.screenH, paddingTop: spacing.md, gap: 14 },

  // Card
  card: {
    backgroundColor: L.bg,
    borderRadius: radius.card,
    borderWidth: 1, borderColor: L.border,
    padding: spacing.lg,
  },
  cardSub:  { fontSize: 13, color: L.textSub, marginBottom: 14, marginTop: -8 },
  optional: { fontSize: 13, color: L.textSub, fontWeight: '500' },

  // Photo
  photoRow:        { flexDirection: 'row', gap: 12, marginBottom: 12 },
  photoPreviewWrap:{ flex: 1, borderRadius: radius.sm, overflow: 'hidden', aspectRatio: 16 / 9 },
  photoPreview:    { width: '100%', height: '100%' },
  cameraBtn: {
    position: 'absolute', bottom: 8, right: 8,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: L.white, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 4, elevation: 3,
  },
  uploadTile: {
    flex: 1, borderWidth: 1.5, borderColor: L.border, borderStyle: 'dashed',
    borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center',
    padding: 10, gap: 5,
  },
  uploadTitle: { fontSize: 13, fontWeight: '700', color: L.navy },
  uploadSub:   { fontSize: 11, color: L.textSub, textAlign: 'center', lineHeight: 15 },
  photoHelper: { fontSize: 11, color: L.textSub, textAlign: 'center', marginTop: 4 },

  // Input
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderColor: L.border,
    borderRadius: radius.sm, paddingHorizontal: 12, height: 46,
  },
  input: { flex: 1, fontSize: 14, color: L.text },

  // Date / time row
  dtRow:  { flexDirection: 'row', gap: 10 },
  dtCell: { flex: 1 },
  dtBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1.5, borderColor: L.border,
    borderRadius: radius.sm, paddingHorizontal: 9, height: 40,
  },
  dtText: { flex: 1, fontSize: 11, fontWeight: '600', color: L.navy },

  // Location
  locationBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1.5, borderColor: L.border, borderRadius: radius.sm,
    height: 44, marginTop: 10,
  },
  locationBtnText: { fontSize: 14, fontWeight: '600', color: L.navy },

  // Skill pills
  pillRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
  pill:         { paddingHorizontal: 18, paddingVertical: 10, borderRadius: radius.chip, borderWidth: 1.5, borderColor: L.border, backgroundColor: L.bg },
  pillActive:   { backgroundColor: L.gold, borderColor: L.gold },
  pillText:     { fontSize: 13, fontWeight: '700', color: L.navy },
  pillTextActive:{ color: L.white },

  helperText: { fontSize: 12, color: L.textSub },

  // Players grid (step 2)
  playersGrid: { flexDirection: 'row', gap: 24 },
  playersCol:  { flex: 1, gap: 10 },

  // Radio (step 2)
  radioOption: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderWidth: 1.5, borderColor: L.border, borderRadius: radius.sm,
    padding: 14, backgroundColor: L.bg,
  },
  radioOptionActive: { borderColor: L.gold, backgroundColor: L.goldLight },
  radioCircle: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: L.border,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  radioCircleActive: { borderColor: L.gold },
  radioInner:  { width: 11, height: 11, borderRadius: 6, backgroundColor: L.gold },
  radioBody:   { flex: 1 },
  radioLabel:  { fontSize: 14, fontWeight: '700', color: L.navy },
  radioSub:    { fontSize: 12, color: L.textSub, marginTop: 2 },

  // Notes (step 2)
  notesInput: {
    borderWidth: 1.5, borderColor: L.border, borderRadius: radius.sm,
    padding: 12, fontSize: 14, color: L.text, minHeight: 100,
    marginTop: 6,
  },
  charCounter: { fontSize: 11, color: L.textSub, textAlign: 'right', marginTop: 6 },

  // Footer
  footer: {
    paddingHorizontal: spacing.screenH, paddingTop: 12,
    backgroundColor: L.page,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: L.border,
  },
  savingRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 48 },
  savingText: { fontSize: 15, fontWeight: '700', color: L.navy },
});
