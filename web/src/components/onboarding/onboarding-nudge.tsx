"use client";

// The "finish setting up" overlay.
//
// Bottom sheet below `sm`, centred card above — the app already does this at
// profile/page.tsx's messaging panel (`items-end sm:items-center`), so this
// follows that rather than inventing a second convention.
//
// Deliberately NOT the Radix Dialog from components/ui: that wrapper is centred,
// capped at max-w-lg, and renders a hardcoded close X. Mechanics here follow
// player-profile-sheet.tsx, which is the one overlay in the app that already
// handles Escape and body-scroll locking properly.
//
// This is dismissible by design. Nothing mandatory is ever an overlay — the
// first-run flow is a route, precisely so it cannot be escaped by accident.

import { useEffect } from "react";
import Link from "next/link";
import { X, Lightning } from "@phosphor-icons/react";

export function OnboardingNudge({
  onDismiss,
  completionPercent,
}: {
  onDismiss: () => void;
  completionPercent: number;
}) {
  // Escape to close, and lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onDismiss]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-background/80 backdrop-blur-sm p-0 sm:p-4"
      onClick={onDismiss}
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-nudge-title"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-card border-t sm:border border-border rounded-t-2xl sm:rounded-2xl p-6 pb-8 sm:pb-6 relative animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 motion-reduce:animate-none"
      >
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="absolute right-4 top-4 h-11 w-11 -mr-2 -mt-2 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        >
          <X size={18} weight="bold" />
        </button>

        <div className="font-mono text-[11px] tracking-[0.3em] text-primary mb-3">
          / YOUR PROFILE
        </div>

        <h2 id="onboarding-nudge-title" className="font-display text-2xl tracking-wide mb-2 text-balance">
          FINISH SETTING UP
        </h2>

        <p className="text-sm text-muted-foreground mb-5">
          A few more answers and we can match you with players at your level, near
          you, when you&apos;re actually free.
        </p>

        <div className="mb-6">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground">
              PROFILE
            </span>
            <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
              {completionPercent}%
            </span>
          </div>
          <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-[width]"
              style={{ width: `${Math.min(Math.max(completionPercent, 0), 100)}%` }}
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/onboarding"
            onClick={onDismiss}
            data-testid="onboarding-nudge-continue"
            className="flex-1 h-12 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-[0.2em] text-sm flex items-center justify-center gap-2 transition-colors"
          >
            <Lightning size={15} weight="fill" /> FINISH SETUP
          </Link>
          <button
            onClick={onDismiss}
            className="h-12 px-6 rounded-full border border-border hover:border-primary/40 font-mono text-xs tracking-widest text-muted-foreground hover:text-foreground transition-colors"
          >
            NOT NOW
          </button>
        </div>
      </div>
    </div>
  );
}
