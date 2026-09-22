"use client";

// The two halves of /admin/notifications: one-off Campaigns and the recurring
// Automations catalog. Separate routes rather than client tabs so each keeps
// its own URL, back button and server gate.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/notifications", label: "Campaigns" },
  { href: "/admin/notifications/automations", label: "Automations" },
] as const;

export function NotificationsTabs() {
  const pathname = usePathname();
  return (
    <nav className="mt-4 flex gap-1 border-b border-border" aria-label="Notification sections">
      {TABS.map((t) => {
        // Campaigns owns the exact path only; anything deeper is a detail page.
        const active = t.href === "/admin/notifications"
          ? pathname === t.href || pathname.startsWith("/admin/notifications/compose")
          : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
