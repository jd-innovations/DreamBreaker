import * as WebBrowser from 'expo-web-browser';

import { colors } from '@/theme';

/**
 * Legal and support destinations.
 *
 * These mirror `web/src/lib/legal.ts` — the canonical documents are pages in
 * the Next app, so the store listings, the website footer and the app all
 * point at the same URLs. If a route moves there, move it here too.
 */

export const LEGAL_BASE_URL = 'https://pickleballapp.app';

export const TERMS_URL = `${LEGAL_BASE_URL}/legal/terms`;
export const PRIVACY_URL = `${LEGAL_BASE_URL}/legal/privacy`;
export const DELETE_ACCOUNT_INFO_URL = `${LEGAL_BASE_URL}/legal/delete-account`;
export const HELP_CENTER_URL = `${LEGAL_BASE_URL}/help`;

export const SUPPORT_EMAIL = 'support@pickleballapp.app';
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`;

/**
 * Opens a legal page in the in-app browser (SFSafariViewController on iOS,
 * Custom Tabs on Android) rather than kicking the user out to Safari/Chrome.
 * Reviewers expect the link to work offline-of-context, so failures are
 * swallowed — a dead tap is better than an unhandled rejection.
 */
export async function openLegalLink(url: string): Promise<void> {
  try {
    await WebBrowser.openBrowserAsync(url, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      toolbarColor: colors.page,
      controlsColor: colors.gold,
    });
  } catch {
    // Non-fatal: no browser available, or the sheet was dismissed mid-open.
  }
}

export const openTerms = () => openLegalLink(TERMS_URL);
export const openPrivacy = () => openLegalLink(PRIVACY_URL);
export const openDeleteAccountInfo = () => openLegalLink(DELETE_ACCOUNT_INFO_URL);
export const openHelpCenter = () => openLegalLink(HELP_CENTER_URL);
