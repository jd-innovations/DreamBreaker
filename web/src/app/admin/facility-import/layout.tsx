// Inside the site shell (footer hidden), like every admin tool page, so the
// header gives navigation from here. PageShell supplies <main>; the page
// renders a <div>. Access is still checked by the page and by each RPC.

import { PageShell } from "@/components/layout/page-shell";

export default function AdminToolLayout({ children }: { children: React.ReactNode }) {
  return <PageShell hideFooter>{children}</PageShell>;
}
