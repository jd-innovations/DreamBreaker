import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { goBack } from '@/lib/navigation';
import { StatusBar } from 'expo-status-bar';

import { colors } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';

// Theme-backed alias â€” brand values resolve from @/theme.
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
  greenBg:    colors.successBg,
};

// â”€â”€â”€ Shared helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function SectionHeader({ label }: { label: string }) {
  return <Text style={s.sectionHeader}>{label}</Text>;
}

function Group({ children }: { children: React.ReactNode }) {
  return <View style={s.group}>{children}</View>;
}

function Div({ indent = 76 }: { indent?: number }) {
  return <View style={[s.div, { marginLeft: indent }]} />;
}

function IconCircle({ name }: { name: string }) {
  return (
    <View style={s.iconCircle}>
      <Ionicons name={name as never} size={18} color={L.gold} />
    </View>
  );
}

// â”€â”€â”€ Contact info row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ContactRow({
  icon, label, value, verified, last,
}: {
  icon: string; label: string; value: string; verified?: boolean; last?: boolean;
}) {
  return (
    <>
      <TouchableOpacity style={s.row} activeOpacity={0.7}>
        <IconCircle name={icon} />
        <View style={s.rowCenter}>
          <Text style={s.rowLabel}>{label}</Text>
          <Text style={s.rowSub}>{value}</Text>
        </View>
        {verified && (
          <View style={s.verifiedBadge}>
            <Text style={s.verifiedText}>Verified</Text>
            <Ionicons name="checkmark-circle" size={15} color={L.green} />
          </View>
        )}
        <Ionicons name="chevron-forward" size={16} color={L.textMuted} style={{ marginLeft: 6 }} />
      </TouchableOpacity>
      {!last && <Div />}
    </>
  );
}

