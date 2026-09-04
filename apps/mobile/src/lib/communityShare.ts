import type { PlayEvent } from '@/lib/supabase/playEvents';
import { appLinks } from '@/lib/appLinks';

export type CommunityEventType = 'open_play' | 'round_robin' | 'mini_tournament';

export function getCommunityEventRoute(eventType: string, eventId: string): string {
  switch (eventType) {
    case 'open_play':       return `/quick-game-created?id=${eventId}`;
    case 'round_robin':     return `/round-robin-created?id=${eventId}`;
    case 'mini_tournament': return `/mini-tournament-created?id=${eventId}`;
    default:                return `/quick-game-created?id=${eventId}`;
  }
}

function fmtEventDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function fmtEventTime(timeStr: string | null | undefined): string {
  if (!timeStr) return '';
  try {
    const [h, min] = timeStr.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hr   = h % 12 || 12;
    return `${hr}:${String(min).padStart(2, '0')} ${ampm}`;
  } catch {
    return timeStr;
  }
}

function eventTypeLabel(eventType: string): string {
  switch (eventType) {
    case 'open_play':       return 'Quick Game';
    case 'round_robin':     return 'Round Robin';
    case 'mini_tournament': return 'Mini Tournament';
    case 'clinic':          return 'Clinic';
    default:                return 'Game';
  }
}

export function createCommunityShareMessage(event: PlayEvent): string {
  const type    = event.event_type ?? 'open_play';
  const label   = eventTypeLabel(type);
  const name    = event.name ?? label;
  const date    = fmtEventDate(event.event_date);
  const time    = fmtEventTime(event.start_time);
  const loc     = event.venue_name ?? '';
  const link    = appLinks.communityEvent(event.id);

  const parts: string[] = [
    `Join my ${label} "${name}" on Pickleball App!`,
  ];
  if (date && time) parts.push(`${date} at ${time}`);
  else if (date)    parts.push(date);
  if (loc)          parts.push(`📍 ${loc}`);
  parts.push(`\nOpen in Pickleball App: ${link}`);

  return parts.join('\n');
}
