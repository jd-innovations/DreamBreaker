// The names of the app's places, for BOTH apps' navigation (tab bar, side
// menus, header). The mobile app is the source of the wording; web mirrors it
// (COPY_ALIGNMENT.md, 2026-10-09). Before this, the same screen was "Home" on
// mobile and "Dashboard" on web, "Partner Finder" and "Matchmaking", "Chat"
// and "Messages". Change a name here and both apps follow.

export const NAV = {
  home: "Home",
  nearby: "Nearby",
  events: "Events",
  /** Tab-bar form, where "Partner Finder" does not fit. */
  partner: "Partner",
  partnerFinder: "Partner Finder",
  profile: "Profile",
  messages: "Messages",
  groups: "Groups",
  marketplace: "Marketplace",
  tournaments: "Tournaments",
  communityPlay: "Community Play",
  lessons: "Lessons",
  stats: "Stats",
  directorHub: "Director Hub",
  commandCenter: "Command Center",
  helpSupport: "Help & Support",
  settingsPrivacy: "Settings & Privacy",
} as const;

export type NavKey = keyof typeof NAV;
