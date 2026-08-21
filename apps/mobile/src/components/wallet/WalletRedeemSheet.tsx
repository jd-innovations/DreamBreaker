import React from 'react';
import { View, Text, StyleSheet, Modal, Pressable, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '@/theme';
import { Avatar } from '@/components/Avatar';
import type { WalletItem } from '@/lib/walletTypes';
import type { WalletTypeAccent } from '@/lib/walletItemAccent';

const L = {
  bg:      colors.bg,
  navy:    colors.navy,
  text:    colors.text,
  textSub: colors.textSub,
  border:  colors.border,
};

function partnerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

type Step = { icon: keyof typeof Ionicons.glyphMap; title: string; sub: string };

function getRedeemCopy(item: WalletItem, partnerName: string): { heading: string; body: string; steps: Step[] } {
  const hasValue = item.valueAmount != null || item.valueLabel;
  const valueText = item.valueLabel
    ?? (item.valueAmount != null ? `${item.currencyCode === 'USD' ? '$' : item.currencyCode + ' '}${item.valueAmount.toFixed(2)}` : '');

  if (item.type === 'credit' && hasValue) {
    return {
      heading: 'Ready to Shop!',
      body: `Your ${valueText} will be automatically applied at ${partnerName}.`,
      steps: [
        { icon: 'shield-checkmark-outline', title: `You'll be taken to ${partnerName}`, sub: "We'll securely pass your credit" },
        { icon: 'cart-outline',              title: 'Shop and checkout',                sub: `Your ${valueText} will be applied` },
        { icon: 'star-outline',              title: 'Enjoy your gear!',                 sub: 'Thanks for being part of Pickleball App' },
      ],
    };
  }
  if (item.type === 'offer') {
    return {
      heading: 'Ready to Redeem!',
      body: `You're heading to ${partnerName} to use this offer.`,
      steps: [
        { icon: 'shield-checkmark-outline', title: `You'll be taken to ${partnerName}`, sub: 'A secure browser window will open' },
        { icon: 'pricetag-outline',         title: 'Complete your purchase',            sub: 'Your discount will be applied at checkout' },
        { icon: 'star-outline',             title: 'Enjoy!',                            sub: 'Thanks for being part of Pickleball App' },
      ],
    };
  }
  return {
    heading: 'Ready to Continue!',
    body: `You're heading to ${partnerName} to finish this.`,
    steps: [
      { icon: 'shield-checkmark-outline', title: `You'll be taken to ${partnerName}`, sub: 'A secure browser window will open' },
      { icon: 'checkmark-circle-outline', title: 'Complete the next steps',           sub: 'Follow their instructions to finish' },
      { icon: 'star-outline',             title: 'Enjoy!',                           sub: 'Thanks for being part of Pickleball App' },
    ],
  };
}

export function WalletRedeemSheet({
  visible, item, accent, onClose, onConfirm,
}: {
  visible: boolean;
  item: WalletItem;
  accent: WalletTypeAccent;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const partnerName = item.partner?.name ?? item.title;
  const { heading, body, steps } = getRedeemCopy(item, partnerName);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.card} onPress={() => {}}>
          <TouchableOpacity style={s.closeBtn} onPress={onClose} activeOpacity={0.7}>
            <Ionicons name="close" size={20} color={L.textSub} />
          </TouchableOpacity>

          <View style={s.iconWrap}>
            <Avatar uri={item.partner?.logoUrl} initials={partnerInitials(partnerName)} bg={accent.color} size={64} />
            <View style={[s.badge, { backgroundColor: accent.color }]}>
              <Ionicons name="checkmark" size={13} color="#FFFFFF" />
            </View>
          </View>

          <Text style={s.heading}>{heading}</Text>
          <Text style={s.body}>{body}</Text>

          <View style={s.steps}>
            {steps.map((step, idx) => (
              <View key={idx} style={s.stepRow}>
                <Ionicons name={step.icon} size={18} color={accent.color} />
                <View style={{ flex: 1 }}>
                  <Text style={s.stepTitle}>{step.title}</Text>
                  <Text style={s.stepSub}>{step.sub}</Text>
                </View>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={[s.confirmBtn, { backgroundColor: accent.color }]}
            activeOpacity={0.85}
            onPress={onConfirm}
          >
            <Text style={[s.confirmText, { color: accent.color === colors.gold ? L.navy : '#FFFFFF' }]}>
              Continue to {partnerName}
            </Text>
            <Ionicons name="open-outline" size={15} color={accent.color === colors.gold ? L.navy : '#FFFFFF'} />
          </TouchableOpacity>

          <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
            <Text style={s.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(10,18,40,0.55)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24,
  },
  card: {
    width: '100%', backgroundColor: L.bg,
    borderRadius: 20, padding: 24, alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.18,
    shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  closeBtn: { position: 'absolute', top: 14, right: 14, padding: 6 },

  iconWrap: { marginBottom: 14 },
  badge: {
    position: 'absolute', bottom: -2, right: -2,
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: L.bg,
  },

  heading: { fontSize: 20, fontWeight: '900', color: L.navy, textAlign: 'center', marginBottom: 8 },
  body: { fontSize: 14, color: L.textSub, lineHeight: 20, textAlign: 'center', marginBottom: 20 },

  steps: { width: '100%', gap: 16, marginBottom: 20 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  stepTitle: { fontSize: 13, fontWeight: '700', color: L.navy },
  stepSub: { fontSize: 12, color: L.textSub, marginTop: 2 },

  confirmBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    width: '100%', borderRadius: radius.button, paddingVertical: 14, marginBottom: 14,
  },
  confirmText: { fontSize: 14, fontWeight: '800' },
  cancelText: { color: L.textSub, fontSize: 13, fontWeight: '700' },
});
