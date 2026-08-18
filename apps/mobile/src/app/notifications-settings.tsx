import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { goBack } from '@/lib/navigation';
import { StatusBar } from 'expo-status-bar';
import { colors } from '@/theme';
import { useSession } from '@/hooks/useSession';
import { registerPushTokenForUser, type PushRegistrationResult } from '@/lib/pushNotifications';
import { haptics } from '@/lib/haptics';

// Theme-backed alias â€” all brand values resolve from @/theme.
// `blue` is the iOS system color retained for back actions (not a brand token).
const L = {
  bg:         colors.bg,
  page:       colors.page,
  navy:       colors.navy,
  blue:       '#007AFF',
  gold:       colors.gold,
  goldBg:     colors.goldBg,
  goldBorder: colors.goldBorder,
  text:       colors.text,
  textSub:    colors.textSub,
  textMuted:  colors.textSub,
  border:     colors.border,
  div:        colors.border,
  green:      colors.success,
};

// â”€â”€â”€ Shared helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function SectionHeader({ label }: { label: string }) {
  return <Text style={s.sectionHeader}>{label}</Text>;
}

function Group({ children }: { children: React.ReactNode }) {
  return <View style={s.group}>{children}</View>;
}

function Div() {
  return <View style={s.div} />;
}

function IconCircle({ name }: { name: string }) {
  return (
    <View style={s.iconCircle}>
      <Ionicons name={name as never} size={18} color={L.gold} />
    </View>
  );
}

// â”€â”€â”€ Category nav row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function CategoryRow({
  icon, label, sub, last,
}: {
  icon: string; label: string; sub: string; last?: boolean;
}) {
  return (
    <>
      <TouchableOpacity style={s.row} activeOpacity={0.7}>
        <IconCircle name={icon} />
        <View style={s.rowCenter}>
          <Text style={s.rowLabel}>{label}</Text>
          <Text style={s.rowSub}>{sub}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={L.textMuted} />
      </TouchableOpacity>
      {!last && <Div />}
    </>
  );
}

// â”€â”€â”€ Toggle row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ToggleRow({
  icon, label, sub, value, onChange, last,
}: {
  icon: string; label: string; sub: string;
  value: boolean; onChange: (v: boolean) => void; last?: boolean;
}) {
  return (
    <>
      <View style={s.row}>
        <IconCircle name={icon} />
        <View style={s.rowCenter}>
          <Text style={s.rowLabel}>{label}</Text>
          <Text style={s.rowSub}>{sub}</Text>
        </View>
        <Switch
          value={value}
          onValueChange={onChange}
          trackColor={{ false: '#D1D1D6', true: L.green }}
          thumbColor="#FFFFFF"
          ios_backgroundColor="#D1D1D6"
        />
      </View>
      {!last && <Div />}
    </>
  );
}

// â”€â”€â”€ Time picker row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function TimeRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <>
      <TouchableOpacity style={s.row} activeOpacity={0.7}>
        <Text style={s.timeLabel}>{label}</Text>
        <View style={s.timeRight}>
          <Text style={s.timeValue}>{value}</Text>
          <Ionicons name="chevron-forward" size={16} color={L.textMuted} />
        </View>
      </TouchableOpacity>
      {!last && <Div />}
    </>
  );
}

