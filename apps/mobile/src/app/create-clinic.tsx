import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, Alert, Image,
  ActivityIndicator, Modal, type AlertButton,
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
import { useProfile } from '@/hooks/useProfile';
import { createClinic, uploadPlayEventCover, parseDurationLabel } from '@/lib/supabase/playEvents';
import { searchPlayers, type InvitablePlayer } from '@/lib/supabase/playEventInvites';
import { consumePendingGroupId } from '@/lib/pendingGroupLink';
import { eventCoverUri } from '@/lib/eventCover';
import { FacilityPicker, type FacilityPickerValue } from '@/components/FacilityPicker';
import { fetchFacilityById } from '@/lib/supabase/facilities';

// ─── Constants ──────────────────────────────────────────────────────────────────

const SKILL_RANGES = ['Beginner', '3.0 – 3.5', '3.5 – 4.0', '4.0 – 4.5', '4.5+'];
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
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function ratingLabel(p: InvitablePlayer): string {
  if (p.dupr != null) return `DUPR ${p.dupr.toFixed(2)}`;
  if (p.self_rating) return `Self Rated ${p.self_rating}`;
  return 'Not Rated';
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

// Instructor row — shows the currently-selected instructor with an avatar +
// name, and a "Reassign" link that opens the search sheet below.
function InstructorRow({ instructor, onReassign }: { instructor: InvitablePlayer | null; onReassign: () => void }) {
  return (
    <View style={ir.row}>
      {instructor?.avatar_url ? (
        <Image source={{ uri: instructor.avatar_url }} style={ir.avatarImg} />
      ) : (
        <View style={ir.avatar}>
          <Text style={ir.avatarText}>{(instructor?.full_name ?? '?').slice(0, 2).toUpperCase()}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={ir.name} numberOfLines={1}>{instructor?.full_name ?? 'Loading…'}</Text>
        <Text style={ir.rating}>{instructor ? ratingLabel(instructor) : ' '}</Text>
      </View>
      <TouchableOpacity style={ir.reassignBtn} onPress={onReassign} activeOpacity={0.8}>
        <Text style={ir.reassignText}>Reassign</Text>
      </TouchableOpacity>
    </View>
  );
}
const ir = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: L.border, borderRadius: shape.cta,
    padding: 12,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: L.navy, alignItems: 'center', justifyContent: 'center',
  },
  avatarImg: { width: 40, height: 40, borderRadius: 20 },
  avatarText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  name: { color: L.navy, fontSize: text.rowValue.size, fontWeight: '800' },
  rating: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', marginTop: 2 },
  reassignBtn: {
    borderRadius: shape.cta, paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: L.goldBg,
  },
  reassignText: { color: L.gold, fontSize: text.chipValue.size, fontWeight: '800' },
});

// ─── Screen ────────────────────────────────────────────────────────────────────

