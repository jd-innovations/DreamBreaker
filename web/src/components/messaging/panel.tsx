"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  PaperPlaneRight, MagnifyingGlass, PencilSimpleLine, ArrowLeft,
  ChatCircle, Checks, Heart, Flag, Warning, Prohibit,
} from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────────────────

interface DBMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

interface DBConversation {
  id: string;
  participant_a: string;
  participant_b: string;
  last_message_at: string | null;
  created_at: string;
}

interface Conversation {
  id: string;
  otherId: string;
  otherName: string;
  otherRole: string;
  otherAvatar: string | null;
  otherDupr: number | null;
  otherSkill: string | null;
  lastBody: string;
  lastAt: string | null;
  unread: number;
}

export interface UserProfile {
  id: string;
  full_name: string | null;
  role: string;
  avatar_url?: string | null;
  dupr?: number | null;
  skill_level?: string | null;
}

export interface MatchSummary {
  id: string;
  name: string;
  avatar: string | null;
  dupr?: number | null;
  skill?: string | null;
}

export interface MessagingPanelProps {
  currentUserId: string;
  allUsers?: UserProfile[];
  initialRecipientId?: string;
  onUnreadChange?: (count: number) => void;
  compact?: boolean;
  /** When provided, renders the Tinder-style NEW MATCHES strip (player context). */
  matches?: MatchSummary[];
  /** Count shown on the likes tile in the matches strip. */
  likesCount?: number;
}

