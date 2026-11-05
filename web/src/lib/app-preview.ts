// Screens shown inside the phone frames of the "get the app" prompt.
//
// The same iPhone captures as the App Store screenshots
// (fastlane/screenshots/en-US), unframed and scaled to 660px wide in
// public/app-preview/ — so the web shows exactly what the store shows.
export const APP_PREVIEW_SCREENS = {
  home: { src: "/app-preview/home.webp", alt: "Pickleball App home screen with quick actions and games to join" },
  explore: { src: "/app-preview/explore.webp", alt: "Map of pickleball courts near you" },
  tournament: { src: "/app-preview/tournament.webp", alt: "Tournament details with divisions and registration" },
  partner: { src: "/app-preview/partner.webp", alt: "Partner finder showing a nearby player" },
  stats: { src: "/app-preview/stats.webp", alt: "My Stats screen with your PAR rating and games played" },
} as const;

export type AppPreviewScreen = keyof typeof APP_PREVIEW_SCREENS;

/** One QR code per A/B arm; each encodes /get-app?ct=web_qr_<design>. */
export const APP_PREVIEW_QR = {
  d: "/app-preview/qr-get-app-d.svg",
  e: "/app-preview/qr-get-app-e.svg",
} as const;

/** Hand-drawn icons, same pack as the App Store screenshot frames. */
export const APP_PROMPT_ICONS = {
  ball: "/app-prompt/icon-ball.svg",
  paddles: "/app-prompt/icon-paddles.svg",
  trophy: "/app-prompt/icon-trophy.svg",
  score: "/app-prompt/icon-score.svg",
  watch: "/app-prompt/icon-watch.svg",
  court: "/app-prompt/icon-court.svg",
} as const;
