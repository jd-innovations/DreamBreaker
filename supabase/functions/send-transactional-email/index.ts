import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Single shared sender for all real transactional email in this app —
// either template-driven (looks up email_templates by key, substitutes
// {{variable}} tokens) or ad-hoc (caller supplies subject/html directly,
// used by the admin Communications broadcast composer). Not a relay like
// send-message-push: this one owns the real Resend secret and is the only
// place it should ever live.

const FROM = "DreamBreakerPB <notifications@pickleballapp.app>";

interface EmailRequest {
  to: string | string[];
  templateKey?: string;
  variables?: Record<string, string>;
  subject?: string;
  html?: string;
  idempotencyKey?: string;
}

function substitute(text: string, variables: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => variables[key] ?? match);
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
  if (!resendKey) {
    console.error("[send-transactional-email] RESEND_API_KEY not set");
    return new Response(JSON.stringify({ error: "Email sending not configured" }), { status: 500 });
  }

  let payload: EmailRequest;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  if (!payload.to) {
    return new Response(JSON.stringify({ error: "Missing `to`" }), { status: 400 });
  }

  let subject = payload.subject;
  let html = payload.html;

  if (payload.templateKey) {
    const { data: template, error } = await supabase
      .from("email_templates")
      .select("subject, html_body, enabled")
      .eq("key", payload.templateKey)
      .maybeSingle();

    if (error || !template) {
      return new Response(JSON.stringify({ error: `Template not found: ${payload.templateKey}` }), { status: 404 });
    }
    if (!template.enabled) {
      return new Response(JSON.stringify({ skipped: true, reason: "template disabled" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const variables = payload.variables ?? {};
    subject = substitute(template.subject, variables);
    html = substitute(template.html_body, variables);
  }

  if (!subject || !html) {
    return new Response(JSON.stringify({ error: "Missing subject/html (or a valid templateKey)" }), { status: 400 });
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
