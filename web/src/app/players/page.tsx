"use client";

// Web user directory — /players. The web half of the app's directory
// (apps/mobile/src/app/match/directory.tsx, connections.tsx), owner-approved
// 2026-09-22:
//
//   Search       anyone discoverable, by name or @handle (search_players)
//   Map          home courts and cities with player counts — never a precise
//                location; hidden until the Google Maps key exists
//   Connections  mutual connections, All / Recent
//   Contacts     players you saved privately; Remove
//
// Requests stay in /matchmaking, where web already has them. Message opens the
// shared messaging panel — messaging is open (recipient controls: block,
// report; 30 new conversations a day, enforced server-side).
//
// Signed-in only: the layout redirects signed-out visitors.

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MagnifyingGlass, X } from "@phosphor-icons/react";
import { PageShell } from "@/components/layout/page-shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { INPUT_TEXT } from "@/components/ui/field-classes";
import { MessagingPanel, type UserProfile as MessagingUserProfile } from "@/components/messaging/panel";
import { PlayerRow } from "@/components/players/player-row";
import { PlayersMap, playersMapAvailable } from "@/components/players/players-map";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  fetchConnections, fetchContacts, MIN_DIRECTORY_QUERY, RECENT_MS, removeContact, searchDirectory,
  type DirectoryPlayer,
} from "@/lib/players/directory";

type Tab = "search" | "map" | "connections" | "contacts";

