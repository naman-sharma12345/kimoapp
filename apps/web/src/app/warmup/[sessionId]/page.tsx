import { WarmupScreen } from '@/components/warmup/warmup-screen';
import { loadSession } from '@/lib/load-session';

export default async function WarmupPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const snapshot = await loadSession(sessionId, 'warmup');
  return <WarmupScreen sessionId={sessionId} snapshot={snapshot} />;
}
