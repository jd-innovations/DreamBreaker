"use client";

/**
 * The admin sidebar, shared by the /admin panel and every standalone admin
 * page (2026-11-25). Before this, the sidebar lived inside admin/page.tsx and
 * the standalone pages (Court Check, Wallet, Reviews...) had no sidebar, and
 * five of them had no way back at all.
 *
 * Two kinds of item:
 *  - "section": a view inside the /admin panel. Inside the panel it switches
 *    the view in place (onSection); anywhere else it is a link to
 *    /admin?section=<id>.
 *  - "page": a standalone route under /admin/*. Active when the current path
 *    starts with its href.
 */

import Link from "next/link";
import {
  Users, CurrencyDollar, Trophy, Gauge, Gear, SignOut, ShieldCheck, Envelope, Megaphone,
  CheckFat, ChatCircleDots, Star, PencilSimple, Buildings, Flag, Ticket, Wallet, Storefront,
  GraduationCap, MagnifyingGlassPlus, UploadSimple, Tray, EnvelopeOpen,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";
import { Logo } from "@/components/layout/logo";

export type AdminSection =
  | "dashboard" | "approvals" | "directors" | "users" | "tournaments" | "finance" | "reconciliation"
  | "comms" | "messages" | "email_templates" | "settings" | "reports" | "support_tickets";

export const ADMIN_SECTIONS: readonly AdminSection[] = [
  "dashboard", "approvals", "directors", "users", "tournaments", "finance", "reconciliation",
  "comms", "messages", "email_templates", "settings", "reports", "support_tickets",
];

export function isAdminSection(v: string | null | undefined): v is AdminSection {
  return !!v && (ADMIN_SECTIONS as readonly string[]).includes(v);
}

/** Count badges. "alert" ones are amber/red; "count" ones are plain totals. */
export type AdminBadges = Partial<Record<AdminSection, number>>;
const ALERT_RED: AdminSection[] = ["reconciliation", "reports"];
const PLAIN: AdminSection[] = ["users", "tournaments", "messages", "comms"];

type Item =
  | { kind: "section"; id: AdminSection; label: string; icon: PhosphorIcon }
  | { kind: "page"; href: string; label: string; icon: PhosphorIcon };

export const ADMIN_GROUPS: { title: string; items: Item[] }[] = [
  { title: "PLATFORM", items: [
    { kind: "section", id: "dashboard", label: "Dashboard", icon: Gauge },
    { kind: "section", id: "finance", label: "Finance", icon: CurrencyDollar },
  ] },
  { title: "QUEUE", items: [
    { kind: "section", id: "approvals", label: "Approvals", icon: CheckFat },
    { kind: "section", id: "directors", label: "Directors", icon: ShieldCheck },
    { kind: "section", id: "reconciliation", label: "Reconciliation", icon: CurrencyDollar },
    { kind: "section", id: "reports", label: "Reports", icon: Flag },
    { kind: "section", id: "support_tickets", label: "Support Tickets", icon: Ticket },
  ] },
  { title: "MANAGEMENT", items: [
    { kind: "section", id: "users", label: "Users", icon: Users },
    { kind: "section", id: "tournaments", label: "Tournaments", icon: Trophy },
  ] },
  { title: "COURTS", items: [
    { kind: "page", href: "/admin/facility-submissions", label: "Court Submissions", icon: Tray },
    { kind: "page", href: "/admin/court-check", label: "Court Check", icon: MagnifyingGlassPlus },
    { kind: "page", href: "/admin/facility-import", label: "Facility Import", icon: UploadSimple },
    { kind: "page", href: "/admin/facility-applications", label: "Facility Applications", icon: Buildings },
  ] },
  { title: "COMMERCE", items: [
    { kind: "page", href: "/admin/marketplace", label: "Marketplace", icon: Storefront },
    { kind: "page", href: "/admin/coaching", label: "Coaching", icon: GraduationCap },
    { kind: "page", href: "/admin/wallet", label: "Wallet Grants", icon: Wallet },
  ] },
  { title: "COMMUNICATIONS", items: [
    { kind: "section", id: "messages", label: "Messages", icon: ChatCircleDots },
    { kind: "section", id: "comms", label: "Email Comms", icon: Envelope },
    { kind: "section", id: "email_templates", label: "Email Templates", icon: PencilSimple },
    { kind: "page", href: "/admin/notifications", label: "Push Campaigns", icon: Megaphone },
    { kind: "page", href: "/admin/reviews", label: "Review Invitations", icon: Star },
    { kind: "page", href: "/admin/email-preview", label: "Email Preview", icon: EnvelopeOpen },
  ] },
];

/** Group title + label for a standalone path, for the page header breadcrumb. */
export function adminPageTrail(pathname: string): { group: string; label: string } | null {
  for (const g of ADMIN_GROUPS) {
    for (const it of g.items) {
      if (it.kind === "page" && (pathname === it.href || pathname.startsWith(it.href + "/"))) {
        return { group: g.title[0] + g.title.slice(1).toLowerCase(), label: it.label };
      }
    }
  }
  return null;
}

const ROW = "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors";
const ON = "bg-primary text-primary-foreground";
const OFF = "text-muted-foreground hover:text-foreground hover:bg-secondary";

export function AdminSidebar({
  currentSection, pathname, badges = {}, onSection, onNavigate, adminName,
}: {
  /** The panel view that is open (only inside /admin). */
  currentSection?: AdminSection | null;
  /** The current path, to highlight a standalone page. */
  pathname: string;
  badges?: AdminBadges;
  /** Inside the panel: switch view in place. Elsewhere: omitted, items are links. */
  onSection?: (id: AdminSection) => void;
  /** Called after any item is chosen (closes the phone drawer). */
  onNavigate?: () => void;
  adminName: string;
}) {
  const sectionItem = (id: AdminSection, label: string, Icon: PhosphorIcon, cls = ROW) => {
    const active = currentSection === id;
    const n = badges[id] ?? 0;
    const badgeCls = active
      ? "bg-white/20 text-white"
      : ALERT_RED.includes(id) ? "bg-destructive/20 text-destructive"
      : PLAIN.includes(id) ? "bg-primary/10 text-primary" : "bg-amber-400/20 text-amber-400";
    const inner = (
      <>
        <Icon size={16} weight={active ? "fill" : "regular"} />
        {label}
        {n > 0 && <span className={`ml-auto text-[10px] font-mono px-1.5 rounded-full ${badgeCls}`}>{n}</span>}
      </>
    );
    if (onSection) {
      return (
        <button key={id} type="button" onClick={() => { onSection(id); onNavigate?.(); }} className={`${cls} ${active ? ON : OFF}`}>
          {inner}
        </button>
      );
    }
    return (
      <Link key={id} href={`/admin?section=${id}`} onClick={onNavigate} className={`${cls} ${active ? ON : OFF}`}>
        {inner}
      </Link>
    );
  };

  const firstInitial = (adminName.trim()[0] ?? "A").toUpperCase();

  return (
    <>
      <div className="px-5 py-5 border-b border-border flex-shrink-0">
        <Link href="/"><Logo /></Link>
        <div className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground mt-1">ADMIN PORTAL</div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto" aria-label="Admin">
        {ADMIN_GROUPS.map((g, gi) => (
          <div key={g.title}>
            <div className={`font-mono text-[9px] tracking-widest text-muted-foreground px-3 mb-2 ${gi ? "mt-4" : ""}`}>{g.title}</div>
            {g.items.map((it) => {
              if (it.kind === "section") return sectionItem(it.id, it.label, it.icon);
              const active = pathname === it.href || pathname.startsWith(it.href + "/");
              const Icon = it.icon;
              return (
                <Link key={it.href} href={it.href} onClick={onNavigate} aria-current={active ? "page" : undefined}
                  className={`${ROW} ${active ? ON : OFF}`}>
                  <Icon size={16} weight={active ? "fill" : "regular"} /> {it.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-border px-3 py-3 space-y-0.5 flex-shrink-0">
        {sectionItem("settings", "Settings", Gear, "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors")}
        <Link href="/dashboard" className={`${ROW} ${OFF} font-normal`}><Users size={16} /> Player View</Link>
        <Link href="/director" className={`${ROW} ${OFF} font-normal`}><Trophy size={16} /> Director View</Link>
        <Link href="/auth" className={`${ROW} ${OFF} font-normal`}><SignOut size={16} /> Log out</Link>
        <div className="flex items-center gap-3 px-3 py-2.5 mt-1 border-t border-border">
          <div className="h-8 w-8 rounded-full bg-yellow-400/20 flex items-center justify-center flex-shrink-0">
            <span className="font-display text-sm text-yellow-400">{firstInitial}</span>
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{adminName}</div>
            <div className="text-[10px] text-yellow-400 font-mono">ADMINISTRATOR</div>
          </div>
        </div>
      </div>
    </>
  );
}
