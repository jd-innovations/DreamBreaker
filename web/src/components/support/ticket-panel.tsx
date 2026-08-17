"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  PaperPlaneRight, Ticket, Paperclip, CheckCircle,
} from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

// ── Types ────────────────────────────────────────────────────────────────────

type TicketStatus = "open" | "in_progress" | "resolved" | "closed";
type TicketCategory = "account" | "tournaments" | "partners_matches" | "payments" | "bug" | "feedback" | "other";

interface SupportTicketRow {
  id: string;
  user_id: string;
  conversation_id: string;
  subject: string;
  category: TicketCategory;
  status: TicketStatus;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  reporter_name?: string;
  reporter_avatar?: string | null;
}

interface TicketMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string | null;
  attachment_url: string | null;
  attachment_type: string | null;
  attachment_name: string | null;
  created_at: string;
}

const STATUS_TABS: { key: TicketStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In Progress" },
  { key: "resolved", label: "Resolved" },
  { key: "closed", label: "Closed" },
];

const STATUS_STYLE: Record<TicketStatus, string> = {
  open: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
  in_progress: "text-blue-400 border-blue-400/30 bg-blue-400/10",
  resolved: "text-muted-foreground border-border bg-secondary",
  closed: "text-muted-foreground border-border bg-secondary",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// ── Component ────────────────────────────────────────────────────────────────

export function TicketPanel({ currentUserId }: { currentUserId: string }) {
  const [tickets, setTickets] = useState<SupportTicketRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "all">("open");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadTickets = useCallback(async () => {
    setLoadingTickets(true);
    const supabase = createClient();
    const { data: rows } = await supabase
      .from("support_tickets")
      .select("id,user_id,conversation_id,subject,category,status,created_at,updated_at,resolved_at")
      .order("updated_at", { ascending: false });

    const ticketRows = (rows ?? []) as SupportTicketRow[];
    if (ticketRows.length > 0) {
      const userIds = [...new Set(ticketRows.map((t) => t.user_id))];
      const { data: profs } = await supabase.from("profiles").select("id,full_name,avatar_url").in("id", userIds);
      const profMap: Record<string, { full_name: string | null; avatar_url: string | null }> = {};
      for (const p of profs ?? []) profMap[p.id] = { full_name: p.full_name, avatar_url: p.avatar_url };
      setTickets(ticketRows.map((t) => ({
        ...t,
        reporter_name: profMap[t.user_id]?.full_name ?? "Unknown",
        reporter_avatar: profMap[t.user_id]?.avatar_url ?? null,
      })));
    } else {
      setTickets([]);
    }
    setLoadingTickets(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadTickets(); }, 0);
    return () => { window.clearTimeout(timer); };
  }, [loadTickets]);

  // Live-update the ticket list badge/order when a new ticket comes in.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("admin-support-tickets")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, () => loadTickets())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadTickets]);

  const selected = tickets.find((t) => t.id === selectedId) ?? null;
  const selectedConversationId = selected?.conversation_id ?? null;

  const loadThread = useCallback(async (conversationId: string) => {
    setLoadingThread(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("messages")
      .select("id,conversation_id,sender_id,body,attachment_url,attachment_type,attachment_name,created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    setMessages((data ?? []) as TicketMessage[]);
    setLoadingThread(false);
  }, []);

  useEffect(() => {
    if (!selectedConversationId) return;
    const timer = window.setTimeout(() => { void loadThread(selectedConversationId); }, 0);
    return () => { window.clearTimeout(timer); };
  }, [selectedConversationId, loadThread]);

  useEffect(() => {
    if (!selectedConversationId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`admin-ticket-thread:${selectedConversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${selectedConversationId}` },
        (payload) => {
          const msg = payload.new as TicketMessage;
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedConversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function handleSend() {
    if (!selected || !draft.trim() || sending) return;
    setSending(true);
    const supabase = createClient();
    const text = draft.trim();
    const { data: sent, error } = await supabase
      .from("messages")
      .insert({ conversation_id: selected.conversation_id, sender_id: currentUserId, body: text })
      .select("id,conversation_id,sender_id,body,attachment_url,attachment_type,attachment_name,created_at")
      .single();
    if (error) {
      toast.error("Could not send reply");
    } else if (sent) {
      setMessages((prev) => [...prev, sent as TicketMessage]);
      setDraft("");
      await supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", selected.conversation_id);
      if (selected.status === "open") await handleStatusChange("in_progress");
    }
    setSending(false);
  }

  async function handleStatusChange(status: TicketStatus) {
    if (!selected) return;
    setUpdatingStatus(true);
    const supabase = createClient();
    const patch: { status: TicketStatus; resolved_at?: string | null } = { status };
    patch.resolved_at = status === "resolved" ? new Date().toISOString() : null;
    const { error } = await supabase.from("support_tickets").update(patch).eq("id", selected.id);
    if (error) {
      toast.error("Could not update status");
    } else {
      setTickets((prev) => prev.map((t) => (t.id === selected.id ? { ...t, status, resolved_at: patch.resolved_at ?? null } : t)));
    }
    setUpdatingStatus(false);
  }

  const filtered = statusFilter === "all" ? tickets : tickets.filter((t) => t.status === statusFilter);

  return (
    <div className="flex-1 flex overflow-hidden border border-border rounded-xl bg-card">
      {/* List pane */}
      <div className="w-full sm:w-80 flex-shrink-0 border-r border-border flex flex-col overflow-hidden">
        <div className="flex items-center gap-1 p-2 border-b border-border overflow-x-auto">
          {STATUS_TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${statusFilter === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingTickets ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              <Ticket size={28} className="mx-auto mb-2 opacity-30" />
              No tickets
            </div>
          ) : (
            filtered.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className={`w-full text-left px-3 py-3 border-b border-border/60 transition-colors ${selectedId === t.id ? "bg-secondary" : "hover:bg-secondary/50"}`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-sm font-medium truncate">{t.subject}</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full border flex-shrink-0 ${STATUS_STYLE[t.status]}`}>{t.status}</span>
                </div>
                <div className="text-xs text-muted-foreground truncate">{t.reporter_name} · {fmtDate(t.updated_at)}</div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Thread pane */}
      <div className="hidden sm:flex flex-1 flex-col overflow-hidden">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            Select a ticket to view the thread
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 p-3 border-b border-border">
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{selected.subject}</div>
                <div className="text-xs text-muted-foreground">{selected.reporter_name} · {selected.category.replace("_", " ")}</div>
              </div>
              <select
                value={selected.status}
                disabled={updatingStatus}
                onChange={(e) => handleStatusChange(e.target.value as TicketStatus)}
                className="text-xs font-mono border border-border rounded-lg px-2 py-1.5 bg-background"
              >
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingThread ? (
                <div className="text-center text-sm text-muted-foreground">Loading…</div>
              ) : messages.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground">No messages yet</div>
              ) : (
                messages.map((m) => {
                  const isMine = m.sender_id === currentUserId;
                  return (
                    <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${isMine ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-secondary rounded-bl-sm"}`}>
                        {m.attachment_type === "image" && m.attachment_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.attachment_url} alt={m.attachment_name ?? "attachment"} className="rounded-lg max-w-full max-h-64" />
                        ) : m.attachment_type === "file" && m.attachment_url ? (
                          <a href={m.attachment_url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 underline">
                            <Paperclip size={14} />{m.attachment_name ?? "File"}
                          </a>
                        ) : (
                          <span>{m.body}</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {selected.status === "resolved" || selected.status === "closed" ? (
              <div className="flex items-center gap-2 p-3 border-t border-border text-xs text-muted-foreground">
                <CheckCircle size={14} />
                This ticket is {selected.status}. Reopen it above to keep replying.
              </div>
            ) : (
              <div className="flex items-center gap-2 p-3 border-t border-border">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder="Reply to this ticket…"
                  className="flex-1 text-sm border border-border rounded-xl px-3 py-2 bg-background"
                />
                <button
                  onClick={handleSend}
                  disabled={!draft.trim() || sending}
                  className="p-2 rounded-xl bg-primary text-primary-foreground disabled:opacity-40"
                >
                  <PaperPlaneRight size={16} weight="fill" />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
