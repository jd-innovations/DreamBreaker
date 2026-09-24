"use client";

/**
 * The slide-in menu, matching the app's (owner request, 2026-09-23).
 *
 * Option A of three: the app's SHAPE — a Quick Actions band, a primary nav
 * list, a quieter secondary group — filled with web's own routes. A literal
 * port was rejected because half the app's menu points at screens the website
 * does not have (nearby, chat, stats, wallet, community, and seven separate
 * *-settings pages), and a menu of dead links is worse than a short one.
 *
 * Differences from the app, all deliberate:
 *   - Two Quick Actions, not four. Book a Court and My Bookings have no web
 *     page yet; they join when they do.
 *   - Settings is ONE item, not an eight-item accordion. Web has a single
 *     /settings page, and an accordion holding one child is a lie about depth.
 *   - Colour comes from tokens, never hard-coded navy/gold like the app's.
 *     That is what makes light, dark and system all work here.
 *
 * Under `lg` only. The desktop header already shows its nav inline, so a
 * hamburger there would hide what is currently visible.
 */

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarBlank, GraduationCap, Heart, House, PlusCircle, Question, Gear,
  Shield, ShieldStar, Storefront, Trophy, User, UserPlus, Users, UsersThree, X,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; Icon: React.ElementType };

// Mirrors the app's Quick Actions row, minus the two with no web page.
const QUICK_ACTIONS: Item[] = [
  { href: "/play/create", label: "Create Game",    Icon: PlusCircle },
  { href: "/matchmaking", label: "Partner Finder", Icon: UserPlus },
];

const PRIMARY: Item[] = [
  { href: "/dashboard",   label: "Home",           Icon: House },
  { href: "/play",        label: "Community Play", Icon: CalendarBlank },
  { href: "/tournaments", label: "Tournaments",    Icon: Trophy },
  { href: "/groups",      label: "Groups",         Icon: UsersThree },
  { href: "/matchmaking", label: "Matchmaking",    Icon: Heart },
  { href: "/players",     label: "Players",        Icon: Users },
  { href: "/marketplace", label: "Marketplace",    Icon: Storefront },
  { href: "/lessons",     label: "Lessons",        Icon: GraduationCap },
  { href: "/profile",     label: "Profile",        Icon: User },
];

const SECONDARY: Item[] = [
  { href: "/help",     label: "Help & Support",     Icon: Question },
  { href: "/settings", label: "Settings & Privacy", Icon: Gear },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function SlideMenu({
  open, onClose, authed, isDirector, onLogout, loggingOut,
}: {
  open: boolean;
  onClose: () => void;
  authed: boolean;
  isDirector: boolean;
  onLogout: () => void;
  loggingOut: boolean;
}) {
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape closes, and the page behind does not scroll while it is open —
  // without the lock, dragging the menu scrolls the article underneath it.
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Focus moves into the panel so a keyboard or screen-reader user is not
    // left behind on the toggle button with the menu open in front of them.
    panelRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  const withDirector = isDirector ? [...PRIMARY, { href: "/director", label: "Director", Icon: ShieldStar }] : PRIMARY;
  // Admin sits where the desktop nav already puts it. The /admin layout
  // itself 404s a non-admin, so this reveals a route, not any data.
  const primary: Item[] = [...withDirector, { href: "/admin", label: "Admin", Icon: Shield }];

  return (
    <div
      className={cn("lg:hidden fixed inset-0 z-50", open ? "pointer-events-auto" : "pointer-events-none")}
      aria-hidden={!open}
    >
      {/* Backdrop. Fades rather than appears, so the panel reads as sliding
          over the page instead of the page being replaced. */}
      <div
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-background/70 backdrop-blur-sm transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0",
        )}
      />

      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        data-testid="slide-menu"
        className={cn(
          "absolute inset-y-0 left-0 w-[86%] max-w-sm bg-card border-r border-border",
          "flex flex-col overflow-y-auto outline-none shadow-2xl",
          "transition-transform duration-250 ease-out will-change-transform",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <span className="font-display text-sm uppercase tracking-widest text-muted-foreground">
            Quick Actions
          </span>
          <button
            onClick={onClose}
            aria-label="Close menu"
            data-testid="slide-menu-close"
            className="h-9 w-9 -mr-1 rounded-full border border-border flex items-center justify-center hover:bg-secondary transition-colors"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        {/* The app draws these as gold rings on navy. Here the ring is
            `primary`, which is a readable gold on the dark theme and darkens
            for light — the reason this is a token and not a hex value. */}
        <div className="flex gap-6 px-5 pb-5 pt-1">
          {QUICK_ACTIONS.map(({ href, label, Icon }) => (
            <Link
              key={label}
              href={href}
              onClick={onClose}
              data-testid={`slide-menu-quick-${label.toLowerCase().replace(/\s+/g, "-")}`}
              className="flex w-20 flex-col items-center gap-2 text-center"
            >
              <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-primary text-primary transition-colors hover:bg-primary/10">
                <Icon size={26} weight="regular" />
              </span>
              <span className="text-xs font-medium leading-tight">{label}</span>
            </Link>
          ))}
        </div>

        <div className="mx-5 border-t border-border" />

        <nav className="flex flex-col px-2 py-3">
          {primary.map(({ href, label, Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={label}
                href={href}
                onClick={onClose}
                aria-current={active ? "page" : undefined}
                data-testid={`slide-menu-${label.toLowerCase().replace(/\s+/g, "-")}`}
                className={cn(
                  "flex items-center gap-4 rounded-lg px-3 py-3 text-base transition-colors",
                  active ? "bg-secondary text-foreground font-semibold" : "text-foreground hover:bg-secondary/60",
                )}
              >
                <Icon size={24} weight={active ? "fill" : "regular"} className="text-primary shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="mx-5 border-t border-border" />

        <nav className="flex flex-col px-2 py-3">
          {SECONDARY.map(({ href, label, Icon }) => (
            <Link
              key={label}
              href={href}
              onClick={onClose}
              data-testid={`slide-menu-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
              className="flex items-center gap-4 rounded-lg px-3 py-3 text-sm text-muted-foreground hover:bg-secondary/60 hover:text-foreground transition-colors"
            >
              <Icon size={20} weight="regular" className="shrink-0" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto border-t border-border p-4">
          {authed ? (
            <button
              onClick={() => { onClose(); onLogout(); }}
              disabled={loggingOut}
              data-testid="slide-menu-logout"
              className="h-11 w-full rounded-full border border-border text-sm font-semibold hover:bg-secondary transition-colors disabled:opacity-60"
            >
              {loggingOut ? "Signing out…" : "Log Out"}
            </button>
          ) : (
            <Link
              href="/auth"
              onClick={onClose}
              data-testid="slide-menu-login"
              className="flex h-11 w-full items-center justify-center rounded-full border border-border text-sm font-semibold hover:bg-secondary transition-colors"
            >
              Login
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
