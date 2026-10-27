import { notFound } from 'next/navigation';
import { KimoClient } from '@kimo/client';
import { StudioShell } from '@/components/studio/studio-shell';

/** Development-only harness for inspecting the shell before warm-up finishes. */
export default async function StudioPreview({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const { sessionId } = await params;
  const snapshot = await new KimoClient().session(sessionId);
  return <StudioShell sessionId={sessionId} snapshot={snapshot} />;
}
