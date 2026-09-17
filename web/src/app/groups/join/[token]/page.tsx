"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { UsersThree, Users, WarningCircle } from "@phosphor-icons/react";
import { toast } from "sonner";
import { PageShell } from "@/components/layout/page-shell";
import { getUserId } from "@/lib/dev-user";
import { fetchGroupPreviewByToken, joinGroupViaToken, type GroupInvitePreview } from "@/lib/groups/invite-links";

export default function GroupInviteLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const [preview, setPreview] = useState<GroupInvitePreview | null | undefined>(undefined);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    fetchGroupPreviewByToken(token).then(setPreview);
  }, [token]);

  async function handleJoin() {
    setJoining(true);
    try {
      const userId = await getUserId();
      if (!userId) {
        router.push(`/auth?redirect=${encodeURIComponent(`/groups/join/${token}`)}`);
        return;
      }
      await joinGroupViaToken(token);
      toast.success("You're in!");
      if (preview) router.push(`/groups/${preview.id}`);
    } catch (err) {
      console.error(err);
      toast.error("This invite link is no longer valid.");
    } finally {
      setJoining(false);
    }
  }

  return (
    <PageShell>
      <div className="max-w-md mx-auto px-4 py-24 text-center">
        {preview === undefined ? (
          <div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin mx-auto" />
        ) : preview === null ? (
          <>
            <WarningCircle size={44} weight="duotone" className="mx-auto mb-4 text-primary" />
            <h1 className="font-display text-2xl tracking-wide mb-2">INVITE LINK NOT VALID</h1>
            <p className="text-muted-foreground text-sm mb-6">
              This link may have been regenerated or the group may no longer exist.
            </p>
            <Link href="/groups"><button className="h-11 px-7 rounded-full bg-primary text-primary-foreground font-display tracking-[0.15em] text-sm">BROWSE GROUPS</button></Link>
          </>
        ) : (
          <>
            <div className="h-20 w-20 rounded-2xl bg-secondary overflow-hidden mx-auto mb-4">
              {preview.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview.imageUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center"><UsersThree size={28} weight="duotone" className="text-primary/40" /></div>
              )}
            </div>
            <p className="font-mono text-[11px] tracking-[0.25em] text-primary mb-2">YOU&apos;VE BEEN INVITED TO A SECRET GROUP</p>
            <h1 className="font-display text-3xl tracking-wide mb-2">{preview.name}</h1>
            {preview.description && <p className="text-muted-foreground text-sm mb-3">{preview.description}</p>}
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mb-6">
              <Users size={12} weight="bold" /> {preview.memberCount} {preview.memberCount === 1 ? "member" : "members"}
            </p>
            <button onClick={handleJoin} disabled={joining}
              className="h-12 px-8 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-[0.15em] text-sm transition-colors disabled:opacity-60">
              {joining ? "JOINING…" : "JOIN GROUP"}
            </button>
          </>
        )}
      </div>
    </PageShell>
  );
}
