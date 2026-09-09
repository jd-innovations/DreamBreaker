// Same pattern as lib/playEventsEvents.ts and lib/profileEvents.ts: a mutation
// anywhere tells every mounted listing surface that its data is stale.
//
// Why this is needed: the Marketplace tab loads once on mount and only refetches
// when a filter changes — its useFocusEffect just toggles the slide-menu
// trigger. Publishing from the create flow ends on router.replace() to the new
// listing's detail screen, so the tab underneath is never remounted and never
// re-focused into a reload. A freshly published listing therefore did not appear
// until pull-to-refresh or a filter change.
//
// Fired from the mutating functions in listingService rather than from each
// screen, so any future call site gets the refresh for free instead of having
// to remember.

type Listener = () => void;

const listeners = new Set<Listener>();

/** Call after any create / update / status change / delete of a listing. */
export function notifyListingsUpdated(): void {
  listeners.forEach((l) => l());
}

/** Subscribe a screen to listing mutations. Returns an unsubscribe function. */
export function onListingsUpdated(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
