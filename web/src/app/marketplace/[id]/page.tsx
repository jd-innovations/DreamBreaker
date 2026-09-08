import type { Metadata } from 'next';
import { MobileLinkFallback } from '@/components/mobile-link-fallback';
import { buildEntityMetadata } from '@/lib/og/metadata';
import { fetchMarketplaceListingOg } from '@/lib/og/fetchers';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const payload = await fetchMarketplaceListingOg(id);
  return buildEntityMetadata('marketplace', id, payload);
}

export default async function MarketplaceFallbackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = await fetchMarketplaceListingOg(id);
  return (
    <MobileLinkFallback
      title={payload?.title ?? 'Open Listing'}
      description={payload?.description ?? 'Marketplace listings are best viewed in the Pickleball App mobile app.'}
      path={`/marketplace/${encodeURIComponent(id)}`}
    />
  );
}
