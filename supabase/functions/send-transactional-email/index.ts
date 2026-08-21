import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderEmail, renderText } from "../_shared/email-shell.ts";

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

// Stand-ins used only when previewing with the shell. Real values arrive in
// Phase 6 (a `preheader` column and signed per-recipient preference links).
const PREVIEW_PREFERENCES_URL = "https://pickleballapp.app/settings/notifications";

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
    return value;
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

  if (payload.templateKey) {
    const { data: template, error } = await supabase
      .from("email_templates")
      .select("subject, html_body, enabled")
      .eq("key", payload.templateKey)
      .maybeSingle();

    if (error || !template) {
      return new Response(JSON.stringify({ error: `Template not found: ${payload.templateKey}` }), { status: 404 });
    }
    // A disabled template still renders for a preview — disabling one is often
    // the first step in fixing it, and you cannot fix what you cannot see. The
    // disabled state travels in the response so the preview can show it.
    if (!template.enabled && !payload.dryRun) {
      return new Response(JSON.stringify({ skipped: true, reason: "template disabled" }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    templateEnabled = template.enabled;

    const variables = payload.variables ?? {};
    const subjectResult = substitute(template.subject, variables);
    const htmlResult = substitute(template.html_body, variables);

    // Refuse to send a half-rendered email. Callers reach this function through
    // pg_net (fire-and-forget), so this 422 does not surface to the trigger and
    // cannot abort its transaction — the edge function log is where it is loud.
    const missing = [...new Set([...subjectResult.missing, ...htmlResult.missing])];
    if (missing.length > 0) {
      console.error(
        `[send-transactional-email] unresolved variables for template "${payload.templateKey}": ` +
          `${missing.join(", ")} — nothing sent`,
      );
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
  }

  if (!subject || !html) {
    return new Response(JSON.stringify({ error: "Missing subject/html (or a valid templateKey)" }), { status: 400 });
  }

  // Stop here for a preview. Everything above — template lookup, the disabled
  // check, substitution, the unresolved-variable 422 — has already run, so a
  // dry run exercises the real path and fails in the same places a real send
  // would. Only the Resend call is skipped.
  if (payload.dryRun) {
    const shell = payload.withShell === true;
    const renderedHtml = shell
      ? renderEmail({
        preheader: subject,
        bodyHtml: html,
        preferencesUrl: PREVIEW_PREFERENCES_URL,
      })
      : html;
    const text = shell
      ? renderText({ preheader: subject, bodyHtml: html, preferencesUrl: PREVIEW_PREFERENCES_URL })
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

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
      ...(payload.idempotencyKey ? { "Idempotency-Key": payload.idempotencyKey } : {}),
    },
    body: JSON.stringify({ from: FROM, to: payload.to, subject, html }),
  });

  const result = await res.text();
  if (!res.ok) {
    console.error(`[resend send failed] ${res.status} ${result}`);
    return new Response(result, { status: res.status === 409 ? 409 : 502 });
  }

  return new Response(result, { headers: { "Content-Type": "application/json" } });
});
