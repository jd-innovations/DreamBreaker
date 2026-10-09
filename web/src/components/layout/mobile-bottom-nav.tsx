"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, CalendarBlank, Users, ChatCircleDots, User } from "@phosphor-icons/react";
import { useHideOnScroll } from "./use-hide-on-scroll";

// Mirrors the app's tab bar (Home / Events / Partner / Profile), with
// Messages in place of Nearby, which has no web page (COPY_ALIGNMENT.md D6).
const tabs = [
  { href: "/dashboard",                    label: "Home",     Icon: House          },
  { href: "/dashboard?section=events",     label: "Events",   Icon: CalendarBlank  },
  { href: "/matchmaking",                  label: "Partner",  Icon: Users          },
  { href: "/dashboard?section=messages",   label: "Messages", Icon: ChatCircleDots },
  { href: "/profile",                      label: "Profile",  Icon: User           },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  // Slides off on scroll down, back on scroll up, like the header (2026-09-30).
  const hidden = useHideOnScroll();

  if (pathname === "/matchmaking") return null;

  return (
    <nav
      className={`lg:hidden fixed bottom-3 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm transition-transform duration-200 motion-reduce:transition-none ${
        hidden ? "translate-y-[calc(100%+1rem)]" : ""
      }`}
      data-testid="mobile-bottom-nav"
    >
      <div className="flex items-center justify-around px-1.5 py-0.5 rounded-2xl border border-white/10 bg-gradient-to-b from-secondary/80 to-background/70 backdrop-blur-2xl shadow-2xl shadow-black/50">
        {tabs.map(({ href, label, Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              data-testid={`bottom-nav-${label.toLowerCase()}`}
              // Icon-only, like Facebook (owner, 2026-09-30): the name is
              // still announced and shown on long-press / hover.
              aria-label={label}
              title={label}
              aria-current={active ? "page" : undefined}
              className="flex items-center justify-center px-2 py-0.5 rounded-xl transition-all"
            >
              {active ? (
                <div className="p-[1.5px] rounded-xl bg-gradient-to-r from-violet-500 via-pink-400 to-cyan-400">
                  <div className="h-[34px] w-[34px] rounded-[10px] flex items-center justify-center bg-gradient-to-br dark:from-zinc-950 dark:to-zinc-800 from-white to-zinc-100">
                    <Icon size={22} weight="fill" className="dark:text-white text-zinc-900" />
                  </div>
                </div>
              ) : (
                <div className="h-[37px] w-[37px] flex items-center justify-center rounded-xl">
                  <Icon size={22} weight="regular" className="text-muted-foreground" />
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
