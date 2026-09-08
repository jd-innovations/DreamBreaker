import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { escapeHtml, renderEmail, renderText } from "../_shared/email-shell.ts";

// Single shared sender for all real transactional email in this app —
// either template-driven (looks up email_templates by key, substitutes
// {{variable}} tokens) or ad-hoc (caller supplies subject/html directly,
// used by the admin Communications broadcast composer). Not a relay like
// send-message-push: this one owns the real Resend secret and is the only
// place it should ever live.

const FROM = "Pickleball App <notifications@pickleballapp.app>";

interface EmailRequest {
  to: string | string[];
  templateKey?: string;
  variables?: Record<string, string>;
  subject?: string;
  html?: string;
  idempotencyKey?: string;
  /**
   * Render and return what WOULD be sent, without calling Resend. Backs the
   * admin preview at /admin/email-preview. Deliberately shares this handler
   * rather than re-rendering in the web app: the shell is a Deno module the
   * Next.js side cannot import, and a second implementation would drift from
   * the one that actually sends.
   */
  dryRun?: boolean;
  /**
   * Preview only. Wraps the body in the email shell even though live sending
   * does not wrap yet (that is gated on the `layout` column in Phase 4). This
   * is what lets Phase 5 check a template's wrapped appearance BEFORE
   * migrating it. Ignored unless `dryRun` is set.
   */
  withShell?: boolean;
}

// TODO(phase-6): these are the same link for everyone. They need to become
// signed per-recipient URLs so they work from a mail client with no session.
const PREFERENCES_URL = "https://pickleballapp.app/settings/notifications";
const UNSUBSCRIBE_URL = "https://pickleballapp.app/settings/notifications";

// Every terminal outcome writes one row. public.email_log has existed since the
// baseline with exactly the right shape and NOTHING has ever written to it,
// which is why the mail-dropping incident of 2026-08-21 was invisible: the
// callers reach this function through pg_net fire-and-forget, so a 422 surfaces
// nowhere. This is the record that makes failures findable.
async function logEmail(row: {
  to_email: string;
  subject: string | null;
  template_key: string | null;
  status: string;
  error?: string | null;
  provider_id?: string | null;
}) {
  const { error } = await supabase.from("email_log").insert(row);
  // Never let bookkeeping break a send that otherwise worked.
  if (error) console.error(`[email_log] insert failed: ${error.message}`);
}

function recipientLabel(to: string | string[] | undefined): string {
  return Array.isArray(to) ? to.join(", ") : (to ?? "(none)");
}

