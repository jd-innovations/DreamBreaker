// Screens shown inside the phone frame of the "get the app" prompt.
//
// These are the App Store screenshots from the Maestro capture
// (.github/workflows/app-store.yml, lane capture-screenshots), copied into
// public/app-preview/ — so the web shows exactly what the store shows. Add
// them here once captured; until then the frame shows the logo, never a mock.
export const APP_PREVIEW_SCREENS: readonly { src: string; alt: string }[] = [];

export const APP_PREVIEW_QR = "/app-preview/qr-get-app.svg";
