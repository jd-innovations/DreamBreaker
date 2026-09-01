import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Image, ActivityIndicator, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { colors, radius } from '@/theme';
import {
  fetchCoachOfferDetail, updateCoachOffer, publishCoachOffer, pauseCoachOffer,
  resumeCoachOffer, archiveCoachOffer, type CoachOfferWithImages,
} from '@/lib/coach/offers';
import { OFFER_TYPE_OPTIONS, formatPriceCents, discountPercent } from '@/lib/coach/constants';
import { coachOfferErrorMessage } from '@/lib/coach/offerErrors';

// Editing here only ever writes to this offer's own coach_offers row —
// there is no purchase/wallet table for it to reach into (Phase 3+), so
// price/terms changes here structurally cannot mutate an already-purchased
// voucher. See lib/coach/offers.ts's UpdateCoachOfferInput comment.
//
// Photo re-management is not in this pass (create-time photos only) —
// scoped out deliberately, not an oversight; flagged in the Phase 2 report.

const L = {
  navy: colors.navy, gold: colors.gold, text: colors.text, textSub: colors.textSub,
  border: colors.border, bg: colors.bg, page: colors.page, success: colors.success, danger: colors.danger,
};

export default function EditCoachOfferScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [offer, setOffer] = useState<CoachOfferWithImages | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [regularPrice, setRegularPrice] = useState('');
  const [discountedPrice, setDiscountedPrice] = useState('');
  const [quantityAvailable, setQuantityAvailable] = useState('');
  const [purchaseLimit, setPurchaseLimit] = useState('');
  const [terms, setTerms] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    fetchCoachOfferDetail(id).then((o) => {
      if (!o) return;
      setOffer(o);
      setTitle(o.title);
      setDescription(o.description ?? '');
      setRegularPrice((o.regular_price_cents / 100).toString());
      setDiscountedPrice((o.discounted_price_cents / 100).toString());
      setQuantityAvailable(o.quantity_available?.toString() ?? '');
      setPurchaseLimit(o.purchase_limit_per_customer?.toString() ?? '');
      setTerms(o.terms ?? '');
    }).finally(() => setLoading(false));
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const regularCents = Math.round((parseFloat(regularPrice) || 0) * 100);
  const discountedCents = Math.round((parseFloat(discountedPrice) || 0) * 100);
  const pct = regularCents > 0 ? discountPercent(regularCents, discountedCents) : 0;
  const canSave = title.trim().length > 0 && regularCents > 0 && discountedCents > 0 && discountedCents <= regularCents;

  async function persist() {
    if (!id) return false;
    try {
      await updateCoachOffer(id, {
        title: title.trim(),
        description: description.trim() || null,
        regularPriceCents: regularCents,
        discountedPriceCents: discountedCents,
        quantityAvailable: quantityAvailable ? parseInt(quantityAvailable, 10) : null,
        purchaseLimitPerCustomer: purchaseLimit ? parseInt(purchaseLimit, 10) : null,
        terms: terms.trim() || null,
      });
      return true;
    } catch (err) {
      Alert.alert('Could Not Save', coachOfferErrorMessage(err));
      return false;
    }
  }

  async function handleSave() {
    setSaving(true);
    const ok = await persist();
    setSaving(false);
    if (ok) load();
  }

  async function handlePublishOrResume() {
    if (!id) return;
    setSaving(true);
    const saved = await persist();
    if (saved) {
      try {
        if (offer?.status === 'paused') await resumeCoachOffer(id);
        else await publishCoachOffer(id);
        load();
      } catch (err) {
        Alert.alert('Could Not Publish', err instanceof Error ? err.message : 'Please try again.');
      }
    }
    setSaving(false);
  }

  async function handlePause() {
    if (!id) return;
    setSaving(true);
    try { await pauseCoachOffer(id); load(); }
    catch (err) { Alert.alert('Could Not Pause', err instanceof Error ? err.message : 'Please try again.'); }
    finally { setSaving(false); }
  }

  async function handleArchive() {
    if (!id) return;
    Alert.alert('Archive Offer', 'This offer will no longer be visible to players. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive', style: 'destructive', onPress: async () => {
          setSaving(true);
          try { await archiveCoachOffer(id); router.replace('/coach/offers' as never); }
          catch (err) { Alert.alert('Could Not Archive', err instanceof Error ? err.message : 'Please try again.'); }
          finally { setSaving(false); }
        },
      },
    ]);
  }

  if (loading || !offer) {
    return (
      <View style={[s.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={L.gold} />
      </View>
    );
  }

  const typeLabel = OFFER_TYPE_OPTIONS.find((o) => o.value === offer.offer_type)?.label ?? offer.offer_type;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={L.navy} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Edit Offer</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 140 }]} showsVerticalScrollIndicator={false}>
        <Text style={s.typeLabel}>{typeLabel} · {offer.status.toUpperCase()}</Text>

        {offer.images[0] && <Image source={{ uri: offer.images[0].url }} style={s.hero} />}

        <Text style={s.sectionLabel}>Title</Text>
        <TextInput style={s.input} value={title} onChangeText={setTitle} placeholderTextColor={L.textSub} />

        <Text style={s.sectionLabel}>Description</Text>
        <TextInput style={[s.input, s.textArea]} value={description} onChangeText={setDescription} multiline placeholderTextColor={L.textSub} />

        <View style={s.row2}>
          <View style={s.col}>
            <Text style={s.sectionLabel}>Regular Price ($)</Text>
            <TextInput style={s.input} value={regularPrice} onChangeText={setRegularPrice} keyboardType="decimal-pad" placeholderTextColor={L.textSub} />
          </View>
          <View style={s.col}>
            <Text style={s.sectionLabel}>Sell For ($)</Text>
            <TextInput style={s.input} value={discountedPrice} onChangeText={setDiscountedPrice} keyboardType="decimal-pad" placeholderTextColor={L.textSub} />
          </View>
        </View>
        <Text style={s.discountHint}>
          {pct}% off. Price changes here only apply to future purchases — anything already purchased keeps its original terms.
        </Text>

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

        <Text style={s.sectionLabel}>Terms</Text>
        <TextInput style={[s.input, s.textArea]} value={terms} onChangeText={setTerms} multiline placeholderTextColor={L.textSub} />
      </ScrollView>

      <View style={[s.footer, { paddingBottom: insets.bottom + 12 }]}>
        <View style={s.footerRow}>
          <TouchableOpacity style={[s.secondaryBtn, saving && s.btnDisabled]} disabled={saving} onPress={handleSave}>
            <Text style={s.secondaryBtnText}>Save</Text>
          </TouchableOpacity>
          {offer.status === 'active' ? (
            <TouchableOpacity style={[s.secondaryBtn, saving && s.btnDisabled]} disabled={saving} onPress={handlePause}>
              <Text style={s.secondaryBtnText}>Pause</Text>
            </TouchableOpacity>
          ) : offer.status !== 'archived' ? (
            <TouchableOpacity style={[s.primaryBtn, (!canSave || saving) && s.btnDisabled]} disabled={!canSave || saving} onPress={handlePublishOrResume}>
              {saving ? <ActivityIndicator size="small" color={L.bg} /> : <Text style={s.primaryBtnText}>{offer.status === 'paused' ? 'Resume' : 'Publish'}</Text>}
            </TouchableOpacity>
          ) : null}
        </View>
        {offer.status !== 'archived' && (
          <TouchableOpacity style={s.archiveBtn} disabled={saving} onPress={handleArchive}>
            <Text style={s.archiveBtnText}>Archive Offer</Text>
          </TouchableOpacity>
        )}
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
  typeLabel: { color: L.textSub, fontSize: 12, fontWeight: '700', marginBottom: 12 },
  hero: { width: '100%', height: 140, borderRadius: radius.card, marginBottom: 12 },
  sectionLabel: { color: L.navy, fontSize: 13, fontWeight: '700', marginTop: 14, marginBottom: 6 },
  discountHint: { color: colors.gold, fontSize: 12, fontWeight: '600', marginTop: 6, lineHeight: 17 },

  input: {
    borderWidth: 1, borderColor: L.border, borderRadius: radius.button,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: L.text, backgroundColor: L.bg,
  },
  textArea: { minHeight: 70, textAlignVertical: 'top' },
  row2: { flexDirection: 'row', gap: 12 },
  col: { flex: 1 },

  footer: {
    paddingHorizontal: 20, paddingTop: 12, backgroundColor: L.bg,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: L.border, gap: 8,
  },
  footerRow: { flexDirection: 'row', gap: 10 },
  secondaryBtn: {
    flex: 1, borderRadius: radius.button, borderWidth: 1, borderColor: L.navy,
    paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
  },
  secondaryBtnText: { color: L.navy, fontSize: 14, fontWeight: '800' },
  primaryBtn: {
    flex: 1, borderRadius: radius.button, backgroundColor: L.navy,
    paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
  },
  primaryBtnText: { color: L.bg, fontSize: 14, fontWeight: '800' },
  archiveBtn: { alignItems: 'center', paddingVertical: 8 },
  archiveBtnText: { color: L.danger, fontSize: 13, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },
});
