// /courts/suggest — add a court, or (with ?facility=<id>) suggest an edit to one.
// Signed-in only; everything is reviewed by an admin before it is published.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { createClient } from "@/lib/supabase/server";
import { facilityHref, getCourtById } from "@/lib/courts/directory";
import { SuggestForm } from "./suggest-form";

export const metadata: Metadata = {
  title: "Suggest a court — Pickleball App",
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ facility?: string | string[] }> };

export default async function SuggestPage({ searchParams }: Props) {
  const { facility } = await searchParams;
  const facilityId = typeof facility === "string" ? facility : null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const next = facilityId ? `/courts/suggest?facility=${encodeURIComponent(facilityId)}` : "/courts/suggest";
    redirect(`/auth?next=${encodeURIComponent(next)}`);
  }

  const court = facilityId ? await getCourtById(facilityId) : null;
  if (facilityId && !court) notFound();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
      <Link
        href={court ? facilityHref(court) : "/courts"}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={14} /> {court ? court.name : "All courts"}
      </Link>
      <header className="mt-4 space-y-2">
        <h1 className="font-display text-3xl tracking-wide sm:text-4xl">
          {court ? "Suggest an edit" : "Add a court"}
        </h1>
        <p className="text-muted-foreground">
          {court
            ? "Change anything that's wrong or missing. Our team reviews every update before it goes live."
            : "Know a place to play that isn't listed? Tell us where it is. Our team reviews every submission before it goes live."}
        </p>
      </header>
      <div className="mt-6">
        <SuggestForm court={court} />
      </div>
    </div>
  );
}
