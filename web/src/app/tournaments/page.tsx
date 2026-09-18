import { connection } from "next/server";
import TournamentsPage from "./tournaments-client";

// Server wrapper around the fully client-rendered tournaments browse page.
//
// `export const dynamic = "force-dynamic"` on the client page alone did NOT
// stop Vercel from statically prerendering this route and caching the
// output at the edge — confirmed live: the deployed page kept serving a
// snapshot over 12 hours stale across multiple real deployments in between,
// even with that directive already in place (same symptom independently
// confirmed on /play). `connection()` is an actual dynamic API call, not a
// string hint the framework can choose to ignore — awaiting it forces this
// route to render fresh on every request, the same guarantee `force-dynamic`
// is supposed to provide but, empirically, did not in this deployment.
export default async function Page() {
  await connection();
  return <TournamentsPage />;
}
