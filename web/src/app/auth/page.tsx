"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { GoogleLogo, AppleLogo, Eye, EyeSlash, Lightning, Trophy, Heart, X } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Logo } from "@/components/layout/logo";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { createClient, createEmailLinkClient } from "@/lib/supabase/client";
import { LEGAL_ROUTES } from "@/lib/legal";

const ROLE_OPTIONS = [
  { id: "player",   label: "PLAYER",   desc: "Compete in tournaments & find partners", icon: Trophy },
  { id: "director", label: "DIRECTOR", desc: "Create & manage tournaments",            icon: Lightning },
];

function resolveRole(selected: Set<string>): string {
  if (selected.has("player") && selected.has("director")) return "player_director";
  if (selected.has("director")) return "director";
  return "player";
}

export default function AuthPage() {
  const router = useRouter();
  const [showPw, setShowPw] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set(["player"]));
  const [loading, setLoading] = useState(false);
  // Controlled so "Forgot?" can read the address the user already typed
  // instead of asking for it twice.
  const [loginEmail, setLoginEmail] = useState("");

  // These three lines used to read "184 active tournaments", "3,210 partners
  // matched" and "$1.2M in prizes awarded" — hardcoded, against a database of
  // 29 profiles. Item 6.1 replaced the same figures on the landing page and
  // missed this copy. Both now read from lib/platform-stats.ts; this page is a
  // client component, so it goes through /api/platform-stats.
  //
  // "prizes awarded" is dropped rather than zeroed: no payouts table exists, so
  // "$0 in prizes awarded" would be as invented as "$1.2M" and would silently
  // stay $0 after payouts ship.
  const [stats, setStats] = useState<
    { activePlayers: number; liveTournaments: number; partnersMatched: number } | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/platform-stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setStats(d); })
      .catch(() => { if (!cancelled) setStats(null); });
    return () => { cancelled = true; };
  }, []);

  const toggleRole = (id: string) => {
    setSelectedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size === 1) return prev; // always keep at least one
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Google and Apple sign-in used to be two buttons that showed
  // `toast.info("... coming soon")`, while both providers were live on the
  // Supabase project and the mobile app signed in with them (item 6.2).
  //
  // Only the client half was missing: /auth/callback already exchanges the
  // code for a session. `redirectTo` must be present in the project's
  // Auth -> URL Configuration redirect allowlist, or Supabase refuses the
  // round trip — that field is dashboard-only and cannot be read from here.
  const handleOAuth = async (provider: "google" | "apple") => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      // A successful call navigates away, so reaching here at all means it
      // failed. Surface it rather than leaving the button looking inert.
      if (error) {
        toast.error(error.message);
        setLoading(false);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Sign-in failed");
      setLoading(false);
    }
  };

  // "Forgot?" had no onClick at all — it was an inert button in the sign-in
  // flow, while mobile has had password reset all along
  // (apps/mobile/src/lib/auth.ts). It now sends the real recovery email.
  //
  // The reply is deliberately identical whether or not the address has an
  // account: telling an anonymous visitor "no account with that email" turns
  // this box into an account-enumeration oracle.
  const handleForgotPassword = async () => {
    const email = loginEmail.trim();
    if (!email) {
      toast.error("Enter your email address first, then tap Forgot.");
      return;
    }

    setLoading(true);
    try {
      // Implicit flow on purpose — see createEmailLinkClient. Asking with the
      // ordinary PKCE client produces a link that only works in the browser that
      // requested it, which is not where people open their email.
      const supabase = createEmailLinkClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        // Straight to /auth/reset, NOT through /auth/callback: the recovery link
        // hands the session back in a URL **fragment**, and a fragment is never
        // sent to the server, so a server route structurally cannot complete
        // this. It bounced users to /auth?error=auth_callback_failed — the
        // sign-in screen. OAuth is unaffected; it genuinely uses `?code=`.
        redirectTo: `${window.location.origin}/auth/reset`,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("If that email has an account, a reset link is on its way.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not send the reset email.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      const fd = new FormData(e.currentTarget);
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: fd.get("email") as string,
        password: fd.get("password") as string,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Welcome back!");
      window.location.href = "/dashboard";
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    // Implicit flow, and an explicit destination — both matter.
    //
    // Without `emailRedirectTo` GoTrue falls back to the project Site URL, so
    // confirmation links landed on the marketing homepage: /auth/callback never
    // ran, no routing decision was made, and the onboarding draft never flushed.
    //
    // Implicit rather than the ordinary PKCE client because a `?code=` link is
    // redeemable only in the browser that requested it, and people open their
    // email in a mail app's WebView. See createEmailLinkClient.
    const emailClient = createEmailLinkClient();
    const { error } = await emailClient.auth.signUp({
      email: fd.get("email") as string,
      password: fd.get("password") as string,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
        data: {
          full_name: `${fd.get("firstName")} ${fd.get("lastName")}`.trim(),
          role: resolveRole(selectedRoles),
        },
      },
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Account created! Check your email to confirm.");
    router.push("/onboarding");
    router.refresh();
  };

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex flex-col justify-between w-1/2 bg-card border-r border-border p-12 relative overflow-hidden grain">
        <div className="absolute -right-24 -bottom-24 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
        <Logo />
        <div>
          <div className="font-mono text-[11px] tracking-[0.3em] text-primary mb-4">/ THE PLATFORM</div>
          <h2 className="font-display text-5xl lg:text-7xl tracking-wide leading-[0.9] max-w-sm">COMPETE.<br />CONNECT.<br /><span className="text-primary">CONQUER.</span></h2>
        </div>
        <div className="space-y-3">
          {[
            { icon: Lightning, label: `${stats ? stats.activePlayers.toLocaleString() : "—"} active players` },
            { icon: Trophy,    label: `${stats ? stats.liveTournaments.toLocaleString() : "—"} live tournaments` },
            { icon: Heart,     label: `${stats ? stats.partnersMatched.toLocaleString() : "—"} partners matched` },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-3 text-sm text-muted-foreground">
              <s.icon size={16} weight="fill" className="text-primary" />{s.label}
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-screen flex items-center justify-center p-6 bg-background relative">
        <button
          onClick={() => router.push("/")}
          className="absolute top-4 right-4 h-9 w-9 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          aria-label="Back to home"
        >
          <X size={16} weight="bold" />
        </button>
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8"><Logo /></div>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="rounded-full p-1 h-11 mb-8 bg-secondary w-full">
              <TabsTrigger value="login" className="rounded-full flex-1" data-testid="auth-tab-login">Sign In</TabsTrigger>
              <TabsTrigger value="signup" className="rounded-full flex-1" data-testid="auth-tab-signup">Create Account</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} method="post" className="space-y-4">
                <div>
                  <label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-1.5">EMAIL</label>
                  <input name="email" type="email" required value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="you@example.com" data-testid="auth-email" className="w-full h-12 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5"><label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground">PASSWORD</label><button type="button" disabled={loading} onClick={handleForgotPassword} className="text-xs text-primary hover:underline disabled:opacity-60" data-testid="auth-forgot-pw">Forgot?</button></div>
                  <div className="relative">
                    <input name="password" type={showPw ? "text" : "password"} required placeholder="••••••••" data-testid="auth-password" className="w-full h-12 rounded-xl bg-secondary border border-border px-4 pr-12 text-sm outline-none focus:ring-2 focus:ring-ring" />
                    <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">{showPw ? <EyeSlash size={18} /> : <Eye size={18} />}</button>
                  </div>
                </div>
                <Button type="submit" disabled={loading} className="w-full h-12 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-[0.2em]" data-testid="auth-login-btn">{loading ? "SIGNING IN…" : "SIGN IN"}</Button>
              </form>
              <div className="flex items-center gap-3 my-5"><div className="flex-1 h-px bg-border" /><span className="text-xs text-muted-foreground font-mono">OR</span><div className="flex-1 h-px bg-border" /></div>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" disabled={loading} onClick={() => handleOAuth("google")} className="h-12 rounded-full border border-border flex items-center justify-center gap-2 text-sm hover:bg-secondary/60 transition-colors disabled:opacity-60" data-testid="auth-google-btn"><GoogleLogo size={18} />Google</button>
                <button type="button" disabled={loading} onClick={() => handleOAuth("apple")} className="h-12 rounded-full border border-border flex items-center justify-center gap-2 text-sm hover:bg-secondary/60 transition-colors disabled:opacity-60" data-testid="auth-apple-btn"><AppleLogo size={18} />Apple</button>
              </div>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground">I AM A</label>
                    {selectedRoles.size === 2 && (
                      <span className="font-mono text-[10px] tracking-widest text-primary">BOTH SELECTED</span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {ROLE_OPTIONS.map((r) => {
                      const active = selectedRoles.has(r.id);
                      return (
                        <button type="button" key={r.id} onClick={() => toggleRole(r.id)} data-testid={`auth-role-${r.id}`} className={`p-4 rounded-xl border text-left transition-all relative ${active ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}>
                          {active && <div className="absolute top-2 right-2 h-4 w-4 rounded-full bg-primary flex items-center justify-center"><svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 4l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary-foreground" /></svg></div>}
                          <r.icon size={20} weight={active ? "fill" : "regular"} className={active ? "text-primary" : "text-muted-foreground"} />
                          <div className="font-display tracking-[0.15em] text-sm mt-2">{r.label}</div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">{r.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1.5">Select one or both — you can always add the other role later.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-1.5">FIRST NAME</label><input name="firstName" type="text" required placeholder="Jordan" data-testid="auth-firstname" className="w-full h-12 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" /></div>
                  <div><label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-1.5">LAST NAME</label><input name="lastName" type="text" required placeholder="Rivera" data-testid="auth-lastname" className="w-full h-12 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" /></div>
                </div>
                <div><label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-1.5">EMAIL</label><input name="email" type="email" required placeholder="you@example.com" data-testid="auth-signup-email" className="w-full h-12 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" /></div>
                <div>
                  <label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-1.5">PASSWORD</label>
                  <div className="relative"><input name="password" type={showPw ? "text" : "password"} required minLength={8} placeholder="Min 8 characters" data-testid="auth-signup-password" className="w-full h-12 rounded-xl bg-secondary border border-border px-4 pr-12 text-sm outline-none focus:ring-2 focus:ring-ring" /><button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground">{showPw ? <EyeSlash size={18} /> : <Eye size={18} />}</button></div>
                </div>
                <Button type="submit" disabled={loading} className="w-full h-12 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-[0.2em]" data-testid="auth-signup-btn">{loading ? "CREATING…" : "CREATE ACCOUNT"}</Button>
              </form>
            </TabsContent>
          </Tabs>
          <p className="text-center text-xs text-muted-foreground mt-6">By continuing you agree to our <Link href={LEGAL_ROUTES.terms} className="text-primary hover:underline" data-testid="auth-terms-link">Terms of Service</Link> &amp; <Link href={LEGAL_ROUTES.privacy} className="text-primary hover:underline" data-testid="auth-privacy-link">Privacy Policy</Link>.</p>
        </div>
      </div>
    </div>
  );
}
