import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Linking, Share, Image } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { goBack } from '@/lib/navigation';
import { colors, radius } from '@/theme';
import { Avatar, StatusChip, WalletActivityRow, WalletActivityEmpty, WalletRedeemSheet } from '@/components';
import { getWalletItemStatusInfo } from '@/lib/walletItemStatus';
import { getWalletTypeAccent } from '@/lib/walletItemAccent';
import { useWalletItem } from '@/hooks/useWalletItem';
import { useSupportContext } from '@/lib/support/supportContext';
import { OFFER_TYPE_OPTIONS } from '@/lib/coach/constants';
import type { WalletItem } from '@/lib/walletTypes';
import { fetchVoucherRedemptionCode, voucherQrValue } from '@/lib/coach/voucherRedemption';
import { DEFAULT_LESSON_COVER } from '@/lib/coach/defaultLessonCover';

const OFFER_TYPE_LABELS = Object.fromEntries(OFFER_TYPE_OPTIONS.map((o) => [o.value, o.label])) as Record<string, string>;

const L = {
  bg:       colors.bg,
  page:     colors.page,
  navy:     colors.navy,
  gold:     colors.gold,
  goldBg:   colors.goldBg,
  text:     colors.text,
  textSub:  colors.textSub,
  border:   colors.border,
  danger:   colors.danger,
  dangerBg: colors.dangerBg,
};

function partnerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatValueAmount(item: WalletItem): string {
  return item.valueLabel
    ?? `${item.currencyCode === 'USD' ? '$' : item.currencyCode + ' '}${item.valueAmount!.toFixed(2)}`;
}

async function handleShare(item: WalletItem) {
  try {
    await Share.share({
      message: item.description ? `${item.title} — ${item.description}` : item.title,
    });
  } catch {}
}

