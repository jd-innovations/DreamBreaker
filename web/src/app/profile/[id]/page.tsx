"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  MapPin, Trophy, Medal, Star, ChatCircleDots, ArrowLeft,
  Lightning,
} from "@phosphor-icons/react";
import { PageShell } from "@/components/layout/page-shell";
import { createClient } from "@/lib/supabase/client";
import { getUserId } from "@/lib/dev-user";
import { MessagingPanel } from "@/components/messaging/panel";
import type { UserProfile as MessagingUserProfile } from "@/components/messaging/panel";
import { X } from "@phosphor-icons/react";

type PublicProfile = {
  id: string;
  full_name: string | null;
  handle: string | null;
  dupr: number | null;
  skill_level: string | null;
  location_city: string | null;
  location_state: string | null;
  avatar_url: string | null;
  bio: string | null;
  play_style: string[] | null;
  role: string;
};

function initials(name: string | null) {
  if (!name) return "?";
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

export default function PublicProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<MessagingUserProfile[]>([]);
  const [showMessaging, setShowMessaging] = useState(false);
  const [messagingUnread, setMessagingUnread] = useState(0);
  const [stats, setStats] = useState({ wins: 0, losses: 0, tournaments: 0 });

  useEffect(() => {
    async function load() {
      const supabase = createClient();

      const userId = await getUserId();
      if (userId) {
        setCurrentUserId(userId);
        // Redirect to own profile
        if (userId === id) { router.replace("/profile"); return; }
        const { data: users } = await supabase.from("profiles").select("id,full_name,role,avatar_url").order("full_name");
        setAllUsers((users ?? []) as MessagingUserProfile[]);
      }

      const { data: prof } = await supabase
        .from("profiles")
        .select("id,full_name,handle,dupr,skill_level,location_city,location_state,avatar_url,bio,play_style,role")
        .eq("id", id)
        .single();

      if (prof) setProfile(prof as PublicProfile);

      // Tournament count
      const { count: tCount } = await supabase.from("registrations")
        .select("tournament_id", { count: "exact", head: true })
        .eq("player_id", id)
        .in("status", ["registered", "checked_in"]);
      if (tCount) setStats((s) => ({ ...s, tournaments: tCount }));

      // Match record
      const { data: matchRows } = await supabase.from("bracket_matches")
        .select("winner")
        .or(`team1_player_a.eq.${id},team1_player_b.eq.${id},team2_player_a.eq.${id},team2_player_b.eq.${id}`)
        .not("winner", "is", null);

      if (matchRows && matchRows.length > 0) {
        const wins = matchRows.filter((m) => m.winner === 1).length;
        setStats((s) => ({ ...s, wins, losses: matchRows.length - wins }));
      }

      setLoading(false);
    }
    load().catch(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <PageShell>
        <div className="max-w-2xl mx-auto px-4 py-20 space-y-4 animate-pulse">
          <div className="h-24 w-24 rounded-full bg-secondary mx-auto" />
          <div className="h-8 bg-secondary rounded-xl w-1/2 mx-auto" />
          <div className="h-4 bg-secondary rounded w-1/3 mx-auto" />
        </div>
      </PageShell>
    );
  }

  if (!profile) {
    return (
      <PageShell>
        <div className="max-w-2xl mx-auto px-4 py-20 text-center">
          <p className="text-muted-foreground">Player not found.</p>
          <Link href="/tournaments"><button className="mt-4 h-10 px-6 rounded-full bg-primary text-primary-foreground text-sm font-display tracking-wider">BACK TO TOURNAMENTS</button></Link>
        </div>
      </PageShell>
    );
  }

  const winRate = stats.wins + stats.losses > 0
    ? Math.round((stats.wins / (stats.wins + stats.losses)) * 100)
    : 0;

  const ratingLabel = profile.dupr
    ? `${profile.dupr} DUPR`
    : profile.skill_level
    ? profile.skill_level.replace("-", " – ")
    : null;

  return (
    <PageShell>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">

        {/* Back */}
        <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors font-mono">
          <ArrowLeft size={14} weight="bold" /> BACK
        </button>

        {/* Profile card */}
        <div className="border border-border rounded-2xl bg-card overflow-hidden">
          {/* Header */}
          <div className="px-6 pt-8 pb-6 flex flex-col sm:flex-row items-center sm:items-start gap-5">
            <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-2xl font-display text-primary">
              {profile.avatar_url
                ? <img src={profile.avatar_url} alt="" className="h-20 w-20 rounded-full object-cover" />
                : initials(profile.full_name)}
            </div>
            <div className="flex-1 min-w-0 text-center sm:text-left">
              <h1 className="font-display text-3xl tracking-wide">{profile.full_name ?? "Player"}</h1>
              {profile.handle && <div className="font-mono text-sm text-muted-foreground mt-0.5">@{profile.handle}</div>}
              {ratingLabel && <div className="font-mono text-sm text-primary mt-1">{ratingLabel}</div>}
              {(profile.location_city || profile.location_state) && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1.5 justify-center sm:justify-start">
                  <MapPin size={13} /> {[profile.location_city, profile.location_state].filter(Boolean).join(", ")}
                </div>
              )}
            </div>
            {currentUserId && currentUserId !== id && (
              <button
                onClick={() => setShowMessaging(true)}
                className="flex items-center gap-2 h-10 px-5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-display tracking-wider transition-colors flex-shrink-0"
              >
                <ChatCircleDots size={15} weight="fill" /> MESSAGE
              </button>
            )}
            {!currentUserId && (
              <Link href="/auth">
                <button className="flex items-center gap-2 h-10 px-5 rounded-full border border-border hover:bg-secondary text-sm font-display tracking-wider transition-colors">
                  <Lightning size={14} weight="fill" className="text-primary" /> SIGN IN TO MESSAGE
                </button>
              </Link>
            )}
          </div>

          {/* Stats row */}
          <div className="border-t border-border grid grid-cols-3 divide-x divide-border">
            {[
              { label: "WIN RATE", value: winRate > 0 ? `${winRate}%` : "—", icon: Trophy },
              { label: "TOURNAMENTS", value: stats.tournaments > 0 ? stats.tournaments : "—", icon: Medal },
              { label: "RECORD", value: stats.wins + stats.losses > 0 ? `${stats.wins}W–${stats.losses}L` : "—", icon: Star },
            ].map((s) => (
              <div key={s.label} className="px-4 py-5 text-center">
                <s.icon size={14} weight="fill" className="text-primary mx-auto mb-1" />
                <div className="font-display text-xl tracking-wide">{s.value}</div>
                <div className="font-mono text-[9px] tracking-widest text-muted-foreground mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Bio */}
          {profile.bio && (
            <div className="px-6 py-5 border-t border-border">
              <div className="font-mono text-[10px] tracking-widest text-muted-foreground mb-2">ABOUT</div>
              <p className="text-sm text-muted-foreground leading-relaxed">{profile.bio}</p>
            </div>
          )}

          {/* Play style */}
          {profile.play_style && profile.play_style.length > 0 && (
            <div className="px-6 py-4 border-t border-border">
              <div className="font-mono text-[10px] tracking-widest text-muted-foreground mb-2">PLAY STYLE</div>
              <div className="flex flex-wrap gap-2">
                {profile.play_style.map((s) => (
                  <span key={s} className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-mono">{s}</span>
                ))}
              </div>
            </div>
          )}
        </div>

      </div>

      {/* ── Messaging overlay ── */}
      {showMessaging && currentUserId && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ height: "min(620px, 90vh)" }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
              <span className="font-display tracking-wider text-sm">MESSAGE {(profile.full_name ?? "Player").split(" ")[0].toUpperCase()}</span>
              <button onClick={() => setShowMessaging(false)} className="h-7 w-7 rounded-full border border-border hover:bg-secondary flex items-center justify-center transition-colors">
                <X size={13} weight="bold" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <MessagingPanel
                currentUserId={currentUserId}
                allUsers={allUsers}
                initialRecipientId={id}
                onUnreadChange={setMessagingUnread}
                compact
              />
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
