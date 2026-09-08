import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Image, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { goBack } from '@/lib/navigation';
import { colors } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';

// ─── Design tokens ────────────────────────────────────────────────────────────

// Theme-backed alias — brand values resolve from @/theme.
const L = {
  bg:         colors.bg,
  page:       colors.page,
  navy:       colors.navy,
  gold:       colors.gold,
  goldBg:     colors.goldBg,
  goldBorder: colors.goldBorder,
  textSub:    colors.textSub,
  textMuted:  colors.textSub,
  border:     colors.border,
  div:        colors.border,
  green:      colors.success,
  greenBg:    colors.successBg,
  danger:     colors.danger,
};

type InvStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled';

// ─── Static mock (would be fetched by inviteId in real app) ──────────────────

const MOCK = {
  inviteId:   'r1',
  senderId:   'john-d',
  senderName: 'John D.',
  senderAvatar:
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=240&h=240&fit=crop&q=80',
  senderDupr:     '4.1',
  senderLevel:    'Competitive',
  senderLocation: 'Orlando, FL',
  senderDistance: '35 miles',
  inviteType:  'Community Play',
  date:        'May 24, 2026',
  time:        '10:00 AM',
  location:    'Red Bug Lake Park\nCasselberry, FL',
  skillRange:  '3.5 – 4.5',
  message:     "Hey! I'm heading to the courts Saturday morning. Want to join?",
  msgTs:       'Today, 9:32 AM',
};

// ─── Detail row ───────────────────────────────────────────────────────────────

function DetailRow({
  icon, text, last,
}: {
  icon: string; text: string; last?: boolean;
}) {
  return (
    <>
      <View style={s.detailRow}>
        <Ionicons name={icon as never} size={16} color={L.textSub} style={{ marginTop: 1 }} />
        <Text style={s.detailText}>{text}</Text>
      </View>
      {!last && <View style={s.divider} />}
    </>
  );
}

// ─── Decline confirmation modal ───────────────────────────────────────────────

