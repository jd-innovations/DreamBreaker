// One interrupting overlay per page view. The onboarding nudge and the
// "get the app" prompt both mount from the root layout and appear on a timer;
// whichever claims first wins and the other stays quiet. Module state, so it
// lasts for the tab's lifetime, which is the point: never two in one visit.

let holder: string | null = null;

export function claimOverlay(id: string): boolean {
  if (holder && holder !== id) return false;
  holder = id;
  return true;
}
