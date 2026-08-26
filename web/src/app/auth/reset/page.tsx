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
// The emailed link points **directly here**, not through /auth/callback: a
// recovery link can hand the session back in a URL fragment, and a fragment is
// never sent to the server, so a server route structurally cannot complete this.
//
// Four link shapes reach this page, and it handles all of them:
//
//   1. `#access_token=…`         GoTrue verified server-side. detectSessionInUrl
//                                picks it up on its own.
//   2. `?token_hash=…&type=…`    Stateless. Needs an explicit verifyOtp, and is
//                                the only shape that survives being opened in a
//                                different browser than requested it.
//   3. `?code=…`                 PKCE. detectSessionInUrl handles it, but ONLY in
//                                the browser that requested the reset — the code
//                                verifier lives in that browser's storage. Tapped
//                                from a mail app's in-app WebView, it cannot work.
//   4. `?error=…` / `#error=…`   GoTrue rejected the token and said why.
//
// Shape 4 is why this does not just say "expired" and stop. A page that reports
// one cause for every failure is telling the user something it does not know.

type SessionState =
  | { status: "checking" }
  | { status: "ready" }
  | { status: "failed"; message: string; received: string };

const DEFAULT_FAILURE =
  "This password reset link is no longer valid. Reset links can only be used once, and they expire after a while.";

// What the link actually carried, by key name only.
//
// Never the values: an implicit fragment holds a live access token, and this
// string is rendered on screen. Key names alone separate the cases that matter —
// `code` means PKCE, `access_token` means implicit, `token_hash` means stateless,
// and nothing at all means the tokens never reached the browser.
function describeLinkParams(): string {
  const keys = (qs: string) => Array.from(new URLSearchParams(qs).keys());
  const search = keys(window.location.search);
  const hash = keys(window.location.hash.replace(/^#/, ""));
  const parts: string[] = [];
  if (search.length) parts.push(`query: ${search.join(", ")}`);
  if (hash.length) parts.push(`fragment: ${hash.join(", ")}`);
  return parts.length ? parts.join(" · ") : "no parameters";
}

// GoTrue puts errors in the query string on some paths and the fragment on
// others, so check both rather than assuming.
function readLinkError(): string | null {
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const code = search.get("error_code") ?? hash.get("error_code");
  const description = search.get("error_description") ?? hash.get("error_description");
  const error = search.get("error") ?? hash.get("error");
  if (!code && !description && !error) return null;
  // error_description is URL-encoded prose written for humans; prefer it.
  return description ? description.replace(/\+/g, " ") : (code ?? error ?? DEFAULT_FAILURE);
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sessionState, setSessionState] = useState<SessionState>({ status: "checking" });

  // Establishing the session is a race against the client's own URL parse, so
  // this waits rather than asking once. detectSessionInUrl runs at client init,
  // asynchronously — a bare getSession() on mount frequently returns null before
  // it finishes, which would report a failure to someone holding a good link.
  useEffect(() => {
    // Read the fragment BEFORE constructing the client: a successful parse sets
    // `window.location.hash = ''`, erasing the evidence.
    const received = describeLinkParams();
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const searchParams = new URLSearchParams(window.location.search);

    const supabase = createClient();
    let settled = false;

    const settle = (next: SessionState) => {
      if (settled) return;
      settled = true;
      setSessionState(next);
    };

    // An error in the link itself is decisive: no session is coming, and GoTrue
    // already said why. Don't wait three seconds to report something else.
    const linkError = readLinkError();
    if (linkError) {
      settle({ status: "failed", message: linkError, received });
      return;
    }

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) settle({ status: "ready" });
    });

    void (async () => {
      try {
        // ── Implicit fragment: redeem it by hand ──────────────────────────────
        //
        // This CANNOT be left to detectSessionInUrl. auth-js refuses to consume
        // an implicit URL with a PKCE client — `_getSessionFromURL` throws
        // "Not a valid PKCE flow url." on the flowType mismatch, before it ever
        // validates the token — and @supabase/ssr hardcodes flowType 'pkce', so
        // this client cannot be anything else. Diagnosed 2026-08-26: GoTrue
        // granted the session and the fragment arrived intact, yet no GET /user
        // was ever issued, because the mismatch check threw first.
        //
        // setSession has no such gate. It takes the tokens directly, validates
        // them against /user, and persists through this client's cookie storage
        // — which is what updateUser below and the rest of the app read from.
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) {
            settle({ status: "failed", message: error.message, received });
            return;
          }
          // Don't leave live tokens sitting in the address bar or in history.
          window.history.replaceState(null, "", window.location.pathname);
          settle({ status: "ready" });
          return;
        }

        // ── token_hash: stateless, must be redeemed explicitly ────────────────
        const tokenHash = searchParams.get("token_hash");
        if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({
            type: (searchParams.get("type") as "recovery" | "email" | "invite" | "magiclink") ?? "recovery",
            token_hash: tokenHash,
          });
          settle(
            error
              ? { status: "failed", message: error.message, received }
              : { status: "ready" },
          );
          return;
        }

        // ── PKCE, or an already-established session ───────────────────────────
        const { data } = await supabase.auth.getSession();
        if (data.session) settle({ status: "ready" });
      } catch (err: unknown) {
        settle({
          status: "failed",
          message: err instanceof Error ? err.message : DEFAULT_FAILURE,
          received,
        });
      }
    })();

    const timer = setTimeout(
      () => settle({ status: "failed", message: DEFAULT_FAILURE, received }),
      5000,
    );

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

        {sessionState.status === "checking" && (
          <p className="text-sm text-muted-foreground">Checking your reset link…</p>
        )}

        {sessionState.status === "failed" && (
          <div className="space-y-4">
            <h1 className="font-display text-3xl tracking-wide">LINK NOT VALID</h1>
            <p className="text-sm text-muted-foreground" data-testid="reset-error">
              {sessionState.message}
            </p>
            <p className="text-sm text-muted-foreground">
              If you opened this link on a different device or browser than the one you requested it
              from, request a new one and open it there.
            </p>
            <Link
              href="/auth"
              className="inline-block font-display tracking-[0.2em] text-sm text-primary hover:underline"
            >
              REQUEST A NEW ONE
            </Link>
            <p className="font-mono text-[10px] tracking-widest text-muted-foreground/60 pt-2">
              LINK CONTAINED — {sessionState.received}
            </p>
          </div>
        )}

        {sessionState.status === "ready" && (
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