// â”€â”€â”€ Main screen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function NotificationsSettingsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();

  // Delivery methods
  const [pushNotifs,  setPushNotifs]  = useState(false);
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [smsNotifs,   setSmsNotifs]   = useState(false);
  const [registeringPush, setRegisteringPush] = useState(false);
  const [pushResult, setPushResult] = useState<PushRegistrationResult | null>(null);

  // Quiet hours
  const [quietHours, setQuietHours] = useState(true);

  // Badge counts
  const [appBadge,    setAppBadge]    = useState(true);
  const [eventsBadge, setEventsBadge] = useState(true);
  const [chatsBadge,  setChatsBadge]  = useState(true);

  async function handlePushToggle(next: boolean) {
    if (!next) {
      setPushNotifs(false);
      setPushResult(null);
      return;
    }

    if (!user?.id) {
      setPushNotifs(false);
      setPushResult({
        ok: false,
        status: 'failed',
        reason: 'Sign in before enabling push notifications on this device.',
      });
      return;
    }

    setRegisteringPush(true);
    const result = await registerPushTokenForUser(user.id, { requestPermission: true });
    if (result.ok) haptics.success();
    setPushResult(result);
    setPushNotifs(result.ok);
    setRegisteringPush(false);
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* â”€â”€ Header â”€â”€ */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={L.blue} />
          <Text style={s.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Notifications</Text>
        <View style={{ width: 80 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
      >
        {/* Subtitle */}
        <Text style={s.intro}>{"Choose what you'd like to be notified about."}</Text>

        {/* â”€â”€ Notification Categories â”€â”€ */}
        <SectionHeader label="NOTIFICATION CATEGORIES" />
        <Group>
          <CategoryRow
            icon="trophy-outline"
            label="Tournament Activity"
            sub="Registration, updates, results, and more"
          />
          <CategoryRow
            icon="people-outline"
            label="Community Play"
            sub="Invites, reminders, and session updates"
          />
          <CategoryRow
            icon="person-add-outline"
            label="Partner Finder"
            sub="Requests, matches, and messages"
          />
          <CategoryRow
            icon="pricetag-outline"
            label="Marketplace"
            sub="Messages, listings, and price alerts"
          />
          <CategoryRow
            icon="heart-circle-outline"
            label="Social"
            sub="Teams, groups, and friend activity"
            last
          />
        </Group>
        <Text style={s.groupNote}>Manage notification types for each category.</Text>

        {/* â”€â”€ Delivery Methods â”€â”€ */}
        <SectionHeader label="DELIVERY METHODS" />
        <Group>
          <ToggleRow
            icon="phone-portrait-outline"
            label={registeringPush ? 'Enabling Push...' : 'Push Notifications'}
            sub="Receive notifications on this device"
            value={pushNotifs}
            onChange={(next) => { void handlePushToggle(next); }}
          />
          <ToggleRow
            icon="mail-outline"
            label="Email Notifications"
            sub="Receive notifications via email"
            value={emailNotifs}
            onChange={setEmailNotifs}
          />
          <ToggleRow
            icon="chatbubble-outline"
            label="SMS Notifications"
            sub="Receive important alerts via text message"
            value={smsNotifs}
            onChange={setSmsNotifs}
            last
          />
        </Group>
        {pushResult && (
          <Text style={s.groupNote}>
            {pushResult.ok ? 'Push notifications are enabled on this device.' : pushResult.reason}
          </Text>
        )}

        {/* â”€â”€ Quiet Hours â”€â”€ */}
        <SectionHeader label="QUIET HOURS" />
        <Group>
          <ToggleRow
            icon="moon-outline"
            label="Quiet Hours"
            sub="Silence non-urgent notifications during these hours"
            value={quietHours}
            onChange={setQuietHours}
          />
          <TimeRow label="Start" value="10:00 PM" />
          <TimeRow label="End"   value="7:00 AM"  last />
        </Group>

        {/* â”€â”€ Badge Counts â”€â”€ */}
        <SectionHeader label="BADGE COUNTS" />
        <Group>
          <ToggleRow
            icon="notifications-outline"
            label="Show App Badge Count"
            sub="Display unread count on the app icon"
            value={appBadge}
            onChange={setAppBadge}
          />
          <ToggleRow
            icon="calendar-outline"
            label="Show Events Badge"
            sub="Display badge for upcoming events"
            value={eventsBadge}
            onChange={setEventsBadge}
          />
          <ToggleRow
            icon="chatbubbles-outline"
            label="Show Chats Badge"
            sub="Display unread message count"
            value={chatsBadge}
            onChange={setChatsBadge}
            last
          />
        </Group>

        {/* â”€â”€ Footer â”€â”€ */}
        <View style={s.footer}>
          <Ionicons name="lock-closed-outline" size={14} color={L.textMuted} />
          <View>
            <Text style={s.footerLine}>Notifications are automatically saved.</Text>
            <Text style={s.footerLine}>You can change these preferences at any time.</Text>
          </View>
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
  backBtn:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, minWidth: 80 },
  backText:   { color: L.blue, fontSize: 17, fontWeight: '400' },
  headerTitle:{ color: L.navy, fontSize: 17, fontWeight: '700' },

  scroll: { padding: 20 },

  intro: {
    color: L.textMuted, fontSize: 14, fontWeight: '400',
    textAlign: 'center', lineHeight: 20, marginBottom: 4,
  },

  sectionHeader: {
    color: L.textMuted, fontSize: 12, fontWeight: '600',
    letterSpacing: 0.6, textTransform: 'uppercase',
    marginBottom: 8, marginTop: 24, paddingHorizontal: 4,
  },

  group: {
    backgroundColor: L.bg, borderRadius: 12,
    borderWidth: 1, borderColor: L.border, overflow: 'hidden',
  },

  div: { height: StyleSheet.hairlineWidth, backgroundColor: L.div, marginLeft: 68 },

  groupNote: {
    color: L.textMuted, fontSize: 12, fontWeight: '400',
    paddingHorizontal: 4, marginTop: 8,
  },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 13, gap: 12,
  },
  rowCenter: { flex: 1 },
  rowLabel:  { color: L.navy, fontSize: 15, fontWeight: '500', marginBottom: 2 },
  rowSub:    { color: L.textMuted, fontSize: 12, fontWeight: '400' },

  iconCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: L.goldBg, borderWidth: 1, borderColor: L.goldBorder,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },

  // Time rows
  timeLabel: { color: L.navy, fontSize: 15, fontWeight: '500', flex: 1, paddingLeft: 4 },
  timeRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timeValue: { color: L.gold, fontSize: 15, fontWeight: '600' },

  footer: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center',
    gap: 8, marginTop: 28, paddingHorizontal: 16,
  },
  footerLine: {
    color: L.textMuted, fontSize: 13, fontWeight: '400',
    textAlign: 'center', lineHeight: 20,
  },
});
