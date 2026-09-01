import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from 'expo-router';
import { colors, radius } from '@/theme';
import { goBack } from '@/lib/navigation';
import { useProfile } from '@/hooks/useProfile';
import { notifyProfileUpdated } from '@/lib/profileEvents';
import { useSupportContext } from '@/lib/support/supportContext';
import { startConnectOnboarding, connectErrorMessage, type ConnectRole } from '@/lib/payments/connectOnboarding';
import { isOnlineNow } from '@/lib/network';
import { fetchCoachEarnings, formatCents, type CoachEarnings } from '@/lib/coach/earnings';

// Stripe Connect payouts.
//
// Until now the app had no Connect flow for any role. Four places — the coach
// dashboard twice, and the entry-fee validation in both create-tournament and
// tournament/[id]/edit — told people to "connect Stripe payouts on the
// Pickleball App website", linked nowhere, and named a coach-facing web page
// that does not exist. This screen is the one place that owns it; all four now
// point here.
//
// Role-generic: one Express account per person, whichever hat they wear. A
// director who is also a coach onboards once.

const L = {
  navy: colors.navy, gold: colors.gold, text: colors.text, textSub: colors.textSub,
  border: colors.border, bg: colors.bg, page: colors.page, goldBg: colors.goldBg,
  success: colors.success, successBg: colors.successBg,
  danger: colors.danger, dangerBg: colors.dangerBg, white: '#FFFFFF',
};

