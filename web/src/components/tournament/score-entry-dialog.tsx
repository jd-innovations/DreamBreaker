"use client";

// First-time score entry (record_match_score): one game to 11, win by 2. Used by
// Day Of and the bracket cards (DIRECTOR_HUB_WEB_PARITY.md, W1).

import { useState } from "react";
import { X } from "@phosphor-icons/react";
import { validateSingleGameScore } from "@shared/bracketScoring";
import type { TeamPerson } from "@shared/teamNames";
import { TeamNameLines } from "@/components/tournament/team-name";

export function ScoreEntryDialog({
  team1, team2, team1People, team2People, busy, onClose, onSave,
}: {
  team1: string | null;
  team2: string | null;
  /** Each side's players: one full name per row. */
  team1People?: TeamPerson[];
  team2People?: TeamPerson[];
  busy: boolean;
  onClose: () => void;
  onSave: (a: number, b: number) => void;
}) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const complete = a !== "" && b !== "";
  const error = complete ? validateSingleGameScore(Number(a), Number(b)) : null;

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-2xl tracking-wide">ENTER SCORE</h3>
          <button onClick={onClose} className="h-8 w-8 rounded-full border border-border flex items-center justify-center hover:bg-secondary">
            <X size={14} weight="bold" />
          </button>
        </div>
        {[{ name: team1, people: team1People, value: a, set: setA }, { name: team2, people: team2People, value: b, set: setB }].map((side, i) => (
          <div key={i} className="flex items-center gap-3 mb-3">
            <TeamNameLines people={side.people} fallback={side.name} className="flex-1 text-sm font-semibold" />
            <input
              inputMode="numeric"
              value={side.value}
              onChange={(e) => side.set(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
              className="w-16 h-12 rounded-xl bg-secondary border border-border text-center font-display text-2xl outline-none focus:ring-2 focus:ring-ring"
              aria-label={`${side.name ?? "Team"} score`}
            />
          </div>
        ))}
        {error && <p className="text-xs text-destructive mb-3">{error}</p>}
        <div className="flex gap-3 mt-2">
          <button onClick={onClose} className="flex-1 h-11 rounded-full border border-border hover:bg-secondary text-sm font-display tracking-wider">CANCEL</button>
          <button
            onClick={() => onSave(Number(a), Number(b))}
            disabled={!complete || !!error || busy}
            className="flex-1 h-11 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-display tracking-wider disabled:opacity-50"
          >
            {busy ? "SAVING…" : "SAVE SCORE"}
          </button>
        </div>
      </div>
    </div>
  );
}
