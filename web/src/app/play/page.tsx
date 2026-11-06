import { connection } from "next/server";
import PlayBrowsePage from "./play-client";
import { pageMetadata } from "@/lib/seo/site";

export const metadata = pageMetadata({
  title: "Open Play & Pickleball Games Near You — Pickleball App",
  description:
    "Find open play, round robins and mini tournaments near you, filtered by day and skill level. Join in a tap or start your own game.",
  path: "/play",
});

// Server wrapper — see tournaments/page.tsx for the full explanation. The
// same `force-dynamic` string export on the client page did not stop Vercel
// from statically caching this route either (confirmed live: a 12+ hour
// stale response survived multiple real deployments). `connection()` is an
// actual dynamic API call the framework cannot optimize away.
export default async function Page() {
  await connection();
  return <PlayBrowsePage />;
}
