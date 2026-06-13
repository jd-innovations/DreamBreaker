import type { Metadata } from "next";
import { Bebas_Neue, Manrope, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { ThemeProvider } from "@/components/layout/theme-provider";
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

export const metadata: Metadata = {
  title: "DreamBreaker PB — Pickleball Tournaments",
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
        <ThemeProvider defaultTheme="dark">
          {children}
          <Toaster position="top-right" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
