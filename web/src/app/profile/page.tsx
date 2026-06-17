"use client";


import { useEffect, useState, useRef } from "react";
import {
  Trophy, Users, MapPin, Calendar, Star,
  PencilSimple, Medal, Check, Camera,
  EyeSlash, Eye, UserMinus, Clock, BookmarkSimple, ShieldStar,
  ChatCircleDots, ArrowSquareOut, X,
} from "@phosphor-icons/react";
import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/client";
import { getUserId } from "@/lib/dev-user";
import { ensureFreshSession } from "@/lib/ensure-session";
import { toast } from "sonner";
import { MessagingPanel } from "@/components/messaging/panel";
import type { UserProfile as MessagingUserProfile } from "@/components/messaging/panel";
import { playerStats, matchPartners, recentMatches as mockMatches, tournaments as mockTournaments } from "@/data/mock-data";
import type { Tables } from "@/lib/supabase/database.types";

type Profile = Pick<
  Tables<"profiles">,
  | "id" | "full_name" | "handle" | "dupr" | "skill_level"
  | "location_city" | "location_state" | "avatar_url" | "cover_url" | "bio"
  | "play_style" | "availability" | "hand" | "created_at" | "role" | "director_status"
>;

type EditFields = {
  bio: string;
  play_style: string[];
  availability: string[];
  hand: string;
  skill_level: string;
  location_city: string;
  location_state: string;
};

type DisplayMatch = {
  id: string;
  opp: string;
  result: "W" | "L" | "—";
  score: string;
  event: string;
  date: string;
};

type TournamentEntry = {
  id: string;
  tournamentId: string;
  name: string;
  city: string;
  state: string;
  event_date: string;
  status: "held" | "registered" | "checked_in" | "completed" | "withdrawn";
  hold_expires_at: string | null;
  cover_img_url: string | null;
};

type BookmarkedTournament = {
  id: string;
  tournamentId: string;
  name: string;
  city: string;
  state: string;
  event_date: string;
  cover_img_url: string | null;
};

type Partner = {
  id: string;
  name: string;
  avatar: string | null;
  dupr: number | null;
  skill_level: string | null;
  location: string;
  badges: string[];
};

const DEFAULT_COVER = "https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=1200&h=400&fit=crop";
const DEFAULT_AVATAR = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&h=200&fit=crop";

const COVER_PRESETS = [
  { id: "court-aerial",  url: "https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=1200&h=400&fit=crop", label: "Court" },
  { id: "action-1",     url: "https://images.unsplash.com/photo-1737477004595-e9b659bb44ca?w=1200&h=400&fit=crop", label: "Action" },
  { id: "outdoor",      url: "https://images.unsplash.com/photo-1599586120429-48281b6f0ece?w=1200&h=400&fit=crop", label: "Outdoor" },
  { id: "stadium",      url: "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=1200&h=400&fit=crop", label: "Stadium" },
  { id: "sunset",       url: "https://images.unsplash.com/photo-1526232761682-d26e03ac148e?w=1200&h=400&fit=crop", label: "Sunset" },
  { id: "abstract",     url: "https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=1200&h=400&fit=crop", label: "Abstract" },
];

