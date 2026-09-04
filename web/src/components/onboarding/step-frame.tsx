"use client";

// Shared frame for every onboarding step: title, body, and navigation.
//
// The responsive contract lives here so each step inherits it rather than
// re-deciding:
//
//  * The CTA is sticky to the bottom below `sm` and inline above it. On a phone
//    the primary action must be in thumb reach without scrolling; on desktop a
//    floating bar looks broken.
//  * `pb-28 sm:pb-0` on the body reserves room for that sticky bar so the last
//    option is never trapped underneath it.
//  * Buttons are h-12 (48px), comfortably over the 44px touch-target minimum.

import { useRouter } from "next/navigation";
import { CaretLeft } from "@phosphor-icons/react";
import { useOnboarding } from "@/lib/onboarding/state";
import { nextPath, previousPath, stepBySlug } from "@/lib/onboarding/steps";

export function StepFrame({
  slug,
  children,
  onContinue,
  continueLabel = "CONTINUE",
  busy = false,
}: {
  slug: string;
  children: React.ReactNode;
  /** Runs before navigating. Return false to stay put. */
  onContinue?: () => boolean | Promise<boolean>;
  continueLabel?: string;
  busy?: boolean;
}) {
  const router = useRouter();
  const { draft, setLastStep } = useOnboarding();
  const step = stepBySlug(slug);

  if (!step) return null;

  const canContinue = step.canContinue(draft);

  const go = async () => {
    if (onContinue) {
      const ok = await onContinue();
      if (!ok) return;
    }
    setLastStep(slug);
    router.push(nextPath(slug));
  };

  return (
    <div className="flex flex-col">
      <div className="pb-28 sm:pb-0">
        <button
          type="button"
          onClick={() => router.push(previousPath(slug))}
          className="inline-flex items-center gap-1 text-xs font-mono tracking-widest text-muted-foreground hover:text-foreground transition-colors mb-6 h-11 -ml-1 px-1"
        >
          <CaretLeft size={14} weight="bold" /> BACK
        </button>

        <h1 className="font-display text-4xl sm:text-5xl tracking-wide leading-[0.95] text-balance">
          {step.title.toUpperCase()}
        </h1>
        <p className="text-sm text-muted-foreground mt-3 mb-8 max-w-prose">{step.subtitle}</p>

        {children}
      </div>

      {/* Sticky on phones, inline from sm up. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur-sm px-4 py-4 sm:static sm:border-0 sm:bg-transparent sm:backdrop-blur-none sm:px-0 sm:py-0 sm:mt-10">
        <div className="max-w-2xl mx-auto flex items-center gap-3 sm:justify-end">
          {step.optional && (
            <button
              type="button"
              onClick={go}
              className="h-12 px-5 rounded-full border border-border font-mono text-xs tracking-widest text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
            >
              SKIP
            </button>
          )}
          <button
            type="button"
            onClick={go}
            disabled={!canContinue || busy}
            data-testid="onboarding-next-btn"
            className="flex-1 sm:flex-none sm:min-w-48 h-12 px-8 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-[0.2em] text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? "SAVING…" : continueLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
