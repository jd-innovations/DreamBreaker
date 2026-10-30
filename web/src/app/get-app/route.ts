import { NextResponse, type NextRequest } from "next/server";
import { APP_STORE_ID } from "@/lib/app-store";

// Stable "download the app" link: the web prompt, the QR code, and anything
// printed (flyers, court signage) all point here. Redirects to the App Store
// with an App Store Connect campaign token so installs are attributed.
//
// The destination is always apps.apple.com — no part of the request chooses
// where to go, so this is not an open redirect. `ct` is checked against a
// fixed pattern before it is forwarded.
//
// APP_STORE_PROVIDER_TOKEN (optional, server-only) is the `pt` value from
// App Store Connect → App Analytics → Campaigns; without it Apple does not
// attribute the campaign, but the link still works.

export const dynamic = "force-dynamic";

const CAMPAIGN_RE = /^[a-z0-9_]{1,40}$/;

export function GET(request: NextRequest) {
  const home = new URL("/", request.url);

  // Not live yet, or an Android visitor: there is no app for them to get.
  if (!APP_STORE_ID) return NextResponse.redirect(home, 302);
  const ua = request.headers.get("user-agent") ?? "";
  if (/android/i.test(ua)) return NextResponse.redirect(home, 302);

  const store = new URL(`https://apps.apple.com/app/id${APP_STORE_ID}`);
  const ct = request.nextUrl.searchParams.get("ct") ?? "";
  const pt = process.env.APP_STORE_PROVIDER_TOKEN ?? "";
  if (CAMPAIGN_RE.test(ct)) store.searchParams.set("ct", ct);
  if (/^\d{1,20}$/.test(pt)) store.searchParams.set("pt", pt);
  store.searchParams.set("mt", "8");

  return NextResponse.redirect(store, 302);
}
