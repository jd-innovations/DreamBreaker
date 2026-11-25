import Link from "next/link";
import { CourtPhoto } from "@/components/courts/court-photo";
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
        <CourtPhoto src={court.photo_url} alt="" className="h-full w-full object-cover" />
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
