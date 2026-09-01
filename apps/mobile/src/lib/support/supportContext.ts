import { useEffect, useRef, useSyncExternalStore } from 'react';
import { usePathname } from 'expo-router';

// Phase 0 of the context-aware floating support system
// (SUPPORT_EXPERIENCE_ARCHITECTURE.md §6/§11/§19). This module owns the
// registry only -- no UI reads from it yet. Screens will start calling
// useSupportContext() in Phase 3, once FloatingSupportButton (Phase 1) and
// the Support Sheet (Phase 2) exist to consume it.

export type SupportVisibility = 'visible' | 'minimized' | 'hidden';

export type SupportContext = {
  routeName: string;
  feature: string;
  entityType?: string;
  entityId?: string;
  entityLabel?: string;
  action?: string;
  errorCode?: string;
  visibility?: SupportVisibility;
  /**
   * Extra space (px) the floating button must keep clear at the bottom of
   * this screen, on top of the safe-area inset it already respects.
   *
   * The button is mounted once globally and knows only about the tab bar, so
   * a screen with its own bottom-anchored UI — a fixed CTA bar, a composer —
   * would otherwise have the button land on top of it. Declaring the height
   * here moves the button instead of moving the content.
   *
   * Prefer a MEASURED height (onLayout) over a constant: the tournament
   * screen's CTA bar changes height when its stack expands, and a hardcoded
   * number would be wrong in one of the two states. Round it before passing
   * it in — the registry re-registers whenever the serialized context
   * changes, and a fractional height would churn on every layout pass.
   */
  bottomClearance?: number;
  metadata?: Record<string, string | number | boolean>;
};

type Registration = {
  context: SupportContext;
  // Fixed at first mount, independent of later content updates, so a
  // screen re-rendering with new data (e.g. an entityLabel that just
  // finished loading) doesn't reorder ahead of a modal mounted after it.
  order: number;
};

let nextId = 0;
let nextOrder = 0;
const registrations = new Map<number, Registration>();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Last-mounted screen wins for overlapping fields -- a modal pushed on top
// of, say, a tournament screen naturally takes over the acknowledgment line
// in the support panel, per §11.
function getSnapshot(): SupportContext | null {
  let latest: Registration | null = null;
  for (const registration of registrations.values()) {
    if (!latest || registration.order > latest.order) latest = registration;
  }
  return latest?.context ?? null;
}

function getServerSnapshot(): SupportContext | null {
  return null;
}

export type SupportContextInput = Omit<SupportContext, 'routeName'>;

/**
 * Registers this screen's support context for as long as it's mounted.
 * Call once per screen with an object literal -- re-renders with changed
 * fields update the registry without losing the screen's mount order.
 * `routeName` is filled in automatically from the current pathname; screens
 * never supply it themselves.
 */
export function useSupportContext(input: SupportContextInput): void {
  const idRef = useRef<number | undefined>(undefined);
  if (idRef.current === undefined) idRef.current = nextId++;
  const orderRef = useRef<number | undefined>(undefined);
  if (orderRef.current === undefined) orderRef.current = nextOrder++;

  const routeName = usePathname();
  const context: SupportContext = { ...input, routeName };
  const key = JSON.stringify(context);

  useEffect(() => {
    const id = idRef.current!;
    registrations.set(id, { context, order: orderRef.current! });
    notify();
    return () => {
      registrations.delete(id);
      notify();
    };
    // `context` is intentionally represented by `key` (its serialized
    // value) so callers can pass a fresh object literal every render
    // without re-registering on every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/** Reads the currently active support context (topmost-mounted screen), if any. */
export function useCurrentSupportContext(): SupportContext | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

interface VisibilityRule {
  pattern: RegExp;
  visibility: SupportVisibility;
}

// Default-deny: a route not matched below is treated as 'hidden' until it's
// explicitly opted in during the Phase 3 screen-by-screen rollout (§7/§23).
// Absence is a decision, not an oversight -- these are the only screens
// decided on so far, the ones the brief named outright as must-hide.
const SUPPORT_VISIBILITY_RULES: VisibilityRule[] = [
  { pattern: /^\/support(\/|$)/, visibility: 'hidden' },
  { pattern: /^\/help-support$/, visibility: 'hidden' },
  { pattern: /^\/sign-in$/, visibility: 'hidden' },
  { pattern: /^\/sign-up$/, visibility: 'hidden' },
  { pattern: /^\/forgot-password$/, visibility: 'hidden' },
  { pattern: /^\/reset-password$/, visibility: 'hidden' },
  { pattern: /^\/onboarding(-preview)?(\/|$)/, visibility: 'hidden' },
  // Full-bleed swipeable card deck -- the tab bar itself already hides here
  // (see (tabs)/_layout.tsx). A floating button would sit on top of and
  // intercept the deck's own swipe gesture, not just look cluttered, so this
  // is a static hide rather than something deferred to the Phase 3 rollout.
  { pattern: /^\/finder$/, visibility: 'hidden' },
];

export function resolveSupportVisibility(routeName: string): SupportVisibility {
  for (const rule of SUPPORT_VISIBILITY_RULES) {
    if (rule.pattern.test(routeName)) return rule.visibility;
  }
  return 'hidden';
}
