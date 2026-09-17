// Group-admin moderation view (GROUPS_WEB_PLAN.md §5b, new — mobile has no
// group-scoped moderation, reports only ever reach site-wide admins there).
// Backed by the RLS policy pair added in
// supabase/migrations/20260917083955_group_admin_moderation.sql, which lets
// a group's own admins/owners see and resolve reports filed within their
// group — additive, not a replacement for the existing site-wide admin
// policy, which keeps seeing everything regardless.

import { createClient } from "@/lib/supabase/client";
import type { GroupReport } from "./types";

export type GroupReportWithContent = GroupReport & {
  contentPreview: string | null;
  reporterName: string | null;
};

export async function fetchGroupReports(groupId: string): Promise<GroupReportWithContent[]> {
  const supabase = createClient();
  const { data: reports } = await supabase
    .from("group_post_reports")
    .select("*")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false });
  if (!reports || reports.length === 0) return [];

  const reporterIds = [...new Set(reports.map((r) => r.reporter_id))];
  const { data: reporters } = await supabase.from("profiles").select("id,full_name").in("id", reporterIds);
  const reporterMap = new Map((reporters ?? []).map((r) => [r.id, r.full_name]));

  const postIds = reports.filter((r) => r.target_type === "group_post").map((r) => r.target_id);
  const commentIds = reports.filter((r) => r.target_type === "group_comment").map((r) => r.target_id);
  const [{ data: posts }, { data: comments }] = await Promise.all([
    postIds.length > 0 ? supabase.from("group_posts").select("id,body").in("id", postIds) : Promise.resolve({ data: [] }),
    commentIds.length > 0 ? supabase.from("group_post_comments").select("id,body").in("id", commentIds) : Promise.resolve({ data: [] }),
  ]);
  const postMap = new Map((posts ?? []).map((p) => [p.id, p.body]));
  const commentMap = new Map((comments ?? []).map((c) => [c.id, c.body]));

  return reports.map((r) => ({
    ...r,
    reporterName: reporterMap.get(r.reporter_id) ?? null,
    contentPreview: r.target_type === "group_post" ? (postMap.get(r.target_id) ?? null) : (commentMap.get(r.target_id) ?? null),
  }));
}

export async function dismissReport(reportId: string, reviewerId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("group_post_reports")
    .update({ status: "dismissed", reviewed_by: reviewerId, reviewed_at: new Date().toISOString() })
    .eq("id", reportId);
  if (error) throw error;
}

export async function removeReportedContent(report: GroupReportWithContent, reviewerId: string): Promise<void> {
  const supabase = createClient();
  if (report.target_type === "group_post") {
    await supabase.from("group_posts").delete().eq("id", report.target_id);
  } else {
    await supabase.from("group_post_comments").delete().eq("id", report.target_id);
  }
  const { error } = await supabase
    .from("group_post_reports")
    .update({ status: "actioned", reviewed_by: reviewerId, reviewed_at: new Date().toISOString() })
    .eq("id", report.id);
  if (error) throw error;
}
