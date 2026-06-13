"use client";

import { useState } from "react";
import { Bell, Lock, User, Eye, EyeSlash, Trash } from "@phosphor-icons/react";
import { toast } from "sonner";
import { PageShell } from "@/components/layout/page-shell";

type Section = "account" | "security" | "notifications";

const nav: { id: Section; label: string; icon: typeof User }[] = [
  { id: "account", label: "Account", icon: User },
  { id: "security", label: "Security", icon: Lock },
  { id: "notifications", label: "Notifications", icon: Bell },
];

export default function SettingsPage() {
  const [section, setSection] = useState<Section>("account");
  const [showPw, setShowPw] = useState(false);
  const [notifs, setNotifs] = useState({
    tournamentUpdates: true,
    matchResults: true,
    partnerRequests: true,
    marketing: false,
    sms: false,
  });

  const save = () => toast.success("Settings saved.");

  return (
    <PageShell>
      <section className="border-b border-border bg-card/40">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="font-mono text-[11px] tracking-[0.3em] text-primary mb-2">/ YOUR ACCOUNT</div>
          <h1 className="font-display text-4xl sm:text-5xl tracking-wide">SETTINGS</h1>
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row gap-8">
        <nav className="flex sm:flex-col gap-1 sm:w-48 flex-shrink-0">
          {nav.map((n) => (
            <button
              key={n.id}
              onClick={() => setSection(n.id)}
              data-testid={`settings-nav-${n.id}`}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-left transition-colors ${section === n.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"}`}
            >
              <n.icon size={16} weight={section === n.id ? "fill" : "regular"} />
              {n.label}
            </button>
          ))}
        </nav>

        <div className="flex-1 min-w-0">
          {section === "account" && (
            <div className="border border-border rounded-2xl bg-card divide-y divide-border overflow-hidden">
              <div className="p-6">
                <h2 className="font-display text-2xl tracking-wide mb-5">ACCOUNT INFO</h2>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div><label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-1.5">FIRST NAME</label><input defaultValue="Alex" className="w-full h-12 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" data-testid="settings-first-name" /></div>
                    <div><label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-1.5">LAST NAME</label><input defaultValue="Rivera" className="w-full h-12 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" data-testid="settings-last-name" /></div>
                  </div>
                  <div><label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-1.5">EMAIL</label><input type="email" defaultValue="alex@example.com" className="w-full h-12 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" data-testid="settings-email" /></div>
                  <div><label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-1.5">LOCATION</label><input defaultValue="Miami, FL" className="w-full h-12 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" data-testid="settings-location" /></div>
                  <button onClick={save} className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90 h-11 px-6 font-display tracking-[0.2em] text-sm transition-colors" data-testid="settings-save-account">SAVE CHANGES</button>
                </div>
              </div>
              <div className="p-6">
                <h3 className="font-display text-xl tracking-wide text-destructive mb-3">DANGER ZONE</h3>
                <p className="text-sm text-muted-foreground mb-4">Permanently delete your account and all associated data. This cannot be undone.</p>
                <button onClick={() => toast.error("Contact support to delete your account.")} className="rounded-full border border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground h-11 px-6 font-display tracking-[0.2em] text-sm flex items-center gap-2 transition-colors" data-testid="settings-delete-account">
                  <Trash size={16} weight="bold" /> DELETE ACCOUNT
                </button>
              </div>
            </div>
          )}

          {section === "security" && (
            <div className="border border-border rounded-2xl bg-card p-6">
              <h2 className="font-display text-2xl tracking-wide mb-5">SECURITY</h2>
              <div className="space-y-4">
                <div><label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-1.5">CURRENT PASSWORD</label><div className="relative"><input type={showPw ? "text" : "password"} placeholder="••••••••" className="w-full h-12 rounded-xl bg-secondary border border-border px-4 pr-12 text-sm outline-none focus:ring-2 focus:ring-ring" data-testid="settings-current-pw" /><button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground">{showPw ? <EyeSlash size={18} /> : <Eye size={18} />}</button></div></div>
                <div><label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-1.5">NEW PASSWORD</label><input type="password" placeholder="Min 8 characters" className="w-full h-12 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" data-testid="settings-new-pw" /></div>
                <div><label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-1.5">CONFIRM NEW PASSWORD</label><input type="password" placeholder="Re-enter new password" className="w-full h-12 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" data-testid="settings-confirm-pw" /></div>
                <button onClick={save} className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90 h-11 px-6 font-display tracking-[0.2em] text-sm transition-colors" data-testid="settings-save-security">UPDATE PASSWORD</button>
              </div>
            </div>
          )}

          {section === "notifications" && (
            <div className="border border-border rounded-2xl bg-card divide-y divide-border overflow-hidden">
              <div className="p-6">
                <h2 className="font-display text-2xl tracking-wide mb-1">NOTIFICATIONS</h2>
                <p className="text-sm text-muted-foreground">Choose what emails and alerts you receive.</p>
              </div>
              {(Object.entries(notifs) as [keyof typeof notifs, boolean][]).map(([key, val]) => {
                const labels: Record<keyof typeof notifs, { title: string; desc: string }> = {
                  tournamentUpdates: { title: "Tournament updates", desc: "Registration opens, closes, and bracket releases" },
                  matchResults:      { title: "Match results",      desc: "Score confirmations and DUPR updates" },
                  partnerRequests:   { title: "Partner requests",   desc: "When someone swipes right on your profile" },
                  marketing:         { title: "News & promotions",  desc: "New features, events, and offers from DBPB" },
                  sms:               { title: "SMS alerts",         desc: "Text reminders for upcoming matches" },
                };
                return (
                  <div key={key} className="flex items-center justify-between p-5" data-testid={`notif-${key}`}>
                    <div>
                      <div className="font-semibold text-sm">{labels[key].title}</div>
                      <div className="text-xs text-muted-foreground">{labels[key].desc}</div>
                    </div>
                    <button
                      onClick={() => { setNotifs((n) => ({ ...n, [key]: !val })); toast.success("Preference saved."); }}
                      className={`relative h-6 w-11 rounded-full transition-colors flex-shrink-0 ${val ? "bg-primary" : "bg-secondary border border-border"}`}
                      data-testid={`notif-toggle-${key}`}
                    >
                      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${val ? "translate-x-5" : "translate-x-0.5"}`} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