// â”€â”€â”€ Toggle row with icon â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ToggleRow({
  icon, label, sub, value, onChange, last,
}: {
  icon: string; label: string; sub?: string;
  value: boolean; onChange: (v: boolean) => void; last?: boolean;
}) {
  return (
    <>
      <View style={s.row}>
        <IconCircle name={icon} />
        <View style={s.rowCenter}>
          <Text style={s.rowLabel}>{label}</Text>
          {sub ? <Text style={s.rowSub}>{sub}</Text> : null}
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

// â”€â”€â”€ Notification delivery row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type NotifState = { push: boolean; email: boolean };

function NotifRow({
  icon, label, value, onChange, last,
}: {
  icon: string; label: string;
  value: NotifState; onChange: (v: NotifState) => void; last?: boolean;
}) {
  const toggle = (key: 'push' | 'email') =>
    onChange({ ...value, [key]: !value[key] });

  return (
    <>
      <TouchableOpacity
        style={s.row}
        activeOpacity={0.7}
        onPress={() => onChange({ push: !value.push, email: !value.email })}
      >
        <IconCircle name={icon} />
        <Text style={[s.rowLabel, { flex: 1 }]}>{label}</Text>

        {/* Push column */}
        <View style={s.notifCol}>
          <Text style={s.notifColLabel}>Push</Text>
          <TouchableOpacity onPress={() => toggle('push')} activeOpacity={0.75}>
            <View style={[s.notifCheck, value.push && s.notifCheckOn]}>
              {value.push && <Ionicons name="checkmark" size={11} color="#FFFFFF" />}
            </View>
          </TouchableOpacity>
        </View>

        {/* Email column */}
        <View style={s.notifCol}>
          <Text style={s.notifColLabel}>Email</Text>
          <TouchableOpacity onPress={() => toggle('email')} activeOpacity={0.75}>
            <View style={[s.notifCheck, value.email && s.notifCheckOn]}>
              {value.email && <Ionicons name="checkmark" size={11} color="#FFFFFF" />}
            </View>
          </TouchableOpacity>
        </View>

        <Ionicons name="chevron-forward" size={16} color={L.textMuted} style={{ marginLeft: 8 }} />
      </TouchableOpacity>
      {!last && <Div />}
    </>
  );
}

// â”€â”€â”€ Main screen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function CommunicationSettingsScreen() {
  const insets = useSafeAreaInsets();

  // How players can reach me
  const [directMessages,      setDirectMessages]      = useState(true);
  const [partnerRequests,     setPartnerRequests]     = useState(true);
  const [communityInvites,    setCommunityInvites]    = useState(true);
  const [teamInvites,         setTeamInvites]         = useState(true);
  const [marketplaceMessages, setMarketplaceMessages] = useState(true);

  // Notification delivery
  const [notifPartner,     setNotifPartner]     = useState<NotifState>({ push: true,  email: true  });
  const [notifCommunity,   setNotifCommunity]   = useState<NotifState>({ push: true,  email: false });
  const [notifTournament,  setNotifTournament]  = useState<NotifState>({ push: true,  email: true  });
  const [notifMarketplace, setNotifMarketplace] = useState<NotifState>({ push: true,  email: true  });

  // Profile visibility
  const [showEmail,        setShowEmail]        = useState(false);
  const [showPhone,        setShowPhone]        = useState(false);
  const [contactLookup,   setContactLookup]    = useState(true);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* â”€â”€ Header â”€â”€ */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={L.blue} />
          <Text style={s.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Communication</Text>
        <View style={{ width: 80 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
      >
        {/* Subtitle */}
        <Text style={s.intro}>
          Manage how other players can reach you and how you receive messages.
        </Text>

        {/* â”€â”€ Contact Information â”€â”€ */}
        <SectionHeader label="CONTACT INFORMATION" />
        <Group>
          <ContactRow
            icon="mail-outline"
            label="Email Address"
            value="jesus@email.com"
            verified
          />
          <ContactRow
            icon="call-outline"
            label="Phone Number"
            value="(941) 555-1234"
            verified
            last
          />
        </Group>

        {/* â”€â”€ How Players Can Reach Me â”€â”€ */}
        <SectionHeader label="HOW PLAYERS CAN REACH ME" />
        <Group>
          <ToggleRow icon="chatbubble-outline"  label="Allow Direct Messages"      value={directMessages}      onChange={setDirectMessages} />
          <ToggleRow icon="person-add-outline"  label="Allow Partner Requests"     value={partnerRequests}     onChange={setPartnerRequests} />
          <ToggleRow icon="people-outline"      label="Allow Community Invites"    value={communityInvites}    onChange={setCommunityInvites} />
          <ToggleRow icon="shield-outline"      label="Allow Team Invites"         value={teamInvites}         onChange={setTeamInvites} />
          <ToggleRow icon="storefront-outline"  label="Allow Marketplace Messages" value={marketplaceMessages} onChange={setMarketplaceMessages} last />
        </Group>

        {/* â”€â”€ Notification Delivery â”€â”€ */}
        <SectionHeader label="NOTIFICATION DELIVERY" />
        <Group>
          <NotifRow icon="person-add-outline"  label="Partner Requests"       value={notifPartner}     onChange={setNotifPartner} />
          <NotifRow icon="people-outline"      label="Community Play Invites"  value={notifCommunity}   onChange={setNotifCommunity} />
          <NotifRow icon="trophy-outline"      label="Tournament Updates"      value={notifTournament}  onChange={setNotifTournament} />
          <NotifRow icon="storefront-outline"  label="Marketplace Messages"    value={notifMarketplace} onChange={setNotifMarketplace} last />
        </Group>

        {/* â”€â”€ Profile Visibility â”€â”€ */}
        <SectionHeader label="PROFILE VISIBILITY" />
        <Group>
          <ToggleRow icon="mail-outline"   label="Show Email Address" value={showEmail}      onChange={setShowEmail} />
          <ToggleRow icon="call-outline"   label="Show Phone Number"  value={showPhone}      onChange={setShowPhone} />
          <ToggleRow
            icon="search-outline"
            label="Allow Contact Lookup"
            sub="Allow other players to find you by email or phone number."
            value={contactLookup}
            onChange={setContactLookup}
            last
          />
        </Group>

        {/* â”€â”€ Emergency Contact â”€â”€ */}
        <SectionHeader label="EMERGENCY CONTACT (OPTIONAL)" />
        <Group>
          <TouchableOpacity style={s.row} activeOpacity={0.7}>
            <IconCircle name="shield-checkmark-outline" />
            <View style={s.rowCenter}>
              <Text style={s.rowLabel}>Emergency Contact</Text>
              <Text style={s.rowSub}>Victoria Dominguez</Text>
              <Text style={s.rowSub}>(941) 555-9876</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={L.textMuted} />
          </TouchableOpacity>
        </Group>

        {/* â”€â”€ Footer â”€â”€ */}
        <View style={s.footer}>
          <Ionicons name="lock-closed-outline" size={14} color={L.textMuted} />
          <View style={s.footerText}>
            <Text style={s.footerLine}>Your contact information is private and secure.</Text>
            <Text style={s.footerLine}>We will never share it without your permission.</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// â”€â”€â”€ Styles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.bg },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: L.bg, borderBottomWidth: 1, borderBottomColor: L.border,
    paddingHorizontal: 8, paddingVertical: 12,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, minWidth: 80 },
  backText: { color: L.blue, fontSize: 17, fontWeight: '400' },
  headerTitle: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800' },

  scroll: { padding: 20 },

  intro: {
    color: L.textMuted, fontSize: text.body.size, fontWeight: '500',
    textAlign: 'center', lineHeight: 20, marginBottom: 4,
  },

  sectionHeader: {
    color: L.textMuted, fontSize: text.sectionLabel.size, fontWeight: '800',
    letterSpacing: text.sectionLabel.letterSpacing, textTransform: 'uppercase',
    marginBottom: 8, marginTop: 24, paddingHorizontal: 4,
  },

  group: {
    backgroundColor: L.bg, borderRadius: shape.panel,
    borderWidth: 1, borderColor: L.border, overflow: 'hidden',
  },

  div: { height: StyleSheet.hairlineWidth, backgroundColor: L.div },

  // Row
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 13, gap: 12,
  },
  rowCenter: { flex: 1 },
  rowLabel: { color: L.navy, fontSize: text.body.size, fontWeight: '500', marginBottom: 1 },
  rowSub: { color: L.textMuted, fontSize: text.caption.size, fontWeight: '500', marginTop: 1 },

  // Icon circle
  iconCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: L.goldBg, borderWidth: 1, borderColor: L.goldBorder,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },

  // Verified badge
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  verifiedText: { color: L.green, fontSize: text.caption.size, fontWeight: '500' },

  // Notification columns
  notifCol: { alignItems: 'center', gap: 5, marginHorizontal: 4 },
  notifColLabel: { color: L.textMuted, fontSize: 11, fontWeight: '500' },
  notifCheck: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1.5, borderColor: L.border,
    backgroundColor: L.page,
    alignItems: 'center', justifyContent: 'center',
  },
  notifCheckOn: { backgroundColor: L.green, borderColor: L.green },

  // Footer
  footer: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center',
    gap: 8, marginTop: 28, paddingHorizontal: 16,
  },
  footerText: { fontSize: text.caption.size, fontWeight: '500', alignItems: 'center' },
  footerLine: {
    color: L.textMuted, fontSize: text.caption.size, fontWeight: '500',
    textAlign: 'center', lineHeight: 20,
  },
});
