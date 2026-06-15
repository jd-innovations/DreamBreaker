"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  PaperPlaneRight, MagnifyingGlass, Plus, ArrowLeft,
  ChatCircle, Check, Checks,
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
  lastBody: string;
  lastAt: string | null;
  unread: number;
}

export interface UserProfile {
  id: string;
  full_name: string | null;
  role: string;
  avatar_url?: string | null;
}

export interface MessagingPanelProps {
  currentUserId: string;
  allUsers?: UserProfile[];
  initialRecipientId?: string;
  onUnreadChange?: (count: number) => void;
  compact?: boolean;
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
}: MessagingPanelProps) {
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
          .select("id,full_name,role,avatar_url")
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

  const panelHeight = compact ? "h-[520px]" : "h-[calc(100vh-160px)] min-h-[520px]";

  return (
    <div className={`flex ${panelHeight} rounded-2xl border border-border bg-card overflow-hidden`}>

      {/* ── Conversation list ── */}
      <div className={`flex flex-col border-r border-border bg-card flex-shrink-0 w-full md:w-72 lg:w-80 ${mobileShowThread ? "hidden md:flex" : "flex"}`}>

        {/* Header */}
        <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2 flex-shrink-0">
          <span className="font-display text-base tracking-wider">MESSAGES</span>
          <button onClick={() => { setShowNewConvo(true); setNewSearch(""); }}
            className="h-7 w-7 rounded-full border border-border hover:bg-secondary flex items-center justify-center transition-colors">
            <Plus size={13} weight="bold" />
          </button>
        </div>

        {/* Search */}
        {!showNewConvo && (
          <div className="px-3 py-2 border-b border-border flex-shrink-0">
            <div className="relative">
              <MagnifyingGlass size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…"
                className="w-full h-8 rounded-lg bg-secondary border-0 pl-8 pr-3 text-xs outline-none focus:ring-1 focus:ring-ring" />
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
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/60 transition-colors text-left">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-xs font-display text-primary">
                    {initials(u.full_name)}
                  </div>
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
            {filteredConvos.map((c) => (
              <button key={c.id} onClick={() => openConversation(c.id)}
                className={`w-full flex items-start gap-3 px-4 py-3 transition-colors text-left border-b border-border/30 last:border-0 ${selectedConvId === c.id ? "bg-primary/10" : "hover:bg-secondary/50"}`}>
                <div className="relative flex-shrink-0">
                  <div className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-display ${selectedConvId === c.id ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
                    {initials(c.otherName)}
                  </div>
                  {c.unread > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 rounded-full bg-primary text-[9px] font-mono text-primary-foreground flex items-center justify-center px-0.5">
                      {c.unread > 9 ? "9+" : c.unread}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-1">
                    <span className={`text-sm truncate ${c.unread > 0 ? "font-semibold text-foreground" : "font-medium"}`}>{c.otherName}</span>
                    {c.lastAt && <span className="text-[10px] text-muted-foreground flex-shrink-0">{timeAgo(c.lastAt)}</span>}
                  </div>
                  <div className={`text-xs truncate mt-0.5 ${c.unread > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                    {c.lastBody || <span className="italic opacity-50">No messages yet</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

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
            <div className="px-4 py-3 border-b border-border flex items-center gap-3 flex-shrink-0">
              <button onClick={() => { setMobileShowThread(false); }}
                className="md:hidden h-7 w-7 rounded-full hover:bg-secondary flex items-center justify-center flex-shrink-0">
                <ArrowLeft size={14} weight="bold" />
              </button>
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-xs font-display text-primary">
                {initials(selectedConv.otherName)}
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-sm truncate">{selectedConv.otherName}</div>
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
                const showTime = !prev || (new Date(m.created_at).getTime() - new Date(prev.created_at).getTime()) > 5 * 60 * 1000;
                const isLastMine = isMine && (i === messages.length - 1 || messages[i + 1]?.sender_id !== currentUserId);
                const sameAsPrev = prev && prev.sender_id === m.sender_id;

                return (
                  <div key={m.id}>
                    {showTime && (
                      <div className="text-center text-[10px] text-muted-foreground font-mono py-2">
                        {new Date(m.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </div>
                    )}
                    <div className={`flex ${isMine ? "justify-end" : "justify-start"} ${sameAsPrev && !showTime ? "mt-0.5" : "mt-2"}`}>
                      <div className={`max-w-[75%] px-3.5 py-2 text-sm leading-relaxed ${
                        isMine
                          ? "bg-primary text-primary-foreground rounded-2xl rounded-tr-sm"
                          : "bg-secondary text-foreground rounded-2xl rounded-tl-sm"
                      }`}>
                        {m.body}
                        {isLastMine && (
                          <div className="mt-1 flex justify-end text-primary-foreground/50">
                            {m.read_at ? <Checks size={11} /> : <Check size={11} />}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Compose */}
            <div className="px-4 py-3 border-t border-border flex-shrink-0">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message… (Enter to send)"
                  rows={1}
                  className="flex-1 rounded-xl bg-secondary border border-border px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
                  style={{ minHeight: "42px", maxHeight: "120px" }}
                  onInput={(e) => {
                    const el = e.target as HTMLTextAreaElement;
                    el.style.height = "auto";
                    el.style.height = Math.min(el.scrollHeight, 120) + "px";
                  }}
                />
                <button onClick={sendMessage} disabled={!body.trim() || sending}
                  className="h-10 w-10 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center transition-colors disabled:opacity-40 flex-shrink-0">
                  <PaperPlaneRight size={16} weight="fill" />
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5 px-1">Shift+Enter for new line</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
