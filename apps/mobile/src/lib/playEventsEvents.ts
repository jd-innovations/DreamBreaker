// Same pattern as lib/profileEvents.ts. Lets a screen that changes the
// current user's join status on a play event (join, leave, guest-join) tell
// Home's community-cards list to treat its next focus as stale, bypassing the
// F3 freshness window instead of waiting out the timer.
type Listener = () => void;
const listeners = new Set<Listener>();

export function notifyPlayEventsUpdated() {
  listeners.forEach(l => l());
}

export function onPlayEventsUpdated(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
