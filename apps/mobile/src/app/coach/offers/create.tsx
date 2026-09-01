import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Image,
  ActivityIndicator, Alert, Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { colors, radius } from '@/theme';
import { useSession } from '@/hooks/useSession';
import { FacilityPicker, type FacilityPickerValue } from '@/components/FacilityPicker';
import { draftCoachOfferId, uploadCoachOfferPhoto, cleanupAbandonedCoachOfferPhotos } from '@/lib/coach/offerPhotos';
import { createCoachOffer, type CoachOfferType } from '@/lib/coach/offers';
import { OFFER_TYPE_OPTIONS, discountPercent, MAX_OFFER_PHOTOS } from '@/lib/coach/constants';
import { coachOfferErrorMessage } from '@/lib/coach/offerErrors';

// Coach Marketplace V1 Phase 2 — offer creation. One screen, not a stepper —
// the field count is smaller than the paddle marketplace's 9-step flow, so a
// single scroll form keeps this "extremely simple" (spec §5) without extra
// router/back-button plumbing.

const L = {
  navy: colors.navy, gold: colors.gold, text: colors.text, textSub: colors.textSub,
  border: colors.border, bg: colors.bg, page: colors.page, danger: colors.danger,
};

export default function CreateCoachOfferScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();

  const [offerId] = useState(draftCoachOfferId);
  const [offerType, setOfferType] = useState<CoachOfferType>('private');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [skillLevel, setSkillLevel] = useState('');
  const [duration, setDuration] = useState('');
  const [maxParticipants, setMaxParticipants] = useState('');
  const [lessonsIncluded, setLessonsIncluded] = useState('');
  const [regularPrice, setRegularPrice] = useState('');
  const [discountedPrice, setDiscountedPrice] = useState('');
  const [quantityAvailable, setQuantityAvailable] = useState('');
  const [purchaseLimit, setPurchaseLimit] = useState('');
  const [facility, setFacility] = useState<FacilityPickerValue | null>(null);
  const [terms, setTerms] = useState('');
  const [premiumOnly, setPremiumOnly] = useState(false);
  const [premiumPrice, setPremiumPrice] = useState('');
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const savedRef = useRef(false);
  const photoUrlsRef = useRef(photoUrls);
  photoUrlsRef.current = photoUrls;

  React.useEffect(() => () => {
    if (!savedRef.current && photoUrlsRef.current.length && user?.id) {
      void cleanupAbandonedCoachOfferPhotos(photoUrlsRef.current, user.id);
    }
  }, [user?.id]);

  const regularCents = Math.round((parseFloat(regularPrice) || 0) * 100);
  const discountedCents = Math.round((parseFloat(discountedPrice) || 0) * 100);
  const pct = regularCents > 0 ? discountPercent(regularCents, discountedCents) : 0;

  const isPackage = offerType === 'package';
  const canSave = title.trim().length > 0 && regularCents > 0 && discountedCents > 0 && discountedCents <= regularCents
    && (!isPackage || parseInt(lessonsIncluded, 10) > 0);

  async function pickPhotos() {
    const remaining = MAX_OFFER_PHOTOS - photoUrls.length;
    if (remaining <= 0) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.9,
    });
    if (result.canceled || !result.assets.length) return;

    setUploading(true);
    try {
      for (const asset of result.assets) {
        const url = await uploadCoachOfferPhoto(asset.uri, offerId);
        setPhotoUrls((p) => [...p, url]);
      }
    } catch (err) {
      Alert.alert('Upload Failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setUploading(false);
    }
  }

  function removePhoto(url: string) {
    setPhotoUrls((p) => p.filter((u) => u !== url));
    if (user) void cleanupAbandonedCoachOfferPhotos([url], user.id);
  }

  async function handleSave(publish: boolean) {
    if (!user || !canSave) return;
    setSaving(true);
    try {
      await createCoachOffer({
        id: offerId,
        coachId: user.id,
        offerType,
        title: title.trim(),
        description: description.trim() || null,
        skillLevelLabel: skillLevel.trim() || null,
        durationMinutes: duration ? parseInt(duration, 10) : null,
        maxParticipants: maxParticipants ? parseInt(maxParticipants, 10) : null,
        lessonsIncluded: isPackage && lessonsIncluded ? parseInt(lessonsIncluded, 10) : null,
        regularPriceCents: regularCents,
        discountedPriceCents: discountedCents,
        quantityAvailable: quantityAvailable ? parseInt(quantityAvailable, 10) : null,
        purchaseLimitPerCustomer: purchaseLimit ? parseInt(purchaseLimit, 10) : null,
        facilityId: facility?.mode === 'facility' ? facility.facilityId : null,
        premiumOnly,
        premiumPriceCents: premiumOnly && premiumPrice ? Math.round(parseFloat(premiumPrice) * 100) : null,
        terms: terms.trim() || null,
        photoUrls,
        status: publish ? 'active' : 'draft',
      });
      savedRef.current = true;
      router.replace('/coach/offers' as never);
    } catch (err) {
      Alert.alert(
        publish ? 'Could Not Publish' : 'Could Not Save',
        coachOfferErrorMessage(err),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={L.navy} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>New Offer</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>
        <Text style={s.sectionLabel}>Offer Type</Text>
        <View style={s.typeRow}>
          {OFFER_TYPE_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[s.typeChip, offerType === opt.value && s.typeChipActive]}
              onPress={() => setOfferType(opt.value)}
            >
              <Text style={[s.typeChipText, offerType === opt.value && s.typeChipTextActive]}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.sectionLabel}>Photos</Text>
        <View style={s.photoRow}>
          {photoUrls.map((url) => (
            <View key={url} style={s.photoWrap}>
              <Image source={{ uri: url }} style={s.photo} />
              <TouchableOpacity style={s.photoRemove} onPress={() => removePhoto(url)}>
                <Ionicons name="close" size={14} color={L.bg} />
              </TouchableOpacity>
            </View>
          ))}
          {photoUrls.length < MAX_OFFER_PHOTOS && (
            <TouchableOpacity style={s.photoAdd} onPress={pickPhotos} disabled={uploading}>
              {uploading ? <ActivityIndicator size="small" color={L.gold} /> : <Ionicons name="add" size={24} color={L.gold} />}
            </TouchableOpacity>
          )}
        </View>

        <Text style={s.sectionLabel}>Title</Text>
        <TextInput style={s.input} value={title} onChangeText={setTitle} placeholder="Third Shot Drop Clinic" placeholderTextColor={L.textSub} />

        <Text style={s.sectionLabel}>Description</Text>
        <TextInput
          style={[s.input, s.textArea]} value={description} onChangeText={setDescription}
          placeholder="What players will learn and who it's for" placeholderTextColor={L.textSub}
          multiline
        />

        <Text style={s.sectionLabel}>Skill Level</Text>
        <TextInput style={s.input} value={skillLevel} onChangeText={setSkillLevel} placeholder="3.0-3.5" placeholderTextColor={L.textSub} />

        <View style={s.row2}>
          <View style={s.col}>
            <Text style={s.sectionLabel}>Duration (min)</Text>
            <TextInput style={s.input} value={duration} onChangeText={setDuration} keyboardType="number-pad" placeholder="90" placeholderTextColor={L.textSub} />
          </View>
          <View style={s.col}>
            <Text style={s.sectionLabel}>Max Participants</Text>
            <TextInput style={s.input} value={maxParticipants} onChangeText={setMaxParticipants} keyboardType="number-pad" placeholder="6" placeholderTextColor={L.textSub} />
          </View>
        </View>

        {isPackage && (
          <>
            <Text style={s.sectionLabel}>Lessons Included</Text>
            <TextInput style={s.input} value={lessonsIncluded} onChangeText={setLessonsIncluded} keyboardType="number-pad" placeholder="5" placeholderTextColor={L.textSub} />
          </>
        )}

        <View style={s.row2}>
          <View style={s.col}>
            <Text style={s.sectionLabel}>Regular Price ($)</Text>
            <TextInput style={s.input} value={regularPrice} onChangeText={setRegularPrice} keyboardType="decimal-pad" placeholder="80" placeholderTextColor={L.textSub} />
          </View>
          <View style={s.col}>
            <Text style={s.sectionLabel}>Sell For ($)</Text>
            <TextInput style={s.input} value={discountedPrice} onChangeText={setDiscountedPrice} keyboardType="decimal-pad" placeholder="52" placeholderTextColor={L.textSub} />
          </View>
        </View>
        {regularCents > 0 && discountedCents > 0 && (
          <Text style={s.discountHint}>
            {pct}% off — the platform minimum discount is enforced when you publish.
          </Text>
        )}

        <View style={s.row2}>
          <View style={s.col}>
            <Text style={s.sectionLabel}>Quantity Available</Text>
            <TextInput style={s.input} value={quantityAvailable} onChangeText={setQuantityAvailable} keyboardType="number-pad" placeholder="Unlimited" placeholderTextColor={L.textSub} />
          </View>
          <View style={s.col}>
            <Text style={s.sectionLabel}>Limit Per Customer</Text>
            <TextInput style={s.input} value={purchaseLimit} onChangeText={setPurchaseLimit} keyboardType="number-pad" placeholder="No limit" placeholderTextColor={L.textSub} />
          </View>
        </View>

        <Text style={s.sectionLabel}>Location (optional)</Text>
        <FacilityPicker value={facility} onChange={setFacility} />
        <Text style={s.hint}>Location metadata only — you're responsible for arranging any court needed.</Text>

        <Text style={s.sectionLabel}>Terms</Text>
        <TextInput
          style={[s.input, s.textArea]} value={terms} onChangeText={setTerms}
          placeholder="Cancellation policy, what to bring, etc." placeholderTextColor={L.textSub}
          multiline
        />

        <View style={s.premiumRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.sectionLabel}>Premium-Only Offer</Text>
            <Text style={s.hint}>Only Pickleball App Premium members can purchase.</Text>
          </View>
          <Switch value={premiumOnly} onValueChange={setPremiumOnly} trackColor={{ true: L.gold }} />
        </View>
        {premiumOnly && (
          <>
            <Text style={s.sectionLabel}>Premium Price ($, optional)</Text>
            <TextInput style={s.input} value={premiumPrice} onChangeText={setPremiumPrice} keyboardType="decimal-pad" placeholder="39" placeholderTextColor={L.textSub} />
          </>
        )}
      </ScrollView>

      <View style={[s.footer, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity style={[s.draftBtn, (!canSave || saving) && s.btnDisabled]} disabled={!canSave || saving} onPress={() => handleSave(false)}>
          {saving ? <ActivityIndicator size="small" color={L.navy} /> : <Text style={s.draftBtnText}>Save Draft</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={[s.publishBtn, (!canSave || saving) && s.btnDisabled]} disabled={!canSave || saving} onPress={() => handleSave(true)}>
          {saving ? <ActivityIndicator size="small" color={L.bg} /> : <Text style={s.publishBtnText}>Publish</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: L.bg,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: L.navy, fontSize: 17, fontWeight: '800' },

  scroll: { paddingHorizontal: 20, paddingTop: 16 },
  sectionLabel: { color: L.navy, fontSize: 13, fontWeight: '700', marginTop: 16, marginBottom: 6 },
  hint: { color: L.textSub, fontSize: 11, marginTop: 4, lineHeight: 16 },
  discountHint: { color: colors.gold, fontSize: 12, fontWeight: '600', marginTop: 6 },

  input: {
    borderWidth: 1, borderColor: L.border, borderRadius: radius.button,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: L.text, backgroundColor: L.bg,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },

  row2: { flexDirection: 'row', gap: 12 },
  col: { flex: 1 },

  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999,
    borderWidth: 1, borderColor: L.border, backgroundColor: L.bg,
  },
  typeChipActive: { backgroundColor: L.navy, borderColor: L.navy },
  typeChipText: { color: L.text, fontSize: 13, fontWeight: '600' },
  typeChipTextActive: { color: L.bg },

  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoWrap: { width: 84, height: 84, borderRadius: radius.card, overflow: 'hidden' },
  photo: { width: '100%', height: '100%' },
  photoRemove: {
    position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
  },
  photoAdd: {
    width: 84, height: 84, borderRadius: radius.card, borderWidth: 1, borderStyle: 'dashed',
    borderColor: L.gold, alignItems: 'center', justifyContent: 'center',
  },

  premiumRow: { flexDirection: 'row', alignItems: 'center', marginTop: 20, gap: 12 },

  footer: {
    flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 12,
    backgroundColor: L.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: L.border,
  },
  draftBtn: {
    flex: 1, borderRadius: radius.button, borderWidth: 1, borderColor: L.navy,
    paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
  },
  draftBtnText: { color: L.navy, fontSize: 14, fontWeight: '800' },
  publishBtn: {
    flex: 1, borderRadius: radius.button, backgroundColor: L.navy,
    paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
  },
  publishBtnText: { color: L.bg, fontSize: 14, fontWeight: '800' },
  btnDisabled: { opacity: 0.5 },
});
