// The one statement of what a Pickleball App notification email looks like.
//
// Design: Header A (anchored navy band) + Footer B (navy bookend) — see
// EMAIL_NOTIFICATIONS_EXECUTION_PLAN.md. Both ends are navy in every theme,
// which is the whole reason that pairing was chosen: a navy block is already
// dark, so no mail client can invert it into something nobody designed.
//
// Everything here is table-based and inline-styled on purpose. Outlook on
// Windows renders through Word: no flex, no grid, no `gap`. Rounded corners and
// shadows are simply dropped there, which is accepted — the design degrades to
// square edges rather than breaking.
//
// ── Rules for template bodies (matters for Phase 5) ────────────────────────
// A body passed as `bodyHtml` MUST NOT set its own text colour. The shell owns
// colour so that dark mode works: in dark the card becomes #101A34, and a body
// carrying `color:#0A1228` would render navy-on-navy and vanish. Bodies should
// use structure (<p>, <strong>, <h2 class="dbp-h2">) and inherit colour.
//
// Images: hosted PNGs, never base64. Gmail clips a message over ~102 KB and
// hides the remainder behind "View entire message"; inline images blow that
// budget instantly. Every <img> carries width/height and styled alt text so a
// blocked-image inbox still reads as Pickleball App rather than a blank band.

const BRAND = {
  navy: "#0A1228",
  gold: "#C9A84C",
  white: "#FFFFFF",
  page: "#F3F6FC",
  border: "#E0E8F5",
  textLight: "#0A1228",
  mutedLight: "#5A6B8C",
  // Dark theme, from the app's own player-surface tokens.
  darkPage: "#050A18",
  darkCard: "#101A34",
  textDark: "#FFFFFF",
  mutedDark: "#B9C4DA",
  // Solid stand-in for rgba(255,255,255,0.10) over navy — pre-composited
  // because alpha colours are unreliable in Outlook.
  ruleOnNavy: "#232A3E",
} as const;

const TAGLINE = "Everything pickleball. One app.";
const SUPPORT_EMAIL = "support@pickleballapp.app";
const COMPANY = "JD Innovations LLC";
const ADDRESS = "11615 Gramercy Park Ave, Bradenton, FL 34211";

// TODO(phase-6): real profile URLs. Placeholders until the accounts are confirmed.
const SOCIALS = [
  { name: "Facebook", file: "social-facebook-v1.png", url: "https://facebook.com/" },
  { name: "Instagram", file: "social-instagram-v1.png", url: "https://instagram.com/" },
  { name: "YouTube", file: "social-youtube-v1.png", url: "https://youtube.com/" },
  { name: "TikTok", file: "social-tiktok-v1.png", url: "https://tiktok.com/" },
];

function defaultAssetBase(): string {
  const base = Deno.env.get("SUPABASE_URL") ?? "https://fbzetvkbhneptvfruilw.supabase.co";
  return `${base.replace(/\/+$/, "")}/storage/v1/object/public/email-assets`;
}

/** Escapes text destined for markup. Variable values reach here from callers. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only http(s) survives — blocks javascript: and data: in a CTA slot. */
function safeUrl(url: string): string {
  return /^https?:\/\//i.test(url.trim()) ? escapeHtml(url.trim()) : "#";
}

export interface EmailShellOptions {
  /** Inbox preview line after the subject. Plain text; escaped here. */
  preheader: string;
  /** Trusted, staff-authored markup. Must not set its own text colour. */
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  preferencesUrl: string;
  unsubscribeUrl?: string;
  assetBase?: string;
}

