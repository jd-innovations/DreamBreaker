"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Sun, Moon, List, X, Bell, ShieldStar } from "@phosphor-icons/react";
import { Logo } from "./logo";
import { useTheme } from "./theme-provider";
import { createClient } from "@/lib/supabase/client";

const navLinks = [
  { to: "/tournaments",  label: "Tournaments", testid: "nav-tournaments" },
  { to: "/matchmaking",  label: "Matchmaking",  testid: "nav-matchmaking" },
  { to: "/dashboard",    label: "Player",       testid: "nav-player" },
  { to: "/director",     label: "Director",     testid: "nav-director" },
  { to: "/admin",        label: "Admin",        testid: "nav-admin" },
];

export function Header() {
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const [initials, setInitials] = useState<string | null>(null);
  const [isDirector, setIsDirector] = useState(false);
  const [authed, setAuthed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const toInitials = (fullName: string) => {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      setAuthed(true);
      const name = session.user.user_metadata?.full_name as string | undefined;
      setInitials(name ? toInitials(name) : (session.user.email?.split("@")[0] ?? "").slice(0, 2).toUpperCase() || null);
      const { data: prof } = await supabase.from("profiles").select("director_status").eq("id", session.user.id).single();
      setIsDirector((prof as { director_status?: string | null } | null)?.director_status === "approved");
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setAuthed(!!session);
      if (session) {
        const name = session.user.user_metadata?.full_name as string | undefined;
        setInitials(name ? toInitials(name) : (session.user.email?.split("@")[0] ?? "").slice(0, 2).toUpperCase() || null);
        const { data: prof } = await supabase.from("profiles").select("director_status").eq("id", session.user.id).single();
        setIsDirector((prof as { director_status?: string | null } | null)?.director_status === "approved");
      } else {
        setInitials(null);
        setIsDirector(false);
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border" data-testid="site-header">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="shrink-0" data-testid="header-logo-link">
          <Logo />
        </Link>

        <nav className="hidden lg:flex items-center gap-1">
          {navLinks.map((l) => (
            <Link
              key={l.to}
              href={l.to}
              data-testid={l.testid}
              className={`px-4 py-2 text-sm font-semibold rounded-full transition-colors ${
                pathname === l.to
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {/* Notification bell — placeholder until notification service is live */}
          {authed && (
            <button
              aria-label="Notifications"
              data-testid="header-notifications-btn"
              className="hidden lg:flex h-10 w-10 rounded-full border border-border items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors relative"
              onClick={() => {/* wire up notification panel here */}}
            >
              <Bell size={18} weight="bold" />
            </button>
          )}

          <button
            onClick={toggle}
            data-testid="theme-toggle-btn"
            aria-label="Toggle theme"
            className="h-10 w-10 rounded-full border border-border flex items-center justify-center text-foreground hover:bg-secondary transition-colors"
          >
            {theme === "dark" ? <Sun size={18} weight="bold" /> : <Moon size={18} weight="bold" />}
          </button>

          {authed ? (
            <>
              <button
                onClick={handleLogout}
                className="hidden sm:inline-flex h-10 px-5 rounded-full font-semibold text-sm border border-border hover:bg-secondary/60 transition-colors items-center"
                data-testid="header-logout-btn"
              >
                Log Out
              </button>
              <Link
                href="/dashboard"
                className="relative p-[1.5px] rounded-full bg-gradient-to-r from-violet-500 via-pink-400 to-cyan-400 hover:brightness-110 transition-all inline-flex"
                data-testid="header-getstarted-btn"
              >
                <span className="h-[37px] px-5 rounded-full font-mono tracking-widest text-sm bg-gradient-to-br dark:from-zinc-950 dark:to-zinc-800 from-white to-zinc-100 dark:text-white text-zinc-900 inline-flex items-center">
                  {initials ?? "ME"}
                </span>
                {isDirector && (
                  <span className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-amber-400 border-2 border-background flex items-center justify-center shadow-sm">
                    <ShieldStar size={11} weight="fill" className="text-black" />
                  </span>
                )}
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/auth"
                className="hidden sm:inline-flex h-10 px-5 rounded-full font-semibold text-sm border border-border hover:bg-secondary/60 transition-colors items-center"
                data-testid="header-login-btn"
              >
                Login
              </Link>
              <div className="group relative inline-flex p-[1.5px] rounded-full">
                {/* crisp gradient ring */}
                <span className="absolute inset-0 rounded-full bg-gradient-to-r from-violet-500 via-pink-400 to-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                {/* glow halo for the animation feel */}
                <span className="absolute inset-0 rounded-full bg-gradient-to-r from-violet-500 via-pink-400 to-cyan-400 opacity-0 group-hover:opacity-50 blur-[6px] transition-opacity duration-300" />
                <Link
                  href="/auth?mode=signup"
                  className="relative h-8 px-3 sm:h-10 sm:px-5 rounded-full font-semibold text-xs sm:text-sm dark:bg-zinc-950 bg-white text-foreground inline-flex items-center z-10"
                  data-testid="header-getstarted-btn"
                >
                  Get Started
                </Link>
              </div>
            </>
          )}

          <button
            className="lg:hidden h-10 w-10 rounded-full border border-border flex items-center justify-center"
            onClick={() => setOpen(!open)}
            data-testid="mobile-menu-toggle"
            aria-label="Menu"
          >
            {open ? <X size={18} weight="bold" /> : <List size={18} weight="bold" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="lg:hidden border-t border-border bg-background" data-testid="mobile-menu">
          <div className="px-4 py-3 flex flex-col gap-1">
            {navLinks.map((l) => (
              <Link
                key={l.to}
                href={l.to}
                onClick={() => setOpen(false)}
                data-testid={`mobile-${l.testid}`}
                className={`px-4 py-3 rounded-lg text-sm font-semibold ${
                  pathname === l.to ? "bg-secondary text-foreground" : "text-muted-foreground"
                }`}
              >
                {l.label}
              </Link>
            ))}
            {authed ? (
              <button
                onClick={() => { setOpen(false); handleLogout(); }}
                className="px-4 py-3 rounded-lg text-sm font-semibold text-muted-foreground text-left"
                data-testid="mobile-logout-btn"
              >
                Log Out
              </button>
            ) : (
              <Link
                href="/auth"
                onClick={() => setOpen(false)}
                className="px-4 py-3 rounded-lg text-sm font-semibold text-muted-foreground"
                data-testid="mobile-login-btn"
              >
                Login
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
