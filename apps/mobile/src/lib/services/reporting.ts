// Reporting a person (TODO1.1 item 4.3).
//
// Reports already existed for group posts (groupService) and marketplace
// listings (marketplace/listingService), and the admin console already reads
// user_reports and acts on them. What was missing was the two most personal
// surfaces: a profile, and a direct message thread.
//
// That gap mattered twice over. A user being harassed in DMs could block —
// which only began working in 20260831040000 — but could not report, and
// blocking protects you while reporting is what gets someone removed. And App
// Store Guideline 1.2 requires a way to report offensive user-generated content
// in an app that has any; this app has DMs, group posts and profiles.
//
// No migration was needed. user_reports already carries reporter_id,
// reported_id, conversation_id, reason and notes, and its RLS already allows
// "reporters can insert own reports" and "admins can manage all reports".

import { supabase } from '@/lib/supabase';
import type { Database } from '@shared/database.types';

export type ReportReason = Database['public']['Enums']['report_reason'];

/**
 * The reasons offered when reporting a PERSON.
 *
 * A deliberate subset. The enum also carries counterfeit, mislabeled and
 * price_gouging, which are marketplace listing problems — offering them here
 * would produce reports an admin cannot act on, and would push someone with a
 * real harassment complaint through a list of irrelevant options.
 */
export const PERSON_REPORT_REASONS: { value: ReportReason; label: string; hint: string }[] = [
  { value: 'harassment', label: 'Harassment or bullying', hint: 'Threats, intimidation, or repeated unwanted contact' },
  { value: 'hate_speech', label: 'Hate speech', hint: 'Attacks based on identity' },
  { value: 'spam_or_inappropriate', label: 'Spam or inappropriate content', hint: 'Scams, adverts, or explicit material' },
  { value: 'impersonation', label: 'Impersonation', hint: 'Pretending to be someone else' },
  { value: 'other', label: 'Something else', hint: 'Tell us what happened' },
];

export type ReportUserParams = {
  reporterId: string;
  reportedId: string;
  reason: ReportReason;
  /** Included when reporting from a thread, so an admin can see the context. */
  conversationId?: string | null;
  notes?: string | null;
};

/**
 * Files a report.
 *
 * `notes` is the one free-text field in this flow and it is sent verbatim, on
 * purpose: an admin cannot judge a harassment report without the words that
 * were used. It is NOT analytics — the support_ticket_submitted event and the
 * Sentry scrubber both strip free text, and nothing here goes near either.
 */
export async function reportUser(params: ReportUserParams): Promise<void> {
  const { error } = await supabase.from('user_reports').insert({
    reporter_id: params.reporterId,
    reported_id: params.reportedId,
    conversation_id: params.conversationId ?? null,
    reason: params.reason,
    notes: params.notes?.trim() ? params.notes.trim() : null,
  });
  if (error) throw error;
}
