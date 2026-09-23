"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft, Users, Globe, Lock, UsersThree, DotsThreeVertical, Calendar,
  Image as ImageIcon, ChartBar, PaperPlaneTilt, ThumbsUp, ChatCircleDots,
  Plus, X, ShareNetwork, Flag, PencilSimple, Trash, Crown, ShieldStar,
  CheckCircle, XCircle, Warning,
} from "@phosphor-icons/react";
import { PageShell } from "@/components/layout/page-shell";
import { getUserId } from "@/lib/dev-user";
import {
  fetchGroup, getMembership, joinGroup, leaveGroup, approveJoinRequest,
  declineJoinRequest, setMemberRole, removeMember, fetchMembers,
  fetchGroupEvents, fetchGroupFeed, createPost, createPoll, createPhotoPost, markGroupRead,
  toggleLike, votePoll, fetchComments, addComment, deletePost, reportContent,
  uploadGroupPostImage, fetchGroupPhotos, uploadGroupPhoto, deleteGroupPhoto,
} from "@/lib/groups/group-service";
import { fetchPendingGroupInviteForUser, acceptGroupInvite, searchInvitableUsers, sendGroupInvite, type PendingGroupInvite, type InvitableUser } from "@/lib/groups/group-invites";
import { fetchGroupReports, dismissReport, removeReportedContent, type GroupReportWithContent } from "@/lib/groups/group-reports";
import { setPendingGroupId } from "@/lib/groups/pending-group-link";
import { REPORT_REASONS, type Group, type GroupMember, type GroupFeedItem, type GroupComment, type GroupPostWithMeta } from "@/lib/groups/types";
import { eventTypeLabel, formatEventDate, statusLabel } from "@/lib/community-play";

type Tab = "Feed" | "Members" | "Events" | "Photos" | "Reports";

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

// ─── Report modal (shared: posts + comments) ──────────────────────────────────

function ReportSheet({ onClose, onSubmit }: { onClose: () => void; onSubmit: (reason: string, notes: string) => void }) {
  const [reason, setReason] = useState(REPORT_REASONS[0].value);
  const [notes, setNotes] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg tracking-wide">REPORT CONTENT</h3>
          <button onClick={onClose}><X size={18} weight="bold" /></button>
        </div>
        <div className="space-y-2 mb-4">
          {REPORT_REASONS.map((r) => (
            <label key={r.value} className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input type="radio" name="reason" checked={reason === r.value} onChange={() => setReason(r.value)} className="accent-primary" />
              {r.label}
            </label>
          ))}
        </div>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional notes (optional)"
          rows={3} className="w-full rounded-xl bg-secondary border border-border px-3.5 py-2.5 text-sm outline-none resize-none mb-4" />
        <button onClick={() => onSubmit(reason, notes)} className="w-full h-11 rounded-full bg-primary text-primary-foreground font-display tracking-[0.15em] text-sm">SUBMIT REPORT</button>
      </div>
    </div>
  );
}

// ─── Comment thread ─────────────────────────────────────────────────────────

