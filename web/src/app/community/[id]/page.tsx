import { redirect } from 'next/navigation';

export default async function CommunityCanonicalFallbackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/play/${encodeURIComponent(id)}`);
}
