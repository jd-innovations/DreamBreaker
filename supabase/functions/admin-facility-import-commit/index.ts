import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Commits a facility-import dry run (facility_import_batches/rows, staged by
// admin_stage_facility_import under the admin's own session) into the real
// `facilities` table.
//
// This is the ONLY thing in the facility-import pipeline that needs an edge
// function at all — staging and review both run as plain admin-gated RPCs
// over the caller's own session (see the migration
// 20260908010000_facility_import_pipeline.sql). Committing needs
// service_role because updating an already-claimed/verified facility has no
// RLS policy that would let an ordinary authenticated admin do it (see
// 20260901090000_facilities_rls_hardening.sql) — "authenticated claim" only
// covers unclaimed rows, "owner update" only covers the owner.
//
// Same two-step trust pattern as refund-coach-purchase/claim_coach_refund:
// verify the caller's OWN JWT resolves to an admin first (so is_admin() sees
// the real actor), THEN switch to service_role for the privileged write —
// never the other way around. admin_commit_facility_import itself has no
// auth.uid() to check (service_role has no session), which is why it takes
// the resolved admin id as an explicit parameter instead.

const CORS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: CORS });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );

  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "not_authenticated" }), { status: 401, headers: CORS });
  }

  const { data: isAdmin, error: adminCheckError } = await userClient.rpc("is_admin");
  if (adminCheckError || isAdmin !== true) {
    return new Response(JSON.stringify({ error: "admin_only" }), { status: 403, headers: CORS });
  }

  let batchId = "";
  let decisions: Record<string, string> = {};
  try {
    const body = await req.json();
    batchId = typeof body.batchId === "string" ? body.batchId : "";
    decisions = (body.decisions && typeof body.decisions === "object") ? body.decisions : {};
  } catch {
    return new Response(JSON.stringify({ error: "bad_request" }), { status: 400, headers: CORS });
  }

  if (!batchId) {
    return new Response(JSON.stringify({ error: "bad_request", detail: "batchId is required" }), { status: 400, headers: CORS });
  }

  // Confirm the batch exists, is still dry_run, and belongs to this admin
  // session's view (RLS on facility_import_batches already restricts SELECT
  // to admins, so any admin can see any batch — that is intentional, this is
  // a shared admin tool, not a per-user one).
  const { data: batch, error: batchError } = await userClient
    .from("facility_import_batches")
    .select("id, status")
    .eq("id", batchId)
    .maybeSingle();

  if (batchError || !batch) {
    return new Response(JSON.stringify({ error: "batch_not_found" }), { status: 404, headers: CORS });
  }
  if (batch.status !== "dry_run") {
    return new Response(JSON.stringify({ error: "already_committed" }), { status: 409, headers: CORS });
  }

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data, error } = await service.rpc("admin_commit_facility_import", {
    p_batch_id: batchId,
    p_admin_id: user.id,
    p_decisions: decisions,
  });

  if (error) {
    console.error("[admin-facility-import-commit] commit failed", error.message);
    return new Response(JSON.stringify({ error: "commit_failed", detail: error.message }), { status: 500, headers: CORS });
  }

  const result = Array.isArray(data) ? data[0] : data;
  return new Response(JSON.stringify({
    ok: true,
    appliedCount: result?.applied_count ?? 0,
    skippedCount: result?.skipped_count ?? 0,
    errorCount: result?.error_count ?? 0,
  }), { headers: CORS });
});
