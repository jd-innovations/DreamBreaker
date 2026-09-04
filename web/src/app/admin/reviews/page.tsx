"use client";

/**
 * Admin review invitations.
 *
 * Reviews are invitation-only, so this screen is the only way one ever gets
 * written: it turns "these people transacted" into a token and an email.
 *
 * Three server calls, in an order that matters:
 *   1. issue_review_invitation  — mints (or returns) the token
 *   2. send-transactional-email — the review_invite template
 *   3. mark_review_invitation_sent — dates the send
 *
 * Issuing before sending means a crash between them leaves an unsent
 * invitation, which the list shows as still pending. Sending first would risk
 * an email carrying a token no row backs.
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { getUserId } from "@/lib/dev-user";

interface Candidate {
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  subject_type: string;
  subject_id: string;
  subject_label: string;
  occurred_at: string;
}

const TYPE_LABEL: Record<string, string> = {
  coach: "Coach",
  coach_offer: "Lesson",
  facility: "Facility",
  tournament: "Tournament",
};

// The public URL of the review form. The same address opens the native screen
// when the app is installed (universal link) and the web form when it is not —
// there is deliberately only one link, because there is no way to know from
// here which device the mail gets opened on.
const REVIEW_BASE = "https://pickleballapp.app/review";

export default function AdminReviewsPage() {
  const router = useRouter();
  const supabase = createClient();

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<Record<string, string>>({});

  const rowKey = (c: Candidate) => `${c.user_id}:${c.subject_type}:${c.subject_id}`;

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("list_review_candidates", { p_limit: 100 });
    setLoading(false);
    if (error) {
      toast.error(
        error.message.includes("admin_only")
          ? "Admins only."
          : `Could not load candidates: ${error.message}`,
      );
      return;
    }
    setCandidates((data ?? []) as Candidate[]);
  }, [supabase]);

  useEffect(() => {
    (async () => {
      const userId = await getUserId();
      if (!userId) { router.push("/login"); return; }
      const { data: profile } = await supabase
        .from("profiles").select("role").eq("id", userId).maybeSingle();
      if (!profile || profile.role !== "admin") { router.push("/dashboard"); return; }
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function invite(c: Candidate) {
    if (!c.user_email) { toast.error("That user has no email address."); return; }
    const key = rowKey(c);
    setSending(key);
    try {
      const { data: issued, error: issueError } = await supabase.rpc("issue_review_invitation", {
        p_user_id: c.user_id,
        p_subject_type: c.subject_type,
        p_subject_id: c.subject_id,
      });
      if (issueError) {
        toast.error(
          issueError.message.includes("not_eligible")
            ? "That transaction no longer qualifies for a review."
            : issueError.message.includes("admin_only")
              ? "Admins only."
              : issueError.message,
        );
        return;
      }

      const row = (Array.isArray(issued) ? issued[0] : issued) as
        | { invitation_id: string; token: string; already_existed: boolean }
        | undefined;
      if (!row?.token) { toast.error("No invitation was returned."); return; }

      const reviewUrl = `${REVIEW_BASE}/${row.token}`;
      // first_name, not full_name: the template greets the person.
      const firstName = (c.user_name ?? "there").trim().split(/\s+/)[0] || "there";

      const { error: mailError } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          to: c.user_email,
          templateKey: "review_invite",
          variables: {
            first_name: firstName,
            subject_label: c.subject_label,
            review_url: reviewUrl,
          },
          // One email per invitation, however many times this button is
          // pressed. The invitation id is stable across resends because
          // issue_review_invitation returns the existing row.
          idempotencyKey: `review_invite:${row.invitation_id}`,
        },
      });
      if (mailError) {
        // The invitation exists and is valid — only delivery failed. Said
        // plainly so the operator knows not to expect a second token.
        toast.error(`Invitation created but the email failed: ${mailError.message}`);
        return;
      }

      await supabase.rpc("mark_review_invitation_sent", { p_invitation_id: row.invitation_id });

      setSent((prev) => ({ ...prev, [key]: reviewUrl }));
      toast.success(
        row.already_existed
          ? `Re-sent the existing link to ${c.user_email}`
          : `Invitation sent to ${c.user_email}`,
      );
    } finally {
      setSending(null);
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="font-display text-3xl tracking-wide">Review invitations</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Reviews are invitation-only. Everyone below has a verified transaction, no live
        invitation and no review yet. Sending emails them a personal link that works in the
        app or the browser.
      </p>

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-full border border-border px-4 py-1.5 text-xs font-semibold"
        >
          Refresh
        </button>
        <span className="text-xs text-muted-foreground">
          {loading ? "Loading…" : `${candidates.length} candidate${candidates.length === 1 ? "" : "s"}`}
        </span>
      </div>

      <div className="mt-6 space-y-3">
        {!loading && candidates.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nobody is waiting on an invitation right now.
          </p>
        )}

        {candidates.map((c) => {
          const key = rowKey(c);
          const url = sent[key];
          return (
            <div
              key={key}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4"
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold">{c.user_name ?? "Unnamed"}</div>
                <div className="truncate text-xs text-muted-foreground">{c.user_email}</div>
                <div className="mt-1 text-xs">
                  <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider">
                    {TYPE_LABEL[c.subject_type] ?? c.subject_type}
                  </span>{" "}
                  <span className="text-muted-foreground">{c.subject_label}</span>
                </div>
                {url && (
                  <div className="mt-1 break-all font-mono text-[11px] text-primary">{url}</div>
                )}
              </div>

              <button
                type="button"
                disabled={sending === key || !!url}
                onClick={() => void invite(c)}
                className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-40"
              >
                {url ? "Sent" : sending === key ? "Sending…" : "Send invitation"}
              </button>
            </div>
          );
        })}
      </div>
    </main>
  );
}
