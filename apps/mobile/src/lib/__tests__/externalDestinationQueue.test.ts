import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExternalDestination } from '../externalRouting';

// expo-router is a native module; this suite is about the queue's ORDERING,
// which is plain module state and needs no router.
vi.mock('expo-router', () => ({ router: { push: vi.fn() } }));

const dest = (href: string, requiresAuth = true): ExternalDestination =>
  ({ href, type: 'wallet', requiresAuth } as ExternalDestination);

// Module-level state, so each test gets a fresh copy.
async function freshModule() {
  vi.resetModules();
  return import('../externalRouting');
}

describe('the external-destination queue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('holds a destination enqueued before anyone subscribes, then delivers it', async () => {
    // THE COLD START: getLastNotificationResponseAsync fires the tap before
    // useExternalLinks has mounted. Dropping it here would make tapping a
    // notification from a terminated app do nothing — the commonest way an
    // app is opened from a notification.
    const { enqueueExternalDestination, subscribeExternalDestinations } = await freshModule();
    const seen: ExternalDestination[] = [];

    enqueueExternalDestination(dest('/wallet'));
    expect(seen).toHaveLength(0);

    subscribeExternalDestinations((d) => seen.push(d));
    expect(seen.map((d) => d.href)).toEqual(['/wallet']);
  });

  it('delivers straight through once subscribed', async () => {
    const { enqueueExternalDestination, subscribeExternalDestinations } = await freshModule();
    const seen: ExternalDestination[] = [];

    subscribeExternalDestinations((d) => seen.push(d));
    enqueueExternalDestination(dest('/stats'));

    expect(seen.map((d) => d.href)).toEqual(['/stats']);
  });

  it('does not replay a queued destination twice', async () => {
    const { enqueueExternalDestination, subscribeExternalDestinations } = await freshModule();
    const first: ExternalDestination[] = [];
    const second: ExternalDestination[] = [];

    enqueueExternalDestination(dest('/wallet'));
    subscribeExternalDestinations((d) => first.push(d))();
    // The hook re-subscribes on every auth/pathname change; the tap must not
    // fire again each time or a person is yanked back to the same screen.
    subscribeExternalDestinations((d) => second.push(d));

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
  });

  it('keeps only the most recent pre-mount destination', async () => {
    const { enqueueExternalDestination, subscribeExternalDestinations } = await freshModule();
    const seen: ExternalDestination[] = [];

    enqueueExternalDestination(dest('/wallet'));
    enqueueExternalDestination(dest('/stats'));
    subscribeExternalDestinations((d) => seen.push(d));

    // The second tap is the one the person actually chose.
    expect(seen.map((d) => d.href)).toEqual(['/stats']);
  });

  it('stops delivering after unsubscribe, and queues again', async () => {
    const { enqueueExternalDestination, subscribeExternalDestinations } = await freshModule();
    const seen: ExternalDestination[] = [];

    const unsubscribe = subscribeExternalDestinations((d) => seen.push(d));
    unsubscribe();
    enqueueExternalDestination(dest('/membership'));
    expect(seen).toHaveLength(0);

    subscribeExternalDestinations((d) => seen.push(d));
    expect(seen.map((d) => d.href)).toEqual(['/membership']);
  });

  it('a stale unsubscribe does not detach the current listener', async () => {
    // React runs the new effect before cleaning up the old one in some
    // orderings. If the stale cleanup cleared the listener unconditionally,
    // every push tap after a re-render would be silently dropped.
    const { enqueueExternalDestination, subscribeExternalDestinations } = await freshModule();
    const older: ExternalDestination[] = [];
    const newer: ExternalDestination[] = [];

    const unsubscribeOlder = subscribeExternalDestinations((d) => older.push(d));
    subscribeExternalDestinations((d) => newer.push(d));
    unsubscribeOlder();

    enqueueExternalDestination(dest('/profile'));

    expect(older).toHaveLength(0);
    expect(newer.map((d) => d.href)).toEqual(['/profile']);
  });
});