export default function CreateClinicScreen() {
  const insets = useSafeAreaInsets();
  const { user, profile } = useProfile();
  const { facilityId: preloadId } = useLocalSearchParams<{ facilityId?: string }>();

  // Default to tomorrow 10:00 AM — most clinics run mornings/daytime.
  const defaultDate = (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return d; })();

  // Form state
  const [photo,         setPhoto]         = useState<string | null>(null);
  const [photoMimeType, setPhotoMimeType] = useState<string | null>(null);
  const [clinicName,    setClinicName]    = useState('Beginner Pickleball Clinic');
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

  const [skillRange,    setSkillRange]    = useState('Beginner');
  const [players,       setPlayers]       = useState(8);
  const [visibility,    setVisibility]    = useState<'public' | 'invite_only'>('public');
  const [notes,         setNotes]         = useState('');
  const [saving,        setSaving]        = useState(false);

  // Instructor — defaults to the signed-in organizer, reassignable via search.
  const [instructor,      setInstructor]      = useState<InvitablePlayer | null>(null);
  const [instructorSheet,  setInstructorSheet]  = useState(false);
  const [instructorQuery,  setInstructorQuery]  = useState('');
  const [instructorResults, setInstructorResults] = useState<InvitablePlayer[]>([]);
  const [instructorSearching, setInstructorSearching] = useState(false);

  useEffect(() => {
    if (!profile || instructor) return;
    setInstructor({
      id: profile.id, full_name: profile.full_name, avatar_url: profile.avatar_url,
      dupr: profile.dupr, self_rating: profile.self_rating,
    });
  }, [profile, instructor]);

  useEffect(() => {
    if (!instructorSheet || !user?.id) return;
    let cancelled = false;
    setInstructorSearching(true);
    const handle = setTimeout(() => {
      searchPlayers(user.id, instructorQuery).then(res => { if (!cancelled) setInstructorResults(res); }).finally(() => { if (!cancelled) setInstructorSearching(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [instructorQuery, instructorSheet, user?.id]);

  // Picker visibility
  const [activePicker, setActivePicker]  = useState<'date' | 'time' | null>(null);

  // ── Handlers ──

  async function pickFromLibrary() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to add a clinic photo.');
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

  async function handleCreateClinic() {
    if (!user?.id) {
      Alert.alert(
        'Sign in required',
        'You need to be signed in to create a clinic.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign In', onPress: () => router.push('/sign-in' as never) },
        ],
      );
      return;
    }

    if (!clinicName.trim()) {
      Alert.alert('Missing field', 'Please enter a clinic name.'); return;
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
          // Photo upload failure is non-fatal — create clinic without cover
        }
      }

      const isFacility = pickerValue?.mode === 'facility';
      const created = await createClinic({
        organizerId:     user.id,
        instructorId:    instructor?.id ?? user.id,
        name:            clinicName.trim(),
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
      Alert.alert('Could not create clinic', msg);
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

          <View style={s.headerIcon}>
            <PickleballIcon size={22} color={L.gold} />
          </View>
        </View>

        <Text style={s.title}>Create Clinic</Text>
        <Text style={s.subtitle}>Host a lesson and help players learn to play.</Text>
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

          {/* ── SECTION 1: CLINIC PHOTO ── */}
          <View style={s.card}>
            <CardHeader icon="image-outline" label="Clinic Photo" />
            <Text style={s.cardSub}>
              Add a photo to make your clinic stand out.{' '}
              <Text style={s.optionalTag}>(Optional)</Text>
            </Text>

            <View style={s.photoRow}>
              <View style={s.photoPreviewWrap}>
                <Image source={{ uri: displayPhoto }} style={s.photoPreview} resizeMode="cover" />
                <TouchableOpacity style={s.cameraBtn} onPress={handlePhotoPress} activeOpacity={0.85}>
                  <Ionicons name="camera" size={16} color={L.navy} />
                </TouchableOpacity>
              </View>

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

          {/* ── SECTION 2: CLINIC DETAILS ── */}
          <View style={s.card}>
            <CardHeader icon="document-text-outline" label="Clinic Details" />

            <FieldLabel>Clinic Name</FieldLabel>
            <View style={s.inputWrap}>
              <TextInput
                style={s.input}
                value={clinicName}
                onChangeText={setClinicName}
                placeholder="Name your clinic"
                placeholderTextColor={L.textSub}
                returnKeyType="done"
              />
              {clinicName.length > 0 && (
                <TouchableOpacity onPress={() => setClinicName('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={18} color={L.textSub} />
                </TouchableOpacity>
              )}
            </View>

            <Divider />

            <View style={s.dtRow}>
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

          {/* ── SECTION 4: INSTRUCTOR ── */}
          <View style={s.card}>
            <CardHeader icon="school-outline" label="Instructor" />
            <Text style={s.cardSub}>
              You're the instructor by default. Reassign to another player if someone else is teaching.
            </Text>
            <InstructorRow instructor={instructor} onReassign={() => setInstructorSheet(true)} />
          </View>

          {/* ── SECTION 5: SKILL LEVEL ── */}
          <View style={s.card}>
            <CardHeader icon="speedometer-outline" label="Skill Level" />

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

            <Text style={s.helperText}>Helps players find the right clinic level.</Text>
          </View>

          {/* ── SECTION 6: PLAYERS NEEDED ── */}
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

          {/* ── SECTION 7: WHO CAN JOIN ── */}
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

          {/* ── SECTION 8: ADDITIONAL NOTES ── */}
          <View style={s.card}>
            <CardHeader icon="create-outline" label="Additional Notes" />
            <Text style={[s.cardSub, { marginTop: -8 }]}>
              <Text style={s.optionalTag}>(Optional)</Text>
            </Text>

            <TextInput
              style={s.notesInput}
              value={notes}
              onChangeText={t => t.length <= 200 && setNotes(t)}
              placeholder="Add any details about your clinic..."
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

      {/* ── BOTTOM CTA — floats above tab bar ── */}
      <View style={[s.ctaWrap, { paddingBottom: insets.bottom + spacing.md }]}>
        {saving ? (
          <View style={s.savingRow}>
            <ActivityIndicator color={L.gold} />
            <Text style={s.savingText}>Creating clinic…</Text>
          </View>
        ) : (
          <PrimaryButton label="Create Clinic" onPress={handleCreateClinic} />
        )}
      </View>

      {/* ── INSTRUCTOR REASSIGN SHEET ── */}
      <Modal visible={instructorSheet} animationType="slide" transparent onRequestClose={() => setInstructorSheet(false)}>
        <View style={m.overlay}>
          <View style={[m.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={m.sheetHeader}>
              <Text style={m.sheetTitle}>Reassign Instructor</Text>
              <TouchableOpacity onPress={() => setInstructorSheet(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={L.navy} />
              </TouchableOpacity>
            </View>

            <View style={m.searchBar}>
              <Ionicons name="search-outline" size={16} color={L.textSub} />
              <TextInput
                style={m.searchInput}
                placeholder="Search players by name"
                placeholderTextColor={L.textSub}
                value={instructorQuery}
                onChangeText={setInstructorQuery}
                autoCapitalize="none"
              />
            </View>

            <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
              {instructorSearching ? (
                <ActivityIndicator size="small" color={L.gold} style={{ marginTop: 24 }} />
              ) : instructorQuery.trim().length < 2 ? (
                <Text style={m.emptyText}>Type at least 2 characters to search.</Text>
              ) : instructorResults.length === 0 ? (
                <Text style={m.emptyText}>No players found.</Text>
              ) : (
                instructorResults.map(p => (
                  <TouchableOpacity
                    key={p.id}
                    style={m.row}
                    activeOpacity={0.8}
                    onPress={() => { setInstructor(p); setInstructorSheet(false); setInstructorQuery(''); }}
                  >
                    {p.avatar_url ? (
                      <Image source={{ uri: p.avatar_url }} style={m.avatarImg} />
                    ) : (
                      <View style={m.avatar}>
                        <Text style={m.avatarText}>{p.full_name.slice(0, 2).toUpperCase()}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={m.name} numberOfLines={1}>{p.full_name}</Text>
                      <Text style={m.rating}>{ratingLabel(p)}</Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },

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

  scroll: { paddingHorizontal: spacing.screenH, paddingTop: spacing.md, gap: 14 },

  card: {
    backgroundColor: L.bg,
    borderRadius: shape.card,
    borderWidth: 1, borderColor: L.border,
    padding: spacing.lg,
  },
  cardSub: { fontSize: text.caption.size, color: L.textSub, fontWeight: '500', marginBottom: 14, marginTop: -8 },
  optionalTag: { fontSize: text.caption.size, color: L.textSub, fontWeight: '500' },

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

  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderColor: L.border,
    borderRadius: shape.cta, paddingHorizontal: 12, height: 46,
    backgroundColor: L.bg,
  },
  input: { flex: 1, fontSize: text.body.size, color: L.text, fontWeight: '500' },

  dtRow: { flexDirection: 'row', gap: 10 },
  dtCell: { flex: 1 },
  dtBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1.5, borderColor: L.border,
    borderRadius: shape.cta, paddingHorizontal: 8, height: 40,
    backgroundColor: L.bg,
  },
  dtBtnText: { flex: 1, fontSize: 11, fontWeight: '600', color: L.navy },

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

  notesInput: {
    borderWidth: 1.5, borderColor: L.border, borderRadius: shape.cta,
    padding: 12, fontSize: text.body.size, fontWeight: '500', color: L.text, minHeight: 100,
    marginTop: 6,
  },
  charCounter: { fontSize: 11, color: L.textSub, textAlign: 'right', marginTop: 6 },

  ctaWrap: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: spacing.screenH, paddingTop: 12,
    backgroundColor: L.page,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: L.border,
    gap: 8,
  },
  savingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 48 },
  savingText: { fontSize: text.body.size, fontWeight: '500', color: L.navy },
});

const m = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(10,18,40,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: L.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: spacing.screenH, paddingTop: 16, maxHeight: '80%',
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 14,
  },
  sheetTitle: { fontSize: text.titleSm.size, fontWeight: '800', color: L.navy },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: L.page, borderWidth: 1, borderColor: L.border, borderRadius: shape.panel,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12,
  },
  searchInput: { flex: 1, color: L.text, fontSize: text.body.size, fontWeight: '500' },
  emptyText: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', textAlign: 'center', marginTop: 24, marginBottom: 24, lineHeight: 20 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: shape.panel, borderWidth: 1, borderColor: L.border,
    padding: 12, marginBottom: 8,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: L.navy, alignItems: 'center', justifyContent: 'center',
  },
  avatarImg: { width: 40, height: 40, borderRadius: 20 },
  avatarText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  name: { color: L.navy, fontSize: text.rowValue.size, fontWeight: '800' },
  rating: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', marginTop: 2 },
});
