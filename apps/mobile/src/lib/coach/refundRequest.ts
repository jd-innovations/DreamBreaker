import { supabase } from '@/lib/supabase';
import { createSupportTicket } from '@/lib/supportTicketService';

// Coach Marketplace Phase 7 — a buyer asking for a refund.
//
// Spec §27: an unused purchase is non-refundable by default and exceptions run
// through an admin-mediated process. So this deliberately does NOT refund
// anything — it files a request an admin decides on, using the support queue
// that already has a reviewer, a status, an assignee and a reply thread.
// Building a second inbox for this would mean a second inbox to abandon.
//
// The refund itself is executed separately, by an admin, through
// refund-coach-purchase, which re-checks authorization server-side.

export type RefundReason = 'coach_no_show' | 'coach_cancelled' | 'technical_issue' | 'other';

export const REFUND_REASONS: { key: RefundReason; label: string }[] = [
  { key: 'coach_cancelled', label: 'The coach cancelled' },
  { key: 'coach_no_show',   label: 'The coach did not show up' },
  { key: 'technical_issue', label: 'Something went wrong with the app' },
  { key: 'other',           label: 'Something else' },
];

export type SubmitRefundRequestInput = {
  userId: string;
  purchaseId: string;
  walletItemId: string;
  offerTitle: string;
  coachName: string;
  reason: RefundReason;
  details: string;
};

export async function submitRefundRequest(input: SubmitRefundRequestInput): Promise<{ ok: true } | { ok: false; message: string }> {
  const label = REFUND_REASONS.find(r => r.key === input.reason)?.label ?? input.reason;

  try {
    await createSupportTicket(
      input.userId,
      `Refund request: ${input.offerTitle}`,
      // No 'refund' category exists in support_ticket_category; payments is the
      // closest true fit and keeps these out of the generic feedback pile.
      'payments',
      `${label}\n\nCoach: ${input.coachName}\n\n${input.details.trim()}`,
      {
        context: {
          routeName: `/wallet/${input.walletItemId}`,
          feature: 'coach_marketplace',
          entityType: 'coach_offer_purchase',
          // The purchase id is what an admin needs to action this — it is the
          // argument refund-coach-purchase takes. Without it they would be
          // searching for the row by hand.
          entityId: input.purchaseId,
          entityLabel: input.offerTitle,
          action: 'refund_request',
          metadata: { reason: input.reason },
        },
        source: 'help_screen',
      },
    );
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message
      : err && typeof err === 'object' && 'message' in err ? String((err as { message?: unknown }).message)
      : 'Could not send your request. Please try again.';
    return { ok: false, message };
  }
}

/** Whether this wallet item already has a refund request or completed refund. */
export async function fetchRefundState(purchaseId: string): Promise<'none' | 'pending' | 'completed'> {
  const { data } = await supabase
    .from('coach_refunds')
    .select('status')
    .eq('purchase_id', purchaseId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return 'none';
  return data.status === 'completed' ? 'completed' : data.status === 'pending' ? 'pending' : 'none';
}
