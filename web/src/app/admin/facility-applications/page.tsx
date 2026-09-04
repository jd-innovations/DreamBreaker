"use client";

/**
 * Admin review for facility manager applications.
 *
 * One decision covers two things: whether this person runs the venue, and
 * whether their corrections are right. Approving applies the edits AND writes
 * the facility_members owner row, so the reviewer sees the proposed diff
 * beside the claim rather than approving a name and discovering the data
 * changes later.
 *
 * Competing applications matter here — two people claiming one venue is
 * exactly the case worth catching before either is approved, so the count is
 * shown inline. Approving one auto-rejects the others.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { getUserId } from "@/lib/dev-user";

interface Application {
  id: string;
  applicant_id: string;
  applicant_name: string | null;
  applicant_email: string | null;
  facility_id: string | null;
  facility_name: string | null;
  is_new_facility: boolean;
  proposed: Record<string, unknown> | null;
  applicant_note: string | null;
  status: string;
  competing_applications: number;
  created_at: string;
}

const STATUSES = ["pending", "approved", "rejected", "withdrawn"] as const;

function humanKey(k: string) {
  return k.replace(/_/g, " ");
}

export default function FacilityApplicationsPage() {
  const router = useRouter();
  const supabase = createClient();

  const [status, setStatus] = useState<string>("pending");
  const [rows, setRows] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);

  const load = useCallback(async (s: string) => {
    setLoading(true);
    const { data, error } = await supabase.rpc("list_facility_manager_applications", { p_status: s });
    setLoading(false);
    if (error) {
      toast.error(error.message.includes("admin_only") ? "Admins only." : error.message);
      return;
    }
    setRows((data ?? []) as Application[]);
  }, [supabase]);

  useEffect(() => {
    (async () => {
      const userId = await getUserId();
      if (!userId) { router.push("/login"); return; }
      const { data: profile } = await supabase
        .from("profiles").select("role").eq("id", userId).maybeSingle();
      if (!profile || profile.role !== "admin") { router.push("/dashboard"); return; }
      await load("pending");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function decide(app: Application, approve: boolean) {
    const verb = approve ? "Approve" : "Reject";
    const note = window.prompt(
      approve
        ? "Note for the record (how did you verify this person runs the venue?):"
        : "Reason for rejection (the applicant sees this):",
      "",
    );
    if (note === null) return;
    if (approve && !note.trim()) {
      toast.error("An approval note is required — it is the record of how this was verified.");
      return;
    }

    setWorking(app.id);
    try {
      const fn = approve
        ? "approve_facility_manager_application"
        : "reject_facility_manager_application";
      const { error } = await supabase.rpc(fn, { p_id: app.id, p_review_note: note.trim() || undefined });
      if (error) {
        // check_court_subtotals is the realistic failure: applicant-proposed
        // court numbers that do not add up only fail here, at write time.
        toast.error(
          error.message.includes("check_court_subtotals")
            ? "Rejected by the database: total courts must be at least indoor + outdoor. Ask the applicant to resubmit."
            : error.message,
        );
        return;
      }
      toast.success(`${verb}d ${app.facility_name ?? app.proposed?.name ?? "application"}`);
      await load(status);
    } finally {
      setWorking(null);
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="font-display text-3xl tracking-wide">Facility manager applications</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Approving grants ownership of the venue and applies the corrections below. The
        applicant can then add their own staff without coming back here.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => { setStatus(s); void load(s); }}
            className={`rounded-full border px-4 py-1.5 text-xs font-semibold capitalize ${
              status === s ? "border-primary bg-primary text-primary-foreground" : "border-border"
            }`}
          >
            {s}
          </button>
        ))}
        <span className="ml-2 text-xs text-muted-foreground">
          {loading ? "Loading…" : `${rows.length} application${rows.length === 1 ? "" : "s"}`}
        </span>
      </div>

      <div className="mt-6 space-y-4">
        {!loading && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing {status} right now.</p>
        )}

        {rows.map((app) => {
          const proposed = Object.entries(app.proposed ?? {});
          return (
            <div key={app.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">
                    {app.facility_name ?? String(app.proposed?.name ?? "Unnamed facility")}
                    {app.is_new_facility && (
                      <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider">
                        new
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {app.applicant_name} · {app.applicant_email}
                  </div>
                </div>

                {app.status === "pending" && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={working === app.id}
                      onClick={() => void decide(app, true)}
                      className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-40"
                    >
                      {working === app.id ? "Working…" : "Approve"}
                    </button>
                    <button
                      type="button"
                      disabled={working === app.id}
                      onClick={() => void decide(app, false)}
                      className="rounded-full border border-border px-4 py-2 text-xs font-semibold disabled:opacity-40"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>

              {app.competing_applications > 0 && (
                <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                  {app.competing_applications} other pending application
                  {app.competing_applications === 1 ? "" : "s"} for this facility. Approving this
                  one rejects the others.
                </div>
              )}

              {app.applicant_note && (
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{app.applicant_note}</p>
              )}

              {proposed.length > 0 && (
                <div className="mt-3">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {app.is_new_facility ? "Facility details" : "Proposed corrections"}
                  </div>
                  <dl className="mt-1 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                    {proposed.map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-3 text-xs">
                        <dt className="text-muted-foreground capitalize">{humanKey(k)}</dt>
                        <dd className="truncate font-medium">{String(v ?? "—")}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
