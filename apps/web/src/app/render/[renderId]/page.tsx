import { notFound, redirect } from 'next/navigation';
import { KimoApiError, KimoClient } from '@kimo/client';
import { Spinner } from '@/components/ui/spinner';

export default async function RenderHandoff({
  params,
}: {
  params: Promise<{ renderId: string }>;
}) {
  const { renderId } = await params;
  let render;
  try {
    render = await new KimoClient().render(renderId);
  } catch (error) {
    if (error instanceof KimoApiError && error.status === 404) notFound();
    throw error;
  }
  if (render.videoId) redirect(`/v/${encodeURIComponent(render.videoId)}`);
  return (
    <main id="main" className="upload-handoff" data-ready="true">
      <Spinner size={20} label="rendering your video" />
      <h1>rendering your video</h1>
    </main>
  );
}
