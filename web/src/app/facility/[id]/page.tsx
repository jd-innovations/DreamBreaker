import { notFound, permanentRedirect } from "next/navigation";
import { facilityHref, getCourtById } from "@/lib/courts/directory";

// The app shares https://pickleballapp.app/facility/{id}. On a phone with the
// app installed the universal link opens the app before this runs; everyone
// else used to get an "open in the app" stub. Since the public court directory
// (2026-11-25) there is a real page, so send them to it: /courts/<state>/<city>/<slug>.
export default async function FacilityRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const court = await getCourtById(id);
  if (!court) notFound();
  permanentRedirect(facilityHref(court));
}
