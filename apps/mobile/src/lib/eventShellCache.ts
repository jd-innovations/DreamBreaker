import type { ImageSourcePropType } from 'react-native';

// F7 fix (PERFORMANCE_REGRESSION_AUDIT.md, fix item 3): list screens that
// render a play-event card already know its title/photo/datetime/venue
// before the user taps it. This module lets the detail screen read that data
// back on mount instead of showing a full-screen loader over a screen the
// user already recognizes. Deliberately a plain in-memory cache, not a
// store: it is a hint for the FIRST paint only, never a source of truth —
// the detail screen still fetches and renders real data exactly as before.
export type EventShell = {
  name: string;
  photo: ImageSourcePropType;
  datetime: string;
  venue: string;
};

const cache = new Map<string, EventShell>();

export function setEventShell(id: string, shell: EventShell): void {
  cache.set(id, shell);
}

export function getEventShell(id: string | undefined | null): EventShell | undefined {
  if (!id) return undefined;
  return cache.get(id);
}
