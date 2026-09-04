import { redirect } from 'next/navigation';

export default async function TournamentCanonicalFallbackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/tournaments/${encodeURIComponent(id)}`);
}
