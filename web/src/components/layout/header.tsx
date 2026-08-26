"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { Sun, Moon, List, X, ShieldStar } from "@phosphor-icons/react";
import { Logo } from "./logo";
import { useTheme } from "./theme-provider";
import { createClient } from "@/lib/supabase/client";
import { NotificationBell } from "@/components/notifications/bell";

const navLinks = [
  { to: "/tournaments",  label: "Tournaments",   testid: "nav-tournaments" },
  { to: "/play",         label: "Community Play", testid: "nav-community-play" },
  { to: "/matchmaking",  label: "Matchmaking",   testid: "nav-matchmaking" },
  { to: "/dashboard",    label: "Player",        testid: "nav-player" },
  { to: "/director",     label: "Director",      testid: "nav-director" },
  { to: "/admin",        label: "Admin",         testid: "nav-admin" },
];

export function Header() {
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const [initials, setInitials] = useState<string | null>(null);
  const [isDirector, setIsDirector] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const toInitials = (fullName: string) => {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // Session state only, and deliberately synchronous.
  //
  // Nothing awaited belongs in an onAuthStateChange callback. auth-js awaits
  // subscriber callbacks in order and runs them while holding its auth lock, so
  // a slow callback delays every later event — and blocks signOut(), which waits
  // on that same lock. This callback used to run a `profiles` query on every
  // event, including TOKEN_REFRESHED and the SIGNED_IN that fires on tab focus.
  // That is what made Log Out feel dead: the tap was queued behind a database
  // round trip it had no visible relationship to.
  useEffect(() => {
    const supabase = createClient();

    const applySession = (session: Session | null) => {
      setAuthed(!!session);
      if (!session) {
        setUserId(null);
        setInitials(null);
        return;
      }
      setUserId(session.user.id);
      const name = session.user.user_metadata?.full_name as string | undefined;
      setInitials(
        name
          ? toInitials(name)
          : (session.user.email?.split("@")[0] ?? "").slice(0, 2).toUpperCase() || null,
      );
    };

    void supabase.auth.getSession().then(({ data: { session } }) => applySession(session));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) =>
      applySession(session),
    );
    return () => listener.subscription.unsubscribe();
  }, []);

  // Director lookup, kept out of the auth callback on purpose — see above.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!userId) {
        if (!cancelled) setIsDirector(false);
        return;
      }
      const supabase = createClient();
      const { data } = await supabase
        .from("profiles")
        .select("director_status")
        .eq("id", userId)
        .single();
      if (cancelled) return;
      setIsDirector(
        (data as { director_status?: string | null } | null)?.director_status === "approved",
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Sign out of THIS browser only.
  //
  // The default scope is 'global', which revokes every refresh token on the
  // account — logging out on the web would also sign the user out of the phone
  // app. That is not what "Log Out" means to anyone, and it makes the whole
  // action hostage to a network round trip.
  //
  // Navigation happens in `finally`. A signOut that throws has usually still
  // cleared local storage, and stranding someone on a page that visibly did
  // nothing is the worse failure — it is what makes people tap repeatedly.
  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      /* fall through and navigate anyway */
    } finally {
      setLoggingOut(false);
      router.push("/");
      router.refresh();
    }
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
          {authed && userId && (
            <div className="hidden lg:flex" data-testid="header-notifications-btn">
              <NotificationBell userId={userId} />
            </div>
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
                disabled={loggingOut}
                className="hidden sm:inline-flex h-10 px-5 rounded-full font-semibold text-sm border border-border hover:bg-secondary/60 transition-colors items-center disabled:opacity-60"
                data-testid="header-logout-btn"
              >
                {loggingOut ? "Signing out…" : "Log Out"}
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
                {/* crisp gradient ring — always visible */}
                <span className="absolute inset-0 rounded-full bg-gradient-to-r from-violet-500 via-pink-400 to-cyan-400 opacity-100 transition-opacity duration-300" />
                {/* glow halo for the animation feel */}
                <span className="absolute inset-0 rounded-full bg-gradient-to-r from-violet-500 via-pink-400 to-cyan-400 opacity-0 group-hover:opacity-50 blur-[6px] transition-opacity duration-300" />
                <Link
                  href="/auth?mode=signup"
                  className="relative h-8 px-3 sm:h-10 sm:px-5 rounded-full font-semibold text-xs sm:text-sm dark:bg-zinc-950 bg-white text-foreground inline-flex items-center z-10"
                  data-testid="header-getstarted-btn"
                >
                  0-0-2
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
                onClick={() => { setOpen(false); void handleLogout(); }}
                disabled={loggingOut}
                className="px-4 py-3 rounded-lg text-sm font-semibold text-muted-foreground text-left disabled:opacity-60"
                data-testid="mobile-logout-btn"
              >
                {loggingOut ? "Signing out…" : "Log Out"}
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
