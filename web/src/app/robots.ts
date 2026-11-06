import type { MetadataRoute } from "next";
import { APP_ORIGIN } from "@/lib/og/types";

// Public browse and detail pages are crawlable; signed-in areas and player
// profiles are not. This only asks well-behaved crawlers to stay out — access
// control is still RLS and the auth redirects.
//
// Links people paste into chats (/claim, /groups/join, /review) are NOT listed:
// some preview bots, X's among them, obey robots.txt and would show a bare
// link. Those pages opt out of search with a noindex tag instead (or, for the
// client-rendered group invite, canonicalise to /groups).
//
// /api/og stays allowed: it serves the share images that link previews and
// search results fetch.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/api/og/"],
      disallow: [
        "/admin",
        "/api/",
        "/auth",
        "/booking",
        "/conversation",
        "/dashboard",
        "/director",
        "/get-app",
        "/groups/create",
        "/holds",
        "/matchmaking",
        "/onboarding",
        "/play/create",
        "/players",
        "/profile",
        "/settings",
      ],
    },
    sitemap: `${APP_ORIGIN}/sitemap.xml`,
  };
}
