import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ✨ Improve Listing (MARKETPLACE_V1_SPEC.md "AI Listing Improvement").
// Rewrites the seller's description for grammar/readability/professionalism
// and flags things the seller should see before publishing: contact info that
// belongs in chat rather than a public listing, and condition/description
// contradictions (e.g. condition="Like New" but description mentions a crack).
// Keeps CLAUDE_API server-side; the client only sends listing fields.

const ANTHROPIC_API_KEY = Deno.env.get("CLAUDE_API") ?? "";
const MODEL = "claude-haiku-4-5-20251001";

const CORS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const CONDITION_LABEL: Record<string, string> = {
  new: "New", like_new: "Like New", excellent: "Excellent", good: "Good", fair: "Fair",
};

type RequestBody = {
  brand?: unknown;
  model?: unknown;
  condition?: unknown;
  description?: unknown;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ available: false, reason: "method_not_allowed" }), { status: 405, headers: CORS });
  }
  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ available: false, reason: "not_configured" }), { status: 500, headers: CORS });
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ available: false, reason: "bad_request" }), { status: 400, headers: CORS });
  }

  const brand = typeof body.brand === "string" ? body.brand : "";
  const model = typeof body.model === "string" ? body.model : "";
  const conditionKey = typeof body.condition === "string" ? body.condition : "";
  const description = typeof body.description === "string" ? body.description : "";
  const conditionLabel = CONDITION_LABEL[conditionKey] ?? conditionKey;

  if (!brand || !model || !conditionLabel) {
    return new Response(JSON.stringify({ available: false, reason: "bad_request" }), { status: 400, headers: CORS });
  }

  const userPrompt =
    `Paddle: ${brand} ${model}\n` +
    `Condition: ${conditionLabel}\n` +
    `Seller's description (may be empty): ${JSON.stringify(description)}\n\n` +
    `Rewrite the description for a peer-to-peer pickleball paddle marketplace listing:\n` +
    `- Fix grammar, readability, and formatting; remove excessive punctuation/emoji.\n` +
    `- Keep it factual and no more than 300 characters. If the original is empty, ` +
    `write a short neutral placeholder inviting the seller to add details — do not invent condition or usage claims.\n` +
    `- Do not add promotional language or claims the seller didn't make.\n` +
    `- List a "warnings" array (each a short sentence, empty if none) for:\n` +
    `  1. Any phone number, email address, or social handle in the description (should stay in chat, not a public listing).\n` +
    `  2. Any contradiction between the stated Condition and something described (e.g. condition "Like New" but a crack, deep scratch, or heavy wear is mentioned).\n` +
    `Respond with ONLY a JSON object: {"description": string, "warnings": string[]}. No other text.`;

  let upstream: Response;
  try {
    upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 500,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
  } catch {
    return new Response(JSON.stringify({ available: false, reason: "upstream_error" }), { status: 502, headers: CORS });
  }

  if (!upstream.ok) {
    return new Response(JSON.stringify({ available: false, reason: "upstream_error" }), { status: 502, headers: CORS });
  }

  const json = await upstream.json().catch(() => null) as {
    content?: Array<{ type: string; text?: string }>;
  } | null;

  const text = json?.content?.find((c) => c.type === "text")?.text ?? "";
  const match = text.match(/\{[\s\S]*\}/);

  let parsed: { description?: unknown; warnings?: unknown } | null = null;
  try {
    parsed = match ? JSON.parse(match[0]) : null;
  } catch {
    parsed = null;
  }

  if (!parsed || typeof parsed.description !== "string" || !Array.isArray(parsed.warnings)) {
    return new Response(JSON.stringify({ available: false, reason: "upstream_error" }), { status: 502, headers: CORS });
  }

  const result = {
    available: true,
    description: parsed.description.slice(0, 300),
    warnings: parsed.warnings.filter((w): w is string => typeof w === "string"),
  };

  return new Response(JSON.stringify(result), { status: 200, headers: CORS });
});
