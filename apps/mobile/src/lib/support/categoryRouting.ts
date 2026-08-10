import type { SupportTicketCategory } from '../supportTicketService';
import type { SupportContext } from './supportContext';

// §14 routing table: category-based, not AI-based, for V1. The Support Sheet
// shows this as a starting point the user can override before submitting --
// it's a suggestion, not a silent routing decision.
const FEATURE_CATEGORY_MAP: Partial<Record<string, SupportTicketCategory>> = {
  tournament: 'tournaments',
  tournament_division: 'tournaments',
  tournament_bracket: 'tournaments',
  community_play: 'tournaments',
  community_play_event: 'tournaments',
  quick_game: 'tournaments',
  mini_tournament: 'tournaments',
  round_robin: 'tournaments',
  score_entry: 'tournaments',
  director: 'tournaments',
  event_creation: 'tournaments',
  partner_finder: 'partners_matches',
  messaging: 'partners_matches',
  wallet: 'payments',
  payment: 'payments',
  profile: 'account',
  profile_edit: 'account',
  account: 'account',
};

export function suggestSupportCategory(context: SupportContext | null): SupportTicketCategory {
  if (context?.errorCode) return 'bug';
  const mapped = context?.feature ? FEATURE_CATEGORY_MAP[context.feature] : undefined;
  return mapped ?? 'bug';
}
