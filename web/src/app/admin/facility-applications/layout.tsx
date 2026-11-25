// Inside the admin frame: the shared admin sidebar gives navigation from here,
// and AdminFrame supplies <main>. Access is checked by the page and by RLS.

import { AdminFrame } from "@/components/admin/admin-frame";

export default function AdminToolLayout({ children }: { children: React.ReactNode }) {
  return <AdminFrame>{children}</AdminFrame>;
}
