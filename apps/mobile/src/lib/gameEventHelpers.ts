import { colors } from '@/theme';
import { getCurrentGame } from './quickGameStore';
import { getRoundRobin }   from './roundRobinStore';
import { getMiniTournament } from './miniTournamentStore';
import { getHeldSpots } from './tournamentStore';

export type GameCard = {
  id: string;
  route: string;
  source?: 'local';
  type: string;
  logoBg: string;
  logoColor: string;
  logoLines: string[];
  title: string;
  badgeLabel: string;
  badgeBg: string;
  badgeColor: string;
  subtitle: string;
  date: string;
  location: string;
  capacity?: string;
  result?: { label: string; record: string; points: string };
  typeTagBg?: string;
  typeTagColor?: string;
};

const BLUE    = '#2563EB';
const BLUE_BG = '#DBEAFE';
const RR_BLUE  = '#2563EB';
const MT_RED   = '#DC2626';

export function getUpcomingEvents(): GameCard[] {
  const cards: GameCard[] = [];

  const qg = getCurrentGame();
  if (qg?.status === 'open') {
    cards.push({
      id:         qg.id,
      route:      `/quick-game/${qg.id}/roster`,
      type:       'QUICK GAME',
      logoBg:     colors.navy,
      logoColor:  colors.gold,
      logoLines:  ['QUICK', 'GAME'],
      title:      qg.title,
      badgeLabel: 'Open',
      badgeBg:    colors.successBg,
      badgeColor: colors.success,
      subtitle:   `${qg.skillRange}  •  ${qg.currentPlayers} / ${qg.playersNeeded} Players`,
      date:       `${qg.date} • ${qg.startTime}`,
      location:   qg.locationName,
      capacity:   `${qg.currentPlayers} / ${qg.playersNeeded}`,
    });
  }

  const rr = getRoundRobin();
  if (rr?.status === 'open') {
    cards.push({
      id:           rr.id,
      route:        `/round-robin/${rr.id}/schedule`,
      type:         'ROUND ROBIN',
      logoBg:       '#166534',
      logoColor:    '#BBF7D0',
      logoLines:    ['ROUND', 'ROBIN'],
      title:        rr.title,
      badgeLabel:   "You're Playing",
      badgeBg:      BLUE_BG,
      badgeColor:   BLUE,
      subtitle:     `${rr.skillRange}  •  ${rr.currentPlayers} / ${rr.maxPlayers} Players`,
      date:         `${rr.date} • ${rr.startTime}`,
      location:     rr.locationName,
      capacity:     `${rr.currentPlayers} / ${rr.maxPlayers}`,
      typeTagBg:    RR_BLUE,
      typeTagColor: '#fff',
    });
  }

  const mt = getMiniTournament();
  if (mt?.status === 'open') {
    cards.push({
      id:           mt.id,
      route:        `/mini-tournament/${mt.id}/bracket`,
      type:         'MINI TOURNAMENT',
      logoBg:       '#7C3AED',
      logoColor:    '#DDD6FE',
      logoLines:    ['MINI', 'TOURN'],
      title:        mt.title,
      badgeLabel:   'Registered',
      badgeBg:      BLUE_BG,
      badgeColor:   BLUE,
      subtitle:     `${mt.singlesOrDoubles}  •  ${mt.skillRange}`,
      date:         `${mt.date} • ${mt.startTime}`,
      location:     mt.locationName,
      capacity:     `${mt.currentPlayers} / ${mt.maxPlayers}`,
      typeTagBg:    MT_RED,
      typeTagColor: '#fff',
    });
  }

  // Group events are real play_events rows (group_id-linked) and already
  // surface through the Supabase upcoming/joined event queries elsewhere in
  // games.tsx — no separate mock card needed here.

  return cards;
}

export function getHeldSpotCards(): GameCard[] {
  return getHeldSpots().map(spot => ({
    id:         spot.id,
    route:      `/tournament/${spot.tournamentId}`,
    type:       'TOURNAMENT',
    logoBg:     colors.navy,
    logoColor:  colors.gold,
    logoLines:  [spot.tournamentName.split(' ')[0].toUpperCase(), 'HOLD'],
    title:      spot.tournamentName,
    badgeLabel: `$${Math.round(spot.holdAmountCents / 100)} Deposit Paid`,
    badgeBg:    colors.successBg,
    badgeColor: colors.success,
    subtitle:   `${spot.divisionName}  •  ${spot.divisionLevel}`,
    date:       spot.date,
    location:   spot.city ? `${spot.venue}, ${spot.city}` : spot.venue,
  }));
}

export function getCompletedEvents(): GameCard[] {
  const cards: GameCard[] = [];

  const rr = getRoundRobin();
  if (rr?.status === 'completed') {
    cards.push({
      id:           rr.id,
      route:        `/round-robin/${rr.id}/results`,
      type:         'ROUND ROBIN',
      logoBg:       '#166534',
      logoColor:    '#BBF7D0',
      logoLines:    ['ROUND', 'ROBIN'],
      title:        rr.title,
      badgeLabel:   'Completed',
      badgeBg:      colors.successBg,
      badgeColor:   colors.success,
      subtitle:     `${rr.skillRange}  •  ${rr.currentPlayers} Players`,
      date:         rr.date,
      location:     rr.locationName,
      typeTagBg:    RR_BLUE,
      typeTagColor: '#fff',
    });
  }

  const mt = getMiniTournament();
  if (mt?.status === 'completed') {
    cards.push({
      id:           mt.id,
      route:        `/mini-tournament/${mt.id}/results`,
      type:         'MINI TOURNAMENT',
      logoBg:       '#7C3AED',
      logoColor:    '#DDD6FE',
      logoLines:    ['MINI', 'TOURN'],
      title:        mt.title,
      badgeLabel:   'Completed',
      badgeBg:      colors.successBg,
      badgeColor:   colors.success,
      subtitle:     `${mt.singlesOrDoubles}  •  ${mt.skillRange}`,
      date:         mt.date,
      location:     mt.locationName,
      typeTagBg:    MT_RED,
      typeTagColor: '#fff',
    });
  }

  return cards;
}
