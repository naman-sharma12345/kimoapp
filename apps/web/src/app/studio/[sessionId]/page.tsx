import { SessionHandoff } from '@/components/uploads/session-handoff';
import { loadSession } from '@/lib/load-session';

export default async function StudioPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const snapshot = await loadSession(sessionId, 'studio');
  return (
    <SessionHandoff sessionId={sessionId} snapshot={snapshot} mode="studio" />
  );
}
