// Public court directory — inside the standard site shell (header, footer,
// phone bottom nav). Browsing needs no account; only submitting a location or
// an edit will (Phase 2).
import { PageShell } from "@/components/layout/page-shell";

export default function CourtsLayout({ children }: { children: React.ReactNode }) {
  return <PageShell>{children}</PageShell>;
}
