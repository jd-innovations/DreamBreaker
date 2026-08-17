// Create Listing — one screen, one draft object, a step index. The spec lists
// 9 steps (Photos → Brand → Model → Condition → Pricing → Description →
// Location → Preview → Publish) as a single ~1-minute flow, not 9 separate
// destinations to navigate between, so this keeps them as one stepper rather
// than 9 route files — same UX, far less router/back-button plumbing.
import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Image,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useSession } from '@/hooks/useSession';
import { useProfile } from '@/hooks/useProfile';
import {
  MARKETPLACE_BRANDS, CONDITION_OPTIONS, DESCRIPTION_MAX_LENGTH, DESCRIPTION_PROMPTS,
  MIN_LISTING_PHOTOS, MAX_LISTING_PHOTOS, generateListingTitle, normalizeModelName,
  formatPriceCents, type MarketplaceCondition,
} from '@/lib/marketplace/constants';
import { draftListingId, uploadListingPhoto, cleanupAbandonedPhotos } from '@/lib/marketplace/photos';
import { canCreateListing, publishListing } from '@/lib/marketplace/listingService';
import { improveListing } from '@/lib/marketplace/improveListing';
import { isFeatureEnabled } from '@/lib/featureFlags';

const L = {
  navy: '#0A1228', gold: '#C9A84C', text: '#0A1228', textMuted: '#9AAABF',
  border: '#E0E8F5', green: '#16A34A', danger: '#EF4444', bg: '#FFFFFF',
};

const STEPS = ['Photos', 'Brand', 'Model', 'Condition', 'Pricing', 'Description', 'Location', 'Preview'] as const;

type Draft = {
  id: string;
  photoUris: string[];   // local uris queued
  photoUrls: string[];   // uploaded, in order
  brand: string | null;
  model: string;
  condition: MarketplaceCondition | null;
  askingPrice: string;
  minOffer: string;
  description: string;
  locationCity: string;
  locationState: string;
};

