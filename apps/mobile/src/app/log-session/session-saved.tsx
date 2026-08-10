import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, ScrollView, Linking, Platform, Alert } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useSession } from '@/hooks/useSession';
import {
  getParticipantDeliveries,
  getSavedGames,
  getSessionLocation,
  updateParticipantDeliveryStatus,
  type ParticipantDelivery,
} from '@/lib/logSessionStore';
import { markPersonalGuestShareInitiated } from '@/lib/supabase/personalSessions';
import { createPersonalMatchClaimLink } from '@/lib/supabase/personalMatchClaims';
import { colors, radius, spacing, typography } from '@/theme';

function initialsFor(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?';
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

function userDisplayName(user: ReturnType<typeof useSession>['user']) {
  const fullName = user?.user_metadata?.full_name;
  if (typeof fullName === 'string' && fullName.trim()) return fullName.trim();
  return user?.email?.split('@')[0] ?? 'A player';
}

export default function SessionSavedScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const [deliveries, setDeliveries] = useState(getParticipantDeliveries());
  const games = getSavedGames();
  const location = getSessionLocation();
  const recorderName = userDisplayName(user);

  const sortedDeliveries = useMemo(() => deliveries.slice().sort((a, b) => {
    const order = { recorded_by_you: 0, in_app_shared: 1, share_initiated: 2, not_shared: 3, claimed: 4, expired: 5 };
    return order[a.deliveryStatus] - order[b.deliveryStatus] || a.displayName.localeCompare(b.displayName);
  }), [deliveries]);

  function updateDelivery(sessionParticipantId: string) {
    updateParticipantDeliveryStatus(sessionParticipantId, 'share_initiated');
    setDeliveries(getParticipantDeliveries());
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={colors.navy} />
        </TouchableOpacity>
        <Text style={styles.title}>Match Complete</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.successBadge}>
          <Ionicons name="checkmark" size={38} color={colors.white} />
        </View>

        <Text style={styles.headline}>Match complete</Text>
        <Text style={styles.subtitle}>Registered players were updated automatically. Guests can be shared individually.</Text>

        <View style={styles.playersCard}>
          <Text style={styles.playersLabel}>Sharing Status</Text>
          {sortedDeliveries.length > 0 ? sortedDeliveries.map((delivery) => (
            <DeliveryStatusRow
              key={delivery.sessionParticipantId}
              delivery={delivery}
              games={games}
              facilityName={location.facilityName}
              recorderName={recorderName}
              onShareInitiated={() => updateDelivery(delivery.sessionParticipantId)}
            />
          )) : (
            <Text style={styles.emptyText}>No participant delivery statuses were returned.</Text>
          )}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <PrimaryButton
          label="Done"
          style={styles.statsButton}
          textStyle={styles.statsButtonText}
          onPress={() => router.push('/(tabs)/stats')}
        />
      </View>
    </View>
  );
}

