"use client";

// "Send a new confirmation link" on the web (owner, 2026-10-02). Same rules as
// mobile — neutral wording, one-minute cooldown — from @shared/authResend.
//
// Uses the implicit email-link client, like signup itself (auth/page.tsx): the
// Confirm signup template is a token_hash link either way, but matching the
// client signup used keeps the two emails identical.

import { useEffect, useState } from "react";
import {
  RESEND_COOLDOWN_SECONDS, RESEND_SENT_MESSAGE, looksLikeEmail, resendErrorMessage,
} from "@shared/authResend";
import { createEmailLinkClient } from "@/lib/supabase/client";

export async function resendConfirmation(email: string) {
  const { error } = await createEmailLinkClient().auth.resend({
    type: "signup",
    email: email.trim().toLowerCase(),
    options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
  });
  return resendErrorMessage(error ? { code: error.code, status: error.status } : null);
}

export function ResendConfirmation({
  initialEmail = "", showEmailField = true, className = "",
}: {
  /** Read once on mount; give the component a `key` to re-seed it. */
  initialEmail?: string;
  /** False where the email is already known (sign in): just the button. */
  showEmailField?: boolean;
  className?: string;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(0);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  async function send() {
    if (!looksLikeEmail(email)) {
      setMessage({ ok: false, text: "Enter the email you signed up with." });
      return;
    }
    setBusy(true);
    const err = await resendConfirmation(email);
    setBusy(false);
    setMessage(err ? { ok: false, text: err } : { ok: true, text: RESEND_SENT_MESSAGE });
    if (!err) setLeft(RESEND_COOLDOWN_SECONDS);
  }

  const disabled = busy || left > 0;
  return (
    <div className={`space-y-2 ${className}`}>
      {showEmailField && (
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setMessage(null); }}
          onKeyDown={(e) => { if (e.key === "Enter" && !disabled) { e.preventDefault(); void send(); } }}
          placeholder="Email you signed up with"
          aria-label="Email you signed up with"
          className="w-full h-11 bg-secondary border border-border rounded-xl px-4 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      )}
      <button
        type="button"
        onClick={send}
        disabled={disabled}
        className="w-full h-11 rounded-full border border-border hover:border-primary/50 font-display tracking-[0.15em] text-sm transition-colors disabled:opacity-50"
      >
        {busy ? "SENDING…" : left > 0 ? `SENT · RESEND IN ${left}S` : "SEND A NEW CONFIRMATION LINK"}
      </button>
      {message && (
        <p role="status" className={`text-xs ${message.ok ? "text-muted-foreground" : "text-destructive"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
