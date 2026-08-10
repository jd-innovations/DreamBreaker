// Edit Listing — a single-screen form (not the create flow's stepper) since
// every field already has a value to correct rather than being chosen fresh.
// Photos and location aren't editable here yet (updateListing() only covers
// brand/model/condition/pricing/description) — flagged, not silently dropped.
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import {
  MARKETPLACE_BRANDS, CONDITION_OPTIONS, DESCRIPTION_MAX_LENGTH,
  generateListingTitle, normalizeModelName, type MarketplaceCondition,
} from '@/lib/marketplace/constants';
import { fetchListingDetail, updateListing } from '@/lib/marketplace/listingService';

const L = {
  navy: '#0A1228', gold: '#C9A84C', text: '#0A1228', textMuted: '#9AAABF',
  border: '#E0E8F5', danger: '#EF4444', bg: '#FFFFFF',
};

export default function EditListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [brand, setBrand] = useState<string | null>(null);
  const [model, setModel] = useState('');
  const [condition, setCondition] = useState<MarketplaceCondition | null>(null);
  const [askingPrice, setAskingPrice] = useState('');
  const [minOffer, setMinOffer] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!id) return;
    fetchListingDetail(id).then((listing) => {
      if (!listing) {
        Alert.alert('Listing not found');
        router.back();
        return;
      }
      setBrand(listing.brand);
      setModel(listing.model);
      setCondition(listing.condition);
      setAskingPrice(String(listing.asking_price_cents / 100));
      setMinOffer(String(listing.min_offer_cents / 100));
      setDescription(listing.description ?? '');
    }).catch((err) => {
      console.error('[EditListing] load failed:', err);
      Alert.alert('Could not load listing', err instanceof Error ? err.message : 'Please try again.');
      router.back();
    }).finally(() => setLoading(false));
  }, [id]);

  const asking = parseFloat(askingPrice);
  const min = parseFloat(minOffer);
  const priceInvalid = !askingPrice || !minOffer || !(asking > 0) || !(min > 0) || min > asking;
  const canSave = !!brand && normalizeModelName(model).length > 0 && !!condition && !priceInvalid;
  const title = brand && model ? generateListingTitle(brand, model) : '';

  async function handleSave() {
    if (!id || !canSave) return;
    setSaving(true);
    try {
      await updateListing(id, {
        brand: brand!,
        model,
        condition: condition!,
        askingPriceCents: Math.round(asking * 100),
        minOfferCents: Math.round(min * 100),
        description: description.trim() || null,
      });
      router.back();
    } catch (err) {
      Alert.alert('Could not save changes', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <View style={s.centerFill}><ActivityIndicator color={L.navy} /></View>;
  }

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={22} color={L.navy} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Edit Listing</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <Text style={s.fieldLabel}>Brand</Text>
        <View style={s.chipWrap}>
          {MARKETPLACE_BRANDS.map((b) => (
            <TouchableOpacity key={b} style={[s.pickChip, brand === b && s.pickChipActive]} onPress={() => setBrand(b)}>
              <Text style={[s.pickChipText, brand === b && s.pickChipTextActive]}>{b}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[s.fieldLabel, { marginTop: 20 }]}>Model</Text>
        <TextInput style={s.textInput} value={model} onChangeText={setModel} autoCapitalize="none" />
        {!!title && <Text style={s.titlePreview}>{title}</Text>}

        <Text style={[s.fieldLabel, { marginTop: 20 }]}>Condition</Text>
        {CONDITION_OPTIONS.map((c) => (
          <TouchableOpacity
            key={c.value}
            style={[s.optionRow, condition === c.value && s.optionRowActive]}
            onPress={() => setCondition(c.value)}
          >
            <Text style={[s.optionRowText, condition === c.value && s.optionRowTextActive]}>{c.label}</Text>
            {condition === c.value && <Ionicons name="checkmark-circle" size={20} color={L.navy} />}
          </TouchableOpacity>
        ))}

        <Text style={[s.fieldLabel, { marginTop: 20 }]}>Asking Price</Text>
        <View style={s.amountRow}>
          <Text style={s.amountPrefix}>$</Text>
          <TextInput
            style={s.amountInput} value={askingPrice} keyboardType="decimal-pad"
            onChangeText={(v) => setAskingPrice(v.replace(/[^0-9.]/g, ''))}
          />
        </View>

        <Text style={[s.fieldLabel, { marginTop: 20 }]}>Minimum Accepted Offer</Text>
        <Text style={s.stepHint}>Hidden from buyers.</Text>
        <View style={s.amountRow}>
          <Text style={s.amountPrefix}>$</Text>
          <TextInput
            style={s.amountInput} value={minOffer} keyboardType="decimal-pad"
            onChangeText={(v) => setMinOffer(v.replace(/[^0-9.]/g, ''))}
          />
        </View>
        {priceInvalid && !!askingPrice && !!minOffer && (
          <Text style={s.errorText}>Minimum offer must be greater than $0 and no more than the asking price.</Text>
        )}

        <Text style={[s.fieldLabel, { marginTop: 20 }]}>Description</Text>
        <TextInput
          style={s.descInput}
          multiline
          maxLength={DESCRIPTION_MAX_LENGTH}
          value={description}
          onChangeText={setDescription}
        />
        <Text style={s.charCount}>{description.length}/{DESCRIPTION_MAX_LENGTH}</Text>
      </ScrollView>

      <View style={[s.footer, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity style={[s.saveBtn, !canSave && s.saveBtnDisabled]} disabled={!canSave || saving} onPress={handleSave}>
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.saveBtnText}>Save Changes</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.bg },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: L.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 12 },
  headerTitle: { color: L.navy, fontSize: 17, fontWeight: '800' },
  body: { paddingHorizontal: 20, paddingBottom: 40 },
  footer: { paddingHorizontal: 20, paddingTop: 8, borderTopWidth: 1, borderTopColor: L.border },

  fieldLabel: { color: L.text, fontSize: 13, fontWeight: '700', marginBottom: 8 },
  stepHint: { color: L.textMuted, fontSize: 12, marginBottom: 8 },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pickChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1.5, borderColor: L.border },
  pickChipActive: { backgroundColor: L.navy, borderColor: L.navy },
  pickChipText: { color: L.text, fontSize: 14, fontWeight: '600' },
  pickChipTextActive: { color: '#FFFFFF' },

  textInput: { borderWidth: 1.5, borderColor: L.border, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: L.text },
  titlePreview: { color: L.navy, fontSize: 13, fontWeight: '700', marginTop: 8 },

  optionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1.5, borderColor: L.border, marginBottom: 8 },
  optionRowActive: { borderColor: L.navy, backgroundColor: '#F0F4FF' },
  optionRowText: { color: L.text, fontSize: 15, fontWeight: '600' },
  optionRowTextActive: { color: L.navy, fontWeight: '800' },

  amountRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: L.border, borderRadius: 14, paddingHorizontal: 16 },
  amountPrefix: { color: L.text, fontSize: 22, fontWeight: '800', marginRight: 4 },
  amountInput: { flex: 1, fontSize: 22, fontWeight: '800', color: L.text, paddingVertical: 12 },
  errorText: { color: L.danger, fontSize: 12, marginTop: 8 },

  descInput: { borderWidth: 1.5, borderColor: L.border, borderRadius: 14, padding: 16, fontSize: 15, color: L.text, minHeight: 100, textAlignVertical: 'top' },
  charCount: { color: L.textMuted, fontSize: 11, textAlign: 'right', marginTop: 4 },

  saveBtn: { backgroundColor: L.navy, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});
