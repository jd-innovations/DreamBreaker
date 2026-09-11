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
  is_active: boolean;
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

  useEffect(() => {
    (async () => {
      const userId = await getUserId();
      if (!userId) { router.push("/login"); return; }
      const { data: profile } = await supabase
        .from("profiles").select("role").eq("id", userId).maybeSingle();
      if (!profile || profile.role !== "admin") { router.push("/dashboard"); return; }
      const { data } = await supabase
        .from("wallet_partners").select("id,name,is_active").order("name");
      setPartners((data ?? []) as Partner[]);
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

  async function choose(p: Person) {
    setPerson(p);
    setResults([]);
    await loadItems(p.id);
  }

  function grantError(message: string): string {
    if (message.includes("admin_only")) return "Admins only.";
    if (message.includes("source_id_required")) return "Reference is required.";
    if (message.includes("action_url_must_be_https")) return "The link must start with https://";
    if (message.includes("expires_at_in_past")) return "That expiry is already past.";
    if (message.includes("unsupported_wallet_item_type")) return "That type cannot be granted.";
    if (message.includes("cannot_revoke_coach_voucher")) return "Coach vouchers are refunded, not revoked.";
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
