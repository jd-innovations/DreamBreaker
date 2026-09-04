import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams } from 'expo-router';
import { colors } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { goBack } from '@/lib/navigation';
import { useSession } from '@/hooks/useSession';
import { useSupportContext } from '@/lib/support/supportContext';
import { REFUND_REASONS, submitRefundRequest, type RefundReason } from '@/lib/coach/refundRequest';

// Coach Marketplace Phase 7 — a buyer asking for a refund.
//
// Deliberately a REQUEST, not a refund. Spec §27 makes an unused purchase
// non-refundable by default, with exceptions decided by an admin — so this
// screen never promises money back, and its copy says so before the user
// spends effort explaining themselves.
//
// Files into the existing support queue, which already has a reviewer, a
// status and a reply thread. A dedicated refund inbox would be a second inbox
// to abandon.

const L = {
  navy: colors.navy, gold: colors.gold, text: colors.text, textSub: colors.textSub,
  border: colors.border, bg: colors.bg, page: colors.page, white: '#FFFFFF',
};

export default function RefundRequestScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const params = useLocalSearchParams<{
    purchaseId?: string; walletItemId?: string; offerTitle?: string; coachName?: string;
  }>();

  const [reason, setReason] = useState<RefundReason | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);

  useSupportContext({
    feature: 'coach_marketplace',
    entityType: 'coach_offer_purchase',
    entityId: params.purchaseId,
    action: 'refund_request',
  });

  const canSubmit = !!reason && details.trim().length >= 10 && !busy;

  async function submit() {
    if (!user?.id || !reason || !params.purchaseId || !params.walletItemId) return;
    setBusy(true);
    try {
      const res = await submitRefundRequest({
        userId: user.id,
        purchaseId: params.purchaseId,
        walletItemId: params.walletItemId,
        offerTitle: params.offerTitle ?? 'Lesson',
        coachName: params.coachName ?? 'Coach',
        reason,
        details,
      });

      if (!res.ok) {
        Alert.alert('Could not send', res.message);
        return;
      }

      Alert.alert(
        'Request sent',
        'Our team will review it and reply in Support. Most lessons are non-refundable, so we may ask for more detail.',
        [{ text: 'OK', onPress: () => goBack(`/wallet/${params.walletItemId}`) }],
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={s.root}>
      <StatusBar style="dark" />
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={s.back} onPress={() => goBack(`/wallet/${params.walletItemId}`)} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={L.navy} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Request a Refund</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Said before the form, not after it: a buyer who is going to be
            refused should learn that before writing a paragraph. */}
        <View style={s.notice}>
          <Ionicons name="information-circle-outline" size={18} color={L.gold} />
          <Text style={s.noticeText}>
            Lessons are normally non-refundable. We review exceptions — a coach who cancelled or
            did not show up, or a problem on our side.
          </Text>
        </View>

        {!!params.offerTitle && (
          <View style={s.itemCard}>
            <Text style={s.itemTitle}>{params.offerTitle}</Text>
            {!!params.coachName && <Text style={s.itemSub}>{params.coachName}</Text>}
          </View>
        )}

        <View style={{ gap: 8 }}>
          <Text style={s.label}>What happened?</Text>
          {REFUND_REASONS.map(r => (
            <TouchableOpacity
              key={r.key}
              style={[s.reason, reason === r.key && s.reasonOn]}
              activeOpacity={0.8}
              onPress={() => setReason(r.key)}
              accessibilityRole="radio"
              accessibilityState={{ selected: reason === r.key }}
            >
              <Ionicons
                name={reason === r.key ? 'radio-button-on' : 'radio-button-off'}
                size={18}
                color={reason === r.key ? L.gold : L.border}
              />
              <Text style={[s.reasonText, reason === r.key && s.reasonTextOn]}>{r.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ gap: 8 }}>
          <Text style={s.label}>Tell us more</Text>
          <TextInput
            style={s.input}
            value={details}
            onChangeText={setDetails}
            placeholder="When was the lesson, and what went wrong?"
            placeholderTextColor={L.textSub}
            multiline
            textAlignVertical="top"
            maxLength={1000}
            editable={!busy}
          />
          <Text style={s.counter}>
            {details.trim().length < 10 ? 'A little more detail helps us decide.' : `${details.trim().length}/1000`}
          </Text>
        </View>

        <TouchableOpacity
          style={[s.submit, !canSubmit && s.submitDisabled]}
          disabled={!canSubmit}
          activeOpacity={0.85}
          onPress={submit}
        >
          {busy ? <ActivityIndicator size="small" color={L.white} /> : <Text style={s.submitText}>Send Request</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, backgroundColor: L.bg,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800' },

  notice: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 14,
    backgroundColor: colors.goldBg, borderRadius: shape.card,
    borderWidth: 1, borderColor: colors.goldBorder,
  },
  noticeText: { flex: 1, color: L.text, fontSize: text.caption.size, fontWeight: '500', lineHeight: 19 },

  itemCard: {
    padding: 14, backgroundColor: L.bg, borderRadius: shape.card,
    borderWidth: 1, borderColor: L.border, gap: 2,
  },
  itemTitle: { color: L.navy, fontSize: text.body.size, fontWeight: '500' },
  itemSub: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500' },

  label: { color: L.navy, fontSize: text.rowValue.size, fontWeight: '800' },
  reason: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14,
    backgroundColor: L.bg, borderRadius: shape.card, borderWidth: 1.5, borderColor: L.border,
  },
  reasonOn: { borderColor: L.gold, backgroundColor: colors.goldBg },
  reasonText: { color: L.text, fontSize: text.rowTitle.size, fontWeight: '700' },
  reasonTextOn: { color: L.navy, fontWeight: '800' },

  input: {
    minHeight: 120, borderWidth: 1, borderColor: L.border, borderRadius: shape.card,
    padding: 12, color: L.navy, fontSize: text.body.size, fontWeight: '500', lineHeight: 20, backgroundColor: L.bg,
  },
  counter: { color: L.textSub, fontSize: 11, textAlign: 'right' },

  submit: {
    backgroundColor: L.navy, borderRadius: shape.cta, paddingVertical: 15,
    alignItems: 'center', justifyContent: 'center', minHeight: 52, marginTop: 4,
  },
  submitDisabled: { opacity: 0.4 },
  submitText: { color: L.white, fontSize: text.actionLarge.size, fontWeight: '800' },
});