const SKILL_LEVELS = ["2.5-3.0", "3.0-3.5", "3.5-4.0", "4.0-4.5", "4.5+"];
const PLAY_STYLES = ["Aggressive baseliner", "Soft-game specialist", "Counter-puncher", "All-court", "Bangers + transition", "Dink master"];
const AVAILABILITY_OPTIONS = ["Weekends", "Weeknights", "Weekends + Tue evenings", "Sat / Sun mornings", "Flexible", "Weekdays only"];
const HAND_OPTIONS = ["right", "left", "ambidextrous"];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatEventDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function HoldCountdown({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState("");
  useEffect(() => {
    const tick = () => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) { setRemaining("Expired"); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return <span className="font-mono text-xs text-amber-500">{remaining}</span>;
}

function TournamentsTab({ entries, bookmarks, loading }: { entries: TournamentEntry[]; bookmarks: BookmarkedTournament[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="border border-border rounded-2xl bg-card flex items-center gap-4 p-4 animate-pulse">
            <div className="h-16 w-16 rounded-xl bg-secondary flex-shrink-0" />
            <div className="flex-1 space-y-2"><div className="h-4 w-40 bg-secondary rounded" /><div className="h-3 w-28 bg-secondary rounded" /></div>
          </div>
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="border border-dashed border-border rounded-2xl p-12 text-center text-muted-foreground">
        <BookmarkSimple size={32} weight="duotone" className="mx-auto mb-3 text-primary" />
        <div className="font-display text-xl tracking-wide mb-1">NO TOURNAMENTS YET</div>
        <p className="text-sm">Register or hold a spot to see your events here.</p>
        <Link href="/tournaments">
          <button className="mt-5 h-11 px-8 rounded-full bg-primary text-primary-foreground font-display tracking-[0.2em] text-sm">BROWSE TOURNAMENTS</button>
        </Link>
      </div>
    );
  }

  const held = entries.filter((e) => e.status === "held");
  const active = entries.filter((e) => e.status === "registered" || e.status === "checked_in");
  const past = entries.filter((e) => e.status === "completed" || e.status === "withdrawn");

  const renderSection = (title: string, items: TournamentEntry[]) => items.length === 0 ? null : (
    <div className="space-y-3">
      <p className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground">{title}</p>
      {items.map((e) => (
        <Link key={e.id} href={`/tournaments/${e.tournamentId}`} className="block">
          <div className="border border-border rounded-2xl bg-card flex items-center gap-4 p-4 hover:border-primary transition-colors group">
            {e.cover_img_url ? (
              <img src={e.cover_img_url} alt="" className="h-16 w-16 rounded-xl object-cover flex-shrink-0 group-hover:opacity-90 transition-opacity" />
            ) : (
              <div className="h-16 w-16 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0">
                <Trophy size={20} weight="fill" className="text-primary" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="font-display text-lg tracking-wide truncate">{e.name}</div>
              <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                <MapPin size={11} weight="bold" />{e.city}, {e.state}
                <span className="mx-1">·</span>
                <Calendar size={11} weight="bold" />{e.event_date ? formatEventDate(e.event_date) : "—"}
              </div>
            </div>
            <div className="flex-shrink-0 text-right">
              {e.status === "held" && e.hold_expires_at ? (
                <div className="flex flex-col items-end gap-0.5">
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-500 text-[10px] font-mono tracking-widest">HOLD</span>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5"><Clock size={10} /><HoldCountdown expiresAt={e.hold_expires_at} /></div>
                </div>
              ) : e.status === "checked_in" ? (
                <span className="px-2.5 py-0.5 rounded-full bg-primary/15 text-primary text-[10px] font-mono tracking-widest">CHECKED IN</span>
              ) : e.status === "registered" ? (
                <span className="px-2.5 py-0.5 rounded-full bg-primary/15 text-primary text-[10px] font-mono tracking-widest">REGISTERED</span>
              ) : e.status === "completed" ? (
                <span className="px-2.5 py-0.5 rounded-full bg-secondary text-muted-foreground text-[10px] font-mono tracking-widest">COMPLETED</span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full bg-secondary text-muted-foreground text-[10px] font-mono tracking-widest">WITHDRAWN</span>
              )}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      {renderSection("HOLDS — SPOT RESERVED", held)}
      {renderSection("REGISTERED", active)}
      {renderSection("PAST EVENTS", past)}
      {bookmarks.length > 0 && (
        <div className="space-y-3">
          <p className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground flex items-center gap-1.5">
            <BookmarkSimple size={11} weight="fill" className="text-primary" /> SAVED
          </p>
          {bookmarks.map((b) => (
            <Link key={b.id} href={`/tournaments/${b.tournamentId}`} className="block">
              <div className="border border-border rounded-2xl bg-card flex items-center gap-4 p-4 hover:border-primary transition-colors group">
                {b.cover_img_url ? (
                  <img src={b.cover_img_url} alt="" className="h-16 w-16 rounded-xl object-cover flex-shrink-0 group-hover:opacity-90 transition-opacity" />
                ) : (
                  <div className="h-16 w-16 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0">
                    <Trophy size={20} weight="fill" className="text-primary" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-display text-lg tracking-wide truncate">{b.name}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                    <MapPin size={11} weight="bold" />{b.city}, {b.state}
                    <span className="mx-1">·</span>
                    <Calendar size={11} weight="bold" />{b.event_date ? formatEventDate(b.event_date) : "—"}
                  </div>
                </div>
                <span className="flex-shrink-0 px-2.5 py-0.5 rounded-full bg-secondary text-muted-foreground text-[10px] font-mono tracking-widest">SAVED</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProfilePage() {
  const [editing, setEditing] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [fields, setFields] = useState<EditFields>({ bio: "", play_style: [], availability: [], hand: "", skill_level: "", location_city: "", location_state: "" });
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [localAvatar, setLocalAvatar] = useState<string | null>(null);
  const [localCover, setLocalCover] = useState<string | null>(null);
  const [showCoverPicker, setShowCoverPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [matches, setMatches] = useState<DisplayMatch[]>([]);
  const [matchFilter, setMatchFilter] = useState("All");
  const [hiddenMatchIds, setHiddenMatchIds] = useState<Set<string>>(new Set());
  const [partners, setPartners] = useState<Partner[]>([]);
  const [allUsers, setAllUsers] = useState<MessagingUserProfile[]>([]);
  const [messagingRecipientId, setMessagingRecipientId] = useState<string | null>(null);
  const [tournamentEntries, setTournamentEntries] = useState<TournamentEntry[]>([]);
  const [bookmarkedTournaments, setBookmarkedTournaments] = useState<BookmarkedTournament[]>([]);
  const [stats, setStats] = useState({ wins: 0, losses: 0, tournaments: 0 });
  const [loading, setLoading] = useState(true);
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      const userId = await getUserId();
      if (!userId) { setLoading(false); return; }
      userIdRef.current = userId;
      const user = { id: userId };

      // All users for messaging
      const { data: usersData } = await supabase.from("profiles").select("id,full_name,role,avatar_url").order("full_name");
      setAllUsers((usersData ?? []) as MessagingUserProfile[]);

      // Fetch hidden match IDs
      const { data: hiddenRows } = await supabase
        .from("profile_hidden_matches")
        .select("match_id")
        .eq("player_id", user.id);
      if (hiddenRows) setHiddenMatchIds(new Set(hiddenRows.map((r) => r.match_id)));

      const { data: prof } = await supabase
        .from("profiles")
        .select("id,full_name,handle,dupr,skill_level,location_city,location_state,avatar_url,cover_url,bio,play_style,availability,hand,created_at,role,director_status")
        .eq("id", user.id)
        .single();
      if (prof) {
        setProfile(prof);
        setFields({
          bio: prof.bio ?? "",
          play_style: prof.play_style ? prof.play_style.split(",").map((s) => s.trim()).filter(Boolean) : [],
          availability: prof.availability ? prof.availability.split(",").map((s) => s.trim()).filter(Boolean) : [],
          hand: prof.hand ?? "",
          skill_level: prof.skill_level ?? "",
          location_city: prof.location_city ?? "",
          location_state: prof.location_state ?? "",
        });
      }

      // Match history
      const { data: matchRows } = await supabase
        .from("bracket_matches")
        .select(`
          id, round, winner, score_team1, score_team2, completed_at, scheduled_at,
          tournament:tournaments!tournament_id(name),
          t1a:profiles!team1_player_a(full_name),
          t1b:profiles!team1_player_b(full_name),
          t2a:profiles!team2_player_a(full_name),
          t2b:profiles!team2_player_b(full_name)
        `)
        .or(`team1_player_a.eq.${user.id},team1_player_b.eq.${user.id},team2_player_a.eq.${user.id},team2_player_b.eq.${user.id}`)
        .not("winner", "is", null)
        .order("completed_at", { ascending: false })
        .limit(20);

      if (matchRows && matchRows.length > 0) {
        const processed: DisplayMatch[] = matchRows.map((m) => {
          const t1a = m.t1a as { full_name: string } | null;
          const t1b = m.t1b as { full_name: string } | null;
          const t2a = m.t2a as { full_name: string } | null;
          const t2b = m.t2b as { full_name: string } | null;
          const onTeam1 = t1a?.full_name === user.id || t1b?.full_name === user.id;
          const myScores = (onTeam1 ? m.score_team1 : m.score_team2) ?? [];
          const oppScores = (onTeam1 ? m.score_team2 : m.score_team1) ?? [];
          const myTeam = onTeam1 ? 1 : 2;
          const result: "W" | "L" | "—" = m.winner === myTeam ? "W" : m.winner ? "L" : "—";
          const scoreStr = myScores.length > 0 ? myScores.map((s: number, i: number) => `${s}–${oppScores[i] ?? 0}`).join(", ") : "—";
          const oppPlayers = onTeam1 ? [t2a, t2b] : [t1a, t1b];
          const oppLabel = oppPlayers.filter(Boolean).map((p) => p!.full_name.split(" ")[0]).join(" / ") || m.round.toUpperCase();
          return {
            id: m.id, opp: oppLabel, result, score: scoreStr,
            event: (m.tournament as { name: string } | null)?.name ?? "—",
            date: m.completed_at ? formatDate(m.completed_at) : m.scheduled_at ? formatDate(m.scheduled_at) : "—",
          };
        });
        setMatches(processed);
        setStats((s) => ({ ...s, wins: processed.filter((m) => m.result === "W").length, losses: processed.filter((m) => m.result === "L").length }));
      } else {
        setMatches(mockMatches.map((m, i) => ({ id: `mock-${i}`, opp: m.opponent.split(" / ")[0], result: m.result as "W" | "L", score: m.score, event: m.event, date: m.date })));
        setStats({ wins: playerStats.wins, losses: playerStats.losses, tournaments: playerStats.tournaments });
      }

      // Tournament registrations
      const { data: regRows } = await supabase
        .from("registrations")
        .select(`status, hold_expires_at, tournament:tournaments!tournament_id(id, name, city, state, event_date, cover_img_url, status)`)
        .eq("player_id", user.id)
        .order("created_at", { ascending: false });

      if (regRows && regRows.length > 0) {
        const entries: TournamentEntry[] = regRows.map((r) => {
          const t = r.tournament as { id: string; name: string; city: string; state: string; event_date: string; cover_img_url: string | null; status: string } | null;
          return {
            id: `${user.id}-${t?.id ?? ""}`,
            tournamentId: t?.id ?? "",
            name: t?.name ?? "—",
            city: t?.city ?? "",
            state: t?.state ?? "",
            event_date: t?.event_date ?? "",
            status: r.status as TournamentEntry["status"],
            hold_expires_at: r.hold_expires_at,
            cover_img_url: t?.cover_img_url ?? null,
          };
        });
        setTournamentEntries(entries);
        const activeCount = entries.filter((e) => e.status === "registered" || e.status === "checked_in").length;
        if (activeCount > 0) setStats((s) => ({ ...s, tournaments: activeCount }));
      } else {
        const { count } = await supabase.from("registrations").select("tournament_id", { count: "exact", head: true }).eq("player_id", user.id).in("status", ["registered", "checked_in"]);
        if (count && count > 0) setStats((s) => ({ ...s, tournaments: count }));
      }

      // Bookmarked tournaments
      const { data: bookmarkRows } = await supabase
        .from("tournament_bookmarks")
        .select("id, tournament:tournaments!tournament_id(id, name, city, state, event_date, cover_img_url)")
        .eq("player_id", user.id)
        .order("created_at", { ascending: false });
      if (bookmarkRows && bookmarkRows.length > 0) {
        setBookmarkedTournaments(bookmarkRows.map((b) => {
          const t = b.tournament as { id: string; name: string; city: string; state: string; event_date: string; cover_img_url: string | null } | null;
          return {
            id: b.id,
            tournamentId: t?.id ?? "",
            name: t?.name ?? "—",
            city: t?.city ?? "",
            state: t?.state ?? "",
            event_date: t?.event_date ?? "",
            cover_img_url: t?.cover_img_url ?? null,
          };
        }));
      }

      // Partners from mutual matches
      const { data: mutual } = await supabase.from("v_mutual_matches").select("user_a,user_b").or(`user_a.eq.${user.id},user_b.eq.${user.id}`);
      if (mutual && mutual.length > 0) {
        const ids = mutual.map((m) => m.user_a === user.id ? m.user_b : m.user_a).filter(Boolean) as string[];
        const { data: pp } = await supabase.from("profiles").select("id,full_name,avatar_url,dupr,skill_level,location_city,location_state,play_style").in("id", ids);
        setPartners((pp ?? []).map((p) => ({ id: p.id, name: p.full_name, avatar: p.avatar_url, dupr: p.dupr, skill_level: p.skill_level, location: [p.location_city, p.location_state].filter(Boolean).join(", ") || "—", badges: [p.play_style].filter(Boolean) as string[] })));
      } else {
        setPartners(matchPartners.slice(0, 4).map((p) => ({ id: p.id, name: p.name, avatar: p.img, dupr: p.dupr, skill_level: null, location: p.location, badges: p.badges })));
      }

      setLoading(false);
    }

    load().catch(() => {
      setMatches(mockMatches.map((m, i) => ({ id: `mock-${i}`, opp: m.opponent.split(" / ")[0], result: m.result as "W" | "L", score: m.score, event: m.event, date: m.date })));
      setPartners(matchPartners.slice(0, 4).map((p) => ({ id: p.id, name: p.name, avatar: p.img, dupr: p.dupr, skill_level: null, location: p.location, badges: p.badges })));
      setStats({ wins: playerStats.wins, losses: playerStats.losses, tournaments: playerStats.tournaments });
      setLoading(false);
    });
  }, []);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    // Optimistic preview
    const objectUrl = URL.createObjectURL(file);
    setLocalAvatar(objectUrl);
    setAvatarUploading(true);

    const ok = await ensureFreshSession();
    if (!ok) {
      toast.error("Your session expired. Please sign out and sign back in to upload a photo.");
      setLocalAvatar(null);
      setAvatarUploading(false);
      return;
    }

    const supabase = createClient();
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${profile.id}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      toast.error("Failed to upload photo.");
      setLocalAvatar(null);
      setAvatarUploading(false);
      return;
    }

    // Cache-bust so the new image shows immediately even though the path is reused.
    const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
    const bustedUrl = `${publicUrl}?v=${Date.now()}`;
    const { data: updated, error: updateError } = await supabase
      .from("profiles")
      .update({ avatar_url: bustedUrl })
      .eq("id", profile.id)
      .select("id");

    if (updateError || !updated || updated.length === 0) {
      toast.error("Couldn't save your photo — your session may have expired. Sign out and back in.");
      setLocalAvatar(null);
    } else {
      setProfile((p) => p ? { ...p, avatar_url: bustedUrl } : p);
      toast.success("Profile photo updated.");
    }
    setAvatarUploading(false);
  };

  const toggleHideMatch = async (matchId: string) => {
    const userId = userIdRef.current;
    if (!userId) return;
    const supabase = createClient();
    const isHidden = hiddenMatchIds.has(matchId);
    if (isHidden) {
      await supabase.from("profile_hidden_matches").delete().eq("player_id", userId).eq("match_id", matchId);
      setHiddenMatchIds((s) => { const n = new Set(s); n.delete(matchId); return n; });
      toast.success("Match restored to profile.");
    } else {
      await supabase.from("profile_hidden_matches").insert({ player_id: userId, match_id: matchId });
      setHiddenMatchIds((s) => new Set(s).add(matchId));
      toast.success("Match hidden from profile.");
    }
  };

  const removePartner = async (partnerId: string, partnerName: string) => {
    const userId = userIdRef.current;
    if (!userId) return;
    const supabase = createClient();
    // Delete swipe records in both directions to break the mutual match
    await supabase.from("matchmaking_swipes")
      .delete()
      .or(`and(requester_id.eq.${userId},target_id.eq.${partnerId}),and(requester_id.eq.${partnerId},target_id.eq.${userId})`);
    setPartners((p) => p.filter((x) => x.id !== partnerId));
    toast.success(`Removed ${partnerName} from partners.`);
  };

  const selectPresetCover = async (url: string) => {
    if (!profile) return;
    setLocalCover(url);
    setShowCoverPicker(false);
    const ok = await ensureFreshSession();
    if (!ok) { toast.error("Your session expired. Please sign out and back in."); setLocalCover(null); return; }
    const supabase = createClient();
    const { data, error } = await supabase.from("profiles").update({ cover_url: url }).eq("id", profile.id).select("id");
    if (error || !data || data.length === 0) { toast.error("Couldn't save cover — your session may have expired."); setLocalCover(null); return; }
    setProfile((p) => p ? { ...p, cover_url: url } : p);
    toast.success("Cover updated.");
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    const objectUrl = URL.createObjectURL(file);
    setLocalCover(objectUrl);
    setShowCoverPicker(false);
    setCoverUploading(true);
    const ok = await ensureFreshSession();
    if (!ok) { toast.error("Your session expired. Please sign out and back in."); setLocalCover(null); setCoverUploading(false); return; }
    const supabase = createClient();
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${profile.id}/cover.${ext}`;
    const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
    if (uploadError) { toast.error("Failed to upload cover."); setLocalCover(null); setCoverUploading(false); return; }
    const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
    const bustedUrl = `${publicUrl}?v=${Date.now()}`;
    const { data: updated, error: updateError } = await supabase.from("profiles").update({ cover_url: bustedUrl }).eq("id", profile.id).select("id");
    if (updateError || !updated || updated.length === 0) { toast.error("Couldn't save cover — your session may have expired."); setLocalCover(null); } else {
      setProfile((p) => p ? { ...p, cover_url: bustedUrl } : p);
      toast.success("Cover photo updated.");
    }
    setCoverUploading(false);
  };

  const saveProfile = async () => {
    if (!profile) return;
    setSaving(true);
    const ok = await ensureFreshSession();
    if (!ok) {
      setSaving(false);
      toast.error("Your session expired. Please sign out and sign back in to save changes.");
      return;
    }
    const supabase = createClient();
    const { data, error } = await supabase.from("profiles").update({
      bio: fields.bio || null,
      play_style: fields.play_style.length > 0 ? fields.play_style.join(", ") : null,
      availability: fields.availability.length > 0 ? fields.availability.join(", ") : null,
      hand: (fields.hand as "right" | "left" | "ambidextrous") || null,
      skill_level: fields.skill_level || null,
      location_city: fields.location_city || null,
      location_state: fields.location_state || null,
    }).eq("id", profile.id).select("id");
    setSaving(false);
    if (error) { toast.error("Failed to save profile."); return; }
    if (!data || data.length === 0) {
      toast.error("Couldn't save — your session may have expired. Please sign out and back in.");
      return;
    }
    setProfile((p) => p ? { ...p, bio: fields.bio || null, skill_level: fields.skill_level || null, hand: (fields.hand as "right" | "left" | "ambidextrous") || null, play_style: fields.play_style.join(", ") || null, availability: fields.availability.join(", ") || null, location_city: fields.location_city || null, location_state: fields.location_state || null } : p);
    setEditing(false);
    toast.success("Profile saved.");
  };

  const cancelEdit = () => {
    if (profile) setFields({
      bio: profile.bio ?? "",
      play_style: profile.play_style ? profile.play_style.split(",").map((s) => s.trim()).filter(Boolean) : [],
      availability: profile.availability ? profile.availability.split(",").map((s) => s.trim()).filter(Boolean) : [],
      hand: profile.hand ?? "",
      skill_level: profile.skill_level ?? "",
      location_city: profile.location_city ?? "",
      location_state: profile.location_state ?? "",
    });
    setLocalAvatar(null);
    setLocalCover(null);
    setShowCoverPicker(false);
    setEditing(false);
  };

  const name = profile?.full_name?.toUpperCase() ?? "PLAYER";
  const location = fields.location_city || fields.location_state
    ? [fields.location_city, fields.location_state].filter(Boolean).join(", ")
    : "Location not set";
  const joinedDate = profile?.created_at ? new Date(profile.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "—";
  const avatarUrl = localAvatar ?? profile?.avatar_url ?? DEFAULT_AVATAR;
  const coverUrl = localCover ?? profile?.cover_url ?? DEFAULT_COVER;
  const winRate = stats.wins + stats.losses > 0 ? Math.round((stats.wins / (stats.wins + stats.losses)) * 100) : 0;

  // Hold the full render until profile data is loaded — avoids briefly
  // flashing the default placeholder avatar/cover before the real images.
  if (loading) {
    return (
      <PageShell>
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      {/* Cover photo */}
      <div className="relative h-48 sm:h-64 lg:h-80 overflow-hidden">
        <img
          src={coverUrl}
          alt=""
          className={`h-full w-full object-cover opacity-70 dark:opacity-60 transition-opacity ${coverUploading ? "opacity-30" : ""}`}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />

        {/* Edit cover button — only in edit mode */}
        {editing && (
          <button
            type="button"
            onClick={() => setShowCoverPicker((v) => !v)}
            className="absolute top-3 right-3 h-9 px-4 rounded-full bg-background/70 backdrop-blur border border-border text-xs font-display tracking-[0.15em] flex items-center gap-2 hover:bg-background/90 transition-colors"
            data-testid="cover-edit-btn"
          >
            <Camera size={13} weight="fill" /> CHANGE COVER
          </button>
        )}

        {coverUploading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        )}

        {/* Cover picker panel */}
        {showCoverPicker && (
          <div className="absolute inset-x-0 bottom-0 bg-background/95 backdrop-blur border-t border-border p-4" data-testid="cover-picker">
            <p className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground mb-3">CHOOSE A COVER</p>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {COVER_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => selectPresetCover(p.url)}
                  className={`relative flex-shrink-0 h-16 w-28 rounded-xl overflow-hidden border-2 transition-all ${coverUrl === p.url ? "border-primary" : "border-transparent hover:border-primary/50"}`}
                >
                  <img src={p.url} alt={p.label} className="h-full w-full object-cover" />
                  {coverUrl === p.url && (
                    <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                      <Check size={16} weight="bold" className="text-primary" />
                    </div>
                  )}
                </button>
              ))}
              {/* Upload custom tile */}
              <button
                type="button"
                onClick={() => coverInputRef.current?.click()}
                className="flex-shrink-0 h-16 w-28 rounded-xl border-2 border-dashed border-border hover:border-primary/50 flex flex-col items-center justify-center gap-1 transition-colors"
              >
                <Camera size={16} weight="bold" className="text-muted-foreground" />
                <span className="font-mono text-[9px] tracking-wider text-muted-foreground">UPLOAD</span>
              </button>
            </div>
            <input ref={coverInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleCoverUpload} />
          </div>
        )}
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-end justify-between -mt-12 lg:-mt-20 pb-6 border-b border-border">
          <div className="flex items-end gap-5 min-w-0">
            <div className="relative flex-shrink-0">
              {/* Multi-colored gradient ring outline */}
              <div className="rounded-full p-[3px] lg:p-[4px] bg-gradient-to-tr from-violet-500 via-pink-400 to-cyan-400">
                <img
                  src={avatarUrl}
                  alt="Avatar"
                  className={`h-24 w-24 lg:h-36 lg:w-36 rounded-full border-2 border-background object-cover transition-opacity ${avatarUploading ? "opacity-50" : ""}`}
                />
              </div>
              {/* Online indicator (view mode) or camera button (edit mode) */}
              {editing ? (
                <>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={avatarUploading}
                    className="absolute inset-[3px] lg:inset-[4px] rounded-full bg-black/50 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity disabled:cursor-wait"
                    data-testid="avatar-upload-btn"
                  >
                    <Camera size={24} weight="fill" className="text-white" />
                  </button>
                  {avatarUploading && (
                    <div className="absolute inset-[3px] lg:inset-[4px] rounded-full flex items-center justify-center">
                      <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                </>
              ) : (
                <div className="absolute bottom-1.5 right-1.5 h-5 w-5 rounded-full bg-primary border-2 border-background" />
              )}
            </div>
            <div className="pb-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl tracking-wide text-foreground">{name}</h1>
                {(profile as { director_status?: string | null } | null)?.director_status === "approved" && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-amber-400/40 bg-amber-400/10 text-amber-400 font-mono text-[9px] tracking-[0.2em]">
                    <ShieldStar size={11} weight="fill" /> DIRECTOR
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-1">
                {profile?.handle && <span className="font-mono text-xs text-primary">{profile.handle}</span>}
                <span className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin size={12} weight="bold" />{location}</span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground"><Calendar size={12} weight="bold" />Joined {joinedDate}</span>
              </div>
            </div>
          </div>
          <button
            onClick={() => editing ? cancelEdit() : setEditing(true)}
            className="h-10 px-5 rounded-full border border-border flex items-center gap-2 text-sm hover:bg-secondary/60 transition-colors"
            data-testid="profile-edit-btn"
          >
            <PencilSimple size={16} weight="bold" /> {editing ? "Cancel" : "Edit"}
          </button>
        </div>

        {/* Stat bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-6 border-b border-border">
          {[
            { label: "WIN RATE", value: winRate > 0 ? `${winRate}%` : "—", icon: Trophy },
            { label: profile?.dupr ? "DUPR" : "SELF-RATED", value: profile?.dupr ?? profile?.skill_level?.replace("-", " – ") ?? "—", icon: Star },
            { label: "TOURNAMENTS", value: stats.tournaments > 0 ? stats.tournaments : "—", icon: Medal },
            { label: "W – L", value: stats.wins + stats.losses > 0 ? `${stats.wins} – ${stats.losses}` : "—", icon: Users },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <s.icon size={16} weight="fill" className="text-primary mx-auto mb-1" />
              <div className="font-display text-3xl tracking-wide">{s.value}</div>
              <div className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="py-6">
          <Tabs defaultValue="tournaments" className="w-full">
            <TabsList className="rounded-full p-1 h-11 mb-6 bg-secondary w-full flex">
              <TabsTrigger value="tournaments" className="rounded-full flex-1 text-xs sm:text-sm px-1 sm:px-4 whitespace-nowrap" data-testid="profile-tab-tournaments">Tournaments</TabsTrigger>
              <TabsTrigger value="history" className="rounded-full flex-1 text-xs sm:text-sm px-1 sm:px-4 whitespace-nowrap" data-testid="profile-tab-history">History</TabsTrigger>
              <TabsTrigger value="partners" className="rounded-full flex-1 text-xs sm:text-sm px-1 sm:px-4 whitespace-nowrap" data-testid="profile-tab-partners">Partners</TabsTrigger>
              <TabsTrigger value="about" className="rounded-full flex-1 text-xs sm:text-sm px-1 sm:px-4 whitespace-nowrap" data-testid="profile-tab-about">About</TabsTrigger>
            </TabsList>

            {/* Tournaments */}
            <TabsContent value="tournaments">
              <TournamentsTab entries={tournamentEntries} bookmarks={bookmarkedTournaments} loading={loading} />
            </TabsContent>

            {/* Match History */}
            <TabsContent value="history">
              {/* Event filter */}
              {matches.length > 0 && (
                <div className="flex items-center gap-3 mb-4">
                  <span className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground whitespace-nowrap">FILTER BY</span>
                  <select
                    value={matchFilter}
                    onChange={(e) => setMatchFilter(e.target.value)}
                    className="h-9 px-3 rounded-full bg-secondary border border-border text-sm outline-none focus:ring-2 focus:ring-ring cursor-pointer"
                    data-testid="match-filter-event"
                  >
                    <option value="All">All Events</option>
                    {[...new Set(matches.map((m) => m.event).filter((e) => e !== "—"))].map((ev) => (
                      <option key={ev} value={ev}>{ev}</option>
                    ))}
                  </select>
                </div>
              )}
              {editing && matches.length > 0 && (
                <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground mb-3 flex items-center gap-1.5">
                  <EyeSlash size={11} /> HIDDEN MATCHES APPEAR FADED — CLICK TO RESTORE
                </p>
              )}
              {loading ? (
                <div className="border border-border rounded-2xl bg-card divide-y divide-border overflow-hidden animate-pulse">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="flex items-center gap-4 p-4">
                      <div className="h-10 w-10 rounded-full bg-secondary flex-shrink-0" />
                      <div className="flex-1 space-y-2"><div className="h-3.5 w-32 bg-secondary rounded" /><div className="h-3 w-24 bg-secondary rounded" /></div>
                      <div className="h-3 w-20 bg-secondary rounded" />
                    </div>
                  ))}
                </div>
              ) : matches.length === 0 ? (
                <div className="border border-dashed border-border rounded-2xl p-12 text-center text-muted-foreground">
                  <Trophy size={32} weight="duotone" className="mx-auto mb-3 text-primary" />
                  <div className="font-display text-xl tracking-wide mb-1">NO MATCHES YET</div>
                  <p className="text-sm">Register for a tournament to start building your record.</p>
                </div>
              ) : (
                <div className="border border-border rounded-2xl bg-card divide-y divide-border overflow-hidden">
                  {matches
                    .filter((m) => (editing || !hiddenMatchIds.has(m.id)) && (matchFilter === "All" || m.event === matchFilter))
                    .map((m) => {
                      const hidden = hiddenMatchIds.has(m.id);
                      return (
                        <div key={m.id} className={`flex items-center gap-3 p-4 transition-opacity ${hidden ? "opacity-35" : ""}`}>
                          <div className={`h-10 w-10 rounded-full flex items-center justify-center font-display text-xl font-bold flex-shrink-0 ${m.result === "W" ? "bg-primary/15 text-primary" : m.result === "L" ? "bg-destructive/15 text-destructive" : "bg-secondary text-muted-foreground"}`}>
                            {m.result}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm">vs. {m.opp}</div>
                            <div className="text-xs text-muted-foreground">{m.event} · {m.date}</div>
                          </div>
                          <div className="font-mono text-sm text-muted-foreground hidden sm:block">{m.score}</div>
                          {editing && (
                            <button
                              onClick={() => toggleHideMatch(m.id)}
                              title={hidden ? "Show on profile" : "Hide from profile"}
                              className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex-shrink-0"
                              data-testid={`match-toggle-${m.id}`}
                            >
                              {hidden ? <Eye size={15} weight="bold" /> : <EyeSlash size={15} weight="bold" />}
                            </button>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
              {!editing && hiddenMatchIds.size > 0 && (
                <p className="text-center text-xs text-muted-foreground mt-3">
                  {hiddenMatchIds.size} match{hiddenMatchIds.size > 1 ? "es" : ""} hidden · <button onClick={() => setEditing(true)} className="text-primary hover:underline">Edit profile to manage</button>
                </p>
              )}
            </TabsContent>

            {/* Partners */}
            <TabsContent value="partners">
              {partners.length === 0 ? (
                <div className="border border-dashed border-border rounded-2xl p-12 text-center text-muted-foreground">
                  <Users size={32} weight="duotone" className="mx-auto mb-3 text-primary" />
                  <div className="font-display text-xl tracking-wide mb-1">NO PARTNERS YET</div>
                  <p className="text-sm">Use matchmaking to find and connect with partners.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {partners.map((p) => (
                    <div key={p.id} className="border border-border rounded-2xl bg-card p-5 flex items-center gap-4 relative group">
                      {p.avatar ? (
                        <img src={p.avatar} alt="" className="h-14 w-14 rounded-xl object-cover flex-shrink-0" />
                      ) : (
                        <div className="h-14 w-14 rounded-xl bg-secondary flex items-center justify-center font-display text-2xl flex-shrink-0">{p.name.charAt(0)}</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-display text-xl tracking-wide truncate">{p.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {p.dupr ? `DUPR ${p.dupr}` : p.skill_level ? p.skill_level.replace("-", " – ") : null}
                          {(p.dupr || p.skill_level) ? " · " : ""}{p.location}
                        </div>
                        {p.badges.length > 0 && (
                          <div className="flex gap-1 mt-1.5 flex-wrap">
                            {p.badges.map((b) => <span key={b} className="px-2 py-0.5 rounded-full bg-secondary text-[10px] font-mono">{b}</span>)}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {editing ? (
                          <button
                            onClick={() => removePartner(p.id, p.name)}
                            title="Remove partner"
                            className="h-9 w-9 rounded-full flex items-center justify-center text-destructive hover:bg-destructive/10 border border-destructive/30 transition-colors"
                            data-testid={`partner-remove-${p.id}`}
                          >
                            <UserMinus size={16} weight="bold" />
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => setMessagingRecipientId(p.id)}
                              title="Message"
                              className="h-9 w-9 rounded-full flex items-center justify-center border border-foreground/30 bg-foreground/10 text-foreground hover:bg-foreground/20 transition-colors"
                              data-testid={`partner-message-${p.id}`}
                            >
                              <ChatCircleDots size={16} weight="fill" />
                            </button>
                            <Link href={`/profile/${p.id}`}>
                              <div
                                title="View profile"
                                className="h-9 w-9 rounded-full flex items-center justify-center border border-foreground/30 bg-foreground/10 text-foreground hover:bg-foreground/20 transition-colors"
                                data-testid={`partner-view-${p.id}`}
                              >
                                <ArrowSquareOut size={16} weight="bold" />
                              </div>
                            </Link>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* About */}
            <TabsContent value="about">
              <div className="border border-border rounded-2xl bg-card p-6 space-y-5">
                {editing ? (
                  <>
                    {/* Bio */}
                    <div>
                      <label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-1.5">BIO</label>
                      <textarea rows={3} value={fields.bio} onChange={(e) => setFields((f) => ({ ...f, bio: e.target.value }))} placeholder="Tell players about your game..." className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring resize-none" />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Location */}
                      <div>
                        <label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-1.5">CITY</label>
                        <input value={fields.location_city} onChange={(e) => setFields((f) => ({ ...f, location_city: e.target.value }))} placeholder="Austin" className="w-full bg-secondary border border-border rounded-xl px-4 h-10 text-sm outline-none focus:ring-2 focus:ring-ring" />
                      </div>
                      <div>
                        <label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-1.5">STATE</label>
                        <input value={fields.location_state} onChange={(e) => setFields((f) => ({ ...f, location_state: e.target.value }))} placeholder="TX" className="w-full bg-secondary border border-border rounded-xl px-4 h-10 text-sm outline-none focus:ring-2 focus:ring-ring" />
                      </div>
                    </div>

                    {/* Self-rated level */}
                    <div>
                      <label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-2">SELF-RATED LEVEL</label>
                      <div className="flex flex-wrap gap-2">
                        {SKILL_LEVELS.map((l) => (
                          <button key={l} type="button" onClick={() => setFields((f) => ({ ...f, skill_level: f.skill_level === l ? "" : l }))} className={`px-4 h-9 rounded-full text-xs font-mono border transition-colors ${fields.skill_level === l ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}>
                            {l.replace("-", " – ")}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Hand */}
                    <div>
                      <label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-2">DOMINANT HAND</label>
                      <div className="flex gap-2">
                        {HAND_OPTIONS.map((h) => (
                          <button key={h} type="button" onClick={() => setFields((f) => ({ ...f, hand: f.hand === h ? "" : h }))} className={`px-4 h-9 rounded-full text-xs font-mono border transition-colors capitalize ${fields.hand === h ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}>
                            {h}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Play style */}
                    <div>
                      <label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-2">PLAY STYLE</label>
                      <div className="flex flex-wrap gap-2">
                        {PLAY_STYLES.map((s) => (
                          <button key={s} type="button" onClick={() => setFields((f) => ({ ...f, play_style: f.play_style.includes(s) ? f.play_style.filter((x) => x !== s) : [...f.play_style, s] }))} className={`px-4 h-9 rounded-full text-xs font-mono border transition-colors ${fields.play_style.includes(s) ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}>
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Availability */}
                    <div>
                      <label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-2">AVAILABILITY</label>
                      <div className="flex flex-wrap gap-2">
                        {AVAILABILITY_OPTIONS.map((a) => (
                          <button key={a} type="button" onClick={() => setFields((f) => ({ ...f, availability: f.availability.includes(a) ? f.availability.filter((x) => x !== a) : [...f.availability, a] }))} className={`px-4 h-9 rounded-full text-xs font-mono border transition-colors ${fields.availability.includes(a) ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}>
                            {a}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Save */}
                    <div className="flex gap-3 pt-2 border-t border-border">
                      <button onClick={saveProfile} disabled={saving} className="h-11 px-8 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 font-display tracking-[0.2em] text-sm flex items-center gap-2 transition-colors" data-testid="profile-save-btn">
                        <Check size={15} weight="bold" /> {saving ? "SAVING…" : "SAVE PROFILE"}
                      </button>
                      <button onClick={cancelEdit} className="h-11 px-6 rounded-full border border-border hover:bg-secondary/60 font-display tracking-[0.2em] text-sm transition-colors">
                        CANCEL
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {profile?.bio || "No bio yet. Click Edit Profile to add one."}
                    </p>
                    <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
                      {[
                        { label: "SELF-RATED LEVEL", value: profile?.skill_level?.replace("-", " – ") || "—" },
                        { label: "DUPR", value: profile?.dupr ? `${profile.dupr}` : "Not set" },
                        { label: "PLAY STYLE", value: fields.play_style.length > 0 ? fields.play_style.join(", ") : profile?.play_style || "—" },
                        { label: "AVAILABILITY", value: fields.availability.length > 0 ? fields.availability.join(", ") : profile?.availability || "—" },
                        { label: "DOMINANT HAND", value: profile?.hand ? profile.hand.charAt(0).toUpperCase() + profile.hand.slice(1) : "—" },
                        { label: "TOURNAMENTS", value: stats.tournaments > 0 ? `${stats.tournaments} this season` : "—" },
                      ].map((d) => (
                        <div key={d.label}>
                          <div className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground">{d.label}</div>
                          <div className="font-semibold text-sm mt-0.5">{d.value}</div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </TabsContent>
          </Tabs>

        </div>
      </div>
      {/* Messaging overlay */}
      {messagingRecipientId && profile && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ height: "min(620px, 90vh)" }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
              <span className="font-display tracking-wider text-sm">
                MESSAGE {(allUsers.find((u) => u.id === messagingRecipientId)?.full_name ?? "PLAYER").split(" ")[0].toUpperCase()}
              </span>
              <button
                onClick={() => setMessagingRecipientId(null)}
                className="h-7 w-7 rounded-full border border-border hover:bg-secondary flex items-center justify-center transition-colors"
              >
                <X size={13} weight="bold" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <MessagingPanel
                currentUserId={profile.id}
                allUsers={allUsers}
                initialRecipientId={messagingRecipientId}
                onUnreadChange={() => {}}
                compact
              />
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
