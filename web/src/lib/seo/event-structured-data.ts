import { ogClient } from "@/lib/og/client";
import { APP_ORIGIN, WEB_PAGE_PATH } from "@/lib/og/types";
import { SITE_NAME } from "./site";

// schema.org SportsEvent data for tournament and game pages, which is what
// makes them eligible for Google's event listings. Read with the anon client,
// like the share metadata, so a row RLS hides produces nothing at all.
//
// Dates carry no UTC offset: event_date/start_time are the venue's wall-clock
// time and the venue's zone is not stored. Google accepts that and assumes
// local time, which is what it is.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ORGANIZER = { "@type": "Organization", name: SITE_NAME, url: APP_ORIGIN };

function startDate(date: string, time: string | null): string {
  const hhmm = time?.match(/^(\d{2}):(\d{2})/);
  return hhmm ? `${date}T${hhmm[1]}:${hhmm[2]}` : date;
}

function endDate(start: string, durationMinutes: number | null): string | undefined {
  if (!durationMinutes || durationMinutes <= 0 || !start.includes("T")) return undefined;
  const [d, t] = start.split("T");
  const [y, mo, day] = d.split("-").map(Number);
  const [h, mi] = t.split(":").map(Number);
  // Wall-clock arithmetic in UTC so the server's own zone cannot shift it.
  const end = new Date(Date.UTC(y, mo - 1, day, h, mi + durationMinutes));
  return end.toISOString().slice(0, 16);
}

function place(name: string | null, street: string | null, city: string | null, state: string | null, zip: string | null) {
  return {
    "@type": "Place",
    name: name || [city, state].filter(Boolean).join(", ") || "Pickleball courts",
    address: {
      "@type": "PostalAddress",
      ...(street ? { streetAddress: street } : {}),
      ...(city ? { addressLocality: city } : {}),
      ...(state ? { addressRegion: state } : {}),
      ...(zip ? { postalCode: zip } : {}),
      addressCountry: "US",
    },
  };
}

function clean(text: string | null | undefined, max = 500): string | undefined {
  const t = text?.trim();
  if (!t) return undefined;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export async function tournamentStructuredData(id: string): Promise<object | null> {
  if (!UUID_RE.test(id)) return null;
  const { data: t } = await ogClient()
    .from("tournaments")
    .select("id, name, description, event_date, start_time, venue_name, venue_address, city, state, zip_code, entry_fee_cents, cover_img_url, status, draw_size, spots_filled")
    .eq("id", id)
    .maybeSingle();
  if (!t || !t.event_date || t.status === "cancelled") return null;

  const pageUrl = `${APP_ORIGIN}${WEB_PAGE_PATH.tournament(id)}`;
  const full = t.draw_size > 0 && t.spots_filled >= t.draw_size;
  const registrationOpen = ["published", "open", "filling_fast"].includes(t.status);
  return {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: t.name,
    description: clean(t.description) ?? `Pickleball tournament in ${[t.city, t.state].filter(Boolean).join(", ")}.`,
    sport: "Pickleball",
    url: pageUrl,
    startDate: startDate(t.event_date, t.start_time),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: place(t.venue_name, t.venue_address, t.city, t.state, t.zip_code),
    ...(t.cover_img_url ? { image: [t.cover_img_url] } : {}),
    organizer: ORGANIZER,
    offers: {
      "@type": "Offer",
      url: pageUrl,
      price: (t.entry_fee_cents / 100).toFixed(2),
      priceCurrency: "USD",
      availability: full || !registrationOpen ? "https://schema.org/SoldOut" : "https://schema.org/InStock",
    },
  };
}

export async function gameStructuredData(id: string): Promise<object | null> {
  if (!UUID_RE.test(id)) return null;
  const { data: g } = await ogClient()
    .from("play_events")
    .select("id, name, notes, event_date, start_time, duration_minutes, venue_name, location, city, state, cover_url, status")
    .eq("id", id)
    .maybeSingle();
  if (!g || !g.event_date || g.status === "cancelled") return null;

  const start = startDate(g.event_date, g.start_time);
  const end = endDate(start, g.duration_minutes);
  return {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: g.name || "Pickleball game",
    description: clean(g.notes) ?? `Pickleball game at ${g.venue_name || g.location}.`,
    sport: "Pickleball",
    url: `${APP_ORIGIN}${WEB_PAGE_PATH.community(id)}`,
    startDate: start,
    ...(end ? { endDate: end } : {}),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    // `location` holds "City, ST", not a street — there is no street column.
    location: place(g.venue_name || g.location, null, g.city, g.state, null),
    ...(g.cover_url ? { image: [g.cover_url] } : {}),
    organizer: ORGANIZER,
  };
}
