"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  MapPin, Trophy, Medal, Star, ChatCircleDots, ArrowLeft,
  Lightning, ShieldStar, CalendarCheck, UsersThree, Tag, CaretRight, X,
} from "@phosphor-icons/react";
import Image from "next/image";
import { PageShell } from "@/components/layout/page-shell";
import { createClient } from "@/lib/supabase/client";
import { getUserId } from "@/lib/dev-user";
import { MessagingPanel } from "@/components/messaging/panel";
import type { UserProfile as MessagingUserProfile } from "@/components/messaging/panel";
import { formatMiles } from "@shared/geo";
import { formatCents } from "@shared/money";
import {
  buildPublicProfile, PUBLIC_PROFILE_SELECT,
  type PublicProfile, type PublicProfileRow, type ProfileViewer,
} from "@shared/public-profile";

/**
 * A player's public profile.
 *
 * Phase 4 of PROFILE_CONSOLIDATION_PLAN.md. What this page SHOWS now comes from
 * @shared/public-profile, the same builder mobile uses, so the two cannot drift
 * again — this page used to select 12 columns of its own and had no distance,
 * availability, home court, groups, activity or listings at all.
 *
 * The layout stays web's. Only the definition is shared; the markup is not.
 *
 * Kept and deliberately NOT moved into the shared builder: the win/loss record.
 * It comes from bracket_matches, which mobile's profile has never shown, and it
 * is real web-only value rather than drift.
 */

function initials(name: string | null) {
  if (!name) return "?";
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="font-mono text-[10px] tracking-widest text-muted-foreground mb-2">{children}</div>;
}

