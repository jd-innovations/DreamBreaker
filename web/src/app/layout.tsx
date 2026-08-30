import type { Metadata, Viewport } from "next";
import { Bebas_Neue, Manrope, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { OnboardingNudgeHost } from "@/components/onboarding/onboarding-nudge-host";
import { AnalyticsProvider } from "@/components/layout/analytics-provider";
import { Toaster } from "sonner";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const bebasNeue = Bebas_Neue({
  variable: "--font-bebas-neue",
  subsets: ["latin"],
  weight: "400",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  interactiveWidget: "overlays-content",
};

export const metadata: Metadata = {
  title: "Pickleball App — Pickleball Tournaments",
  description:
    "Compete in elite pickleball tournaments. Find partners. Hold your spot. Earn your rank.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${bebasNeue.variable} ${jetbrainsMono.variable}`}
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
        <AnalyticsProvider />
        <ThemeProvider>
          {children}
          {/* Flushes an onboarding draft once a session exists (email signup has
              none while the flow runs), and nudges thin profiles. Mounted here
              rather than in PageShell because /dashboard and /admin roll their
              own layouts and would miss it. It renders nothing unless it has
              something to do. */}
          <OnboardingNudgeHost />
          <Toaster position="top-right" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
