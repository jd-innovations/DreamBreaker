import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Dumb relay to Expo's push API. All recipient/mute resolution happens in
// Postgres (notify_new_message trigger, 20260708010000) — this function only
// forwards an already-resolved token list, so it needs no DB access at all.

interface PushRequest {
  tokens: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let payload: PushRequest;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const tokens = Array.isArray(payload.tokens)
    ? payload.tokens.filter((t): t is string => typeof t === "string" && t.startsWith("ExponentPushToken"))
    : [];

  if (tokens.length === 0 || !payload.title || !payload.body) {
    return new Response(JSON.stringify({ skipped: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const messages = tokens.map((to) => ({
    to,
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
    sound: "default",
  }));

  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
    },
    body: JSON.stringify(messages),
  });

  const result = await res.text();
  if (!res.ok) {
    console.error(`[expo push failed] ${res.status} ${result}`);
    return new Response(result, { status: 502 });
  }

  return new Response(result, { headers: { "Content-Type": "application/json" } });
});
