import React, { useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, ActivityIndicator, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { fetchCoachOfferBrowseDetail, travelAreaLabel, type CoachOfferBrowseCard } from '@/lib/coach/offers';
import { OFFER_TYPE_OPTIONS, formatPriceCents, discountPercent, effectiveOfferPrice } from '@/lib/coach/constants';
import { useMembership } from '@/hooks/useMembership';
import { useSession } from '@/hooks/useSession';
import { useCoachOfferPayment } from '@/lib/payments/useCoachOfferPayment';
import { coachOfferPaymentErrorMessage } from '@/lib/payments/coachOfferPaymentIntent';
import { CourtArt, lessonTint } from '@/components/coach/CourtArt';
import { useCoachServiceFee } from '@/lib/coach/serviceFee';

// Offer detail + checkout.
//
// The server side of this purchase (RPC, ledger, voucher issuance, webhook
// finalization) has been live since Phase 3/4 but had no caller anywhere in
// the app, which is why coach_offer_purchases had zero rows while tournament
// and booking payments ran through the same webhook every week. This screen
// is that missing caller.
//
// Layout redesigned 2026-10-04 (owner-approved): the lesson's photo or the
// drawn court on its type's tint as a full-bleed header, a rounded content
// sheet over it, capitals title in the body face (never condensed), coach
// chip, price card with the member band, DETAILS and TERMS, and a gold Book
// bar. Booking, fees and the can-book rules are unchanged.

const L = {
  navy: colors.navy, gold: colors.gold, text: colors.text, textSub: colors.textSub,
  border: colors.border, bg: colors.bg, page: colors.page,
};

const HERO_H = 220;

export default function LessonOfferDetailScreen() {
  const insets = useSafeAreaInsets();
  const { isMember } = useMembership();
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
  // Priced for THIS buyer. Until 2026-09-11 the screen always showed
  // discounted_price_cents while the server charged the member price, so a
  // member was quoted one number and billed a lower one.
  const price = effectiveOfferPrice(offer, isMember);
  const pct = discountPercent(offer.regular_price_cents, price.cents);

  // Each of these is also enforced server-side by create_coach_offer_purchase();
  // reproducing them here only decides what the button looks like. The RPC is
  // the authority - a stale screen that gets past these still gets refused.
  const isOwnOffer = !!user?.id && user.id === offer.coach_id;
  const soldOut = offer.quantity_remaining != null && offer.quantity_remaining <= 0;
  const maxParticipants = offer.max_participants ?? 1;
  // premium_only is now refused per-buyer rather than outright, so a member can
  // book one and everyone else still cannot.
  const canBook = !isOwnOffer && !soldOut && (!offer.premium_only || isMember);
  const unitPriceCents = price.cents;
  const subtotalCents = unitPriceCents * quantity;
  // Per purchase in fixed mode, whatever the headcount — a lesson is one
  // transaction. The server computes this identically and snapshots it.
  const feeCents = serviceFee.feeFor(unitPriceCents, quantity);

  const travel = travelAreaLabel(offer);
  const nameParts = (offer.coach?.full_name ?? '').trim().split(/\s+/).filter(Boolean);
  const initials = ((nameParts[0]?.[0] ?? '') + (nameParts.length > 1 ? nameParts[nameParts.length - 1][0] : '')).toUpperCase();

  return (
    <View style={s.root}>
      {/* White status-bar text over the dark header. */}
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        {/* Header: the lesson's photo, else the drawn court on its type's tint.
            Runs under the status bar. */}
        <View style={[s.hero, { height: HERO_H + insets.top }]}>
          {offer.images[0]
            ? <Image source={{ uri: offer.images[0].url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            : <CourtArt tint={lessonTint(offer.offer_type)} />}
          <TouchableOpacity
            style={[s.backBtn, { top: insets.top + 8 }]}
            onPress={() => router.back()}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={22} color={colors.white} />
          </TouchableOpacity>
          <View style={[s.typeBadge, { top: insets.top + 14 }]}>
            <Text style={s.typeBadgeText}>{typeLabel}</Text>
          </View>
        </View>

        <View style={s.sheet}>
          {offer.premium_only && (
            <View style={s.premiumBadge}><Text style={s.premiumBadgeText}>MEMBERS ONLY</Text></View>
          )}

          {/* Capitals in the body face, never condensed (owner, 2026-09-23). */}
          <Text style={s.title} numberOfLines={3}>{offer.title}</Text>

          {offer.coach && (
            // The only route into the coach profile. Without it that screen is
            // unreachable, and the coach's other lessons undiscoverable from here.
            <TouchableOpacity
              style={s.coachChip}
              activeOpacity={0.7}
              onPress={() => router.push(`/coach/${offer.coach_id}` as never)}
              accessibilityRole="button"
              accessibilityLabel={`Coach ${offer.coach.full_name}`}
            >
              {offer.coach.avatar_url ? (
                <Image source={{ uri: offer.coach.avatar_url }} style={s.coachAvatar} />
              ) : (
                <View style={[s.coachAvatar, s.coachInitials]}>
                  <Text style={s.coachInitialsText}>{initials || '·'}</Text>
                </View>
              )}
              <Text style={s.coachName} numberOfLines={1}>{offer.coach.full_name}</Text>
              <Ionicons name="chevron-forward" size={16} color={L.textSub} />
            </TouchableOpacity>
          )}

          <View style={s.priceCard}>
            <View style={s.priceRow}>
              {offer.regular_price_cents > price.cents && (
                <Text style={s.priceStrike}>{formatPriceCents(offer.regular_price_cents)}</Text>
              )}
              <Text style={s.priceNow}>{formatPriceCents(price.cents)}</Text>
              {pct > 0 && <View style={s.offPill}><Text style={s.offText}>{pct}% OFF</Text></View>}
            </View>
            {/* Two different messages. A member is told the lower price they see
                IS the member price, so the benefit is visible rather than a
                silent discount at checkout. A non-member is told what it would
                cost them — the only upsell in this flow, and it costs nothing. */}
            {(price.isMemberPrice || offer.premium_price_cents != null) && (
              <View style={s.memberBand}>
                <Ionicons name="star" size={14} color={colors.goldDeep} />
                <Text style={s.memberBandText}>
                  {price.isMemberPrice
                    ? 'Member price applied'
                    : `Members pay ${formatPriceCents(offer.premium_price_cents ?? 0)}`}
                </Text>
              </View>
            )}
          </View>

          {offer.description && <Text style={s.description}>{offer.description}</Text>}

          <Text style={s.sectionLabel}>DETAILS</Text>
          <View style={s.detailsCard}>
            {offer.skill_level_label && <DetailRow label="Skill Level" value={offer.skill_level_label} />}
            {offer.duration_minutes && <DetailRow label="Duration" value={`${offer.duration_minutes} min`} />}
            {offer.max_participants && <DetailRow label="Max Participants" value={String(offer.max_participants)} />}
            {offer.lessons_included && <DetailRow label="Lessons Included" value={String(offer.lessons_included)} />}
            {offer.quantity_available != null && <DetailRow label="Availability" value={`${offer.quantity_remaining} of ${offer.quantity_available} left`} />}
            {offer.purchase_limit_per_customer && <DetailRow label="Purchase Limit" value={`${offer.purchase_limit_per_customer} per customer`} />}
            {/* Coaches are mobile, so the facility is the closest place they
                teach, not necessarily the only one (owner, 2026-10-04). */}
            {offer.facility && (
              <DetailRow label="Closest Location" value={`${offer.facility.name} — ${offer.facility.city}, ${offer.facility.state}`} last={!travel} />
            )}
            {!!travel && <DetailRow label="Travels to You" value={travel.replace('Travels to you · ', '')} last />}
          </View>

          {offer.terms && (
            <>
              <Text style={s.sectionLabel}>TERMS</Text>
              <Text style={s.terms}>{offer.terms}</Text>
            </>
          )}
        </View>
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
            <ActivityIndicator size="small" color={L.navy} />
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
      <Text style={dr.value} numberOfLines={3}>{value}</Text>
    </View>
  );
}

const dr = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  rowLast: { borderBottomWidth: 0 },
  label: { color: colors.textSub, fontSize: text.caption.size, fontWeight: '500', width: 130, paddingTop: 1 },
  value: { color: colors.navy, fontSize: text.caption.size, fontWeight: '700', flex: 1 },
});

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },

  hero: { backgroundColor: colors.navy, overflow: 'hidden' },
  backBtn: {
    position: 'absolute', left: 16, width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(10,18,40,0.55)', alignItems: 'center', justifyContent: 'center',
  },
  typeBadge: {
    position: 'absolute', alignSelf: 'center',
    backgroundColor: 'rgba(10,18,40,0.85)', borderRadius: shape.pill, paddingHorizontal: 12, paddingVertical: 6,
  },
  typeBadgeText: {
    color: colors.white, fontSize: text.cardLabel.size, fontWeight: '800',
    letterSpacing: text.cardLabel.letterSpacing, textTransform: 'uppercase',
  },

  sheet: {
    marginTop: -24, backgroundColor: L.page,
    borderTopLeftRadius: shape.card + 8, borderTopRightRadius: shape.card + 8,
    paddingHorizontal: 20, paddingTop: spacing.lg, gap: spacing.md,
  },
  premiumBadge: {
    alignSelf: 'flex-start', backgroundColor: colors.gold, borderRadius: shape.badge, paddingHorizontal: 8, paddingVertical: 4,
  },
  premiumBadgeText: { color: L.navy, fontSize: text.microLabel.size, fontWeight: '800' },

  title: {
    color: L.navy, fontSize: text.pageTitle.size, fontWeight: '900', lineHeight: text.pageTitle.size + 4,
    textTransform: 'uppercase', letterSpacing: 0.3,
  },

  coachChip: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: '100%',
    backgroundColor: L.bg, borderRadius: shape.pill, paddingLeft: 6, paddingRight: 12, paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth, borderColor: L.border,
  },
  coachAvatar: { width: 30, height: 30, borderRadius: 15 },
  coachInitials: { backgroundColor: colors.goldLight, alignItems: 'center', justifyContent: 'center' },
  coachInitialsText: { color: L.navy, fontSize: text.microLabel.size, fontWeight: '800' },
  coachName: { color: L.navy, fontSize: text.body.size, fontWeight: '700', flexShrink: 1 },

  priceCard: {
    backgroundColor: L.bg, borderRadius: shape.card, padding: spacing.md, gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth, borderColor: L.border,
  },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  priceStrike: { color: L.textSub, fontSize: text.body.size, fontWeight: '500', textDecorationLine: 'line-through' },
  priceNow: { color: L.navy, fontSize: text.statNumber.size, fontWeight: '900', letterSpacing: -0.5 },
  offPill: { backgroundColor: colors.goldLight, borderRadius: shape.badge, paddingHorizontal: 8, paddingVertical: 4 },
  offText: { color: colors.goldDeep, fontSize: text.cardLabel.size, fontWeight: '800', letterSpacing: text.cardLabel.letterSpacing },
  memberBand: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.goldLight, borderRadius: shape.panel, paddingHorizontal: 12, paddingVertical: 10,
  },
  memberBandText: { color: colors.goldDeep, fontSize: text.caption.size, fontWeight: '700' },

  description: { color: L.text, fontSize: text.body.size, fontWeight: '500', lineHeight: 22 },

  sectionLabel: {
    color: L.textSub, fontSize: text.cardLabel.size, fontWeight: '800', letterSpacing: text.cardLabel.letterSpacing,
    marginTop: 4, marginBottom: -6,
  },
  detailsCard: {
    backgroundColor: L.bg, borderRadius: shape.card, overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth, borderColor: L.border,
  },
  terms: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', lineHeight: 19 },

  checkoutBar: {
    backgroundColor: L.bg, paddingHorizontal: 16, paddingTop: 12, gap: 10,
    borderTopLeftRadius: shape.card + 8, borderTopRightRadius: shape.card + 8,
    shadowColor: L.navy, shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: -4 }, elevation: 8,
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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: L.gold, borderRadius: shape.cta, paddingVertical: 15, paddingHorizontal: 20, minHeight: 56,
  },
  bookBtnDisabled: { opacity: 0.45 },
  bookBtnText: { color: L.navy, fontSize: text.actionLarge.size, fontWeight: '800' },
  bookBtnPrice: { color: L.navy, fontSize: text.statValueSm.size, fontWeight: '900' },
  feeNote: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', textAlign: 'center' },
});
