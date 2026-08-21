import { MobileLinkFallback } from '@/components/mobile-link-fallback';

export default async function ClaimFallbackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <MobileLinkFallback
      title="Open Invite"
      description="Continue in Pickleball App to claim this invitation."
      path={`/claim/${encodeURIComponent(token)}`}
    />
  );
}
