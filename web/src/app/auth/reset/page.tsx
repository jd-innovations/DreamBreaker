"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeSlash, X } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

// Completes a password reset started from /auth ("Forgot?").
//
// The emailed link points **directly here**, not through /auth/callback.
// GoTrue verifies the recovery token on its side and hands the session back in
// the URL — usually as a `#access_token=…` fragment, which a server route can
// never see. This page is a client component, so the browser client picks it up.
//
// Reaching it with no session after the grace period below means the link was
// already used or expired, and the page says so instead of showing a form that
// cannot work.

export default function ResetPasswordPage() {
  const router = useRouter();
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sessionState, setSessionState] = useState<"checking" | "ready" | "missing">("checking");

  // Establishing the session here is a race, so this waits rather than asking
  // once.
  //
  // The recovery link lands with the session in the URL — a `#access_token=…`
  // fragment, or `?code=` under PKCE. The browser client parses that on init
  // (detectSessionInUrl), but asynchronously, so a bare getSession() on mount
  // frequently returns null before the parse finishes and would show
  // "LINK EXPIRED" to someone holding a perfectly good link.
  //
  // So: listen for the auth event, ask once in case it already happened, and
  // only conclude the link is dead after a grace period with neither.
  useEffect(() => {
    const supabase = createClient();
    let settled = false;

    const markReady = () => {
      if (settled) return;
      settled = true;
      setSessionState("ready");
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) markReady();
    });

    supabase.auth
      .getSession()
      .then(({ data }) => { if (data.session) markReady(); })
      .catch(() => { /* the timeout below is the fallback */ });

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        setSessionState("missing");
      }
    }, 3000);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const password = fd.get("password") as string;
    const confirm = fd.get("confirm") as string;

    if (password !== confirm) {
      toast.error("Those passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Password updated.");
      router.push("/dashboard");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not update your password.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background relative">
      <button
        onClick={() => router.push("/")}
        className="absolute top-4 right-4 h-9 w-9 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        aria-label="Back to home"
      >
        <X size={16} weight="bold" />
      </button>

      <div className="w-full max-w-sm">
        <div className="mb-8"><Logo /></div>

        {sessionState === "checking" && (
          <p className="text-sm text-muted-foreground">Checking your reset link…</p>
        )}

        {sessionState === "missing" && (
          <div className="space-y-4">
            <h1 className="font-display text-3xl tracking-wide">LINK EXPIRED</h1>
            <p className="text-sm text-muted-foreground">
              This password reset link is no longer valid. Reset links can only be used once, and
              they expire after a while.
            </p>
            <Link
              href="/auth"
              className="inline-block font-display tracking-[0.2em] text-sm text-primary hover:underline"
            >
              REQUEST A NEW ONE
            </Link>
          </div>
        )}

        {sessionState === "ready" && (
          <>
            <h1 className="font-display text-3xl tracking-wide mb-2">SET A NEW PASSWORD</h1>
            <p className="text-sm text-muted-foreground mb-6">
              Choose a new password for your account.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-1.5">
                  NEW PASSWORD
                </label>
                <div className="relative">
                  <input
                    name="password"
                    type={showPw ? "text" : "password"}
                    required
                    minLength={8}
                    placeholder="Min 8 characters"
                    data-testid="reset-password"
                    className="w-full h-12 rounded-xl bg-secondary border border-border px-4 pr-12 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showPw ? "Hide password" : "Show password"}
                  >
                    {showPw ? <EyeSlash size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-1.5">
                  CONFIRM PASSWORD
                </label>
                <input
                  name="confirm"
                  type={showPw ? "text" : "password"}
                  required
                  minLength={8}
                  placeholder="Repeat it"
                  data-testid="reset-password-confirm"
                  className="w-full h-12 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <Button
                type="submit"
                disabled={saving}
                className="w-full h-12 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-[0.2em]"
                data-testid="reset-submit"
              >
                {saving ? "SAVING…" : "UPDATE PASSWORD"}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
