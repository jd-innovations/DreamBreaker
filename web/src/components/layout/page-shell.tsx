import { Header } from "./header";
import { Footer } from "./footer";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { SponsorCarousel } from "./sponsor-carousel";

export function PageShell({
  children,
  hideFooter = false,
}: {
  children: React.ReactNode;
  hideFooter?: boolean;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      {/* Room for the icon-only phone bottom bar (about 48px + 12px margin). */}
      <main className="flex-1 pb-20 lg:pb-0">{children}</main>
      {!hideFooter && (
        <>
          <SponsorCarousel />
          <Footer />
        </>
      )}
      <MobileBottomNav />
    </div>
  );
}
