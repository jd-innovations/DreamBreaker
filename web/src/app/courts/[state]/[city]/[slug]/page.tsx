// /courts/<state>/<city>/<slug> — one facility. Public and server-rendered.
//
// The state and city segments are for people and search engines; the slug alone
// identifies the row. A URL whose state/city do not match the row (a city was
// corrected, an old link) permanently redirects to the canonical one.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { ArrowLeft, Clock, Globe, MapPin, NavigationArrow, Phone } from "@phosphor-icons/react/dist/ssr";
import { APP_ORIGIN } from "@/lib/og/types";
import { DEFAULT_OG_IMAGE, SITE_NAME, jsonLdHtml } from "@/lib/seo/site";
import {
  STATE_NAMES, cityHref, courtSummary, facilityHref, getCourtBySlug, isIndexable, type CourtDetail,
} from "@/lib/courts/directory";

export const revalidate = 3600;
export async function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ state: string; city: string; slug: string }> };

/** Only http(s) links from imported data are rendered; anything else (javascript:, data:) is dropped. */
function safeUrl(u: string | null): string | null {
  if (!u) return null;
  try {
    const url = new URL(u.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function telHref(phone: string | null): string | null {
  const digits = phone?.replace(/[^\d+]/g, "") ?? "";
  return digits.length >= 7 ? `tel:${digits}` : null;
}

function fullAddress(c: CourtDetail): string {
  return [c.address, c.address_line_2, c.city, [c.state, c.postal_code].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
}

function describe(c: CourtDetail): string {
  const summary = courtSummary(c);
  const bits = [summary ? `${summary}.` : null, c.lighting ? "Lit for night play." : null];
  return `Pickleball at ${c.name} in ${c.city}, ${c.state}. ${bits.filter(Boolean).join(" ")} Address, directions and details.`
    .replace(/\s+/g, " ")
    .trim();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = await getCourtBySlug((await params).slug);
  if (!c) return {};
  const url = `${APP_ORIGIN}${facilityHref(c)}`;
  const title = `${c.name} — Pickleball in ${c.city}, ${c.state}`;
  const description = describe(c);
  const image = c.photos[0] ? { url: c.photos[0], alt: c.name } : DEFAULT_OG_IMAGE;
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: isIndexable(c) ? undefined : { index: false, follow: true },
    openGraph: { title, description, url, siteName: SITE_NAME, type: "website", images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

const AMENITIES: Array<[keyof CourtDetail, string]> = [
  ["lighting", "Lights"],
  ["restrooms", "Restrooms"],
  ["water", "Water"],
  ["parking", "Parking"],
  ["open_play_available", "Open play"],
  ["lessons_available", "Lessons"],
  ["pro_shop", "Pro shop"],
  ["wheelchair_accessible", "Wheelchair accessible"],
  ["reservation_required", "Reservation required"],
  ["membership_required", "Membership required"],
];

export default async function CourtPage({ params }: Props) {
  const p = await params;
  const c = await getCourtBySlug(p.slug);
  if (!c) notFound();
  const canonical = facilityHref(c);
  if (canonical !== `/courts/${p.state}/${p.city}/${p.slug}`) permanentRedirect(canonical);

  const summary = courtSummary(c);
  const address = fullAddress(c);
  const website = safeUrl(c.website);
  const booking = safeUrl(c.booking_url);
  const tel = telHref(c.phone);
  const hasPoint = c.latitude != null && c.longitude != null;
  const directions = hasPoint
    ? `https://www.google.com/maps/dir/?api=1&destination=${c.latitude},${c.longitude}`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
  const amenities = AMENITIES.filter(([k]) => c[k] === true).map(([, label]) => label);
  const access = c.public_access === true ? "Public" : c.public_access === false ? "Private / members" : null;
  const fromOsm = (c.data_source ?? "").includes("osm");
  const closed = c.business_status === "CLOSED_PERMANENTLY";

  const structured = {
    "@context": "https://schema.org",
    "@type": "SportsActivityLocation",
    "@id": `${APP_ORIGIN}${canonical}#place`,
    name: c.name,
    url: `${APP_ORIGIN}${canonical}`,
    ...(c.photos[0] ? { image: c.photos[0] } : {}),
    ...(c.phone ? { telephone: c.phone } : {}),
    ...(website ? { sameAs: [website] } : {}),
    address: {
      "@type": "PostalAddress",
      ...(c.address ? { streetAddress: c.address } : {}),
      addressLocality: c.city,
      addressRegion: c.state,
      ...(c.postal_code ? { postalCode: c.postal_code } : {}),
      addressCountry: "US",
    },
    ...(hasPoint ? { geo: { "@type": "GeoCoordinates", latitude: c.latitude, longitude: c.longitude } } : {}),
    ...(c.public_access === true ? { publicAccess: true } : {}),
    ...(amenities.length
      ? { amenityFeature: amenities.map((name) => ({ "@type": "LocationFeatureSpecification", name, value: true })) }
      : {}),
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdHtml(structured)} />

      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        <Link href={cityHref(c.state, c.city)} className="inline-flex items-center gap-1.5 hover:text-foreground">
          <ArrowLeft size={14} /> Courts in {c.city}, {STATE_NAMES[c.state] ?? c.state}
        </Link>
      </nav>

      {c.photos[0] && (
        <div className="mt-4 overflow-hidden rounded-2xl bg-secondary">
          {/* Served by our facility-photo edge function; plain img (see court-card). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.photos[0]} alt={c.name} className="aspect-[16/9] w-full object-cover" />
        </div>
      )}

      <header className="mt-5 space-y-2">
        <h1 className="font-display text-3xl tracking-wide sm:text-4xl">{c.name}</h1>
        <p className="flex items-start gap-1.5 text-muted-foreground">
          <MapPin size={18} className="mt-0.5 shrink-0" /> {address}
        </p>
        {closed && <p className="font-semibold text-destructive">Reported permanently closed.</p>}
      </header>

      <div className="mt-5 flex flex-wrap gap-2">
        <a href={directions} target="_blank" rel="noopener noreferrer"
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
          <NavigationArrow size={16} /> Directions
        </a>
        {tel && (
          <a href={tel} className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold hover:bg-secondary">
            <Phone size={16} /> Call
          </a>
        )}
        {website && (
          <a href={website} target="_blank" rel="noopener noreferrer nofollow"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold hover:bg-secondary">
            <Globe size={16} /> Website
          </a>
        )}
        {booking && booking !== website && (
          <a href={booking} target="_blank" rel="noopener noreferrer nofollow"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold hover:bg-secondary">
            Book a court
          </a>
        )}
      </div>

      <dl className="mt-8 grid gap-4 sm:grid-cols-2">
        <Fact label="Courts" value={summary ?? "Not listed yet"} />
        <Fact label="Access" value={access ?? "Not listed yet"} />
        {c.surface_type && <Fact label="Surface" value={c.surface_type} />}
        {c.hours_summary && (
          <Fact label="Hours" value={<span className="inline-flex items-start gap-1.5"><Clock size={16} className="mt-0.5 shrink-0" />{c.hours_summary}</span>} />
        )}
      </dl>

      {amenities.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Amenities</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {amenities.map((a) => (
              <li key={a} className="rounded-full border border-border px-3 py-1 text-sm">{a}</li>
            ))}
          </ul>
        </section>
      )}

      {c.description && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">About</h2>
          <p className="mt-2 whitespace-pre-line text-muted-foreground">{c.description}</p>
        </section>
      )}

      <footer className="mt-10 space-y-1 border-t border-border pt-4 text-xs text-muted-foreground">
        <p>Details can change. Check with the venue before you go.</p>
        {fromOsm && (
          <p>
            Court location from{" "}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline">
              © OpenStreetMap contributors
            </a>
            , available under the Open Database License.
          </p>
        )}
      </footer>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border p-4">
      <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}
