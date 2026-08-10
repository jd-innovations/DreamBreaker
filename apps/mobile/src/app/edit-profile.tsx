import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Switch, Image, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { goBack } from '@/lib/navigation';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '@/theme';
import { useSession } from '@/hooks/useSession';
import {
  fetchProfile, updateProfile,
  AVAILABILITY_DAYS, AVAILABILITY_BLOCKS,
  type AvailabilityDay, type AvailabilityBlock, type AvailabilitySchedule,
} from '@/lib/services/profile';
import { replaceImage } from '@/lib/media';
import { notifyProfileUpdated } from '@/lib/profileEvents';
import { FacilityPickerModal } from '@/components/FacilityPicker';
import { fetchFacilityById, type FacilityWithPrimaryPhoto } from '@/lib/supabase/facilities';
import { FALLBACK_LOCATION, useCurrentLocation } from '@/lib/location';

// Theme-backed alias — brand values resolve from @/theme.
// blue = iOS system color for Cancel/Done modal actions (kept intentionally).
const L = {
  bg:       colors.bg,
  page:     colors.page,
  navy:     colors.navy,
  blue:     '#007AFF',
  gold:     colors.gold,
  text:     colors.text,
  textSub:  colors.textSub,
  textMuted:colors.textSub,
  border:   colors.border,
  div:      colors.border,
  green:    colors.success,
  danger:   colors.danger,
};

const BIO_LIMIT = 100;

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return <Text style={s.sectionHeader}>{label}</Text>;
}

// ─── Group container ──────────────────────────────────────────────────────────

function Group({ children }: { children: React.ReactNode }) {
  return <View style={s.group}>{children}</View>;
}

// ─── Thin divider ─────────────────────────────────────────────────────────────

function Div() {
  return <View style={s.div} />;
}

// ─── Plain text field row ─────────────────────────────────────────────────────

function FieldRow({
  label, value, onChangeText, placeholder, last,
}: {
  label: string; value: string;
  onChangeText: (t: string) => void;
  placeholder?: string; last?: boolean;
}) {
  return (
    <>
      <View style={s.fieldRow}>
        <Text style={s.fieldLabel}>{label}</Text>
        <TextInput
          style={s.fieldInput}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder ?? label}
          placeholderTextColor={L.textMuted}
          selectionColor={L.navy}
          underlineColorAndroid="transparent"
          returnKeyType="done"
        />
      </View>
      {!last && <Div />}
    </>
  );
}

// ─── Bio field ────────────────────────────────────────────────────────────────

function BioField({ value, onChangeText }: { value: string; onChangeText: (t: string) => void }) {
  return (
    <>
      <Div />
      <View style={s.bioRow}>
        <Text style={s.fieldLabel}>Bio</Text>
        <View style={s.bioRight}>
          <TextInput
            style={s.bioInput}
            value={value}
            onChangeText={t => { if (t.length <= BIO_LIMIT) onChangeText(t); }}
            placeholder="Tell players about yourself…"
            placeholderTextColor={L.textMuted}
            selectionColor={L.navy}
            underlineColorAndroid="transparent"
            multiline
            returnKeyType="done"
          />
          <Text style={s.bioCount}>{value.length}/{BIO_LIMIT}</Text>
        </View>
      </View>
    </>
  );
}

// ─── Rating row (tappable, shows gold value + chevron) ────────────────────────

function RatingRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <>
      <TouchableOpacity style={s.fieldRow} activeOpacity={0.7}>
        <Text style={s.fieldLabel}>{label}</Text>
        <View style={s.ratingRight}>
          <Text style={s.ratingValue}>{value}</Text>
          <Ionicons name="chevron-forward" size={16} color={L.textMuted} />
        </View>
      </TouchableOpacity>
      {!last && <Div />}
    </>
  );
}

// ─── Segmented control ────────────────────────────────────────────────────────

