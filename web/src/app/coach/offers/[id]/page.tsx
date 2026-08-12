import { MobileLinkFallback } from '@/components/mobile-link-fallback';

export default async function CoachOfferFallbackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <MobileLinkFallback
      title="Open Coach Offer"
      description="Coach offer details are available in the DreamBreaker mobile app."
      path={`/coach/offers/${encodeURIComponent(id)}`}
    />
  );
}
