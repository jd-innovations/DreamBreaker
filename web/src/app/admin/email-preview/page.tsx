"use client";

/**
 * Admin email preview. Renders any template through the REAL sending path —
 * `send-transactional-email` with `dryRun: true` — so what appears here is what
 * Resend would receive, minus the send.
 *
 * It deliberately does not render the shell itself. The shell is a Deno module
 * under supabase/functions/_shared/ that this Next.js app cannot import, and a
 * second copy would drift from the one that actually sends. Everything comes
 * back from the function.
 *
 * "With shell" is the Phase 5 workflow: templates still store whole documents
 * and are not wrapped when sent, so this toggle is how you check a template's
 * wrapped appearance before migrating it.
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { getUserId } from "@/lib/dev-user";

interface TemplateRow {
  key: string;
  name: string;
  subject: string;
  variables: string[] | null;
  enabled: boolean;
}

interface DryRunResult {
  subject: string;
  html: string;
  text?: string;
  shell: boolean;
  enabled: boolean;
  bytes: number;
}

// Readable stand-ins so a preview reads like a real email rather than {{tokens}}.
const SAMPLE: Record<string, string> = {
  tournament_name: "Caledar Tournament Test",
  full_name: "Jesus",
  reason: "The venue could not be confirmed for those dates.",
  subject: "Cannot check in with the QR scanner",
  reporter_name: "Jesus",
  message_preview: "Thanks for flagging this — we've reproduced it and a fix is going out today.",
  link_url: "https://pickleballapp.app/tournaments/abc123",
};

export default function EmailPreviewPage() {
  const router = useRouter();
  const supabase = createClient();

  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [vars, setVars] = useState<Record<string, string>>({});
  const [withShell, setWithShell] = useState(true);
  const [dark, setDark] = useState(false);
  const [result, setResult] = useState<DryRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Same admin guard the main admin page uses.
  useEffect(() => {
    (async () => {
      const userId = await getUserId();
      if (!userId) { router.push("/login"); return; }
      const { data: profile } = await supabase
        .from("profiles").select("role").eq("id", userId).maybeSingle();
      if (!profile || profile.role !== "admin") { router.push("/dashboard"); return; }

      const { data, error: e } = await supabase
        .from("email_templates")
        .select("key, name, subject, variables, enabled")
        .order("key");
      if (e) { toast.error("Could not load templates"); return; }
      setTemplates((data ?? []) as TemplateRow[]);
      if (data?.length) setSelected(data[0].key);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Seed the variable inputs whenever the chosen template changes.
  //
  // TODO(lint): this should use React's adjust-state-during-render pattern
  // rather than an effect. Deferred deliberately: `vars` is user-editable and
  // seeded from the template, so a naive conversion re-seeds on every render
  // and silently discards whatever the operator typed. Fixing it properly
  // needs a "seeded for which template" guard and a test of the edit-then-
  // switch-template path. Tracked in TODO1.1_EXECUTION_PLAN.md (2.4 follow-on).
  useEffect(() => {
    const t = templates.find((x) => x.key === selected);
    if (!t) return;
    const next: Record<string, string> = {};
    for (const v of t.variables ?? []) next[v] = SAMPLE[v] ?? `[${v}]`;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVars(next);
  }, [selected, templates]);

  const render = useCallback(async () => {
    if (!selected) return;
    setLoading(true);
    setError(null);
    const { data, error: e } = await supabase.functions.invoke("send-transactional-email", {
      body: { templateKey: selected, variables: vars, dryRun: true, withShell },
    });
    setLoading(false);

    if (e) {
      // A 422 here is the unresolved-variable guard doing its job — surface it
      // as the real finding it is, not as a generic failure.
      const detail = (data as { missing?: string[] } | null)?.missing;
      setResult(null);
      setError(detail?.length ? `Unresolved variables: ${detail.join(", ")}` : e.message);
      return;
    }
    setResult(data as DryRunResult);
  }, [selected, vars, withShell, supabase]);

  // TODO(lint): same rule. `render()` sets loading/error synchronously before
  // awaiting, which the cascading-render rule flags. Untangling it means
  // reworking how this page reports in-flight state; deferred with the above.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void render(); }, [render]);

  const current = templates.find((t) => t.key === selected);

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "system-ui, sans-serif" }}>
      {/* Controls */}
      <aside style={{ width: 340, borderRight: "1px solid #E0E8F5", padding: 20, overflowY: "auto" }}>
        <h1 style={{ fontSize: 17, fontWeight: 800, margin: "0 0 4px" }}>Email preview</h1>
        <p style={{ fontSize: 12, color: "#5A6B8C", margin: "0 0 20px" }}>
          Rendered by the real send path. Nothing is emailed.
        </p>

        <label style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em" }}>TEMPLATE</label>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          style={{ width: "100%", padding: 8, margin: "6px 0 16px", borderRadius: 8, border: "1px solid #E0E8F5" }}
        >
          {templates.map((t) => (
            <option key={t.key} value={t.key}>{t.name}{t.enabled ? "" : " (disabled)"}</option>
          ))}
        </select>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          <label style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={withShell} onChange={(e) => setWithShell(e.target.checked)} />
            Wrap in shell (Header A + Footer B)
          </label>
          <label style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={dark} onChange={(e) => setDark(e.target.checked)} />
            Dark preview
          </label>
        </div>

        {Object.keys(vars).length > 0 && (
          <>
            <label style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em" }}>VARIABLES</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "6px 0 16px" }}>
              {Object.entries(vars).map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontSize: 11, color: "#5A6B8C" }}>{k}</div>
                  <input
                    value={v}
                    onChange={(e) => setVars({ ...vars, [k]: e.target.value })}
                    style={{ width: "100%", padding: 6, borderRadius: 6, border: "1px solid #E0E8F5", fontSize: 13 }}
                  />
                </div>
              ))}
            </div>
            <button
              onClick={() => setVars(Object.fromEntries(Object.keys(vars).map((k) => [k, ""])))}
              style={{ fontSize: 12, padding: "6px 10px", borderRadius: 6, border: "1px solid #E0E8F5", background: "#fff", cursor: "pointer" }}
            >
              Clear all — should 422
            </button>
          </>
        )}

        {current && (
          <p style={{ fontSize: 11, color: "#5A6B8C", marginTop: 20, lineHeight: 1.6 }}>
            <strong>Subject:</strong> {result?.subject ?? current.subject}<br />
            {result && !result.enabled && <><strong style={{color:"#B45309"}}>Template is disabled</strong><br /></>}
            {result && <><strong>Size:</strong> {(result.bytes / 1024).toFixed(1)} KB{result.bytes > 102400 && " — over Gmail's clip threshold"}</>}
          </p>
        )}
      </aside>

      {/* Preview */}
      <main style={{ flex: 1, background: dark ? "#050A18" : "#F3F6FC", overflow: "auto" }}>
        {error && (
          <pre style={{ margin: 20, padding: 16, borderRadius: 8, background: "#FEF2F2", color: "#991B1B", fontSize: 13, whiteSpace: "pre-wrap" }}>
            {error}
          </pre>
        )}
        {loading && <p style={{ padding: 20, color: "#5A6B8C" }}>Rendering…</p>}
        {result && !error && (
          <iframe
            title="Email preview"
            srcDoc={result.html}
            style={{ width: "100%", height: "100%", border: 0, colorScheme: dark ? "dark" : "light" }}
            sandbox=""
          />
        )}
      </main>
    </div>
  );
}
