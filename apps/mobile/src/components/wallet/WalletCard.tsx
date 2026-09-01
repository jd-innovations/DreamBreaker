import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { colors, radius } from '@/theme';
import { Avatar } from '@/components/Avatar';
import { StatusChip } from '@/components/StatusChip';
import { WalletRedeemSheet } from '@/components/wallet/WalletRedeemSheet';
import { getWalletItemStatusInfo } from '@/lib/walletItemStatus';
import { getWalletTypeAccent } from '@/lib/walletItemAccent';
import type { WalletItem } from '@/lib/walletTypes';
import { DEFAULT_LESSON_COVER } from '@/lib/coach/defaultLessonCover';

const L = {
  bg:        colors.bg,
  page:      colors.page,
  navy:      colors.navy,
  gold:      colors.gold,
  goldBg:    colors.goldBg,
  text:      colors.text,
  textSub:   colors.textSub,
  border:    colors.border,
  success:   colors.success,
  successBg: colors.successBg,
  danger:    colors.danger,
  dangerBg:  colors.dangerBg,
};

function partnerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function formatValue(item: WalletItem): string | null {
  if (item.valueLabel) return item.valueLabel;
  if (item.valueAmount == null) return null;
  const amount = `${item.currencyCode === 'USD' ? '$' : item.currencyCode + ' '}${item.valueAmount.toFixed(2)}`;
  if (item.remainingValueAmount != null && item.remainingValueAmount !== item.valueAmount) {
    return `$${item.remainingValueAmount.toFixed(2)} remaining`;
  }
  return amount;
}

function formatExpiration(expiresAt: string | null): string | null {
  if (!expiresAt) return null;
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return null;
  return `Expires ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

export function WalletCard({ item }: { item: WalletItem }) {
  const statusInfo = getWalletItemStatusInfo(item.status);
  const valueText = formatValue(item);
  const expirationText = formatExpiration(item.expiresAt);
  const partnerName = item.partner?.name ?? item.title;
  const accent = getWalletTypeAccent(item.type);
  const [showRedeemSheet, setShowRedeemSheet] = useState(false);

  function onPress() {
    if (item.actionType === 'view_details') {
      router.push(`/wallet/${item.id}` as never);
    } else if (item.actionType === 'internal_route' && item.actionUrl) {
      router.push(item.actionUrl as never);
    } else if (item.actionType === 'external_url') {
      setShowRedeemSheet(true);
    }
  }

  return (
    <>
    <TouchableOpacity
      style={[c.card, { backgroundColor: accent.bg, borderColor: 'transparent' }]}
      activeOpacity={0.85}
      onPress={() => router.push(`/wallet/${item.id}` as never)}
    >
      {!item.isSeen && <View style={c.unseenDot} />}

      <View style={c.eyebrowRow}>
        <Ionicons name={accent.icon as never} size={13} color={accent.color} />
        <Text style={[c.eyebrow, { color: accent.color }]}>{accent.label.toUpperCase()}</Text>
      </View>

      {item.type === 'coach_voucher' && (
        <Image
          source={item.coachVoucher?.heroImageUrl
            ? { uri: item.coachVoucher.heroImageUrl }
            : DEFAULT_LESSON_COVER}
          style={c.hero}
          resizeMode="cover"
        />
      )}

      <View style={c.header}>
        <Avatar uri={item.partner?.logoUrl} initials={partnerInitials(partnerName)} bg={accent.color} size={40} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={c.title}>{item.title}</Text>
          <Text style={c.subtitle} numberOfLines={1}>{item.subtitle ?? partnerName}</Text>
        </View>
        <StatusChip label={statusInfo.label} variant={statusInfo.variant} />
      </View>

      {(valueText || expirationText) && (
        <View style={c.metaRow}>
          {valueText && <Text style={[c.value, { color: accent.color }]}>{valueText}</Text>}
          {expirationText && <Text style={c.expiration}>{expirationText}</Text>}
        </View>
      )}

      {item.actionType !== 'none' && (
        <TouchableOpacity
          style={[c.cta, item.actionType === 'redemption' && c.ctaDisabled]}
          activeOpacity={0.8}
          disabled={item.actionType === 'redemption'}
          onPress={onPress}
        >
          <Text style={[c.ctaLabel, item.actionType === 'redemption' && c.ctaLabelDisabled]}>
            {item.actionType === 'redemption' ? 'Coming Soon' : item.actionLabel ?? 'View Details'}
          </Text>
          {item.actionType !== 'redemption' && <Ionicons name="chevron-forward" size={14} color={L.navy} />}
        </TouchableOpacity>
      )}
    </TouchableOpacity>

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

const c = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.card, padding: 14, marginBottom: 12, gap: 12,
  },
  unseenDot: {
    position: 'absolute', top: 12, right: 12,
    width: 8, height: 8, borderRadius: 4, backgroundColor: L.gold,
  },
  hero: { width: '100%', height: 100, borderRadius: 10, marginTop: 2 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  title: { color: L.navy, fontSize: 15, fontWeight: '800', marginBottom: 2, lineHeight: 19 },
  subtitle: { color: L.textSub, fontSize: 12 },
  metaRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(10,18,40,0.08)', paddingTop: 10,
  },
  value: { fontSize: 14, fontWeight: '800' },
  expiration: { color: L.textSub, fontSize: 11, fontWeight: '600' },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    backgroundColor: L.bg, borderWidth: 1, borderColor: 'rgba(10,18,40,0.10)',
    borderRadius: radius.button, paddingVertical: 10,
  },
  ctaDisabled: { opacity: 0.5 },
  ctaLabel: { color: L.navy, fontSize: 12, fontWeight: '700' },
  ctaLabelDisabled: { color: L.textSub },
});
