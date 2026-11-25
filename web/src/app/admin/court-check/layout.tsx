// Inside the site shell (footer hidden), like every admin tool page. Access is
// checked by the page and again by every RPC (is_admin()).
import { PageShell } from "@/components/layout/page-shell";

export default function AdminToolLayout({ children }: { children: React.ReactNode }) {
  return <PageShell hideFooter>{children}</PageShell>;
}