function CommentThread({ postId, userId, onCountChange }: { postId: string; userId: string; onCountChange: (n: number) => void }) {
  const [comments, setComments] = useState<GroupComment[]>([]);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<{ id: string; userId: string } | null>(null);

  const load = useCallback(async () => {
    const rows = await fetchComments(postId);
    setComments(rows);
    onCountChange(rows.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- load() is a stable useCallback that fetches & sets loading state; same shape as this repo's other list/detail screens.
  useEffect(() => { load(); }, [load]);

  async function submit() {
    if (!draft.trim()) return;
    await addComment(postId, userId, draft.trim(), replyTo);
    setDraft("");
    setReplyTo(null);
    load();
  }

  const top = comments.filter((c) => !c.parent_comment_id);
  const repliesOf = (id: string) => comments.filter((c) => c.parent_comment_id === id);

  return (
    <div className="mt-3 pt-3 border-t border-border/60 space-y-3">
      {top.map((c) => (
        <div key={c.id}>
          <CommentRow comment={c} userId={userId} onReply={() => setReplyTo(c.id)} onReport={() => setReportTarget({ id: c.id, userId: c.author_id })} onChange={load} />
          {repliesOf(c.id).map((r) => (
            <div key={r.id} className="ml-7 mt-2">
              <CommentRow comment={r} userId={userId} onReport={() => setReportTarget({ id: r.id, userId: r.author_id })} onChange={load} />
            </div>
          ))}
        </div>
      ))}
      <div className="flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder={replyTo ? "Write a reply…" : "Write a comment…"}
          className="flex-1 h-9 rounded-full bg-secondary border border-border px-3.5 text-sm outline-none"
        />
        <button onClick={submit} disabled={!draft.trim()} className="h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40">
          <PaperPlaneTilt size={14} weight="fill" />
        </button>
      </div>
      {reportTarget && (
        <ReportSheet
          onClose={() => setReportTarget(null)}
          onSubmit={async (reason, notes) => {
            try {
              await reportContent({ reporterId: userId, groupId: "", targetType: "group_comment", targetId: reportTarget.id, reportedUserId: reportTarget.userId, reason, notes });
              toast.success("Reported. Thanks for flagging this.");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Could not submit report.");
            }
            setReportTarget(null);
          }}
        />
      )}
    </div>
  );
}

function CommentRow({ comment, userId, onReply, onReport, onChange }: {
  comment: GroupComment; userId: string; onReply?: () => void; onReport: () => void; onChange: () => void;
}) {
  const isMine = comment.author_id === userId;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(comment.body);

  return (
    <div className="flex items-start gap-2.5">
      <div className="h-7 w-7 rounded-full bg-secondary flex-shrink-0 overflow-hidden flex items-center justify-center text-[10px] font-mono">
        {comment.author?.fullName?.slice(0, 2).toUpperCase() ?? "?"}
      </div>
      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="flex items-center gap-2">
            <input value={text} onChange={(e) => setText(e.target.value)} className="flex-1 h-8 rounded-lg bg-secondary border border-border px-2.5 text-sm outline-none" />
            <button onClick={async () => { const { updateComment } = await import("@/lib/groups/group-service"); await updateComment(comment.id, text); setEditing(false); onChange(); }} className="text-xs text-primary">Save</button>
          </div>
        ) : (
          <>
            <p className="text-sm"><span className="font-medium">{comment.author?.fullName ?? "Member"}</span> {comment.body}</p>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-[11px] text-muted-foreground">{timeAgo(comment.created_at)}{comment.edited_at ? " · Edited" : ""}</span>
              {onReply && <button onClick={onReply} className="text-[11px] text-muted-foreground hover:text-foreground">Reply</button>}
              {isMine ? (
                <>
                  <button onClick={() => setEditing(true)} className="text-[11px] text-muted-foreground hover:text-foreground">Edit</button>
                  <button onClick={async () => { const { deleteComment } = await import("@/lib/groups/group-service"); await deleteComment(comment.id); onChange(); }} className="text-[11px] text-muted-foreground hover:text-destructive">Delete</button>
                </>
              ) : (
                <button onClick={onReport} className="text-[11px] text-muted-foreground hover:text-destructive">Report</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Post card ──────────────────────────────────────────────────────────────

function PostCard({ post, userId, groupId, onChange }: { post: GroupPostWithMeta; userId: string; groupId: string; onChange: () => void }) {
  const isMine = post.author_id === userId;
  const [showComments, setShowComments] = useState(false);
  const [commentCount, setCommentCount] = useState(post.commentCount);
  const [liked, setLiked] = useState(post.likedByMe);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reporting, setReporting] = useState(false);

  async function handleLike() {
    setLiked((v) => !v);
    setLikeCount((c) => c + (liked ? -1 : 1));
    await toggleLike(post.id, userId, liked);
  }

  async function handleVote(optionId: string) {
    await votePoll(post.id, optionId, userId);
    onChange();
  }

  const totalVotes = post.pollOptions.reduce((s, o) => s + o.voteCount, 0);

  return (
    <div className="border border-border rounded-2xl bg-card p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center text-xs font-mono overflow-hidden">
            {post.author?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={post.author.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (post.author?.fullName?.slice(0, 2).toUpperCase() ?? "?")}
          </div>
          <div>
            <p className="text-sm font-medium">{post.author?.fullName ?? "Member"}</p>
            <p className="text-[11px] text-muted-foreground">{timeAgo(post.created_at)}{post.edited_at ? " · Edited" : ""}</p>
          </div>
        </div>
        <div className="relative">
          <button onClick={() => setMenuOpen((v) => !v)} className="text-muted-foreground hover:text-foreground"><DotsThreeVertical size={18} weight="bold" /></button>
          {menuOpen && (
            <div className="absolute right-0 top-6 z-10 w-40 bg-card border border-border rounded-xl shadow-xl overflow-hidden">
              {isMine ? (
                <button onClick={async () => { await deletePost(post.id); onChange(); }} className="w-full text-left px-3.5 py-2.5 text-sm hover:bg-secondary flex items-center gap-2 text-destructive">
                  <Trash size={14} weight="bold" /> Delete
                </button>
              ) : (
                <button onClick={() => { setReporting(true); setMenuOpen(false); }} className="w-full text-left px-3.5 py-2.5 text-sm hover:bg-secondary flex items-center gap-2">
                  <Flag size={14} weight="bold" /> Report
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {post.body && <p className="text-sm whitespace-pre-wrap mb-2">{post.body}</p>}

      {post.kind === "poll" && (
        <div className="space-y-2 mb-2">
          {post.pollOptions.map((o) => {
            const pct = totalVotes > 0 ? Math.round((o.voteCount / totalVotes) * 100) : 0;
            return (
              <button key={o.id} onClick={() => handleVote(o.id)} disabled={o.votedByMe}
                className="w-full text-left relative rounded-lg border border-border overflow-hidden h-9 disabled:cursor-default">
                <div className="absolute inset-y-0 left-0 bg-primary/15" style={{ width: `${pct}%` }} />
                <div className="relative flex items-center justify-between h-full px-3 text-sm">
                  <span className={o.votedByMe ? "font-medium" : ""}>{o.label}</span>
                  <span className="text-xs text-muted-foreground">{pct}%</span>
                </div>
              </button>
            );
          })}
          <p className="text-[11px] text-muted-foreground">{totalVotes} {totalVotes === 1 ? "vote" : "votes"}</p>
        </div>
      )}

      {post.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.image_url} alt="" className="w-full max-h-96 object-cover rounded-xl mb-2" />
      )}

      <div className="flex items-center gap-4 pt-2 border-t border-border/60">
        <button onClick={handleLike} className={`flex items-center gap-1.5 text-sm ${liked ? "text-primary" : "text-muted-foreground"}`}>
          <ThumbsUp size={15} weight={liked ? "fill" : "regular"} /> {likeCount}
        </button>
        <button onClick={() => setShowComments((v) => !v)} className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <ChatCircleDots size={15} weight="regular" /> {commentCount}
        </button>
      </div>

      {showComments && <CommentThread postId={post.id} userId={userId} onCountChange={setCommentCount} />}
      {reporting && (
        <ReportSheet
          onClose={() => setReporting(false)}
          onSubmit={async (reason, notes) => {
            try {
              await reportContent({ reporterId: userId, groupId, targetType: "group_post", targetId: post.id, reportedUserId: post.author_id, reason, notes });
              toast.success("Reported. Thanks for flagging this.");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Could not submit report.");
            }
            setReporting(false);
          }}
        />
      )}
    </div>
  );
}

// ─── Composer (text / poll / photo) ────────────────────────────────────────

function Composer({ groupId, userId, onPosted }: { groupId: string; userId: string; onPosted: () => void }) {
  const [mode, setMode] = useState<"text" | "poll" | "photo">("text");
  const [text, setText] = useState("");
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [posting, setPosting] = useState(false);

  function reset() {
    setMode("text"); setText(""); setPollQuestion(""); setPollOptions(["", ""]);
    setPhotoFile(null); setPhotoPreview(null); setCaption("");
  }

  async function submit() {
    setPosting(true);
    try {
      if (mode === "text") {
        if (!text.trim()) return;
        await createPost(groupId, userId, text.trim());
      } else if (mode === "poll") {
        const opts = pollOptions.map((o) => o.trim()).filter(Boolean);
        if (!pollQuestion.trim() || opts.length < 2) { toast.error("A poll needs a question and at least 2 options."); return; }
        await createPoll(groupId, userId, pollQuestion.trim(), opts);
      } else if (mode === "photo") {
        if (!photoFile) return;
        const url = await uploadGroupPostImage(groupId, userId, photoFile);
        await createPhotoPost(groupId, userId, url, caption.trim() || null);
      }
      reset();
      onPosted();
    } catch (err) {
      console.error(err);
      toast.error("Could not post. Please try again.");
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="border border-border rounded-2xl bg-card p-4">
      {mode === "text" && (
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="What's on your mind?" rows={2}
          className="w-full rounded-xl bg-secondary border border-border px-3.5 py-2.5 text-sm outline-none resize-none mb-3" />
      )}
      {mode === "poll" && (
        <div className="space-y-2 mb-3">
          <input value={pollQuestion} onChange={(e) => setPollQuestion(e.target.value)} placeholder="Ask a question…" className="w-full h-10 rounded-xl bg-secondary border border-border px-3.5 text-sm outline-none" />
          {pollOptions.map((o, i) => (
            <input key={i} value={o} onChange={(e) => setPollOptions((prev) => prev.map((p, pi) => pi === i ? e.target.value : p))} placeholder={`Option ${i + 1}`} className="w-full h-9 rounded-xl bg-secondary border border-border px-3.5 text-sm outline-none" />
          ))}
          {pollOptions.length < 4 && (
            <button type="button" onClick={() => setPollOptions((p) => [...p, ""])} className="text-xs text-primary hover:underline">+ Add option</button>
          )}
        </div>
      )}
      {mode === "photo" && (
        <div className="mb-3">
          {photoPreview ? (
            <div className="relative h-40 rounded-xl overflow-hidden border border-border mb-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoPreview} alt="" className="w-full h-full object-cover" />
              <button onClick={() => { setPhotoFile(null); setPhotoPreview(null); }} className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/60 text-white flex items-center justify-center"><X size={14} weight="bold" /></button>
            </div>
          ) : (
            <label className="flex items-center justify-center gap-2 h-20 rounded-xl border border-dashed border-border cursor-pointer text-sm text-muted-foreground mb-2">
              <ImageIcon size={16} weight="bold" /> Choose a photo
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0] ?? null; setPhotoFile(f); setPhotoPreview(f ? URL.createObjectURL(f) : null); }} />
            </label>
          )}
          <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Add a caption (optional)" className="w-full h-9 rounded-xl bg-secondary border border-border px-3.5 text-sm outline-none" />
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button onClick={() => setMode("photo")} className={`h-8 w-8 rounded-full flex items-center justify-center ${mode === "photo" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary"}`} title="Photo"><ImageIcon size={16} weight="bold" /></button>
          <button onClick={() => setMode("poll")} className={`h-8 w-8 rounded-full flex items-center justify-center ${mode === "poll" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary"}`} title="Poll"><ChartBar size={16} weight="bold" /></button>
          <button onClick={() => setMode("text")} className={`h-8 w-8 rounded-full flex items-center justify-center ${mode === "text" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary"}`} title="Text"><PencilSimple size={16} weight="bold" /></button>
        </div>
        <button onClick={submit} disabled={posting} className="h-9 px-5 rounded-full bg-primary text-primary-foreground text-xs font-mono tracking-wider disabled:opacity-50 flex items-center gap-1.5">
          <PaperPlaneTilt size={13} weight="fill" /> POST
        </button>
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function GroupDetailClient({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [membership, setMembership] = useState<{ role: string; status: string } | null>(null);
  const [pendingInvite, setPendingInvite] = useState<PendingGroupInvite | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("Feed");
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  const load = useCallback(async () => {
    const uid = await getUserId();
    setUserId(uid);
    const g = await fetchGroup(id);
    setGroup(g);
    if (g && uid) {
      const [m, inv] = await Promise.all([getMembership(id, uid), fetchPendingGroupInviteForUser(id, uid)]);
      setMembership(m);
      setPendingInvite(inv);
      // Opening the group IS reading it: clears the badge on /groups and in the
      // app, which share the same read state. Never awaited — a failed mark
      // costs a stale badge, a blocked render costs the page.
      if (m?.status === "active") void markGroupRead(id);
    }
    setLoading(false);
  }, [id]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- load() is a stable useCallback that fetches & sets loading state; same shape as this repo's other list/detail screens.
  useEffect(() => { load(); }, [load]);

  const isMember = membership?.status === "active";
  const isPending = membership?.status === "pending";
  const role = membership?.role ?? "member";
  const isAdmin = role === "owner" || role === "admin";

  async function handleJoin() {
    if (!userId) { router.push(`/auth?redirect=/groups/${id}`); return; }
    setBusy(true);
    try {
      const status = await joinGroup(id, userId);
      toast.success(status === "pending" ? "Request sent — waiting on an admin." : "Joined!");
      load();
    } finally { setBusy(false); }
  }

  async function handleAcceptInvite() {
    if (!userId || !pendingInvite) return;
    setBusy(true);
    try {
      await acceptGroupInvite(pendingInvite, userId);
      toast.success("Joined!");
      load();
    } finally { setBusy(false); }
  }

  async function handleLeave() {
    if (!userId) return;
    if (!confirm("Leave this group?")) return;
    setBusy(true);
    try { await leaveGroup(id, userId); toast.success("Left the group."); router.push("/groups"); }
    finally { setBusy(false); }
  }

  async function handleDelete() {
    if (!confirm("Delete this group? This cannot be undone.")) return;
    setBusy(true);
    try { const { deleteGroup } = await import("@/lib/groups/group-service"); await deleteGroup(id); router.push("/groups"); }
    finally { setBusy(false); }
  }

  if (loading) {
    return <PageShell><div className="flex items-center justify-center py-32"><div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" /></div></PageShell>;
  }

  if (!group) {
    return (
      <PageShell>
        <div className="max-w-md mx-auto px-4 py-32 text-center">
          <UsersThree size={44} weight="duotone" className="mx-auto mb-4 text-primary" />
          <h1 className="font-display text-2xl tracking-wide mb-2">GROUP NOT FOUND</h1>
          <Link href="/groups"><button className="h-11 px-7 rounded-full bg-primary text-primary-foreground font-display tracking-[0.15em] text-sm mt-2">BROWSE GROUPS</button></Link>
        </div>
      </PageShell>
    );
  }

  const PrivacyIcon = group.privacy === "public" ? Globe : Lock;
  const tabs: Tab[] = ["Feed", "Members", ...(isMember ? (["Events", "Photos"] as Tab[]) : []), ...(isMember && isAdmin ? (["Reports"] as Tab[]) : [])];

  return (
    <PageShell>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        <Link href="/groups" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
          <ArrowLeft size={15} weight="bold" /> Back to Groups
        </Link>

        {/* Banner */}
        <div className="relative h-40 sm:h-52 rounded-2xl overflow-hidden bg-secondary mb-4">
          {group.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={group.image_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center"><UsersThree size={40} weight="duotone" className="text-primary/40" /></div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
          <div className="absolute top-3 right-3">
            <button onClick={() => setMenuOpen((v) => !v)} className="h-9 w-9 rounded-full bg-black/40 text-white flex items-center justify-center backdrop-blur-sm">
              <DotsThreeVertical size={18} weight="bold" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-11 z-20 w-52 bg-card border border-border rounded-xl shadow-xl overflow-hidden text-sm">
                <button onClick={() => { navigator.clipboard.writeText(window.location.href); toast.success("Link copied!"); setMenuOpen(false); }} className="w-full text-left px-4 py-2.5 hover:bg-secondary flex items-center gap-2"><ShareNetwork size={15} weight="bold" /> Share Group</button>
                {isMember && (group.allow_invites || isAdmin) && (
                  <button onClick={() => { setInviteOpen(true); setMenuOpen(false); }} className="w-full text-left px-4 py-2.5 hover:bg-secondary flex items-center gap-2"><Plus size={15} weight="bold" /> Invite Members</button>
                )}
                {isMember && (
                  <button onClick={() => { setPendingGroupId(id); router.push("/play/create"); }} className="w-full text-left px-4 py-2.5 hover:bg-secondary flex items-center gap-2"><Calendar size={15} weight="bold" /> Create Event</button>
                )}
                {isAdmin && (
                  <Link href={`/groups/${id}/edit`} className="block px-4 py-2.5 hover:bg-secondary flex items-center gap-2"><PencilSimple size={15} weight="bold" /> Group Settings</Link>
                )}
                {isMember && !isAdmin && (
                  <button onClick={handleLeave} className="w-full text-left px-4 py-2.5 hover:bg-secondary flex items-center gap-2 text-destructive"><XCircle size={15} weight="bold" /> Leave Group</button>
                )}
                {role === "owner" && (
                  <button onClick={handleDelete} className="w-full text-left px-4 py-2.5 hover:bg-secondary flex items-center gap-2 text-destructive"><Trash size={15} weight="bold" /> Delete Group</button>
                )}
              </div>
            )}
          </div>
          <div className="absolute bottom-3 left-4 right-4 text-white">
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded-full bg-white/15 backdrop-blur-sm font-mono text-[9px] tracking-[0.1em] flex items-center gap-1"><PrivacyIcon size={10} weight="bold" /> {group.privacy.toUpperCase()}</span>
              <span className="text-xs flex items-center gap-1"><Users size={12} weight="bold" /> {group.memberCount}</span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl tracking-wide">{group.name}</h1>
          </div>
        </div>

        {(group.description || group.location || group.skill) && (
          <div className="mb-4 text-sm text-muted-foreground">
            {group.description && <p className="mb-1">{group.description}</p>}
            <p>{[group.location, group.skill].filter(Boolean).join(" · ")}</p>
          </div>
        )}

        {/* CTA row */}
        <div className="flex items-center gap-2 mb-6">
          {isMember ? (
            <>
              <span className="h-10 px-5 rounded-full border border-border flex items-center gap-1.5 text-sm text-muted-foreground"><CheckCircle size={14} weight="fill" className="text-primary" /> Joined</span>
              {group.conversation_id && (
                <Link href={`/dashboard?section=messages`}><button className="h-10 w-10 rounded-full border border-border hover:bg-secondary flex items-center justify-center"><ChatCircleDots size={16} weight="bold" /></button></Link>
              )}
            </>
          ) : isPending ? (
            <span className="h-10 px-5 rounded-full border border-border flex items-center text-sm text-muted-foreground">Requested</span>
          ) : pendingInvite ? (
            <button onClick={handleAcceptInvite} disabled={busy} className="h-10 px-6 rounded-full bg-primary text-primary-foreground font-display tracking-[0.12em] text-sm disabled:opacity-60">ACCEPT INVITE</button>
          ) : (
            <button onClick={handleJoin} disabled={busy} className="h-10 px-6 rounded-full bg-primary text-primary-foreground font-display tracking-[0.12em] text-sm disabled:opacity-60">JOIN GROUP</button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-border mb-5 overflow-x-auto">
          {tabs.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 h-10 text-sm font-mono tracking-wider border-b-2 transition-colors flex-shrink-0 ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {t.toUpperCase()}
            </button>
          ))}
        </div>

        {tab === "Feed" && (isMember ? <FeedTab groupId={id} userId={userId!} /> : <LockedPlaceholder message="Join this group to see the feed." />)}
        {tab === "Members" && <MembersTab groupId={id} userId={userId} isAdmin={isAdmin} onChange={load} />}
        {tab === "Events" && <EventsTab groupId={id} />}
        {tab === "Photos" && <PhotosTab groupId={id} userId={userId!} />}
        {tab === "Reports" && <ReportsTab groupId={id} userId={userId!} />}
      </div>

      {inviteOpen && userId && <InviteMembersModal groupId={id} userId={userId} onClose={() => setInviteOpen(false)} />}
    </PageShell>
  );
}

function LockedPlaceholder({ message }: { message: string }) {
  return (
    <div className="border border-dashed border-border rounded-2xl py-16 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
      <Lock size={28} weight="duotone" className="text-primary/50" />
      {message}
    </div>
  );
}

// ─── Feed tab ───────────────────────────────────────────────────────────────

function FeedTab({ groupId, userId }: { groupId: string; userId: string }) {
  const [items, setItems] = useState<GroupFeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const rows = await fetchGroupFeed(groupId, userId);
    setItems(rows);
    setLoading(false);
  }, [groupId, userId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- load() is a stable useCallback that fetches & sets loading state; same shape as this repo's other list/detail screens.
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <Composer groupId={groupId} userId={userId} onPosted={load} />
      {loading ? (
        <div className="h-24 rounded-2xl bg-card border border-border animate-pulse" />
      ) : items.length === 0 ? (
        <div className="border border-dashed border-border rounded-2xl py-14 text-center text-muted-foreground text-sm">No posts yet. Be the first to share something.</div>
      ) : (
        items.map((item) =>
          item.kind === "post" ? (
            <PostCard key={item.post.id} post={item.post} userId={userId} groupId={groupId} onChange={load} />
          ) : (
            <Link key={item.event.id} href={`/play/${item.event.id}`} className="block border border-border rounded-2xl bg-card p-4 hover:border-primary/40 transition-colors">
              <p className="font-mono text-[10px] tracking-widest text-primary mb-1">NEW EVENT CREATED</p>
              <p className="font-display text-lg">{item.event.name}</p>
              <p className="text-sm text-muted-foreground">{eventTypeLabel(item.event.event_type)} · {formatEventDate(item.event.event_date)}</p>
            </Link>
          ),
        )
      )}
    </div>
  );
}

// ─── Members tab ────────────────────────────────────────────────────────────

function MembersTab({ groupId, userId, isAdmin, onChange }: { groupId: string; userId: string | null; isAdmin: boolean; onChange: () => void }) {
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "admins">("all");

  const load = useCallback(async () => { setMembers(await fetchMembers(groupId)); setLoading(false); }, [groupId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- load() is a stable useCallback that fetches & sets loading state; same shape as this repo's other list/detail screens.
  useEffect(() => { load(); }, [load]);

  const active = members.filter((m) => m.status === "active");
  const pending = members.filter((m) => m.status === "pending");
  const shown = filter === "admins" ? active.filter((m) => m.role !== "member") : active;

  async function handleApprove(uid: string) { await approveJoinRequest(groupId, uid); load(); onChange(); }
  async function handleDecline(uid: string) { await declineJoinRequest(groupId, uid); load(); }
  async function handleRole(uid: string, role: "admin" | "member") { await setMemberRole(groupId, uid, role); load(); }
  async function handleRemove(uid: string) { if (!confirm("Remove this member?")) return; await removeMember(groupId, uid); load(); onChange(); }

  if (loading) return <div className="h-24 rounded-2xl bg-card border border-border animate-pulse" />;

  return (
    <div className="space-y-4">
      {isAdmin && pending.length > 0 && (
        <div className="border border-primary/30 bg-primary/5 rounded-2xl p-4">
          <h3 className="font-display text-sm tracking-wide mb-3">JOIN REQUESTS ({pending.length})</h3>
          <div className="space-y-2">
            {pending.map((m) => (
              <div key={m.userId} className="flex items-center justify-between gap-2">
                <span className="text-sm">{m.fullName ?? "Unnamed player"}</span>
                <div className="flex gap-2">
                  <button onClick={() => handleApprove(m.userId)} className="h-8 px-3 rounded-full bg-primary text-primary-foreground text-xs">Approve</button>
                  <button onClick={() => handleDecline(m.userId)} className="h-8 px-3 rounded-full border border-border text-xs">Decline</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        {(["all", "admins"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 h-8 rounded-full text-xs font-mono tracking-wider border ${filter === f ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}>{f.toUpperCase()}</button>
        ))}
      </div>

      <div className="space-y-2">
        {shown.map((m) => (
          <div key={m.userId} className="border border-border rounded-2xl bg-card p-3.5 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-secondary flex-shrink-0 overflow-hidden flex items-center justify-center text-xs font-mono">
              {m.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (m.fullName?.slice(0, 2).toUpperCase() ?? "?")}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium truncate">{m.fullName ?? "Unnamed player"}</span>
                {m.role === "owner" && <Crown size={13} weight="fill" className="text-amber-500 flex-shrink-0" />}
                {m.role === "admin" && <ShieldStar size={13} weight="fill" className="text-primary flex-shrink-0" />}
              </div>
              <p className="text-xs text-muted-foreground truncate">{[m.dupr ? `DUPR ${m.dupr}` : m.selfRating, m.locationCity].filter(Boolean).join(" · ") || " "}</p>
            </div>
            {userId && m.userId !== userId && (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Link href={`/dashboard?section=messages&dm=${m.userId}`}><button className="h-8 w-8 rounded-full border border-border hover:bg-secondary flex items-center justify-center" title="Message"><ChatCircleDots size={14} weight="bold" /></button></Link>
                {isAdmin && m.role !== "owner" && (
                  <MemberMenu member={m} onRole={handleRole} onRemove={handleRemove} />
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function MemberMenu({ member, onRole, onRemove }: { member: GroupMember; onRole: (uid: string, role: "admin" | "member") => void; onRemove: (uid: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="h-8 w-8 rounded-full border border-border hover:bg-secondary flex items-center justify-center"><DotsThreeVertical size={14} weight="bold" /></button>
      {open && (
        <div className="absolute right-0 top-9 z-10 w-44 bg-card border border-border rounded-xl shadow-xl overflow-hidden text-sm">
          {member.role === "admin" ? (
            <button onClick={() => { onRole(member.userId, "member"); setOpen(false); }} className="w-full text-left px-3.5 py-2.5 hover:bg-secondary">Remove Admin</button>
          ) : (
            <button onClick={() => { onRole(member.userId, "admin"); setOpen(false); }} className="w-full text-left px-3.5 py-2.5 hover:bg-secondary">Make Admin</button>
          )}
          <button onClick={() => { onRemove(member.userId); setOpen(false); }} className="w-full text-left px-3.5 py-2.5 hover:bg-secondary text-destructive">Remove from Group</button>
        </div>
      )}
    </div>
  );
}

// ─── Events tab ─────────────────────────────────────────────────────────────

function EventsTab({ groupId }: { groupId: string }) {
  const router = useRouter();
  const [events, setEvents] = useState<Awaited<ReturnType<typeof fetchGroupEvents>>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchGroupEvents(groupId).then((e) => { setEvents(e); setLoading(false); }); }, [groupId]);

  return (
    <div className="space-y-4">
      <button onClick={() => { setPendingGroupId(groupId); router.push("/play/create"); }} className="w-full h-11 rounded-full border border-dashed border-primary/40 text-primary text-sm font-display tracking-wider flex items-center justify-center gap-2 hover:bg-primary/5 transition-colors">
        <Plus size={15} weight="bold" /> CREATE EVENT FOR THIS GROUP
      </button>
      {loading ? (
        <div className="h-20 rounded-2xl bg-card border border-border animate-pulse" />
      ) : events.length === 0 ? (
        <div className="border border-dashed border-border rounded-2xl py-14 text-center text-muted-foreground text-sm">No events yet.</div>
      ) : (
        events.map((e) => (
          <Link key={e.id} href={`/play/${e.id}`} className="block border border-border rounded-2xl bg-card p-4 hover:border-primary/40 transition-colors">
            <div className="flex items-center justify-between">
              <p className="font-display text-lg">{e.name}</p>
              <span className="font-mono text-[10px] text-muted-foreground">{statusLabel(e.status).toUpperCase()}</span>
            </div>
            <p className="text-sm text-muted-foreground">{eventTypeLabel(e.event_type)} · {formatEventDate(e.event_date)}</p>
          </Link>
        ))
      )}
    </div>
  );
}

// ─── Photos tab ─────────────────────────────────────────────────────────────

function PhotosTab({ groupId, userId }: { groupId: string; userId: string }) {
  const [photos, setPhotos] = useState<Awaited<ReturnType<typeof fetchGroupPhotos>>>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => { setPhotos(await fetchGroupPhotos(groupId)); setLoading(false); }, [groupId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- load() is a stable useCallback that fetches & sets loading state; same shape as this repo's other list/detail screens.
  useEffect(() => { load(); }, [load]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try { await uploadGroupPhoto(groupId, userId, file); load(); }
    finally { setUploading(false); }
  }

  return (
    <div className="space-y-4">
      <label className="inline-flex items-center gap-2 h-10 px-5 rounded-full border border-dashed border-primary/40 text-primary text-sm cursor-pointer hover:bg-primary/5 transition-colors">
        <ImageIcon size={15} weight="bold" /> {uploading ? "Uploading…" : "Add Photo"}
        <input type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
      </label>
      {loading ? (
        <div className="grid grid-cols-3 gap-2">{[...Array(6)].map((_, i) => <div key={i} className="aspect-square rounded-lg bg-card border border-border animate-pulse" />)}</div>
      ) : photos.length === 0 ? (
        <div className="border border-dashed border-border rounded-2xl py-14 text-center text-muted-foreground text-sm">No photos yet.</div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <div key={p.id} className="relative aspect-square rounded-lg overflow-hidden bg-secondary group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="" className="w-full h-full object-cover" />
              {p.uploaded_by === userId && (
                <button onClick={async () => { if (confirm("Delete this photo?")) { await deleteGroupPhoto(p.id); load(); } }}
                  className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <X size={12} weight="bold" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Reports tab (admin-only, new — GROUPS_WEB_PLAN.md §5b) ─────────────────

function ReportsTab({ groupId, userId }: { groupId: string; userId: string }) {
  const [reports, setReports] = useState<GroupReportWithContent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => { setReports(await fetchGroupReports(groupId)); setLoading(false); }, [groupId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- load() is a stable useCallback that fetches & sets loading state; same shape as this repo's other list/detail screens.
  useEffect(() => { load(); }, [load]);

  const pending = reports.filter((r) => r.status === "pending");

  if (loading) return <div className="h-24 rounded-2xl bg-card border border-border animate-pulse" />;

  return (
    <div className="space-y-3">
      {pending.length === 0 ? (
        <div className="border border-dashed border-border rounded-2xl py-14 text-center text-muted-foreground text-sm">No open reports in this group.</div>
      ) : (
        pending.map((r) => (
          <div key={r.id} className="border border-border rounded-2xl bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <Warning size={15} weight="fill" className="text-amber-500" />
              <span className="font-mono text-[10px] tracking-widest text-muted-foreground">{r.target_type.replace("group_", "").toUpperCase()} · {r.reason.replace(/_/g, " ").toUpperCase()}</span>
            </div>
            {r.contentPreview && <p className="text-sm mb-2 line-clamp-3">&ldquo;{r.contentPreview}&rdquo;</p>}
            <p className="text-xs text-muted-foreground mb-3">Reported by {r.reporterName ?? "a member"}{r.notes ? ` — "${r.notes}"` : ""}</p>
            <div className="flex gap-2">
              <button onClick={async () => { await dismissReport(r.id, userId); load(); }} className="h-9 px-4 rounded-full border border-border text-xs font-mono tracking-wider">DISMISS</button>
              <button onClick={async () => { if (confirm("Remove this content?")) { await removeReportedContent(r, userId); load(); } }} className="h-9 px-4 rounded-full bg-destructive text-destructive-foreground text-xs font-mono tracking-wider">REMOVE CONTENT</button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ─── Invite Members modal (open search — GROUPS_WEB_PLAN.md §5c) ───────────

function InviteMembersModal({ groupId, userId, onClose }: { groupId: string; userId: string; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<InvitableUser[]>([]);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    // Short/empty query: skip scheduling a search. `visibleResults` below
    // hides stale results rather than clearing state synchronously here.
    if (query.trim().length < 2) return;
    const t = setTimeout(async () => {
      setSearching(true);
      setResults(await searchInvitableUsers(groupId, userId, query));
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [query, groupId, userId]);

  async function handleInvite(inviteeId: string) {
    await sendGroupInvite(groupId, userId, inviteeId);
    setSent((prev) => new Set(prev).add(inviteeId));
    toast.success("Invite sent!");
  }

  const visibleResults = query.trim().length >= 2 ? results : [];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-5 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg tracking-wide">INVITE MEMBERS</h3>
          <button onClick={onClose}><X size={18} weight="bold" /></button>
        </div>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or handle…"
          className="w-full h-10 rounded-xl bg-secondary border border-border px-3.5 text-sm outline-none mb-3" autoFocus />
        <div className="flex-1 overflow-y-auto space-y-1">
          {searching ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Searching…</p>
          ) : query.trim().length < 2 ? null : visibleResults.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No players found.</p>
          ) : (
            visibleResults.map((u) => (
              <div key={u.id} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="text-sm truncate">{u.fullName ?? "Unnamed player"}</p>
                  {u.handle && <p className="text-xs text-muted-foreground truncate">@{u.handle}</p>}
                </div>
                <button onClick={() => handleInvite(u.id)} disabled={sent.has(u.id)}
                  className={`h-8 px-4 rounded-full text-xs flex-shrink-0 ${sent.has(u.id) ? "bg-secondary text-muted-foreground" : "bg-primary text-primary-foreground"}`}>
                  {sent.has(u.id) ? "Invited" : "Invite"}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
