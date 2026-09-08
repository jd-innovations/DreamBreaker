import { MobileLinkFallback } from '@/components/mobile-link-fallback';

export default async function ConversationFallbackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <MobileLinkFallback
      title="Open Conversation"
      description="This chat is available in the Pickleball App mobile app."
      path={`/conversation/${encodeURIComponent(id)}`}
    />
  );
}
