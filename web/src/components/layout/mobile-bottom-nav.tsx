"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Trophy, Heart, ChatCircleDots, User } from "@phosphor-icons/react";
import { useHideOnScroll } from "./use-hide-on-scroll";

const tabs = [
  { href: "/dashboard",                    label: "Dashboard", Icon: House          },
  { href: "/tournaments",                  label: "Play",      Icon: Trophy         },
  { href: "/matchmaking",                  label: "Match",     Icon: Heart          },
  { href: "/dashboard?section=messages",   label: "Messages",  Icon: ChatCircleDots },
  { href: "/profile",                      label: "Profile",   Icon: User           },
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
      <div className="flex items-center justify-around px-1.5 py-1 rounded-2xl border border-white/10 bg-gradient-to-b from-secondary/80 to-background/70 backdrop-blur-2xl shadow-2xl shadow-black/50">
        {tabs.map(({ href, label, Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              data-testid={`bottom-nav-${label.toLowerCase()}`}
              className="flex flex-col items-center gap-0 px-2.5 py-1 rounded-xl transition-all"
            >
              {active ? (
                <div className="p-[1.5px] rounded-xl bg-gradient-to-r from-violet-500 via-pink-400 to-cyan-400">
                  <div className="h-[28px] w-[28px] rounded-[9px] flex items-center justify-center bg-gradient-to-br dark:from-zinc-950 dark:to-zinc-800 from-white to-zinc-100">
                    <Icon size={18} weight="fill" className="dark:text-white text-zinc-900" />
                  </div>
                </div>
              ) : (
                <div className="h-[31px] w-[31px] flex items-center justify-center rounded-xl">
                  <Icon size={18} weight="regular" className="text-muted-foreground" />
                </div>
              )}
              <span className={`text-[10px] font-mono tracking-wide transition-colors ${active ? "text-foreground" : "text-muted-foreground"}`}>
                {label.toUpperCase()}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
