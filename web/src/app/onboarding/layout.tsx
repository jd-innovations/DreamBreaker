"use client";

// Onboarding chrome: draft provider, progress, and the shared frame.
//
// Deliberately opts out of PageShell, matching /auth and the old onboarding
// page. This is a focused flow — the header, footer, sponsor carousel and
// bottom nav would all be noise, and the bottom nav in particular would fight
// the sticky CTA on mobile.

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/layout/logo";
import { OnboardingProvider } from "@/lib/onboarding/state";
import { STEPS, STEP_COUNT, stepIndex } from "@/lib/onboarding/steps";
import { track } from "@/lib/analytics";

function ProgressBar({ currentSlug }: { currentSlug: string | null }) {
  const i = currentSlug ? stepIndex(currentSlug) : -1;
  if (i < 0) return null;

  return (
    <div
      className="flex items-center gap-1.5"
      role="progressbar"
      aria-valuenow={i + 1}
      aria-valuemin={1}
      aria-valuemax={STEP_COUNT}
      aria-label={`Step ${i + 1} of ${STEP_COUNT}`}
    >
      {STEPS.map((s, idx) => (
        <span
          key={s.slug}
          // flex-1 with a max width keeps six segments on one line at 320px
          // instead of wrapping, while still looking deliberate on desktop.
          className={`h-1.5 flex-1 max-w-8 rounded-full transition-colors ${
            idx <= i ? "bg-primary" : "bg-secondary"
          }`}
        />
      ))}
    </div>
  );
}

/**
 * Onboarding funnel events (4.2), emitted from the layout because it already
 * derives the step from the pathname — instrumenting six pages separately
 * would be six chances to forget one.
 *
 * `completed` fires only when the index moves FORWARD. Going back to change an
 * answer is not completing a step, and counting it would inflate every
 * conversion rate. It means a step revisited and re-advanced counts twice,
 * which is the honest reading: the user did complete it twice.
 *
 * The slug is a fixed value from STEPS, never user input.
 */
function useOnboardingFunnel(slug: string | null, index: number) {
  const previous = useRef<number | null>(null);

  useEffect(() => {
    if (!slug || index < 0) return;

    const from = previous.current;
    if (from !== null && index > from) {
      const completed = STEPS[from];
      if (completed) {
        track("onboarding_step_completed", { step: completed.slug, step_index: from, step_count: STEP_COUNT });
      }
    }

    track("onboarding_step_viewed", { step: slug, step_index: index, step_count: STEP_COUNT });
    previous.current = index;
  }, [slug, index]);
}

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const slug = STEPS.find((s) => s.path === pathname)?.slug ?? null;
  const i = slug ? stepIndex(slug) : -1;

  useOnboardingFunnel(slug, i);

  return (
    <OnboardingProvider>
      {/* dvh, not vh — mobile browser chrome makes 100vh overflow and puts the
          CTA under the address bar. */}
      <div className="min-h-[100dvh] bg-background flex flex-col">
        <header className="flex items-center justify-between gap-4 px-4 sm:px-6 lg:px-8 pt-6 pb-4 max-w-2xl w-full mx-auto">
          <Link href="/" aria-label="Pickleball App home">
            <Logo />
          </Link>
          {i >= 0 && (
            <span className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground whitespace-nowrap">
              {i + 1} / {STEP_COUNT}
            </span>
          )}
        </header>

        {i >= 0 && (
          <div className="px-4 sm:px-6 lg:px-8 max-w-2xl w-full mx-auto pb-2">
            <ProgressBar currentSlug={slug} />
          </div>
        )}

        <main className="flex-1 w-full max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
          {children}
        </main>
      </div>
    </OnboardingProvider>
  );
}
