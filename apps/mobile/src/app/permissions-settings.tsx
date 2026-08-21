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

// Theme-backed alias â€” brand values resolve from @/theme.
// blue accent is the device-permissions visual language (intentional, documented).
const L = {
  bg:         colors.bg,
  page:       colors.page,
  navy:       colors.navy,
  blue:       '#007AFF',
  blueBg:     'rgba(0,122,255,0.09)',
  blueBorder: 'rgba(0,122,255,0.18)',
  text:       colors.text,
  textSub:    colors.textSub,
  textMuted:  colors.textSub,
  border:     colors.border,
  div:        colors.border,
};

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function SectionHeader({ label }: { label: string }) {
  return <Text style={s.sectionHeader}>{label}</Text>;
}

function Group({ children }: { children: React.ReactNode }) {
  return <View style={s.group}>{children}</View>;
}

function Div() {
  return <View style={s.div} />;
}

function BlueCircle({ name }: { name: string }) {
  return (
    <View style={s.blueCircle}>
      <Ionicons name={name as never} size={20} color={L.blue} />
    </View>
  );
}

// â”€â”€â”€ Permission row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type StatusType = 'While Using App' | 'Enabled' | 'Not Connected';

function PermRow({
  icon, label, sub, status, last,
}: {
  icon: string; label: string; sub: string;
  status: StatusType; last?: boolean;
}) {
  const statusColor =
    status === 'Not Connected' ? L.textMuted : L.blue;

  return (
    <>
      <TouchableOpacity
        style={s.row}
        activeOpacity={0.7}
        onPress={() => Linking.openSettings()}
      >
        <BlueCircle name={icon} />
        <View style={s.rowCenter}>
          <Text style={s.rowLabel}>{label}</Text>
          <Text style={s.rowSub}>{sub}</Text>
        </View>
        <Text style={[s.statusText, { color: statusColor }]}>{status}</Text>
        <Ionicons name="chevron-forward" size={16} color={L.textMuted} style={{ marginLeft: 4 }} />
      </TouchableOpacity>
      {!last && <Div />}
    </>
  );
}

// â”€â”€â”€ Main screen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function PermissionsSettingsScreen() {
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
        <Text style={s.headerTitle}>Permissions</Text>
        <View style={{ width: 80 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
      >
        <Text style={s.intro}>Manage device access used by Pickleball App.</Text>

        {/* â”€â”€ Device Access â”€â”€ */}
        <SectionHeader label="DEVICE ACCESS" />
        <Group>
          <PermRow
            icon="navigate-outline"
            label="Location Services"
            sub="Used for tournaments, community play, partner matching, and marketplace."
            status="While Using App"
          />
          <PermRow
            icon="camera-outline"
            label="Camera"
            sub="Take photos for your profile and listings."
            status="Enabled"
          />
          <PermRow
            icon="image-outline"
            label="Photo Library"
            sub="Upload profile and marketplace images."
            status="Enabled"
          />
          <PermRow
            icon="notifications-outline"
            label="Notifications"
            sub="Receive tournament updates, invitations, and important alerts."
            status="Enabled"
          />
          <PermRow
            icon="people-outline"
            label="Contacts"
            sub="Invite friends and discover players."
            status="Not Connected"
            last
          />
        </Group>

        {/* â”€â”€ Info note â”€â”€ */}
        <View style={s.infoRow}>
          <Ionicons name="lock-closed-outline" size={14} color={L.textMuted} style={{ marginTop: 2 }} />
          <Text style={s.infoText}>
            Permissions help Pickleball App provide the best experience. You can change these anytime.
          </Text>
        </View>

        {/* â”€â”€ Open Device Settings â”€â”€ */}
        <Group>
          <TouchableOpacity
            style={s.row}
            activeOpacity={0.7}
            onPress={() => Linking.openSettings()}
          >
            <BlueCircle name="settings-outline" />
            <View style={s.rowCenter}>
              <Text style={[s.rowLabel, { color: L.blue }]}>Open Device Settings</Text>
              <Text style={s.rowSub}>Manage all permissions in iOS Settings.</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={L.textMuted} />
          </TouchableOpacity>
        </Group>
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

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, gap: 14,
  },
  rowCenter: { flex: 1 },
  rowLabel:  { color: L.navy, fontSize: 15, fontWeight: '500', marginBottom: 3 },
  rowSub:    { color: L.textSub, fontSize: 12, fontWeight: '400', lineHeight: 18 },

  blueCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: L.blueBg, borderWidth: 1, borderColor: L.blueBorder,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },

  statusText: { fontSize: 14, fontWeight: '500', flexShrink: 0 },

  infoRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    gap: 8, marginVertical: 20, paddingHorizontal: 4,
  },
  infoText: {
    flex: 1, color: L.textMuted, fontSize: 13,
    fontWeight: '400', lineHeight: 19,
  },
});
