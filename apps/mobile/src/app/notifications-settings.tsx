import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Switch, Linking, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { goBack } from '@/lib/navigation';
import { StatusBar } from 'expo-status-bar';
import { colors } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { useSession } from '@/hooks/useSession';
import { registerPushTokenForUser, isPushRegisteredForThisDevice, deleteCurrentDevicePushToken, type PushRegistrationResult } from '@/lib/pushNotifications';
import {
  loadNotificationPreferences,
  saveNotificationPreference,
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from '@/lib/notificationPreferences';
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


// â”€â”€â”€ Toggle row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ToggleRow({
  icon, label, sub, value, onChange, last, disabled, pending,
}: {
  icon: string; label: string; sub: string;
  value: boolean; onChange: (v: boolean) => void; last?: boolean;
  disabled?: boolean;
  /**
   * True while the real value is still unknown. Renders a spinner INSTEAD of
   * the switch rather than a disabled switch, because `disabled` does not stop
   * a Switch animating — it only stops it responding. Mounting the switch late,
   * once the value is known, means it appears already in the right position
   * instead of sliding into it.
   */
  pending?: boolean;
}) {
  return (
    <>
      <View style={s.row}>
        <IconCircle name={icon} />
        <View style={s.rowCenter}>
          <Text style={s.rowLabel}>{label}</Text>
          <Text style={s.rowSub}>{sub}</Text>
        </View>
        {pending ? (
          <ActivityIndicator size="small" color={L.textMuted} style={s.switchSlot} />
        ) : (
          <Switch
            value={value}
            onValueChange={onChange}
            disabled={disabled}
            trackColor={{ false: '#D1D1D6', true: L.green }}
            thumbColor="#FFFFFF"
            ios_backgroundColor="#D1D1D6"
          />
        )}
      </View>
      {!last && <Div />}
    </>
  );
}

// â”€â”€â”€ Time picker row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


