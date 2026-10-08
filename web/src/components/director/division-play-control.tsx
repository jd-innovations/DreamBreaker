"use client";

import { Pause, Play } from "@phosphor-icons/react";
import type { DivisionPlayStatus } from "@/lib/tournament/day-of";

// A division's play status as directors see it, in ONE place. The Day-of board
// and the director's Live Brackets both render from here, so the two screens
// can't disagree (owner report 2026-10-08: Live Brackets said IN PROGRESS for a
// division Day-of showed as PAUSED). Mirrors mobile's DivisionPlayControl.

export type DivisionPlayState = DivisionPlayStatus | "complete";

export const PLAY_STATUS_LABEL: Record<DivisionPlayState, string> = {
  not_started: "NOT STARTED", live: "LIVE", paused: "PAUSED", complete: "COMPLETE",
};
export const PLAY_STATUS_CLASS: Record<DivisionPlayState, string> = {
  not_started: "border-border text-muted-foreground",
  live: "border-green-500/40 bg-green-500/10 text-green-500",
  paused: "border-amber-500/40 bg-amber-500/10 text-amber-500",
  complete: "border-primary/40 bg-primary/10 text-primary",
};

/** "Complete" is derived, never stored: the division's final is scored. */
export function divisionPlayState(playStatus: DivisionPlayStatus, finalScored: boolean): DivisionPlayState {
  return finalScored ? "complete" : playStatus;
}

/** Asks first when pausing; returns false if the director backed out. */
export function confirmPlayChange(name: string, status: DivisionPlayStatus): boolean {
  return status !== "paused"
    || window.confirm(`Pause ${name}? Matches already on a court keep playing; no new ones from this division are called.`);
}

export function DivisionPlayChip({ state, onCourt }: { state: DivisionPlayState; onCourt: number }) {
  // Not live but still holding courts: say so, in the paused colour.
  const held = state !== "live" && state !== "complete" ? onCourt : 0;
  return (
    <span className={`px-2 py-0.5 rounded-full border font-mono text-[9px] tracking-widest whitespace-nowrap ${held ? PLAY_STATUS_CLASS.paused : PLAY_STATUS_CLASS[state]}`}>
      {PLAY_STATUS_LABEL[state]}{held ? ` · ${held} ON COURT` : ""}
    </span>
  );
}

export function DivisionPlayButton({
  playStatus, busy, onChange,
}: {
  playStatus: DivisionPlayStatus;
  busy: boolean;
  onChange: (next: DivisionPlayStatus) => void;
}) {
  const live = playStatus === "live";
  return (
    <button
      disabled={busy}
      onClick={() => onChange(live ? "paused" : "live")}
      className="flex items-center gap-1 h-7 px-3 rounded-full border border-border hover:bg-secondary font-mono text-[9px] tracking-widest disabled:opacity-40"
    >
      {live ? <Pause size={10} weight="fill" /> : <Play size={10} weight="fill" />}
      {live ? "PAUSE" : playStatus === "paused" ? "RESUME" : "START"}
    </button>
  );
}
