import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/page-shell";
import { buildEntityMetadata } from "@/lib/og/metadata";
import { fetchCoachOg } from "@/lib/og/fetchers";
import { OfferCard } from "@/components/coaching/offer-card";
import { initialsOf, type OfferCard as Offer } from "@/lib/coaching/browse";

/**
 * A coach and their lessons — Phase 1 of coach-marketplace web parity.
 *
 * Replaces the "open in the app" stub that stood here. A coach link is exactly
 * the kind someone pastes to a person who does not have the app yet, and
 * answering that with "install our app to see who this is" loses the booking —
 * the same reasoning that turned the marketplace listing stub into a real page.
 *
 * READ-ONLY and PUBLIC. It shows what the browse function already shows
 * publicly: display name, handle, avatar, bio, and active lessons. Nothing
 * private about a coach appears here, and booking needs an account.
 */

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const payload = await fetchCoachOg(id);
  return buildEntityMetadata("coach", id, payload);
}

export default async function CoachPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  // The coach's own public row, and their lessons from the same public browse
  // function the /lessons page uses — one definition of "an offer a visitor
  // may see", rather than a second query that could drift from it.
  const [{ data: profile }, { data: offerRows }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, handle, avatar_url, bio, is_coach")
      .eq("id", id).eq("is_coach", true).maybeSingle(),
    supabase.rpc("browse_coach_offers", { p_limit: 60 }),
  ]);

  if (!profile) notFound();

  const offers = ((offerRows ?? []) as Offer[]).filter((o) => o.coach_id === id);

  return (
    <PageShell>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <Link href="/lessons" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={14} /> All lessons
        </Link>

        <header className="mt-4 flex items-center gap-4">
          {profile.avatar_url ? (
            <Image src={profile.avatar_url} alt="" width={80} height={80}
              className="h-20 w-20 rounded-full object-cover" />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
              <span className="font-display text-xl tracking-widest text-primary/70">
                {initialsOf(profile.full_name)}
              </span>
            </div>
          )}
          <div className="min-w-0">
            <h1 className="font-display text-3xl tracking-wide">{profile.full_name ?? "Coach"}</h1>
            {profile.handle && <p className="text-sm text-muted-foreground">@{profile.handle}</p>}
          </div>
        </header>

        {profile.bio && (
          <p className="mt-4 max-w-2xl whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {profile.bio}
          </p>
        )}

        <h2 className="mt-8 font-display text-sm uppercase tracking-widest text-muted-foreground">
          {offers.length > 0 ? `${offers.length} ${offers.length === 1 ? "lesson" : "lessons"}` : "Lessons"}
        </h2>

        {offers.length === 0 ? (
          <p className="mt-3 rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No lessons on offer right now.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {offers.map((o) => <OfferCard key={o.id} offer={o} />)}
          </div>
        )}
      </div>
    </PageShell>
  );
}
