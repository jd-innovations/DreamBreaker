// The App Store go-live switch for the web.
//
// NEXT_PUBLIC_APP_STORE_ID is the app's numeric Apple ID (App Store Connect →
// App Information → Apple ID). While it is unset, nothing that points at the
// App Store renders: no Smart App Banner, no "get the app" prompt, and
// /get-app sends people home. Set it in Vercel on approval day and redeploy —
// NEXT_PUBLIC_* is inlined at build time, so a redeploy is required.
//
// Read SERVER-SIDE only (root layout, /get-app) and passed to client code as a
// prop. Read inside a client chunk, NEXT_PUBLIC_* can compile to a lookup on a
// process polyfill and silently become undefined — see lib/analytics/env.ts.
// An unset variable can also arrive as the string "undefined"; the pattern
// check rejects that too.
const RAW_ID = process.env.NEXT_PUBLIC_APP_STORE_ID ?? "";

export const APP_STORE_ID: string | null = /^\d{6,12}$/.test(RAW_ID) ? RAW_ID : null;

/** Campaign tokens App Store Connect attributes installs to. Fixed vocabulary. */
export type AppStoreCampaign = "web_prompt" | "web_qr" | "web_banner";

/**
 * Every App Store link goes through /get-app, never straight to Apple: the
 * provider token stays server-side, and the QR code printed today keeps
 * working whatever the store URL becomes.
 */
export function getAppHref(campaign: AppStoreCampaign): string {
  return `/get-app?ct=${campaign}`;
}
