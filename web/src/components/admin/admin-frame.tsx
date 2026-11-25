"use client";

/**
 * Frame for every standalone admin page (/admin/court-check, /admin/wallet...):
 * the same sidebar as the /admin panel, a top bar with where-you-are, and the
 * page in the scrollable main area. Replaces the site PageShell those pages
 * used, which had no admin navigation.
 *
 * The top bar is h-16 on every size, so pages sized as "100vh - 4rem" (Email
 * Preview) still fit.
 *
 * Badges: only the queue counts are loaded here (approvals, directors, support
 * tickets), three head-only count queries. Access control stays where it was:
 * each page or layout checks is_admin(), and RLS on every table.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import { getUserId } from "@/lib/dev-user";
import { AdminSidebar, adminPageTrail, type AdminBadges } from "./admin-nav";

export function AdminFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/admin";
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [adminName, setAdminName] = useState("Admin");
  const [badges, setBadges] = useState<AdminBadges>({});
  const trail = adminPageTrail(pathname);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const userId = await getUserId();
      if (!userId) return;
      const head = { count: "exact" as const, head: true };
      const [profile, approvals, directors, tickets] = await Promise.all([
        supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
        supabase.from("tournaments").select("id", head).eq("status", "pending_approval"),
        supabase.from("profiles").select("id", head).eq("director_status", "pending"),
        supabase.from("support_tickets").select("id", head).in("status", ["open", "in_progress"]),
      ]);
      if (cancelled) return;
      setAdminName((profile.data?.full_name as string | null) ?? "Admin");
      setBadges({ approvals: approvals.count ?? 0, directors: directors.count ?? 0, support_tickets: tickets.count ?? 0 });
    })();
    return () => { cancelled = true; };
  }, [supabase]);


  const sidebar = <AdminSidebar pathname={pathname} badges={badges} adminName={adminName} onNavigate={() => setOpen(false)} />;

  return (
    <div className="min-h-svh flex bg-background text-foreground">
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-card border-r border-border flex flex-col z-50">
            <div className="flex items-center justify-between px-5 pt-4 pb-0 flex-shrink-0">
              <span className="font-mono text-[10px] tracking-widest text-muted-foreground">MENU</span>
              <button type="button" aria-label="Close menu" onClick={() => setOpen(false)}
                className="h-8 w-8 rounded-full border border-border flex items-center justify-center">
                <X size={14} weight="bold" />
              </button>
            </div>
            {sidebar}
          </aside>
        </div>
      )}

      <aside className="w-60 flex-shrink-0 border-r border-border bg-card hidden lg:flex flex-col h-svh sticky top-0">
        {sidebar}
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-20 h-16 bg-background/95 backdrop-blur border-b border-border px-4 sm:px-6 lg:px-8 flex items-center gap-3">
          <button type="button" aria-label="Open admin menu" onClick={() => setOpen(true)}
            className="lg:hidden h-9 w-9 rounded-xl border border-border flex items-center justify-center flex-shrink-0 hover:bg-secondary transition-colors">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
          <nav aria-label="Breadcrumb" className="min-w-0 truncate text-sm">
            <Link href="/admin" className="text-muted-foreground hover:text-foreground">Admin</Link>
            {trail && (
              <>
                <span className="text-muted-foreground"> / {trail.group} / </span>
                <span className="font-medium">{trail.label}</span>
              </>
            )}
          </nav>
        </header>
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
