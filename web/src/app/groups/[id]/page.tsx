import type { Metadata } from 'next';
import { MobileLinkFallback } from '@/components/mobile-link-fallback';
import { buildEntityMetadata } from '@/lib/og/metadata';
import { fetchGroupOg } from '@/lib/og/fetchers';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const payload = await fetchGroupOg(id);
  return buildEntityMetadata('group', id, payload);
}

export default async function GroupFallbackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = await fetchGroupOg(id);
  return (
    <MobileLinkFallback
      title={payload?.title ?? 'Open Group'}
      description={payload?.description ?? 'Join or view this group in the Pickleball App mobile app.'}
      path={`/groups/${encodeURIComponent(id)}`}
    />
  );
}
