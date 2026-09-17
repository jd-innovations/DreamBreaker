import type { Metadata } from "next";
import GroupDetailClient from "./group-detail-client";
import { buildEntityMetadata } from "@/lib/og/metadata";
import { fetchGroupOg } from "@/lib/og/fetchers";

// Server wrapper around the (fully client-rendered) group detail page.
// generateMetadata cannot live in a "use client" file — see the matching
// play/[id]/page.tsx wrapper for the same pattern. This used to render
// MobileLinkFallback (GROUPS_WEB_PLAN.md §1 — web had no Groups UI at all);
// that fallback is now gone in favor of the real page.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const payload = await fetchGroupOg(id);
  return buildEntityMetadata("group", id, payload);
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <GroupDetailClient params={params} />;
}
