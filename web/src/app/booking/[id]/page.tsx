import { MobileLinkFallback } from '@/components/mobile-link-fallback';

export default async function BookingFallbackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <MobileLinkFallback
      title="Open Booking"
      description="This booking is available in the Pickleball App mobile app."
      path={`/booking/${encodeURIComponent(id)}`}
    />
  );
}
