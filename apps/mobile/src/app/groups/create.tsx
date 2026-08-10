import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, TextInput, Switch, Image, Alert, ActivityIndicator, type AlertButton,
} from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing } from '@/theme';
import { useSession } from '@/hooks/useSession';
import { createGroup, uploadGroupBanner } from '@/lib/groupService';

const L = {
  bg: colors.bg, page: colors.page, navy: colors.navy,
  gold: colors.gold, goldLight: colors.goldLight, goldBg: colors.goldBg,
  text: colors.text, textSub: colors.textSub, border: colors.border,
};

type Privacy = 'public' | 'private' | 'secret';
type SkillLevel = 'All Levels' | '3.0–3.5' | '3.5–4.0' | '4.0–4.5' | '4.5+';

const SKILL_LEVELS: SkillLevel[] = ['All Levels', '3.0–3.5', '3.5–4.0', '4.0–4.5', '4.5+'];

const PRIVACY_OPTIONS: { value: Privacy; label: string; icon: keyof typeof Ionicons.glyphMap; desc: string }[] = [
  { value: 'public',  label: 'Public',  icon: 'globe-outline',       desc: 'Anyone can find and join.' },
  { value: 'private', label: 'Private', icon: 'lock-closed-outline',  desc: 'Anyone can find and request to join. Approval required.' },
  { value: 'secret',  label: 'Secret',  icon: 'eye-off-outline',      desc: 'Only people with an invite link can join.' },
];

function CardSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={cs.wrap}>
      <Text style={cs.title}>{title}</Text>
      <View style={cs.card}>{children}</View>
    </View>
  );
}
const cs = StyleSheet.create({
  wrap: { marginBottom: 24 },
  title: { color: L.navy, fontSize: 13, fontWeight: '900', letterSpacing: 0.5, marginBottom: 10, marginLeft: 2 },
  card: {
    backgroundColor: L.bg, borderRadius: 16,
    borderWidth: 1, borderColor: L.border,
    overflow: 'hidden',
  },
});

