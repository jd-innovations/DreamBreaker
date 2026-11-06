import type { Metadata } from "next";
import TournamentDetailPage from "./tournament-detail-client";
import { buildEntityMetadata } from "@/lib/og/metadata";
import { fetchTournamentOg } from "@/lib/og/fetchers";
import { tournamentStructuredData } from "@/lib/seo/event-structured-data";
import { jsonLdHtml } from "@/lib/seo/site";

// Server wrapper around the (fully client-rendered) tournament detail page.
// generateMetadata cannot live in a "use client" file, and the interactive
// implementation below needs to stay client-rendered as-is — this file's only
// job is the metadata crawlers read before any JS runs, plus the /tournament
// canonical share URL's redirect lands here.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const payload = await fetchTournamentOg(id);
  return buildEntityMetadata("tournament", id, payload);
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const structuredData = await tournamentStructuredData(id);
  return (
    <>
      {structuredData && <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdHtml(structuredData)} />}
      <TournamentDetailPage params={params} />
    </>
  );
}
