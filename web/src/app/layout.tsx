import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import "./globals.css";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { OnboardingNudgeHost } from "@/components/onboarding/onboarding-nudge-host";
import { AnalyticsProvider } from "@/components/layout/analytics-provider";
import { AppPromptHost } from "@/components/app-prompt/app-prompt-host";
import { APP_STORE_ID } from "@/lib/app-store";
import { APP_ORIGIN } from "@/lib/og/types";
import { SITE_DESCRIPTION, SITE_NAME, SITE_OPEN_GRAPH, SITE_TWITTER } from "@/lib/seo/site";
import { Toaster } from "sonner";

// Self-hosted (2026-09-30), not next/font/google: Google Fonts sometimes
// answers the build's request with extensionless /l/font?kit=…&skey=… URLs,
// which Turbopack cannot parse ("next/font/google queries have exactly one
// entry", vercel/next.js#99114, unfixed in 16.3.x). That failed a production
// build at random. These are the Latin variable-weight files from Fontsource
// 5.3.0 (SIL OFL 1.1, licences alongside), so the build never fetches fonts.
const manrope = localFont({
  src: "./fonts/manrope-latin-wght-normal.woff2",
  variable: "--font-manrope",
  weight: "200 800",
  display: "swap",
});

const jetbrainsMono = localFont({
  src: "./fonts/jetbrains-mono-latin-wght-normal.woff2",
  variable: "--font-jetbrains-mono",
  weight: "100 800",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Pinch-zoom stays on: blocking it fails WCAG 1.4.4 and costs Lighthouse
  // accessibility points. globals.css keeps iOS from auto-zooming on focus.
  viewportFit: "cover",
  interactiveWidget: "overlays-content",
  themeColor: "#0A1228",
};

export const metadata: Metadata = {
  // Resolves relative share-image and canonical URLs to the real domain.
  metadataBase: new URL(APP_ORIGIN),
  title: "Pickleball App — Tournaments, Open Play, Courts & Lessons",
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  // No canonical or og:url here: both are inherited by every page that does
  // not set its own, and would tell Google each of them is the homepage.
  openGraph: SITE_OPEN_GRAPH,
  twitter: SITE_TWITTER,
  // Apple's native Smart App Banner (iOS Safari): "Get" without the app,
  // "Open" with it. Only once the App Store switch is on — see lib/app-store.ts.
  ...(APP_STORE_ID ? { itunes: { appId: APP_STORE_ID } } : {}),
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background text-foreground antialiased">
        {/* Runs synchronously before paint — prevents theme flash */}
        <Script id="theme-init" strategy="beforeInteractive">{`(function(){try{var t=localStorage.getItem('dbpb-theme');document.documentElement.classList.add(t||'dark');}catch(e){}})();`}</Script>
        {/* Runtime config — read server env vars into the DOM so client bundles don't need build-time baking */}
        <script id="app-config" type="application/json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" }) }} />
        {/* Analytics starts here, not in PageShell: /dashboard and /admin roll
            their own shells, and partial coverage makes funnel holes that read
            as user drop-off. No-op when no PostHog key is configured. */}
        {/* The env vars are read HERE, in a server component, and passed down.
            Read inside the analytics module they compiled to a runtime lookup
            against a process polyfill and silently resolved to undefined —
            see web/src/lib/analytics/env.ts. */}
        <AnalyticsProvider
          posthogKey={process.env.NEXT_PUBLIC_POSTHOG_KEY}
          posthogHost={process.env.NEXT_PUBLIC_POSTHOG_HOST}
        />
        <ThemeProvider>
          {children}
          {/* Flushes an onboarding draft once a session exists (email signup has
              none while the flow runs), and nudges thin profiles. Mounted here
              rather than in PageShell because /dashboard and /admin roll their
              own layouts and would miss it. It renders nothing unless it has
              something to do. */}
          <OnboardingNudgeHost />
          {/* "Get the app" lightbox (desktop) / sheet (iPhone). Renders nothing
              until NEXT_PUBLIC_APP_STORE_ID is set. Shares one overlay slot
              with the nudge above — see lib/overlay-lock.ts. */}
          <AppPromptHost appStoreId={APP_STORE_ID} />
          <Toaster position="top-right" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
