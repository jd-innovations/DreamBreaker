import React, { useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, ActivityIndicator, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { colors } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { fetchCoachOfferBrowseDetail, type CoachOfferBrowseCard } from '@/lib/coach/offers';
import { OFFER_TYPE_OPTIONS, formatPriceCents, discountPercent } from '@/lib/coach/constants';
import { useSession } from '@/hooks/useSession';
import { useCoachOfferPayment } from '@/lib/payments/useCoachOfferPayment';
import { coachOfferPaymentErrorMessage } from '@/lib/payments/coachOfferPaymentIntent';
import { DEFAULT_LESSON_COVER } from '@/lib/coach/defaultLessonCover';
import { useCoachServiceFee } from '@/lib/coach/serviceFee';

// Offer detail + checkout.
//
// The server side of this purchase (RPC, ledger, voucher issuance, webhook
// finalization) has been live since Phase 3/4 but had no caller anywhere in
// the app, which is why coach_offer_purchases had zero rows while tournament
// and booking payments ran through the same webhook every week. This screen
// is that missing caller.

const L = {
  navy: colors.navy, gold: colors.gold, text: colors.text, textSub: colors.textSub,
  border: colors.border, bg: colors.bg, page: colors.page, goldBg: colors.goldBg,
};

export default function LessonOfferDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [offer, setOffer] = useState<CoachOfferBrowseCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const { user } = useSession();
  const { payForCoachOffer, processing } = useCoachOfferPayment();
  const serviceFee = useCoachServiceFee();
  // One id per checkout attempt, feeding the edge function's idempotency key.
  // Regenerated only after a completed attempt, so a double-tap reuses the same
  // PaymentIntent rather than minting a second purchase.
  const attemptRef = useRef(`${Date.now()}`);

  useFocusEffect(useCallback(() => {
    if (!id) return;
    let active = true;
    setLoading(true);
    fetchCoachOfferBrowseDetail(id).then((o) => { if (active) setOffer(o); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]));

  async function handleBook() {
    if (!offer) return;
    if (!user?.id) {
      Alert.alert('Sign in required', 'Please sign in to book this lesson.');
      return;
    }

    const outcome = await payForCoachOffer(offer.id, quantity, attemptRef.current);

    switch (outcome.status) {
      case 'finalized':
        attemptRef.current = `${Date.now()}`;
        Alert.alert(
          'Lesson booked',
          'Your voucher is in your Wallet. Show it to your coach at the lesson.',
          [{ text: 'View Wallet', onPress: () => router.push('/wallet' as never) }, { text: 'Done' }],
        );
        break;
      case 'succeeded_pending_confirmation':
        attemptRef.current = `${Date.now()}`;
        // Payment captured, webhook not visible yet. Deliberately not phrased as
        // failure - the money is taken and the voucher will appear - but not as
        // success either, because nothing has confirmed it yet.
        Alert.alert(
          'Payment received',
          'We are still confirming your booking. Your voucher will appear in your Wallet shortly.',
          [{ text: 'View Wallet', onPress: () => router.push('/wallet' as never) }, { text: 'OK' }],
        );
        break;
      case 'canceled':
        break; // closing the sheet is a normal outcome, not an error
      case 'failed':
        Alert.alert('Payment failed', outcome.message);
        break;
      case 'error':
        Alert.alert('Could not book', coachOfferPaymentErrorMessage(outcome.code));
        break;
    }
  }

  if (loading || !offer) {
    return (
      <View style={[s.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={L.gold} />
      </View>
    );
  }

  const typeLabel = OFFER_TYPE_OPTIONS.find((o) => o.value === offer.offer_type)?.label ?? offer.offer_type;
  const pct = discountPercent(offer.regular_price_cents, offer.discounted_price_cents);

  // Each of these is also enforced server-side by create_coach_offer_purchase();
  // reproducing them here only decides what the button looks like. The RPC is
  // the authority - a stale screen that gets past these still gets refused.
  const isOwnOffer = !!user?.id && user.id === offer.coach_id;
  const soldOut = offer.quantity_remaining != null && offer.quantity_remaining <= 0;
  const maxParticipants = offer.max_participants ?? 1;
  const canBook = !isOwnOffer && !soldOut && !offer.premium_only;
  const unitPriceCents = offer.discounted_price_cents ?? offer.regular_price_cents;
  const subtotalCents = unitPriceCents * quantity;
  // Per purchase in fixed mode, whatever the headcount — a lesson is one
  // transaction. The server computes this identically and snapshots it.
  const feeCents = serviceFee.feeFor(unitPriceCents, quantity);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={L.navy} />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{typeLabel}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
        <Image
          source={offer.images[0] ? { uri: offer.images[0].url } : DEFAULT_LESSON_COVER}
          style={s.hero}
          resizeMode="cover"
        />

        {offer.premium_only && (
          <View style={s.premiumBadge}><Text style={s.premiumBadgeText}>PREMIUM MEMBERS ONLY</Text></View>
        )}

        <Text style={s.title}>{offer.title}</Text>

        {offer.coach && (
          // The only route into the coach profile. Without it that screen is
          // unreachable, and the coach's other lessons undiscoverable from here.
          <TouchableOpacity
            style={s.coachRow}
            activeOpacity={0.7}
            onPress={() => router.push(`/coach/${offer.coach_id}` as never)}
          >
            {offer.coach.avatar_url ? (
              <Image source={{ uri: offer.coach.avatar_url }} style={s.coachAvatar} />
            ) : (
              <View style={[s.coachAvatar, s.coachAvatarPlaceholder]}>
                <Ionicons name="person" size={16} color={L.textSub} />
              </View>
            )}
            <Text style={s.coachName}>{offer.coach.full_name}</Text>
            <Ionicons name="chevron-forward" size={14} color={L.textSub} />
          </TouchableOpacity>
        )}

        <View style={s.priceCard}>
          <View style={s.priceRow}>
            <Text style={s.priceStrike}>{formatPriceCents(offer.regular_price_cents)}</Text>
            <Text style={s.priceNow}>{formatPriceCents(offer.discounted_price_cents)}</Text>
            <Text style={s.pctOff}>{pct}% off</Text>
          </View>
          {offer.premium_price_cents != null && (
            <Text style={s.premiumPriceHint}>Premium members: {formatPriceCents(offer.premium_price_cents)}</Text>
          )}
        </View>

        {offer.description && <Text style={s.description}>{offer.description}</Text>}

        <View style={s.detailsCard}>
          {offer.skill_level_label && <DetailRow label="Skill Level" value={offer.skill_level_label} />}
          {offer.duration_minutes && <DetailRow label="Duration" value={`${offer.duration_minutes} min`} />}
          {offer.max_participants && <DetailRow label="Max Participants" value={String(offer.max_participants)} />}
          {offer.lessons_included && <DetailRow label="Lessons Included" value={String(offer.lessons_included)} />}
          {offer.quantity_available != null && <DetailRow label="Availability" value={`${offer.quantity_remaining} of ${offer.quantity_available} left`} />}
          {offer.purchase_limit_per_customer && <DetailRow label="Purchase Limit" value={`${offer.purchase_limit_per_customer} per customer`} />}
          {offer.facility && <DetailRow label="Location" value={`${offer.facility.name} — ${offer.facility.city}, ${offer.facility.state}`} last />}
        </View>

        {offer.terms && (
          <>
            <Text style={s.sectionLabel}>Terms</Text>
            <Text style={s.terms}>{offer.terms}</Text>
          </>
        )}
      </ScrollView>

      {/* ── CHECKOUT ── */}
      <View style={[s.checkoutBar, { paddingBottom: insets.bottom + 12 }]}>
        {maxParticipants > 1 && canBook && (
          <View style={s.qtyRow}>
            <Text style={s.qtyLabel}>Participants</Text>
            <View style={s.stepper}>
              <TouchableOpacity
                style={[s.stepBtn, quantity <= 1 && s.stepBtnDisabled]}
                disabled={quantity <= 1 || processing}
                onPress={() => setQuantity(q => Math.max(1, q - 1))}
              >
                <Ionicons name="remove" size={18} color={quantity <= 1 ? L.textSub : L.navy} />
              </TouchableOpacity>
              <Text style={s.qtyValue}>{quantity}</Text>
              <TouchableOpacity
                style={[s.stepBtn, quantity >= maxParticipants && s.stepBtnDisabled]}
                disabled={quantity >= maxParticipants || processing}
                onPress={() => setQuantity(q => Math.min(maxParticipants, q + 1))}
              >
                <Ionicons name="add" size={18} color={quantity >= maxParticipants ? L.textSub : L.navy} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        <TouchableOpacity
          style={[s.bookBtn, (!canBook || processing) && s.bookBtnDisabled]}
          activeOpacity={0.85}
          disabled={!canBook || processing}
          onPress={handleBook}
        >
          {processing ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Text style={s.bookBtnText}>
                {isOwnOffer ? 'Your Lesson'
                  : soldOut ? 'Sold Out'
                  : offer.premium_only ? 'Premium Members Only'
                  : 'Book Lesson'}
              </Text>
              {canBook && (
                <Text style={s.bookBtnPrice}>
                  {formatPriceCents(subtotalCents + feeCents)}
                </Text>
              )}
            </>
          )}
        </TouchableOpacity>

        {canBook && feeCents > 0 && (
          // Named and totalled, not merely warned about. The old note said
          // "Service fees calculated at checkout", which was a promise that the
          // number on the button was not the number you would pay — leaving
          // PaymentSheet as the first place the real total appeared. The server
          // resolves this same fee from platform_settings and snapshots it onto
          // the purchase, so these two agree by construction.
          <Text style={s.feeNote}>
            {formatPriceCents(subtotalCents)} + {formatPriceCents(feeCents)} convenience fee
          </Text>
        )}
      </View>
    </View>
  );
}

function DetailRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[dr.row, last && dr.rowLast]}>
      <Text style={dr.label}>{label}</Text>
      <Text style={dr.value} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const dr = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 14, paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  rowLast: { borderBottomWidth: 0 },
  label: { color: colors.textSub, fontSize: text.caption.size, fontWeight: '500', width: 120, paddingTop: 1 },
  value: { color: colors.text, fontSize: text.caption.size, fontWeight: '500', flex: 1 },
});

const s = StyleSheet.create({
  checkoutBar: {
    borderTopWidth: 1, borderTopColor: L.border, backgroundColor: L.bg,
    paddingHorizontal: 16, paddingTop: 12, gap: 10,
  },
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  qtyLabel: { color: L.navy, fontSize: text.rowTitle.size, fontWeight: '700' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepBtn: {
    width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: L.border,
    alignItems: 'center', justifyContent: 'center',
  },
  stepBtnDisabled: { opacity: 0.4 },
  qtyValue: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800', minWidth: 20, textAlign: 'center' },
  bookBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: L.navy, borderRadius: shape.cta, paddingVertical: 15, minHeight: 52,
  },
  bookBtnDisabled: { opacity: 0.45 },
  bookBtnText: { color: '#FFFFFF', fontSize: text.actionLarge.size, fontWeight: '800' },
  bookBtnPrice: { color: '#FFFFFF', fontSize: text.actionLarge.size, fontWeight: '800', opacity: 0.85 },
  feeNote: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', textAlign: 'center' },
  root: { flex: 1, backgroundColor: L.page },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: L.bg,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800', flex: 1, textAlign: 'center' },

  scroll: { paddingHorizontal: 20, paddingTop: 16 },
  hero: { width: '100%', height: 180, borderRadius: shape.card, marginBottom: 12 },

  premiumBadge: { alignSelf: 'flex-start', backgroundColor: L.navy, borderRadius: shape.badge, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 8 },
  premiumBadgeText: { color: L.bg, fontSize: 10, fontWeight: '800' },

  title: { color: L.navy, fontSize: text.cardTitle.size, fontWeight: '800', marginBottom: 8 },

  coachRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  coachAvatar: { width: 28, height: 28, borderRadius: 14 },
  coachAvatarPlaceholder: { backgroundColor: L.goldBg, alignItems: 'center', justifyContent: 'center' },
  coachName: { color: L.text, fontSize: text.caption.size, fontWeight: '500' },

  priceCard: { backgroundColor: L.bg, borderWidth: 1, borderColor: L.border, borderRadius: shape.card, padding: 14, marginBottom: 16 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  priceStrike: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', textDecorationLine: 'line-through' },
  priceNow: { color: L.navy, fontSize: text.cardTitle.size, fontWeight: '800' },
  pctOff: { color: colors.gold, fontSize: text.cardLabel.size, fontWeight: '800', letterSpacing: text.cardLabel.letterSpacing },
  premiumPriceHint: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', marginTop: 6 },

  description: { color: L.text, fontSize: text.body.size, fontWeight: '500', lineHeight: 21, marginBottom: 16 },

  detailsCard: { backgroundColor: L.bg, borderWidth: 1, borderColor: L.border, borderRadius: shape.card, marginBottom: 16 },

  sectionLabel: { color: L.navy, fontSize: text.sectionLabel.size, fontWeight: '800', letterSpacing: text.sectionLabel.letterSpacing, marginBottom: 6 },
  terms: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', lineHeight: 19, marginBottom: 16 },

});
