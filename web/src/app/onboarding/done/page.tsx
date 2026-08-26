"use client";

// Terminal screen. Two modes, because email signup and OAuth signup finish in
// genuinely different states:
//
//   saved     the profile is written; go and use the app
//   deferred  the account is not confirmed yet, so there was no session to
//             write with. The answers are safe in localStorage and will be
//             applied the moment the confirmation link creates a session.
//
// The deferred copy has to be honest about that without being alarming — the
// user has done nothing wrong and needs to do exactly one thing.

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle, EnvelopeSimple } from "@phosphor-icons/react";

function DoneContent() {
  const params = useSearchParams();
  const deferred = params.get("status") === "deferred";

  return (
    <div className="py-12 text-center max-w-md mx-auto">
      <div className="flex justify-center mb-6">
        {deferred ? (
          <EnvelopeSimple size={56} weight="duotone" className="text-primary" />
        ) : (
          <CheckCircle size={56} weight="fill" className="text-primary" />
        )}
      </div>

      <h1 className="font-display text-4xl sm:text-5xl tracking-wide leading-[0.95] text-balance">
        {deferred ? "CHECK YOUR EMAIL" : "YOU'RE ALL SET"}
      </h1>

      <p className="text-sm text-muted-foreground mt-4 mb-8">
        {deferred
          ? "Confirm your address and we'll finish setting up your profile automatically — your answers are saved."
          : "Your profile is ready. Let's find you some games."}
      </p>

      {deferred ? (
        <Link
          href="/auth"
          className="inline-flex items-center justify-center h-12 px-8 rounded-full border border-border hover:border-primary/40 font-display tracking-[0.2em] text-sm transition-colors"
        >
          BACK TO SIGN IN
        </Link>
      ) : (
        <Link
          href="/dashboard"
          data-testid="onboarding-finish-btn"
          className="inline-flex items-center justify-center h-12 px-8 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-[0.2em] text-sm transition-colors"
        >
          GO TO DASHBOARD
        </Link>
      )}
    </div>
  );
}

export default function DonePage() {
  // useSearchParams needs a Suspense boundary to avoid opting the whole route
  // into client-side rendering at build time.
  return (
    <Suspense fallback={<div className="py-12 text-center text-sm text-muted-foreground">Finishing up…</div>}>
      <DoneContent />
    </Suspense>
  );
}
