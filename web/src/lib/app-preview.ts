// Screens shown inside the phone frame of the "get the app" prompt.
//
// The same iPhone captures as the App Store screenshots
// (fastlane/screenshots/en-US), unframed and scaled to 660px wide in
// public/app-preview/ — so the web shows exactly what the store shows. An
// empty list makes the frame show the logo, never a mock.
export const APP_PREVIEW_SCREENS: readonly { src: string; alt: string }[] = [
  { src: "/app-preview/home.webp", alt: "Pickleball App home screen with quick actions and games to join" },
  { src: "/app-preview/explore.webp", alt: "Map of pickleball courts near you" },
  { src: "/app-preview/tournament.webp", alt: "Tournament details with divisions and registration" },
  { src: "/app-preview/partner.webp", alt: "Partner finder showing a nearby player" },
  { src: "/app-preview/stats.webp", alt: "My Stats screen with your PAR rating and games played" },
];

export const APP_PREVIEW_QR = "/app-preview/qr-get-app.svg";
