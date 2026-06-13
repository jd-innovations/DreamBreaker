"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { GoogleLogo, AppleLogo, Eye, EyeSlash, Lightning, Trophy, Heart } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Logo } from "@/components/layout/logo";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

const roles = [
  { id: "player", label: "PLAYER", desc: "Compete in tournaments & find partners", icon: Trophy },
  { id: "director", label: "DIRECTOR", desc: "Create & manage tournaments", icon: Lightning },
];

export default function AuthPage() {
  const router = useRouter();
  const [showPw, setShowPw] = useState(false);
  const [role, setRole] = useState("player");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: fd.get("email") as string,
      password: fd.get("password") as string,
    });
    if (error) {
      console.error("[auth] signInWithPassword error:", error);
      setLoading(false);
      toast.error(error.message);
      return;
    }
    console.log("[auth] signed in:", data.user?.email);
    toast.success("Welcome back!");
    // Hard redirect so the browser sends fresh cookies the middleware can read
    window.location.href = "/dashboard";
  };

  const handleSignup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email: fd.get("email") as string,
      password: fd.get("password") as string,
      options: {
        data: {
          full_name: `${fd.get("firstName")} ${fd.get("lastName")}`.trim(),
          role,
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
          {[{ icon: Trophy, label: "184 active tournaments" }, { icon: Heart, label: "3,210 partners matched" }, { icon: Lightning, label: "$1.2M in prizes awarded" }].map((s) => (
            <div key={s.label} className="flex items-center gap-3 text-sm text-muted-foreground">
              <s.icon size={16} weight="fill" className="text-primary" />{s.label}
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8"><Logo /></div>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="rounded-full p-1 h-11 mb-8 bg-secondary w-full">
              <TabsTrigger value="login" className="rounded-full flex-1" data-testid="auth-tab-login">Sign In</TabsTrigger>
              <TabsTrigger value="signup" className="rounded-full flex-1" data-testid="auth-tab-signup">Create Account</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-1.5">EMAIL</label>
                  <input name="email" type="email" required placeholder="you@example.com" data-testid="auth-email" className="w-full h-12 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5"><label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground">PASSWORD</label><button type="button" className="text-xs text-primary hover:underline" data-testid="auth-forgot-pw">Forgot?</button></div>
                  <div className="relative">
                    <input name="password" type={showPw ? "text" : "password"} required placeholder="••••••••" data-testid="auth-password" className="w-full h-12 rounded-xl bg-secondary border border-border px-4 pr-12 text-sm outline-none focus:ring-2 focus:ring-ring" />
                    <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">{showPw ? <EyeSlash size={18} /> : <Eye size={18} />}</button>
                  </div>
                </div>
                <Button type="submit" disabled={loading} className="w-full h-12 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-[0.2em]" data-testid="auth-login-btn">{loading ? "SIGNING IN…" : "SIGN IN"}</Button>
              </form>
              <div className="flex items-center gap-3 my-5"><div className="flex-1 h-px bg-border" /><span className="text-xs text-muted-foreground font-mono">OR</span><div className="flex-1 h-px bg-border" /></div>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => toast.info("Google sign-in coming soon")} className="h-12 rounded-full border border-border flex items-center justify-center gap-2 text-sm hover:bg-secondary/60 transition-colors" data-testid="auth-google-btn"><GoogleLogo size={18} />Google</button>
                <button onClick={() => toast.info("Apple sign-in coming soon")} className="h-12 rounded-full border border-border flex items-center justify-center gap-2 text-sm hover:bg-secondary/60 transition-colors" data-testid="auth-apple-btn"><AppleLogo size={18} />Apple</button>
              </div>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4">
                <div>
                  <label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-1.5">I AM A</label>
                  <div className="grid grid-cols-2 gap-2">
                    {roles.map((r) => (
                      <button type="button" key={r.id} onClick={() => setRole(r.id)} data-testid={`auth-role-${r.id}`} className={`p-4 rounded-xl border text-left transition-all ${role === r.id ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}>
                        <r.icon size={20} weight={role === r.id ? "fill" : "regular"} className={role === r.id ? "text-primary" : "text-muted-foreground"} />
                        <div className="font-display tracking-[0.15em] text-sm mt-2">{r.label}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">{r.desc}</div>
                      </button>
                    ))}
                  </div>
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
          <p className="text-center text-xs text-muted-foreground mt-6">By continuing you agree to our <Link href="#" className="text-primary hover:underline">Terms</Link> &amp; <Link href="#" className="text-primary hover:underline">Privacy Policy</Link>.</p>
        </div>
      </div>
    </div>
  );
}