function DeclineModal({
  visible, onCancel, onConfirm,
}: {
  visible: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={s.modalOverlay}>
        <View style={s.modalCard}>
          <Text style={s.modalTitle}>Decline Invitation?</Text>
          <Text style={s.modalSub}>
            John D. will be notified that you declined.
          </Text>
          <View style={s.modalDivider} />
          <TouchableOpacity style={s.modalBtn} onPress={onCancel} activeOpacity={0.7}>
            <Text style={s.modalBtnCancel}>Cancel</Text>
          </TouchableOpacity>
          <View style={s.modalDivider} />
          <TouchableOpacity style={s.modalBtn} onPress={onConfirm} activeOpacity={0.7}>
            <Text style={s.modalBtnDecline}>Decline</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Status banner (non-pending states) ──────────────────────────────────────

function StatusBanner({ status }: { status: InvStatus }) {
  const cfg = {
    accepted:  { icon: 'checkmark-circle', color: L.gold,      label: 'Invite Accepted'    },
    declined:  { icon: 'close-circle',     color: L.textMuted, label: 'Invitation Declined' },
    expired:   { icon: 'time',             color: L.textMuted, label: 'Invitation Expired'  },
    cancelled: { icon: 'ban',              color: L.textMuted, label: 'Invitation Cancelled'},
  }[status as 'accepted' | 'declined' | 'expired' | 'cancelled'];

  if (!cfg) return null;

  return (
    <View style={[s.statusBanner, { borderColor: cfg.color + '44', backgroundColor: cfg.color + '0D' }]}>
      <Ionicons name={cfg.icon as never} size={18} color={cfg.color} />
      <Text style={[s.statusBannerText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function InviteDetailScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string; status?: string }>();

  const initStatus = (params.status as InvStatus | undefined) ?? 'pending';
  const [status, setStatus]           = useState<InvStatus>(initStatus);
  const [showDeclineModal, setDecline] = useState(false);

  const inv = MOCK;
  const firstName = inv.senderName.split(' ')[0];

  const FOOTER_H = status === 'accepted' ? 80 : 148;

  function handleAccept() {
    setStatus('accepted');
    router.push({
      pathname: '/invite-accepted' as never,
      params: { senderName: inv.senderName },
    } as never);
  }

  function handleDeclineConfirm() {
    setDecline(false);
    setStatus('declined');
    // In real app: update DB, notify sender
    // Return to inbox after short delay
    setTimeout(() => goBack(), 600);
  }

  function handleMessage() {
    router.push('/(tabs)/chat' as never);
  }

  function openSenderProfile() {
    router.push({
      pathname: '/players/[id]' as never,
      params: { id: inv.senderId },
    } as never);
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={L.navy} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Invite Details</Text>
        <View style={s.backBtn} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: FOOTER_H + 24 }]}
      >
        {/* ── Sender profile ── */}
        <TouchableOpacity
          style={s.senderCard}
          onPress={openSenderProfile}
          activeOpacity={0.8}
        >
          <Image source={{ uri: inv.senderAvatar }} style={s.avatar} />
          <View style={s.senderInfo}>
            <Text style={s.senderName}>{inv.senderName}</Text>
            <View style={s.chipRow}>
              <View style={[s.chip, s.chipGold]}>
                <Text style={s.chipGoldText}>DUPR {inv.senderDupr}</Text>
              </View>
              <View style={s.chip}>
                <Text style={s.chipText}>{inv.senderLevel}</Text>
              </View>
            </View>
            <View style={s.locationRow}>
              <Ionicons name="location-outline" size={13} color={L.textMuted} />
              <Text style={s.locationText}>{inv.senderLocation}</Text>
              <Text style={s.locationDot}>•</Text>
              <Text style={s.locationText}>{inv.senderDistance}</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color={L.textMuted} />
        </TouchableOpacity>

        {/* ── Status banner for non-pending ── */}
        {status !== 'pending' && <StatusBanner status={status} />}

        {/* ── Invite details card ── */}
        <View style={s.detailCard}>
          <Text style={s.detailCardTitle}>{inv.inviteType}</Text>
          <View style={s.divider} />
          <DetailRow icon="calendar-outline" text={inv.date} />
          <DetailRow icon="time-outline"     text={inv.time} />
          <DetailRow icon="location-outline" text={inv.location} />
          <DetailRow icon="speedometer-outline" text={`Skill Range: ${inv.skillRange}`} last />
        </View>

        {/* ── Message bubble ── */}
        {inv.message ? (
          <View style={s.msgSection}>
            <Text style={s.msgLabel}>Message from {firstName}</Text>
            <View style={s.msgBubble}>
              <Text style={s.msgText}>{inv.message}</Text>
            </View>
            <Text style={s.msgTs}>{inv.msgTs}</Text>
          </View>
        ) : null}
      </ScrollView>

      {/* ── Action footer ── */}
      <View style={[s.footer, { paddingBottom: insets.bottom + 12 }]}>
        {status === 'pending' ? (
          <>
            <TouchableOpacity style={s.btnAccept} onPress={handleAccept} activeOpacity={0.85}>
              <Ionicons name="checkmark" size={18} color="#FFFFFF" />
              <Text style={s.btnAcceptText}>Accept</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.btnDecline}
              onPress={() => setDecline(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="close" size={18} color={L.navy} />
              <Text style={s.btnDeclineText}>Decline</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.btnMessage} onPress={handleMessage} activeOpacity={0.7}>
              <Ionicons name="chatbubble-outline" size={16} color={L.textSub} />
              <Text style={s.btnMessageText}>Message {firstName}</Text>
            </TouchableOpacity>
          </>
        ) : status === 'accepted' ? (
          <>
            <View style={s.acceptedBanner}>
              <Ionicons name="checkmark-circle" size={20} color={L.gold} />
              <Text style={s.acceptedBannerText}>Invite Accepted</Text>
            </View>
            <TouchableOpacity
              style={s.btnViewEvent}
              onPress={() => router.replace('/(tabs)/games' as never)}
              activeOpacity={0.85}
            >
              <Text style={s.btnViewEventText}>View Event</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </View>

      {/* ── Decline modal ── */}
      <DeclineModal
        visible={showDeclineModal}
        onCancel={() => setDecline(false)}
        onConfirm={handleDeclineConfirm}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8, paddingVertical: 12, backgroundColor: L.bg,
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800' },

  scroll: { paddingHorizontal: 20, paddingTop: 16 },

  // Sender card
  senderCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: L.bg, borderRadius: shape.card,
    borderWidth: 1, borderColor: L.border,
    padding: 16, gap: 14, marginBottom: 12,
  },
  avatar: {
    width: 58, height: 58, borderRadius: 29,
    borderWidth: 2, borderColor: L.goldBorder, flexShrink: 0,
  },
  senderInfo: { flex: 1, gap: 6 },
  senderName: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800' },
  chipRow: { flexDirection: 'row', gap: 6 },
  chip: {
    backgroundColor: '#F0EDE4', borderRadius: shape.pill,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  chipGold: { backgroundColor: L.goldBg, borderWidth: 1, borderColor: L.goldBorder },
  chipText: { color: L.navy, fontSize: text.chipValue.size, fontWeight: '800' },
  chipGoldText: { color: L.gold, fontSize: text.chipValue.size, fontWeight: '800' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationDot: { color: L.textMuted, fontSize: text.caption.size, fontWeight: '500' },
  locationText: { color: L.textMuted, fontSize: text.caption.size, fontWeight: '500' },

  // Status banner
  statusBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: shape.panel, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 10,
    marginBottom: 12,
  },
  statusBannerText: { fontSize: text.rowTitle.size, fontWeight: '700' },

  // Detail card
  detailCard: {
    backgroundColor: L.bg, borderRadius: shape.card,
    borderWidth: 1, borderColor: L.border,
    overflow: 'hidden', marginBottom: 16,
  },
  detailCardTitle: {
    color: L.navy, fontSize: text.actionLarge.size, fontWeight: '800',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: L.div },
  detailRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 16, paddingVertical: 13, gap: 10,
  },
  detailText: { color: L.textSub, fontSize: text.body.size, fontWeight: '500', flex: 1, lineHeight: 20 },

  // Message
  msgSection: { marginBottom: 8 },
  msgLabel: {
    color: L.navy, fontSize: text.rowTitle.size, fontWeight: '700',
    marginBottom: 10,
  },
  msgBubble: {
    backgroundColor: L.bg, borderRadius: shape.panel,
    borderWidth: 1, borderColor: L.border,
    padding: 14,
  },
  msgText: { color: L.textSub, fontSize: text.body.size, fontWeight: '500', lineHeight: 22 },
  msgTs: { color: L.textMuted, fontSize: text.caption.size, fontWeight: '500', textAlign: 'right', marginTop: 6 },

  // Footer
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: L.bg,
    borderTopWidth: 1, borderTopColor: L.border,
    paddingHorizontal: 20, paddingTop: 12, gap: 10,
  },

  btnAccept: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: L.navy, borderRadius: shape.cta, paddingVertical: 15, gap: 8,
  },
  btnAcceptText: { color: '#FFFFFF', fontSize: text.actionLarge.size, fontWeight: '800' },

  btnDecline: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: L.bg, borderRadius: shape.cta, paddingVertical: 13, gap: 8,
    borderWidth: 1.5, borderColor: L.navy,
  },
  btnDeclineText: { color: L.navy, fontSize: text.actionLarge.size, fontWeight: '800' },

  btnMessage: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 4, gap: 6,
  },
  btnMessageText: { color: L.textSub, fontSize: text.body.size, fontWeight: '500' },

  // Accepted state
  acceptedBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 4,
  },
  acceptedBannerText: { color: L.gold, fontSize: text.actionLarge.size, fontWeight: '800' },

  btnViewEvent: {
    backgroundColor: L.navy, borderRadius: shape.cta,
    paddingVertical: 15, alignItems: 'center',
  },
  btnViewEventText: { color: '#FFFFFF', fontSize: text.actionLarge.size, fontWeight: '800' },

  // Decline modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center', alignItems: 'center', padding: 40,
  },
  modalCard: {
    backgroundColor: L.bg, borderRadius: shape.card, width: '100%', overflow: 'hidden',
  },
  modalTitle: {
    color: L.navy, fontSize: text.modalTitle.size, fontWeight: '900',
    textAlign: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 6,
  },
  modalSub: {
    color: L.textMuted, fontSize: text.body.size, fontWeight: '500',
    textAlign: 'center', paddingHorizontal: 20, paddingBottom: 16, lineHeight: 20,
  },
  modalDivider: { height: StyleSheet.hairlineWidth, backgroundColor: L.div },
  modalBtn: { paddingVertical: 16, alignItems: 'center' },
  modalBtnCancel: { color: L.navy, fontSize: text.actionLarge.size, fontWeight: '800' },
  modalBtnDecline: { color: L.danger, fontSize: text.actionLarge.size, fontWeight: '800' },
});
