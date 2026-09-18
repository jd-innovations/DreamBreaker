import { connection } from "next/server";
import DashboardPage from "./dashboard-client";

// Server wrapper — see tournaments/page.tsx for the full explanation. The
// same `force-dynamic` string export on the client page did not stop Vercel
// from statically caching this route either (confirmed live: a 12+ hour
// stale response survived multiple real deployments). `connection()` is an
// actual dynamic API call the framework cannot optimize away.
export default async function Page() {
  await connection();
  return <DashboardPage />;
}
