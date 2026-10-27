import { SessionHandoff } from '@/components/uploads/session-handoff';
import { loadSession } from '@/lib/load-session';
import { StudioTransitionTarget } from '@/components/warmup/studio-transition-target';

export default async function StudioPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const snapshot = await loadSession(sessionId, 'studio');
  return (
    <>
      <StudioTransitionTarget sessionId={sessionId} snapshot={snapshot} />
      <SessionHandoff sessionId={sessionId} snapshot={snapshot} mode="studio" />
    </>
  );
}
