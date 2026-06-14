"use client";

import { useEffect, useRef } from "react";
import {
  X, Heart, XCircle, Lightning, MapPin, Star, Trophy,
  Users, Calendar, CheckCircle, Medal,
} from "@phosphor-icons/react";

interface SheetPartner {
  id: string;
  name: string;
  handle: string | null;
  dupr: number | null;
  skill_level: string | null;
  location: string;
  distance: string | null;
  availability: string | null;
  play_style: string | null;
  img: string;
  bio: string | null;
  matchPct: number;
  matchReasons: string[];
  tournamentOverlap: string | null;
  mutuals: number;
  isTopRated: boolean;
  isVerified: boolean;
  badges: string[];
}

interface PlayerProfileSheetProps {
  partner: SheetPartner | null;
  onClose: () => void;
  onPass: () => void;
  onLike: () => void;
  onSuperConnect: () => void;
}

export function PlayerProfileSheet({ partner, onClose, onPass, onLike, onSuperConnect }: PlayerProfileSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  // Close on backdrop click
  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Prevent body scroll while open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  if (!partner) return null;

  const handlePass = () => { onPass(); onClose(); };
  const handleLike = () => { onLike(); onClose(); };
  const handleSuper = () => { onSuperConnect(); onClose(); };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      onClick={handleBackdrop}
      data-testid="profile-sheet-backdrop"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Sheet — sits above bottom nav (64px) */}
      <div
        ref={sheetRef}
        className="relative z-10 w-full max-w-lg mx-auto bg-background border-t border-x border-border rounded-t-3xl flex flex-col animate-in slide-in-from-bottom duration-300"
        style={{ maxHeight: "calc(88dvh - 108px)", marginBottom: "108px" }}
        data-testid="profile-sheet"
      >
        {/* Drag handle + close row */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2 flex-shrink-0">
          <div className="w-9" />
          <div className="h-1 w-10 rounded-full bg-border" />
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-full bg-card border border-border flex items-center justify-center hover:bg-secondary transition-colors"
            data-testid="profile-sheet-close"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 min-h-0">
          {/* Hero photo */}
          <div className="relative h-72 overflow-hidden flex-shrink-0">
            <img src={partner.img} alt="" className="h-full w-full object-cover object-top" />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />

            {/* Match ring */}
            <div className="absolute top-4 left-4">
              <MatchRingMini pct={partner.matchPct} />
            </div>

            {/* TOP RATED badge */}
            {partner.isTopRated && (
              <div className="absolute top-4 right-14 px-3 py-1.5 rounded-full bg-primary text-primary-foreground font-mono text-[10px] tracking-[0.2em] font-bold">
                TOP RATED
              </div>
            )}

            {/* Name overlay */}
            <div className="absolute bottom-4 left-5 right-5">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-3xl tracking-wide text-white leading-tight">{partner.name}</h2>
                {partner.isVerified && <CheckCircle size={18} weight="fill" className="text-primary flex-shrink-0" />}
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {partner.dupr ? (
                  <span className="bg-primary text-primary-foreground text-xs font-mono font-bold px-2.5 py-1 rounded-full">
                    {partner.dupr} DUPR
                  </span>
                ) : partner.skill_level ? (
                  <span className="bg-secondary/80 text-foreground text-xs font-mono px-2.5 py-1 rounded-full flex items-center gap-1">
                    <Star size={11} weight="fill" className="text-primary" />
                    {partner.skill_level.replace("-", " – ")}
                  </span>
                ) : null}
                <span className="flex items-center gap-1 text-white/80 text-xs">
                  <MapPin size={12} weight="bold" />{partner.location}{partner.distance ? ` · ${partner.distance}` : ""}
                </span>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="px-5 pb-4 space-y-5">
            {/* Quick stats row */}
            <div className="grid grid-cols-3 gap-3 pt-2">
              {[
                { icon: Trophy, label: "MATCH", value: `${partner.matchPct}%` },
                { icon: Users, label: "MUTUALS", value: partner.mutuals > 0 ? `${partner.mutuals}` : "—" },
                { icon: Medal, label: "OVERLAP", value: partner.tournamentOverlap ?? "—" },
              ].map((s) => (
                <div key={s.label} className="border border-border rounded-xl bg-card p-3 text-center">
                  <s.icon size={14} weight="fill" className="text-primary mx-auto mb-1" />
                  <div className="font-display text-lg tracking-wide">{s.value}</div>
                  <div className="font-mono text-[9px] tracking-[0.2em] text-muted-foreground">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Bio */}
            {partner.bio && (
              <div>
                <p className="font-mono text-[9px] tracking-[0.25em] text-muted-foreground mb-1.5">ABOUT</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{partner.bio}</p>
              </div>
            )}

            {/* Info chips */}
            {(partner.availability || partner.play_style) && (
              <div className="grid grid-cols-2 gap-2">
                {partner.availability && (
                  <div className="bg-card border border-border rounded-xl px-3 py-2.5">
                    <div className="font-mono text-[9px] tracking-[0.2em] text-muted-foreground mb-0.5">AVAILABILITY</div>
                    <div className="text-sm font-semibold leading-tight">{partner.availability}</div>
                  </div>
                )}
                {partner.play_style && (
                  <div className="bg-card border border-border rounded-xl px-3 py-2.5">
                    <div className="font-mono text-[9px] tracking-[0.2em] text-muted-foreground mb-0.5">PLAY STYLE</div>
                    <div className="text-sm font-semibold leading-tight">{partner.play_style}</div>
                  </div>
                )}
              </div>
            )}

            {/* Why we matched */}
            {partner.matchReasons.length > 0 && (
              <div>
                <p className="font-mono text-[9px] tracking-[0.25em] text-primary mb-2 flex items-center gap-1.5">
                  <Lightning size={10} weight="fill" /> WHY WE MATCHED YOU
                </p>
                <div className="flex flex-wrap gap-2">
                  {partner.matchReasons.map((r) => (
                    <span key={r} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-primary/40 bg-primary/8 text-xs font-mono text-primary">
                      <CheckCircle size={11} weight="fill" />{r}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Badges */}
            {partner.badges.length > 0 && (
              <div>
                <p className="font-mono text-[9px] tracking-[0.25em] text-muted-foreground mb-2">STYLE TAGS</p>
                <div className="flex flex-wrap gap-2">
                  {partner.badges.map((b) => (
                    <span key={b} className="px-3 py-1.5 rounded-full bg-secondary border border-border text-xs font-mono">{b}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Handle */}
            {partner.handle && (
              <div className="border-t border-border pt-4">
                <span className="font-mono text-xs text-primary">{partner.handle}</span>
              </div>
            )}
          </div>
        </div>

        {/* Sticky action bar */}
        <div className="sticky bottom-0 bg-background border-t border-border px-5 py-4 flex items-center gap-4">
          <button
            onClick={handlePass}
            className="flex-1 h-12 rounded-full border-2 border-destructive text-destructive font-display tracking-[0.15em] text-sm flex items-center justify-center gap-2 hover:bg-destructive/10 transition-colors active:scale-95"
            data-testid="sheet-pass-btn"
          >
            <XCircle size={18} weight="fill" /> PASS
          </button>
          <button
            onClick={handleSuper}
            className="h-12 w-12 rounded-full bg-foreground text-background flex items-center justify-center transition-all hover:scale-105 active:scale-95 flex-shrink-0"
            data-testid="sheet-super-btn"
            title="Super Connect"
          >
            <Lightning size={20} weight="fill" />
          </button>
          <button
            onClick={handleLike}
            className="flex-1 h-12 rounded-full bg-primary text-primary-foreground font-display tracking-[0.15em] text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors active:scale-95"
            data-testid="sheet-like-btn"
          >
            <Heart size={18} weight="fill" /> LIKE
          </button>
        </div>
      </div>
    </div>
  );
}

function MatchRingMini({ pct }: { pct: number }) {
  const r = 18;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <div className="relative h-[52px] w-[52px] flex items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 44 44" fill="none">
        <circle cx="22" cy="22" r={r} stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
        <circle cx="22" cy="22" r={r} stroke="hsl(var(--primary))" strokeWidth="3"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
      </svg>
      <div className="text-center z-10">
        <div className="font-display text-[13px] leading-none text-white">{pct}%</div>
        <div className="font-mono text-[7px] tracking-wide text-white/70 leading-none mt-0.5">MATCH</div>
      </div>
    </div>
  );
}
