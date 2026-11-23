import type { Metadata } from "next";
import { connection } from "next/server";
import LandingPage from "./(public)/landing-page";
import { APP_ORIGIN } from "@/lib/og/types";
import { APP_STORE_ID } from "@/lib/app-store";
import { SITE_DESCRIPTION, SITE_NAME, SITE_OPEN_GRAPH, jsonLdHtml, mobileAppStructuredData } from "@/lib/seo/site";

// The homepage's canonical lives here, not in the root layout, which every
// page inherits from.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: { ...SITE_OPEN_GRAPH, url: "/" },
};

// Who the site belongs to and what it is called, for Google's site name and
// knowledge panel, plus the iOS app once NEXT_PUBLIC_APP_STORE_ID is set.
const ORGANIZATION_ID = `${APP_ORIGIN}/#organization`;
const APP_STORE_URL = APP_STORE_ID ? `https://apps.apple.com/app/id${APP_STORE_ID}` : null;

const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": ORGANIZATION_ID,
      name: SITE_NAME,
      url: APP_ORIGIN,
      logo: `${APP_ORIGIN}/icons/icon-512.png`,
      email: "support@pickleballapp.app",
      ...(APP_STORE_URL ? { sameAs: [APP_STORE_URL] } : {}),
    },
    {
      "@type": "WebSite",
      "@id": `${APP_ORIGIN}/#website`,
      name: SITE_NAME,
      url: APP_ORIGIN,
      description: SITE_DESCRIPTION,
      publisher: { "@id": ORGANIZATION_ID },
    },
    ...(APP_STORE_ID ? [mobileAppStructuredData(APP_STORE_ID, ORGANIZATION_ID)] : []),
  ],
};

// `export const dynamic = "force-dynamic"` (this file's previous contents)
// did not actually stop Vercel from statically caching this route — same
// bug confirmed live on /tournaments, /play, and /dashboard, all of which
// kept serving a 12+ hour stale response across real deployments despite
// the same directive. `connection()` is an actual dynamic API call the
// framework cannot optimize away, unlike the string export it was
// ignoring here. See tournaments/page.tsx for the full writeup.
export default async function Page() {
  await connection();
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdHtml(STRUCTURED_DATA)} />
      <LandingPage />
    </>
  );
}
