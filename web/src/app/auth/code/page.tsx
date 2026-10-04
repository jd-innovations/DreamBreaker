"use client";

// Enter the emailed code — the typed alternative to the link (owner,
// 2026-10-04). An ADDITION: every link page still works as before.
//
//   ?purpose=signup (default) | recovery     ?email=prefill
//
// Signup lands exactly where the link would (finishConfirmedSignup, shared
// with /auth/confirm). Recovery goes to /auth/reset, which accepts the session
// this page created because the URL carries no credentials of its own.
// Wording rules: @shared/authCode and @shared/authResend.

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Logo } from "@/components/layout/logo";
import { createClient, createEmailLinkClient } from "@/lib/supabase/client";
import { finishConfirmedSignup } from "@/lib/auth/finish-confirmation";
import { resendConfirmation } from "@/components/auth/resend-confirmation";
import {
  CODE_MAX_LENGTH, codeErrorMessage, isCompleteCode, normalizeCode, type CodePurpose,
} from "@shared/authCode";
import {
  RESEND_COOLDOWN_SECONDS, RESEND_SENT_MESSAGE, looksLikeEmail, resendErrorMessage,
} from "@shared/authResend";

function EnterCode() {
  const router = useRouter();
  const params = useSearchParams();
  const purpose: CodePurpose = params.get("purpose") === "recovery" ? "recovery" : "signup";
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(0);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  const canVerify = looksLikeEmail(email) && isCompleteCode(code) && !busy;

  async function verify(e?: React.FormEvent) {
    e?.preventDefault();
    if (!canVerify) return;
    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code,
      type: purpose,
    });
    if (error) {
      setBusy(false);
      setCode("");
      setMessage({ ok: false, text: codeErrorMessage({ code: error.code, status: error.status }) ?? "" });
      return;
    }
    if (purpose === "recovery") {
      router.replace("/auth/reset");
      return;
    }
    const finished = await finishConfirmedSignup(supabase);
    setBusy(false);
    if (!finished.ok) {
      setMessage({ ok: false, text: finished.message });
      return;
    }
    router.replace(finished.destination);
    router.refresh();
  }

  async function resend() {
    if (!looksLikeEmail(email)) {
      setMessage({ ok: false, text: "Enter your email first." });
      return;
    }
    let err: string | null;
    if (purpose === "recovery") {
      // Implicit client, as the Forgot button uses; same neutral wording.
      const { error } = await createEmailLinkClient().auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/auth/reset`,
      });
      err = resendErrorMessage(error ? { code: error.code, status: error.status } : null);
    } else {
      err = await resendConfirmation(email);
    }
    setMessage(err ? { ok: false, text: err } : { ok: true, text: RESEND_SENT_MESSAGE });
    if (!err) setLeft(RESEND_COOLDOWN_SECONDS);
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-6 bg-background">
      <form onSubmit={verify} className="w-full max-w-sm space-y-4">
        <div className="mb-8"><Logo /></div>
        <h1 className="font-display text-3xl tracking-wide">ENTER YOUR CODE</h1>
        <p className="text-sm text-muted-foreground">
          {purpose === "recovery"
            ? "Type the code from your password reset email. It works on any device."
            : "Type the code from your confirmation email. It works on any device."}
        </p>

        <label className="block">
          <span className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-1.5">EMAIL</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => { setEmail(e.target.value); setMessage(null); }}
            className="w-full h-12 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </label>

        <label className="block">
          <span className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-1.5">CODE</span>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => { setCode(normalizeCode(e.target.value)); setMessage(null); }}
            maxLength={CODE_MAX_LENGTH + 4}
            placeholder="123456"
            aria-label="Code from the email"
            autoFocus={!!email}
            className="w-full h-14 rounded-xl bg-secondary border border-border px-4 text-center font-display text-2xl tracking-[0.3em] outline-none focus:ring-2 focus:ring-ring"
          />
        </label>

        <button
          type="submit"
          disabled={!canVerify}
          className="w-full h-12 rounded-full bg-primary text-primary-foreground font-display tracking-[0.2em] text-sm disabled:opacity-50"
        >
          {busy ? "VERIFYING…" : "VERIFY"}
        </button>

        {message && (
          <p role="status" className={`text-sm ${message.ok ? "text-muted-foreground" : "text-destructive"}`}>
            {message.text}
          </p>
        )}

        <button
          type="button"
          onClick={resend}
          disabled={left > 0}
          className="block mx-auto text-sm font-semibold hover:underline disabled:opacity-50 disabled:no-underline"
        >
          {left > 0 ? `New code sent · resend in ${left}s` : "Send a new code"}
        </button>
        <Link href="/auth" className="block text-center text-xs text-muted-foreground hover:underline">
          Back to sign in
        </Link>
      </form>
    </div>
  );
}

export default function EnterCodePage() {
  return (
    <Suspense fallback={null}>
      <EnterCode />
    </Suspense>
  );
}
