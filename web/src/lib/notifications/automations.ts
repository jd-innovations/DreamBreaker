// Data access for the Automations tab of /admin/notifications.
//
// The catalog (notification_automations, 20260922190000) is one row per
// automatic notification. Admins edit copy, timing, channels and on/off here;
// the sensing half of each automation is code. RLS is admin-only on the table
// and every RPC re-checks is_admin(), so this module is convenience, not the
// security boundary.

import { createClient } from "@/lib/supabase/client";

export type AutomationCategory = "critical" | "social" | "discovery" | "marketing";
export type Channel = "push" | "in_app" | "email";

export interface Automation {
  key: string;
  name: string;
  description: string | null;
  category: AutomationCategory;
  pref_column: string | null;
  channels: Channel[];
  title_template: string;
  body_template: string;
  link_template: string | null;
  /**
   * Shape depends on the automation. Two exist today: `offsets_hours` for
   * "N hours before" rules, and `days_before` + `send_local_hour` for rules
   * that fire at a local time of day (events carry no timezone, so a
   * day-before reminder cannot be an hours offset — see 20260922194000).
   */
  timing: { offsets_hours?: number[]; days_before?: number; send_local_hour?: number } & Record<string, unknown>;
  throttle_hours: number | null;
  enabled: boolean;
  /** False = catalogued but nothing senses the event yet; cannot be enabled. */
  wired: boolean;
  sort_order: number;
  updated_at: string;
  updated_by_name: string | null;
  last_sent_at: string | null;
  sent_7d: number;
  sent_total: number;
}

export type Result<T> = { ok: true; data: T } | { ok: false; message: string };

export const CATEGORY_LABEL: Record<AutomationCategory, string> = {
  critical: "Critical",
  social: "Social",
  discovery: "Discovery",
  marketing: "Marketing",
};

/** What each category means for the limits, in the admin's words. */
export const CATEGORY_NOTE: Record<AutomationCategory, string> = {
  critical: "Money or a deadline. Ignores quiet hours and the frequency caps; a user's own switch still applies.",
  social: "Someone acted toward this player. Obeys quiet hours and the caps.",
  discovery: "Something new near them. Obeys quiet hours and the caps.",
  marketing: "Promotion or win-back. Obeys quiet hours and the caps.",
};

export const CHANNEL_LABEL: Record<Channel, string> = {
  push: "Push",
  in_app: "In-app",
  email: "Email",
};

/** Variables a template may use, per automation, for the editor's hint line. */
export function variablesFor(a: Automation): string[] {
  const found = new Set<string>();
  for (const t of [a.title_template, a.body_template, a.link_template ?? ""]) {
    for (const m of t.matchAll(/\{\{(\w+)\}\}/g)) found.add(m[1]);
  }
  return [...found];
}

export async function listAutomations(): Promise<Result<Automation[]>> {
  const { data, error } = await createClient().rpc("admin_list_automations");
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: (data ?? []) as Automation[] };
}

export type AutomationPatch = Partial<
  Pick<Automation, "title_template" | "body_template" | "link_template" | "channels" | "throttle_hours" | "enabled" | "timing">
>;

export async function updateAutomation(key: string, patch: AutomationPatch): Promise<Result<null>> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  // `timing` is jsonb, typed as Json by the generated types; the narrower
  // shape this module uses for reading is not assignable to it on write.
  const { timing, ...rest } = patch;
  const { error } = await supabase
    .from("notification_automations")
    .update({
      ...rest,
      ...(timing ? { timing: timing as Record<string, never> } : {}),
      updated_by: auth.user?.id ?? null,
    })
    .eq("key", key);
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: null };
}

export async function testAutomation(key: string): Promise<Result<{ sent: boolean; reason?: string }>> {
  const { data, error } = await createClient().rpc("admin_test_automation", { p_key: key });
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: data as { sent: boolean; reason?: string } };
}

/** Human timing for the list row; "" when an automation has no schedule. */
export function describeTiming(a: Automation): string {
  if (typeof a.timing?.send_local_hour === "number") {
    const d = a.timing.days_before ?? 1;
    const day = d === 0 ? "on the day" : d === 1 ? "the day before" : `${d} days before`;
    return `${day}, ${formatHour(a.timing.send_local_hour)} their time`;
  }
  const offsets = a.timing?.offsets_hours;
  if (!Array.isArray(offsets) || offsets.length === 0) return "";
  // Days only from two days out. "1d and 2h before" mixes units for no gain,
  // and 24h is how the offsets are typed in the first place.
  const parts = offsets.map((h) => (h >= 48 && h % 24 === 0 ? `${h / 24}d` : `${h}h`));
  return `${parts.join(" and ")} before`;
}

/** Parses the editor's "24, 2" into [24, 2]; null when it is not usable. */
export function parseOffsets(input: string): number[] | null {
  const parts = input.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return [];
  const nums = parts.map(Number);
  if (nums.some((n) => !Number.isFinite(n) || n <= 0 || n > 8760)) return null;
  // Largest first: the sender walks them that way, and it reads better.
  return [...new Set(nums)].sort((a, b) => b - a);
}

/** Substitutes sample values so the editor can show a phone-style preview. */
const SAMPLE: Record<string, string> = {
  tournament_name: "Fall Doubles Open",
  tournament_id: "abc123",
  hours_left: "2",
  event_date: "Saturday, October 10",
  venue_name: "Suncoast Courts",
  checkin_time: "8:00 AM",
  reason: "The venue could not be confirmed.",
};

export function renderPreview(template: string): string {
  return template.replace(/\{\{(\w+)\}\}/g, (m, k: string) => SAMPLE[k] ?? m);
}

/** 17 -> "5 PM", 0 -> "12 AM". Whole hours only; that is all the rule has. */
export function formatHour(h: number): string {
  const hour = ((h % 24) + 24) % 24;
  const suffix = hour < 12 ? "AM" : "PM";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve} ${suffix}`;
}
