import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';

// Local alias kept minimal; values sourced from the design system.
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
};

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function InviteAcceptedScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ senderName?: string }>();

  const senderFirst = (params.senderName ?? 'John').split(' ')[0];

  function goToMyEvents() {
    router.replace('/(tabs)/games' as never);
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* ── Header with close affordance (returns to My Events) ── */}
      <View style={s.header}>
        <TouchableOpacity style={s.closeBtn} onPress={goToMyEvents} activeOpacity={0.7}>
          <Ionicons name="close" size={24} color={L.navy} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
      >
        {/* ── After accepting label ── */}
        <View style={s.afterRow}>
          <Text style={s.afterLabel}>AFTER ACCEPTING</Text>
        </View>

        <Text style={s.infoText}>
          The invite will appear in My Events and both players will be notified.
        </Text>

        {/* ── Confirmation card ── */}
        <View style={s.card}>
          {/* Calendar icon with checkmark */}
          <View style={s.iconWrap}>
            <View style={s.iconCircle}>
              <Ionicons name="calendar-outline" size={40} color={L.gold} />
              <View style={s.checkBadge}>
                <Ionicons name="checkmark" size={11} color="#FFFFFF" />
              </View>
            </View>
          </View>

          <Text style={s.title}>Invite Accepted!</Text>

          <Text style={s.subtitle}>
            {"You'll see this in My Events.\n"}
            <Text style={s.subtitleBold}>{senderFirst}</Text>
            {' has been notified.'}
          </Text>

          {/* Divider */}
          <View style={s.divider} />

          {/* CTA */}
          <TouchableOpacity style={s.btnPrimary} onPress={goToMyEvents} activeOpacity={0.85}>
            <Text style={s.btnPrimaryText}>View My Events</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.btnDone} onPress={goToMyEvents} activeOpacity={0.7}>
            <Text style={s.btnDoneText}>Done</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },

  header: {
    flexDirection: 'row', justifyContent: 'flex-end',
    paddingHorizontal: 16, paddingVertical: 8, backgroundColor: L.page,
  },
  closeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },

  scroll: {
    paddingHorizontal: 24,
    paddingTop: 16,
  },

  // After accepting label + info
  afterRow: { marginBottom: 10 },
  afterLabel: {
    color: L.gold, fontSize: text.sectionLabel.size, fontWeight: '800', letterSpacing: text.sectionLabel.letterSpacing,
  },
  infoText: {
    color: L.navy, fontSize: text.titleSm.size, fontWeight: '800', lineHeight: 26,
    marginBottom: 28,
  },

  // Card
  card: {
    backgroundColor: L.bg, borderRadius: shape.card,
    borderWidth: 1, borderColor: L.border,
    padding: 28, alignItems: 'center',
  },

  // Icon
  iconWrap: { marginBottom: 20 },
  iconCircle: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: L.goldBg,
    borderWidth: 1.5, borderColor: L.goldBorder,
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  checkBadge: {
    position: 'absolute', bottom: 6, right: 6,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: L.gold,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: L.bg,
  },

  title: {
    color: L.navy, fontSize: text.heroTitle.size, fontWeight: '800',
    letterSpacing: 0.1, marginBottom: 10, textAlign: 'center',
  },
  subtitle: {
    color: L.textSub, fontSize: text.body.size, fontWeight: '500',
    textAlign: 'center', lineHeight: 22, marginBottom: 24,
  },
  subtitleBold: { color: L.navy, fontWeight: '700' },

  divider: {
    width: '100%', height: StyleSheet.hairlineWidth,
    backgroundColor: '#E0E8F5', marginBottom: 22,
  },

  btnPrimary: {
    backgroundColor: L.navy, borderRadius: shape.cta,
    paddingVertical: 15, alignItems: 'center',
    width: '100%', marginBottom: 12,
  },
  btnPrimaryText: { color: '#FFFFFF', fontSize: text.actionLarge.size, fontWeight: '800' },

  btnDone: { paddingVertical: 6, alignItems: 'center', width: '100%' },
  btnDoneText: { color: L.navy, fontSize: text.body.size, fontWeight: '500' },
});
