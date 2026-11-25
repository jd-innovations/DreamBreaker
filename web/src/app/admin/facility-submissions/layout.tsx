// Inside the admin frame (shared sidebar), like every admin tool page. Access is
// checked by the page and again by every RPC (is_admin()).
import { AdminFrame } from "@/components/admin/admin-frame";

export default function AdminToolLayout({ children }: { children: React.ReactNode }) {
  return <AdminFrame>{children}</AdminFrame>;
}
