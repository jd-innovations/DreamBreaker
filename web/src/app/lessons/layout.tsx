// Lessons lives inside the standard site shell — header, footer and the phone
// bottom nav — so someone arriving on a shared lesson link can move around the
// site. Public: no auth gate here, only buying needs an account.

import { PageShell } from "@/components/layout/page-shell";

export const metadata = {
  title: "Lessons — Pickleball App",
  description: "Private lessons, clinics and camps from pickleball coaches near you.",
};

export default function LessonsLayout({ children }: { children: React.ReactNode }) {
  return <PageShell>{children}</PageShell>;
}
