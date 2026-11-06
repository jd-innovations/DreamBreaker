import { MobileLinkFallback } from '@/components/mobile-link-fallback';

// A one-person invite: never a search result.
export const metadata = { robots: { index: false, follow: false } };

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
