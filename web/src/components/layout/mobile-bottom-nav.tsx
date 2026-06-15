"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Trophy, Heart, ChatCircleDots, User } from "@phosphor-icons/react";

const tabs = [
  { href: "/dashboard",                    label: "Dashboard", Icon: House          },
  { href: "/tournaments",                  label: "Play",      Icon: Trophy         },
  { href: "/matchmaking",                  label: "Match",     Icon: Heart          },
  { href: "/dashboard?section=messages",   label: "Messages",  Icon: ChatCircleDots },
  { href: "/profile",                      label: "Profile",   Icon: User           },
];

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="lg:hidden fixed bottom-5 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm"
      data-testid="mobile-bottom-nav"
    >
      <div className="flex items-center justify-around px-2 py-2 rounded-2xl border border-white/10 bg-gradient-to-b from-secondary/80 to-background/70 backdrop-blur-2xl shadow-2xl shadow-black/50">
        {tabs.map(({ href, label, Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              data-testid={`bottom-nav-${label.toLowerCase()}`}
              className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all"
            >
              <div className={`h-9 w-9 flex items-center justify-center rounded-xl transition-all ${active ? "bg-primary shadow-lg shadow-primary/40" : ""}`}>
                <Icon
                  size={20}
                  weight={active ? "fill" : "regular"}
                  className={active ? "text-primary-foreground" : "text-muted-foreground"}
                />
              </div>
              <span className={`text-[10px] font-mono tracking-wide transition-colors ${active ? "text-primary" : "text-muted-foreground"}`}>
                {label.toUpperCase()}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
