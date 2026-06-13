"use client";

import { useEffect, useState } from "react";
import { BookmarkSimple } from "@phosphor-icons/react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { getUserId } from "@/lib/dev-user";

interface BookmarkButtonProps {
  tournamentId: string;
  className?: string;
  size?: "sm" | "md";
}

export function BookmarkButton({ tournamentId, className = "", size = "md" }: BookmarkButtonProps) {
  const [bookmarked, setBookmarked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    getUserId().then(async (userId) => {
      if (!userId) { setLoading(false); return; }
      setUserId(userId);
      const { data } = await supabase
        .from("tournament_bookmarks")
        .select("id")
        .eq("player_id", userId)
        .eq("tournament_id", tournamentId)
        .maybeSingle();
      setBookmarked(!!data);
      setLoading(false);
    });
  }, [tournamentId]);

  const toggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!userId) { toast.error("Sign in to bookmark tournaments."); return; }
    const supabase = createClient();
    if (bookmarked) {
      await supabase.from("tournament_bookmarks").delete().eq("player_id", userId).eq("tournament_id", tournamentId);
      setBookmarked(false);
      toast.success("Removed from saved.");
    } else {
      await supabase.from("tournament_bookmarks").insert({ player_id: userId, tournament_id: tournamentId });
      setBookmarked(true);
      toast.success("Tournament saved!", { description: "Find it in your profile under Tournaments." });
    }
  };

  const iconSize = size === "sm" ? 16 : 20;
  const btnSize = size === "sm" ? "h-8 w-8" : "h-10 w-10";

  return (
    <button
      onClick={toggle}
      disabled={loading}
      title={bookmarked ? "Remove bookmark" : "Save tournament"}
      data-testid={`bookmark-btn-${tournamentId}`}
      className={`${btnSize} rounded-full flex items-center justify-center transition-all disabled:opacity-40 ${
        bookmarked
          ? "bg-primary text-primary-foreground hover:bg-primary/80"
          : "bg-secondary/80 text-muted-foreground hover:text-foreground hover:bg-secondary"
      } ${className}`}
    >
      <BookmarkSimple size={iconSize} weight={bookmarked ? "fill" : "regular"} />
    </button>
  );
}