// Substitutes {{token}} and REPORTS what it could not resolve. The reporting
// half is the point: this used to be `variables[key] ?? match`, which left an
// unresolved token in place and sent it — a caller that forgot a variable
// mailed a real user "You're registered for {{tournament_name}}". Callers are
// all code (DB triggers in 20260807000000_transactional_email.sql, plus
// waitlist-sweeper), never a human composing a message, so a missing variable
// is always a bug and never a state worth delivering.
//
// null counts as missing alongside undefined: the old `??` treated it that way,
// and substituting it would put the literal string "null" into an email.
// An empty string is left alone — that is an explicit "this field is blank".
//
// Values are HTML-ESCAPED. Not every value is staff-authored: `full_name` is
// whatever a user typed into their profile, and `subject` is a support ticket
// title — both reach an admin's inbox. Unescaped, either could carry a live
// `<a href>` into mail that appears to come from us, which is a phishing
// surface even though mail clients do not execute script.
//
// Escaping is correct in BOTH positions these values appear in. In text it is
// obvious; inside an `href` it is also right, because `&` -> `&amp;` is how a
// URL's query separators are spelled in HTML and parses back to the same URL.
function substitute(
  text: string,
  variables: Record<string, string>,
): { text: string; missing: string[] } {
  const missing = new Set<string>();
  const out = text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = variables[key];
    if (value === undefined || value === null) {
      missing.add(key);
      return match;
    }
    return escapeHtml(String(value));
  });
  return { text: out, missing: [...missing] };
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const resendKey = Deno.env.get("RESEND_API_KEY");

  let payload: EmailRequest;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  // A preview has no recipient and needs no Resend credentials — it never
  // reaches Resend. Both checks are therefore scoped to real sends, so the
  // preview keeps working in an environment where the secret is not set.
  if (!payload.dryRun) {
    if (!resendKey) {
      console.error("[send-transactional-email] RESEND_API_KEY not set");
      return new Response(JSON.stringify({ error: "Email sending not configured" }), { status: 500 });
    }
    if (!payload.to) {
      return new Response(JSON.stringify({ error: "Missing `to`" }), { status: 400 });
    }
  }

  let subject = payload.subject;
  let html = payload.html;
  let templateEnabled = true;
  let layout: string | null = null;
  let preheader: string | null = null;

  if (payload.templateKey) {
    const { data: template, error } = await supabase
      .from("email_templates")
      .select("subject, html_body, enabled, layout, preheader")
      .eq("key", payload.templateKey)
      .maybeSingle();

    if (error || !template) {
      return new Response(JSON.stringify({ error: `Template not found: ${payload.templateKey}` }), { status: 404 });
    }
    // A disabled template still renders for a preview — disabling one is often
    // the first step in fixing it, and you cannot fix what you cannot see. The
    // disabled state travels in the response so the preview can show it.
    if (!template.enabled && !payload.dryRun) {
      await logEmail({
        to_email: recipientLabel(payload.to),
        subject: template.subject,
        template_key: payload.templateKey,
        status: "skipped_disabled",
      });
      return new Response(JSON.stringify({ skipped: true, reason: "template disabled" }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    templateEnabled = template.enabled;
    layout = template.layout ?? null;
    preheader = template.preheader ?? null;

    const variables = payload.variables ?? {};
    const subjectResult = substitute(template.subject, variables);
    const htmlResult = substitute(template.html_body, variables);

    // Refuse to send a half-rendered email. Callers reach this function through
    // pg_net (fire-and-forget), so this 422 does not surface to the trigger and
    // cannot abort its transaction — the edge function log is where it is loud.
    const preheaderResult = preheader ? substitute(preheader, variables) : { text: "", missing: [] };
    const missing = [...new Set([...subjectResult.missing, ...htmlResult.missing, ...preheaderResult.missing])];
    if (missing.length > 0) {
      console.error(
        `[send-transactional-email] unresolved variables for template "${payload.templateKey}": ` +
          `${missing.join(", ")} — nothing sent`,
      );
      if (!payload.dryRun) {
        await logEmail({
          to_email: recipientLabel(payload.to),
          subject: template.subject,
          template_key: payload.templateKey,
          status: "unresolved_variables",
          error: `missing: ${missing.join(", ")}`,
        });
      }
      return new Response(
        JSON.stringify({
          error: "Unresolved template variables",
          templateKey: payload.templateKey,
          missing,
        }),
        { status: 422, headers: { "Content-Type": "application/json" } },
      );
    }

    subject = subjectResult.text;
    html = htmlResult.text;
    // The preheader may carry variables of its own. It is checked for
    // unresolved tokens alongside the others above.
    if (preheader) preheader = substitute(preheader, variables).text;
  }

  if (!subject || !html) {
    return new Response(JSON.stringify({ error: "Missing subject/html (or a valid templateKey)" }), { status: 400 });
  }

  // Stop here for a preview. Everything above — template lookup, the disabled
  // check, substitution, the unresolved-variable 422 — has already run, so a
  // dry run exercises the real path and fails in the same places a real send
  // would. Only the Resend call is skipped.
  if (payload.dryRun) {
    // Default to what a real send would do; withShell overrides so Phase 5 can
    // inspect a template's wrapped look before its layout is set.
    const shell = payload.withShell ?? (layout !== null);
    const renderedHtml = shell
      ? renderEmail({
        preheader: subject,
        bodyHtml: html,
        preferencesUrl: PREFERENCES_URL,
      })
      : html;
    const text = shell
      ? renderText({ preheader: subject, bodyHtml: html, preferencesUrl: PREFERENCES_URL })
      : undefined;

    return new Response(
      JSON.stringify({
        dryRun: true,
        shell,
        enabled: templateEnabled,
        subject,
        html: renderedHtml,
        text,
        bytes: new TextEncoder().encode(renderedHtml).length,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  // ── The wrap gate ──────────────────────────────────────────────────────────
  // layout NULL means the body is still a whole legacy <div> document; wrapping
  // it would nest a document inside the shell's own. Only migrated templates
  // (Phase 5) carry a layout, so this is inert until each one is switched on.
  //
  // The value also decides the footer: an unsubscribe link is required on
  // notification mail and wrong on a receipt — you cannot unsubscribe from the
  // confirmation for something you paid for.
  let finalHtml = html;
  let finalText: string | undefined;
  if (layout) {
    const shellOpts = {
      preheader: preheader ?? subject,
      bodyHtml: html,
      preferencesUrl: PREFERENCES_URL,
      unsubscribeUrl: layout === "notification" ? UNSUBSCRIBE_URL : undefined,
    };
    finalHtml = renderEmail(shellOpts);
    // HTML-only mail is spam-scored; a wrapped send always carries both parts.
    finalText = renderText(shellOpts);
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
      ...(payload.idempotencyKey ? { "Idempotency-Key": payload.idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from: FROM,
      to: payload.to,
      subject,
      html: finalHtml,
      ...(finalText ? { text: finalText } : {}),
    }),
  });

  const result = await res.text();
  if (!res.ok) {
    console.error(`[resend send failed] ${res.status} ${result}`);
    await logEmail({
      to_email: recipientLabel(payload.to),
      subject,
      template_key: payload.templateKey ?? null,
      status: "failed",
      error: `${res.status} ${result}`.slice(0, 1000),
    });
    return new Response(result, { status: res.status === 409 ? 409 : 502 });
  }

  let providerId: string | null = null;
  try { providerId = JSON.parse(result)?.id ?? null; } catch { /* body is not JSON */ }
  await logEmail({
    to_email: recipientLabel(payload.to),
    subject,
    template_key: payload.templateKey ?? null,
    status: "sent",
    provider_id: providerId,
  });

  return new Response(result, { headers: { "Content-Type": "application/json" } });
});
