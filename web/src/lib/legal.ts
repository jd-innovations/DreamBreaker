/**
 * Single source of truth for legal / support surfaces.
 *
 * The mobile app mirrors these paths in `apps/mobile/src/lib/legal.ts`. If a
 * route moves here, move it there too — the app store listings and the
 * in-app links both point at these URLs.
 */

export const LEGAL_ENTITY = "JD Innovations LLC";
export const LEGAL_ADDRESS = "11615 Gramercy Park Ave, Bradenton, FL 34211";

export const SUPPORT_EMAIL = "support@pickleballapp.app";

/**
 * Privacy and data-rights requests. Currently the same mailbox as support: the
 * privacy policy promises a 30-day response, so pointing it at an address that
 * does not exist yet would be worse than not having a dedicated one. Flip this
 * to `privacy@pickleballapp.app` once that mailbox exists and is monitored.
 */
export const PRIVACY_EMAIL = SUPPORT_EMAIL;

export const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://pickleballapp.app";

export const LEGAL_ROUTES = {
  terms: "/legal/terms",
  privacy: "/legal/privacy",
  deleteAccount: "/legal/delete-account",
  help: "/help",
} as const;

/** Shown at the top of each document. Bump when the document changes. */
export const LEGAL_LAST_UPDATED = "August 20, 2026";
