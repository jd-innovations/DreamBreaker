"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Eye, EyeSlash, Bell, BellSlash, PencilSimple,
  CheckCircle, Warning, CaretDown, CaretUp,
} from "@phosphor-icons/react";
import Link from "next/link";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { getUserId } from "@/lib/dev-user";

// ─── Types ───────────────────────────────────────────────────────────────────

type LookingStatus = "actively_looking" | "open" | "not_looking";

interface Settings {
  isDiscoverable: boolean;
  lookingStatus: LookingStatus;
  notifNewMatch: boolean;
  notifLikedYou: boolean;
  notifHoldExpiry: boolean;
  notifTournaments: boolean;
}

interface CompletionField {
  label: string;
  key: string;
  filled: boolean;
}

interface MatchSettingsPanelProps {
  myDupr: number | null;
  myAvail: string | null;
  myLocation: string | null;
  myStyle: string | null;
  myBio: string | null;
}

const LOOKING_STATUS_LABELS: Record<LookingStatus, string> = {
  actively_looking: "Actively looking",
  open: "Open to it",
  not_looking: "Not looking",
};

const LOOKING_STATUS_COLORS: Record<LookingStatus, string> = {
  actively_looking: "text-primary",
  open: "text-amber-400",
  not_looking: "text-muted-foreground",
};

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 rounded-full transition-colors duration-200 flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background ${on ? "bg-primary" : "bg-border"}`}
    >
      <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${on ? "translate-x-5" : "translate-x-0"}`} />
    </button>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function Section({ label, children, defaultOpen = true }: { label: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-border/60 pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between mb-3 group"
      >
        <span className="font-mono text-[9px] tracking-[0.25em] text-muted-foreground group-hover:text-foreground transition-colors">{label}</span>
        {open ? <CaretUp size={11} className="text-muted-foreground" /> : <CaretDown size={11} className="text-muted-foreground" />}
      </button>
      {open && children}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function MatchSettingsPanel({ myDupr, myAvail, myLocation, myStyle, myBio }: MatchSettingsPanelProps) {
  const [userId, setUserId] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>({
    isDiscoverable: true,
    lookingStatus: "actively_looking",
    notifNewMatch: true,
    notifLikedYou: true,
    notifHoldExpiry: true,
    notifTournaments: true,
  });
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [saving, setSaving] = useState(false);

  // Completeness fields
  const completionFields: CompletionField[] = [
    { label: "DUPR", key: "dupr", filled: !!myDupr },
    { label: "Availability", key: "availability", filled: !!myAvail },
    { label: "Location", key: "location", filled: !!myLocation },
    { label: "Play Style", key: "play_style", filled: !!myStyle },
    { label: "Bio", key: "bio", filled: !!myBio },
  ];
  const filledCount = completionFields.filter((f) => f.filled).length;
  const completePct = Math.round((filledCount / completionFields.length) * 100);

  useEffect(() => {
    const supabase = createClient();
    getUserId().then(async (userId) => {
      if (!userId) return;
      setUserId(userId);
      const user = { id: userId };
      const { data } = await supabase
        .from("profiles")
        .select("is_discoverable,looking_status,notif_new_match,notif_liked_you,notif_hold_expiry,notif_tournaments")
        .eq("id", user.id)
        .single();
      if (data) {
        setSettings({
          isDiscoverable: data.is_discoverable ?? true,
          lookingStatus: (data.looking_status as LookingStatus) ?? "actively_looking",
          notifNewMatch: data.notif_new_match ?? true,
          notifLikedYou: data.notif_liked_you ?? true,
          notifHoldExpiry: data.notif_hold_expiry ?? true,
          notifTournaments: data.notif_tournaments ?? true,
        });
      }
    });
  }, []);

  const save = useCallback(async (patch: Partial<Settings>) => {
    if (!userId) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("profiles").update({
      is_discoverable: next.isDiscoverable,
      looking_status: next.lookingStatus,
      notif_new_match: next.notifNewMatch,
      notif_liked_you: next.notifLikedYou,
      notif_hold_expiry: next.notifHoldExpiry,
      notif_tournaments: next.notifTournaments,
    }).eq("id", userId);
    setSaving(false);
    if (error) toast.error("Failed to save settings.");
  }, [userId, settings]);

  const setLookingStatus = (s: LookingStatus) => {
    setShowStatusMenu(false);
    save({ lookingStatus: s });
  };

  return (
    <div className="border border-border rounded-2xl bg-card p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="font-mono text-[9px] tracking-[0.25em] text-muted-foreground">YOUR MATCH PROFILE</p>
        {saving && <span className="font-mono text-[9px] text-muted-foreground animate-pulse">SAVING…</span>}
      </div>

      {/* Completeness bar */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-muted-foreground">Profile completeness</span>
          <span className={`font-mono text-xs font-bold ${completePct === 100 ? "text-primary" : completePct >= 60 ? "text-amber-400" : "text-destructive"}`}>{completePct}%</span>
        </div>
        <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${completePct === 100 ? "bg-primary" : completePct >= 60 ? "bg-amber-400" : "bg-destructive"}`}
            style={{ width: `${completePct}%` }}
          />
        </div>
        {/* Missing fields */}
        {filledCount < completionFields.length && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {completionFields.filter((f) => !f.filled).map((f) => (
              <span key={f.key} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-destructive/10 border border-destructive/20 text-[9px] font-mono text-destructive">
                <Warning size={9} weight="fill" />{f.label}
              </span>
            ))}
          </div>
        )}
        {filledCount === completionFields.length && (
          <p className="text-[10px] text-primary flex items-center gap-1 mt-1.5">
            <CheckCircle size={11} weight="fill" /> Profile complete — best match results
          </p>
        )}
        <Link href="/profile?tab=about">
          <button className="mt-2.5 w-full h-8 rounded-full border border-border text-[10px] font-mono tracking-wider hover:bg-secondary/60 transition-colors flex items-center justify-center gap-1.5">
            <PencilSimple size={11} weight="bold" /> EDIT PROFILE
          </button>
        </Link>
      </div>

      {/* Discoverability */}
      <Section label="DISCOVERABILITY">
        <div className="space-y-3">
          {/* Visible toggle */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium flex items-center gap-1.5">
                {settings.isDiscoverable
                  ? <Eye size={14} weight="bold" className="text-primary" />
                  : <EyeSlash size={14} weight="bold" className="text-muted-foreground" />}
                Visible in finder
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {settings.isDiscoverable ? "Players can find you" : "Hidden from all decks"}
              </p>
            </div>
            <Toggle on={settings.isDiscoverable} onChange={(v) => save({ isDiscoverable: v })} />
          </div>

          {/* Looking status */}
          <div className="relative">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Status</span>
              <button
                type="button"
                onClick={() => setShowStatusMenu((v) => !v)}
                disabled={!settings.isDiscoverable}
                className={`flex items-center gap-1.5 text-xs font-semibold transition-colors disabled:opacity-40 ${LOOKING_STATUS_COLORS[settings.lookingStatus]}`}
              >
                {LOOKING_STATUS_LABELS[settings.lookingStatus]}
                <CaretDown size={11} weight="bold" />
              </button>
            </div>
            {showStatusMenu && (
              <div className="absolute right-0 top-7 z-20 w-44 rounded-xl border border-border bg-card shadow-xl overflow-hidden">
                {(Object.keys(LOOKING_STATUS_LABELS) as LookingStatus[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setLookingStatus(s)}
                    className={`w-full text-left px-4 py-2.5 text-sm hover:bg-secondary transition-colors flex items-center justify-between ${settings.lookingStatus === s ? "font-semibold" : ""}`}
                  >
                    <span className={LOOKING_STATUS_COLORS[s]}>{LOOKING_STATUS_LABELS[s]}</span>
                    {settings.lookingStatus === s && <CheckCircle size={13} weight="fill" className="text-primary" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* Notifications */}
      <Section label="NOTIFICATIONS" defaultOpen={false}>
        <div className="space-y-3">
          {[
            { label: "New match", sub: "When someone likes you back", key: "notifNewMatch" as keyof Settings },
            { label: "Someone liked you", sub: "Get notified on new likes", key: "notifLikedYou" as keyof Settings },
            { label: "Hold expiry", sub: "Remind before spot expires", key: "notifHoldExpiry" as keyof Settings },
            { label: "Tournament alerts", sub: "Reminders & updates", key: "notifTournaments" as keyof Settings },
          ].map(({ label, sub, key }) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium flex items-center gap-1.5">
                  {settings[key]
                    ? <Bell size={13} weight="fill" className="text-primary flex-shrink-0" />
                    : <BellSlash size={13} weight="bold" className="text-muted-foreground flex-shrink-0" />}
                  {label}
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{sub}</p>
              </div>
              <Toggle
                on={settings[key] as boolean}
                onChange={(v) => save({ [key]: v })}
              />
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
