// Lessons lives inside the standard site shell — header, footer and the phone
// bottom nav — so someone arriving on a shared lesson link can move around the
// site. Public: no auth gate here, only buying needs an account.

import { PageShell } from "@/components/layout/page-shell";
import { pageMetadata } from "@/lib/seo/site";

// Here rather than on the page because lessons/page.tsx is a client
// component. lessons/[id] sets its own canonical and share card over this.
export const metadata = pageMetadata({
  title: "Pickleball Lessons Near You — Pickleball App",
  description: "Private lessons, clinics and camps from pickleball coaches near you.",
  path: "/lessons",
});

export default function LessonsLayout({ children }: { children: React.ReactNode }) {
  return <PageShell>{children}</PageShell>;
}
