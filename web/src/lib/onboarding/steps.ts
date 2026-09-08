// The step registry.
//
// Order, copy and gating live here so the layout can derive the progress bar,
// the back/next targets and the "you skipped ahead" redirect from one array,
// instead of every page hardcoding its neighbours. Adding or reordering a step
// is a change to this file only.
//
// Welcome and Done are outside the numbered sequence deliberately: neither asks
// a question, and counting them would make the progress indicator lie.

import { validators, type OnboardingDraft } from "./draft";

export type OnboardingStep = {
  slug: string;
  path: string;
  /** Headline. Sentence-cased in the UI via font-display uppercase styling. */
  title: string;
  subtitle: string;
  canContinue: (draft: OnboardingDraft) => boolean;
  /** Steps a user may leave unanswered. */
  optional?: boolean;
};

export const WELCOME_PATH = "/onboarding";
export const DONE_PATH = "/onboarding/done";

export const STEPS: OnboardingStep[] = [
  {
    slug: "profile",
    path: "/onboarding/profile",
    title: "About you",
    subtitle: "Your name and date of birth. Age helps us group players fairly.",
    canContinue: validators.profile,
  },
  {
    slug: "rating",
    path: "/onboarding/rating",
    title: "Your level",
    subtitle: "Roughly where do you play? You can change this any time.",
    canContinue: validators.rating,
  },
  {
    slug: "area",
    path: "/onboarding/area",
    title: "Where you play",
    subtitle: "So we can show you players and courts nearby.",
    canContinue: validators.area,
    optional: true,
  },
  {
    slug: "style",
    path: "/onboarding/style",
    title: "How you play",
    subtitle: "Pick up to three. This shapes who we match you with.",
    canContinue: validators.style,
  },
  {
    slug: "availability",
    path: "/onboarding/availability",
    title: "When you play",
    subtitle: "Choose every window that usually works for you.",
    canContinue: validators.availability,
  },
  {
    slug: "goals",
    path: "/onboarding/goals",
    title: "What brings you here",
    subtitle: "Select all that apply.",
    canContinue: validators.goals,
  },
];

export const STEP_COUNT = STEPS.length;

export function stepIndex(slug: string): number {
  return STEPS.findIndex((s) => s.slug === slug);
}

export function stepBySlug(slug: string): OnboardingStep | undefined {
  return STEPS.find((s) => s.slug === slug);
}

/** Where "Back" goes. The first step returns to Welcome. */
export function previousPath(slug: string): string {
  const i = stepIndex(slug);
  if (i <= 0) return WELCOME_PATH;
  return STEPS[i - 1].path;
}

/** Where "Continue" goes. The last step goes to Done. */
export function nextPath(slug: string): string {
  const i = stepIndex(slug);
  if (i < 0 || i >= STEPS.length - 1) return DONE_PATH;
  return STEPS[i + 1].path;
}

/**
 * The furthest step a draft has legitimately reached — every earlier step must
 * pass its own gate.
 *
 * Used to bounce someone who deep-links to step 5 with an empty draft back to
 * the first unanswered step, rather than letting them submit a half-empty
 * profile.
 */
export function firstIncompleteStep(draft: OnboardingDraft): OnboardingStep {
  for (const step of STEPS) {
    if (!step.optional && !step.canContinue(draft)) return step;
  }
  return STEPS[STEPS.length - 1];
}