function DeliveryStatusRow({
  delivery,
  games,
  facilityName,
  recorderName,
  onShareInitiated,
}: {
  delivery: ParticipantDelivery;
  games: ReturnType<typeof getSavedGames>;
  facilityName: string | null;
  recorderName: string;
  onShareInitiated: () => void;
}) {
  const [phoneDraft, setPhoneDraft] = useState(delivery.phone ?? '');
  const [enteringPhone, setEnteringPhone] = useState(false);
  const [sharing, setSharing] = useState(false);
  const isGuest = delivery.participantKind === 'guest';
  const isClaimed = delivery.deliveryStatus === 'claimed' || delivery.claimStatus === 'claimed';
  const isShared = isClaimed || delivery.deliveryStatus === 'share_initiated';

  async function sendSms() {
    if (!delivery.guestShareId) {
      Alert.alert('Unable to share', 'This guest sharing record is missing.');
      return;
    }

    const phone = phoneDraft.trim();
    if (!phone) {
      setEnteringPhone(true);
      return;
    }

    setSharing(true);
    try {
      const claimLink = await createPersonalMatchClaimLink(delivery.guestShareId);
      const message = createSmsMessage({
        guestName: delivery.displayName,
        recorderName,
        facilityName,
        games,
        appClaimUrl: claimLink.claimUrl,
        webClaimUrl: 'https://pickleballapp.app/claim/' + claimLink.token,
      });
      const separator = Platform.OS === 'ios' ? '&' : '?';
      await Linking.openURL(`sms:${phone}${separator}body=${encodeURIComponent(message)}`);
      await markPersonalGuestShareInitiated(delivery.guestShareId);
      onShareInitiated();
      setEnteringPhone(false);
    } catch (error) {
      console.warn('[log-session] SMS share failed:', error);
      Alert.alert('Could not open SMS', 'Please try again.');
    } finally {
      setSharing(false);
    }
  }

  return (
    <View style={styles.playerRow}>
      <View style={styles.avatarFallback}>
        <Text style={styles.avatarInitials}>{initialsFor(delivery.displayName)}</Text>
      </View>

      <View style={styles.playerBody}>
        <Text style={styles.playerName}>{delivery.displayName}</Text>
        {isGuest ? (
          <Text style={[styles.statusText, isShared ? styles.statusShared : styles.statusPending]}>
            {isClaimed ? 'Claimed' : isShared ? 'SMS shared' : 'Send SMS'}
          </Text>
        ) : (
          <View style={styles.inlineStatus}>
            <Ionicons name="checkmark-circle" size={15} color={colors.success} />
            <Text style={styles.statusShared}>{delivery.deliveryStatus === 'recorded_by_you' ? 'Recorded by you' : 'In-app shared'}</Text>
          </View>
        )}

        {enteringPhone ? (
          <View style={styles.phoneRow}>
            <TextInput
              style={styles.phoneInput}
              value={phoneDraft}
              onChangeText={setPhoneDraft}
              placeholder="Phone number"
              placeholderTextColor={colors.textSub}
              keyboardType="phone-pad"
              autoFocus
            />
            <TouchableOpacity
              style={[styles.phoneSendButton, (!phoneDraft.trim() || sharing) && styles.phoneSendButtonDisabled]}
              activeOpacity={0.85}
              disabled={!phoneDraft.trim() || sharing}
              onPress={sendSms}
            >
              <Text style={styles.phoneSendButtonText}>{sharing ? 'Opening' : 'Send'}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      {isGuest && !isShared ? (
        <TouchableOpacity
          style={styles.smsButton}
          activeOpacity={0.8}
          disabled={sharing}
          onPress={delivery.phone ? sendSms : () => setEnteringPhone((value) => !value)}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.navy} />
          <Text style={styles.smsButtonText}>{sharing ? 'Opening' : 'Send SMS'}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function createSmsMessage({
  guestName,
  recorderName,
  facilityName,
  games,
  appClaimUrl,
  webClaimUrl,
}: {
  guestName: string;
  recorderName: string;
  facilityName: string | null;
  games: ReturnType<typeof getSavedGames>;
  appClaimUrl: string;
  webClaimUrl: string;
}) {
  const scoreLines = games.length > 0
    ? games.map((game) => `Game ${game.gameNumber}: ${game.myTeamLabel} ${game.myScore}, ${game.opponentsLabel} ${game.opponentScore}`).join('\n')
    : 'Score saved in DreamBreaker.';

  return [
    `Great game today, ${firstName(guestName)}!`,
    '',
    `${recorderName} recorded your match${facilityName ? ` at ${facilityName}` : ''}.`,
    '',
    'Final score:',
    scoreLines,
    '',
    'Claim your match:',
    webClaimUrl,
    '',
    'Open in the app:',
    appClaimUrl,
    '',
    'Your match is saved on DreamBreaker.',
  ].join('\n');
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.screenH,
    paddingVertical: 12,
  },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.sectionTitle, color: colors.navy, fontSize: 17 },
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: spacing.screenH, paddingTop: spacing.lg, alignItems: 'center' },
  successBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.success,
    marginBottom: spacing.lg,
  },
  headline: {
    ...typography.sectionTitle,
    color: colors.navy,
    fontSize: 20,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    color: colors.textSub,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  playersCard: {
    width: '100%',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: spacing.md,
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  playersLabel: {
    ...typography.metadata,
    color: colors.textSub,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  emptyText: {
    ...typography.body,
    color: colors.textSub,
    fontSize: 13,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  avatarFallback: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.goldBg,
  },
  avatarInitials: {
    ...typography.metadata,
    color: colors.gold,
    fontWeight: '800',
    fontSize: 11,
  },
  playerBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  playerName: {
    ...typography.cardTitle,
    color: colors.navy,
    fontSize: 14,
    lineHeight: 19,
  },
  inlineStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusText: {
    ...typography.metadata,
    fontWeight: '700',
    fontSize: 11,
  },
  statusShared: {
    ...typography.metadata,
    color: colors.success,
    fontWeight: '700',
    fontSize: 11,
  },
  statusPending: {
    color: colors.textSub,
  },
  smsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    backgroundColor: colors.goldBg,
    borderRadius: radius.chip,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
  },
  smsButtonText: {
    ...typography.metadata,
    color: colors.navy,
    fontWeight: '700',
    fontSize: 11,
  },
  phoneRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  phoneInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    color: colors.navy,
    fontSize: 13,
  },
  phoneSendButton: {
    borderRadius: radius.md,
    backgroundColor: colors.gold,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  phoneSendButtonDisabled: {
    opacity: 0.5,
  },
  phoneSendButtonText: {
    ...typography.cardTitle,
    color: colors.navy,
    fontSize: 13,
  },
  footer: {
    paddingHorizontal: spacing.screenH,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  statsButton: {
    backgroundColor: colors.gold,
  },
  statsButtonText: {
    color: colors.navy,
  },
});
