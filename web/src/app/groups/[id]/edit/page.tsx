"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle, LinkSimple, ArrowClockwise } from "@phosphor-icons/react";
import { toast } from "sonner";
import { PageShell } from "@/components/layout/page-shell";
import { getUserId } from "@/lib/dev-user";
import { fetchGroup, getMembership, updateGroup } from "@/lib/groups/group-service";
import { regenerateInviteLink } from "@/lib/groups/invite-links";
import type { Group, GroupPrivacy } from "@/lib/groups/types";

const inputCls = "w-full h-11 rounded-xl bg-secondary border border-border px-3.5 text-sm outline-none focus:ring-2 focus:ring-ring focus:border-primary/50 transition-shadow";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1.5">{label}</label>{children}</div>;
}

export default function GroupSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [group, setGroup] = useState<Group | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [privacy, setPrivacy] = useState<GroupPrivacy>("public");
  const [linkCopied, setLinkCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    (async () => {
      const uid = await getUserId();
      if (!uid) { router.replace(`/auth?redirect=/groups/${id}/edit`); return; }
      const g = await fetchGroup(id);
      if (!g) { setLoading(false); return; }
      const membership = await getMembership(id, uid);
      const isAdmin = membership?.role === "owner" || membership?.role === "admin";
      setGroup(g);
      setPrivacy(g.privacy as GroupPrivacy);
      setAuthorized(isAdmin);
      setLoading(false);
    })();
  }, [id, router]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!group) return;
    const fd = new FormData(e.currentTarget);
    setSaving(true);
    try {
      await updateGroup(id, {
        name: (fd.get("name") as string)?.trim(),
        description: (fd.get("description") as string)?.trim() || null,
        location: (fd.get("location") as string)?.trim() || null,
        skill: (fd.get("skill") as string)?.trim() || null,
        privacy,
        allowInvites: fd.get("allow_invites") === "on",
        allowPosts: fd.get("allow_posts") === "on",
      });
      // Switching an existing public/private group to secret needs a token —
      // createGroup() only generates one at creation time.
      if (privacy === "secret" && !group.invite_token) {
        await regenerateInviteLink(id);
      }
      toast.success("Group updated!");
      router.push(`/groups/${id}`);
    } catch (err) {
      console.error(err);
      toast.error("Could not save changes.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRegenerateLink() {
    setRegenerating(true);
    try {
      const token = await regenerateInviteLink(id);
      setGroup((g) => g ? { ...g, invite_token: token } : g);
      toast.success("New invite link generated — the old one no longer works.");
    } catch (err) {
      console.error(err);
      toast.error("Could not regenerate the link.");
    } finally {
      setRegenerating(false);
    }
  }

  function copyLink() {
    if (!group?.invite_token) return;
    navigator.clipboard.writeText(`${window.location.origin}/groups/join/${group.invite_token}`);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  if (loading) return <PageShell><div className="flex items-center justify-center py-32"><div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" /></div></PageShell>;
  if (!group || !authorized) {
    return (
      <PageShell>
        <div className="max-w-md mx-auto px-4 py-32 text-center">
          <h1 className="font-display text-2xl tracking-wide mb-2">NOT AUTHORIZED</h1>
          <p className="text-muted-foreground text-sm mb-6">Only group admins can edit settings.</p>
          <Link href={`/groups/${id}`}><button className="h-11 px-6 rounded-full bg-primary text-primary-foreground font-display tracking-[0.15em] text-sm">VIEW GROUP</button></Link>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <Link href={`/groups/${id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
          <ArrowLeft size={15} weight="bold" /> Back to Group
        </Link>
        <h1 className="font-display text-4xl tracking-wide mb-6">GROUP SETTINGS</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Field label="GROUP NAME"><input name="name" required defaultValue={group.name} className={inputCls} /></Field>
          <Field label="DESCRIPTION"><textarea name="description" rows={3} defaultValue={group.description ?? ""} className={`${inputCls} h-auto py-3 resize-none`} /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="LOCATION"><input name="location" defaultValue={group.location ?? ""} className={inputCls} /></Field>
            <Field label="SKILL FOCUS"><input name="skill" defaultValue={group.skill ?? ""} className={inputCls} /></Field>
          </div>

          <Field label="PRIVACY">
            <div className="flex gap-2">
              {(["public", "private", "secret"] as GroupPrivacy[]).map((p) => (
                <button key={p} type="button" onClick={() => setPrivacy(p)}
                  className={`px-4 h-9 rounded-full text-xs font-mono tracking-wider border ${privacy === p ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}>
                  {p.toUpperCase()}
                </button>
              ))}
            </div>
          </Field>

          {privacy === "secret" && (
            <div className="rounded-xl border border-border bg-secondary/50 p-4 space-y-3">
              <p className="font-mono text-[10px] tracking-widest text-muted-foreground">SECRET GROUP INVITE LINK</p>
              {group.invite_token ? (
                <div className="flex items-center gap-2">
                  <input readOnly value={`${typeof window !== "undefined" ? window.location.origin : ""}/groups/join/${group.invite_token}`} className={`${inputCls} flex-1 text-muted-foreground`} />
                  <button type="button" onClick={copyLink} className="h-11 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-mono flex-shrink-0 flex items-center gap-1.5">
                    <LinkSimple size={14} weight="bold" /> {linkCopied ? "COPIED" : "COPY"}
                  </button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Save with Secret privacy to generate a link, or regenerate one now.</p>
              )}
              <button type="button" onClick={handleRegenerateLink} disabled={regenerating}
                className="text-xs text-primary hover:underline flex items-center gap-1.5 disabled:opacity-60">
                <ArrowClockwise size={12} weight="bold" /> {regenerating ? "Regenerating…" : "Regenerate link (invalidates the old one)"}
              </button>
            </div>
          )}

          <div className="space-y-3">
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input type="checkbox" name="allow_invites" defaultChecked={group.allow_invites} className="h-4 w-4 accent-primary" /> Let members invite others
            </label>
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input type="checkbox" name="allow_posts" defaultChecked={group.allow_posts} className="h-4 w-4 accent-primary" /> Let members post to the feed
            </label>
          </div>

          <div className="flex gap-3 pt-1">
            <Link href={`/groups/${id}`} className="flex-1"><button type="button" className="w-full h-12 rounded-full border border-border hover:bg-secondary text-sm font-display tracking-[0.15em] transition-colors">CANCEL</button></Link>
            <button type="submit" disabled={saving} className="flex-1 h-12 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-[0.15em] text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
              {saving ? <span className="h-4 w-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" /> : <CheckCircle size={16} weight="fill" />} SAVE CHANGES
            </button>
          </div>
        </form>
      </div>
    </PageShell>
  );
}