export default function PlayersPage() {
  const [me, setMe] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("search");
  const [messaging, setMessaging] = useState<DirectoryPlayer | null>(null);

  useEffect(() => {
    void createClient().auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

  const mapOn = playersMapAvailable();

  return (
    <PageShell>
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="font-display text-4xl tracking-wide">Players</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Find players, see your connections and contacts, and start a conversation.
        </p>

        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="mt-6">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="search">Search</TabsTrigger>
            {mapOn && <TabsTrigger value="map">Map</TabsTrigger>}
            <TabsTrigger value="connections">Connections</TabsTrigger>
            <TabsTrigger value="contacts">Contacts</TabsTrigger>
          </TabsList>

          <TabsContent value="search" className="mt-4">
            <SearchTab onMessage={setMessaging} />
          </TabsContent>
          {mapOn && (
            <TabsContent value="map" className="mt-4">
              <PlayersMap onMessage={setMessaging} />
            </TabsContent>
          )}
          <TabsContent value="connections" className="mt-4">
            {me && <ConnectionsTab me={me} onMessage={setMessaging} />}
          </TabsContent>
          <TabsContent value="contacts" className="mt-4">
            {me && <ContactsTab me={me} onMessage={setMessaging} />}
          </TabsContent>
        </Tabs>
      </div>

      {messaging && me && (
        <MessageOverlay me={me} player={messaging} onClose={() => setMessaging(null)} />
      )}
    </PageShell>
  );
}

// ─── Search ─────────────────────────────────────────────────────────────────

function SearchTab({ onMessage }: { onMessage: (p: DirectoryPlayer) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DirectoryPlayer[]>([]);
  const [searched, setSearched] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  // Debounced; only the latest request's answer is shown.
  useEffect(() => {
    const term = query.trim();
    if (term.length < MIN_DIRECTORY_QUERY) return;
    const mine = ++seq.current;
    const t = setTimeout(() => {
      setLoading(true);
      void searchDirectory(term).then((r) => {
        if (mine !== seq.current) return;
        setLoading(false);
        setSearched(term);
        if (!r.ok) { setError(r.message); setResults([]); return; }
        setError(null);
        setResults(r.data);
      });
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const short = query.trim().length < MIN_DIRECTORY_QUERY;

  return (
    <div className="space-y-4">
      <div className="relative">
        <Label htmlFor="players-q" className="sr-only">Search players</Label>
        <MagnifyingGlass size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          id="players-q"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or @handle"
          autoComplete="off"
          className={cn(INPUT_TEXT, "pl-9 pr-9")}
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {short ? (
        <p className="text-sm text-muted-foreground">
          Type at least {MIN_DIRECTORY_QUERY} letters of a name or handle. Only players who allow discovery appear.
        </p>
      ) : loading && searched !== query.trim() ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">Searching…</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : results.length === 0 ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">No players match &ldquo;{query.trim()}&rdquo;.</p>
      ) : (
        <ul className="space-y-2" aria-live="polite">
          {results.map((p) => <PlayerRow key={p.id} player={p} onMessage={onMessage} />)}
        </ul>
      )}
    </div>
  );
}

// ─── Connections ────────────────────────────────────────────────────────────

function ConnectionsTab({ me, onMessage }: { me: string; onMessage: (p: DirectoryPlayer) => void }) {
  const [rows, setRows] = useState<DirectoryPlayer[] | null>(null);
  const [recentOnly, setRecentOnly] = useState(false);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    void fetchConnections(me).then((r) => {
      if (!r.ok) { toast.error(r.message); setRows([]); return; }
      setRows(r.data);
    });
  }, [me]);

  const shown = (rows ?? []).filter((c) => !recentOnly || (c.since && now - new Date(c.since).getTime() < RECENT_MS));

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-md border border-border bg-card p-1" role="group" aria-label="Show">
        <Button type="button" size="sm" variant={recentOnly ? "ghost" : "secondary"} onClick={() => setRecentOnly(false)} aria-pressed={!recentOnly}>All</Button>
        <Button type="button" size="sm" variant={recentOnly ? "secondary" : "ghost"} onClick={() => setRecentOnly(true)} aria-pressed={recentOnly}>Recent</Button>
      </div>
      {rows === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {recentOnly ? "No new connections this week." : "No connections yet. You connect when you and another player both like each other in Matchmaking."}
        </p>
      ) : (
        <ul className="space-y-2">
          {shown.map((p) => <PlayerRow key={p.id} player={p} onMessage={onMessage} />)}
        </ul>
      )}
    </div>
  );
}

// ─── Contacts ───────────────────────────────────────────────────────────────

function ContactsTab({ me, onMessage }: { me: string; onMessage: (p: DirectoryPlayer) => void }) {
  const [rows, setRows] = useState<DirectoryPlayer[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetchContacts(me);
    if (!r.ok) { toast.error(r.message); setRows([]); return; }
    setRows(r.data);
  }, [me]);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  async function remove(p: DirectoryPlayer) {
    if (!window.confirm(`Remove ${p.name} from your contacts? They are not told either way.`)) return;
    setBusy(p.id);
    const r = await removeContact(me, p.id);
    setBusy(null);
    if (!r.ok) { toast.error(r.message); return; }
    toast.success("Removed from contacts.");
    setRows((prev) => (prev ?? []).filter((x) => x.id !== p.id));
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">Private to you — players are never told they are in your contacts.</p>
      {rows === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No contacts yet. Save players from their profile in the app.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((p) => (
            <PlayerRow
              key={p.id}
              player={p}
              onMessage={onMessage}
              extra={
                <Button type="button" size="sm" variant="outline" disabled={busy === p.id} onClick={() => void remove(p)}
                  className="text-destructive hover:text-destructive" aria-label={`Remove ${p.name} from contacts`}>
                  <span className="hidden sm:inline">Remove</span><X size={14} className="sm:hidden" />
                </Button>
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Message ────────────────────────────────────────────────────────────────
//
// The same overlay /matchmaking uses. The panel is given only this one person
// rather than every profile (matchmaking's overlay loads them all).

function MessageOverlay({ me, player, onClose }: { me: string; player: DirectoryPlayer; onClose: () => void }) {
  const recipient: MessagingUserProfile = { id: player.id, full_name: player.name, role: "player", avatar_url: player.avatarUrl };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 p-4 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-label={`Message ${player.name}`}>
      <div className="flex h-[min(620px,90vh)] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <span className="font-display text-sm tracking-wider">Message {player.name.split(" ")[0]}</span>
          <Button type="button" size="icon" variant="ghost" onClick={onClose} aria-label="Close">
            <X size={16} weight="bold" />
          </Button>
        </div>
        <div className="flex-1 overflow-hidden">
          <MessagingPanel currentUserId={me} allUsers={[recipient]} initialRecipientId={player.id} compact />
        </div>
      </div>
    </div>
  );
}
