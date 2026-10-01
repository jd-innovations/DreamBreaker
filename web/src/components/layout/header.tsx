"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { Sun, Moon, List, X, ShieldStar, CaretDown } from "@phosphor-icons/react";
import { SlideMenu } from "@/components/layout/slide-menu";
import { Logo } from "./logo";
import { useTheme } from "./theme-provider";
import { createClient } from "@/lib/supabase/client";
import { resetAnalytics } from "@/lib/analytics";
import { NotificationBell } from "@/components/notifications/bell";
import { useHideOnScroll } from "./use-hide-on-scroll";

const navLinks = [
  { to: "/tournaments",  label: "Tournaments",   testid: "nav-tournaments" },
  { to: "/play",         label: "Community Play", testid: "nav-community-play" },
  { to: "/groups",       label: "Groups",        testid: "nav-groups" },
  { to: "/marketplace",  label: "Marketplace",   testid: "nav-marketplace" },
  { to: "/lessons",      label: "Lessons",       testid: "nav-lessons" },
  { to: "/players",      label: "Players",       testid: "nav-players" },
  { to: "/matchmaking",  label: "Matchmaking",   testid: "nav-matchmaking" },
];

// Desktop groups the three dashboards under one "Dashboards" item (owner,
// 2026-09-30) so the bar fits at 1280px. The phone slide menu lists them as
// before. Visibility is unchanged: each page handles its own access.
const dashboardLinks = [
  { to: "/dashboard",    label: "Player",        testid: "nav-player" },
  { to: "/director",     label: "Director",      testid: "nav-director" },
  { to: "/admin",        label: "Admin",         testid: "nav-admin" },
];

/**
 * "Dashboards" menu: opens on hover, click or keyboard focus (hover alone
 * fails on touch laptops and for keyboard users); closes on Escape, an outside
 * click, or leaving it, after a short delay so it doesn't snap shut.
 */
function DashboardsMenu({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = dashboardLinks.some((l) => pathname === l.to || pathname.startsWith(`${l.to}/`));

  const show = () => { if (closeTimer.current) clearTimeout(closeTimer.current); setOpen(true); };
  const hideSoon = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  return (
    <div
      ref={wrapRef}
      className="relative"
      onMouseEnter={show}
      onMouseLeave={hideSoon}
      onFocus={show}
      onBlur={(e) => { if (!wrapRef.current?.contains(e.relatedTarget as Node)) hideSoon(); }}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-testid="nav-dashboards"
        className={`flex items-center gap-1 px-3 2xl:px-4 py-2 text-sm font-semibold rounded-full transition-colors ${
          active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
        }`}
      >
        Dashboards <CaretDown size={12} weight="bold" className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full pt-2 z-50">
          <div className="min-w-44 rounded-2xl border border-border bg-card shadow-2xl p-1.5">
            {dashboardLinks.map((l) => {
              const current = pathname === l.to || pathname.startsWith(`${l.to}/`);
              return (
                <Link
                  key={l.to}
                  href={l.to}
                  role="menuitem"
                  data-testid={l.testid}
                  onClick={() => setOpen(false)}
                  className={`block px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${
                    current ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

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
  // Phone layout only (below lg): slides away on scroll down, back on scroll
  // up; never while the menu is open. Desktop is unchanged.
  const hidden = useHideOnScroll(open);

  // Bars pinned under the header (Tournaments filter bar) follow it up, via
  // --mobile-header-top on the root element.
  useEffect(() => {
    document.documentElement.style.setProperty("--mobile-header-top", hidden ? "0px" : "52px");
  }, [hidden]);

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
      // Clears the analytics identity too. Without this a shared browser
      // attributes the next person's whole session to whoever logged out —
      // and unlike the auth session, PostHog's identity survives navigation.
      resetAnalytics();
      setLoggingOut(false);
      router.push("/");
      router.refresh();
    }
  };

  return (
    <header
      className={`sticky top-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border transition-transform duration-200 motion-reduce:transition-none ${
        hidden ? "max-lg:-translate-y-full" : ""
      }`}
      data-testid="site-header"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-[52px] lg:h-16 flex items-center justify-between gap-3 lg:gap-4">
        <Link href="/" className="shrink-0" data-testid="header-logo-link">
          <Logo />
        </Link>

        {/* Inline links from xl (1280px): below that they don't fit, so the ☰
            slide menu (same as phones) takes over from 1024 to 1279 too. */}
        <nav className="hidden xl:flex items-center gap-1">
          {navLinks.map((l) => (
            <Link
              key={l.to}
              href={l.to}
              data-testid={l.testid}
              className={`px-3 2xl:px-4 py-2 text-sm font-semibold rounded-full transition-colors ${
                pathname === l.to
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
              }`}
            >
              {l.label}
            </Link>
          ))}
          <DashboardsMenu pathname={pathname} />
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
            className="h-9 w-9 lg:h-10 lg:w-10 rounded-full border border-border flex items-center justify-center text-foreground hover:bg-secondary transition-colors"
          >
            {theme === "dark" ? <Sun size={16} weight="bold" className="lg:hidden" /> : <Moon size={16} weight="bold" className="lg:hidden" />}
            {theme === "dark" ? <Sun size={18} weight="bold" className="hidden lg:block" /> : <Moon size={18} weight="bold" className="hidden lg:block" />}
          </button>

          {authed ? (
            <>
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="hidden lg:inline-flex h-10 px-5 rounded-full font-semibold text-sm border border-border hover:bg-secondary/60 transition-colors items-center disabled:opacity-60"
                data-testid="header-logout-btn"
              >
                {loggingOut ? "Signing out…" : "Log Out"}
              </button>
              <Link
                href="/dashboard"
                className="relative p-[1.5px] rounded-full bg-gradient-to-r from-violet-500 via-pink-400 to-cyan-400 hover:brightness-110 transition-all inline-flex"
                data-testid="header-getstarted-btn"
              >
                <span className="h-[33px] px-4 lg:h-[37px] lg:px-5 rounded-full font-mono tracking-widest text-sm bg-gradient-to-br dark:from-zinc-950 dark:to-zinc-800 from-white to-zinc-100 dark:text-white text-zinc-900 inline-flex items-center">
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
            className="xl:hidden h-9 w-9 rounded-full border border-border flex items-center justify-center"
            onClick={() => setOpen(!open)}
            data-testid="mobile-menu-toggle"
            aria-label="Menu"
          >
            {open ? <X size={18} weight="bold" /> : <List size={18} weight="bold" />}
          </button>
        </div>
      </div>

      {/* The app's slide-in menu, not a dropdown under the header
          (owner request, 2026-09-23). Rendered always so it can animate out;
          it is pointer-events-none and off-canvas while closed. */}
      <SlideMenu
        open={open}
        onClose={() => setOpen(false)}
        authed={authed}
        isDirector={isDirector}
        onLogout={() => void handleLogout()}
        loggingOut={loggingOut}
      />

    </header>
  );
}
