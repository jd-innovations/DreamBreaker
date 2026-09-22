import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { OnboardingCTA, OnboardingProgressBar } from '@/lib/onboarding/components';
import { useSession } from '@/hooks/useSession';
import { registerPushTokenForUser, type PushRegistrationResult } from '@/lib/pushNotifications';
import { saveNotificationPreference } from '@/lib/notificationPreferences';
import { haptics } from '@/lib/haptics';

const L = colors;
const SCREEN_BG = '#F8F5EF';

const OPTIONS = [
  { key: 'newGames', title: 'New games near me', sub: 'At your home court' },
  { key: 'partners', title: 'Players looking for partners', sub: 'In your area' },
  { key: 'tournaments', title: 'Tournament registration opens', sub: 'Near you' },
] as const;

type NotificationKey = typeof OPTIONS[number]['key'];
type NotificationPrefs = Record<NotificationKey, boolean>;

export default function EnableNotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const [prefs, setPrefs] = useState<NotificationPrefs>({
    newGames: true,
    partners: true,
    tournaments: true,
  });
  const [registering, setRegistering] = useState(false);
  const [registrationResult, setRegistrationResult] = useState<PushRegistrationResult | null>(null);

  // This screen used to sit BEFORE create-account, where a first-time user had
  // no account yet: registerPushTokenForUser had nobody to attach a token to,
  // so the CTA fell through to the next screen and the system prompt never
  // appeared. New signups were therefore never actually asked, which is why
  // almost nobody had a device registered. It now runs after the profile
  // steps, where user.id always exists (owner-approved 2026-09-22).
  function next() {
    router.push('/onboarding/all-set');
  }

  /**
   * The three switches used to be component state and nothing else: whatever
   * the player chose here was discarded on the next screen. They now write the
   * real preference columns the dispatcher reads, so turning one off at
   * onboarding actually stops those notifications.
   *
   * Best effort, and deliberately not blocking: a failed write leaves the
   * default (on), which the player can change in Settings. Losing a preference
   * is worth less than trapping someone in onboarding.
   */
  async function savePrefs() {
    if (!user?.id) return;
    await Promise.all([
      saveNotificationPreference(user.id, 'games', prefs.newGames),
      saveNotificationPreference(user.id, 'newMatch', prefs.partners),
      saveNotificationPreference(user.id, 'likedYou', prefs.partners),
      saveNotificationPreference(user.id, 'tournaments', prefs.tournaments),
    ]);
  }

  async function enableNotifications() {
    if (!user?.id) {
      setRegistrationResult({
        ok: false,
        status: 'failed',
        reason: 'Create an account first, then enable notifications from Settings.',
      });
      return;
    }

    setRegistering(true);
    const result = await registerPushTokenForUser(user.id, { requestPermission: true });
    setRegistrationResult(result);
    setRegistering(false);

    // Advance as soon as registration succeeds. Previously this only swapped
    // the CTA label to "Continue" and waited for a *second* tap -- and when
    // permission was already granted at the OS level (no system dialog to
    // show), that first tap looked like it did nothing at all. Only the
    // denied/failed paths now hold the user here, where the helper text
    // explaining what happened is the point.
    if (result.ok) {
      haptics.success();
      await savePrefs();
      next();
    }
  }

  function handleCta() {
    if (registrationResult?.ok || registrationResult?.status === 'permission_denied' || !user?.id) {
      // Preferences are saved even when permission was denied: they govern
      // in-app notifications and email too, not only push.
      void savePrefs().finally(next);
      return;
    }
    void enableNotifications();
  }

  function toggle(key: NotificationKey) {
    // Every flip changes the value away from what was shown, so both
    // directions buzz -- matching OptionChip's multi-select behaviour.
    haptics.selection();
    setPrefs(prev => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <View style={[s.root, { paddingTop: insets.top + 8 }]}> 
      <View style={s.header}>
        <TouchableOpacity style={s.headerBtn} activeOpacity={0.7} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={24} color={L.navy} />
        </TouchableOpacity>
        <TouchableOpacity style={s.skipBtn} activeOpacity={0.7} onPress={next}>
          <Text style={s.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <View style={s.content}>
        <View style={s.titleBlock}>
          <Text style={s.title}>Enable notifications?</Text>
          <Text style={s.subtitle}>{"We'll keep you updated on games and events you care about."}</Text>
        </View>

        <View style={s.card}>
          {OPTIONS.map((option, index) => (
            <View key={option.key}>
              <View style={s.optionRow}>
                <View style={s.optionTextWrap}>
                  <Text style={s.optionTitle}>{option.title}</Text>
                  <Text style={s.optionSub}>{option.sub}</Text>
                </View>
                <Switch
                  value={prefs[option.key]}
                  onValueChange={() => toggle(option.key)}
                  trackColor={{ false: '#E4DED1', true: L.gold }}
                  thumbColor={L.white}
                  ios_backgroundColor="#E4DED1"
                />
              </View>
              {index < OPTIONS.length - 1 && <View style={s.divider} />}
            </View>
          ))}
        </View>

        <Text style={s.helperText}>
          {registrationResult?.ok
            ? 'Notifications are enabled on this device.'
            : registrationResult
              ? registrationResult.reason
              : 'You can update these anytime in Settings.'}
        </Text>
      </View>

      <View style={[s.footer, { paddingBottom: insets.bottom + 16 }]}> 
        <OnboardingProgressBar progress={63} />
        <OnboardingCTA
          label={registrationResult ? 'Continue' : registering ? 'Enabling...' : 'Enable Notifications'}
          onPress={handleCta}
          disabled={registering}
        />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: SCREEN_BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  headerBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  skipBtn: { minHeight: 36, justifyContent: 'center', paddingHorizontal: spacing.sm },
  skipText: { color: L.gold, fontSize: text.rowValue.size, fontWeight: '800' },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
    justifyContent: 'center',
  },
  titleBlock: { alignItems: 'center', marginBottom: spacing.xl },
  title: { color: L.navy, fontSize: text.pageTitle.size, fontWeight: '900', lineHeight: 36, textAlign: 'center' },
  subtitle: { color: '#39415A', fontSize: text.body.size, fontWeight: '500', lineHeight: 21, textAlign: 'center', marginTop: spacing.xs, maxWidth: 300 },
  card: {
    borderWidth: 1.5,
    borderColor: '#E5DED1',
    borderRadius: shape.card,
    backgroundColor: 'rgba(255,255,255,0.82)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  optionRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  optionTextWrap: { flex: 1, minWidth: 0 },
  optionTitle: { color: L.navy, fontSize: text.rowValue.size, fontWeight: '800', lineHeight: 20 },
  optionSub: { color: '#39415A', fontSize: text.caption.size, fontWeight: '500', lineHeight: 18, marginTop: 2 },
  divider: { height: 1, backgroundColor: '#E9E1D5' },
  helperText: { color: '#7F8AA3', fontSize: text.caption.size, fontWeight: '500', textAlign: 'center', marginTop: spacing.xl },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: SCREEN_BG,
    gap: spacing.md,
  },
});
