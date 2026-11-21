import { redirect } from 'next/navigation';

export default async function DedicatedGameRoute({ params }) {
  const { gameId } = await params;
  const target = (gameId || '').toLowerCase();

  if (target === 'lobby' || target === 'all') {
    redirect('/games');
  }

  // Redirect to dashboard with active game selected
  redirect(`/dashboard?game=${encodeURIComponent(target)}`);
}
