import type { Metadata } from 'next';
import { MobileLinkFallback } from '@/components/mobile-link-fallback';
import { buildEntityMetadata } from '@/lib/og/metadata';
import { fetchCoachOg } from '@/lib/og/fetchers';

// New route — there was previously no web page for a coach share link at
// all. Mirrors the shape of marketplace/[id] and groups/[id]: a static
// "open in app" fallback whose title/description come from the entity, plus
// server-rendered metadata for crawlers. No dedicated web coach profile UI
// exists yet, so this intentionally does not try to build one.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const payload = await fetchCoachOg(id);
  return buildEntityMetadata('coach', id, payload);
}

export default async function CoachFallbackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = await fetchCoachOg(id);
  return (
    <MobileLinkFallback
      title={payload?.title ?? 'Open Coach Profile'}
      description={payload?.description ?? 'Coach profiles are available in the Pickleball App mobile app.'}
      path={`/coach/${encodeURIComponent(id)}`}
    />
  );
}
