"use client";

// Welcome — the entry to onboarding.
//
// Replaces the previous 4-step page, which had two bugs worth recording since
// this file is where they lived:
//
//  1. It wrote a free-text DUPR value into `profiles.dupr`, the VERIFIED rating
//     column (CHECK 2.0-8.0, with a `dupr_verified` companion). The flow no
//     longer collects DUPR at all; `self_rating` is derived from the skill band.
//  2. It never called `ensureFreshSession()` and never verified the write, so an
//     expired token made the update match zero rows, return no error, and route
//     the user to the dashboard as though it had saved.
//
// It also could not work for the users it was built for: `enable_confirmations`
// is on, so an email signup has no session, and the page's opening
// `getUser()` check bounced every one of them to /auth with nothing saved.
//
// Resuming: if a draft is already in progress this offers to continue from where
// it stopped rather than restarting.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lightning } from "@phosphor-icons/react";
import { useOnboarding } from "@/lib/onboarding/state";
import { STEPS, STEP_COUNT, stepBySlug } from "@/lib/onboarding/steps";

export default function OnboardingWelcome() {
  const router = useRouter();
  const { lastStep, hydrating } = useOnboarding();

  const resumeStep = lastStep ? stepBySlug(lastStep) : undefined;
  const start = () => router.push(STEPS[0].path);

  return (
    <div className="py-8 sm:py-12 max-w-md">
      <div className="font-mono text-[11px] tracking-[0.35em] text-primary mb-4">
        / SET UP YOUR PROFILE
      </div>

      <h1 className="font-display text-5xl sm:text-6xl tracking-wide leading-[0.9] text-balance">
        LET&apos;S GET
        <br />
        YOU PLAYING
      </h1>

      <p className="text-sm sm:text-base text-muted-foreground mt-5">
        {STEP_COUNT} quick questions — about a minute. It&apos;s how we match you with
        players at your level, nearby, when you&apos;re free.
      </p>

      <div className="mt-9 flex flex-col gap-3">
        {!hydrating && resumeStep ? (
          <>
            <button
              onClick={() => router.push(resumeStep.path)}
              data-testid="onboarding-resume-btn"
              className="w-full h-12 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-[0.2em] text-sm flex items-center justify-center gap-2 transition-colors"
            >
              <Lightning size={16} weight="fill" /> PICK UP WHERE YOU LEFT OFF
            </button>
            <button
              onClick={start}
              className="w-full h-12 rounded-full border border-border hover:border-primary/40 font-mono text-xs tracking-widest text-muted-foreground hover:text-foreground transition-colors"
            >
              START OVER
            </button>
          </>
        ) : (
          <button
            onClick={start}
            data-testid="onboarding-start-btn"
            className="w-full h-12 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-[0.2em] text-sm flex items-center justify-center gap-2 transition-colors"
          >
            <Lightning size={16} weight="fill" /> GET STARTED
          </button>
        )}

        <Link
          href="/dashboard"
          className="text-center text-xs font-mono tracking-widest text-muted-foreground hover:text-foreground transition-colors py-3"
        >
          SKIP FOR NOW
        </Link>
      </div>
    </div>
  );
}
