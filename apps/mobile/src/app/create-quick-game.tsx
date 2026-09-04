import React, { useEffect, useState } from 'react';
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
import { colors, spacing, iconCircle } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { PrimaryButton } from '@/components/PrimaryButton';
import { PickleballIcon } from '@/components';
import { useSession } from '@/hooks/useSession';
import { createQuickGame, uploadPlayEventCover, parseDurationLabel } from '@/lib/supabase/playEvents';
import { consumePendingGroupId } from '@/lib/pendingGroupLink';
import { eventCoverUri } from '@/lib/eventCover';
import { FacilityPicker, type FacilityPickerValue } from '@/components/FacilityPicker';
import { fetchFacilityById } from '@/lib/supabase/facilities';

// ─── Constants ──────────────────────────────────────────────────────────────────

const SKILL_RANGES = ['3.0 – 3.5', '3.5 – 4.0', '4.0 – 4.5', '4.5+'];
const DURATION_OPTIONS = ['1 Hour', '2 Hours', '3 Hours', '4 Hours'];
const PLAYERS_MIN = 2;
const PLAYERS_MAX = 20;

const L = {
  navy:      colors.navy,
  gold:      colors.gold,
  goldBg:    colors.goldBg,
  goldLight: colors.goldLight,
  goldBorder:colors.goldBorder,
  text:      colors.text,
  textSub:   colors.textSub,
  bg:        colors.bg,
  page:      colors.page,
  border:    colors.border,
  white:     colors.white,
  danger:    colors.danger,
  success:   colors.success,
  successBg: colors.successBg,
};

// ─── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(d: Date) {
  // Compact format to fit narrow 3-column layout
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