// â”€â”€â”€ Main screen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function NotificationsSettingsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();

  // Push registration is per-device and separate from the preferences below:
  // it is about whether THIS device has a token, not about what the user wants
  // to be told. Both matter — a device with no token receives nothing however
  // the preferences are set.
  // Starts null, not false. "Off" and "not asked yet" are different states, and
  // rendering the switch off before the answer arrives is what made this look
  // unpersisted: it always read off on mount, however the device was actually
  // configured.
  const [pushNotifs, setPushNotifs] = useState<boolean | null>(null);
  const [registeringPush, setRegisteringPush] = useState(false);
  const [pushResult, setPushResult] = useState<PushRegistrationResult | null>(null);

  // Preferences, loaded from profiles rather than invented in component state.
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const [prefsStatus, setPrefsStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [prefsError, setPrefsError] = useState<string | null>(null);

  // Ask the device and the database what is actually true, rather than
  // assuming off. Never prompts for permission — see
  // isPushRegisteredForThisDevice.
  useEffect(() => {
    let cancelled = false;
    if (!user?.id) { setPushNotifs(false); return; }
    void isPushRegisteredForThisDevice(user.id).then((on) => {
      if (!cancelled) setPushNotifs(on);
    });
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) { setPrefsStatus('error'); setPrefsError('Sign in to manage notifications.'); return; }

    setPrefsStatus('loading');
    void loadNotificationPreferences(user.id).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setPrefs(result.preferences);
        setPrefsStatus('ready');
        setPrefsError(null);
      } else {
        // Deliberately not falling back to defaults with a ready state: the
        // switches would show values that are not the user's, and saving from
        // there would write them back. See ScreenState — a failure must not
        // look like data.
        setPrefsStatus('error');
        setPrefsError(result.reason);
      }
    });
    return () => { cancelled = true; };
  }, [user?.id]);

  // Optimistic, with a revert. The switch has to move on the tap or it feels
  // broken, but a failed write must not leave the UI claiming a setting that
  // the database does not have.
  async function updatePref(key: keyof NotificationPreferences, next: boolean) {
    if (!user?.id) return;
    const previous = prefs[key];
    setPrefs((p) => ({ ...p, [key]: next }));
    setPrefsError(null);

    const result = await saveNotificationPreference(user.id, key, next);
    if (!result.ok) {
      setPrefs((p) => ({ ...p, [key]: previous }));
      setPrefsError(result.reason);
    }
  }

  async function handlePushToggle(next: boolean) {
    if (!next) {
      // Turning it off used to set local state and nothing else, so the device
      // token stayed registered and notifications kept arriving. A switch
      // labelled "Receive notifications on this device" has to actually stop
      // them, or it is the third control on this screen that only looked like
      // it worked.
      //
      // Deleting THIS device's token, not the user's: signing out of one phone
      // must not silence another.
      if (!user?.id) { setPushNotifs(false); setPushResult(null); return; }

      setRegisteringPush(true);
      try {
        await deleteCurrentDevicePushToken(user.id);
        setPushNotifs(false);
        setPushResult(null);
      } catch {
        // Left ON deliberately: the token is still registered, so notifications
        // will still arrive, and showing off would be the same lie in reverse.
        setPushNotifs(true);
        setPushResult({
          ok: false,
          status: 'failed',
          reason: "Couldn't turn notifications off. Check your connection and try again.",
        });
      } finally {
        setRegisteringPush(false);
      }
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
        {/* These were five CategoryRow items with a chevron, no onPress and a
            caption promising "Manage notification types for each category".
            They are now switches bound to the profiles.notif_* columns that
            already existed and that web's match-settings panel already writes,
            so the two platforms finally agree.

            Community Play, Marketplace and Social are gone: there is no column
            and no sender behind any of them. */}
        <SectionHeader label="NOTIFICATION CATEGORIES" />
        <Group>
          <ToggleRow
            icon="chatbubbles-outline"
            label="Messages"
            sub="New chat messages"
            value={prefs.messages}
            onChange={(next) => { void updatePref('messages', next); }}
          />
          <ToggleRow
            icon="trophy-outline"
            label="Tournament Activity"
            sub="Registration, updates, and results"
            value={prefs.tournaments}
            onChange={(next) => { void updatePref('tournaments', next); }}
          />
          <ToggleRow
            icon="person-add-outline"
            label="New Matches"
            sub="When someone matches with you"
            value={prefs.newMatch}
            onChange={(next) => { void updatePref('newMatch', next); }}
          />
          <ToggleRow
            icon="heart-circle-outline"
            label="Likes"
            sub="When someone likes your profile"
            value={prefs.likedYou}
            onChange={(next) => { void updatePref('likedYou', next); }}
          />
          <ToggleRow
            icon="time-outline"
            label="Hold Expiry"
            sub="Before a held tournament spot expires"
            value={prefs.holdExpiry}
            onChange={(next) => { void updatePref('holdExpiry', next); }}
            last
          />
        </Group>
        <Text style={s.groupNote}>
          {prefsStatus === 'loading'
            ? 'Loading your settings...'
            : 'Messages are delivered according to this setting today. The rest are saved and will apply as those notifications are added.'}
        </Text>
        {prefsError ? <Text style={s.groupNote}>{prefsError}</Text> : null}

        {/* â”€â”€ Delivery Methods â”€â”€ */}
        <SectionHeader label="DELIVERY METHODS" />
        <Group>
          <ToggleRow
            icon="phone-portrait-outline"
            label={registeringPush ? 'Enabling Push...' : 'Push Notifications'}
            // Says what it is doing while it finds out. Without this the switch
            // renders off, then animates on a moment later once the device
            // answers — which reads as the app flipping it by itself rather
            // than as a value arriving.
            sub={pushNotifs === null ? 'Checking this device...' : 'Receive notifications on this device'}
            pending={pushNotifs === null}
            disabled={registeringPush}
            value={pushNotifs === true}
            onChange={(next) => { void handlePushToggle(next); }}
          />
          {/* SMS was here. Removed 2026-08-31 rather than left as a toggle
              that does nothing: there is no SMS provider configured anywhere in
              this project, so the switch could never have had an effect. Put it
              back when a provider and a real send path exist — not before, or
              it is a promise the app cannot keep. */}
          <ToggleRow
            icon="mail-outline"
            label="Email Notifications"
            sub="Receive notifications via email"
            value={prefs.email}
            onChange={(next) => { void updatePref('email', next); }}
            last
          />
        </Group>
        {pushResult && (
          <View>
            <Text style={s.groupNote}>
              {pushResult.ok
                ? 'Push notifications are enabled on this device.'
                : pushResult.status === 'permission_denied'
                  ? 'Notifications are turned off for Pickleball App in iOS Settings. iOS only asks once, so the switch above cannot turn them back on — it has to be done in Settings.'
                  : pushResult.reason}
            </Text>

            {/* iOS shows its permission prompt ONCE per install. If it was
                declined — during onboarding, most likely — requesting again
                returns denied without showing anything, so the toggle can never
                succeed and would just flip back with no explanation. The only
                real remedy is the system settings page, so offer it directly
                rather than describing where to find it. */}
            {!pushResult.ok && pushResult.status === 'permission_denied' && (
              <TouchableOpacity
                style={s.openSettingsBtn}
                onPress={() => { void Linking.openSettings(); }}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Open iOS Settings to enable notifications"
              >
                <Ionicons name="open-outline" size={16} color={L.blue} />
                <Text style={s.openSettingsText}>Open Settings</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Quiet Hours and Badge Counts were here. Both removed 2026-08-31.

            Quiet hours offered "10:00 PM - 7:00 AM" with no timezone stored
            anywhere on profiles, so no server-side sender could know when 10 PM
            is for a given user. It needs a timezone column captured from the
            device before it can mean anything.

            Badge counts had three switches, and setBadgeCountAsync is called
            nowhere in this app — the icon has never carried a badge. */}

        {/* â”€â”€ Footer â”€â”€ */}
        <View style={s.footer}>
          <Ionicons name="lock-closed-outline" size={14} color={L.textMuted} />
          <View>
            <Text style={s.footerLine}>Changes save as you make them.</Text>
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

  div: { height: StyleSheet.hairlineWidth, backgroundColor: L.div, marginLeft: 68 },

  groupNote: {
    color: L.textMuted, fontSize: text.caption.size, fontWeight: '500',
    paddingHorizontal: 4, marginTop: 8,
  },
  openSettingsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginTop: 2,
  },
  openSettingsText: { color: L.blue, fontSize: text.rowTitle.size, fontWeight: '700' },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 13, gap: 12,
  },
  rowCenter: { flex: 1 },
  rowLabel: { color: L.navy, fontSize: text.body.size, fontWeight: '500', marginBottom: 2 },
  rowSub: { color: L.textMuted, fontSize: text.caption.size, fontWeight: '500' },
  // iOS Switch is 51x31. Matching it keeps the row from reflowing when the
  // spinner is replaced by the real control.
  switchSlot: { width: 51, height: 31 },

  iconCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: L.goldBg, borderWidth: 1, borderColor: L.goldBorder,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },

  // Time rows
  timeLabel: { color: L.navy, fontSize: text.body.size, fontWeight: '500', flex: 1, paddingLeft: 4 },
  timeRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timeValue: { color: L.gold, fontSize: text.body.size, fontWeight: '500' },

  footer: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center',
    gap: 8, marginTop: 28, paddingHorizontal: 16,
  },
  footerLine: {
    color: L.textMuted, fontSize: text.caption.size, fontWeight: '500',
    textAlign: 'center', lineHeight: 20,
  },
});
