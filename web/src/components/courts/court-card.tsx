import Link from "next/link";
import { MapPin } from "@phosphor-icons/react/dist/ssr";
import { courtSummary, facilityHref } from "@/lib/courts/places";
import type { CourtListing } from "@/lib/courts/directory";

/** One facility in a /courts list. Server component; the photo is lazy-loaded. */
export function CourtCard({ court, distance }: { court: CourtListing; distance?: string | null }) {
  const summary = courtSummary(court);
  return (
    <Link
      href={facilityHref(court)}
      className="group flex gap-3 rounded-2xl border border-border bg-card p-3 transition hover:border-primary/50 hover:bg-secondary/40"
    >
      <div className="relative h-20 w-24 shrink-0 overflow-hidden rounded-xl bg-secondary">
        {court.photo_url ? (
          // Photos come through our facility-photo edge function (no key in the
          // URL), on a host next/image is not configured for; a plain lazy img.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={court.photo_url} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <MapPin size={22} />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-semibold text-foreground group-hover:text-primary">{court.name}</h3>
        <p className="mt-0.5 truncate text-sm text-muted-foreground">
          {[court.address, court.city].filter(Boolean).join(", ")}
        </p>
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {summary && <span>{summary}</span>}
          {court.lighting && <span>Lights</span>}
          {court.public_access === true && <span>Public</span>}
          {distance && <span>{distance}</span>}
        </p>
      </div>
    </Link>
  );
}