export function renderEmail(opts: EmailShellOptions): string {
  const A = (opts.assetBase ?? defaultAssetBase()).replace(/\/+$/, "");
  const pre = escapeHtml(opts.preheader);

  // Padding the preheader stops the client pulling body copy in after it.
  const preheaderPad = "&nbsp;&zwnj;".repeat(60);

  const cta = opts.ctaLabel && opts.ctaUrl
    ? `
              <tr><td height="28" style="height:28px;font-size:0;line-height:0;">&nbsp;</td></tr>
              <tr><td align="center">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                  <td align="center" bgcolor="${BRAND.gold}" style="background:${BRAND.gold};border-radius:26px;">
                    <a href="${safeUrl(opts.ctaUrl)}" style="display:inline-block;padding:16px 44px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:bold;letter-spacing:0.08em;color:${BRAND.navy};text-decoration:none;">${escapeHtml(opts.ctaLabel)}</a>
                  </td>
                </tr></table>
              </td></tr>`
    : "";

  // The alt text is coloured white and kept small on purpose: these sit on the
  // navy footer, so unstyled alt would fall back to dark-on-navy and disappear
  // in any inbox that blocks images.
  const socials = SOCIALS.map((s, i) =>
    // No left padding on the first icon: keeps the group flush right on desktop
    // and flush left once the footer stacks on a phone, with no CSS either way.
    `<td style="${i === 0 ? "" : "padding-left:10px;"}"><a href="${safeUrl(s.url)}"><img src="${A}/${s.file}" width="32" height="32" alt="${s.name}" style="display:block;border:0;width:32px;height:32px;color:${BRAND.white};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:bold;" /></a></td>`
  ).join("");

  const unsub = opts.unsubscribeUrl
    ? `<span style="padding:0 6px;color:${BRAND.mutedDark};">&#183;</span><a href="${safeUrl(opts.unsubscribeUrl)}" style="color:${BRAND.mutedDark};text-decoration:underline;">Unsubscribe</a>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  img { -ms-interpolation-mode:bicubic; }
  .dbp-body p { margin:0 0 14px 0; }
  .dbp-body p:last-child { margin-bottom:0; }
  .dbp-body a { color:${BRAND.navy}; }
  /* Progressive enhancement: honoured by Apple Mail, ignored by Outlook, and
     overridden by Gmail's own forced inversion. The navy header and footer
     look identical either way, so only the card needs to move. */
  @media (prefers-color-scheme: dark) {
    .dbp-page { background:${BRAND.darkPage} !important; }
    .dbp-card { background:${BRAND.darkCard} !important; }
    .dbp-body, .dbp-body p, .dbp-body strong, .dbp-body h2 { color:${BRAND.textDark} !important; }
    .dbp-body a { color:${BRAND.gold} !important; }
  }
  /* Phones. The card is fluid up to 600px rather than a fixed 600px table: a
     hard width made iOS Mail shrink the whole message to fit instead of
     reflowing it, which is what made the type unreadably small.
     Outlook on Windows ignores media queries AND max-width, so it is pinned to
     600px by the MSO ghost table below instead. */
  @media only screen and (max-width:600px) {
    .dbp-hpad   { padding-left:20px !important; padding-right:20px !important; }
    .dbp-header { padding:28px 20px !important; }
    .dbp-footer { padding:26px 20px 22px !important; }
    .dbp-logo   { width:250px !important; }
    .dbp-flogo  { width:150px !important; }
    /* Footer's two-column rows stack; side by side they crush below ~380px. */
    .dbp-stack     { display:block !important; width:100% !important; text-align:left !important; }
    .dbp-stack-gap { padding-top:14px !important; }
  }
</style>
</head>
<body class="dbp-page" style="margin:0;padding:0;background:${BRAND.page};">
<div style="display:none;font-size:1px;color:${BRAND.page};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${pre}${preheaderPad}</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="dbp-page" style="background:${BRAND.page};">
  <tr><td align="center" style="padding:24px 12px;">

    <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="dbp-card" style="width:100%;max-width:600px;margin:0 auto;background:${BRAND.white};">

      <!-- Header A -->
      <tr><td align="center" class="dbp-header" bgcolor="${BRAND.navy}" style="background:${BRAND.navy};padding:40px 32px;">
        <img src="${A}/logo-light-v1.png" width="380" height="71" alt="Pickleball App" class="dbp-logo"
             style="display:block;border:0;width:380px;max-width:100%;height:auto;color:${BRAND.white};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:22px;font-weight:bold;" />
      </td></tr>
      <tr><td height="3" bgcolor="${BRAND.gold}" style="height:3px;background:${BRAND.gold};font-size:0;line-height:0;">&nbsp;</td></tr>

      <!-- Body -->
      <tr><td class="dbp-body dbp-hpad" style="padding:36px 32px 40px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:${BRAND.textLight};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td class="dbp-body" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:${BRAND.textLight};">${opts.bodyHtml}</td></tr>${cta}
        </table>
      </td></tr>

      <!-- Footer B -->
      <tr><td height="3" bgcolor="${BRAND.gold}" style="height:3px;background:${BRAND.gold};font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td class="dbp-footer" bgcolor="${BRAND.navy}" style="background:${BRAND.navy};padding:30px 32px 26px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">

          <tr>
            <td align="left" valign="top" class="dbp-stack">
              <img src="${A}/logo-light-v1.png" width="168" height="31" alt="Pickleball App" class="dbp-flogo"
                   style="display:block;border:0;width:168px;height:auto;color:${BRAND.white};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;font-weight:bold;" />
              <div style="padding-top:9px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;color:${BRAND.mutedDark};">${TAGLINE}</div>
            </td>
            <td align="right" valign="top" class="dbp-stack dbp-stack-gap">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="left"><tr>${socials}</tr></table>
            </td>
          </tr>

          <tr><td colspan="2" height="20" style="height:20px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td colspan="2" height="1" bgcolor="${BRAND.ruleOnNavy}" style="height:1px;background:${BRAND.ruleOnNavy};font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td colspan="2" height="20" style="height:20px;font-size:0;line-height:0;">&nbsp;</td></tr>

          <tr>
            <td align="left" class="dbp-stack" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;">
              <a href="mailto:${SUPPORT_EMAIL}" style="color:${BRAND.gold};text-decoration:none;font-weight:bold;">${SUPPORT_EMAIL}</a>
            </td>
            <td align="right" class="dbp-stack dbp-stack-gap" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:${BRAND.mutedDark};">
              <a href="${safeUrl(opts.preferencesUrl)}" style="color:${BRAND.mutedDark};text-decoration:underline;">Notification preferences</a>${unsub}
            </td>
          </tr>

          <tr><td colspan="2" height="16" style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td colspan="2" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:${BRAND.mutedDark};">
            ${COMPANY} &#183; ${ADDRESS}<br />&#169; ${new Date().getUTCFullYear()} Pickleball App. All rights reserved.
          </td></tr>

        </table>
      </td></tr>

    </table>
    <!--[if mso]></td></tr></table><![endif]-->
  </td></tr>
</table>
</body>
</html>`;
}

/**
 * Plain-text alternative. HTML-only mail is spam-scored, so every send should
 * carry both. Callers without a hand-written text body get a derived one.
 */
export function renderText(opts: {
  preheader: string;
  bodyText?: string;
  bodyHtml?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  preferencesUrl: string;
  unsubscribeUrl?: string;
}): string {
  const body = opts.bodyText ?? htmlToText(opts.bodyHtml ?? "");
  const lines = [opts.preheader, "", body];

  if (opts.ctaLabel && opts.ctaUrl) lines.push("", `${opts.ctaLabel}: ${opts.ctaUrl}`);

  lines.push(
    "",
    "—",
    `Pickleball App — ${TAGLINE}`,
    SUPPORT_EMAIL,
    `Notification preferences: ${opts.preferencesUrl}`,
  );
  if (opts.unsubscribeUrl) lines.push(`Unsubscribe: ${opts.unsubscribeUrl}`);
  lines.push(`${COMPANY} · ${ADDRESS}`);

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function htmlToText(html: string): string {
  return html
    .replace(/<\s*(br|\/p|\/div|\/h[1-6]|\/tr)\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#8217;/g, "’")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
