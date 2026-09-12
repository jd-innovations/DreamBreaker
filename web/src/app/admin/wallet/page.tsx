"use client";

/**
 * Admin wallet grants.
 *
 * Until this screen, exactly one thing could create a wallet item —
 * create_coach_voucher_from_finalized_purchase(), after a Stripe payment. Every
 * other type had to be inserted by hand, which is how six demo rows sat in
 * production from 2026-07-20 to 2026-09-11 with no record of who made them or
 * why. This is the audited replacement.
 *
 * The browser calls the RPCs directly, as every other admin screen here does.
 * That works because EXECUTE is granted to `authenticated` and the real gate is
 * the is_admin() check INSIDE each function, evaluated against the caller. The
 * guard below is a redirect for the wrong audience, not a security boundary —
 * a non-admin who calls the RPC anyway gets `admin_only` from Postgres.
 *
 * Item 1.2 of MEMBERSHIP_EXECUTION_PLAN.md.
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { getUserId } from "@/lib/dev-user";

// Only the types admin_grant_wallet_item accepts. `credit` and `membership` are
// excluded server-side too: nothing decrements remaining_value_amount and no
// membership confers anything, so granting either would produce a card that
// looks like value and does nothing.
const GRANTABLE_TYPES = ["offer", "reward", "pass", "ticket"] as const;
type GrantableType = (typeof GRANTABLE_TYPES)[number];

const ACTION_TYPES = ["view_details", "external_url", "none"] as const;

interface Person {
  id: string;
  full_name: string | null;
  email: string | null;
}

interface Item {
  id: string;
  type: string;
  status: string;
  title: string;
  subtitle: string | null;
  value_label: string | null;
  source_type: string | null;
  source_id: string | null;
  expires_at: string | null;
  created_at: string;
  revoke_reason: string | null;
}

interface Partner {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
}

interface PromoStock {
  partner_id: string;
  partner_slug: string;
  partner_name: string;
  available: number;
  assigned: number;
  voided: number;
}

// The pool RPCs land in database.types.ts only once the migration is applied
// and `supabase gen types` is re-run. Until then the typed client rejects the
// names. This is the single place that gap is bridged — DELETE IT and call
// supabase.rpc() directly as soon as the types are regenerated.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedRpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>;

interface Membership {
  id: string;
  status: string;
  tier: string;
  source: string;
  expires_at: string | null;
  granted_note: string | null;
  revoke_reason: string | null;
}

export default function AdminWalletPage() {
  const router = useRouter();
  const supabase = createClient();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Person[]>([]);
  const [person, setPerson] = useState<Person | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [membershipExpiry, setMembershipExpiry] = useState("");
  // Derived when the row arrives, not during render: expiry needs Date.now(),
  // which is impure and unstable across re-renders (react-hooks/purity).
  const [isActiveMember, setIsActiveMember] = useState(false);

  // Pool state is global rather than person-scoped: how many codes are left is
  // the thing to know BEFORE choosing who to comp.
  const [stock, setStock] = useState<PromoStock[]>([]);
  const [poolPartnerId, setPoolPartnerId] = useState("");
  const [batchLabel, setBatchLabel] = useState("");
  const [codesText, setCodesText] = useState("");
  const [uploading, setUploading] = useState(false);

  const [form, setForm] = useState({
    type: "offer" as GrantableType,
    title: "",
    subtitle: "",
    valueLabel: "",
    partnerId: "",
    actionType: "view_details" as (typeof ACTION_TYPES)[number],
    actionUrl: "",
    expiresAt: "",
    sourceId: "",
    note: "",
  });

  const loadStock = useCallback(async () => {
    const rpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc;
    const { data, error } = await rpc("admin_promo_code_stock");
    if (error) { toast.error(error.message); return; }
    setStock((data ?? []) as PromoStock[]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      const userId = await getUserId();
      if (!userId) { router.push("/login"); return; }
      const { data: profile } = await supabase
        .from("profiles").select("role").eq("id", userId).maybeSingle();
      if (!profile || profile.role !== "admin") { router.push("/dashboard"); return; }
      const { data } = await supabase
        .from("wallet_partners").select("id,name,slug,is_active").order("name");
      const rows = (data ?? []) as Partner[];
      setPartners(rows);
      setPoolPartnerId(rows.find((x) => x.slug === "pickleball-grip-doctor")?.id ?? "");
      await loadStock();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadItems = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("wallet_items")
      .select("id,type,status,title,subtitle,value_label,source_type,source_id,expires_at,created_at,revoke_reason")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) { toast.error(error.message); return; }
    setItems((data ?? []) as Item[]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function search() {
    const q = query.trim();
    if (q.length < 3) { toast.error("Type at least 3 characters."); return; }
    setSearching(true);
    try {
      // Email first, because an admin acting on a support request has an email
      // in front of them and a name is ambiguous.
      const { data, error } = await supabase
        .from("profiles")
        .select("id,full_name,email")
        .or(`email.ilike.%${q}%,full_name.ilike.%${q}%`)
        .limit(10);
      if (error) { toast.error(error.message); return; }
      setResults((data ?? []) as Person[]);
      if ((data ?? []).length === 0) toast.error("No match.");
    } finally {
      setSearching(false);
    }
  }

  async function uploadCodes() {
    // One code per line, or comma-separated — a CSV export of one column is
    // both, depending on who exported it, and the server trims and skips
    // blanks anyway.
    const codes = codesText
      .split(/[\r\n,]+/)
      .map((c) => c.trim())
      .filter(Boolean);

    if (!poolPartnerId) { toast.error("Choose a partner."); return; }
    if (codes.length === 0) { toast.error("Paste at least one code."); return; }

    setUploading(true);
    try {
      const rpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc;
      const { data, error } = await rpc("admin_upload_promo_codes", {
        p_partner_id: poolPartnerId,
        p_codes: codes,
        p_batch_label: batchLabel.trim() || undefined,
      });
      if (error) { toast.error(grantError(error.message)); return; }
      const r = (data ?? {}) as { inserted?: number; duplicates?: number; skipped?: number };
      // Duplicates are reported rather than hidden: re-pasting a CSV is a
      // normal accident, and "0 added, 200 already there" is the answer that
      // stops someone uploading it a third time.
      toast.success(
        `${r.inserted ?? 0} added`
        + (r.duplicates ? `, ${r.duplicates} already in the pool` : "")
        + (r.skipped ? `, ${r.skipped} blank` : ""),
      );
      setCodesText("");
      await loadStock();
    } finally {
      setUploading(false);
    }
  }

  async function issueVoucher() {
    if (!person) return;
    setBusy(true);
    try {
      const rpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc;
      const { data, error } = await rpc("issue_membership_voucher", { p_user_id: person.id });
      if (error) { toast.error(grantError(error.message)); return; }
      const r = (data ?? {}) as { issued?: boolean; reason?: string };
      if (r.issued) toast.success("Voucher issued.");
      else toast.error(voucherReason(r.reason));
      await Promise.all([loadItems(person.id), loadStock()]);
    } finally {
      setBusy(false);
    }
  }

  function voucherReason(reason?: string): string {
    switch (reason) {
      case "already_issued":            return "They already have this voucher.";
      case "no_codes_available":        return "The pool is empty — upload codes first.";
      case "no_active_membership":      return "They have no active membership.";
      case "url_template_not_configured": return "The partner has no discount link template.";
      case "partner_unavailable":       return "The partner is missing or inactive.";
      default:                          return reason ?? "No voucher issued.";
    }
  }

  const loadMembership = useCallback(async (userId: string) => {
    // Most recent first: a revoked row stays, so there can be several. The
    // active one is what matters, and there is at most one by construction
    // (idx_memberships_one_active).
    const { data } = await supabase
      .from("memberships")
      .select("id,status,tier,source,expires_at,granted_note,revoke_reason")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1);
    const row = ((data ?? [])[0] as Membership) ?? null;
    setMembership(row);
    setIsActiveMember(
      row?.status === "active"
      && (!row.expires_at || new Date(row.expires_at).getTime() > Date.now()),
    );
    // Prefill with the current expiry so "Extend" starts from what is there
    // rather than from blank, which would silently mean "no expiry".
    setMembershipExpiry(row?.expires_at ? String(row.expires_at).slice(0, 10) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function choose(p: Person) {
    setPerson(p);
    setResults([]);
    await Promise.all([loadItems(p.id), loadMembership(p.id)]);
  }

  async function grantMembership() {
    if (!person) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("admin_grant_membership", {
        p_user_id: person.id,
        p_expires_at: membershipExpiry ? new Date(membershipExpiry).toISOString() : undefined,
        p_note: "Comped from admin",
      });
      if (error) { toast.error(grantError(error.message)); return; }
      toast.success("Membership granted.");
      // admin_grant_membership issues the voucher itself, but returns only the
      // membership row, so it cannot say whether that part worked. Calling the
      // idempotent issuance RPC afterwards is how the admin finds out — it
      // reports 'already_issued' on the happy path and names the problem
      // ('no_codes_available') when the pool was dry.
      const rpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc;
      const { data: v } = await rpc("issue_membership_voucher", { p_user_id: person.id });
      const reason = (v as { issued?: boolean; reason?: string } | null)?.reason;
      if (reason && reason !== "already_issued") toast.error(voucherReason(reason));
      await Promise.all([loadMembership(person.id), loadItems(person.id), loadStock()]);
    } finally {
      setBusy(false);
    }
  }

  async function revokeMembership() {
    if (!person) return;
    const reason = window.prompt("Revoke this membership? Give a reason — it is recorded.");
    if (reason === null) return;
    if (!reason.trim()) { toast.error("A reason is required."); return; }
    setBusy(true);
    try {
      const { error } = await supabase.rpc("admin_revoke_membership", {
        p_user_id: person.id,
        p_reason: reason.trim(),
      });
      if (error) { toast.error(grantError(error.message)); return; }
      toast.success("Membership revoked.");
      await loadMembership(person.id);
    } finally {
      setBusy(false);
    }
  }

  function grantError(message: string): string {
    if (message.includes("admin_only")) return "Admins only.";
    if (message.includes("source_id_required")) return "Reference is required.";
    if (message.includes("action_url_must_be_https")) return "The link must start with https://";
    if (message.includes("expires_at_in_past")) return "That expiry is already past.";
    if (message.includes("unsupported_wallet_item_type")) return "That type cannot be granted.";
    if (message.includes("cannot_revoke_coach_voucher")) return "Coach vouchers are refunded, not revoked.";
    if (message.includes("no_active_membership")) return "They have no active membership.";
    return message;
  }

  async function grant() {
    if (!person) return;
    if (!form.title.trim()) { toast.error("Title is required."); return; }
    if (!form.sourceId.trim()) { toast.error("Reference is required — it is what stops a double grant."); return; }

    setBusy(true);
    try {
      const { error } = await supabase.rpc("admin_grant_wallet_item", {
        p_user_id: person.id,
        p_type: form.type,
        p_title: form.title.trim(),
        p_source_id: form.sourceId.trim(),
        // undefined, not null: these arguments carry SQL defaults, so the
        // generated types mark them optional and reject an explicit null.
        p_subtitle: form.subtitle.trim() || undefined,
        p_value_label: form.valueLabel.trim() || undefined,
        p_partner_id: form.partnerId || undefined,
        p_action_type: form.actionType,
        p_action_url: form.actionType === "external_url" ? form.actionUrl.trim() || undefined : undefined,
        p_expires_at: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined,
        p_note: form.note.trim() || undefined,
      });
      if (error) { toast.error(grantError(error.message)); return; }
      toast.success(`Granted to ${person.full_name ?? person.email}.`);
      setForm((f) => ({ ...f, title: "", subtitle: "", valueLabel: "", actionUrl: "", sourceId: "", note: "" }));
      await loadItems(person.id);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(item: Item) {
    if (!person) return;
    const reason = window.prompt(`Revoke "${item.title}"? Give a reason — it is recorded.`);
    if (reason === null) return;
    if (!reason.trim()) { toast.error("A reason is required."); return; }

    setBusy(true);
    try {
      const { error } = await supabase.rpc("admin_revoke_wallet_item", {
        p_item_id: item.id,
        p_reason: reason.trim(),
      });
      if (error) { toast.error(grantError(error.message)); return; }
      toast.success("Revoked.");
      await loadItems(person.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Wallet grants</h1>
        <p className="text-sm text-muted-foreground">
          Issue a promo to one person, or withdraw one. Everything here is recorded against your account.
        </p>
      </div>

      <section className="space-y-3 rounded-md border p-4">
        <h2 className="text-lg font-semibold">Voucher pool</h2>
        <p className="text-xs text-muted-foreground">
          Codes cut in Shopify and pasted here. One is assigned automatically when a membership is
          comped. Codes are never shown again after upload — only counted.
        </p>

        {stock.length === 0 ? (
          <p className="text-sm text-muted-foreground">No codes uploaded yet.</p>
        ) : (
          <ul className="divide-y rounded-md border text-sm">
            {stock.map((row) => (
              <li key={row.partner_id} className="flex items-center justify-between px-3 py-2">
                <span className="font-medium">{row.partner_name}</span>
                <span className="text-muted-foreground">
                  {/* Red at zero: comping a membership with an empty pool
                      succeeds and silently issues nothing, so this number is
                      the only warning there is. */}
                  <span className={row.available === 0 ? "font-semibold text-red-600" : "font-semibold text-foreground"}>
                    {row.available} available
                  </span>
                  {" · "}{row.assigned} issued
                  {row.voided > 0 ? ` · ${row.voided} voided` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            Partner
            <select
              className="mt-1 w-full rounded-md border px-3 py-2"
              value={poolPartnerId}
              onChange={(e) => setPoolPartnerId(e.target.value)}
            >
              <option value="">Choose…</option>
              {partners.filter((x) => x.is_active).map((x) => (
                <option key={x.id} value={x.id}>{x.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Batch label
            <input
              className="mt-1 w-full rounded-md border px-3 py-2"
              placeholder="e.g. 2026-09 launch"
              value={batchLabel}
              onChange={(e) => setBatchLabel(e.target.value)}
            />
          </label>
        </div>

        <label className="block text-sm">
          Codes
          <textarea
            className="mt-1 w-full rounded-md border px-3 py-2 font-mono text-xs"
            rows={5}
            placeholder={"One per line, or comma separated\nPGD-XXXX-1\nPGD-XXXX-2"}
            value={codesText}
            onChange={(e) => setCodesText(e.target.value)}
          />
        </label>

        <div className="flex items-center gap-3">
          <input
            type="file"
            accept=".csv,.txt"
            className="text-xs"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              // Appended, not replaced: uploading two batches in a row should
              // not quietly discard what is already in the box.
              const txt = await file.text();
              setCodesText((prev) => (prev ? `${prev}\n${txt}` : txt));
              e.target.value = "";
            }}
          />
          <button
            className="rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50"
            onClick={uploadCodes}
            disabled={uploading}
          >
            {uploading ? "Uploading…" : "Add to pool"}
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <label className="text-sm font-semibold">Find someone</label>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-md border px-3 py-2 text-sm"
            placeholder="Email or name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") search(); }}
          />
          <button
            className="rounded-md border px-4 py-2 text-sm font-semibold disabled:opacity-50"
            onClick={search}
            disabled={searching}
          >
            {searching ? "Searching…" : "Search"}
          </button>
        </div>

        {results.length > 0 && (
          <ul className="divide-y rounded-md border">
            {results.map((p) => (
              <li key={p.id}>
                <button className="w-full px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => choose(p)}>
                  <span className="font-medium">{p.full_name ?? "(no name)"}</span>
                  <span className="text-muted-foreground"> · {p.email ?? "no email"}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {person && (
        <>
          {/* The email is shown throughout, not just at search time: granting to
              the wrong person is the mistake this screen can actually make. */}
          <section className="rounded-md border p-4">
            <div className="text-sm font-semibold">{person.full_name ?? "(no name)"}</div>
            <div className="text-sm text-muted-foreground">{person.email ?? "no email"}</div>
          </section>

          <section className="space-y-3 rounded-md border p-4">
            <h2 className="text-lg font-semibold">Membership</h2>
            {isActiveMember ? (
              <p className="text-sm">
                <span className="font-medium">Active</span>
                <span className="text-muted-foreground">
                  {" · "}{membership?.tier}{" · "}{membership?.source}
                  {membership?.expires_at
                    ? ` · expires ${new Date(membership.expires_at).toLocaleDateString()}`
                    : " · no expiry"}
                </span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                No active membership.
                {membership?.status === "revoked" && membership.revoke_reason
                  ? ` Last one revoked: ${membership.revoke_reason}`
                  : ""}
              </p>
            )}

            {/* The date and button render in BOTH states. admin_grant_membership
                updates an active membership rather than inserting a second one
                (the partial unique index would reject that anyway), so
                extending is the same call as comping — it just needs to be
                reachable, which it was not when this only appeared while
                inactive. */}
            <div className="flex items-end gap-2">
              <label className="text-sm">
                Expires
                <input
                  type="date"
                  className="mt-1 block rounded-md border px-3 py-2"
                  value={membershipExpiry}
                  onChange={(e) => setMembershipExpiry(e.target.value)}
                />
              </label>
              <button
                className="rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50"
                onClick={grantMembership}
                disabled={busy}
              >
                {isActiveMember ? "Extend" : "Comp membership"}
              </button>
              {isActiveMember && (
                <button
                  className="rounded-md border px-3 py-2 text-sm font-semibold disabled:opacity-50"
                  onClick={revokeMembership}
                  disabled={busy}
                >
                  Revoke
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Leave the date empty for no expiry.
              {isActiveMember ? " Extending replaces the current expiry." : ""}
            </p>

            {/* The voucher's own line. Comping a membership issues it, but that
                can fail quietly (empty pool), and "did they actually get it"
                should be answerable by looking rather than by trusting. */}
            {isActiveMember && (
              <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                {items.some((i) => i.source_type === "membership_benefit") ? (
                  <span className="text-muted-foreground">
                    <span className="font-medium text-foreground">PGD voucher issued.</span>
                    {" It is in their wallet below."}
                  </span>
                ) : (
                  <>
                    <span className="text-red-600">No PGD voucher issued.</span>
                    <button
                      className="rounded-md border px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                      onClick={issueVoucher}
                      disabled={busy}
                    >
                      Issue voucher
                    </button>
                  </>
                )}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Grant a promo</h2>

            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                Type
                <select
                  className="mt-1 w-full rounded-md border px-3 py-2"
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as GrantableType }))}
                >
                  {GRANTABLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>

              <label className="text-sm">
                Partner
                <select
                  className="mt-1 w-full rounded-md border px-3 py-2"
                  value={form.partnerId}
                  onChange={(e) => setForm((f) => ({ ...f, partnerId: e.target.value }))}
                >
                  <option value="">None</option>
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}{p.is_active ? "" : " (inactive)"}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block text-sm">
              Title
              <input
                className="mt-1 w-full rounded-md border px-3 py-2"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="15% off your next paddle"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                Subtitle
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2"
                  value={form.subtitle}
                  onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
                />
              </label>
              <label className="text-sm">
                Value label
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2"
                  value={form.valueLabel}
                  onChange={(e) => setForm((f) => ({ ...f, valueLabel: e.target.value }))}
                  placeholder="15% Off"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                Action
                <select
                  className="mt-1 w-full rounded-md border px-3 py-2"
                  value={form.actionType}
                  onChange={(e) => setForm((f) => ({ ...f, actionType: e.target.value as typeof form.actionType }))}
                >
                  {ACTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label className="text-sm">
                Expires
                <input
                  type="date"
                  className="mt-1 w-full rounded-md border px-3 py-2"
                  value={form.expiresAt}
                  onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
                />
              </label>
            </div>

            {form.actionType === "external_url" && (
              <label className="block text-sm">
                Link (https only)
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2"
                  value={form.actionUrl}
                  onChange={(e) => setForm((f) => ({ ...f, actionUrl: e.target.value }))}
                  placeholder="https://partner.example/discount/CODE"
                />
              </label>
            )}

            <label className="block text-sm">
              Reference
              <input
                className="mt-1 w-full rounded-md border px-3 py-2"
                value={form.sourceId}
                onChange={(e) => setForm((f) => ({ ...f, sourceId: e.target.value }))}
                placeholder="launch-promo-2026-09"
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                Granting the same reference to the same person twice does nothing the second time.
              </span>
            </label>

            <label className="block text-sm">
              Note
              <input
                className="mt-1 w-full rounded-md border px-3 py-2"
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="Why this was issued"
              />
            </label>

            <button
              className="rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50"
              onClick={grant}
              disabled={busy}
            >
              {busy ? "Working…" : "Grant"}
            </button>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Their wallet ({items.length})</h2>
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing in this wallet.</p>
            ) : (
              <ul className="divide-y rounded-md border">
                {items.map((it) => (
                  <li key={it.id} className="flex items-start justify-between gap-4 p-3">
                    <div className="text-sm">
                      <div className="font-medium">
                        {it.title}
                        {it.value_label ? <span className="text-muted-foreground"> · {it.value_label}</span> : null}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {it.type} · {it.status}
                        {it.source_type ? ` · ${it.source_type}` : ""}
                        {it.expires_at ? ` · expires ${new Date(it.expires_at).toLocaleDateString()}` : ""}
                      </div>
                      {it.revoke_reason ? (
                        <div className="text-xs text-muted-foreground">Revoked: {it.revoke_reason}</div>
                      ) : null}
                    </div>
                    {/* Coach vouchers are refunded, not revoked — the RPC refuses
                        them, so the button is not offered in the first place. */}
                    {it.status !== "revoked" && it.type !== "coach_voucher" && (
                      <button
                        className="shrink-0 rounded-md border px-3 py-1 text-xs font-semibold disabled:opacity-50"
                        onClick={() => revoke(it)}
                        disabled={busy}
                      >
                        Revoke
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
