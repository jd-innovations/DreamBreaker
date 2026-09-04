import { supabase } from './supabase';
import { track } from './analytics';
import { sendMessage } from './conversationService';
import type { Database, Json } from '@shared/database.types';
import type { SupportContext } from './support/supportContext';
import type { DiagnosticsSnapshot } from './support/supportDiagnostics';

export type SupportTicketCategory = Database['public']['Enums']['support_ticket_category'];
export type SupportTicketStatus = Database['public']['Enums']['support_ticket_status'];
export type SupportTicketSource = 'help_screen' | 'floating_button';

// Shared with app/support/new-ticket.tsx and components/support/ReportProblemForm.tsx
// so the category list/labels live in exactly one place.
export const SUPPORT_TICKET_CATEGORIES: { key: SupportTicketCategory; label: string }[] = [
  { key: 'account', label: 'Account & Profile' },
  { key: 'tournaments', label: 'Tournaments' },
  { key: 'partners_matches', label: 'Partners & Matches' },
  { key: 'payments', label: 'Payments' },
  { key: 'bug', label: 'Bug Report' },
  { key: 'feedback', label: 'Feedback' },
  { key: 'other', label: 'Other' },
];

export type SupportTicket = {
  id: string;
  conversation_id: string;
  subject: string;
  category: SupportTicketCategory;
  status: SupportTicketStatus;
  // Plain `text` in Postgres, not an enum -- SupportTicketSource is only the
  // input contract for createSupportTicket, not a guarantee on read.
  source: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

const TICKET_COLUMNS = 'id, conversation_id, subject, category, status, source, created_at, updated_at, resolved_at';

export async function createSupportTicket(
  userId: string,
  subject: string,
  category: SupportTicketCategory,
  firstMessage: string,
  options?: {
    /** Approved SupportContext snapshot -- only ever what the "what we'll include" disclosure showed the user (§12). */
    context?: SupportContext;
    diagnostics?: DiagnosticsSnapshot;
    source?: SupportTicketSource;
  },
): Promise<SupportTicket> {
  const { data: conversation, error: conversationError } = await supabase
    .from('conversations')
    .insert({
      conversation_type: 'support',
      created_by: userId,
      title: subject,
    })
    .select('id')
    .single();

  if (!conversation) throw new Error(conversationError?.message ?? 'Failed to start support conversation');

  // Required for push notifications: notify_new_message() resolves recipients
  // via participant_a/b/conversation_participants only, not created_by — so
  // without this row the reporter would never be pushed on an admin reply.
  const { error: participantError } = await supabase
    .from('conversation_participants')
    .upsert(
      { conversation_id: conversation.id, user_id: userId, role: 'member' },
      { onConflict: 'conversation_id,user_id' },
    );
  if (participantError) throw new Error(participantError.message);

  const { data: ticket, error: ticketError } = await supabase
    .from('support_tickets')
    .insert({
      user_id: userId,
      conversation_id: conversation.id,
      subject,
      category,
      context: (options?.context as unknown as Json) ?? null,
      diagnostics: (options?.diagnostics as unknown as Json) ?? null,
      source: options?.source ?? 'help_screen',
    })
    .select(TICKET_COLUMNS)
    .single();

  if (!ticket) throw new Error(ticketError?.message ?? 'Failed to create support ticket');

  await sendMessage(conversation.id, userId, firstMessage);

  // Category only. The subject and the first message are the two fields most
  // likely to contain someone's name, address or payment complaint verbatim,
  // and ticket_category is a fixed vocabulary — see ALLOWED_PROPERTY_KEYS.
  track('support_ticket_submitted', {
    ticket_category: category,
    ticket_id: ticket.id,
    source: options?.source ?? 'unknown',
  });

  return ticket;
}

export async function fetchMyTickets(userId: string): Promise<SupportTicket[]> {
  const { data, error } = await supabase
    .from('support_tickets')
    .select(TICKET_COLUMNS)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchTicket(ticketId: string): Promise<SupportTicket> {
  const { data, error } = await supabase
    .from('support_tickets')
    .select(TICKET_COLUMNS)
    .eq('id', ticketId)
    .single();

  if (!data) throw new Error(error?.message ?? 'Ticket not found');
  return data;
}
