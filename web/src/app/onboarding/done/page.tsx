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
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle, EnvelopeSimple } from "@phosphor-icons/react";
import { loadDraft } from "@/lib/onboarding/persistence";

function DoneContent() {
  const params = useSearchParams();
  const deferred = params.get("status") === "deferred";

  // What is actually being held for you.
  //
  // On the deferred path this screen is a promise — "your answers are saved" —
  // made about data this page never looked at. A signup on 2026-08-26 completed
  // all six steps, saw this message, and had only two of fourteen answers
  // written on confirmation: the promise was false and nothing surfaced that.
  //
  // So the claim is now backed by a read of the stored draft. Field names only,
  // never values.
  const [held, setHeld] = useState<string[] | null>(null);
  useEffect(() => {
    if (!deferred) return;
    const stored = loadDraft();
    // Reading an external store (localStorage) that does not exist during
    // render, which is what this rule permits in prose and flags in code.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHeld(stored ? [...stored.touched].sort() : []);
  }, [deferred]);

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

      <p className="text-sm text-muted-foreground mt-4 mb-6">
        {deferred
          ? "Confirm your address and we'll finish setting up your profile automatically."
          : "Your profile is ready. Let's find you some games."}
      </p>

      {/* Say where the answers actually live.
        *
        * They are held in THIS browser until a session exists, so opening the
        * link somewhere else — the mail app on a phone, a different machine —
        * confirms the account but leaves the answers behind. Verified on
        * 2026-08-26: a signup that onboarded in one browser and confirmed in
        * another wrote nothing, then wrote all sixteen columns the moment it
        * signed in back on the original browser.
        *
        * Nothing is lost in that case, so this warns without alarming. The
        * previous copy — "your answers are saved" — was true only of a browser
        * the reader might never return to. */}
      {deferred && (
        <p className="text-sm text-muted-foreground mb-8">
          Open the link <strong className="text-foreground font-semibold">in this browser</strong> —
          your answers are saved here. If you confirm somewhere else, sign back in here and
          we&apos;ll finish the job.
        </p>
      )}

      {deferred && held !== null && (
        <p
          className="font-mono text-[10px] tracking-widest text-muted-foreground/60 mb-8 break-words"
          data-testid="onboarding-held-answers"
        >
          {held.length > 0
            ? `HOLDING ${held.length} ANSWERS — ${held.join(", ")}`
            : "NO ANSWERS STORED — TELL SUPPORT BEFORE CONFIRMING"}
        </p>
      )}

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
