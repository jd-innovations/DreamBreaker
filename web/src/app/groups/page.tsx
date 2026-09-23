"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, Plus, Globe, Lock, UsersThree } from "@phosphor-icons/react";
import { PageShell } from "@/components/layout/page-shell";
import { getUserId } from "@/lib/dev-user";
import { fetchMyGroups, fetchDiscoverGroups, fetchGroupUnreadCounts, joinGroup } from "@/lib/groups/group-service";
import type { Group } from "@/lib/groups/types";
import { toast } from "sonner";

function PrivacyBadge({ privacy }: { privacy: string }) {
  const Icon = privacy === "public" ? Globe : Lock;
  return (
    <span className="px-2 py-0.5 rounded-full bg-secondary border border-border font-mono text-[9px] tracking-[0.1em] text-muted-foreground flex items-center gap-1 flex-shrink-0">
      <Icon size={10} weight="bold" /> {privacy.toUpperCase()}
    </span>
  );
}

function GroupBanner({ group }: { group: Group }) {
  return (
    <div className="h-28 w-full rounded-t-2xl bg-secondary overflow-hidden">
      {group.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={group.image_url} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <UsersThree size={28} weight="duotone" className="text-primary/40" />
        </div>
      )}
    </div>
  );
}

function MyGroupCard({ g, unread }: { g: Group; unread: number }) {
  return (
    <Link href={`/groups/${g.id}`} className="block flex-shrink-0 w-64">
      <div className="border border-border rounded-2xl bg-card overflow-hidden hover:border-primary/40 transition-colors">
        <div className="relative">
          <GroupBanner group={g} />
          {/* Unread activity since this member last opened the group; the same
              count the app shows, from the shared RPC. */}
          {unread > 0 && (
            <span className="absolute right-2 top-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-primary bg-background px-1.5 text-[11px] font-bold text-primary">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </div>
        <div className="p-3.5">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <h3 className="font-display text-base tracking-tight leading-tight line-clamp-1">{g.name}</h3>
            <PrivacyBadge privacy={g.privacy} />
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Users size={12} weight="bold" /> {g.memberCount} {g.memberCount === 1 ? "member" : "members"}
          </p>
        </div>
      </div>
    </Link>
  );
}

function DiscoverCard({ g, onJoined }: { g: Group; onJoined: (id: string) => void }) {
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);

  async function handleJoin(e: React.MouseEvent) {
    e.preventDefault();
    setJoining(true);
    try {
      const userId = await getUserId();
      if (!userId) { window.location.href = "/auth?redirect=/groups"; return; }
      await joinGroup(g.id, userId);
      setJoined(true);
      onJoined(g.id);
      toast.success(`Joined ${g.name}!`);
    } catch (err) {
      console.error(err);
      toast.error("Could not join this group.");
    } finally {
      setJoining(false);
    }
  }

  return (
    <Link href={`/groups/${g.id}`} className="block group">
      <div className="border border-border rounded-2xl bg-card p-4 hover:border-primary/40 transition-colors flex items-center gap-4">
        <div className="h-16 w-16 rounded-xl bg-secondary overflow-hidden flex-shrink-0">
          {g.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={g.image_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center"><UsersThree size={20} weight="duotone" className="text-primary/40" /></div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg tracking-tight leading-tight line-clamp-1 group-hover:text-primary transition-colors">{g.name}</h3>
          <p className="text-xs text-muted-foreground mb-1">{g.memberCount} {g.memberCount === 1 ? "member" : "members"}{g.skill ? ` · ${g.skill}` : ""}</p>
          {g.description && <p className="text-sm text-muted-foreground line-clamp-1">{g.description}</p>}
        </div>
        <button
          onClick={handleJoin}
          disabled={joining || joined}
          className={`h-9 px-4 rounded-full text-xs font-mono tracking-wider flex-shrink-0 transition-colors ${
            joined ? "bg-secondary text-muted-foreground border border-border" : "bg-primary text-primary-foreground hover:bg-primary/90"
          } disabled:opacity-60`}
        >
          {joined ? "JOINED" : joining ? "…" : "JOIN"}
        </button>
      </div>
    </Link>
  );
}

export default function GroupsDirectoryPage() {
  const [myGroups, setMyGroups] = useState<Group[]>([]);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [discoverGroups, setDiscoverGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const uid = await getUserId();
      if (cancelled) return;
      setUserId(uid);
      if (!uid) { setLoading(false); return; }
      const [mine, discover, counts] = await Promise.all([
        fetchMyGroups(uid), fetchDiscoverGroups(uid), fetchGroupUnreadCounts(),
      ]);
      if (cancelled) return;
      setMyGroups(mine);
      setDiscoverGroups(discover);
      setUnread(counts);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  function handleJoined(id: string) {
    setDiscoverGroups((prev) => prev.filter((g) => g.id !== id));
  }

  return (
    <PageShell>
      <section className="border-b border-border bg-gradient-to-b from-primary/5 to-transparent">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 mb-3">
                <UsersThree size={18} weight="fill" className="text-primary" />
                <span className="font-mono text-[11px] tracking-[0.25em] text-primary">GROUPS</span>
              </div>
              <h1 className="font-display text-4xl sm:text-5xl tracking-wide leading-[0.95]">FIND YOUR PEOPLE</h1>
              <p className="text-muted-foreground mt-4 text-base leading-relaxed">
                Join a local club or crew, share what you&apos;re up to, and host games together.
              </p>
            </div>
            <Link href="/groups/create" className="flex-shrink-0">
              <button className="h-12 px-7 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-[0.15em] text-sm transition-colors flex items-center gap-2 shadow-lg shadow-primary/20">
                <Plus size={17} weight="bold" /> CREATE GROUP
              </button>
            </Link>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
        {!userId && !loading ? (
          <div className="border border-dashed border-border rounded-3xl py-16 text-center">
            <UsersThree size={40} weight="duotone" className="mx-auto mb-4 text-primary" />
            <h3 className="font-display text-xl tracking-wide mb-2">SIGN IN TO SEE YOUR GROUPS</h3>
            <Link href="/auth?redirect=/groups">
              <button className="h-11 px-7 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-[0.15em] text-sm transition-colors mt-2">SIGN IN</button>
            </Link>
          </div>
        ) : (
          <>
            <div>
              <h2 className="font-display text-xl tracking-wide mb-4">MY GROUPS</h2>
              {loading ? (
                <div className="flex gap-4 overflow-x-auto pb-2">
                  {[...Array(3)].map((_, i) => <div key={i} className="w-64 h-44 rounded-2xl bg-card border border-border animate-pulse flex-shrink-0" />)}
                </div>
              ) : myGroups.length === 0 ? (
                <div className="border border-dashed border-border rounded-2xl py-10 text-center text-muted-foreground text-sm">
                  No groups yet. <Link href="/groups/create" className="text-primary hover:underline">Create one</Link> or join one below.
                </div>
              ) : (
                <div className="flex gap-4 overflow-x-auto pb-2">
                  {myGroups.map((g) => <MyGroupCard key={g.id} g={g} unread={unread[g.id] ?? 0} />)}
                </div>
              )}
            </div>

            <div>
              <h2 className="font-display text-xl tracking-wide mb-4">DISCOVER GROUPS</h2>
              {loading ? (
                <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-2xl bg-card border border-border animate-pulse" />)}</div>
              ) : discoverGroups.length === 0 ? (
                <div className="border border-dashed border-border rounded-2xl py-10 text-center text-muted-foreground text-sm">
                  No public groups to discover yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {discoverGroups.map((g) => <DiscoverCard key={g.id} g={g} onJoined={handleJoined} />)}
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </PageShell>
  );
}