// "Name, 4.2" — DUPR if available, else self-rated skill band.
function metaLabel(dupr: number | null | undefined, skill: string | null | undefined) {
  if (dupr != null) return String(dupr);
  if (skill) return skill;
  return null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function initials(name: string | null) {
  if (!name) return "?";
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

// Stable gradient per name so avatars feel colorful like Instagram.
const GRADIENTS = [
  "from-fuchsia-500 to-orange-400",
  "from-sky-500 to-indigo-500",
  "from-emerald-500 to-teal-400",
  "from-rose-500 to-pink-500",
  "from-violet-500 to-purple-500",
  "from-amber-500 to-red-500",
];
function gradientFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}

function Avatar({ name, url, seed, size = 48, ring = false, online = false }: { name: string | null; url?: string | null; seed: string; size?: number; ring?: boolean; online?: boolean }) {
  const inner = url ? (
    <img src={url} alt="" className="rounded-full object-cover h-full w-full" style={{ width: size, height: size }} />
  ) : (
    <div className={`rounded-full flex items-center justify-center text-white font-display bg-gradient-to-tr ${gradientFor(seed)}`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {initials(name)}
    </div>
  );
  return (
    <div className="relative flex-shrink-0" style={{ width: ring ? size + 6 : size, height: ring ? size + 6 : size }}>
      {ring ? (
        <div className="rounded-full p-[2.5px] bg-gradient-to-tr from-primary to-fuchsia-500 h-full w-full flex items-center justify-center">
          <div className="rounded-full bg-card p-[1.5px]">{inner}</div>
        </div>
      ) : inner}
      {online && (
        <span className="absolute bottom-0 right-0 rounded-full bg-emerald-500 border-2 border-card"
          style={{ height: Math.max(10, size * 0.24), width: Math.max(10, size * 0.24) }} />
      )}
    </div>
  );
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yest)) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

const ROLE_BADGE: Record<string, string> = {
  admin: "text-yellow-400",
  director: "text-blue-400",
  player_director: "text-purple-400",
  player: "text-muted-foreground",
};

// ── Panel ──────────────────────────────────────────────────────────────────────

export function MessagingPanel({
  currentUserId,
  allUsers = [],
  initialRecipientId,
  onUnreadChange,
  compact = false,
  matches: matchesProp,
  likesCount: likesCountProp = 0,
}: MessagingPanelProps) {
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [profileCache, setProfileCache] = useState<Record<string, UserProfile>>({});
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DBMessage[]>([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const [showNewConvo, setShowNewConvo] = useState(false);
  const [newSearch, setNewSearch] = useState("");
  const [loadingConvos, setLoadingConvos] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [mobileShowThread, setMobileShowThread] = useState(false);
  // Self-loaded matches when parent doesn't supply them
  const [internalMatches, setInternalMatches] = useState<MatchSummary[]>([]);
  const [internalLikes, setInternalLikes] = useState(0);
  const [flagMenuConvId, setFlagMenuConvId] = useState<string | null>(null);
  const [flagMenuPos, setFlagMenuPos] = useState<{ top: number; right: number } | null>(null);

  // Use prop if provided, otherwise self-loaded
  const matches = matchesProp ?? internalMatches;
  const likesCount = matchesProp !== undefined ? likesCountProp : internalLikes;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const supabase = createClient();

  const selectedConv = conversations.find((c) => c.id === selectedConvId) ?? null;

  // ── Load conversations ──────────────────────────────────────────────────────

  const loadConversations = useCallback(async () => {
    if (!currentUserId) return;
    // loadingConvos initializes to true; refetches run in the background.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: convRows } = await (supabase as any)
        .from("conversations")
        .select("id,participant_a,participant_b,last_message_at,created_at")
        .or(`participant_a.eq.${currentUserId},participant_b.eq.${currentUserId}`)
        .order("last_message_at", { ascending: false, nullsFirst: false });

      if (!convRows || convRows.length === 0) {
        setConversations([]);
        onUnreadChange?.(0);
        setLoadingConvos(false);
        return;
      }

      const rows = convRows as DBConversation[];

      // Collect other participant IDs
      const otherIds = [...new Set(rows.map((c) =>
        c.participant_a === currentUserId ? c.participant_b : c.participant_a
      ))];

      // Load profiles we don't have cached yet
      const missingIds = otherIds.filter((id) => !profileCache[id]);
      const pMap: Record<string, UserProfile> = { ...profileCache };
      if (missingIds.length > 0) {
        const { data: profs } = await supabase.from("profiles")
          .select("id,full_name,role,avatar_url,dupr,skill_level")
          .in("id", missingIds);
        for (const p of profs ?? []) pMap[p.id] = p as UserProfile;
        setProfileCache(pMap);
      }

      // Load recent messages for all conversations
      const convIds = rows.map((c) => c.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: allMsgs } = await (supabase as any)
        .from("messages")
        .select("id,conversation_id,sender_id,body,read_at,created_at")
        .in("conversation_id", convIds)
        .order("created_at", { ascending: false });

      const msgList = (allMsgs ?? []) as DBMessage[];

      const built: Conversation[] = rows.map((c) => {
        const otherId = c.participant_a === currentUserId ? c.participant_b : c.participant_a;
        const msgs = msgList.filter((m) => m.conversation_id === c.id);
        const last = msgs[0];
        const unread = msgs.filter((m) => m.sender_id !== currentUserId && !m.read_at).length;
        return {
          id: c.id,
          otherId,
          otherName: pMap[otherId]?.full_name ?? "Unknown",
          otherRole: pMap[otherId]?.role ?? "player",
          otherAvatar: pMap[otherId]?.avatar_url ?? null,
          otherDupr: pMap[otherId]?.dupr ?? null,
          otherSkill: pMap[otherId]?.skill_level ?? null,
          lastBody: last?.body ?? "",
          lastAt: last?.created_at ?? c.last_message_at,
          unread,
        };
      });

      setConversations(built);
      onUnreadChange?.(built.reduce((s, c) => s + c.unread, 0));
    } finally {
      setLoadingConvos(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // ── Self-load mutual matches when parent doesn't supply them ───────────────
  useEffect(() => {
    if (matchesProp !== undefined || !currentUserId) return;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: mutual } = await (supabase as any)
        .from("v_mutual_matches")
        .select("player_a,player_b")
        .or(`player_a.eq.${currentUserId},player_b.eq.${currentUserId}`);

      const matchIds = (mutual ?? [])
        .map((m: { player_a: string; player_b: string }) =>
          m.player_a === currentUserId ? m.player_b : m.player_a)
        .filter(Boolean) as string[];

      if (matchIds.length > 0) {
        const { data: mp } = await supabase
          .from("profiles")
          .select("id,full_name,avatar_url,dupr,skill_level")
          .in("id", matchIds);
        setInternalMatches(
          (mp ?? []).map((p) => ({
            id: p.id,
            name: p.full_name ?? "Player",
            avatar: p.avatar_url,
            dupr: p.dupr,
            skill: p.skill_level,
          }))
        );
      }

      // Incoming likes count (people who liked me that I haven't swiped on)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: mySwipes } = await (supabase as any)
        .from("matchmaking_swipes")
        .select("target_id")
        .eq("requester_id", currentUserId);
      const swipedSet = new Set((mySwipes ?? []).map((s: { target_id: string }) => s.target_id));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: incoming } = await (supabase as any)
        .from("matchmaking_swipes")
        .select("requester_id")
        .eq("target_id", currentUserId)
        .eq("direction", "like");
      setInternalLikes(
        new Set(
          (incoming ?? [])
            .map((s: { requester_id: string }) => s.requester_id)
            .filter((id: string) => !swipedSet.has(id))
        ).size
      );
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, matchesProp]);

  // ── Real-time ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel(`messaging:${currentUserId}:${Math.random()}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, async (payload) => {
        const msg = payload.new as DBMessage;
        loadConversations();

        if (msg.conversation_id === selectedConvId) {
          setMessages((prev) => prev.find((m) => m.id === msg.id) ? prev : [...prev, msg]);
          if (msg.sender_id !== currentUserId) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any).from("messages").update({ read_at: new Date().toISOString() }).eq("id", msg.id);
          }
        } else if (msg.sender_id !== currentUserId) {
          const senderName = profileCache[msg.sender_id]?.full_name ?? allUsers.find((u) => u.id === msg.sender_id)?.full_name ?? "Someone";
          toast(`💬 ${senderName}`, { description: msg.body.slice(0, 80) });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, selectedConvId]);

  // ── Presence (active-now green dots) ─────────────────────────────────────────
  useEffect(() => {
    if (!currentUserId) return;
    const channel = supabase.channel("presence:messaging", {
      config: { presence: { key: currentUserId } },
    });
    channel
      .on("presence", { event: "sync" }, () => {
        setOnlineIds(new Set(Object.keys(channel.presenceState())));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") await channel.track({ online_at: new Date().toISOString() });
      });
    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Open conversation ──────────────────────────────────────────────────────

  const openConversation = async (convId: string) => {
    setSelectedConvId(convId);
    setMobileShowThread(true);
    setLoadingMessages(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("messages")
        .select("id,conversation_id,sender_id,body,read_at,created_at")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: true });
      setMessages((data ?? []) as DBMessage[]);

      const unreadIds = ((data ?? []) as DBMessage[])
        .filter((m) => m.sender_id !== currentUserId && !m.read_at)
        .map((m) => m.id);
      if (unreadIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("messages").update({ read_at: new Date().toISOString() }).in("id", unreadIds);
        setConversations((prev) => {
          const updated = prev.map((c) => c.id === convId ? { ...c, unread: 0 } : c);
          onUnreadChange?.(updated.reduce((s, c) => s + c.unread, 0));
          return updated;
        });
      }
    } finally {
      setLoadingMessages(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  // ── Start or open conversation ─────────────────────────────────────────────

  const startOrOpenConversation = async (otherId: string) => {
    const existing = conversations.find((c) => c.otherId === otherId);
    if (existing) { openConversation(existing.id); setShowNewConvo(false); return; }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("conversations")
      .insert({ participant_a: currentUserId, participant_b: otherId })
      .select("id,participant_a,participant_b,last_message_at,created_at")
      .single();

    if (error || !data) { toast.error("Could not start conversation."); return; }

    const otherProfile = allUsers.find((u) => u.id === otherId) ?? profileCache[otherId];
    const newConv: Conversation = {
      id: (data as DBConversation).id,
      otherId,
      otherName: otherProfile?.full_name ?? "Unknown",
      otherRole: otherProfile?.role ?? "player",
      otherAvatar: otherProfile?.avatar_url ?? null,
      otherDupr: otherProfile?.dupr ?? null,
      otherSkill: otherProfile?.skill_level ?? null,
      lastBody: "",
      lastAt: null,
      unread: 0,
    };
    setConversations((prev) => [newConv, ...prev]);
    if (otherProfile) setProfileCache((prev) => ({ ...prev, [otherId]: otherProfile }));
    setShowNewConvo(false);
    openConversation((data as DBConversation).id);
  };

  // Open initial recipient (declared after startOrOpenConversation so it is
  // not referenced before its declaration)
  useEffect(() => {
    if (initialRecipientId && currentUserId && conversations.length >= 0 && !loadingConvos) {
      // Intentional one-time open of the pre-selected conversation once
      // conversations have loaded; not a cascading-render concern.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      startOrOpenConversation(initialRecipientId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRecipientId, loadingConvos]);

  // ── Report / Block ─────────────────────────────────────────────────────────

  const reportUser = async (conv: Conversation) => {
    setFlagMenuConvId(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("user_reports").insert({
        reporter_id: currentUserId,
        reported_id: conv.otherId,
        conversation_id: conv.id,
        reason: "spam_or_inappropriate",
      });
    } catch (_) { /* table may not exist yet — silent */ }
    toast.success(`Report submitted for ${conv.otherName}.`);
  };

  const blockUser = async (conv: Conversation) => {
    setFlagMenuConvId(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("blocked_users").insert({
        blocker_id: currentUserId,
        blocked_id: conv.otherId,
      });
    } catch (_) { /* table may not exist yet — silent */ }
    setConversations((prev) => prev.filter((c) => c.id !== conv.id));
    if (selectedConvId === conv.id) setSelectedConvId(null);
    toast.success(`${conv.otherName} has been blocked.`);
  };

  // ── Send ───────────────────────────────────────────────────────────────────

  const sendMessage = async () => {
    if (!body.trim() || !selectedConvId || sending) return;
    setSending(true);
    const text = body.trim();
    setBody("");
    // Optimistic update
    const tempMsg: DBMessage = {
      id: `temp-${Date.now()}`,
      conversation_id: selectedConvId,
      sender_id: currentUserId,
      body: text,
      read_at: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempMsg]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: inserted, error } = await (supabase as any)
      .from("messages")
      .insert({ conversation_id: selectedConvId, sender_id: currentUserId, body: text })
      .select("id,conversation_id,sender_id,body,read_at,created_at")
      .single();

    if (error) {
      toast.error("Failed to send.");
      setMessages((prev) => prev.filter((m) => m.id !== tempMsg.id));
      setBody(text);
      setSending(false);
      return;
    }

    // Replace temp message with real one
    setMessages((prev) => prev.map((m) => m.id === tempMsg.id ? (inserted as DBMessage) : m));

    // Update conversation last_message_at + lastBody
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", selectedConvId);
    setConversations((prev) => prev.map((c) => c.id === selectedConvId ? { ...c, lastBody: text, lastAt: new Date().toISOString() } : c));

    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  // ── Filtered ───────────────────────────────────────────────────────────────

  const filteredConvos = conversations.filter((c) =>
    !search || c.otherName.toLowerCase().includes(search.toLowerCase())
  );

  const newConvoUsers = allUsers.filter((u) =>
    u.id !== currentUserId &&
    (!newSearch || (u.full_name ?? "").toLowerCase().includes(newSearch.toLowerCase()))
  );

  const panelHeight = compact ? "h-[520px]" : "h-[calc(100svh-160px)] min-h-[520px]";

  return (
    <div className={`flex ${panelHeight} rounded-2xl border border-border bg-card overflow-hidden`}>

      {/* ── Conversation list ── */}
      <div className={`flex flex-col border-r border-border bg-card flex-shrink-0 w-full md:w-72 lg:w-80 ${mobileShowThread ? "hidden md:flex" : "flex"}`}>

        {/* Header */}
        <div className="px-4 py-3.5 flex items-center justify-between gap-2 flex-shrink-0">
          <span className="font-display text-xl tracking-wide">Messages</span>
          <button onClick={() => { setShowNewConvo(true); setNewSearch(""); }} title="New message"
            className="h-9 w-9 rounded-full hover:bg-secondary flex items-center justify-center transition-colors">
            <PencilSimpleLine size={18} weight="bold" />
          </button>
        </div>

        {/* Search */}
        {!showNewConvo && (
          <div className="px-3 pb-2.5 flex-shrink-0">
            <div className="relative">
              <MagnifyingGlass size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search"
                className="w-full h-9 rounded-full bg-secondary border-0 pl-9 pr-3 text-sm outline-none focus:ring-1 focus:ring-ring" />
            </div>
          </div>
        )}

        {/* New conversation */}
        {showNewConvo && (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="px-3 py-2 border-b border-border flex items-center gap-2 flex-shrink-0">
              <button onClick={() => setShowNewConvo(false)} className="h-6 w-6 rounded-full hover:bg-secondary flex items-center justify-center">
                <ArrowLeft size={12} weight="bold" />
              </button>
              <span className="text-xs font-mono text-muted-foreground">NEW CONVERSATION</span>
            </div>
            <div className="px-3 py-2 flex-shrink-0">
              <input value={newSearch} onChange={(e) => setNewSearch(e.target.value)} placeholder="Search users…" autoFocus
                className="w-full h-8 rounded-lg bg-secondary border-0 px-3 text-xs outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div className="flex-1 overflow-y-auto">
              {newConvoUsers.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6 px-4">
                  {newSearch ? "No users found." : "No users to message."}
                </p>
              )}
              {newConvoUsers.map((u) => (
                <button key={u.id} onClick={() => startOrOpenConversation(u.id)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/60 transition-colors text-left">
                  <Avatar name={u.full_name} url={u.avatar_url} seed={u.id} size={44} />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{u.full_name ?? "Unknown"}</div>
                    <div className={`text-[10px] font-mono ${ROLE_BADGE[u.role] ?? "text-muted-foreground"}`}>{u.role.toUpperCase()}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Conversation list */}
        {!showNewConvo && (
          <div className="flex-1 overflow-y-auto">
            {/* NEW MATCHES strip — player context only */}
            {matches && (matches.length > 0 || likesCount > 0) && (
              <div className="px-4 pt-1 pb-3">
                <div className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground mb-3">NEW MATCHES</div>
                <div className="flex gap-4 overflow-x-auto pb-1 scrollbar-hide">
                  {likesCount > 0 && (
                    <Link href="/matchmaking" className="flex flex-col items-center gap-1.5 flex-shrink-0">
                      <div className="h-[58px] w-[58px] rounded-full bg-gradient-to-br from-primary to-fuchsia-600 flex items-center justify-center shadow-lg shadow-primary/30">
                        <Heart size={24} weight="fill" className="text-white" />
                      </div>
                      <span className="text-[11px] font-semibold text-primary">{likesCount > 99 ? "99+" : likesCount}</span>
                    </Link>
                  )}
                  {matches.map((mt) => (
                    <button key={mt.id} onClick={() => startOrOpenConversation(mt.id)} className="flex flex-col items-center gap-1.5 flex-shrink-0 w-[58px]">
                      <Avatar name={mt.name} url={mt.avatar} seed={mt.id} size={52} ring online={onlineIds.has(mt.id)} />
                      <span className="text-[11px] truncate w-full text-center">{mt.name.split(" ")[0]}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {matches && (matches.length > 0 || likesCount > 0) && !loadingConvos && filteredConvos.length > 0 && (
              <div className="px-4 pb-1.5 font-mono text-[10px] tracking-[0.2em] text-muted-foreground">CONVERSATIONS</div>
            )}

            {loadingConvos && (
              <div className="flex justify-center py-12">
                <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              </div>
            )}
            {!loadingConvos && filteredConvos.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center gap-2">
                <ChatCircle size={32} className="text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No conversations yet.</p>
                <button onClick={() => { setShowNewConvo(true); setNewSearch(""); }} className="text-xs text-primary font-mono hover:underline">
                  Start one →
                </button>
              </div>
            )}
            {filteredConvos.map((c) => {
              const meta = metaLabel(c.otherDupr, c.otherSkill);
              const menuOpen = flagMenuConvId === c.id;
              return (
                <div key={c.id} className="relative">
                  <button onClick={() => openConversation(c.id)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 pr-10 transition-colors text-left ${selectedConvId === c.id ? "bg-secondary" : "hover:bg-secondary/40"}`}>
                    <Avatar name={c.otherName} url={c.otherAvatar} seed={c.otherId} size={56} online={onlineIds.has(c.otherId)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-[15px] truncate ${c.unread > 0 ? "font-bold text-foreground" : "font-semibold"}`}>
                          {c.otherName}{meta ? <span className="text-muted-foreground font-normal">, {meta}</span> : null}
                        </span>
                        {c.lastAt && <span className="text-[12px] text-muted-foreground flex-shrink-0">{timeAgo(c.lastAt)}</span>}
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <span className={`text-[13px] truncate ${c.unread > 0 ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                          {c.lastBody || <span className="italic opacity-50">No messages yet</span>}
                        </span>
                        {c.unread > 0 && (
                          <span className="h-5 min-w-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                            {c.unread > 9 ? "9+" : c.unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Flag button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (menuOpen) { setFlagMenuConvId(null); setFlagMenuPos(null); return; }
                      const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                      setFlagMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                      setFlagMenuConvId(c.id);
                    }}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full flex items-center justify-center transition-colors ${menuOpen ? "text-destructive bg-destructive/10" : "text-muted-foreground hover:text-destructive hover:bg-destructive/10"}`}
                    title="Report or block"
                  >
                    <Flag size={14} weight={menuOpen ? "fill" : "regular"} />
                  </button>

                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Flag dropdown (fixed, escapes overflow-hidden) ── */}
      {flagMenuConvId && flagMenuPos && (() => {
        const conv = conversations.find((c) => c.id === flagMenuConvId);
        if (!conv) return null;
        return (
          <>
            <div className="fixed inset-0 z-40" onClick={() => { setFlagMenuConvId(null); setFlagMenuPos(null); }} />
            <div
              className="fixed z-50 w-44 rounded-xl border border-border bg-card shadow-xl overflow-hidden"
              style={{ top: flagMenuPos.top, right: flagMenuPos.right }}
            >
              <button
                onClick={() => { reportUser(conv); setFlagMenuPos(null); }}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-amber-400 hover:bg-amber-400/10 transition-colors"
              >
                <Warning size={15} weight="fill" /> Report user
              </button>
              <div className="h-px bg-border" />
              <button
                onClick={() => { blockUser(conv); setFlagMenuPos(null); }}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Prohibit size={15} weight="fill" /> Block user
              </button>
            </div>
          </>
        );
      })()}

      {/* ── Message thread ── */}
      <div className={`flex-1 flex flex-col min-w-0 ${!mobileShowThread ? "hidden md:flex" : "flex"}`}>
        {!selectedConv ? (
          <div className="flex-1 flex items-center justify-center flex-col gap-3 text-center px-6">
            <ChatCircle size={40} className="text-muted-foreground" />
            <p className="font-display text-xl tracking-wide text-muted-foreground">SELECT A CONVERSATION</p>
            <p className="text-xs text-muted-foreground">Or press + to start a new one</p>
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div className="px-3 py-2.5 border-b border-border flex items-center gap-3 flex-shrink-0 bg-card/60 backdrop-blur">
              <button onClick={() => { setMobileShowThread(false); }}
                className="md:hidden h-8 w-8 rounded-full hover:bg-secondary flex items-center justify-center flex-shrink-0">
                <ArrowLeft size={18} weight="bold" />
              </button>
              <Avatar name={selectedConv.otherName} url={selectedConv.otherAvatar} seed={selectedConv.otherId} size={38} />
              <div className="min-w-0">
                <div className="font-semibold text-sm truncate leading-tight">{selectedConv.otherName}</div>
                <div className={`text-[10px] font-mono ${ROLE_BADGE[selectedConv.otherRole] ?? "text-muted-foreground"}`}>
                  {selectedConv.otherRole.replace("_", " ").toUpperCase()}
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
              {loadingMessages && (
                <div className="flex justify-center py-8">
                  <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                </div>
              )}
              {!loadingMessages && messages.length === 0 && (
                <div className="flex items-center justify-center h-full">
                  <p className="text-sm text-muted-foreground">No messages yet — say hi!</p>
                </div>
              )}
              {messages.map((m, i) => {
                const isMine = m.sender_id === currentUserId;
                const prev = messages[i - 1];
                const next = messages[i + 1];
                const newDay = !prev || new Date(m.created_at).toDateString() !== new Date(prev.created_at).toDateString();
                const sameAsPrev = prev && prev.sender_id === m.sender_id && !newDay;
                const isGroupEnd = !next || next.sender_id !== m.sender_id || new Date(next.created_at).toDateString() !== new Date(m.created_at).toDateString();
                const isLastMine = isMine && (i === messages.length - 1 || messages[i + 1]?.sender_id !== currentUserId);

                return (
                  <div key={m.id}>
                    {newDay && (
                      <div className="flex justify-center py-3">
                        <span className="text-[10px] font-mono tracking-widest text-muted-foreground bg-secondary/70 rounded-full px-3 py-1">
                          {dayLabel(m.created_at)}
                        </span>
                      </div>
                    )}
                    <div className={`flex items-end gap-2 ${isMine ? "justify-end" : "justify-start"} ${sameAsPrev ? "mt-0.5" : "mt-2.5"}`}>
                      {/* incoming avatar on last bubble of a group */}
                      {!isMine && (
                        isGroupEnd
                          ? <Avatar name={selectedConv.otherName} url={selectedConv.otherAvatar} seed={selectedConv.otherId} size={26} />
                          : <div className="w-[26px] flex-shrink-0" />
                      )}
                      <div className={`max-w-[72%] px-3.5 py-2 text-sm leading-relaxed break-words ${
                        isMine
                          ? `bg-gradient-to-br from-primary to-fuchsia-600 text-primary-foreground rounded-3xl ${isGroupEnd ? "rounded-br-md" : ""}`
                          : `bg-secondary text-foreground rounded-3xl ${isGroupEnd ? "rounded-bl-md" : ""}`
                      }`}>
                        {m.body}
                      </div>
                    </div>
                    {isLastMine && (
                      <div className="flex justify-end items-center gap-1 mt-1 pr-1 text-[10px] text-muted-foreground">
                        {m.read_at ? <><Checks size={12} weight="bold" className="text-primary" /> Seen</> : <span>Sent</span>}
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Compose */}
            <div className="px-3 py-3 border-t border-border flex-shrink-0">
              <div className="flex items-end gap-2 bg-secondary rounded-3xl pl-4 pr-1.5 py-1.5 focus-within:ring-2 focus-within:ring-ring transition-shadow">
                <textarea
                  ref={inputRef}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Message…"
                  rows={1}
                  className="flex-1 bg-transparent border-0 text-sm outline-none resize-none py-1.5"
                  style={{ minHeight: "28px", maxHeight: "120px" }}
                  onInput={(e) => {
                    const el = e.target as HTMLTextAreaElement;
                    el.style.height = "auto";
                    el.style.height = Math.min(el.scrollHeight, 120) + "px";
                  }}
                />
                <button onClick={sendMessage} disabled={!body.trim() || sending}
                  className="h-9 w-9 rounded-full bg-gradient-to-br from-primary to-fuchsia-600 text-primary-foreground hover:opacity-90 flex items-center justify-center transition-opacity disabled:opacity-30 flex-shrink-0">
                  <PaperPlaneRight size={16} weight="fill" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
