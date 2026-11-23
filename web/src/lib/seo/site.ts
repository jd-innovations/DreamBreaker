import type { Metadata } from "next";
import { APP_ORIGIN } from "@/lib/og/types";

// Site-wide search and share defaults. Entity pages (a tournament, a lesson…)
// build their own metadata in lib/og/metadata.ts; this is for everything else.

export const SITE_NAME = "Pickleball App";

export const SITE_DESCRIPTION =
  "Find pickleball tournaments, open play, courts, lessons and partners near you. Register, track your games and grow your rating.";

/** 1200×630, public/og/default.jpg. Regenerate it rather than editing by hand. */
export const DEFAULT_OG_IMAGE = { url: "/og/default.jpg", width: 1200, height: 630, alt: "Pickleball App" };

const HOME_TITLE = "Pickleball App — Play more pickleball";

/**
 * The homepage share card, also the fallback for any page without its own.
 * Next replaces `openGraph` whole rather than merging it, so a page that only
 * wants to add a `url` must spread this.
 */
export const SITE_OPEN_GRAPH = {
  title: HOME_TITLE,
  description: SITE_DESCRIPTION,
  siteName: SITE_NAME,
  type: "website",
  locale: "en_US",
  images: [DEFAULT_OG_IMAGE],
} satisfies Metadata["openGraph"];

export const SITE_TWITTER = {
  card: "summary_large_image",
  title: HOME_TITLE,
  description: SITE_DESCRIPTION,
  images: [DEFAULT_OG_IMAGE.url],
} satisfies Metadata["twitter"];

/**
 * Metadata for a top-level page: its own title, description and canonical URL,
 * with the share card carrying the same words. Without the openGraph block a
 * shared link would show the root layout's homepage card instead.
 */
export function pageMetadata({ title, description, path }: { title: string; description: string; path: string }): Metadata {
  const url = `${APP_ORIGIN}${path}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: SITE_NAME, type: "website", images: [DEFAULT_OG_IMAGE] },
    twitter: { card: "summary_large_image", title, description, images: [DEFAULT_OG_IMAGE.url] },
  };
}

/** The App Store listing's name, which differs from SITE_NAME ("Pickleball App" was taken). */
export const APP_STORE_NAME = "Pickleball App: Courts & Games";

/**
 * The iOS app as a schema.org MobileApplication, linked to the Organization
 * node on the homepage. Deliberately has no aggregateRating: Google only shows
 * an app rich result with real ratings, and inventing one breaks its policy.
 */
export function mobileAppStructuredData(appStoreId: string, organizationId: string): Record<string, unknown> {
  const listing = `https://apps.apple.com/app/id${appStoreId}`;
  return {
    "@type": "MobileApplication",
    "@id": `${APP_ORIGIN}/#ios-app`,
    name: APP_STORE_NAME,
    description: SITE_DESCRIPTION,
    operatingSystem: "iOS",
    applicationCategory: "SportsApplication",
    url: listing,
    installUrl: listing,
    image: `${APP_ORIGIN}/icons/icon-512.png`,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    publisher: { "@id": organizationId },
  };
}

/**
 * Serialises schema.org data for a <script type="application/ld+json">.
 * Names and descriptions are user-authored, so `<` is escaped: a title
 * containing "</script>" must not be able to close the tag and inject markup.
 */
export function jsonLdHtml(data: object): { __html: string } {
  return { __html: JSON.stringify(data).replace(/</g, "\\u003c") };
}
