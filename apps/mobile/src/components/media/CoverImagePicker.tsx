// The hero-image tile shared by tournament create and tournament edit.
//
// Extracted rather than copied. The picker (permissions, the action sheet, the
// 16:9 crop, the tile chrome) lived only in tournament/[id]/edit.tsx; when the
// create flow needed the same thing, duplicating it would have left two copies
// free to drift — which is exactly how the facility surfaces ended up with
// three different "no photo" fallbacks.
//
// Deliberately picker-only: it hands back a local file:// URI and nothing else.
// Uploading is the caller's job, because the two callers genuinely differ --
// edit replaces an existing object and needs previousUrl, while create has no
// tournament id to key the upload on until the row exists. Keeping the upload
// out here is what lets both use the same tile.

import React from 'react';
import { View, Text, Image, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '@/theme';
import { radius as shape, text } from '@shared/tokens';
import { eventCoverSource } from '@/lib/eventCover';

// The aspect the tournamentCover standard crops to (imageStandards.ts). Kept in
// step with it so the in-picker crop matches what actually gets stored -- a
// mismatch here means the director frames one image and a differently-cropped
// one is published.
const COVER_ASPECT: [number, number] = [16, 9];

type Props = {
  /** Local file:// URI of a pending pick, or null when nothing is staged. */
  value: string | null;
  onChange: (uri: string) => void;
  /**
   * Remote cover already saved for this entity, shown when no pick is staged.
   * Omit on create. Falls back to the bundled default when null.
   */
  existingUrl?: string | null;
  /** Badge copy — "Change" reads wrong on a tournament that has no cover yet. */
  badgeLabel?: string;
  /** Action-sheet title. */
  title?: string;
};

export function CoverImagePicker({
  value,
  onChange,
  existingUrl = null,
  badgeLabel = 'Change',
  title = 'Hero Image',
}: Props) {
  async function pickFromLibrary() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to set the hero image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: COVER_ASPECT, quality: 0.85,
    });
    if (!result.canceled) onChange(result.assets[0].uri);
  }

  async function pickFromCamera() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow camera access to take a photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true, aspect: COVER_ASPECT, quality: 0.85,
    });
    if (!result.canceled) onChange(result.assets[0].uri);
  }

  function handlePress() {
    Alert.alert(title, undefined, [
      { text: 'Take Photo', onPress: pickFromCamera },
      { text: 'Choose from Library', onPress: pickFromLibrary },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <TouchableOpacity style={ph.uploadTile} activeOpacity={0.85} onPress={handlePress}>
      <Image
        // A staged pick wins; otherwise the saved cover; otherwise the bundled
        // default. eventCoverSource returns a source object rather than a URI
        // string on purpose -- see its header for the bug that caused.
        source={value ? { uri: value } : eventCoverSource(existingUrl)}
        style={ph.preview}
        resizeMode="cover"
      />
      <View style={ph.editBadge}>
        <Ionicons name="camera" size={14} color="#FFFFFF" />
        <Text style={ph.editBadgeText}>{badgeLabel}</Text>
      </View>
    </TouchableOpacity>
  );
}

const ph = StyleSheet.create({
  uploadTile: {
    height: 160, borderRadius: shape.panel, overflow: 'hidden',
    marginBottom: 20, backgroundColor: colors.border,
  },
  preview: { width: '100%', height: '100%' },
  editBadge: {
    position: 'absolute', right: 10, bottom: 10,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: shape.pill,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  editBadgeText: { color: '#FFFFFF', fontSize: text.caption.size, fontWeight: '700' },
});
