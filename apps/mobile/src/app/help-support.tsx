import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { goBack } from '@/lib/navigation';
import { StatusBar } from 'expo-status-bar';

import { colors } from '@/theme';
import {
  SUPPORT_EMAIL,
  SUPPORT_MAILTO,
  openDeleteAccountInfo,
  openHelpCenter,
  openPrivacy,
  openTerms,
} from '@/lib/legal';

// Theme-backed alias â€” brand values resolve from @/theme.
const L = {
  bg:         colors.bg,
  page:       colors.page,
  navy:       colors.navy,
  blue:       '#007AFF',
  gold:       colors.gold,
  goldBg:     colors.goldBg,
  goldBorder: colors.goldBorder,
  blueIconBg: 'rgba(0,122,255,0.06)',
  text:       colors.text,
  textSub:    colors.textSub,
  textMuted:  colors.textSub,
  border:     colors.border,
  div:        colors.border,
};

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function CardTitle({ label }: { label: string }) {
  return <Text style={s.cardTitle}>{label}</Text>;
}

function Card({ children }: { children: React.ReactNode }) {
  return <View style={s.card}>{children}</View>;
}

function Div() {
  return <View style={s.div} />;
}

function IconCircle({ name }: { name: string }) {
  return (
    <View style={s.iconCircle}>
      <Ionicons name={name as never} size={20} color={L.gold} />
    </View>
  );
}

// â”€â”€â”€ Support row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function SupportRow({
  icon, label, sub, trailing = 'chevron', onPress, last,
}: {
  icon: string; label: string; sub: string;
  trailing?: 'chevron' | 'external'; onPress?: () => void; last?: boolean;
}) {
  return (
    <>
      <TouchableOpacity style={s.row} activeOpacity={0.7} onPress={onPress}>
        <IconCircle name={icon} />
        <View style={s.rowCenter}>
          <Text style={s.rowLabel}>{label}</Text>
          <Text style={s.rowSub}>{sub}</Text>
        </View>
        <Ionicons
          name={trailing === 'external' ? 'open-outline' : 'chevron-forward'}
          size={trailing === 'external' ? 18 : 16}
          color={L.textMuted}
        />
      </TouchableOpacity>
      {!last && <Div />}
    </>
  );
}

