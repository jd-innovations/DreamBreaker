// Score corrections on the web (DIRECTOR_HUB_WEB_PARITY.md, W2 item 1), the same
// database functions and messages as mobile's lib/supabase/matches.ts:
//   preview_score_correction   read-only: does the winner change, what gets cleared
//   correct_match_score        director / admin only, reason required, all or nothing
//   bracket_match_score_edits  audit (editor, reason); RLS lets only directors and
//                              admins read it, so for anyone else the detail is null.
// Everyone can see bracket_matches.score_edited_at / score_edited_prev.

import { createClient } from "@/lib/supabase/client";

const CORRECTION_ERRORS: Record<string, string> = {
  not_allowed: "Only this tournament’s director or an admin can edit scores.",
  match_not_completed: "This match has no result to correct yet.",
  reason_required: "Please give a reason for the correction.",
  invalid_score: "Win to 11, win by 2, no ties.",
  match_not_found: "This match no longer exists.",
};

export interface CorrectionPreview {
  winnerChanged: boolean;
  clearedCount: number;
}

export async function previewScoreCorrection(matchId: string, score1: number, score2: number): Promise<CorrectionPreview | null> {
  const { data, error } = await createClient().rpc("preview_score_correction", {
    p_match_id: matchId, p_score1: score1, p_score2: score2,
  });
  const d = data as { ok?: boolean; winner_changed?: boolean; cleared_count?: number } | null;
  if (error || !d?.ok) return null;
  return { winnerChanged: !!d.winner_changed, clearedCount: d.cleared_count ?? 0 };
}

export async function correctMatchScore(
  matchId: string, score1: number, score2: number, reason: string,
): Promise<{ ok: true; clearedCount: number } | { ok: false; error: string }> {
  const { data, error } = await createClient().rpc("correct_match_score", {
    p_match_id: matchId, p_score1: score1, p_score2: score2, p_reason: reason,
  });
  if (error) {
    const code = Object.keys(CORRECTION_ERRORS).find((k) => error.message?.includes(k));
    return { ok: false, error: code ? CORRECTION_ERRORS[code] : "Could not correct the score. Please try again." };
  }
  const d = data as { cleared_count?: number } | null;
  return { ok: true, clearedCount: d?.cleared_count ?? 0 };
}

export interface ScoreEditDetail {
  editedAt: string;
  reason: string;
  editorName: string | null;
}

/** Latest correction with editor and reason, or null for anyone RLS doesn't let read it. */
export async function fetchLatestScoreEdit(matchId: string): Promise<ScoreEditDetail | null> {
  const { data } = await createClient()
    .from("bracket_match_score_edits")
    .select("edited_at, reason, editor:profiles!bracket_match_score_edits_edited_by_fkey(full_name)")
    .eq("match_id", matchId)
    .order("edited_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const editor = data.editor as { full_name?: string | null } | null;
  return { editedAt: data.edited_at, reason: data.reason, editorName: editor?.full_name ?? null };
}

/** score_edited_prev is jsonb {s1, s2}; anything else reads as unknown. */
export function parsePrevScore(v: unknown): { s1: number; s2: number } | null {
  const p = v as { s1?: unknown; s2?: unknown } | null;
  return p && typeof p.s1 === "number" && typeof p.s2 === "number" ? { s1: p.s1, s2: p.s2 } : null;
}