export default function CreateListingScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const { profile } = useProfile();

  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(() => ({
    id: draftListingId(), photoUris: [], photoUrls: [], brand: null, model: '',
    condition: null, askingPrice: '', minOffer: '', description: '',
    locationCity: '', locationState: '',
  }));
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [limitBlocked, setLimitBlocked] = useState<{ activeCount: number; limit: number } | null>(null);

  useEffect(() => {
    setDraft((d) => ({
      ...d,
      locationCity: d.locationCity || profile?.location_city || '',
      locationState: d.locationState || profile?.location_state || '',
    }));
  }, [profile?.location_city, profile?.location_state]);

  useEffect(() => {
    if (!user) return;
    canCreateListing(user.id).then((res) => {
      if (!res.allowed) setLimitBlocked({ activeCount: res.activeCount, limit: res.limit });
    }).catch((err) => console.error('[CreateListing] limit check failed:', err));
  }, [user]);

  // Best-effort cleanup of any uploaded-but-unpublished photos if the user
  // backs out of the flow — mirrors the ImagePipeline's own rollback philosophy.
  // Uses a ref (not draft.photoUrls in the effect's deps) so the unmount
  // cleanup sees the latest URLs rather than the empty array from first render.
  const photoUrlsRef = useRef(draft.photoUrls);
  photoUrlsRef.current = draft.photoUrls;
  const userIdRef = useRef(user?.id);
  userIdRef.current = user?.id;
  const publishedRef = useRef(false);

  useEffect(() => () => {
    const urls = photoUrlsRef.current;
    const ownerId = userIdRef.current;
    if (!publishedRef.current && urls.length && ownerId) {
      void cleanupAbandonedPhotos(urls, ownerId);
    }
  }, []);

  const title = useMemo(
    () => (draft.brand && draft.model ? generateListingTitle(draft.brand, draft.model) : ''),
    [draft.brand, draft.model],
  );

  const canGoNext = (() => {
    switch (STEPS[step]) {
      case 'Photos':      return draft.photoUrls.length >= MIN_LISTING_PHOTOS;
      case 'Brand':        return !!draft.brand;
      case 'Model':         return normalizeModelName(draft.model).length > 0;
      case 'Condition':    return !!draft.condition;
      case 'Pricing': {
        const asking = parseFloat(draft.askingPrice);
        const min = parseFloat(draft.minOffer);
        return asking > 0 && min > 0 && min <= asking;
      }
      case 'Description': return true;
      case 'Location':      return draft.locationCity.trim().length > 0;
      default:              return true;
    }
  })();

  async function pickPhotos() {
    const remaining = MAX_LISTING_PHOTOS - draft.photoUrls.length;
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
        const url = await uploadListingPhoto(asset.uri, draft.id);
        setDraft((d) => ({ ...d, photoUrls: [...d.photoUrls, url] }));
      }
    } catch (err) {
      Alert.alert('Upload failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setUploading(false);
    }
  }

  function removePhoto(url: string) {
    setDraft((d) => ({ ...d, photoUrls: d.photoUrls.filter((u) => u !== url) }));
    if (user) void cleanupAbandonedPhotos([url], user.id);
  }

  async function handlePublish() {
    if (!user) return;
    setPublishing(true);
    try {
      await publishListing({
        id: draft.id,
        sellerId: user.id,
        brand: draft.brand!,
        model: draft.model,
        condition: draft.condition!,
        askingPriceCents: Math.round(parseFloat(draft.askingPrice) * 100),
        minOfferCents: Math.round(parseFloat(draft.minOffer) * 100),
        description: draft.description.trim() || null,
        locationCity: draft.locationCity.trim() || null,
        locationState: draft.locationState.trim() || null,
        locationLat: profile?.location_lat ?? null,
        locationLng: profile?.location_lng ?? null,
        photoUrls: draft.photoUrls,
      });
      // Photos are now owned by the published row — flip the ref synchronously
      // (not state, which wouldn't reliably re-render before unmount) so the
      // cleanup effect above doesn't delete them.
      publishedRef.current = true;
      router.replace(`/marketplace/${draft.id}` as never);
    } catch (err) {
      Alert.alert('Could not publish listing', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setPublishing(false);
    }
  }

  if (limitBlocked) {
    return (
      <View style={[s.root, s.centerFill, { paddingTop: insets.top }]}>
        <Ionicons name="pricetag-outline" size={32} color={L.textMuted} />
        <Text style={s.limitTitle}>Listing limit reached</Text>
        <Text style={s.limitBody}>
          You have {limitBlocked.activeCount} active listing{limitBlocked.activeCount === 1 ? '' : 's'} —
          the limit for your account is {limitBlocked.limit}. Mark one Sold or delete it to list another paddle.
        </Text>
        <TouchableOpacity style={s.primaryBtn} onPress={() => router.back()}>
          <Text style={s.primaryBtnText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => (step === 0 ? router.back() : setStep((n) => n - 1))}>
          <Ionicons name={step === 0 ? 'close' : 'arrow-back'} size={22} color={L.navy} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{STEPS[step]}</Text>
        <Text style={s.stepCount}>{step + 1}/{STEPS.length}</Text>
      </View>
      <View style={s.progressRow}>
        {STEPS.map((_, i) => <View key={i} style={[s.progressSeg, i <= step && s.progressActive]} />)}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        {STEPS[step] === 'Photos' && (
          <PhotosStep draft={draft} uploading={uploading} onPick={pickPhotos} onRemove={removePhoto} />
        )}
        {STEPS[step] === 'Brand' && (
          <BrandStep value={draft.brand} onChange={(brand) => setDraft((d) => ({ ...d, brand }))} />
        )}
        {STEPS[step] === 'Model' && (
          <ModelStep value={draft.model} onChange={(model) => setDraft((d) => ({ ...d, model }))} title={title} />
        )}
        {STEPS[step] === 'Condition' && (
          <ConditionStep value={draft.condition} onChange={(condition) => setDraft((d) => ({ ...d, condition }))} />
        )}
        {STEPS[step] === 'Pricing' && (
          <PricingStep
            askingPrice={draft.askingPrice} minOffer={draft.minOffer}
            onAskingChange={(v) => setDraft((d) => ({ ...d, askingPrice: v }))}
            onMinChange={(v) => setDraft((d) => ({ ...d, minOffer: v }))}
          />
        )}
        {STEPS[step] === 'Description' && (
          <DescriptionStep
            draft={draft}
            onChange={(description) => setDraft((d) => ({ ...d, description }))}
          />
        )}
        {STEPS[step] === 'Location' && (
          <LocationStep
            city={draft.locationCity} state={draft.locationState}
            onCityChange={(v) => setDraft((d) => ({ ...d, locationCity: v }))}
            onStateChange={(v) => setDraft((d) => ({ ...d, locationState: v }))}
          />
        )}
        {STEPS[step] === 'Preview' && <PreviewStep draft={draft} title={title} />}
      </ScrollView>

      <View style={[s.footer, { paddingBottom: insets.bottom + 12 }]}>
        {STEPS[step] === 'Preview' ? (
          <TouchableOpacity style={s.primaryBtn} onPress={handlePublish} disabled={publishing}>
            {publishing ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.primaryBtnText}>Publish</Text>}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[s.primaryBtn, !canGoNext && s.primaryBtnDisabled]}
            disabled={!canGoNext}
            onPress={() => setStep((n) => n + 1)}
          >
            <Text style={s.primaryBtnText}>Continue</Text>
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Steps ─────────────────────────────────────────────────────────────────────

function PhotosStep({ draft, uploading, onPick, onRemove }: {
  draft: Draft; uploading: boolean; onPick: () => void; onRemove: (url: string) => void;
}) {
  return (
    <View>
      <Text style={s.stepHint}>Add {MIN_LISTING_PHOTOS}–{MAX_LISTING_PHOTOS} photos. First photo is the cover image.</Text>
      <View style={s.photoGrid}>
        {draft.photoUrls.map((url) => (
          <View key={url} style={s.photoTile}>
            <Image source={{ uri: url }} style={s.photoImg} />
            <TouchableOpacity style={s.photoRemove} onPress={() => onRemove(url)}>
              <Ionicons name="close-circle" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        ))}
        {draft.photoUrls.length < MAX_LISTING_PHOTOS && (
          <TouchableOpacity style={s.photoAdd} onPress={onPick} disabled={uploading}>
            {uploading ? <ActivityIndicator color={L.navy} /> : (
              <>
                <Ionicons name="camera-outline" size={24} color={L.navy} />
                <Text style={s.photoAddText}>Add</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function BrandStep({ value, onChange }: { value: string | null; onChange: (b: string) => void }) {
  return (
    <View style={s.chipWrap}>
      {MARKETPLACE_BRANDS.map((b) => (
        <TouchableOpacity key={b} style={[s.pickChip, value === b && s.pickChipActive]} onPress={() => onChange(b)}>
          <Text style={[s.pickChipText, value === b && s.pickChipTextActive]}>{b}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function ModelStep({ value, onChange, title }: { value: string; onChange: (m: string) => void; title: string }) {
  return (
    <View>
      <Text style={s.stepHint}>Enter the paddle model. We'll clean up the formatting automatically.</Text>
      <TextInput
        style={s.textInput}
        placeholder="e.g. perseus 3s 16mm"
        placeholderTextColor={L.textMuted}
        value={value}
        onChangeText={onChange}
        autoCapitalize="none"
      />
      {!!title && (
        <View style={s.titlePreview}>
          <Text style={s.titlePreviewLabel}>Listing title</Text>
          <Text style={s.titlePreviewValue}>{title}</Text>
        </View>
      )}
    </View>
  );
}

function ConditionStep({ value, onChange }: { value: MarketplaceCondition | null; onChange: (c: MarketplaceCondition) => void }) {
  return (
    <View>
      {CONDITION_OPTIONS.map((c) => (
        <TouchableOpacity
          key={c.value}
          style={[s.optionRow, value === c.value && s.optionRowActive]}
          onPress={() => onChange(c.value)}
        >
          <Text style={[s.optionRowText, value === c.value && s.optionRowTextActive]}>{c.label}</Text>
          {value === c.value && <Ionicons name="checkmark-circle" size={20} color={L.navy} />}
        </TouchableOpacity>
      ))}
    </View>
  );
}

function PricingStep({ askingPrice, minOffer, onAskingChange, onMinChange }: {
  askingPrice: string; minOffer: string; onAskingChange: (v: string) => void; onMinChange: (v: string) => void;
}) {
  const asking = parseFloat(askingPrice);
  const min = parseFloat(minOffer);
  const invalid = !!minOffer && !!askingPrice && (min > asking || min <= 0);
  return (
    <View>
      <Text style={s.fieldLabel}>Asking Price</Text>
      <View style={s.amountRow}>
        <Text style={s.amountPrefix}>$</Text>
        <TextInput
          style={s.amountInput}
          value={askingPrice}
          onChangeText={(v) => onAskingChange(v.replace(/[^0-9.]/g, ''))}
          keyboardType="decimal-pad"
          placeholder="0"
        />
      </View>
      <Text style={[s.fieldLabel, { marginTop: 20 }]}>Minimum Accepted Offer</Text>
      <Text style={s.stepHint}>Hidden from buyers.</Text>
      <View style={s.amountRow}>
        <Text style={s.amountPrefix}>$</Text>
        <TextInput
          style={s.amountInput}
          value={minOffer}
          onChangeText={(v) => onMinChange(v.replace(/[^0-9.]/g, ''))}
          keyboardType="decimal-pad"
          placeholder="0"
        />
      </View>
      {invalid && <Text style={s.errorText}>Minimum offer must be greater than $0 and no more than the asking price.</Text>}
    </View>
  );
}

function DescriptionStep({ draft, onChange }: { draft: Draft; onChange: (v: string) => void }) {
  const [improving, setImproving] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);

  async function handleImprove() {
    if (!draft.brand || !draft.condition) return;
    setImproving(true);
    try {
      const result = await improveListing({
        brand: draft.brand, model: draft.model, condition: draft.condition, description: draft.description,
      });
      if (result.available) {
        onChange(result.description);
        setWarnings(result.warnings);
      } else {
        Alert.alert('Improve Listing unavailable', 'Please try again later.');
      }
    } catch {
      Alert.alert('Improve Listing unavailable', 'Please try again later.');
    } finally {
      setImproving(false);
    }
  }

  return (
    <View>
      <TextInput
        style={s.descInput}
        multiline
        maxLength={DESCRIPTION_MAX_LENGTH}
        placeholder="Describe your paddle..."
        placeholderTextColor={L.textMuted}
        value={draft.description}
        onChangeText={onChange}
      />
      <Text style={s.charCount}>{draft.description.length}/{DESCRIPTION_MAX_LENGTH}</Text>

      {/* AI listing rewrite depends on an Anthropic key whose production
          provisioning is unverified — out of beta scope (BETA_SCOPE.md), so
          the button is hidden rather than left to fail at tap time. */}
      {isFeatureEnabled('marketplaceAiAssist') && (
        <TouchableOpacity style={s.improveBtn} onPress={handleImprove} disabled={improving}>
          {improving ? <ActivityIndicator color={L.navy} /> : (
            <Text style={s.improveBtnText}>✨ Improve Listing</Text>
          )}
        </TouchableOpacity>
      )}

      {warnings.map((w, i) => (
        <View key={i} style={s.warningRow}>
          <Ionicons name="warning-outline" size={16} color={L.danger} />
          <Text style={s.warningText}>{w}</Text>
        </View>
      ))}

      <Text style={[s.fieldLabel, { marginTop: 20 }]}>Not sure what to say?</Text>
      {DESCRIPTION_PROMPTS.map((p) => <Text key={p} style={s.promptText}>· {p}</Text>)}
    </View>
  );
}

function LocationStep({ city, state, onCityChange, onStateChange }: {
  city: string; state: string; onCityChange: (v: string) => void; onStateChange: (v: string) => void;
}) {
  return (
    <View>
      <Text style={s.stepHint}>Buyers see your approximate location only — never your exact address.</Text>
      <Text style={s.fieldLabel}>City</Text>
      <TextInput style={s.textInput} value={city} onChangeText={onCityChange} placeholder="Sarasota" placeholderTextColor={L.textMuted} />
      <Text style={[s.fieldLabel, { marginTop: 16 }]}>State</Text>
      <TextInput
        style={s.textInput} value={state}
        onChangeText={(v) => onStateChange(v.toUpperCase().slice(0, 2))}
        placeholder="FL" placeholderTextColor={L.textMuted} autoCapitalize="characters" maxLength={2}
      />
    </View>
  );
}

function PreviewStep({ draft, title }: { draft: Draft; title: string }) {
  const conditionLabel = CONDITION_OPTIONS.find((c) => c.value === draft.condition)?.label ?? '';
  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
        {draft.photoUrls.map((url) => (
          <Image key={url} source={{ uri: url }} style={s.previewPhoto} />
        ))}
      </ScrollView>
      <Text style={s.title}>{title}</Text>
      <View style={s.priceRow}>
        <Text style={s.price}>{formatPriceCents(Math.round(parseFloat(draft.askingPrice || '0') * 100))}</Text>
        <View style={s.conditionBadge}><Text style={s.conditionText}>{conditionLabel}</Text></View>
      </View>
      {!!(draft.locationCity || draft.locationState) && (
        <Text style={s.stepHint}>{[draft.locationCity, draft.locationState].filter(Boolean).join(', ')}</Text>
      )}
      {!!draft.description && <Text style={s.description}>{draft.description}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.bg },
  centerFill: { alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 12 },
  headerTitle: { color: L.navy, fontSize: 17, fontWeight: '800' },
  stepCount: { color: L.textMuted, fontSize: 12, fontWeight: '600' },
  progressRow: { flexDirection: 'row', gap: 4, paddingHorizontal: 20, marginBottom: 16 },
  progressSeg: { flex: 1, height: 3, borderRadius: 2, backgroundColor: L.border },
  progressActive: { backgroundColor: L.navy },
  body: { paddingHorizontal: 20, paddingBottom: 40 },
  footer: { paddingHorizontal: 20, paddingTop: 8, borderTopWidth: 1, borderTopColor: L.border },

  stepHint: { color: L.textMuted, fontSize: 13, marginBottom: 14, lineHeight: 18 },
  fieldLabel: { color: L.text, fontSize: 13, fontWeight: '700', marginBottom: 8 },

  primaryBtn: { backgroundColor: L.navy, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  primaryBtnDisabled: { opacity: 0.4 },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },

  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoTile: { width: 100, height: 100, borderRadius: 12, overflow: 'hidden' },
  photoImg: { width: '100%', height: '100%' },
  photoRemove: { position: 'absolute', top: 4, right: 4 },
  photoAdd: { width: 100, height: 100, borderRadius: 12, borderWidth: 1.5, borderColor: L.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 4 },
  photoAddText: { color: L.navy, fontSize: 12, fontWeight: '700' },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pickChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1.5, borderColor: L.border },
  pickChipActive: { backgroundColor: L.navy, borderColor: L.navy },
  pickChipText: { color: L.text, fontSize: 14, fontWeight: '600' },
  pickChipTextActive: { color: '#FFFFFF' },

  textInput: { borderWidth: 1.5, borderColor: L.border, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: L.text },
  titlePreview: { marginTop: 16, padding: 14, backgroundColor: '#F5F7FB', borderRadius: 12 },
  titlePreviewLabel: { color: L.textMuted, fontSize: 11, fontWeight: '700', marginBottom: 4 },
  titlePreviewValue: { color: L.navy, fontSize: 16, fontWeight: '800' },

  optionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1.5, borderColor: L.border, marginBottom: 10 },
  optionRowActive: { borderColor: L.navy, backgroundColor: '#F0F4FF' },
  optionRowText: { color: L.text, fontSize: 15, fontWeight: '600' },
  optionRowTextActive: { color: L.navy, fontWeight: '800' },

  amountRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: L.border, borderRadius: 14, paddingHorizontal: 16 },
  amountPrefix: { color: L.text, fontSize: 22, fontWeight: '800', marginRight: 4 },
  amountInput: { flex: 1, fontSize: 22, fontWeight: '800', color: L.text, paddingVertical: 14 },
  errorText: { color: L.danger, fontSize: 12, marginTop: 8 },

  descInput: { borderWidth: 1.5, borderColor: L.border, borderRadius: 14, padding: 16, fontSize: 15, color: L.text, minHeight: 100, textAlignVertical: 'top' },
  charCount: { color: L.textMuted, fontSize: 11, textAlign: 'right', marginTop: 4 },
  improveBtn: { marginTop: 14, alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1.5, borderColor: L.gold },
  improveBtnText: { color: L.navy, fontSize: 13, fontWeight: '800' },
  warningRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 12, padding: 12, backgroundColor: '#FEE2E2', borderRadius: 10 },
  warningText: { flex: 1, color: L.danger, fontSize: 12, lineHeight: 16 },
  promptText: { color: L.textMuted, fontSize: 13, marginTop: 4 },

  title: { color: L.text, fontSize: 20, fontWeight: '900', marginBottom: 8 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  price: { color: L.green, fontSize: 20, fontWeight: '900' },
  conditionBadge: { backgroundColor: '#F0F4FF', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  conditionText: { color: L.navy, fontSize: 12, fontWeight: '700' },
  description: { color: L.text, fontSize: 14, lineHeight: 20, marginTop: 12 },
  previewPhoto: { width: 220, height: 220, borderRadius: 14, marginRight: 10 },

  limitTitle: { color: L.navy, fontSize: 18, fontWeight: '800' },
  limitBody: { color: L.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