export default function PublicProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [directorApproved, setDirectorApproved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<MessagingUserProfile[]>([]);
  const [showMessaging, setShowMessaging] = useState(false);
  const [, setMessagingUnread] = useState(0);
  const [record, setRecord] = useState({ wins: 0, losses: 0, tournaments: 0 });

  useEffect(() => {
    async function load() {
      const supabase = createClient();

      const userId = await getUserId();
      if (userId) {
        setCurrentUserId(userId);
        // Own profile has its own screen.
        if (userId === id) { router.replace("/profile"); return; }
        const { data: users } = await supabase.from("profiles").select("id,full_name,role,avatar_url").order("full_name");
        setAllUsers((users ?? []) as MessagingUserProfile[]);
      }

      const [
        { data: row }, { data: me }, { count: connectionCount },
        { data: regRows }, { data: playRows }, { data: groupRows }, { data: listingRows },
        { data: reviewRow }, { data: settingRows }, { count: tCount }, { data: matchRows },
        { data: directorRow },
      ] = await Promise.all([
        supabase.from("profiles").select(PUBLIC_PROFILE_SELECT).eq("id", id).single(),
        userId
          ? supabase.from("profiles")
              .select("id, dupr, availability_schedule, location_lat, location_lng")
              .eq("id", userId).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from("partner_matches").select("*", { count: "exact", head: true })
          .or(`user_a.eq.${id},user_b.eq.${id}`),
        supabase.from("registrations").select("tournament_id, tournaments(name, event_date)")
          .or(`player_id.eq.${id},partner_id.eq.${id}`).limit(20),
        supabase.from("play_participants").select("event_id, play_events(name, event_date)")
          .eq("claimed_by", id).limit(20),
        supabase.from("group_members").select("role, groups(name)")
          .eq("user_id", id).eq("status", "active").limit(20),
        // Active only. A profile must never publish someone's drafts or sold
        // items, which is why this is not the seller's own listings query.
        supabase.from("marketplace_listings")
          .select("id, title, asking_price_cents, photos:marketplace_listing_photos(url, sort_order)")
          .eq("seller_id", id).eq("status", "active")
          .order("created_at", { ascending: false }).limit(6),
        supabase.from("v_review_summary").select("average_rating, review_count")
          .eq("subject_type", "player").eq("subject_id", id).maybeSingle(),
        supabase.from("platform_settings").select("key, value")
          .in("key", ["reviews_display_enabled", "reviews_display_min_count"]),
        supabase.from("registrations").select("tournament_id", { count: "exact", head: true })
          .eq("player_id", id).in("status", ["registered", "checked_in"]),
        supabase.from("bracket_matches").select("winner")
          .or(`team1_player_a.eq.${id},team1_player_b.eq.${id},team2_player_a.eq.${id},team2_player_b.eq.${id}`)
          .not("winner", "is", null),
        supabase.from("profiles").select("director_status").eq("id", id).maybeSingle(),
      ]);

      if (!row) { setLoading(false); return; }

      setDirectorApproved(directorRow?.director_status === "approved");

      const wins = (matchRows ?? []).filter((m) => m.winner === 1).length;
      setRecord({ wins, losses: (matchRows ?? []).length - wins, tournaments: tCount ?? 0 });

      const settings = Object.fromEntries((settingRows ?? []).map((r) => [r.key, r.value]));

      const activity = [
        ...(regRows ?? []).flatMap((r) => {
          const t = (r as { tournaments?: { name: string; event_date: string } | null }).tournaments;
          return t ? [{ name: t.name, date: t.event_date, kind: "tournament" as const }] : [];
        }),
        ...(playRows ?? []).flatMap((r) => {
          const e = (r as { play_events?: { name: string; event_date: string } | null }).play_events;
          return e ? [{ name: e.name, date: e.event_date, kind: "community" as const }] : [];
        }),
      ];

      setProfile(buildPublicProfile({
        row: row as unknown as PublicProfileRow,
        viewer: (me ?? null) as ProfileViewer,
        relationship: "none",
        age: null,
        connectionCount: connectionCount ?? 0,
        eventsPlayed: activity.length,
        partnersPlayed: connectionCount ?? 0,
        activity,
        groups: (groupRows ?? []).flatMap((r) => {
          const g = r as { role: string | null; groups?: { name: string } | null };
          return g.groups ? [{ name: g.groups.name, role: g.role ?? "member" }] : [];
        }),
        listings: (listingRows ?? []).map((l) => {
          const photos = (l.photos ?? []) as { url: string; sort_order: number }[];
          return {
            id: l.id,
            title: l.title,
            priceCents: l.asking_price_cents,
            photo: [...photos].sort((a, b) => a.sort_order - b.sort_order)[0]?.url ?? null,
          };
        }),
        reviews: {
          displayEnabled: settings.reviews_display_enabled === "true",
          minCount: Number.parseInt(settings.reviews_display_min_count ?? "3", 10) || 3,
          averageRating: reviewRow?.average_rating != null ? Number(reviewRow.average_rating) : null,
          reviewCount: reviewRow?.review_count ?? 0,
        },
      }));

      setLoading(false);
    }
    load().catch(() => setLoading(false));
  }, [id, router]);

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

  const winRate = record.wins + record.losses > 0
    ? Math.round((record.wins / (record.wins + record.losses)) * 100)
    : 0;

  const distanceLabel = formatMiles(profile.distanceMi);
  const ratingLabel = profile.ratingSource === "none"
    ? null
    : `${profile.ratingValue.toFixed(1)} ${profile.ratingSource === "dupr" ? "DUPR" : "Self"}`;

  return (
    <PageShell>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">

        <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors font-mono">
          <ArrowLeft size={14} weight="bold" /> BACK
        </button>

        <div className="border border-border rounded-2xl bg-card overflow-hidden">
          {/* Header */}
          <div className="px-6 pt-8 pb-6 flex flex-col sm:flex-row items-center sm:items-start gap-5">
            <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-2xl font-display text-primary">
              {profile.avatarUrl
                ? <Image src={profile.avatarUrl} alt="" width={80} height={80} className="h-20 w-20 rounded-full object-cover" />
                : initials(profile.name)}
            </div>
            <div className="flex-1 min-w-0 text-center sm:text-left">
              <div className="flex items-center gap-3 flex-wrap justify-center sm:justify-start">
                <h1 className="font-display text-3xl tracking-wide">{profile.name}</h1>
                {directorApproved && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-amber-400/40 bg-amber-400/10 text-amber-400 font-mono text-[9px] tracking-[0.2em]">
                    <ShieldStar size={11} weight="fill" /> DIRECTOR
                  </span>
                )}
              </div>
              {profile.handle && <div className="font-mono text-sm text-muted-foreground mt-0.5">@{profile.handle}</div>}
              {ratingLabel && <div className="font-mono text-sm text-primary mt-1">{ratingLabel}</div>}
              {(profile.location || distanceLabel) && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1.5 justify-center sm:justify-start">
                  <MapPin size={13} />
                  {profile.location}
                  {distanceLabel && <span className="text-foreground font-medium"> · {distanceLabel}</span>}
                </div>
              )}
              {/* Labelled, never the raw enum. */}
              {profile.lookingFor && (
                <div className="text-xs text-muted-foreground mt-1">{profile.lookingFor}</div>
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

          {/* Match record — web only, from bracket_matches. */}
          <div className="border-t border-border grid grid-cols-3 divide-x divide-border">
            {[
              { label: "WIN RATE", value: winRate > 0 ? `${winRate}%` : "—", icon: Trophy },
              { label: "TOURNAMENTS", value: record.tournaments > 0 ? record.tournaments : "—", icon: Medal },
              { label: "RECORD", value: record.wins + record.losses > 0 ? `${record.wins}W–${record.losses}L` : "—", icon: Star },
            ].map((s) => (
              <div key={s.label} className="px-4 py-5 text-center">
                <s.icon size={14} weight="fill" className="text-primary mx-auto mb-1" />
                <div className="font-display text-xl tracking-wide">{s.value}</div>
                <div className="font-mono text-[9px] tracking-widest text-muted-foreground mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {/* The shared stats — events, partners, match %, and reviews when the
              platform gate allows. Same cells mobile shows. */}
          {profile.stats.length > 0 && (
            <div className="border-t border-border grid grid-cols-2 sm:grid-cols-4 divide-x divide-border">
              {profile.stats.map((stat) => (
                <div key={stat.key} className="px-4 py-4 text-center">
                  <div className="font-display text-xl tracking-wide">{stat.value}</div>
                  <div className="font-mono text-[9px] tracking-widest text-muted-foreground mt-0.5 uppercase">{stat.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Availability. Leads with the overlap — a reason to reach out,
              rather than a fact about a stranger. */}
          {profile.availabilityLabel && (
            <div className="px-6 py-5 border-t border-border">
              <SectionLabel>{profile.availabilityIsShared ? "WHEN YOU BOTH PLAY" : "AVAILABILITY"}</SectionLabel>
              <div className="flex items-center gap-2 text-sm">
                <CalendarCheck size={15} weight="fill" className={profile.availabilityIsShared ? "text-emerald-500" : "text-primary"} />
                <span className="font-medium">{profile.availabilityLabel}</span>
              </div>
            </div>
          )}

          {/* Plays */}
          {(profile.homeCourt || profile.formats.length > 0 || profile.intensity || profile.gender || profile.hand) && (
            <div className="px-6 py-5 border-t border-border">
              <SectionLabel>PLAYS</SectionLabel>
              {profile.homeCourt && (
                profile.homeCourtId ? (
                  <Link
                    href={`/facility/${profile.homeCourtId}`}
                    className="flex items-center gap-2 text-sm mb-3 hover:text-primary transition-colors group"
                  >
                    <MapPin size={15} weight="fill" className="text-primary" />
                    <span className="font-medium">Home court: {profile.homeCourt}</span>
                    <CaretRight size={12} weight="bold" className="text-muted-foreground group-hover:text-primary" />
                  </Link>
                ) : (
                  <div className="flex items-center gap-2 text-sm mb-3">
                    <MapPin size={15} weight="fill" className="text-primary" />
                    <span className="font-medium">Home court: {profile.homeCourt}</span>
                  </div>
                )
              )}
              <div className="flex flex-wrap gap-2">
                {profile.formats.map((f) => (
                  <span key={f} className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-mono">{f}</span>
                ))}
                {profile.intensity && <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-mono">{profile.intensity}</span>}
                {profile.hand && <span className="px-3 py-1 rounded-full bg-secondary text-muted-foreground text-xs font-mono">{profile.hand}</span>}
                {profile.gender && <span className="px-3 py-1 rounded-full bg-secondary text-muted-foreground text-xs font-mono">{profile.gender}</span>}
              </div>
            </div>
          )}

          {profile.bio && (
            <div className="px-6 py-5 border-t border-border">
              <SectionLabel>ABOUT</SectionLabel>
              <p className="text-sm text-muted-foreground leading-relaxed">{profile.bio}</p>
            </div>
          )}

          {profile.playStyle && (
            <div className="px-6 py-4 border-t border-border">
              <SectionLabel>PLAY STYLE</SectionLabel>
              <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-mono">{profile.playStyle}</span>
            </div>
          )}

          {profile.activity.length > 0 && (
            <div className="px-6 py-5 border-t border-border">
              <SectionLabel>RECENT ACTIVITY</SectionLabel>
              <ul className="space-y-2.5">
                {profile.activity.map((a) => (
                  <li key={`${a.name}-${a.date}`} className="flex items-start gap-2.5">
                    {a.kind === "tournament"
                      ? <Trophy size={14} weight="fill" className="text-primary mt-0.5 flex-shrink-0" />
                      : <UsersThree size={14} weight="fill" className="text-primary mt-0.5 flex-shrink-0" />}
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{a.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {a.kind === "tournament" ? "Tournament" : "Community Play"} · {a.date}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {profile.groups.length > 0 && (
            <div className="px-6 py-5 border-t border-border">
              <SectionLabel>GROUPS</SectionLabel>
              <ul className="space-y-2">
                {profile.groups.map((g) => (
                  <li key={g.name} className="flex items-center gap-2.5 text-sm">
                    <UsersThree size={14} weight="fill" className="text-muted-foreground flex-shrink-0" />
                    <span className="font-medium">{g.name}</span>
                    <span className="text-xs text-muted-foreground">{g.role}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {profile.listings.length > 0 && (
            <div className="px-6 py-5 border-t border-border">
              <SectionLabel>MARKETPLACE</SectionLabel>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {profile.listings.map((l) => (
                  <Link key={l.id} href={`/marketplace/${l.id}`} className="group">
                    <div className="aspect-[4/3] rounded-xl border border-border bg-secondary overflow-hidden flex items-center justify-center">
                      {l.photo
                        ? <Image src={l.photo} alt="" width={200} height={150} className="h-full w-full object-cover group-hover:scale-[1.03] transition-transform" />
                        : <Tag size={20} weight="fill" className="text-muted-foreground" />}
                    </div>
                    <div className="text-sm font-medium truncate mt-1.5 group-hover:text-primary transition-colors">{l.title}</div>
                    <div className="font-mono text-xs text-primary">{formatCents(l.priceCents, { omitZeroCents: true })}</div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {showMessaging && currentUserId && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ height: "min(620px, 90vh)" }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
              <span className="font-display tracking-wider text-sm">MESSAGE {profile.name.split(" ")[0].toUpperCase()}</span>
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