// â”€â”€â”€ Main screen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function HelpSupportScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* â”€â”€ Header â”€â”€ */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={L.blue} />
          <Text style={s.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Contact</Text>
        <View style={{ width: 80 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
      >
        {/* â”€â”€ Hero â”€â”€ */}
        <View style={s.hero}>
          <View style={s.heroIconWrap}>
            <Ionicons name="chatbubble-ellipses-outline" size={44} color={L.navy} />
            <View style={s.heroMailBadge}>
              <Ionicons name="mail" size={16} color={L.gold} />
            </View>
          </View>
          <Text style={s.heroTitle}>We're here to help</Text>
          <Text style={s.heroSub}>
            Have a question, need help, or want to share feedback?{'\n'}
            Our team typically responds within 24 hours.
          </Text>
        </View>

        {/* â”€â”€ Get in Touch â”€â”€ */}
        <Card>
          <CardTitle label="Get in touch" />
          <SupportRow
            icon="mail-outline"
            label="Email Support"
            sub={SUPPORT_EMAIL}
            onPress={() => Linking.openURL(SUPPORT_MAILTO)}
          />
          <SupportRow
            icon="chatbubble-outline"
            label="Live Chat"
            sub="Start or continue a support ticket"
            onPress={() => router.push('/support/new-ticket' as never)}
          />
          <SupportRow
            icon="ticket-outline"
            label="My Tickets"
            sub="View your open and past support tickets"
            onPress={() => router.push('/support' as never)}
          />
          <SupportRow
            icon="open-outline"
            label="Help Center"
            sub="Browse articles and guides"
            trailing="external"
            onPress={openHelpCenter}
            last
          />
        </Card>

        {/* â”€â”€ Common Topics â”€â”€ */}
        <Card>
          <CardTitle label="Common topics" />
          <SupportRow
            icon="person-outline"
            label="Account & Profile"
            sub="Login, profile setup, and account issues"
          />
          <SupportRow
            icon="trophy-outline"
            label="Tournaments"
            sub="Registration, results, and tournament help"
          />
          <SupportRow
            icon="people-outline"
            label="Partners & Matches"
            sub="Finding partners, matches, and play issues"
            last
          />
          <Div />
          <TouchableOpacity style={s.viewAllRow} activeOpacity={0.7}>
            <Text style={s.viewAllText}>View all help topics</Text>
            <Ionicons name="chevron-forward" size={15} color={L.gold} />
          </TouchableOpacity>
        </Card>

        {/* â”€â”€ Send Feedback â”€â”€ */}
        <Card>
          <CardTitle label="Send us feedback" />
          <SupportRow
            icon="create-outline"
            label="Share Feedback"
            sub="Help us improve Pickleball App"
            onPress={() => router.push({ pathname: '/support/new-ticket', params: { category: 'feedback' } } as never)}
            last
          />
        </Card>

        {/* â”€â”€ Policies â”€â”€ */}
        <Card>
          <CardTitle label="Policies" />
          <SupportRow
            icon="document-text-outline"
            label="Terms of Service"
            sub="The agreement that governs your use of Pickleball App"
            trailing="external"
            onPress={openTerms}
          />
          <SupportRow
            icon="shield-checkmark-outline"
            label="Privacy Policy"
            sub="What we collect, why, and how to get rid of it"
            trailing="external"
            onPress={openPrivacy}
          />
          <SupportRow
            icon="trash-outline"
            label="Delete Your Account"
            sub="How deletion works and what we keep"
            trailing="external"
            onPress={openDeleteAccountInfo}
            last
          />
        </Card>

        {/* â”€â”€ Footer â”€â”€ */}
        <View style={s.footer}>
          <Ionicons name="lock-closed-outline" size={14} color={L.textMuted} />
          <Text style={s.footerText}>
            We respect your privacy and will never share your information.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

// â”€â”€â”€ Styles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: L.bg, borderBottomWidth: 1, borderBottomColor: L.border,
    paddingHorizontal: 8, paddingVertical: 12,
  },
  backBtn:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, minWidth: 80 },
  backText:    { color: L.blue, fontSize: 17, fontWeight: '400' },
  headerTitle: { color: L.navy, fontSize: 17, fontWeight: '700' },

  scroll: { padding: 20 },

  // â”€â”€ Hero â”€â”€
  hero: { alignItems: 'center', marginTop: 8, marginBottom: 28 },
  heroIconWrap: {
    width: 92, height: 92, borderRadius: 46,
    backgroundColor: L.blueIconBg,
    alignItems: 'center', justifyContent: 'center', marginBottom: 18,
    position: 'relative',
  },
  heroMailBadge: {
    position: 'absolute', bottom: 22, right: 22,
  },
  heroTitle: {
    color: L.navy, fontSize: 26, fontWeight: '900',
    marginBottom: 10, letterSpacing: 0.2,
  },
  heroSub: {
    color: L.textMuted, fontSize: 15, fontWeight: '400',
    textAlign: 'center', lineHeight: 22,
  },

  // â”€â”€ Card â”€â”€
  card: {
    backgroundColor: L.bg, borderRadius: 14,
    borderWidth: 1, borderColor: L.border,
    paddingTop: 16, paddingBottom: 6, marginBottom: 16,
  },
  cardTitle: {
    color: L.navy, fontSize: 17, fontWeight: '800',
    paddingHorizontal: 16, marginBottom: 6,
  },

  div: { height: StyleSheet.hairlineWidth, backgroundColor: L.div, marginLeft: 68 },

  // â”€â”€ Row â”€â”€
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 13, gap: 14,
  },
  rowCenter: { flex: 1 },
  rowLabel:  { color: L.navy, fontSize: 16, fontWeight: '700', marginBottom: 2 },
  rowSub:    { color: L.textSub, fontSize: 13, fontWeight: '400' },

  iconCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: L.goldBg, borderWidth: 1, borderColor: L.goldBorder,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },

  // View all
  viewAllRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, gap: 6,
  },
  viewAllText: { color: L.gold, fontSize: 15, fontWeight: '700' },

  // Footer
  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginTop: 12, paddingHorizontal: 16,
  },
  footerText: {
    color: L.textMuted, fontSize: 13, fontWeight: '400',
    textAlign: 'center', lineHeight: 19,
  },
});