export default function CreateGroupScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();

  const [groupName, setGroupName] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [skill, setSkill] = useState<SkillLevel>('All Levels');
  const [privacy, setPrivacy] = useState<Privacy>('private');
  const [allowInvites, setAllowInvites] = useState(true);
  const [allowPosts, setAllowPosts] = useState(true);
  const [photo, setPhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function pickFromLibrary() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to add a group photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });
    if (!result.canceled) setPhoto(result.assets[0].uri);
  }

  async function pickFromCamera() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow camera access to take a photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [16, 9], quality: 0.8 });
    if (!result.canceled) setPhoto(result.assets[0].uri);
  }

  function handlePhotoPress() {
    const buttons: AlertButton[] = [
      { text: 'Take Photo', onPress: pickFromCamera },
      { text: 'Choose from Library', onPress: pickFromLibrary },
      { text: 'Cancel', style: 'cancel' },
    ];
    Alert.alert('Group Photo', undefined, buttons);
  }

  async function handleCreate() {
    if (!groupName.trim()) {
      Alert.alert('Group Name Required', 'Please enter a name for your group.');
      return;
    }
    if (!user?.id) {
      Alert.alert('Not signed in', 'Please sign in to create a group.');
      return;
    }

    setSaving(true);
    try {
      let imageUrl: string | undefined;
      if (photo) {
        try { imageUrl = await uploadGroupBanner(user.id, photo); } catch { /* non-fatal — create without banner */ }
      }

      const group = await createGroup({
        name: groupName.trim(),
        description: description.trim(),
        imageUrl: imageUrl ?? null,
        location: location.trim() || null,
        skill,
        privacy,
        allowInvites,
        allowPosts,
      }, user.id);

      router.replace(`/groups/${group.id}` as never);
    } catch (err: unknown) {
      Alert.alert('Could not create group', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.6}>
          <Ionicons name="chevron-back" size={20} color={L.navy} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>Create Group</Text>
          <Text style={s.headerSub}>Build your pickleball community.</Text>
        </View>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 120 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Group Photo ── */}
        <CardSection title="GROUP PHOTO">
          <TouchableOpacity style={ph.uploadTile} activeOpacity={0.8} onPress={handlePhotoPress}>
            {photo ? (
              <Image source={{ uri: photo }} style={ph.preview} resizeMode="cover" />
            ) : (
              <>
                <Ionicons name="camera-outline" size={28} color={L.textSub} />
                <Text style={ph.uploadText}>Add Photo</Text>
                <Text style={ph.uploadSub}>Tap to add from gallery or camera</Text>
              </>
            )}
          </TouchableOpacity>
          <Text style={ph.label}>Optional</Text>
        </CardSection>

        {/* ── Group Details ── */}
        <CardSection title="GROUP DETAILS">
          <View style={gd.field}>
            <Text style={gd.fieldLabel}>Group Name</Text>
            <TextInput
              style={gd.input}
              placeholder="e.g. Lakewood Ranch Competitive"
              placeholderTextColor={L.textSub}
              value={groupName}
              onChangeText={setGroupName}
              maxLength={50}
            />
            <Text style={gd.charCount}>{groupName.length}/50</Text>
          </View>

          <View style={[gd.field, gd.fieldBorder]}>
            <Text style={gd.fieldLabel}>Description</Text>
            <TextInput
              style={[gd.input, gd.textArea]}
              placeholder="Tell people what your group is about..."
              placeholderTextColor={L.textSub}
              value={description}
              onChangeText={(t) => t.length <= 250 && setDescription(t)}
              multiline
              textAlignVertical="top"
            />
            <Text style={gd.charCount}>{description.length}/250</Text>
          </View>

          <View style={[gd.field, gd.fieldBorder]}>
            <Text style={gd.fieldLabel}>Skill Level Focus</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={gd.skillRow}>
              {SKILL_LEVELS.map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[gd.skillChip, skill === s && gd.skillChipActive]}
                  onPress={() => setSkill(s)}
                >
                  <Text style={[gd.skillText, skill === s && gd.skillTextActive]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View style={[gd.field, gd.fieldBorder]}>
            <Text style={gd.fieldLabel}>Location</Text>
            <TextInput
              style={gd.input}
              placeholder="e.g. Lakewood Ranch, FL"
              placeholderTextColor={L.textSub}
              value={location}
              onChangeText={setLocation}
            />
          </View>
        </CardSection>

        {/* ── Group Privacy ── */}
        <CardSection title="GROUP PRIVACY">
          {PRIVACY_OPTIONS.map((opt, i) => (
            <TouchableOpacity
              key={opt.value}
              style={[
                prv.row,
                i > 0 && prv.rowBorder,
                privacy === opt.value && prv.rowActive,
              ]}
              onPress={() => setPrivacy(opt.value)}
              activeOpacity={0.8}
            >
              <View style={[prv.iconCircle, privacy === opt.value && prv.iconCircleActive]}>
                <Ionicons
                  name={opt.icon}
                  size={18}
                  color={privacy === opt.value ? L.gold : L.textSub}
                />
              </View>
              <View style={prv.body}>
                <Text style={[prv.label, privacy === opt.value && prv.labelActive]}>{opt.label}</Text>
                <Text style={prv.desc}>{opt.desc}</Text>
              </View>
              <View style={[prv.radio, privacy === opt.value && prv.radioActive]}>
                {privacy === opt.value && <View style={prv.radioDot} />}
              </View>
            </TouchableOpacity>
          ))}
        </CardSection>

        {/* ── Settings ── */}
        <CardSection title="SETTINGS">
          <View style={st.row}>
            <View style={st.body}>
              <Text style={st.label}>Allow Member Invites</Text>
              <Text style={st.sub}>Members can invite others to join</Text>
            </View>
            <Switch
              value={allowInvites}
              onValueChange={setAllowInvites}
              trackColor={{ false: L.border, true: L.gold }}
              thumbColor="#FFFFFF"
            />
          </View>
          <View style={[st.row, st.rowBorder]}>
            <View style={st.body}>
              <Text style={st.label}>Allow Member Posts</Text>
              <Text style={st.sub}>Members can post to the group feed</Text>
            </View>
            <Switch
              value={allowPosts}
              onValueChange={setAllowPosts}
              trackColor={{ false: L.border, true: L.gold }}
              thumbColor="#FFFFFF"
            />
          </View>
        </CardSection>
      </ScrollView>

      {/* ── Sticky CTA ── */}
      <View style={[s.cta, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity style={s.ctaBtn} onPress={handleCreate} activeOpacity={0.85} disabled={saving}>
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.ctaBtnText}>Create Group</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.screenH, paddingVertical: 12,
    backgroundColor: L.bg, borderBottomWidth: 1, borderBottomColor: L.border,
  },
  backBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { color: L.navy, fontSize: 17, fontWeight: '900' },
  headerSub: { color: L.textSub, fontSize: 12 },
  scroll: { padding: spacing.screenH, paddingTop: 20 },
  cta: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: L.bg, borderTopWidth: 1, borderTopColor: L.border,
    paddingHorizontal: spacing.screenH, paddingTop: 14,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: -3 },
    elevation: 8,
  },
  ctaBtn: {
    backgroundColor: L.gold, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
  },
  ctaBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});

