import { MobileLinkFallback } from '@/components/mobile-link-fallback';

export default async function MarketplaceFallbackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <MobileLinkFallback
      title="Open Listing"
      description="Marketplace listings are best viewed in the Pickleball App mobile app."
      path={`/marketplace/${encodeURIComponent(id)}`}
    />
  );
}
