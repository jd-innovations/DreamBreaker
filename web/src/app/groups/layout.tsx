import { pageMetadata } from "@/lib/seo/site";

// Exists only for metadata: groups/page.tsx is a client component and cannot
// export it. groups/[id] sets its own canonical and share card over this.
export const metadata = pageMetadata({
  title: "Pickleball Groups & Clubs — Pickleball App",
  description:
    "Join local pickleball groups and clubs to organize games, share news and message the people you play with.",
  path: "/groups",
});

export default function GroupsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
