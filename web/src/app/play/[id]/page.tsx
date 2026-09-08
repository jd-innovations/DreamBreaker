import type { Metadata } from "next";
import PlayEventPage from "./play-event-client";
import { buildEntityMetadata } from "@/lib/og/metadata";
import { fetchCommunityEventOg } from "@/lib/og/fetchers";

// Server wrapper around the (fully client-rendered) community/play event
// page. generateMetadata cannot live in a "use client" file — see the
// matching tournaments/[id]/page.tsx wrapper for the same pattern. The
// /community canonical share URL's redirect lands here.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const payload = await fetchCommunityEventOg(id);
  return buildEntityMetadata("community", id, payload);
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <PlayEventPage params={params} />;
}
