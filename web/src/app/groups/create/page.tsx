"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle, Camera, X, Info } from "@phosphor-icons/react";
import { toast } from "sonner";
import { PageShell } from "@/components/layout/page-shell";
import { getUserId } from "@/lib/dev-user";
import { createGroup, uploadGroupBanner } from "@/lib/groups/group-service";
import type { GroupPrivacy } from "@/lib/groups/types";

const inputCls = "w-full h-11 rounded-xl bg-secondary border border-border px-3.5 text-sm outline-none focus:ring-2 focus:ring-ring focus:border-primary/50 transition-shadow";

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1.5">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

const PRIVACY_OPTIONS: { value: GroupPrivacy; label: string; hint: string }[] = [
  { value: "public", label: "Public", hint: "Anyone can find and join instantly." },
  { value: "private", label: "Private", hint: "Listed in Discover, but joining needs admin approval." },
  { value: "secret", label: "Secret", hint: "Hidden from Discover. Joinable only via a shareable invite link or a direct invite." },
];

export default function CreateGroupPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [privacy, setPrivacy] = useState<GroupPrivacy>("public");
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);

  useEffect(() => {
    getUserId().then((id) => {
      if (!id) { router.replace("/auth?redirect=/groups/create"); return; }
      setUserId(id);
      setChecking(false);
    });
  }, [router]);

  function handleBannerChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setBannerFile(file);
    setBannerPreview(file ? URL.createObjectURL(file) : null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!userId) return;
    const fd = new FormData(e.currentTarget);
    const name = (fd.get("name") as string)?.trim();
    if (!name) { toast.error("Group name is required."); return; }

    setSaving(true);
    try {
      let imageUrl: string | null = null;
      if (bannerFile) imageUrl = await uploadGroupBanner(userId, bannerFile);

      const group = await createGroup({
        name,
        description: (fd.get("description") as string)?.trim() || null,
        imageUrl,
        location: (fd.get("location") as string)?.trim() || null,
        skill: (fd.get("skill") as string)?.trim() || null,
        privacy,
        allowInvites: fd.get("allow_invites") === "on",
        allowPosts: fd.get("allow_posts") === "on",
      }, userId);

      toast.success("Group created!");
      router.push(`/groups/${group.id}`);
    } catch (err) {
      console.error(err);
      toast.error("Could not create the group. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (checking) {
    return (
      <PageShell>
        <div className="flex items-center justify-center py-32">
          <div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <Link href="/groups" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
          <ArrowLeft size={15} weight="bold" /> Back to Groups
        </Link>

        <h1 className="font-display text-4xl tracking-wide mb-6">CREATE A GROUP</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Field label="BANNER IMAGE (OPTIONAL)">
            {bannerPreview ? (
              <div className="relative h-32 rounded-xl overflow-hidden border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={bannerPreview} alt="Banner preview" className="w-full h-full object-cover" />
                <button type="button" onClick={() => { setBannerFile(null); setBannerPreview(null); }}
                  className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/60 text-white flex items-center justify-center" aria-label="Remove banner">
                  <X size={14} weight="bold" />
                </button>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 h-24 rounded-xl border border-dashed border-border hover:border-primary/50 cursor-pointer text-sm text-muted-foreground transition-colors">
                <Camera size={18} weight="bold" /> Upload a banner image
                <input type="file" accept="image/*" className="hidden" onChange={handleBannerChange} />
              </label>
            )}
          </Field>

          <Field label="GROUP NAME">
            <input name="name" required placeholder="Sarasota Sunrise Picklers" className={inputCls} />
          </Field>

          <Field label="DESCRIPTION (OPTIONAL)">
            <textarea name="description" rows={3} placeholder="Who we are, when we play, what to expect." className={`${inputCls} h-auto py-3 resize-none`} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="LOCATION (OPTIONAL)">
              <input name="location" placeholder="Sarasota, FL" className={inputCls} />
            </Field>
            <Field label="SKILL FOCUS (OPTIONAL)">
              <input name="skill" placeholder="3.0 – 4.0" className={inputCls} />
            </Field>
          </div>

          <Field label="PRIVACY">
            <div className="space-y-2">
              {PRIVACY_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setPrivacy(o.value)}
                  className={`w-full text-left p-3.5 rounded-xl border transition-colors ${
                    privacy === o.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                  }`}
                >
                  <span className="font-display text-sm tracking-wide">{o.label.toUpperCase()}</span>
                  <p className="text-xs text-muted-foreground mt-0.5">{o.hint}</p>
                </button>
              ))}
            </div>
          </Field>

          {privacy === "secret" && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3.5 flex items-start gap-2.5 text-sm">
              <Info size={16} weight="fill" className="text-primary flex-shrink-0 mt-0.5" />
              <p className="text-muted-foreground">
                A shareable invite link is generated automatically — find it under Group Settings once the group is created.
              </p>
            </div>
          )}

          <div className="space-y-3">
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input type="checkbox" name="allow_invites" defaultChecked className="h-4 w-4 accent-primary" />
              Let members invite others (not just admins)
            </label>
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input type="checkbox" name="allow_posts" defaultChecked className="h-4 w-4 accent-primary" />
              Let members post to the feed (not just admins)
            </label>
          </div>

          <div className="flex gap-3 pt-1">
            <Link href="/groups" className="flex-1">
              <button type="button" className="w-full h-12 rounded-full border border-border hover:bg-secondary text-sm font-display tracking-[0.15em] transition-colors">CANCEL</button>
            </Link>
            <button type="submit" disabled={saving}
              className="flex-1 h-12 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-[0.15em] text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
              {saving ? <span className="h-4 w-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" /> : <CheckCircle size={16} weight="fill" />}
              CREATE GROUP
            </button>
          </div>
        </form>
      </div>
    </PageShell>
  );
}
