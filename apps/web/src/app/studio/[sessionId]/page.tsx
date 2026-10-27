import { StudioShell } from '@/components/studio/studio-shell';
import { loadSession } from '@/lib/load-session';

export default async function StudioPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const snapshot = await loadSession(sessionId, 'studio');
  return <StudioShell sessionId={sessionId} snapshot={snapshot} />;
}
