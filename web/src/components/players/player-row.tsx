"use client";

import Link from "next/link";
import { ChatCircleDots, User } from "@phosphor-icons/react";
import { SafeImage } from "@/components/shared/safe-image";
import { Button } from "@/components/ui/button";
import { formatPlayerRating, mutualLabel, type DirectoryPlayer } from "@/lib/players/directory";

// One person in the web directory — the app's directory row: photo, name,
// @handle, rating, city, "Connected", mutual connections. Tapping the person
// opens their profile; Message opens a chat (open messaging: the recipient's
// controls are block and report). No precise location, ever.

export function PlayerRow({
  player,
  onMessage,
  extra,
}: {
  player: DirectoryPlayer;
  onMessage: (p: DirectoryPlayer) => void;
  /** Tab-specific control, e.g. "Remove" on Contacts. */
  extra?: React.ReactNode;
}) {
  const mutuals = mutualLabel(player.mutualCount);
  return (
    <li className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
      <Link
        href={`/profile/${player.id}`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
          {player.avatarUrl
            ? <SafeImage src={player.avatarUrl} alt="" fill sizes="48px" className="object-cover" />
            : <User size={22} className="text-muted-foreground" aria-hidden />}
        </span>
        <span className="min-w-0 space-y-0.5">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="break-words text-sm font-semibold">{player.name}</span>
            {player.isConnected && (
              <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                Connected
              </span>
            )}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {[player.handle ? `@${player.handle}` : null, formatPlayerRating(player.rating), player.location]
              .filter(Boolean).join(" · ")}
          </span>
          {mutuals && <span className="block text-xs text-foreground">{mutuals}</span>}
        </span>
      </Link>
      <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
        <Button type="button" size="sm" variant="secondary" onClick={() => onMessage(player)} aria-label={`Message ${player.name}`}>
          <ChatCircleDots size={16} /> <span className="hidden sm:inline">Message</span>
        </Button>
        {extra}
      </div>
    </li>
  );
}
