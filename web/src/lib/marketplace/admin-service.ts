// Data layer for /admin/marketplace. Everything runs under the admin's own
// session; the RPCs check is_admin() themselves (20260922160000).

import { createClient } from "@/lib/supabase/client";
import type { Database } from "@shared/database.types";
import { rpcErrorMessage } from "@/lib/campaigns/campaign-logic";

export type AdminListing = Database["public"]["Functions"]["admin_list_listings"]["Returns"][number];
type Result<T> = { ok: true; data: T } | { ok: false; message: string };

export const ADMIN_PAGE_SIZE = 50;

export const ADMIN_STATUS_FILTERS = [
  { value: "", label: "All listings" },
  { value: "active", label: "Active" },
  { value: "pending", label: "Pending" },
  { value: "sold", label: "Sold" },
  { value: "expired", label: "Expired" },
  { value: "deleted", label: "Deleted by seller" },
  { value: "removed", label: "Removed by admin" },
] as const;

export const REPORT_REASON_LABEL: Readonly<Record<string, string>> = {
  counterfeit: "Counterfeit",
  mislabeled: "Mislabeled",
  price_gouging: "Price gouging",
  spam_or_inappropriate: "Spam or inappropriate",
  harassment: "Harassment",
  hate_speech: "Hate speech",
  impersonation: "Impersonation",
  other: "Other",
};

export async function listListings(search: string, status: string, offset: number): Promise<Result<AdminListing[]>> {
  const { data, error } = await createClient().rpc("admin_list_listings", {
    p_search: search.trim() || undefined,
    p_status: status || undefined,
    p_limit: ADMIN_PAGE_SIZE,
    p_offset: offset,
  });
  if (error) return { ok: false, message: rpcErrorMessage(error) };
  return { ok: true, data: data ?? [] };
}

export async function removeListing(id: string, reason: string): Promise<Result<null>> {
  const { error } = await createClient().rpc("admin_remove_listing", { p_listing_id: id, p_reason: reason });
  return error ? { ok: false, message: rpcErrorMessage(error) } : { ok: true, data: null };
}

export async function restoreListing(id: string): Promise<Result<string>> {
  const { data, error } = await createClient().rpc("admin_restore_listing", { p_listing_id: id });
  return error || !data ? { ok: false, message: rpcErrorMessage(error) } : { ok: true, data };
}