const ph = StyleSheet.create({
  uploadTile: {
    minHeight: 140, borderRadius: 12,
    borderWidth: 2, borderColor: L.border, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 4,
    backgroundColor: L.page, margin: 14, overflow: 'hidden',
  },
  preview: { width: '100%', height: 140 },
  uploadText: { color: L.navy, fontSize: 13, fontWeight: '700' },
  uploadSub: { color: L.textSub, fontSize: 11, textAlign: 'center' },
  label: { color: L.textSub, fontSize: 11, paddingHorizontal: 14, paddingBottom: 10 },
});

const gd = StyleSheet.create({
  field: { paddingHorizontal: 16, paddingVertical: 12 },
  fieldBorder: { borderTopWidth: 1, borderTopColor: L.border },
  fieldLabel: { color: L.textSub, fontSize: 12, fontWeight: '600', marginBottom: 6 },
  input: { color: L.text, fontSize: 15, padding: 0 },
  textArea: { minHeight: 72, lineHeight: 22 },
  charCount: { color: L.textSub, fontSize: 11, textAlign: 'right', marginTop: 4 },
  skillRow: { gap: 8, paddingVertical: 4 },
  skillChip: {
    borderRadius: 20, borderWidth: 1.5, borderColor: L.border,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  skillChipActive: { backgroundColor: L.navy, borderColor: L.navy },
  skillText: { color: L.textSub, fontSize: 13, fontWeight: '600' },
  skillTextActive: { color: '#FFFFFF' },
});

const prv = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: L.border },
  rowActive: { backgroundColor: L.goldLight },
  iconCircle: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: L.page, alignItems: 'center', justifyContent: 'center',
  },
  iconCircleActive: { backgroundColor: colors.goldBg },
  body: { flex: 1 },
  label: { color: L.navy, fontSize: 14, fontWeight: '700', marginBottom: 2 },
  labelActive: { color: L.navy },
  desc: { color: L.textSub, fontSize: 12, lineHeight: 17 },
  radio: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: L.border,
    alignItems: 'center', justifyContent: 'center',
  },
  radioActive: { borderColor: L.gold },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: L.gold },
});

const st = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: L.border },
  body: { flex: 1 },
  label: { color: L.navy, fontSize: 14, fontWeight: '700', marginBottom: 2 },
  sub: { color: L.textSub, fontSize: 12 },
});
