"use client";

// Score corrections on the web (DIRECTOR_HUB_WEB_PARITY.md, W2 item 1). Same flow
// as mobile's division-bracket score modal in edit mode: new score and a required
// reason, a preview of what the correction clears, a confirmation when the winner
// changes, then correct_match_score. The ⓘ shows everyone when and what the score
// was; directors also see who edited it and why.

import { useState } from "react";
import { Info, X } from "@phosphor-icons/react";
import { validateSingleGameScore } from "@shared/bracketScoring";
import {
  correctMatchScore, fetchLatestScoreEdit, previewScoreCorrection, type ScoreEditDetail,
} from "@/lib/tournament/score-corrections";

export interface EditableMatch {
  id: string;
  team1: string | null;
  team2: string | null;
  score1: number | null;
  score2: number | null;
}

export function EditScoreDialog({
  match, poolRebuildHint = false, onClose, onSaved,
}: {
  match: EditableMatch;
  /** A pool match in a division whose bracket is already built. */
  poolRebuildHint?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [a, setA] = useState(match.score1 != null ? String(match.score1) : "");
  const [b, setB] = useState(match.score2 != null ? String(match.score2) : "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmLines, setConfirmLines] = useState<string[] | null>(null);

  const complete = a !== "" && b !== "";
  const scoreError = complete ? validateSingleGameScore(Number(a), Number(b)) : null;
  const unchanged = Number(a) === match.score1 && Number(b) === match.score2;
  const canContinue = complete && !scoreError && !unchanged && reason.trim().length > 0 && !busy;

  async function apply() {
    setBusy(true);
    const result = await correctMatchScore(match.id, Number(a), Number(b), reason.trim());
    setBusy(false);
    if (!result.ok) { setError(result.error); setConfirmLines(null); return; }
    onSaved();
  }

  async function next() {
    setError(null);
    setBusy(true);
    const preview = await previewScoreCorrection(match.id, Number(a), Number(b));
    setBusy(false);
    const lines: string[] = [];
    if (preview?.winnerChanged) {
      lines.push("This changes the winner.");
      lines.push(preview.clearedCount > 0
        ? `${preview.clearedCount} later ${preview.clearedCount === 1 ? "result" : "results"} in this bracket will be cleared and replayed.`
        : "The new winner moves into the next match.");
    }
    if (poolRebuildHint) {
      lines.push("This is a pool match and the bracket is already built. It won’t be rebuilt automatically, so rebuild the bracket from pools if the qualifiers change.");
    }
    if (lines.length === 0) await apply();
    else setConfirmLines(lines);
  }

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-2xl tracking-wide">{confirmLines ? "CONFIRM CORRECTION" : "EDIT SCORE"}</h3>
          <button onClick={onClose} aria-label="Close" className="h-8 w-8 rounded-full border border-border flex items-center justify-center hover:bg-secondary">
            <X size={14} weight="bold" />
          </button>
        </div>

        {confirmLines ? (
          <>
            <div className="space-y-2 mb-5">
              {confirmLines.map((l) => <p key={l} className="text-sm text-muted-foreground">{l}</p>)}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmLines(null)} disabled={busy} className="flex-1 h-11 rounded-full border border-border hover:bg-secondary text-sm font-display tracking-wider">BACK</button>
              <button onClick={apply} disabled={busy} className="flex-1 h-11 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 text-sm font-display tracking-wider disabled:opacity-50">
                {busy ? "SAVING…" : "SAVE CORRECTION"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground mb-3">Was {match.score1}–{match.score2}.</p>
            {[{ name: match.team1, value: a, set: setA }, { name: match.team2, value: b, set: setB }].map((side, i) => (
              <div key={i} className="flex items-center gap-3 mb-3">
                <span className="flex-1 text-sm font-semibold truncate">{side.name}</span>
                <input
                  inputMode="numeric"
                  value={side.value}
                  onChange={(e) => side.set(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
                  className="w-16 h-12 rounded-xl bg-secondary border border-border text-center font-display text-2xl outline-none focus:ring-2 focus:ring-ring"
                  aria-label={`${side.name ?? "Team"} score`}
                />
              </div>
            ))}
            {scoreError && <p className="text-xs text-destructive mb-3">{scoreError}</p>}
            <label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1.5">REASON FOR THE CORRECTION *</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="e.g. Scores entered for the wrong team"
              className="w-full rounded-xl bg-secondary border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
            />
            <p className="text-xs text-muted-foreground mt-1.5 mb-3">
              Everyone sees that this score was edited and what it was. Only directors see the reason.
            </p>
            {error && <p className="text-xs text-destructive mb-3">{error}</p>}
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 h-11 rounded-full border border-border hover:bg-secondary text-sm font-display tracking-wider">CANCEL</button>
              <button onClick={next} disabled={!canContinue} className="flex-1 h-11 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-display tracking-wider disabled:opacity-50">
                {busy ? "CHECKING…" : "SAVE CORRECTION"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The ⓘ on an edited match. Everyone: when, and the old score. Directors (whom
 * RLS lets read bracket_match_score_edits): also the editor and the reason.
 */
export function ScoreEditInfo({
  matchId, editedAt, prev, now, director,
}: {
  matchId: string;
  editedAt: string;
  prev: { s1: number; s2: number } | null;
  now: { s1: number | null; s2: number | null };
  director: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<ScoreEditDetail | null | undefined>(undefined);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && director && detail === undefined) setDetail(await fetchLatestScoreEdit(matchId));
  }

  const when = new Date(editedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return (
    <>
      <button
        onClick={toggle}
        aria-expanded={open}
        aria-label="Score was edited. Show details"
        className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
      >
        <Info size={10} /> EDITED
      </button>
      {open && (
        <span className="basis-full mt-1 rounded-lg bg-secondary px-2 py-1.5 font-sans text-[11px] tracking-normal normal-case text-muted-foreground">
          Edited {when}.{prev ? ` Was ${prev.s1}–${prev.s2}. Now ${now.s1}–${now.s2}.` : ""}
          {director && detail && (
            <>
              <br />By {detail.editorName ?? "the director"}. Reason: {detail.reason}
            </>
          )}
        </span>
      )}
    </>
  );
}
