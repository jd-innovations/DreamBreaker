"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function NotificationBell({ userId }: { userId: string }) {
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const supabaseRef = useRef(createClient());

  const unread = items.filter((n) => !n.read_at).length;

  const load = useCallback(async () => {
    const supabase = supabaseRef.current;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("notifications")
      .select("id,type,title,body,link,read_at,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);
    setItems((data ?? []) as Notification[]);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  // Realtime: prepend new notifications as they arrive
  useEffect(() => {
    const supabase = supabaseRef.current;
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => setItems((prev) => [payload.new as Notification, ...prev]))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  const markRead = async (ids: string[]) => {
    if (ids.length === 0) return;
    setItems((prev) => prev.map((n) => ids.includes(n.id) ? { ...n, read_at: new Date().toISOString() } : n));
    const supabase = supabaseRef.current;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids);
  };

  const onClickItem = async (n: Notification) => {
    if (!n.read_at) await markRead([n.id]);
    setOpen(false);
    if (n.link) router.push(n.link);
  };

  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} title="Notifications"
        className="h-9 w-9 rounded-full border border-border hover:bg-secondary flex items-center justify-center transition-colors relative">
        <Bell size={15} weight={unread > 0 ? "fill" : "regular"} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-mono flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-50 w-80 max-w-[calc(100vw-2rem)] bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="font-display tracking-wider text-sm">NOTIFICATIONS</span>
              {unread > 0 && (
                <button onClick={() => markRead(items.filter((n) => !n.read_at).map((n) => n.id))}
                  className="text-[11px] font-mono text-primary hover:underline flex items-center gap-1">
                  <Check size={11} weight="bold" /> Mark all read
                </button>
              )}
            </div>
            <div className="max-h-[380px] overflow-y-auto">
              {items.length === 0 ? (
                <div className="px-4 py-10 text-center text-muted-foreground">
                  <Bell size={26} weight="duotone" className="mx-auto mb-2 text-primary" />
                  <p className="text-sm">No notifications yet.</p>
                </div>
              ) : (
                items.map((n) => (
                  <button key={n.id} onClick={() => onClickItem(n)}
                    className={`w-full text-left px-4 py-3 border-b border-border/50 last:border-0 hover:bg-secondary/60 transition-colors flex gap-3 ${n.read_at ? "" : "bg-primary/5"}`}>
                    <span className={`mt-1.5 h-2 w-2 rounded-full flex-shrink-0 ${n.read_at ? "bg-transparent" : "bg-primary"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm truncate">{n.title}</span>
                        <span className="text-[10px] font-mono text-muted-foreground flex-shrink-0">{timeAgo(n.created_at)}</span>
                      </div>
                      {n.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
