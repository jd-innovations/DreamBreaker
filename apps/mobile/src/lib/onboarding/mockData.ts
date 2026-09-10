// Static option lists + mock data for the onboarding flow (local state only,
// no backend). Kept separate from state.tsx so screens can import just the
// options they render without pulling in the context.

export const GENDER_OPTIONS = [
  { key: 'male',            label: 'Male',              icon: 'male-outline' as const },
  { key: 'female',          label: 'Female',            icon: 'female-outline' as const },
  { key: 'prefer_not_to_say', label: 'Prefer not to say', icon: 'help-circle-outline' as const },
  { key: 'another',         label: 'Another gender',    icon: 'ellipsis-horizontal-circle-outline' as const },
];

export const SELF_RATING_OPTIONS = [
  { key: 'beginner', label: 'Beginner' },
  { key: '2.5-below', label: '2.5 & Below' },
  { key: '3.0-3.5', label: '3.0-3.5' },
  { key: '3.5-4.0', label: '3.5-4.0' },
  { key: '4.0-4.5', label: '4.0-4.5' },
  { key: '4.5-plus', label: '4.5+' },
];

// PLAYING_STYLE_OPTIONS / PLAYING_STYLE_MAX lived here until 2026-09-10. Every
// option in that list was a preferred_format or a play_intensity -- none was a
// play_style key -- so profiles.play_style was never populated by onboarding.
// The screen now reads the real vocabulary from @shared/play-profile; see
// playing-style.tsx.

export const AVAILABILITY_OPTIONS = [
  { key: 'weekdays',  label: 'Weekdays',  icon: 'briefcase-outline' as const },
  { key: 'weekends',  label: 'Weekends',  icon: 'sunny-outline' as const },
  { key: 'mornings',  label: 'Mornings',  icon: 'partly-sunny-outline' as const },
  { key: 'afternoons', label: 'Afternoons', icon: 'sunny-outline' as const },
  { key: 'evenings',  label: 'Evenings',  icon: 'moon-outline' as const },
  { key: 'nights',    label: 'Nights',    icon: 'cloudy-night-outline' as const },
];

export const INTENT_OPTIONS = [
  { key: 'find_partners',   label: 'Find Playing Partners', icon: 'people-outline' as const },
  { key: 'find_community',  label: 'Find Community Play',   icon: 'pickleball' as const },
  { key: 'play_tournaments', label: 'Play Tournaments',      icon: 'trophy-outline' as const },
  { key: 'discover_courts', label: 'Discover Courts',       icon: 'location-outline' as const },
  { key: 'join_groups',     label: 'Join Groups',           icon: 'person-add-outline' as const },
  { key: 'meet_players',    label: 'Meet Local Players',    icon: 'happy-outline' as const },
];

// â”€â”€â”€ Screen 14 mock activity states â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Real implementation should derive this from live facility activity data
// (player counts, upcoming play events) â€” see DATA_GAPS.md.

export type ActivityLevel = 'high' | 'medium' | 'low';

export type CourtActivityMock = {
  playersHere: number;
  gamesNow: number;
  nextGameTime: string | null;
  matchFitPct: number | null;
  ctaLabel: string;
  ctaColor: 'green' | 'orange' | 'blue';
};

export const ACTIVITY_MOCKS: Record<ActivityLevel, CourtActivityMock> = {
  high: {
    playersHere: 3,
    gamesNow: 3,
    nextGameTime: '6:30 PM',
    matchFitPct: 92,
    ctaLabel: 'See Who’s Playing',
    ctaColor: 'green',
  },
  medium: {
    playersHere: 1,
    gamesNow: 1,
    nextGameTime: '6:30 PM',
    matchFitPct: 78,
    ctaLabel: 'Join Today’s Community Play',
    ctaColor: 'orange',
  },
  low: {
    playersHere: 0,
    gamesNow: 0,
    nextGameTime: null,
    matchFitPct: null,
    ctaLabel: 'Create the First Community Play',
    ctaColor: 'blue',
  },
};
