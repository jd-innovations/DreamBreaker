// §16 event contract. No analytics SDK exists in this codebase yet (§2 of
// SUPPORT_EXPERIENCE_ARCHITECTURE.md) -- this is the seam future
// instrumentation (Segment/PostHog/a Supabase events table) plugs into.
// Call sites never change when a real sink lands; only trackSupportEvent's
// body does. No PII in any payload -- IDs and enums only.

export type SupportAnalyticsEvent =
  | { name: 'support_button_shown'; payload: { routeName: string; feature: string } }
  | { name: 'support_button_tapped'; payload: { routeName: string; feature: string } }
  | { name: 'support_sheet_opened'; payload: { routeName: string; feature: string } }
  | { name: 'support_sheet_dismissed'; payload: { routeName: string; feature: string; durationMs: number } }
  | { name: 'support_quick_action_tapped'; payload: { feature: string; actionId: string } }
  | { name: 'support_report_started'; payload: { feature: string; entityType?: string } }
  | {
      name: 'support_report_submitted';
      payload: { category: string; feature: string; hasAttachment: boolean; hasErrorCode: boolean };
    }
  | { name: 'support_report_abandoned'; payload: { feature: string; step: string } }
  | { name: 'support_ticket_viewed'; payload: { ticketId: string } };

export function trackSupportEvent(event: SupportAnalyticsEvent): void {
  if (__DEV__) {
    console.log(`[support] ${event.name}`, event.payload);
  }
}
