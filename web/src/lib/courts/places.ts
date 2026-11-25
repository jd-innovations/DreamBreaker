// Pure court-directory helpers: state names, slugs, URLs, search-word
// sanitising, summaries. No server imports, so client components (the
// near-me list, the suggest form) can use them. directory.ts re-exports them.

export const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", DC: "Washington, DC", FL: "Florida", GA: "Georgia", HI: "Hawaii",
  ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", PR: "Puerto Rico", VI: "U.S. Virgin Islands",
  GU: "Guam",
};

/** "fl" -> "FL", or null for anything that is not a known state code. */
export function stateFromParam(param: string): string | null {
  const code = param.toUpperCase();
  return /^[A-Z]{2}$/.test(code) && STATE_NAMES[code] ? code : null;
}

/** Same normalisation as the database slug function: unaccent, lowercase, then strip. */
export function citySlug(city: string): string {
  return city
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function stateHref(state: string): string {
  return `/courts/${state.toLowerCase()}`;
}

export function cityHref(state: string, city: string): string {
  return `${stateHref(state)}/${citySlug(city)}`;
}

export function facilityHref(f: { state: string; city: string; slug: string }): string {
  return `${cityHref(f.state, f.city)}/${f.slug}`;
}

/**
 * Words from a visitor's search box, safe to place inside a PostgREST `or()`
 * filter. That filter is a comma/parenthesis-delimited string, so anything but
 * letters, digits, apostrophes, hyphens and dots is turned into a space — a
 * comma or ")" in a search must not be able to add a filter of its own. At most
 * four words of up to 40 characters each.
 */
export function searchWords(q: string | undefined | null): string[] {
  if (!q) return [];
  return q
    .slice(0, 120)
    .replace(/[^\p{L}\p{N}'.\- ]+/gu, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^[.'-]+|[.'-]+$/g, "").slice(0, 40))
    .filter((w) => w.length > 0)
    .slice(0, 4);
}

/** "6 courts (4 outdoor, 2 indoor)", "Outdoor courts", or null when nothing is known. */
export function courtSummary(f: { court_count: number | null; indoor_courts: number | null; outdoor_courts: number | null }): string | null {
  const total = f.court_count ?? 0;
  const indoor = f.indoor_courts ?? 0;
  const outdoor = f.outdoor_courts ?? 0;
  const parts = [outdoor > 0 && `${outdoor} outdoor`, indoor > 0 && `${indoor} indoor`].filter(Boolean);
  if (total > 0) return `${total} court${total === 1 ? "" : "s"}${parts.length ? ` (${parts.join(", ")})` : ""}`;
  if (indoor > 0 || outdoor > 0) return parts.join(", ") + " courts";
  return null;
}
