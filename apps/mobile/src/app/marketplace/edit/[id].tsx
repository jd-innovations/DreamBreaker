// Edit Listing — a single-screen form (not the create flow's stepper) since
// every field already has a value to correct rather than being chosen fresh.
// Photos still aren't editable here (updateListing() doesn't cover them) —
// flagged, not silently dropped. Pickup court, handoff method and city/state
// ARE editable, using the same PickupCourtPicker the create flow uses.
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
import { PickupCourtPicker, type PickupFacility } from '@/components/marketplace/PickupCourtPicker';
import type { Database } from '@shared/database.types';

// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';

type Fulfillment = Database['public']['Enums']['marketplace_fulfillment'];

const FULFILLMENT_OPTIONS: { value: Fulfillment; label: string }[] = [
  { value: 'local_pickup', label: 'Local pickup' },
  { value: 'shipping',     label: 'Shipping' },
  { value: 'both',         label: 'Either' },
];

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
  const [pickupFacility, setPickupFacility] = useState<PickupFacility | null>(null);
  const [fulfillment, setFulfillment] = useState<Fulfillment>('local_pickup');
  const [locationCity, setLocationCity] = useState('');
  const [locationState, setLocationState] = useState('');

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
      setPickupFacility(listing.pickupFacility);
      setFulfillment(listing.fulfillment);
      setLocationCity(listing.location_city ?? '');
      setLocationState(listing.location_state ?? '');
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
        // null clears the court and its coordinate with it, rather than leaving
        // the listing pinned to a court it no longer names.
        pickupFacilityId: pickupFacility?.id ?? null,
        fulfillment,
        locationCity: locationCity.trim() || null,
        locationState: locationState.trim() || null,
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

        <Text style={[s.fieldLabel, { marginTop: 20 }]}>Pickup court</Text>
        <PickupCourtPicker
          facility={pickupFacility}
          onPick={(f) => {
            setPickupFacility(f);
            if (!locationCity && f.city) setLocationCity(f.city);
            if (!locationState && f.state) setLocationState(f.state);
          }}
          onClear={() => setPickupFacility(null)}
          hint="Buyers see this public court, never your home address."
        />

        <Text style={[s.fieldLabel, { marginTop: 20 }]}>Handoff</Text>
        <View style={s.chipRow}>
          {FULFILLMENT_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[s.chip, fulfillment === opt.value && s.chipActive]}
              onPress={() => setFulfillment(opt.value)}
              activeOpacity={0.8}
            >
              <Text style={[s.chipText, fulfillment === opt.value && s.chipTextActive]}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[s.fieldLabel, { marginTop: 20 }]}>City</Text>
        <TextInput style={s.textInput} value={locationCity} onChangeText={setLocationCity} placeholder="Sarasota" placeholderTextColor={L.textMuted} />
        <Text style={[s.fieldLabel, { marginTop: 16 }]}>State</Text>
        <TextInput
          style={s.textInput} value={locationState}
          onChangeText={(v) => setLocationState(v.toUpperCase().slice(0, 2))}
          placeholder="FL" placeholderTextColor={L.textMuted} autoCapitalize="characters" maxLength={2}
        />
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
  headerTitle: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800' },
  body: { paddingHorizontal: 20, paddingBottom: 40 },
  footer: { paddingHorizontal: 20, paddingTop: 8, borderTopWidth: 1, borderTopColor: L.border },

  fieldLabel: { color: L.text, fontSize: text.fieldLabel.size, fontWeight: '800', marginBottom: 8 },
  stepHint: { color: L.textMuted, fontSize: text.caption.size, fontWeight: '500', marginBottom: 8 },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pickChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: shape.pill, borderWidth: 1.5, borderColor: L.border },
  pickChipActive: { backgroundColor: L.navy, borderColor: L.navy },
  pickChipText: { color: L.text, fontSize: text.controlLabel.size, fontWeight: '700' },
  pickChipTextActive: { color: '#FFFFFF' },

  textInput: { borderWidth: 1.5, borderColor: L.border, borderRadius: shape.cta, paddingHorizontal: 16, paddingVertical: 14, fontSize: text.body.size, fontWeight: '500', color: L.text },
  titlePreview: { color: L.navy, fontSize: text.caption.size, fontWeight: '500', marginTop: 8 },

  optionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16, borderRadius: shape.cta, borderWidth: 1.5, borderColor: L.border, marginBottom: 8 },
  optionRowActive: { borderColor: L.navy, backgroundColor: '#F0F4FF' },
  optionRowText: { color: L.text, fontSize: text.body.size, fontWeight: '500' },
  optionRowTextActive: { color: L.navy, fontWeight: '800' },

  amountRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: L.border, borderRadius: shape.cta, paddingHorizontal: 16 },
  amountPrefix: { color: L.text, fontSize: text.cardTitle.size, fontWeight: '800', marginRight: 4 },
  amountInput: { flex: 1, fontSize: text.cardTitle.size, fontWeight: '800', color: L.text, paddingVertical: 12 },
  errorText: { color: L.danger, fontSize: text.caption.size, fontWeight: '500', marginTop: 8 },

  descInput: { borderWidth: 1.5, borderColor: L.border, borderRadius: shape.cta, padding: 16, fontSize: text.body.size, fontWeight: '500', color: L.text, minHeight: 100, textAlignVertical: 'top' },
  charCount: { color: L.textMuted, fontSize: text.caption.size, fontWeight: '500', textAlign: 'right', marginTop: 4 },

  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    borderWidth: 1, borderColor: L.border, borderRadius: shape.pill ?? 20,
    paddingHorizontal: 14, paddingVertical: 9,
  },
  chipActive: { backgroundColor: L.navy, borderColor: L.navy },
  chipText: { color: L.text, fontSize: text.caption.size, fontWeight: '700' },
  chipTextActive: { color: '#FFFFFF' },
  saveBtn: { backgroundColor: L.navy, borderRadius: shape.cta, paddingVertical: 16, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: '#FFFFFF', fontSize: text.actionLarge.size, fontWeight: '800' },
});
