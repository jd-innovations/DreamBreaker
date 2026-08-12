import { MobileLinkFallback } from '@/components/mobile-link-fallback';

export default async function GroupFallbackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <MobileLinkFallback
      title="Open Group"
      description="Join or view this group in the DreamBreaker mobile app."
      path={`/groups/${encodeURIComponent(id)}`}
    />
  );
}
