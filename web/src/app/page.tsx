import { connection } from "next/server";
import LandingPage from "./(public)/landing-page";

// `export const dynamic = "force-dynamic"` (this file's previous contents)
// did not actually stop Vercel from statically caching this route — same
// bug confirmed live on /tournaments, /play, and /dashboard, all of which
// kept serving a 12+ hour stale response across real deployments despite
// the same directive. `connection()` is an actual dynamic API call the
// framework cannot optimize away, unlike the string export it was
// ignoring here. See tournaments/page.tsx for the full writeup.
export default async function Page() {
  await connection();
  return <LandingPage />;
}
