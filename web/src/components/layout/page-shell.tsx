import { Header } from "./header";
import { Footer } from "./footer";
import { MobileBottomNav } from "./mobile-bottom-nav";

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
      <main className="flex-1 pb-28 lg:pb-0">{children}</main>
      {!hideFooter && <Footer />}
      <MobileBottomNav />
    </div>
  );
}
