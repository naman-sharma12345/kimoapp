import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { KimoApiError, KimoClient } from '@kimo/client';
import { RenderScreen } from '@/components/render/render-screen';
export const metadata: Metadata = {
  title: 'rendering your video · kimo',
  robots: { index: false, follow: false },
};
export default async function RenderPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  let { sessionId } = await params;
  const client = new KimoClient();
  let renderId: string | undefined;
  try {
    const session = await client.session(sessionId);
    renderId = session.renderId;
    if (!renderId) redirect(`/studio/${encodeURIComponent(sessionId)}`);
  } catch (error) {
    if (!(error instanceof KimoApiError)) throw error;
    if (error.status !== 404) throw error;
    try {
      const legacy = await client.render(sessionId);
      if (!legacy.sessionId) notFound();
      renderId = sessionId;
      sessionId = legacy.sessionId;
    } catch {
      notFound();
    }
  }
  const initial = await client.render(renderId);
  if (initial.status === 'done' && initial.videoId)
    redirect(`/v/${encodeURIComponent(initial.videoId)}`);
  if (initial.status === 'cancelled')
    redirect(`/studio/${encodeURIComponent(sessionId)}`);
  return (
    <RenderScreen
      sessionId={sessionId}
      initialRenderId={renderId}
      initial={initial}
    />
  );
}
