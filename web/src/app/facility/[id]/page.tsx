import type { Metadata } from 'next';
import { MobileLinkFallback } from '@/components/mobile-link-fallback';
import { buildEntityMetadata } from '@/lib/og/metadata';
import { fetchFacilityOg } from '@/lib/og/fetchers';

// New route — there was previously no web page for a facility share link at
// all (mobile builds and shares https://pickleballapp.app/facility/{id};
// it 404'd for every recipient, app-installed or not). Mirrors the shape of
// marketplace/[id] and groups/[id].
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const payload = await fetchFacilityOg(id);
  return buildEntityMetadata('facility', id, payload);
}

export default async function FacilityFallbackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = await fetchFacilityOg(id);
  return (
    <MobileLinkFallback
      title={payload?.title ?? 'Open Facility'}
      description={payload?.description ?? 'Facility details are available in the Pickleball App mobile app.'}
      path={`/facility/${encodeURIComponent(id)}`}
    />
  );
}