export default function WalletItemDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { item, activity, entitlementSummary, loading, error } = useWalletItem(id);

  // §12: identifies which benefit, never a $ amount or transaction detail.
  useSupportContext({ feature: 'wallet', entityType: 'wallet_item', entityId: id, entityLabel: item?.title });
  const [showRedeemSheet, setShowRedeemSheet] = useState(false);
  // The code the coach scans or types. Read separately from the wallet item:
  // it lives on the entitlement, which is the authority on how many
  // redemptions are left — the wallet item only carries the purchase snapshot.
  const [voucher, setVoucher] = useState<{ code: string; remaining: number; total: number; status: string } | null>(null);

  // Loaded on focus rather than once: the coach may redeem while this screen
  // is open, and a stale "1 of 1 remaining" beside a spent code is the one
  // thing a buyer must not be shown.
  useFocusEffect(useCallback(() => {
    if (!id || item?.type !== 'coach_voucher') { setVoucher(null); return; }
    let active = true;
    fetchVoucherRedemptionCode(id)
      .then(v => { if (active) setVoucher(v); })
      .catch(() => { if (active) setVoucher(null); });
    return () => { active = false; };
  }, [id, item?.type]));

  function handleAction() {
    if (!item) return;
    if (item.actionType === 'external_url' && item.actionUrl) {
      setShowRedeemSheet(true);
    } else if (item.actionType === 'internal_route' && item.actionUrl) {
      router.push(item.actionUrl as never);
    }
  }

  if (loading || (!item && !error)) {
    return (
      <View style={{ flex: 1, backgroundColor: L.page, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.gold} />
      </View>
    );
  }

  if (error || !item) {
    return (
      <View style={{ flex: 1, backgroundColor: L.page }}>
        <StatusBar style="dark" />
        <View style={[s.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={s.iconBtn} onPress={() => goBack('/wallet')} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={24} color={L.navy} />
          </TouchableOpacity>
        </View>
        <View style={s.errorState}>
          <Ionicons name="alert-circle-outline" size={44} color={L.textSub} />
          <Text style={s.errorTitle}>{error ?? 'Item not found'}</Text>
        </View>
      </View>
    );
  }

  const statusInfo = getWalletItemStatusInfo(item.status);
  const partnerName = item.partner?.name ?? item.title;
  const startsText = formatDate(item.startsAt);
  const expiresText = formatDate(item.expiresAt);
  const addedText = formatDate(item.createdAt);
  const accent = getWalletTypeAccent(item.type);
  const hasValue = item.valueAmount != null || item.valueLabel;
  // Navy reads better than white on the light gold surface; every other
  // accent is saturated enough for white text.
  const btnTextColor = accent.color === colors.gold ? L.navy : '#FFFFFF';

  return (
    <>
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={s.header}>
        <TouchableOpacity style={s.iconBtn} onPress={() => goBack('/wallet')} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={L.navy} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: accent.color }]}>ITEM DETAIL</Text>
        <TouchableOpacity style={s.iconBtn} onPress={() => handleShare(item)} activeOpacity={0.7}>
          <Ionicons name="share-outline" size={20} color={L.navy} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
      >
        <View style={s.eyebrowRow}>
          <Ionicons name={accent.icon as never} size={13} color={accent.color} />
          <Text style={[s.eyebrow, { color: accent.color }]}>{accent.label.toUpperCase()}</Text>
        </View>

        {item.type === 'coach_voucher' && (
          // The offer's own photo as snapshotted at purchase, else the bundled
          // lesson cover — the same image the marketplace shows, rather than a
          // glyph that reads as a missing picture. heroImageUrl stays null for
          // any offer sold without a photo, which today is all of them.
          <Image
            source={item.coachVoucher?.heroImageUrl
              ? { uri: item.coachVoucher.heroImageUrl }
              : DEFAULT_LESSON_COVER}
            style={s.hero}
            resizeMode="cover"
          />
        )}

        <Text style={s.title}>{item.title}</Text>
        <Text style={s.subtitle}>{item.subtitle ?? partnerName}</Text>

        <View style={[s.infoCard, { backgroundColor: accent.bg }]}>
          <View style={s.infoRow}>
            <Avatar uri={item.partner?.logoUrl} initials={partnerInitials(partnerName)} bg={accent.color} size={44} />
            <View style={{ flex: 1 }} />
            {hasValue && (
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[s.valueAmount, { color: accent.color }]}>{formatValueAmount(item)}</Text>
                <Text style={s.valueStatus}>{statusInfo.label}</Text>
              </View>
            )}
          </View>

          {item.remainingValueAmount != null && item.originalValueAmount != null
            && item.remainingValueAmount !== item.originalValueAmount && (
            <Text style={s.valueSub}>
              ${item.remainingValueAmount.toFixed(2)} remaining of ${item.originalValueAmount.toFixed(2)}
            </Text>
          )}

          {(startsText || expiresText) && (
            <>
              <View style={s.infoDivider} />
              <Text style={s.expiresText}>
                {startsText && `Starts ${startsText}`}{startsText && expiresText ? '  ·  ' : ''}
                {expiresText && `Expires ${expiresText}`}
              </Text>
            </>
          )}
        </View>

        {!!item.description && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>ABOUT THIS {accent.label.toUpperCase()}</Text>
            <Text style={s.description}>{item.description}</Text>
          </View>
        )}

        {item.type === 'coach_voucher' && item.coachVoucher && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>VOUCHER DETAILS</Text>
            <View style={s.detailsCard}>
              <DetailRow label="Offer Type" value={OFFER_TYPE_LABELS[item.coachVoucher.offerType] ?? item.coachVoucher.offerType} />
              {item.coachVoucher.facilityName && <DetailRow label="Location" value={item.coachVoucher.facilityName} />}
              <DetailRow
                label="You Paid"
                value={`$${(item.coachVoucher.buyerTotalChargedCents / 100).toFixed(2)} (${item.coachVoucher.discountPct}% off $${(item.coachVoucher.regularPriceCents / 100).toFixed(2)})`}
              />
              {entitlementSummary && (
                <DetailRow
                  label={entitlementSummary.entitlementType === 'package' ? 'Lessons Remaining' : 'Participants Remaining'}
                  value={`${entitlementSummary.remainingRedemptions} of ${entitlementSummary.totalRedemptions}`}
                />
              )}
              <DetailRow label="Purchased" value={formatDate(item.coachVoucher.purchasedAt) ?? '—'} last />
            </View>
          </View>
        )}

        {/* Coach voucher: the thing the buyer actually shows at the lesson.
            Replaces a primary button labelled "View Voucher" that sat on the
            voucher's own detail screen and did nothing — action_type is
            'view_details' with a null action_url, which handleAction ignores. */}
        {item.type === 'coach_voucher' && voucher && (
          voucher.remaining > 0 ? (
            <View style={s.redeemBlock}>
              <Text style={s.redeemTitle}>Show this to your coach</Text>
              <View style={s.qrFrame}>
                <QRCode value={voucherQrValue(voucher.code)} size={190} backgroundColor="#FFFFFF" />
              </View>
              {/* The same code, readable. Cameras fail — bad light, cracked
                  screen, a coach whose phone is in the car — and a lesson
                  should not hinge on one. */}
              <Text style={s.redeemCodeLabel}>Or give them this code</Text>
              <Text style={s.redeemCode} selectable>{voucher.code}</Text>
              {voucher.total > 1 && (
                <Text style={s.redeemRemaining}>
                  {voucher.remaining} of {voucher.total} sessions remaining
                </Text>
              )}
              {/* Only the coach can redeem it, so showing the code is safe —
                  worth saying, because a code on screen invites the question. */}
              <Text style={s.redeemNote}>Only your coach can redeem this.</Text>
            </View>
          ) : (
            <View style={[s.redeemBlock, s.redeemDone]}>
              <Ionicons name="checkmark-circle" size={30} color={colors.success} />
              <Text style={s.redeemDoneText}>Redeemed</Text>
              <Text style={s.redeemNote}>This voucher has been used.</Text>
            </View>
          )
        )}

        {item.type !== 'coach_voucher' && item.actionType !== 'none' && (
          <TouchableOpacity
            style={[
              s.primaryBtn,
              { backgroundColor: accent.color },
              item.actionType === 'redemption' && s.primaryBtnDisabled,
            ]}
            activeOpacity={0.85}
            disabled={item.actionType === 'redemption'}
            onPress={handleAction}
          >
            <Text style={[s.primaryBtnText, { color: item.actionType === 'redemption' ? L.textSub : btnTextColor }]}>
              {item.actionType === 'redemption' ? 'Coming Soon' : item.actionLabel ?? 'Continue'}
            </Text>
            {item.actionType === 'external_url' && (
              <Ionicons name="open-outline" size={15} color={btnTextColor} />
            )}
          </TouchableOpacity>
        )}

        <View style={s.section}>
          <Text style={s.sectionTitle}>ACTIVITY</Text>
          <View style={s.activityCard}>
            {activity.length === 0
              ? <WalletActivityEmpty />
              : activity.map((entry, idx) => (
                <WalletActivityRow key={entry.id} entry={entry} last={idx === activity.length - 1} />
              ))}
          </View>
        </View>

        {!!addedText && <Text style={s.addedText}>ADDED TO WALLET{'\n'}{addedText}</Text>}
      </ScrollView>
    </View>

    {item.actionUrl && (
      <WalletRedeemSheet
        visible={showRedeemSheet}
        item={item}
        accent={accent}
        onClose={() => setShowRedeemSheet(false)}
        onConfirm={() => {
          setShowRedeemSheet(false);
          Linking.openURL(item.actionUrl!).catch(() => {});
        }}
      />
    )}
    </>
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
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  rowLast: { borderBottomWidth: 0 },
  label: { color: L.textSub, fontSize: 12, fontWeight: '600', width: 120, paddingTop: 1 },
  value: { color: L.text, fontSize: 13, fontWeight: '600', flex: 1 },
});

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: L.bg,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 12, fontWeight: '900', letterSpacing: 0.8 },
  scroll: { paddingHorizontal: 16, paddingTop: 16 },

  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },

  hero: { width: '100%', height: 160, borderRadius: radius.card, marginBottom: 12 },
  detailsCard: { backgroundColor: L.bg, borderWidth: 1, borderColor: L.border, borderRadius: radius.card },

  title: { color: L.navy, fontSize: 20, fontWeight: '900', marginBottom: 2 },
  subtitle: { color: L.textSub, fontSize: 13, fontWeight: '600', marginBottom: 16 },

  infoCard: { borderRadius: radius.card, padding: 16, marginBottom: 16 },
  infoRow: { flexDirection: 'row', alignItems: 'center' },
  valueAmount: { fontSize: 22, fontWeight: '900' },
  valueStatus: { color: L.textSub, fontSize: 12, fontWeight: '600', marginTop: 2 },
  valueSub: { color: L.textSub, fontSize: 12, fontWeight: '600', marginTop: 8 },
  infoDivider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(10,18,40,0.12)', marginVertical: 12 },
  expiresText: { color: L.textSub, fontSize: 12, fontWeight: '600' },

  section: { marginBottom: 20 },
  sectionTitle: { color: L.navy, fontSize: 11, fontWeight: '900', letterSpacing: 0.8, marginBottom: 10 },
  description: { color: L.text, fontSize: 14, lineHeight: 21 },

  activityCard: {
    backgroundColor: L.bg, borderWidth: 1, borderColor: L.border,
    borderRadius: radius.card, paddingHorizontal: 14,
  },

  redeemBlock: {
    alignItems: 'center', gap: 8, paddingVertical: 20, paddingHorizontal: 16,
    backgroundColor: colors.bg, borderRadius: radius.card,
    borderWidth: 1, borderColor: colors.border, marginTop: 4,
  },
  redeemDone:      { paddingVertical: 26 },
  redeemDoneText:  { color: colors.navy, fontSize: 17, fontWeight: '900' },
  redeemTitle:     { color: colors.navy, fontSize: 15, fontWeight: '800' },
  qrFrame:         { padding: 12, backgroundColor: '#FFFFFF', borderRadius: 12, marginVertical: 4 },
  redeemCodeLabel: { color: colors.textSub, fontSize: 12, marginTop: 2 },
  redeemCode: {
    color: colors.navy, fontSize: 26, fontWeight: '900',
    letterSpacing: 4, fontVariant: ['tabular-nums'],
  },
  redeemRemaining: { color: colors.text, fontSize: 13, fontWeight: '700' },
  redeemNote:      { color: colors.textSub, fontSize: 11, textAlign: 'center' },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: radius.button, paddingVertical: 14, marginBottom: 20,
  },
  primaryBtnDisabled: { backgroundColor: L.border },
  primaryBtnText: { fontSize: 14, fontWeight: '800' },

  addedText: {
    color: L.textSub, fontSize: 11, fontWeight: '600', textAlign: 'center',
    lineHeight: 16, marginTop: -8,
  },

  errorState: { alignItems: 'center', paddingTop: 80, gap: 12, paddingHorizontal: 32 },
  errorTitle: { color: L.navy, fontSize: 16, fontWeight: '700', textAlign: 'center' },
});
