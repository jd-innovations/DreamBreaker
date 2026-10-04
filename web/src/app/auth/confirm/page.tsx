"use client";

// Where an email-confirmation link lands.
//
// Before this route existed, `signUp()` passed no `emailRedirectTo`, so GoTrue
// fell back to the project Site URL and confirmation links dropped people on the
// marketing homepage. Three things followed from that, none of them visible:
//
//   - /auth/callback never ran for signup, so the routing decision it exists to
//     make (dashboard vs onboarding) was never made.
//   - OnboardingNudgeHost is suppressed on "/", so the deferred onboarding draft
//     could not flush there either.
//   - Confirming your email therefore looked like it did nothing at all.
//
// The draft flush is the part with teeth. `enable_confirmations` is on, so
// `signUp()` returns no session and web onboarding runs unauthenticated,
// persisting answers to localStorage. Clicking the confirmation link is the
// moment a session first exists — so this is where those answers get written.
// If that never happens, six steps of answers are silently lost.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/layout/logo";
import { createClient } from "@/lib/supabase/client";
import { redeemSessionFromUrl, type RedeemResult } from "@/lib/auth/redeem-url";
import { finishConfirmedSignup } from "@/lib/auth/finish-confirmation";
import { ResendConfirmation } from "@/components/auth/resend-confirmation";

type State =
  | { status: "working" }
  | { status: "failed"; message: string; received: string };

export default function ConfirmPage() {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: "working" });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const supabase = createClient();
      const result: RedeemResult = await redeemSessionFromUrl(supabase, "signup");
      if (cancelled) return;

      if (!result.ok) {
        setState({ status: "failed", message: result.message, received: result.received });
        return;
      }

      // Draft flush + where to land: shared with /auth/code.
      const finished = await finishConfirmedSignup(supabase);
      if (cancelled) return;
      if (!finished.ok) {
        setState({ status: "failed", message: finished.message, received: "session missing after redeem" });
        return;
      }
      const destination = finished.destination;

      router.replace(destination);
      router.refresh();
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-sm">
        <div className="mb-8"><Logo /></div>

        {state.status === "working" && (
          <p className="text-sm text-muted-foreground">Confirming your email…</p>
        )}

        {state.status === "failed" && (
          <div className="space-y-4">
            <h1 className="font-display text-3xl tracking-wide">LINK NOT VALID</h1>
            <p className="text-sm text-muted-foreground" data-testid="confirm-error">
              {state.message}
            </p>
            <p className="text-sm text-muted-foreground">
              It may have been used already, expired, or come from an older email. Get a new link
              below, or sign in if your email is already confirmed.
            </p>
            <ResendConfirmation />
            <Link href="/auth/code" className="block text-sm font-semibold hover:underline">
              Have a code from the email? Enter it instead
            </Link>
            <Link
              href="/auth"
              className="inline-block font-display tracking-[0.2em] text-sm text-primary hover:underline"
            >
              GO TO SIGN IN
            </Link>
            <p className="font-mono text-[10px] tracking-widest text-muted-foreground/60 pt-2">
              LINK CONTAINED — {state.received}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
