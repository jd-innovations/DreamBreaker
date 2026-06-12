import React, { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Logo } from "../components/Logo";
import { useTheme } from "../components/ThemeProvider";
import { Sun, Moon, GoogleLogo, AppleLogo } from "@phosphor-icons/react";
import { HERO_IMG } from "../data/mockData";
import { toast } from "sonner";

const roles = [
  { id: "player", label: "Player" },
  { id: "director", label: "Director" },
  { id: "admin", label: "Admin" },
];

export default function Auth() {
  const [params] = useSearchParams();
  const initialMode = params.get("mode") === "signup" ? "signup" : "login";
  const [mode, setMode] = useState(initialMode);
  const [role, setRole] = useState("player");
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

  const submit = (e) => {
    e.preventDefault();
    toast.success(mode === "login" ? "Welcome back!" : "Account created!", {
      description: `Routing to your ${role} workspace.`,
    });
    const map = { player: "/dashboard", director: "/director", admin: "/admin" };
    setTimeout(() => navigate(map[role]), 600);
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background text-foreground">
      {/* Left: Form */}
      <div className="flex flex-col px-5 sm:px-10 py-6 lg:py-10">
        <div className="flex items-center justify-between">
          <Link to="/" data-testid="auth-home-link"><Logo /></Link>
          <button
            onClick={toggle}
            data-testid="auth-theme-toggle"
            className="h-10 w-10 rounded-full border border-border flex items-center justify-center"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Sun size={18} weight="bold" /> : <Moon size={18} weight="bold" />}
          </button>
        </div>

        <div className="flex-1 flex items-center justify-center py-10">
          <div className="w-full max-w-md">
            <div className="font-mono text-[11px] tracking-[0.3em] text-primary mb-2">
              / {mode === "login" ? "WELCOME BACK" : "JOIN THE LEAGUE"}
            </div>
            <h1 className="font-display text-5xl tracking-wide mb-6">
              {mode === "login" ? "LOG IN." : "SIGN UP."}
            </h1>

            <Tabs value={mode} onValueChange={setMode} className="mb-6">
              <TabsList className="grid w-full grid-cols-2 rounded-full p-1 h-11">
                <TabsTrigger value="login" data-testid="auth-tab-login" className="rounded-full">Login</TabsTrigger>
                <TabsTrigger value="signup" data-testid="auth-tab-signup" className="rounded-full">Sign Up</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="grid grid-cols-3 gap-2 mb-5">
              {roles.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRole(r.id)}
                  data-testid={`auth-role-${r.id}`}
                  className={`py-2.5 rounded-full text-xs font-display tracking-[0.2em] border transition-colors ${
                    role === r.id
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {r.label.toUpperCase()}
                </button>
              ))}
            </div>

            <form onSubmit={submit} className="space-y-4">
              {mode === "signup" && (
                <div>
                  <Label htmlFor="name" className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground">FULL NAME</Label>
                  <Input id="name" required placeholder="Alex Morgan" data-testid="auth-name-input" className="h-12 mt-1 bg-secondary border-border" />
                </div>
              )}
              <div>
                <Label htmlFor="email" className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground">EMAIL</Label>
                <Input id="email" type="email" required placeholder="alex@dreambreaker.pb" data-testid="auth-email-input" className="h-12 mt-1 bg-secondary border-border" />
              </div>
              <div>
                <Label htmlFor="pwd" className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground">PASSWORD</Label>
                <Input id="pwd" type="password" required placeholder="••••••••" data-testid="auth-password-input" className="h-12 mt-1 bg-secondary border-border" />
              </div>

              <Button
                type="submit"
                className="w-full h-12 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-[0.2em]"
                data-testid="auth-submit-btn"
              >
                {mode === "login" ? "ENTER" : "CREATE ACCOUNT"}
              </Button>
            </form>

            <div className="flex items-center gap-3 my-6">
              <div className="h-px bg-border flex-1" />
              <span className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground">OR</span>
              <div className="h-px bg-border flex-1" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button className="h-12 rounded-full border border-border flex items-center justify-center gap-2 hover:border-primary transition-colors" data-testid="auth-google-btn">
                <GoogleLogo size={18} weight="bold" /> <span className="text-sm font-semibold">Google</span>
              </button>
              <button className="h-12 rounded-full border border-border flex items-center justify-center gap-2 hover:border-primary transition-colors" data-testid="auth-apple-btn">
                <AppleLogo size={18} weight="fill" /> <span className="text-sm font-semibold">Apple</span>
              </button>
            </div>

            <p className="text-xs text-muted-foreground text-center mt-7">
              By continuing you agree to the <span className="text-foreground">Terms</span> & <span className="text-foreground">Privacy</span>.
            </p>
          </div>
        </div>
      </div>

      {/* Right: Visual */}
      <div className="hidden lg:block relative border-l border-border overflow-hidden">
        <img src={HERO_IMG} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-tr from-background via-background/40 to-transparent" />
        <div className="absolute bottom-10 left-10 right-10">
          <div className="font-mono text-[11px] tracking-[0.3em] text-primary mb-3">/ DREAM BREAKER PB</div>
          <div className="font-display text-5xl lg:text-6xl tracking-wide leading-[0.9] max-w-md">
            HOLD YOUR SPOT.<br />SWIPE YOUR PARTNER.<br /><span className="text-primary">WIN THE DRAW.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
