import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '@/theme';
import type { SupportContext } from '@/lib/support/supportContext';
import type { SupportTicket, SupportTicketCategory } from '@/lib/supportTicketService';
import { trackSupportEvent } from '@/lib/support/supportAnalytics';
import { ReportProblemForm } from './ReportProblemForm';
import { SupportConfirmation } from './SupportConfirmation';

// Same external Help Center URL help-support.tsx already links to -- there is
// no in-app article/FAQ content model yet (SUPPORT_EXPERIENCE_ARCHITECTURE.md
// §2/§10), so this reuses that existing entry point rather than inventing one.
const HELP_CENTER_URL = 'https://dreambreakerpb.com/help';

function formatFeature(feature: string): string {
  return feature
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

type Step = 'home' | { kind: 'report'; presetCategory?: SupportTicketCategory } | { kind: 'confirmation'; ticket: SupportTicket };

/**
 * Support Home (§10) plus, as of Phase 2, an inline Report a Problem /
 * Send Feedback flow and confirmation -- both now create a real
 * support_tickets row instead of navigating out to /support/new-ticket.
 */
export function SupportSheet({
  visible,
  onClose,
  context,
  routeName,
}: {
  visible: boolean;
  onClose: () => void;
  context: SupportContext | null;
  routeName: string;
}) {
  const [step, setStep] = useState<Step>('home');
  const feature = context?.feature ?? 'unknown';
  const openedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (visible) {
      openedAtRef.current = Date.now();
      trackSupportEvent({ name: 'support_sheet_opened', payload: { routeName, feature } });
    }
    // Only fires on the visible:false->true transition, not on every context/route change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function close() {
    const durationMs = openedAtRef.current ? Date.now() - openedAtRef.current : 0;
    trackSupportEvent({ name: 'support_sheet_dismissed', payload: { routeName, feature, durationMs } });
    onClose();
    // Reset after the close animation would otherwise show a half-reset sheet mid-dismiss.
    setTimeout(() => setStep('home'), 250);
  }

  function go(action: () => void) {
    close();
    action();
  }

  function openReport(presetCategory?: SupportTicketCategory) {
    trackSupportEvent({
      name: 'support_quick_action_tapped',
      payload: { feature, actionId: presetCategory === 'feedback' ? 'send_feedback' : 'report_problem' },
    });
    trackSupportEvent({ name: 'support_report_started', payload: { feature, entityType: context?.entityType } });
    setStep({ kind: 'report', presetCategory });
  }

  function cancelReport() {
    trackSupportEvent({ name: 'support_report_abandoned', payload: { feature, step: 'form' } });
    setStep('home');
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.grabber} />

            {step === 'home' ? (
              <>
                <Text style={styles.title}>{context?.entityLabel ?? 'How can we help?'}</Text>
                {context?.entityLabel ? <Text style={styles.subtitle}>{formatFeature(context.feature)}</Text> : null}

                <Row
                  icon="help-circle-outline"
                  label="Help Center"
                  onPress={() => {
                    trackSupportEvent({ name: 'support_quick_action_tapped', payload: { feature, actionId: 'help_center' } });
                    go(() => Linking.openURL(HELP_CENTER_URL));
                  }}
                />
                <View style={styles.divider} />
                <Row icon="alert-circle-outline" label="Report a problem" onPress={() => openReport()} />
                <View style={styles.divider} />
                <Row
                  icon="chatbox-ellipses-outline"
                  label="Send feedback"
                  onPress={() => openReport('feedback')}
                />
                <View style={styles.divider} />
                <Row
                  icon="receipt-outline"
                  label="My Tickets"
                  onPress={() => {
                    trackSupportEvent({ name: 'support_quick_action_tapped', payload: { feature, actionId: 'my_tickets' } });
                    go(() => router.push('/support' as never));
                  }}
                />

                <Pressable style={styles.cancelBtn} onPress={close}>
                  <Text style={styles.cancelText}>Close</Text>
                </Pressable>
              </>
            ) : typeof step === 'object' && step.kind === 'report' ? (
              <>
                <Text style={styles.title}>{step.presetCategory === 'feedback' ? 'Send feedback' : 'Report a problem'}</Text>
                <ReportProblemForm
                  context={context}
                  initialCategory={step.presetCategory}
                  onSubmitted={(ticket) => setStep({ kind: 'confirmation', ticket })}
                  onCancel={cancelReport}
                />
              </>
            ) : typeof step === 'object' && step.kind === 'confirmation' ? (
              <SupportConfirmation
                ticket={step.ticket}
                onViewTicket={() => {
                  trackSupportEvent({ name: 'support_ticket_viewed', payload: { ticketId: step.ticket.id } });
                  go(() => router.push(`/support/${step.ticket.id}` as never));
                }}
              />
            ) : null}
          </ScrollView>
        </Pressable>
      </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Row({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.row} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <Ionicons name={icon} size={22} color={colors.navy} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textSub} style={styles.rowChevron} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(10,18,40,0.45)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '85%',
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.card + 8,
    borderTopRightRadius: radius.card + 8,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  title: { ...typography.cardTitle, color: colors.navy },
  subtitle: { ...typography.metadata, color: colors.textSub, marginTop: 2, marginBottom: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  rowLabel: { ...typography.body, fontWeight: '600', color: colors.navy, flex: 1 },
  rowChevron: { marginLeft: spacing.sm },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  cancelBtn: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  cancelText: { fontSize: 16, fontWeight: '700', color: colors.textSub },
});
