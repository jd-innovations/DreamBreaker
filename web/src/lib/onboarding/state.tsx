"use client";

// Onboarding draft context.
//
// Ported from `apps/mobile/src/lib/onboarding/state.tsx` (`update`,
// `toggleInList` with a max cap), with the two web differences documented in
// draft.ts: nothing is pre-selected, and `touched` is tracked separately from
// value so an untouched field is never written.
//
// Persistence is debounced rather than written on every keystroke — the draft
// is small, but a text field would otherwise hit localStorage on every
// character.

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import {
  INITIAL_DRAFT, type OnboardingDraft, type DraftField,
} from "./draft";
import { loadDraft, saveDraft, clearDraft } from "./persistence";

const SAVE_DEBOUNCE_MS = 250;

type OnboardingContextValue = {
  draft: OnboardingDraft;
  touched: ReadonlySet<DraftField>;
  /** True until the persisted draft has been read, so steps do not flash empty
   *  before a resumed answer appears. */
  hydrating: boolean;
  /** The step the user last reached, for resuming. */
  lastStep: string | null;
  update: <K extends DraftField>(key: K, value: OnboardingDraft[K]) => void;
  toggleInList: (key: "playingStyle" | "availability" | "intent", value: string, max?: number) => void;
  setLastStep: (slug: string) => void;
  /** Identity stamp, so a draft cannot be flushed onto another account. */
  stampIdentity: (identity: { userId?: string | null; email?: string | null }) => void;
  reset: () => void;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [draft, setDraft] = useState<OnboardingDraft>(INITIAL_DRAFT);
  const [touched, setTouched] = useState<Set<DraftField>>(new Set());
  const [hydrating, setHydrating] = useState(true);
  const [lastStep, setLastStepState] = useState<string | null>(null);

  const identityRef = useRef<{ userId: string | null; email: string | null }>({
    userId: null,
    email: null,
  });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate once, after mount.
  //
  // This cannot be a lazy `useState` initializer: localStorage does not exist
  // during SSR, so the server would render an empty draft and the client would
  // render a populated one — a hydration mismatch. Reading it in an effect is
  // the documented way to sync from a browser-only external system, which is
  // exactly what the rule below permits in prose and flags in code.
  useEffect(() => {
    const stored = loadDraft();
    /* eslint-disable react-hooks/set-state-in-effect -- reading an external
       store (localStorage) that does not exist during render. */
    if (stored) {
      setDraft(stored.draft);
      setTouched(new Set(stored.touched));
      setLastStepState(stored.lastStep);
      identityRef.current = { userId: stored.userId, email: stored.email };
    }
    setHydrating(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Debounced persist. Skipped while hydrating so the initial empty draft never
  // overwrites a stored one.
  useEffect(() => {
    if (hydrating) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveDraft({
        userId: identityRef.current.userId,
        email: identityRef.current.email,
        draft,
        touched: Array.from(touched),
        lastStep,
      });
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [draft, touched, lastStep, hydrating]);

  const update = useCallback(
    <K extends DraftField>(key: K, value: OnboardingDraft[K]) => {
      setDraft((prev) => ({ ...prev, [key]: value }));
      setTouched((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
    },
    [],
  );

  const toggleInList = useCallback(
    (key: "playingStyle" | "availability" | "intent", value: string, max?: number) => {
      setDraft((prev) => {
        const list = prev[key];
        const has = list.includes(value);
        // Toggling off always works; toggling on is ignored at the cap, matching
        // mobile's toggleInList.
        if (!has && max != null && list.length >= max) return prev;
        return { ...prev, [key]: has ? list.filter((v) => v !== value) : [...list, value] };
      });
      setTouched((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
    },
    [],
  );

  const setLastStep = useCallback((slug: string) => setLastStepState(slug), []);

  const stampIdentity = useCallback(
    (identity: { userId?: string | null; email?: string | null }) => {
      identityRef.current = {
        userId: identity.userId ?? identityRef.current.userId,
        email: identity.email ?? identityRef.current.email,
      };
    },
    [],
  );

  const reset = useCallback(() => {
    setDraft(INITIAL_DRAFT);
    setTouched(new Set());
    setLastStepState(null);
    identityRef.current = { userId: null, email: null };
    clearDraft();
  }, []);

  const value = useMemo<OnboardingContextValue>(
    () => ({ draft, touched, hydrating, lastStep, update, toggleInList, setLastStep, stampIdentity, reset }),
    [draft, touched, hydrating, lastStep, update, toggleInList, setLastStep, stampIdentity, reset],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error("useOnboarding must be used inside <OnboardingProvider>");
  return ctx;
}