function CardHeader({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={ch.row}>
      <Ionicons name={icon} size={17} color={L.gold} />
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

function FieldLabel({ children }: { children: string }) {
  return <Text style={{ fontSize: 12, fontWeight: '700', color: L.textSub, marginBottom: 6, letterSpacing: 0.3 }}>{children}</Text>;
}

// ─── Screen ────────────────────────────────────────────────────────────────────

export default function CreateQuickGameScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const { facilityId: preloadId } = useLocalSearchParams<{ facilityId?: string }>();

  // Default to tomorrow 6:30 PM so new games land in Upcoming, not Completed
  const defaultDate = (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(18, 30, 0, 0); return d; })();

  // Form state
  const [photo,         setPhoto]         = useState<string | null>(null);
  // Picked photos aren't guaranteed to be JPEG (iOS can hand back HEIC, library
  // picks can be PNG/WEBP/GIF, etc.) — track the real mimeType so the upload
  // tags Storage with the correct content-type instead of guessing "jpg".
  const [photoMimeType, setPhotoMimeType] = useState<string | null>(null);
  const [gameName,      setGameName]      = useState('Thursday Open Play');
  const [date,          setDate]          = useState(defaultDate);
  const [startTime,     setStartTime]     = useState(defaultDate);
  const [duration,      setDuration]      = useState('2 Hours');
  const [pickerValue,   setPickerValue]   = useState<FacilityPickerValue | null>(null);

  useEffect(() => {
    if (!preloadId) return;
    fetchFacilityById(preloadId).then(f => {
      if (!f) return;
      setPickerValue({ mode: 'facility', facilityId: f.id, name: f.name, city: f.city, state: f.state, address: f.address });
    }).catch(() => { /* ignore — user can pick manually */ });
  }, [preloadId]);
  const [skillRange,    setSkillRange]    = useState('3.5 – 4.0');
  const [players,       setPlayers]       = useState(4);
  const [visibility,    setVisibility]    = useState<'public' | 'invite_only'>('public');
  const [notes,         setNotes]         = useState('');
  const [saving,        setSaving]        = useState(false);

  // Picker visibility
  const [activePicker, setActivePicker]  = useState<'date' | 'time' | null>(null);

  // ── Handlers ──

  async function pickFromLibrary() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to add a game photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });
    if (!result.canceled) {
      setPhoto(result.assets[0].uri);
      setPhotoMimeType(result.assets[0].mimeType ?? null);
    }
  }

  async function pickFromCamera() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow camera access to take a photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });
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

  function handleDurationPress() {
    const buttons: AlertButton[] = DURATION_OPTIONS.map(opt => ({
      text: opt + (opt === duration ? ' ✓' : ''),
      onPress: () => setDuration(opt),
    }));
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Duration', undefined, buttons);
  }

  async function handleCreateGame() {
    // Auth guard — regular users allowed, guests blocked
    if (!user?.id) {
      Alert.alert(
        'Sign in required',
        'You need to be signed in to create a game.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign In', onPress: () => router.push('/sign-in' as never) },
        ],
      );
      return;
    }

    if (!gameName.trim()) {
      Alert.alert('Missing field', 'Please enter a game name.'); return;
    }
    const locationText =
      pickerValue?.mode === 'facility' ? `${pickerValue.city}, ${pickerValue.state}` :
      pickerValue?.mode === 'manual'   ? pickerValue.text : '';
    if (!locationText.trim()) {
      Alert.alert('Missing field', 'Please select a facility or enter a location.'); return;
    }

    setSaving(true);
    try {
      // Only a custom photo is uploaded. With no photo, cover_url stays null and
      // every surface renders the shared bundled default (see lib/eventCover).
      let coverUrl: string | undefined;
      if (photo) {
        try {
          coverUrl = await uploadPlayEventCover(user.id, photo, photoMimeType);
        } catch {
          // Photo upload failure is non-fatal — create game without cover
        }
      }

      const isFacility = pickerValue?.mode === 'facility';
      const created = await createQuickGame({
        organizerId:     user.id,
        name:            gameName.trim(),
        locationName:    locationText,
        locationAddress: isFacility ? pickerValue!.name : undefined,
        eventDate:       date.toISOString(),
        startTime:       startTime.toISOString(),
        maxPlayers:      players,
        skillRange,
        coverUrl,
        city:            isFacility ? pickerValue!.city  : undefined,
        state:           isFacility ? pickerValue!.state : undefined,
        facilityId:      isFacility ? pickerValue!.facilityId : null,
        groupId:         consumePendingGroupId(),
        notes:           notes.trim() || undefined,
        durationMinutes: parseDurationLabel(duration),
      });
      router.push(`/quick-game-created?id=${created.id}` as never);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Please try again.';
      Alert.alert('Could not create game', msg);
    } finally {
      setSaving(false);
    }
  }

  // Preview shows the organizer's pick, else the shared bundled default.
  const displayPhoto = eventCoverUri(photo);

  return (
    <View style={s.root}>
      <StatusBar style="dark" />

      {/* ── HEADER ── */}
      <View style={[s.header, { paddingTop: insets.top }]}>
        <View style={s.headerTop}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.6}>
            <Ionicons name="chevron-back" size={20} color="#007AFF" />
            <Text style={s.backText}>Back</Text>
          </TouchableOpacity>

          {/* Pickleball icon — top right accent */}
          <View style={s.headerIcon}>
            <PickleballIcon size={22} color={L.gold} />
          </View>
        </View>

        <Text style={s.title}>Create Quick Game</Text>
        <Text style={s.subtitle}>Invite players and start playing.</Text>
      </View>

      {/* ── CONTENT ── */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 80 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── SECTION 1: GAME PHOTO ── */}
          <View style={s.card}>
            <CardHeader icon="image-outline" label="Game Photo" />
            <Text style={s.cardSub}>
              Add a photo to make your game stand out.{' '}
              <Text style={s.optionalTag}>(Optional)</Text>
            </Text>

            <View style={s.photoRow}>
              {/* Preview */}
              <View style={s.photoPreviewWrap}>
                <Image source={{ uri: displayPhoto }} style={s.photoPreview} resizeMode="cover" />
                <TouchableOpacity style={s.cameraBtn} onPress={handlePhotoPress} activeOpacity={0.85}>
                  <Ionicons name="camera" size={16} color={L.navy} />
                </TouchableOpacity>
              </View>

              {/* Upload tile — updates when photo is selected */}
              <TouchableOpacity
                style={[s.uploadTile, photo ? s.uploadTileSelected : null]}
                onPress={handlePhotoPress}
                activeOpacity={0.75}
              >
                <Ionicons
                  name={photo ? 'checkmark-circle' : 'cloud-upload-outline'}
                  size={28}
                  color={photo ? L.success : L.gold}
                />
                <Text style={s.uploadTitle}>{photo ? 'Photo Added' : 'Upload Photo'}</Text>
                <Text style={s.uploadSub}>
                  {photo ? 'Tap to change\nor remove' : 'Tap to add from gallery\nor take a photo'}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={s.photoHelper}>
              If no photo is added, we'll use the venue image or a default.
            </Text>
          </View>

          {/* ── SECTION 2: GAME DETAILS ── */}
          <View style={s.card}>
            <CardHeader icon="document-text-outline" label="Game Details" />

            {/* Game Name */}
            <FieldLabel>Game Name</FieldLabel>
            <View style={s.inputWrap}>
              <TextInput
                style={s.input}
                value={gameName}
                onChangeText={setGameName}
                placeholder="Name your game"
                placeholderTextColor={L.textSub}
                returnKeyType="done"
              />
              {gameName.length > 0 && (
                <TouchableOpacity onPress={() => setGameName('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={18} color={L.textSub} />
                </TouchableOpacity>
              )}
            </View>

            <Divider />

            {/* Date / Time / Duration row */}
            <View style={s.dtRow}>
              {/* Date */}
              <View style={s.dtCell}>
                <FieldLabel>Date</FieldLabel>
                <TouchableOpacity
                  style={s.dtBtn}
                  onPress={() => setActivePicker(activePicker === 'date' ? null : 'date')}
                  activeOpacity={0.8}
                >
                  <Ionicons name="calendar-outline" size={13} color={L.textSub} />
                  <Text style={s.dtBtnText} numberOfLines={1}>{fmtDate(date)}</Text>
                  <Ionicons name="chevron-down" size={12} color={L.textSub} />
                </TouchableOpacity>
              </View>

              {/* Start Time */}
              <View style={s.dtCell}>
                <FieldLabel>Start Time</FieldLabel>
                <TouchableOpacity
                  style={s.dtBtn}
                  onPress={() => setActivePicker(activePicker === 'time' ? null : 'time')}
                  activeOpacity={0.8}
                >
                  <Ionicons name="time-outline" size={13} color={L.textSub} />
                  <Text style={s.dtBtnText} numberOfLines={1}>{fmtTime(startTime)}</Text>
                  <Ionicons name="chevron-down" size={12} color={L.textSub} />
                </TouchableOpacity>
              </View>

              {/* Duration */}
              <View style={s.dtCell}>
                <FieldLabel>Duration</FieldLabel>
                <TouchableOpacity
                  style={s.dtBtn}
                  onPress={handleDurationPress}
                  activeOpacity={0.8}
                >
                  <Ionicons name="alarm-outline" size={13} color={L.textSub} />
                  <Text style={s.dtBtnText} numberOfLines={1}>{duration}</Text>
                  <Ionicons name="chevron-down" size={12} color={L.textSub} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Inline date picker */}
            {activePicker === 'date' && (
              <DateTimePicker
                value={date}
                mode="date"
                display="spinner"
                textColor={L.navy}
                onChange={(_, selected) => {
                  if (selected) setDate(selected);
                }}
                style={{ marginTop: 4 }}
              />
            )}

            {/* Inline time picker */}
            {activePicker === 'time' && (
              <DateTimePicker
                value={startTime}
                mode="time"
                display="spinner"
                textColor={L.navy}
                onChange={(_, selected) => {
                  if (selected) setStartTime(selected);
                }}
                style={{ marginTop: 4 }}
              />
            )}
          </View>

          {/* ── SECTION 3: LOCATION ── */}
          <View style={s.card}>
            <CardHeader icon="location-outline" label="Location" />
            <FacilityPicker value={pickerValue} onChange={setPickerValue} />
          </View>

          {/* ── SECTION 4: SKILL RANGE ── */}
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

          {/* ── SECTION 5: PLAYERS NEEDED ── */}
          <View style={s.card}>
            <CardHeader icon="people-outline" label="Players Needed" />

            <View style={s.stepperRow}>
              <TouchableOpacity
                style={[s.stepperBtn, players <= PLAYERS_MIN && s.stepperBtnDisabled]}
                onPress={() => setPlayers(p => Math.max(PLAYERS_MIN, p - 1))}
                activeOpacity={0.8}
                disabled={players <= PLAYERS_MIN}
              >
                <Ionicons name="remove" size={20} color={players <= PLAYERS_MIN ? L.border : L.navy} />
              </TouchableOpacity>

              <Text style={s.stepperValue}>{players}</Text>

              <TouchableOpacity
                style={[s.stepperBtn, players >= PLAYERS_MAX && s.stepperBtnDisabled]}
                onPress={() => setPlayers(p => Math.min(PLAYERS_MAX, p + 1))}
                activeOpacity={0.8}
                disabled={players >= PLAYERS_MAX}
              >
                <Ionicons name="add" size={20} color={players >= PLAYERS_MAX ? L.border : L.navy} />
              </TouchableOpacity>
            </View>

            <Text style={[s.helperText, { textAlign: 'center', marginTop: 8 }]}>
              Total players you're looking for.
            </Text>
          </View>

          {/* ── SECTION 6: WHO CAN JOIN ── */}
          <View style={s.card}>
            <CardHeader icon="lock-closed-outline" label="Who Can Join?" />

            {/* Invite Only */}
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

            {/* Public Nearby Players */}
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

          {/* ── SECTION 7: ADDITIONAL NOTES ── */}
          <View style={s.card}>
            <CardHeader icon="create-outline" label="Additional Notes" />
            <Text style={[s.cardSub, { marginTop: -8 }]}>
              <Text style={s.optionalTag}>(Optional)</Text>
            </Text>

            <TextInput
              style={s.notesInput}
              value={notes}
              onChangeText={t => t.length <= 200 && setNotes(t)}
              placeholder="Add any details about your game..."
              placeholderTextColor={L.textSub}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              returnKeyType="done"
              blurOnSubmit
            />
            <Text style={s.charCounter}>{notes.length}/200</Text>
          </View>

          {/* ── SECTION 8: INVITE LATER ── */}
          <View style={s.card}>
            <View style={s.inviteRow}>
              <View style={s.inviteIconWrap}>
                <Ionicons name="people-circle-outline" size={28} color={L.gold} />
              </View>
              <View style={s.inviteBody}>
                <Text style={s.inviteTitle}>You can invite players or share a link after creation.</Text>
                <Text style={s.inviteSub}>Add friends or share to fill your game faster.</Text>
              </View>
              <TouchableOpacity activeOpacity={0.75}>
                <Text style={s.inviteLink}>Invite Friends Later →</Text>
              </TouchableOpacity>
            </View>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── BOTTOM CTA — floats above tab bar ── */}
      <View style={[s.ctaWrap, { paddingBottom: insets.bottom + spacing.md }]}>
        {saving ? (
          <View style={s.savingRow}>
            <ActivityIndicator color={colors.gold} />
            <Text style={s.savingText}>Creating game…</Text>
          </View>
        ) : (
          <PrimaryButton label="Create Game" onPress={handleCreateGame} />
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
    paddingBottom: spacing.lg,
  },
  headerTop: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  backText: { fontSize: 17, color: '#007AFF', fontWeight: '400' },
  headerIcon: {
    width: iconCircle.small, height: iconCircle.small,
    borderRadius: iconCircle.small / 2,
    backgroundColor: L.bg,
    borderWidth: 1, borderColor: L.border,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: text.heroTitle.size, fontWeight: '800', color: L.navy, lineHeight: 30, marginTop: 4 },
  subtitle: { fontSize: text.caption.size, color: L.textSub, fontWeight: '500', marginTop: 4 },

  // Scroll
  scroll: { paddingHorizontal: spacing.screenH, paddingTop: spacing.md, gap: 14 },

  // Card
  card: {
    backgroundColor: L.bg,
    borderRadius: shape.card,
    borderWidth: 1, borderColor: L.border,
    padding: spacing.lg,
  },
  cardSub: { fontSize: text.caption.size, color: L.textSub, fontWeight: '500', marginBottom: 14, marginTop: -8 },
  optionalTag: { fontSize: text.caption.size, color: L.textSub, fontWeight: '500' },

  // Photo
  photoRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  photoPreviewWrap: { flex: 1, borderRadius: shape.cta, overflow: 'hidden', aspectRatio: 16 / 9 },
  photoPreview: { width: '100%', height: '100%' },
  cameraBtn: {
    position: 'absolute', bottom: 8, right: 8,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: L.white,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 4, elevation: 3,
  },
  uploadTile: {
    flex: 1,
    borderWidth: 1.5, borderColor: L.border, borderStyle: 'dashed',
    borderRadius: shape.cta,
    alignItems: 'center', justifyContent: 'center',
    padding: 12, gap: 6,
  },
  uploadTileSelected: {
    borderColor: colors.success, borderStyle: 'solid',
    backgroundColor: colors.successBg,
  },
  uploadTitle: { fontSize: text.fieldLabel.size, fontWeight: '800', color: L.navy },
  uploadSub: { fontSize: 11, color: L.textSub, textAlign: 'center', lineHeight: 16 },
  photoHelper: { fontSize: 11, color: L.textSub, textAlign: 'center', marginTop: 4 },

  // Input
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderColor: L.border,
    borderRadius: shape.cta, paddingHorizontal: 12, height: 46,
    backgroundColor: L.bg,
  },
  input: { flex: 1, fontSize: text.body.size, color: L.text, fontWeight: '500' },

  // Date/Time row
  dtRow: { flexDirection: 'row', gap: 10 },
  dtCell: { flex: 1 },
  dtBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1.5, borderColor: L.border,
    borderRadius: shape.cta, paddingHorizontal: 8, height: 40,
    backgroundColor: L.bg,
  },
  dtBtnText: { flex: 1, fontSize: 11, fontWeight: '600', color: L.navy },

  // Location
  locationBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1.5, borderColor: L.border,
    borderRadius: shape.cta, height: 44, marginTop: 10,
  },
  locationBtnText: { fontSize: text.rowTitle.size, fontWeight: '700', color: L.navy },

  // Skill pills
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
  pill: {
    paddingHorizontal: 18, paddingVertical: 10,
    borderRadius: shape.pill, borderWidth: 1.5, borderColor: L.border,
    backgroundColor: L.bg,
  },
  pillActive: { backgroundColor: L.gold, borderColor: L.gold },
  pillText: { fontSize: text.controlLabel.size, fontWeight: '700', color: L.navy },
  pillTextActive: { color: L.white },

  helperText: { fontSize: text.caption.size, color: L.textSub, fontWeight: '500' },

  // Stepper
  stepperRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28,
  },
  stepperBtn: {
    width: 44, height: 44, borderRadius: 12,
    borderWidth: 1.5, borderColor: L.border,
    backgroundColor: L.bg,
    alignItems: 'center', justifyContent: 'center',
  },
  stepperBtnDisabled: { borderColor: L.border, opacity: 0.4 },
  stepperValue: { fontSize: 32, fontWeight: '900', color: L.navy, minWidth: 36, textAlign: 'center' },

  // Radio
  radioOption: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderWidth: 1.5, borderColor: L.border,
    borderRadius: shape.cta, padding: 14,
    backgroundColor: L.bg,
  },
  radioOptionActive: { borderColor: L.gold, backgroundColor: L.goldLight },
  radioCircle: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: L.border,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  radioCircleActive: { borderColor: L.gold },
  radioInner: {
    width: 11, height: 11, borderRadius: 6,
    backgroundColor: L.gold,
  },
  radioBody: { flex: 1 },
  radioLabel: { fontSize: text.rowTitle.size, fontWeight: '700', color: L.navy },
  radioSub: { fontSize: text.caption.size, fontWeight: '500', color: L.textSub, marginTop: 2 },

  // Notes
  notesInput: {
    borderWidth: 1.5, borderColor: L.border, borderRadius: shape.cta,
    padding: 12, fontSize: text.body.size, fontWeight: '500', color: L.text, minHeight: 100,
    marginTop: 6,
  },
  charCounter: { fontSize: 11, color: L.textSub, textAlign: 'right', marginTop: 6 },

  // Invite Later
  inviteRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  inviteIconWrap: { flexShrink: 0 },
  inviteBody: { flex: 1 },
  inviteTitle: { fontSize: text.caption.size, fontWeight: '500', color: L.navy, lineHeight: 18 },
  inviteSub: { fontSize: text.caption.size, fontWeight: '500', color: L.textSub, marginTop: 2 },
  inviteLink: { fontSize: text.link.size, fontWeight: '700', color: L.gold },

  // CTA
  ctaWrap: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: spacing.screenH, paddingTop: 12,
    backgroundColor: L.page,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: L.border,
    gap: 8,
  },
  ctaHelper: { fontSize: text.caption.size, fontWeight: '500', color: L.textSub, textAlign: 'center' },
  savingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 48 },
  savingText: { fontSize: text.body.size, fontWeight: '500', color: L.navy },
});
