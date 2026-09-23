// Coach-offer moderation — /admin/coaching.
//
// Deliberately the same shape as lib/marketplace/admin-service.ts: an admin who
// has moderated a listing already knows how to moderate a lesson. Every RPC
// re-checks is_admin() itself, so this module is convenience, not the boundary.

import { createClient } from "@/lib/supabase/client";

export const ADMIN_OFFER_PAGE_SIZE = 25;

export const ADMIN_OFFER_STATUS_FILTERS = [
  { value: "", label: "All offers" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "draft", label: "Draft" },
  { value: "archived", label: "Archived" },
  { value: "removed", label: "Removed by admin" },
] as const;

export interface AdminOffer {
  id: string;
  title: string;
  offer_type: string;
  status: string;
  removed_at: string | null;
  regular_price_cents: number;
  discounted_price_cents: number | null;
  quantity_remaining: number | null;
  coach_id: string;
  coach_name: string | null;
  coach_email: string | null;
  facility_name: string | null;
  city: string | null;
  state: string | null;
  created_at: string;
  purchase_count: number;
  last_removed_reason: string | null;
  total_count: number;
}

export type Result<T> = { ok: true; data: T } | { ok: false; message: string };

export async function listCoachOffers(
  search: string, status: string, offset: number,
): Promise<Result<AdminOffer[]>> {
  const { data, error } = await createClient().rpc("admin_list_coach_offers", {
    p_search: search.trim() || undefined,
    p_status: status || undefined,
    p_offset: offset,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: (data ?? []) as AdminOffer[] };
}

export async function removeCoachOffer(id: string, reason: string): Promise<Result<null>> {
  const { error } = await createClient().rpc("admin_remove_coach_offer", {
    p_offer_id: id, p_reason: reason.trim(),
  });
  if (error) {
    // The database refuses a thin reason; say which rule was hit rather than
    // showing a raw SQLSTATE to an operator.
    if (error.message.includes("reason_required")) {
      return { ok: false, message: "Give a reason — the coach is shown it." };
    }
    return { ok: false, message: error.message };
  }
  return { ok: true, data: null };
}

export async function restoreCoachOffer(id: string): Promise<Result<string>> {
  const { data, error } = await createClient().rpc("admin_restore_coach_offer", { p_offer_id: id });
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: (data as string) ?? "paused" };
}