export default function PayoutSettingsScreen() {
  const insets = useSafeAreaInsets();
  const { profile, loading } = useProfile();
  const [starting, setStarting] = useState(false);
  const [earnings, setEarnings] = useState<CoachEarnings | null>(null);

  // Re-read on focus: a sale can land while this screen sits open, and a stale
  // balance is the one number here nobody would forgive being wrong.
  useFocusEffect(useCallback(() => {
    if (!profile?.id || !profile.is_coach) { setEarnings(null); return; }
    let active = true;
    fetchCoachEarnings(profile.id)
      .then(e => { if (active) setEarnings(e); })
      .catch(() => { if (active) setEarnings(null); });
    return () => { active = false; };
  }, [profile?.id, profile?.is_coach]));

  useSupportContext({ feature: 'payouts' });

  // useProfile reloads on navigation focus, which is not enough here: the
  // Stripe browser is an overlay, so this screen never loses focus and the
  // hook never re-fires on return. notifyProfileUpdated() is the hook's own
  // invalidation channel — the same one profile edits use.

  const isCoach = !!profile?.is_coach;
  const isDirector = !!profile?.is_director;
  const onboarded = !!profile?.stripe_connect_onboarded_at;
  const restricted = profile?.coach_status === 'restricted';

  async function handleConnect() {
    // Whichever role the account actually holds. Director takes precedence
    // only because its eligibility check is the stricter of the two — a
    // director who is also a coach passes either way, and both roles share
    // one Express account regardless.
    const role: ConnectRole = isDirector ? 'director' : 'coach';

    setStarting(true);
    try {
      if (!(await isOnlineNow())) {
        Alert.alert('Offline', connectErrorMessage('offline'));
        return;
      }
      const result = await startConnectOnboarding(role);
      if (!result.ok) {
        Alert.alert('Could not start setup', connectErrorMessage(result.code));
        return;
      }
      notifyProfileUpdated();
      if (result.completed) {
        // Deliberately not "you're connected": Stripe reviews the submission,
        // and the badge only appears once its webhook confirms the account can
        // take charges. Claiming success here would be the same false-confirm
        // the payment hooks poll to avoid.
        Alert.alert(
          'Setup submitted',
          'Stripe is reviewing your details. Payouts turn on automatically once they approve it — usually within a few minutes.',
        );
      }
    } finally {
      setStarting(false);
    }
  }

  return (
    <View style={s.root}>
      <StatusBar style="dark" />
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={s.back} onPress={() => goBack('/account-settings')} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={L.navy} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Payouts</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, gap: 14 }}>
        {loading ? (
          <ActivityIndicator size="large" color={L.gold} style={{ marginTop: 40 }} />
        ) : !isCoach && !isDirector ? (
          <View style={s.card}>
            <Ionicons name="information-circle-outline" size={22} color={L.textSub} />
            <Text style={s.cardText}>
              Payouts are for coaches and tournament directors. Turn on Coach Mode, or apply to be a
              director, to set up payments.
            </Text>
          </View>
        ) : (
          <>
            {earnings && earnings.lessonsSold > 0 && (
              <View style={s.earningsCard}>
                <Text style={s.earningsLabel}>You&rsquo;ve earned</Text>
                <Text style={s.earningsAmount}>{formatCents(earnings.netCents)}</Text>
                <Text style={s.earningsSub}>
                  from {earnings.lessonsSold} {earnings.lessonsSold === 1 ? 'lesson' : 'lessons'} sold
                </Text>

                <View style={s.breakdown}>
                  <View style={s.breakdownRow}>
                    <Text style={s.breakdownLabel}>Players paid</Text>
                    <Text style={s.breakdownValue}>{formatCents(earnings.grossCents)}</Text>
                  </View>
                  <View style={s.breakdownRow}>
                    <Text style={s.breakdownLabel}>Platform commission</Text>
                    <Text style={s.breakdownValue}>-{formatCents(earnings.commissionCents)}</Text>
                  </View>
                  <View style={[s.breakdownRow, s.breakdownTotal]}>
                    <Text style={s.breakdownTotalLabel}>Your earnings</Text>
                    <Text style={s.breakdownTotalValue}>{formatCents(earnings.netCents)}</Text>
                  </View>
                </View>

                {/* Says plainly that nothing has moved. Calling this "available
                    to withdraw" would promise a payout run that does not exist
                    yet, and the first coach to tap a Withdraw button that did
                    nothing would stop trusting the number entirely. */}
                <Text style={s.earningsNote}>
                  {onboarded
                    ? 'Automatic payouts are not switched on yet. Your earnings are recorded and will be paid once they are.'
                    : 'Connect a payout account below so this can be paid to you.'}
                </Text>
              </View>
            )}

            <View style={[
              s.statusCard,
              onboarded ? s.statusOk : restricted ? s.statusBad : s.statusPending,
            ]}>
              <Ionicons
                name={onboarded ? 'checkmark-circle' : restricted ? 'alert-circle' : 'time-outline'}
                size={22}
                color={onboarded ? L.success : restricted ? L.danger : L.gold}
              />
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={s.statusTitle}>
                  {onboarded ? 'Payouts active' : restricted ? 'Action needed' : 'Payouts not set up'}
                </Text>
                <Text style={s.statusBody}>
                  {onboarded
                    ? 'Your Stripe account is connected and can receive payouts.'
                    : restricted
                      ? 'Stripe needs more information before you can be paid. Reconnect to finish.'
                      : 'Connect a Stripe account to receive money from lessons and tournament entries.'}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[s.connectBtn, starting && s.connectBtnDisabled]}
              activeOpacity={0.85}
              disabled={starting}
              onPress={handleConnect}
            >
              {starting
                ? <ActivityIndicator size="small" color={L.white} />
                : (
                  <>
                    <Ionicons name="link-outline" size={18} color={L.white} />
                    <Text style={s.connectBtnText}>
                      {onboarded ? 'Manage Payout Account' : restricted ? 'Reconnect Stripe' : 'Connect Stripe'}
                    </Text>
                  </>
                )}
            </TouchableOpacity>

            <Text style={s.note}>
              Stripe handles the details and collects your identity and bank information directly —
              we never see or store them. Opens in your browser.
            </Text>

            {!onboarded && (
              <View style={s.card}>
                <Ionicons name="lock-closed-outline" size={20} color={L.textSub} />
                <Text style={s.cardText}>
                  {isDirector && isCoach
                    ? 'Until this is set up you cannot charge a tournament entry fee or be paid for lessons.'
                    : isDirector
                      ? 'Until this is set up you cannot charge a tournament entry fee.'
                      : 'Until this is set up you cannot be paid for lessons.'}
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, backgroundColor: L.bg,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: L.navy, fontSize: 17, fontWeight: '800' },

  earningsCard: {
    alignItems: 'center', gap: 2, padding: 20,
    backgroundColor: L.bg, borderRadius: radius.card,
    borderWidth: 1, borderColor: L.border,
  },
  earningsLabel:  { color: L.textSub, fontSize: 13, fontWeight: '700' },
  earningsAmount: { color: L.navy, fontSize: 38, fontWeight: '900', letterSpacing: -0.5 },
  earningsSub:    { color: L.textSub, fontSize: 13 },
  breakdown: {
    alignSelf: 'stretch', marginTop: 16, gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: L.border, paddingTop: 14,
  },
  breakdownRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  breakdownLabel: { color: L.textSub, fontSize: 13 },
  breakdownValue: { color: L.text, fontSize: 13, fontWeight: '700' },
  breakdownTotal: {
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: L.border,
    paddingTop: 8, marginTop: 2,
  },
  breakdownTotalLabel: { color: L.navy, fontSize: 14, fontWeight: '800' },
  breakdownTotalValue: { color: L.navy, fontSize: 15, fontWeight: '900' },
  earningsNote: { color: L.textSub, fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 14 },

  statusCard: {
    flexDirection: 'row', gap: 12, padding: 16,
    borderRadius: radius.card, borderWidth: 1,
  },
  statusOk:      { backgroundColor: L.successBg, borderColor: 'rgba(34,197,94,0.30)' },
  statusPending: { backgroundColor: L.goldBg,    borderColor: 'rgba(201,168,76,0.35)' },
  statusBad:     { backgroundColor: L.dangerBg,  borderColor: 'rgba(239,68,68,0.30)' },
  statusTitle:   { color: L.navy, fontSize: 15, fontWeight: '800' },
  statusBody:    { color: L.text, fontSize: 13, lineHeight: 19 },

  connectBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: L.navy, borderRadius: 30, paddingVertical: 15, minHeight: 52,
  },
  connectBtnDisabled: { opacity: 0.5 },
  connectBtnText: { color: L.white, fontSize: 16, fontWeight: '800' },

  note: { color: L.textSub, fontSize: 12, lineHeight: 18, textAlign: 'center', paddingHorizontal: 8 },

  card: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 14,
    backgroundColor: L.bg, borderRadius: radius.card, borderWidth: 1, borderColor: L.border,
  },
  cardText: { flex: 1, color: L.textSub, fontSize: 13, lineHeight: 19 },
});
