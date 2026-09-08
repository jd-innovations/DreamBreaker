import type { GameCard } from '@/lib/gameEventHelpers';
import { getPlayerRegStatusInfo, type PlayerRegStatusKey } from '@/lib/tournamentStatus';
import type { TournamentRegistration } from '@/lib/registrationStore';

// Maps a tournament registration onto the Events tab's card shape.
//
// The Events tab used to query play_events only, so a tournament you had
// registered for appeared in neither Upcoming nor Joined — on the tab called
// Events. Worse, a held spot that you then completed vanished from Held Spots
// and resurfaced nowhere. Tournaments were only reachable from the separate
// /my-tournaments screen.
//
// Deliberately a GameCard, not an SBGameCard: the Events tab renders the
// latter with CommunityCard, which is built around "N / M players" and "3
// spots left". A tournament registration has no such capacity to report, so it
// renders through EventRow instead, which shows a logo block, subtitle and
// date and omits capacity when it is absent.

const NAVY = '#0B1220';
const GOLD = '#C9A84C';

const VARIANT_COLORS: Record<string, { bg: string; color: string }> = {
  green: { bg: '#DCFCE7', color: '#16A34A' },
  gold:  { bg: '#FEF9C3', color: '#CA8A04' },
  gray:  { bg: '#F3F4F6', color: '#6B7280' },
  red:   { bg: '#FEE2E2', color: '#EF4444' },
};

export function registrationToGameCard(reg: TournamentRegistration): GameCard {
  const info = getPlayerRegStatusInfo(reg.status as PlayerRegStatusKey);
  const tone = VARIANT_COLORS[info?.variant ?? 'gray'] ?? VARIANT_COLORS.gray;

  return {
    id:         `reg:${reg.id}`,
    sortKey:    reg.eventDate,
    route:      `/tournament/${reg.tournamentId}`,
    type:       'TOURNAMENT',
    logoBg:     NAVY,
    logoColor:  GOLD,
    logoLines:  ['TOURN', 'AMENT'],
    title:      reg.tournamentName,
    badgeLabel: info?.label ?? 'Registered',
    badgeBg:    tone.bg,
    badgeColor: tone.color,
    // The division is the part a player actually needs reminding of — they may
    // be in one of several, and the tournament name alone does not say which.
    subtitle:   [reg.divisionName, reg.divisionLevel].filter(Boolean).join('  •  '),
    date:       reg.date,
    location:   [reg.venue, [reg.city, reg.state].filter(Boolean).join(', ')]
                  .filter(Boolean).join(' — '),
  };
}
