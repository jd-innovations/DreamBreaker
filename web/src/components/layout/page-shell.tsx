import { Header } from "./header";
import { Footer } from "./footer";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { SponsorCarousel } from "./sponsor-carousel";

export function PageShell({
  children,
  hideFooter = false,
  overlayHeader = false,
}: {
  children: React.ReactNode;
  hideFooter?: boolean;
  /** Desktop header floats transparently over the first section (landing hero).
   *  main is pulled up by the lg header height (h-16) so the hero starts at the
   *  top of the window; that section must add the same amount of top padding. */
  overlayHeader?: boolean;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header overlay={overlayHeader} />
      {/* Room for the icon-only phone bottom bar (about 48px + 12px margin). */}
      <main className={`flex-1 pb-20 lg:pb-0 ${overlayHeader ? "lg:-mt-16" : ""}`}>{children}</main>
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