function SegmentRow({
  label, options, value, onChange,
}: {
  label: string; options: string[]; value: string; onChange: (v: string) => void;
}) {
  return (
    <>
      <Div />
      <View style={s.fieldRow}>
        <Text style={s.fieldLabel}>{label}</Text>
        <View style={s.segmented}>
          {options.map((opt, i) => {
            const active = opt === value;
            return (
              <TouchableOpacity
                key={opt}
                style={[
                  s.segBtn,
                  i === 0 && s.segBtnLeft,
                  i === options.length - 1 && s.segBtnRight,
                  active && s.segBtnActive,
                ]}
                onPress={() => onChange(opt)}
                activeOpacity={0.8}
              >
                <Text style={[s.segText, active && s.segTextActive]}>{opt.charAt(0).toUpperCase() + opt.slice(1)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </>
  );
}

// ─── Stepper row ──────────────────────────────────────────────────────────────

function StepperRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <>
      <Div />
      <View style={s.fieldRow}>
        <Text style={s.fieldLabel}>{label}</Text>
        <View style={s.stepper}>
          <TouchableOpacity style={s.stepBtn} onPress={() => onChange(Math.max(0, value - 1))}>
            <Text style={s.stepIcon}>−</Text>
          </TouchableOpacity>
          <Text style={s.stepValue}>{value}</Text>
          <TouchableOpacity style={s.stepBtn} onPress={() => onChange(value + 1)}>
            <Text style={s.stepIcon}>+</Text>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
}

// ─── Play style field (chips + "Other" free text) ─────────────────────────────

const PLAY_STYLES = [
  'Banger',
  'Soft Game / Dinker',
  'All-Court / Balanced',
  'Aggressive Net Player',
  'Defensive / Counter-puncher',
  'Third-Shot Specialist',
];

function PlayStyleField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [otherMode, setOtherMode] = useState(() => value !== '' && !PLAY_STYLES.includes(value));
  const activeChip = otherMode ? 'Other' : value;

  const selectChip = (opt: string) => {
    if (opt === 'Other') {
      if (otherMode) { setOtherMode(false); onChange(''); }
      else { setOtherMode(true); onChange(''); }
      return;
    }
    setOtherMode(false);
    onChange(activeChip === opt ? '' : opt);
  };

  return (
    <>
      <Div />
      <View style={s.chipSection}>
        <Text style={s.fieldLabel}>Play Style</Text>
        <View style={s.chipWrap}>
          {[...PLAY_STYLES, 'Other'].map((opt) => {
            const active = activeChip === opt;
            return (
              <TouchableOpacity
                key={opt}
                style={[s.chip, active && s.chipActive]}
                onPress={() => selectChip(opt)}
                activeOpacity={0.75}
              >
                <Text style={[s.chipText, active && s.chipTextActive]}>{opt}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {otherMode && (
          <TextInput
            style={s.otherInput}
            value={value}
            onChangeText={onChange}
            placeholder="Describe your play style"
            placeholderTextColor={L.textMuted}
            selectionColor={L.navy}
            underlineColorAndroid="transparent"
            returnKeyType="done"
          />
        )}
      </View>
    </>
  );
}

// ─── Chip selector row (single-select) ───────────────────────────────────────

function ChipRow({
  label, options, value, onChange,
}: {
  label: string; options: string[]; value: string; onChange: (v: string) => void;
}) {
  return (
    <>
      <Div />
      <View style={s.chipSection}>
        <Text style={s.fieldLabel}>{label}</Text>
        <View style={s.chipWrap}>
          {options.map((opt) => {
            const active = opt === value;
            return (
              <TouchableOpacity
                key={opt}
                style={[s.chip, active && s.chipActive]}
                onPress={() => onChange(active ? '' : opt)}
                activeOpacity={0.75}
              >
                <Text style={[s.chipText, active && s.chipTextActive]}>{opt}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </>
  );
}

// ─── Availability week grid (Google Maps hours-style) ─────────────────────────

const DAY_LABELS: Record<AvailabilityDay, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
  fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
};
const BLOCK_LABELS: Record<AvailabilityBlock, string> = {
  morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening',
};

function summarizeSchedule(schedule: AvailabilitySchedule): string {
  const days = AVAILABILITY_DAYS.filter(d => (schedule[d]?.length ?? 0) > 0);
  return days.map(d => DAY_LABELS[d].slice(0, 3)).join(', ');
}

function AvailabilityWeekGrid({
  value, onChange,
}: {
  value: AvailabilitySchedule;
  onChange: (v: AvailabilitySchedule) => void;
}) {
  const toggle = (day: AvailabilityDay, block: AvailabilityBlock) => {
    const current = value[day] ?? [];
    const next = current.includes(block)
      ? current.filter(b => b !== block)
      : [...current, block];
    onChange({ ...value, [day]: next });
  };

  return (
    <>
      <Div />
      <View style={s.availSection}>
        <Text style={s.fieldLabel}>Availability</Text>
        {AVAILABILITY_DAYS.map(day => (
          <View key={day} style={s.availRow}>
            <Text style={s.availDayLabel}>{DAY_LABELS[day]}</Text>
            <View style={s.availBlockRow}>
              {AVAILABILITY_BLOCKS.map(block => {
                const active = (value[day] ?? []).includes(block);
                return (
                  <TouchableOpacity
                    key={block}
                    style={[s.availPill, active && s.availPillActive]}
                    onPress={() => toggle(day, block)}
                    activeOpacity={0.75}
                  >
                    <Text style={[s.availPillText, active && s.availPillTextActive]}>
                      {BLOCK_LABELS[block]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}
      </View>
    </>
  );
}

// ─── Toggle row ───────────────────────────────────────────────────────────────

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

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function EditProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, loading: authLoading } = useSession();

  const [loading,   setLoading]   = useState(true);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/sign-in' as never);
  }, [user, authLoading]);
  const [saving,    setSaving]    = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  // Remote URL the avatar had when the screen loaded — used to delete the old
  // object after a successful replace. Null for new/OAuth-only avatars.
  const originalAvatarUrl = useRef<string | null>(null);

  // Basic info
  const [firstName,   setFirstName]   = useState('');
  const [lastName,    setLastName]    = useState('');
  const [bio,         setBio]         = useState('');
  const [dupr,        setDupr]        = useState('');
  const [city,        setCity]        = useState('');
  const [state,       setState_]      = useState('');
  const [playStyle,    setPlayStyle]    = useState('');
  const [selfRating,   setSelfRating]   = useState('');
  const [skillLevel,   setSkillLevel]   = useState('');
  const [schedule,     setSchedule]     = useState<AvailabilitySchedule>({});
  const [homeCourtId,   setHomeCourtId]   = useState<string | null>(null);
  const [homeCourtName, setHomeCourtName] = useState<string | null>(null);
  const [homeCourtCity, setHomeCourtCity] = useState<string | null>(null);
  const [homeCourtPickerOpen, setHomeCourtPickerOpen] = useState(false);
  const currentLocation = useCurrentLocation();

  // Pickleball
  const [hand, setHand] = useState<'left' | 'right'>('right');
  const [years, setYears] = useState(0);

  // Toggles (local only for now)
  const [partnerFinder,     setPartnerFinder]     = useState(true);
  const [communityPlay,     setCommunityPlay]     = useState(true);
  const [mixedDoubles,      setMixedDoubles]      = useState(true);
  const [mensDoubles,       setMensDoubles]       = useState(false);
  const [womensDoubles,     setWomensDoubles]     = useState(false);
  const [tournamentPartner, setTournamentPartner] = useState(true);
  const [allowMarketplace,     setAllowMarketplace]     = useState(true);
  const [showSellerReputation, setShowSellerReputation] = useState(true);
  const [allowDMs,             setAllowDMs]             = useState(true);
  const [showCity,       setShowCity]       = useState(true);
  const [showDUPR,       setShowDUPR]       = useState(true);
  const [showLastActive, setShowLastActive] = useState(false);
  const [publicProfile,  setPublicProfile]  = useState(true);

  useEffect(() => {
    if (!user?.id || fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);
    fetchProfile(user.id).then((p) => {
      if (!p) return;
      const parts = (p.full_name ?? '').split(' ');
      setFirstName(parts[0] ?? '');
      setLastName(parts.slice(1).join(' '));
      setBio(p.bio ?? '');
      setDupr(p.dupr != null ? String(p.dupr) : '');
      setCity(p.location_city ?? '');
      setState_(p.location_state ?? '');
      setPlayStyle(p.play_style ?? '');
      setSelfRating(p.self_rating ?? '');
      setSkillLevel(p.skill_level ?? '');
      setSchedule(p.availability_schedule ?? {});
      setHand(p.hand === 'left' ? 'left' : 'right');
      setAvatarUri(p.avatar_url ?? null);
      originalAvatarUrl.current = p.avatar_url ?? null;
      setHomeCourtId(p.home_court_id ?? null);
      if (p.home_court_id) {
        fetchFacilityById(p.home_court_id).then((facility) => {
          if (!facility) return;
          setHomeCourtName(facility.name);
          setHomeCourtCity(`${facility.city}, ${facility.state}`);
        });
      }
    }).finally(() => setLoading(false));
  }, [user?.id, authLoading]);

  function handleSelectHomeCourt(facility: FacilityWithPrimaryPhoto) {
    setHomeCourtId(facility.id);
    setHomeCourtName(facility.name);
    setHomeCourtCity(`${facility.city}, ${facility.state}`);
  }

  async function pickAvatar() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setAvatarUri(result.assets[0].uri);
    }
  }

  async function handleSave() {
    if (!user?.id) return;
    const userId = user.id;
    setSaving(true);

    // Non-avatar profile fields — written either directly, or as the commit
    // step of the avatar replace so the whole save is one DB write.
    const baseUpdates = {
      full_name:      `${firstName.trim()} ${lastName.trim()}`.trim(),
      bio:            bio.trim() || undefined,
      location_city:  city.trim(),
      location_state: state.trim(),
      hand,
      play_style:     playStyle.trim() || undefined,
      self_rating:    selfRating.trim() || undefined,
      skill_level:    skillLevel || undefined,
      availability:   summarizeSchedule(schedule) || undefined,
      availability_schedule: schedule,
      home_court_id:  homeCourtId,
    };

    try {
      const isNewAvatar = !!avatarUri && !avatarUri.startsWith('http');
      if (isNewAvatar) {
        // Pipeline validates → crops → compresses → uploads, then runs commit
        // (the profile write), then deletes the previous avatar object. On a
        // failed commit the new object is rolled back and the old avatar stays.
        await replaceImage(
          {
            uri: avatarUri!,
            category: 'avatar',
            entityId: userId,
            ownerId: userId,
            previousUrl: originalAvatarUrl.current,
          },
          async (result) => {
            await updateProfile(userId, { ...baseUpdates, avatar_url: result.url });
          },
        );
      } else {
        await updateProfile(userId, baseUpdates);
      }
      notifyProfileUpdated();
      goBack();
    } catch (e: any) {
      // DB is unchanged on failure; avatarUri still holds the local pick, so
      // tapping Done again retries without re-selecting.
      Alert.alert('Save failed', e?.message ?? 'The new photo was not saved. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: L.page, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={L.gold} size="large" />
      </View>
    );
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* ── Header (fixed) ── */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => goBack()} style={s.headerSide}>
          <Text style={s.headerAction}>Cancel</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Edit Profile</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving} style={[s.headerSide, s.headerRight]}>
          {saving
            ? <ActivityIndicator color={L.blue} size="small" />
            : <Text style={[s.headerAction, s.headerDone]}>Done</Text>}
        </TouchableOpacity>
      </View>

      {/* No KeyboardAvoidingView. The props below stop iOS from auto-adjusting
          the scroll view's insets when the keyboard / safe area change, so the
          keyboard simply overlays the content instead of shifting the form
          past the visible edges. */}
      <ScrollView
        style={s.scrollView}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets={false}
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 160 }]}
      >
        {/* ── Avatar ── */}
        <View style={s.avatarSection}>
          <View style={s.avatarWrap}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={s.avatar} />
            ) : (
              <View style={[s.avatar, { backgroundColor: L.navy, alignItems: 'center', justifyContent: 'center' }]}>
                <Ionicons name="person" size={40} color="#fff" />
              </View>
            )}
            <View style={s.cameraOverlay}>
              <Ionicons name="camera" size={14} color="#FFFFFF" />
            </View>
          </View>
          <TouchableOpacity activeOpacity={0.7} onPress={pickAvatar}>
            <Text style={s.changePhoto}>Change Photo</Text>
          </TouchableOpacity>
        </View>

        {/* ── Basic Info ── */}
        <SectionHeader label="BASIC INFO" />
        <Group>
          <FieldRow label="First Name" value={firstName}   onChangeText={setFirstName} placeholder="First name" />
          <FieldRow label="Last Name"  value={lastName}    onChangeText={setLastName}  placeholder="Last name" />
          <FieldRow label="City"       value={city}        onChangeText={setCity}      placeholder="City" />
          <FieldRow label="State"      value={state}       onChangeText={setState_}    placeholder="FL" last />
          <BioField value={bio} onChangeText={setBio} />
        </Group>

        {/* ── Pickleball ── */}
        <SectionHeader label="PICKLEBALL" />
        <Group>
          <FieldRow label="DUPR Rating"  value={dupr}       onChangeText={setDupr}       placeholder="e.g. 3.85" />
          <FieldRow label="Self Rating"  value={selfRating} onChangeText={setSelfRating} placeholder="e.g. 4.0" />
          <ChipRow
            label="Skill Level"
            options={['2.5-3.0', '3.0-3.5', '3.5-4.0', '4.0-4.5', '4.5+']}
            value={skillLevel}
            onChange={setSkillLevel}
          />
          <AvailabilityWeekGrid value={schedule} onChange={setSchedule} />
          <PlayStyleField value={playStyle} onChange={setPlayStyle} />
          <SegmentRow
            label="Dominant Hand"
            options={['left', 'right']}
            value={hand}
            onChange={v => setHand(v as 'left' | 'right')}
          />
          <StepperRow label="Years Playing" value={years} onChange={setYears} />
        </Group>

        {/* ── Home Court ── */}
        <SectionHeader label="HOME COURT" />
        <Group>
          <TouchableOpacity style={s.fieldRow} activeOpacity={0.7} onPress={() => setHomeCourtPickerOpen(true)}>
            <Text style={s.fieldLabel}>Home Court</Text>
            <View style={s.ratingRight}>
              <Text style={s.homeCourtValue} numberOfLines={1}>
                {homeCourtName ?? 'Not set'}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={L.textMuted} />
            </View>
          </TouchableOpacity>
          {homeCourtCity && (
            <>
              <Div />
              <View style={[s.fieldRow, { paddingVertical: 8 }]}>
                <Text style={s.homeCourtSub}>{homeCourtCity}</Text>
              </View>
            </>
          )}
        </Group>

        {/* ── Looking For ── */}
        <SectionHeader label="LOOKING FOR" />
        <Group>
          <ToggleRow label="Partner Finder"     sub="Find players to play with"        value={partnerFinder}     onChange={setPartnerFinder} />
          <ToggleRow label="Community Play"     sub="Join community games"             value={communityPlay}     onChange={setCommunityPlay} />
          <ToggleRow label="Mixed Doubles"      sub="Play mixed doubles"               value={mixedDoubles}      onChange={setMixedDoubles} />
          <ToggleRow label="Men's Doubles"      sub="Play men's doubles"               value={mensDoubles}       onChange={setMensDoubles} />
          <ToggleRow label="Women's Doubles"    sub="Play women's doubles"             value={womensDoubles}     onChange={setWomensDoubles} />
          <ToggleRow label="Tournament Partner" sub="Find partners for tournaments"    value={tournamentPartner} onChange={setTournamentPartner} last />
        </Group>

        {/* ── Marketplace ── */}
        <SectionHeader label="MARKETPLACE" />
        <Group>
          <ToggleRow label="Allow Marketplace Profile" sub="Show your profile to buyers"      value={allowMarketplace}     onChange={setAllowMarketplace} />
          <ToggleRow label="Show Seller Reputation"    sub="Display your activity & ratings"  value={showSellerReputation} onChange={setShowSellerReputation} />
          <ToggleRow label="Allow Direct Messages"     sub="Allow buyers to message you"      value={allowDMs}             onChange={setAllowDMs} last />
        </Group>

        {/* ── Privacy ── */}
        <SectionHeader label="PRIVACY" />
        <Group>
          <ToggleRow label="Show City"        sub="Show your city on your profile"  value={showCity}       onChange={setShowCity} />
          <ToggleRow label="Show DUPR Rating" sub="Display your DUPR rating"        value={showDUPR}       onChange={setShowDUPR} />
          <ToggleRow label="Show Last Active" sub="Show when you were last active"  value={showLastActive} onChange={setShowLastActive} />
          <ToggleRow label="Public Profile"   sub="Allow others to find your profile" value={publicProfile} onChange={setPublicProfile} last />
        </Group>

        {/* ── Footer ── */}
        <Text style={s.footer}>Changes are saved automatically.</Text>
      </ScrollView>

      <FacilityPickerModal
        visible={homeCourtPickerOpen}
        onClose={() => setHomeCourtPickerOpen(false)}
        onSelectFacility={handleSelectHomeCourt}
        lat={currentLocation.lat ?? FALLBACK_LOCATION.lat}
        lng={currentLocation.lng ?? FALLBACK_LOCATION.lng}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },
  scrollView: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: L.bg, borderBottomWidth: 1, borderBottomColor: L.border,
    paddingHorizontal: 16, paddingVertical: 13,
  },
  headerSide:   { minWidth: 70 },
  headerRight:  { alignItems: 'flex-end' },
  headerTitle:  { color: L.navy, fontSize: 17, fontWeight: '700' },
  headerAction: { color: L.blue, fontSize: 17, fontWeight: '400' },
  headerDone:   { fontWeight: '600' },

  scroll: { padding: 20, gap: 0 },

  // Avatar
  avatarSection: { alignItems: 'center', marginBottom: 28 },
  avatarWrap:    { position: 'relative', marginBottom: 10 },
  avatar: {
    width: 90, height: 90, borderRadius: 45,
    borderWidth: 2, borderColor: L.border,
  },
  cameraOverlay: {
    position: 'absolute', bottom: 0, right: 0,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: L.navy, borderWidth: 2, borderColor: L.bg,
    alignItems: 'center', justifyContent: 'center',
  },
  changePhoto: { color: L.blue, fontSize: 15, fontWeight: '500' },

  // Section header
  sectionHeader: {
    color: L.textMuted, fontSize: 12, fontWeight: '600',
    letterSpacing: 0.6, textTransform: 'uppercase',
    marginBottom: 8, marginTop: 24, paddingHorizontal: 4,
  },

  // Group
  group: {
    backgroundColor: L.bg, borderRadius: 12,
    borderWidth: 1, borderColor: L.border,
  },

  // Divider
  div: { height: StyleSheet.hairlineWidth, backgroundColor: L.div, marginLeft: 16 },

  // Field row
  fieldRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 13, minHeight: 46,
  },
  fieldLabel: { color: L.text, fontSize: 15, fontWeight: '500', width: 130 },
  fieldInput: {
    flex: 1, color: L.text, fontSize: 15, fontWeight: '400',
    textAlign: 'right', padding: 0,
    borderWidth: 0, backgroundColor: 'transparent',
    // suppress iOS focus shadow
    shadowColor: 'transparent', elevation: 0,
  },

  // Bio
  bioRow: {
    flexDirection: 'row', paddingHorizontal: 16, paddingTop: 13, paddingBottom: 10,
    alignItems: 'flex-start',
  },
  bioRight: { flex: 1 },
  bioInput: {
    color: L.text, fontSize: 15, fontWeight: '400',
    textAlign: 'right', padding: 0, minHeight: 56,
    borderWidth: 0, backgroundColor: 'transparent',
    shadowColor: 'transparent', elevation: 0,
  },
  bioCount: {
    color: L.textMuted, fontSize: 12, fontWeight: '400',
    textAlign: 'right', marginTop: 4,
  },

  // Rating
  ratingRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ratingValue: { color: L.gold, fontSize: 15, fontWeight: '600' },

  // Home court
  homeCourtValue: { color: L.gold, fontSize: 15, fontWeight: '600', maxWidth: 200 },
  homeCourtSub:   { color: L.textMuted, fontSize: 13, fontWeight: '400' },

  // Segmented control
  segmented: { flexDirection: 'row', borderRadius: 8, borderWidth: 1, borderColor: L.border, overflow: 'hidden' },
  segBtn:    { paddingHorizontal: 16, paddingVertical: 6, backgroundColor: L.bg },
  segBtnLeft: { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: L.border },
  segBtnRight:{},
  segBtnActive: { backgroundColor: L.navy },
  segText:   { color: L.textMuted, fontSize: 14, fontWeight: '500' },
  segTextActive: { color: '#FFFFFF', fontWeight: '600' },

  // Chip selector
  chipSection: { paddingHorizontal: 14, paddingVertical: 10 },
  chipWrap:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip:        { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: L.border, backgroundColor: L.bg },
  chipActive:  { backgroundColor: L.navy, borderColor: L.navy },
  chipText:    { color: L.textMuted, fontSize: 13, fontWeight: '500' },
  chipTextActive: { color: '#FFFFFF', fontWeight: '600' },
  otherInput: {
    marginTop: 10, color: L.text, fontSize: 14, fontWeight: '400',
    borderWidth: 1, borderColor: L.border, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: L.page,
  },

  // Availability week grid
  availSection: { paddingHorizontal: 14, paddingVertical: 10, gap: 10 },
  availRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 6, gap: 8,
  },
  availDayLabel: { color: L.text, fontSize: 13, fontWeight: '500', width: 82 },
  availBlockRow: { flexDirection: 'row', flex: 1, gap: 6, justifyContent: 'flex-end' },
  availPill: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16,
    borderWidth: 1, borderColor: L.border, backgroundColor: L.bg,
  },
  availPillActive: { backgroundColor: L.navy, borderColor: L.navy },
  availPillText: { color: L.textMuted, fontSize: 11, fontWeight: '600' },
  availPillTextActive: { color: '#FFFFFF' },

  // Stepper
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 0, borderWidth: 1, borderColor: L.border, borderRadius: 8, overflow: 'hidden' },
  stepBtn:  { paddingHorizontal: 14, paddingVertical: 6, backgroundColor: L.page },
  stepIcon: { color: L.navy, fontSize: 18, fontWeight: '400', lineHeight: 22 },
  stepValue:{ color: L.navy, fontSize: 15, fontWeight: '600', paddingHorizontal: 16, borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderColor: L.border, paddingVertical: 6 },

  // Toggle row
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 11,
  },
  toggleText:  { flex: 1, marginRight: 12 },
  toggleLabel: { color: L.text, fontSize: 15, fontWeight: '500', marginBottom: 2 },
  toggleSub:   { color: L.textMuted, fontSize: 12, fontWeight: '400' },

  // Footer
  footer: {
    color: L.textMuted, fontSize: 13, fontWeight: '400',
    textAlign: 'center', marginTop: 28,
  },
});
