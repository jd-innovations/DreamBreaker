// The marketplace pages (browse and listing) inside the standard site shell —
// header, footer and the phone bottom nav — so someone who arrives on a listing
// from a shared link can move around the site, and browse is reachable both
// ways. PageShell supplies <main>; the pages render <div>s.

import { PageShell } from "@/components/layout/page-shell";

export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return <PageShell>{children}</PageShell>;
}
